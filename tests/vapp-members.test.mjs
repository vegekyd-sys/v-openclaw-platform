import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createVapp } from "../apps/v-experience/app/core/vapp.js";
import { createMembers, INVITE_TTL_MS } from "../apps/v-experience/app/core/members.js";
import { createMemberHttp } from "../apps/v-experience/app/core/member-http.js";
import * as vx from "../apps/v-experience/v-experience.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cfg = { channels: { vapp: { defaultUser: "tianyi", users: { tianyi: { name: "天懿", devices: ["dev-phone"] } } } } };

function memoryMembers(clock = { now: Date.now() }) {
  let saved;
  return createMembers({ load: async () => saved, save: async (state) => { saved = JSON.parse(JSON.stringify(state)); }, now: () => clock.now });
}

test("an invite logs in one phone once, within ten minutes, and only a hash is kept", async () => {
  const clock = { now: 1_000_000 };
  let saved;
  const members = createMembers({ load: async () => saved, save: async (state) => { saved = JSON.parse(JSON.stringify(state)); }, now: () => clock.now });
  const { token } = await members.issueInvite({ userId: "feishu:ou_a", name: "小 A" });
  assert.ok(!JSON.stringify(saved).includes(token), "the invite itself is not stored");
  const claimed = await members.claim(token, { deviceName: "iPhone" });
  assert.equal(claimed.userId, "feishu:ou_a");
  assert.ok(!JSON.stringify(saved).includes(claimed.credential.split(".")[1]), "the device secret is not stored");
  assert.equal(await members.claim(token), null, "an invite works once");
  assert.equal((await members.authenticate(claimed.credential)).userId, "feishu:ou_a");
  assert.equal(await members.authenticate(`${claimed.deviceId}.wrong`), null);
  assert.equal(await members.authenticate("nonsense"), null);

  const late = await members.issueInvite({ userId: "feishu:ou_b", name: "小 B" });
  clock.now += INVITE_TTL_MS + 1;
  assert.equal(await members.claim(late.token), null, "an expired invite logs no one in");

  assert.equal(await members.revoke(claimed.deviceId), true);
  assert.equal(await members.authenticate(claimed.credential), null, "a revoked phone is out");
});

