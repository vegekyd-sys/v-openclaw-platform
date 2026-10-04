import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { createLiveH5Server } from "./server.mjs";

const token = "private-test-token-with-at-least-32-characters";
const origin = "https://openclaw.tianyi.live";
async function fixture(t, options = {}) {
  const calls = [];
  let id = 0;
  const bridge = createLiveH5Server({ basePath: "/voice", publicOrigin: origin, accessToken: token,
    ...options, gateway: { request: async (method, params) => {
      calls.push({ method, params });
      if (options.request) return options.request(method, params);
      return method === "talk.client.create" ? { voiceSessionId: `voice-${++id}`, model: "gpt-live-1-codex", transport: "webrtc", offerUrl: "/plugins/openai/realtime/calls", clientSecret: "server-only" } : { ok: true };
    } }, offer: async () => "v=0\r\nanswer" });
  await new Promise(resolve => bridge.server.listen(0, "127.0.0.1", resolve));
  t.after(() => bridge.dispose());
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  const request = (path, cookie, body, extra = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(url + path, { method: body === undefined ? "GET" : "POST",
      headers: { host: new URL(origin).host, origin, ...(cookie ? { cookie } : {}), "content-type": "application/json", ...extra } },
      response => resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers: response.headers })));
    req.on("error", reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const visitor = async () => {
    const response = await request("/voice/api/access", "", { access: token });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /Path=\/voice\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure/u);
    return cookie.split(";", 1)[0];
  };
  return { bridge, calls, request, visitor };
}

test("original /voice/ path serves assets without creating a call and protects all APIs", async t => {
  const f = await fixture(t);
  const redirect = await f.request("/voice"); assert.equal(redirect.status, 308); assert.equal(redirect.headers.get("location"), "/voice/");
  for (const name of ["", "app.js", "styles.css", "events.mjs", "assets/v-idle-nohat-20260922.png"]) assert.equal((await f.request(`/voice/${name}`)).status, 200);
  assert.equal((await f.request("/api/status")).status, 404);
  assert.equal((await f.request("/voice/api/status")).status, 401);
  assert.equal((await f.request("/voice/api/access", "", { access: "wrong" })).status, 403);
  assert.equal((await f.request("/voice/api/access", "", { access: token }, { origin: "https://other.example" })).status, 403);
  assert.equal((await f.request("/voice/api/access", "", { access: token }, { origin: "" })).status, 403);
  assert.equal(f.calls.length, 0);
});

test("existing Xiaohe signed cookies remain valid while visitor calls and closes are isolated", async t => {
  const f = await fixture(t);
  const payload = `${"a".repeat(32)}.${Date.now() + 60000}`;
  const oldCookie = `v_voice_access=${payload}.${createHmac("sha256", token).update(payload).digest("base64url")}`;
  assert.equal((await f.request("/voice/api/status", oldCookie)).status, 200);
  const second = await f.visitor();
  const a = await (await f.request("/voice/api/session", oldCookie, {})).json();
  const b = await (await f.request("/voice/api/session", second, {})).json();
  assert.notEqual(a.voiceSessionId, b.voiceSessionId);
  const creates = f.calls.filter(row => row.method === "talk.client.create");
  assert.notEqual(creates[0].params.sessionKey, creates[1].params.sessionKey);
  assert.equal((await f.request("/voice/api/close", second, { voiceSessionId: a.voiceSessionId })).status, 409);
  assert.equal((await f.request("/voice/api/close", oldCookie, a)).status, 200);
  assert.equal((await (await f.request("/voice/api/status", second)).json()).activeCall, true);
  const redial = await (await f.request("/voice/api/session", oldCookie, {})).json();
  assert.notEqual(redial.voiceSessionId, a.voiceSessionId);
  assert.notEqual(f.calls.filter(row => row.method === "talk.client.create")[2].params.sessionKey, creates[0].params.sessionKey);
});

test("global admission counts a pending reservation and never evicts someone else's call", async t => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { maxActiveSessions: 1, maxActiveSessionsPerIp: 1, request: async method => {
    if (method === "talk.client.create") { began(); await held; return { voiceSessionId: "voice-held", model: "gpt-live-1-codex", transport: "webrtc", offerUrl: "/plugins/openai/realtime/calls" }; }
    return { ok: true };
  } });
  const a = await f.visitor(), b = await f.visitor();
  const first = f.request("/voice/api/session", a, {}); await started;
  assert.equal((await f.request("/voice/api/session", b, {})).status, 503);
  assert.equal((await f.request("/voice/api/session", a, {})).status, 409);
  release(); assert.equal((await first).status, 200);
  assert.equal(f.calls.filter(row => row.method === "talk.client.create").length, 1);
});

test("SSE tool events only reach the cookie owning the voice session", async t => {
  const f = await fixture(t), a = await f.visitor(), b = await f.visitor();
  const voiceA = await (await f.request("/voice/api/session", a, {})).json();
  const voiceB = await (await f.request("/voice/api/session", b, {})).json();
  const readerA = (await f.request("/voice/api/events", a)).body.getReader();
  const readerB = (await f.request("/voice/api/events", b)).body.getReader();
  await readerA.read(); await readerB.read();
  f.bridge.emit({ event: "talk.event", payload: { voiceSessionId: voiceA.voiceSessionId, talkEvent: { type: "tool.call", callId: "only-a" } } });
  f.bridge.emit({ event: "talk.event", payload: { voiceSessionId: voiceB.voiceSessionId, talkEvent: { type: "tool.call", callId: "only-b" } } });
  const textA = new TextDecoder().decode((await readerA.read()).value), textB = new TextDecoder().decode((await readerB.read()).value);
  assert.match(textA, /only-a/u); assert.doesNotMatch(textA, /only-b/u);
  assert.match(textB, /only-b/u); assert.doesNotMatch(textB, /only-a/u);
  await readerA.cancel(); await readerB.cancel();
});
