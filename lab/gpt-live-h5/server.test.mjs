import assert from "node:assert/strict";
import test from "node:test";
import { createLiveH5Server } from "./server.mjs";
import { transcriptEvent } from "./events.mjs";
import { GPT_LIVE_PERSONAL_SESSION_KEY } from "./personal-session.mjs";

async function fixture(t, overrides = {}) {
  const calls = [];
  const reservation = { voiceSessionId: "voice-private", model: "gpt-live-1-codex", transport: "webrtc", offerUrl: "/plugins/openai/realtime/calls", clientSecret: "never-expose-test-secret" };
  const gateway = { request: async (method, params) => {
    calls.push({ method, params });
    if (overrides.request) return overrides.request(method, params, reservation);
    return method === "talk.client.create" ? reservation : { ok: true };
  } };
  const offers = [];
  const bridge = createLiveH5Server({ gateway, offer: async (session, sdp) => { offers.push({ session, sdp }); return "v=0\r\nanswer"; }, preview: overrides.preview });
  await new Promise((resolve) => bridge.server.listen(0, "127.0.0.1", resolve));
  t.after(() => bridge.dispose());
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  const page = await fetch(url); const cookie = page.headers.get("set-cookie").split(";", 1)[0]; await page.text();
  const request = (route, payload = {}, headers = {}) => fetch(`${url}/api/${route}`, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });
  return { bridge, calls, offers, url, cookie, request, reservation };
}

test("exact native model reservation and SDP proxy keep credentials off the browser", async (t) => {
  const f = await fixture(t);
  const created = await f.request("session"); assert.equal(created.status, 200);
  const result = await created.json(); assert.deepEqual(result, { voiceSessionId: "voice-private", model: "gpt-live-1-codex" });
  assert.equal(f.calls[0].params.model, "gpt-live-1-codex"); assert.equal(f.calls[0].params.transport, "webrtc");
  assert.equal(f.calls[0].params.sessionKey, GPT_LIVE_PERSONAL_SESSION_KEY);
  const answer = await f.request("offer", { voiceSessionId: result.voiceSessionId, sdp: "v=0\r\noffer" });
  assert.deepEqual(await answer.json(), { sdp: "v=0\r\nanswer" });
  assert.equal(f.offers[0].session.clientSecret, "never-expose-test-secret");
  const closed = await f.request("close", { voiceSessionId: result.voiceSessionId }); assert.equal(closed.status, 200);
  assert.equal((await f.request("offer", { voiceSessionId: result.voiceSessionId, sdp: "v=0" })).status, 409);
});

test("preview never creates a paid session and returns an explicit preview error", async (t) => {
  const f = await fixture(t, { preview: true });
  assert.equal((await f.request("session")).status, 503); assert.equal(f.calls.length, 0);
});