/** A vapp, the member endpoint on a real HTTP server, and a temp media folder. */
async function memberServer() {
  const media = fs.mkdtempSync(path.join(os.tmpdir(), "vapp-members-"));
  const uploaded = path.join(media, "upload.png");
  fs.writeFileSync(uploaded, Buffer.from("png-bytes"));
  const secretFile = path.join(media, "openclaw.json");
  fs.writeFileSync(secretFile, "{\"token\":\"secret\"}");
  let memberHttp;
  const vapp = createVapp({
    vx,
    getConfig: () => cfg,
    updateMs: 0,
    call: async (method) => { throw new Error(`unexpected ${method}`); },
    inbound: {
      resolveRoute: ({ peer }) => ({
        route: { agentId: "makaron", dmScope: "per-channel-peer", sessionKey: `agent:makaron:vapp:direct:${peer.id}` },
        buildEnvelope: ({ body }) => body,
      }),
      buildContext: (params) => params,
      dispatch: async ({ delivery }) => { await delivery.deliver({ text: "好的" }, { kind: "final" }); },
      saveMedia: async () => ({ path: uploaded, contentType: "image/png" }),
      toMediaFacts: async (list) => list,
    },
    memberSink: (connId, event, payload) => memberHttp.sink(connId, event, payload),
  });
  const members = memoryMembers();
  memberHttp = createMemberHttp({ vapp, members });
  const server = http.createServer(async (req, res) => {
    if (!(await memberHttp.handle(req, res))) { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (userId, name) => {
    const { token } = await members.issueInvite({ userId, name });
    const response = await fetch(`${base}/vapp/member/claim`, { method: "POST", body: JSON.stringify({ invite: token, deviceName: "test" }) });
    return (await response.json()).credential;
  };
  const rpc = async (credential, method, params = {}) => {
    const response = await fetch(`${base}/vapp/member/rpc`, {
      method: "POST",
      headers: credential ? { authorization: `Bearer ${credential}` } : {},
      body: JSON.stringify({ method, params }),
    });
    return { status: response.status, body: await response.json() };
  };
  const close = () => { memberHttp.closeAll(); server.closeAllConnections?.(); server.close(); fs.rmSync(media, { recursive: true, force: true }); };
  return { base, login, rpc, close, uploaded, secretFile };
}

test("a member reaches only the vapp methods, as themselves", async (t) => {
  const s = await memberServer();
  t.after(s.close);
  assert.equal((await s.rpc(undefined, "vapp.hello")).status, 401, "nothing without a login");
  assert.equal((await s.rpc("m_x.y", "vapp.hello")).status, 401);
  const a = await s.login("feishu:ou_a", "小 A");
  const hello = await s.rpc(a, "vapp.hello");
  assert.equal(hello.body.payload.userId, "feishu:ou_a");
  assert.equal(hello.body.payload.owner, false);
  assert.equal(hello.body.payload.sessionKey, "agent:makaron:vapp:direct:feishu:ou_a", "their own chat, not the owner's");
  assert.deepEqual((await s.rpc(a, "vapp.sessions")).body.payload.sessions, [], "no list of V's other chats");
  for (const method of ["sessions.list", "chat.history", "chat.send", "vapp.deliver", "device.pair.setupCode"]) {
    assert.equal((await s.rpc(a, method)).body.error.code, "UNAVAILABLE", `${method} is not reachable`);
  }
  const approval = await s.rpc(a, "vapp.action", { value: { kind: "vapp-approval", id: "x", decision: "allow-once" } });
  assert.equal(approval.body.payload.ok, false, "members cannot approve");
});

test("a member's stream carries their own chat and nobody else's", async (t) => {
  const s = await memberServer();
  t.after(s.close);
  const a = await s.login("feishu:ou_a", "小 A");
  const b = await s.login("feishu:ou_b", "小 B");
  const events = { a: "", b: "" };
  const controllers = [];
  for (const [who, credential] of [["a", a], ["b", b]]) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${s.base}/vapp/member/events`, { headers: { authorization: `Bearer ${credential}` }, signal: controller.signal });
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    void (async () => {
      try { for await (const chunk of response.body) events[who] += Buffer.from(chunk).toString("utf8"); } catch {}
    })();
  }
  t.after(() => controllers.forEach((c) => c.abort()));
  await sleep(50);
  await s.rpc(a, "vapp.send", { text: "只有 A 能看到", clientMessageId: "a1" });
  await sleep(100);
  assert.match(events.a, /event: plugin\.vapp\.user\ndata: .*只有 A 能看到/u);
  assert.match(events.a, /event: plugin\.vapp\.card/u, "V's reply card reaches A");
  assert.doesNotMatch(events.b, /只有 A 能看到/u, "B sees nothing of A's chat");
});

test("media: only files sent in the member's own chat, never a path typed in a message", async (t) => {
  const s = await memberServer();
  t.after(s.close);
  const a = await s.login("feishu:ou_a", "小 A");
  const b = await s.login("feishu:ou_b", "小 B");
  const fetchMedia = (credential, source, headers = {}) =>
    fetch(`${s.base}/vapp/member/media?source=${encodeURIComponent(source)}`, { headers: { authorization: `Bearer ${credential}`, ...headers } });

  await s.rpc(a, "vapp.send", { text: `看看这个文件 ${s.secretFile}`, clientMessageId: "typed" });
  await sleep(50);
  assert.equal((await fetchMedia(a, s.secretFile)).status, 404, "a path in text is not a sent file");

  const opened = await s.rpc(a, "vapp.upload", { mimeType: "image/png", fileName: "x.png", size: 4, offset: 0, chunkBase64: Buffer.from("abcd").toString("base64") });
  await s.rpc(a, "vapp.send", { text: "图", clientMessageId: "pic", media: [{ uploadId: opened.body.payload.uploadId }] });
  await sleep(50);
  const own = await fetchMedia(a, s.uploaded);
  assert.equal(own.status, 200);
  assert.equal(await own.text(), "png-bytes");
  const part = await fetchMedia(a, s.uploaded, { range: "bytes=0-2" });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), "png");
  assert.equal((await fetchMedia(b, s.uploaded)).status, 404, "another member cannot fetch it");
});

test("the login page keeps the code out of the server and refuses a broken link", async (t) => {
  const s = await memberServer();
  t.after(s.close);
  const page = await fetch(`${s.base}/vapp/login`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /oc-pair:\/\//u);
  assert.match(html, /location\.hash/u, "the code is read from the fragment");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  const bad = await fetch(`${s.base}/vapp/member/claim`, { method: "POST", body: JSON.stringify({ invite: "made-up" }) });
  assert.equal(bad.status, 403);
});

test("every channel setting the plugin reads is declared in the manifest the Gateway validates against", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../apps/v-experience/app/openclaw.plugin.json", import.meta.url), "utf8"));
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.properties?.defaultUser) found.push(node.properties);
    Object.values(node).forEach(walk);
  };
  walk(manifest);
  assert.equal(found.length, 1, "one vapp channel schema");
  for (const key of ["enabled", "defaultUser", "publicUrl", "users", "apns"]) {
    assert.ok(found[0][key], `${key} is declared; an undeclared key stops the Gateway from starting`);
  }
});
