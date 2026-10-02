import assert from "node:assert/strict";
import test from "node:test";
import { createLiveH5Server } from "./server.mjs";
import { transcriptEvent } from "./events.mjs";

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
  assert.match(f.calls[0].params.sessionKey, /^agent:makaron:explicit:gpt-live-h5-experiment-/u);
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