test("page cookie, origin and voice ownership guard experiment requests", async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.url}/api/session`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await f.request("session", {}, { origin: "http://example.com" })).status, 403);
  await f.request("session");
  assert.equal((await f.request("offer", { voiceSessionId: "other", sdp: "v=0" })).status, 409);
  assert.equal((await f.request("offer", { voiceSessionId: "voice-private", sdp: "bad" })).status, 400);
  assert.equal(f.offers.length, 0);
});

test("a mismatched inherited provider model is closed and rejected", async (t) => {
  const f = await fixture(t, { request: (method, params, reservation) => method === "talk.client.create" ? { ...reservation, model: "xiaohe-agent" } : { ok: true } });
  assert.equal((await f.request("session")).status, 409);
  assert.equal(f.calls.filter((item) => item.method === "talk.client.close").length, 1);
});

test("concurrent starts cannot leak a second provider reservation", async (t) => {
  let releaseCreate;
  const creating = new Promise((resolve) => { releaseCreate = resolve; });
  let began;
  const started = new Promise((resolve) => { began = resolve; });
  const f = await fixture(t, { request: async (method, params, reservation) => {
    if (method === "talk.client.create") { began(); await creating; return reservation; } return { ok: true };
  } });
  const first = f.request("session"); await started;
  assert.equal((await f.request("session")).status, 409);
  releaseCreate(); assert.equal((await first).status, 200);
  assert.equal(f.calls.filter((item) => item.method === "talk.client.create").length, 1);
});

test("failed cancellation or steering is never presented as successful delivery", async (t) => {
  const f = await fixture(t, { request: (method, params, reservation) => method === "talk.client.create" ? reservation : method === "talk.client.steer" ? { ok: false, reason: "abort_rejected", aborted: false } : { ok: true } });
  await f.request("session");
  for (const mode of ["cancel", "steer"]) {
    const response = await f.request("steer", { voiceSessionId: "voice-private", mode, text: "停止" });
    assert.equal(response.status, 409); assert.match((await response.json()).error, /没有|暂时/u);
  }
});

test("failed close retains ownership so cleanup can retry", async (t) => {
  let failures = 1;
  const f = await fixture(t, { request: (method, params, reservation) => {
    if (method === "talk.client.create") return reservation;
    if (method === "talk.client.close" && failures-- > 0) throw new Error("temporary failure");
    return { ok: true };
  } });
  await f.request("session");
  assert.equal((await f.request("close", { voiceSessionId: "voice-private" })).status, 500);
  assert.equal((await f.request("close", { voiceSessionId: "voice-private" })).status, 200);
});

test("a rejected model keeps failed cleanup owned until the next start retries", async (t) => {
  let creates = 0;
  let closes = 0;
  const f = await fixture(t, { request: (method, params, reservation) => {
    if (method === "talk.client.create") return ++creates === 1 ? { ...reservation, model: "xiaohe-agent" } : reservation;
    if (method === "talk.client.close" && ++closes === 1) throw new Error("temporary failure");
    return { ok: true };
  } });
  assert.equal((await f.request("session")).status, 500);
  assert.equal((await f.request("session")).status, 200);
  assert.equal(closes, 2);
  assert.equal(creates, 2);
});

test("native transcript projection excludes reasoning and preserves final text", () => {
  assert.equal(transcriptEvent({ type: "session.thinking.append", content: "hidden" }), null);
  assert.deepEqual(transcriptEvent({ type: "input_transcript.added", item: { id: "fragment", text: "请查周四" } }), { role: "user", id: "fragment", text: "请查周四", final: false });
  assert.deepEqual(transcriptEvent({ type: "turn.done", turn: { role: "user", transcript: "请查周四" } }), { role: "user", id: undefined, text: "请查周四", final: true });
});


test("the frozen H5 serves its own stylesheet and every browser module", async t => {
  const f = await fixture(t, {preview:true});
  for (const name of ["app.js", "events.mjs", "duplex-playback.mjs", "microphone-capture.mjs", "transcript-presentation.mjs", "call-sounds.mjs", "styles.css"]) {
    const response = await fetch(`${f.url}/${name}`);
    assert.equal(response.status, 200, name); assert.match(response.headers.get("content-type"), name.endsWith("css") ? /text\/css/u : /javascript/u);
    assert((await response.text()).length > 0);
  }
  const css = await (await fetch(`${f.url}/styles.css`)).text(); assert.match(css, /\.transcript-turn/u);
  assert.equal(f.calls.length, 0, "Static preview does not create a model session");
});

test('pickup readiness uses an exact owned host operation without exposing broker fields', async t => {
  const f=await fixture(t); await f.request('session');
  const r=await f.request('ready',{voiceSessionId:'voice-private'});
  assert.equal(r.status,200); assert.deepEqual(await r.json(),{ok:true});
  const invocation=f.calls.find(row=>row.method==='talk.client.toolCall');
  assert.equal(invocation.params.name,'openclaw_live_call_control');
  assert.equal(invocation.params.voiceSessionId,'voice-private');
  assert.deepEqual(invocation.params.args,{action:'ready'});
  assert.match(invocation.params.callId,/^host-ready-/u);
  assert.equal(invocation.params.sessionKey, GPT_LIVE_PERSONAL_SESSION_KEY);
  assert.equal((await f.request('ready',{voiceSessionId:'old'})).status,409);
  assert.equal(f.calls.filter(row=>row.method==='talk.client.toolCall').length,1);
});

test('a rejected native readiness does not claim a greeting was sent or close the session',async t=>{
  const f=await fixture(t,{request:(method,params,reservation)=>method==='talk.client.create'?reservation:method==='talk.client.toolCall'?{ok:false}:{ok:true}});
  await f.request('session');
  const r=await f.request('ready',{voiceSessionId:'voice-private'});
  assert.equal(r.status,409); assert.match((await r.json()).error,/未就绪/u);
  assert.equal(f.calls.filter(row=>row.method==='talk.client.close').length,0);
});

test('only the owned end-call tool can carry closing metadata over SSE',async t=>{
  const f=await fixture(t); await f.request('session');
  const stop=new AbortController();
  const response=await fetch(f.url+'/api/events',{headers:{cookie:f.cookie},signal:stop.signal});
  const reader=response.body.getReader(); await reader.read();
  const emit=(voice,type,payload)=>f.bridge.emit({event:'talk.event',payload:{voiceSessionId:voice,talkEvent:{type,callId:'tool-id',payload}}});
  emit('other','tool.result',{name:'openclaw_end_call',requestId:'wrong',closeAfterPlayback:true});
  emit('voice-private','tool.result',{name:'openclaw_agent_consult',requestId:'fake',closeAfterPlayback:true,hidden:'not-for-browser'});
  const ordinary=new TextDecoder().decode((await reader.read()).value);
  assert.doesNotMatch(ordinary,/requestId|closeAfterPlayback|hidden|wrong/u);
  emit('voice-private','tool.result',{name:'openclaw_end_call',requestId:'end-id',originUserTurnId:'native-user-id',closeAfterPlayback:true,hidden:'not-for-browser'});
  const ended=new TextDecoder().decode((await reader.read()).value);
  assert.match(ended,/openclaw_end_call/u); assert.match(ended,/end-id/u); assert.match(ended,/closeAfterPlayback/u); assert.match(ended,/native-user-id/u); assert.doesNotMatch(ended,/hidden/u);
  stop.abort(); await reader.cancel().catch(()=>{});
});

test('owned backend model end receipts preserve real tool/run and native identity without leaking arbitrary data', async t => {
  const f = await fixture(t); await f.request('session');
  const stop = new AbortController();
  const response = await fetch(f.url + '/api/events', { headers: { cookie: f.cookie }, signal: stop.signal });
  const reader = response.body.getReader(); await reader.read();
  f.bridge.emit({ event: 'talk.event', payload: { voiceSessionId: 'voice-private', talkEvent: {
    type: 'tool.result', callId: 'call_real_end', payload: { name: 'openclaw_end_call', source: 'backend_model_client_tool',
      status: 'accepted', requestId: 'item_native', nativeDelegationId: 'item_native', originUserTurnId: 'turn_native',
      delegationGeneration: 3, backendToolCallId: 'call_real_end', backendRunId: 'talk-realtime-consult:actual:parent',
      closeAfterPlayback: true, userTurnText: 'private caller phrase', args: { secret: 'must not leak' }, hidden: 'not-for-browser' } } } });
  const body = new TextDecoder().decode((await reader.read()).value);
  const value = JSON.parse(body.slice(body.indexOf('data: ') + 6).trim());
  assert.equal(value.source, 'backend_model_client_tool'); assert.equal(value.status, 'accepted');
  assert.equal(value.callId, 'call_real_end'); assert.equal(value.backendToolCallId, 'call_real_end');
  assert.equal(value.requestId, 'item_native'); assert.equal(value.nativeDelegationId, 'item_native');
  assert.equal(value.originUserTurnId, 'turn_native'); assert.equal(value.delegationGeneration, 3);
  assert.equal(value.backendRunId, 'talk-realtime-consult:actual:parent');
  assert.doesNotMatch(body, /private caller|secret|hidden|not-for-browser/u);
  stop.abort(); await reader.cancel().catch(() => {});
});

test('SSE avatar activity belongs to the current voice and excludes tool arguments',async t=>{
  const f=await fixture(t);await f.request('session');
  const stop=new AbortController();
  const response=await fetch(f.url+'/api/events',{headers:{cookie:f.cookie},signal:stop.signal});
  const reader=response.body.getReader();await reader.read();
  const emit=(voice,name)=>f.bridge.emit({event:'talk.event',payload:{voiceSessionId:voice,talkEvent:{type:'tool.call',callId:'visual',payload:{name,args:{query:'private-avatar-query'},result:'private-result'}}}});
  emit('foreign','web_search');emit('voice-private','memory_search');
  const received=new TextDecoder().decode((await reader.read()).value);
  assert.match(received,/"activity":"memory"/u);
  assert.doesNotMatch(received,/foreign|private-avatar-query|private-result|args|web/u);
  stop.abort();await reader.cancel().catch(()=>{});
});

test('all new avatar assets and modules are served by the frozen whitelist',async t=>{
  const f=await fixture(t);
  for(const name of ['avatar.mjs','avatar-state.mjs',...['idle','memory','web','calendar','background'].map(s=>`assets/v-signal-${s}-20261006${s === 'idle' ? '' : '-r2'}.png`)]){
    const r=await fetch(`${f.url}/${name}`);assert.equal(r.status,200,name);
    const bytes=new Uint8Array(await r.arrayBuffer());assert.ok(bytes.length>0);
    assert.match(r.headers.get('content-type'),name.endsWith('.png')?/image\/png/u:/javascript/u);
  }
  assert.equal((await fetch(f.url+'/assets/not-whitelisted.png',{headers:{cookie:f.cookie}})).status,404);
});
test('backend events reach direct voice even when they are not GPT Live talk events',async()=>{
 const received=[];const bridge=createLiveH5Server({gateway:{request(){}},directVoice:{handleEvent:e=>received.push(e),dispose:async()=>{}},offer:async()=>''});
 const e={event:'agent',payload:{runId:'voice-own',stream:'tool'}};bridge.emit(e);assert.deepEqual(received,[e]);await bridge.dispose();
});
