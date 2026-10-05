import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createService } from "../server.mjs";
import { startFakeVnc } from "./fake-vnc.mjs";
import { openViewer, readFrame } from "./rfb-client.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let vnc;
let service;
let ports;
let tmp;
let adminToken;

const admin = async (method, route, body) => {
  const res = await fetch(`http://127.0.0.1:${ports.adminPort}${route}`, {
    method,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const pub = async (method, route, body) => {
  const res = await fetch(`http://127.0.0.1:${ports.publicPort}/desktop-handoff${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const tokenOf = (url) => new URL(url).hash.slice(1);
const wsUrl = (viewer) => `ws://127.0.0.1:${ports.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(viewer)}`;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-handoff-"));
  adminToken = "test-admin-token-0123456789abcdef";
  fs.writeFileSync(path.join(tmp, "admin-token"), `${adminToken}\n`);
  vnc = await startFakeVnc({ password: "pw123456" });
  fs.writeFileSync(path.join(tmp, "vnc-password"), "pw123456\n");
  service = createService({
    bind: "127.0.0.1",
    publicPort: 0,
    adminPort: 0,
    publicBaseUrl: "https://example.test",
    pathPrefix: "/desktop-handoff",
    novncDir: path.join(tmp, "no-novnc"),
    stateDir: path.join(tmp, "state"),
    adminTokenFile: path.join(tmp, "admin-token"),
    title: "测试桌面",
    vnc: { host: "127.0.0.1", port: vnc.port, passwordFile: path.join(tmp, "vnc-password") },
    limits: { claimTtlMs: 60_000, sessionTtlMs: 60_000, idleControlMs: 60_000, maxViewers: 3, maxClaims: 2 },
  }, { log: { error() {} } });
  ports = await service.listen();
});

after(async () => {
  await service?.close();
  await vnc?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("admin API requires the bearer token and issues a link with the token in the fragment", async () => {
  const unauthorized = await fetch(`http://127.0.0.1:${ports.adminPort}/v1/state`);
  assert.equal(unauthorized.status, 401);
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_test", reason: "login" });
  assert.equal(issued.status, 201);
  assert.match(issued.body.url, /^https:\/\/example\.test\/desktop-handoff\/#[A-Za-z0-9_-]{20,}$/u);
  const state = await admin("GET", "/v1/state");
  assert.equal(state.body.controlActive, false);
  assert.equal(state.body.activeHandoffs.length >= 1, true);
  const audit = fs.readFileSync(path.join(tmp, "state", "audit.jsonl"), "utf8");
  assert.doesNotMatch(audit, new RegExp(tokenOf(issued.body.url)), "raw token must never reach the audit log");
});

test("a card's desktop picture is served publicly under its own short-lived token", async () => {
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "wecom:zhangsan", reason: "login" });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
  const put = (id, body, auth = `Bearer ${adminToken}`) => fetch(`http://127.0.0.1:${ports.adminPort}/v1/handoffs/${id}/snapshot`, { method: "PUT", headers: { authorization: auth, "content-type": "application/octet-stream" }, body });
  assert.equal((await put(issued.body.id, jpeg, "Bearer wrong")).status, 401);
  assert.equal((await put("h_000000000000", jpeg)).status, 404, "only for a handoff that exists");
  assert.equal((await put(issued.body.id, Buffer.from("<svg onload=alert(1)>"))).status, 400, "only JPEG/PNG");
  const stored = await put(issued.body.id, jpeg);
  assert.equal(stored.status, 201);
  const { url, type, expiresAt } = await stored.json();
  assert.equal(type, "image/jpeg");
  assert.match(url, /^https:\/\/example\.test\/desktop-handoff\/snapshot\/[\w-]{32}\.jpg$/u);
  assert(expiresAt > Date.now() + 30 * 60_000);
  const local = url.replace("https://example.test", `http://127.0.0.1:${ports.publicPort}`);
  const res = await fetch(local);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.match(res.headers.get("cache-control"), /^private, max-age=\d+$/u);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), jpeg);
  assert.equal((await fetch(local.replace(/[\w-]{32}\.jpg$/u, `${"A".repeat(32)}.jpg`))).status, 404, "unknown token");
  assert.equal((await fetch(local.replace(/\.jpg$/u, ".png"))).status, 200, "the extension is not part of the token");
  assert.doesNotMatch(fs.readFileSync(path.join(tmp, "state", "audit.jsonl"), "utf8"), new RegExp(url.split("/").pop().slice(0, 32)), "the picture token never reaches the audit log");
  // Expiry.
  service.snapshots.ttlMs = -1;
  const expired = await (await put(issued.body.id, jpeg)).json();
  service.snapshots.ttlMs = 60 * 60_000;
  assert.equal((await fetch(expired.url.replace("https://example.test", `http://127.0.0.1:${ports.publicPort}`))).status, 404);
});

test("latest handoff for a session is found by sessionKey", async () => {
  const a = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "u", sessionKey: "agent:x:feishu:direct:u" });
  await sleep(5);
  const b = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "u", sessionKey: "agent:x:feishu:direct:u" });
  const latest = await admin("GET", "/v1/handoffs?sessionKey=agent%3Ax%3Afeishu%3Adirect%3Au");
  assert.equal(latest.status, 200);
  assert.equal(latest.body.id, b.body.id);
  assert.notEqual(latest.body.id, a.body.id);
  assert.equal((await admin("GET", "/v1/handoffs?sessionKey=nobody")).status, 404);
});

test("observer input is dropped server-side, controller input reaches the VNC server, cursor encodings are stripped", async () => {
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_ctl" });
  const claim = await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.canControl, true);
  const viewer = await openViewer(wsUrl(claim.body.viewer));
  const init = await viewer.handshake();
  assert.equal(init.name, "fake desktop");
  const server = vnc.clients.at(-1);
  assert.equal(server.shared, 1, "proxy must always connect shared");

  viewer.setEncodings([0, 1, -239, -261, -223, -262]);
  viewer.requestUpdate();
  assert.equal(await readFrame(viewer), 1, "frames flow to an observer");
  await sleep(50);
  assert.deepEqual(server.setEncodings.at(-1), [0, 1, -223], "cursor pseudo-encodings removed so the server paints the pointer");

  viewer.pointer(10, 10, 1);
  viewer.key(0x61, true);
  viewer.requestUpdate();
  await readFrame(viewer);
  await sleep(50);
  assert.deepEqual(server.messages.filter((m) => m.type === 4 || m.type === 5), [], "observer input never reaches the desktop");

  const denied = await pub("POST", "/api/control", { viewer: "nope", take: true });
  assert.equal(denied.status, 403);
  const taken = await pub("POST", "/api/control", { viewer: claim.body.viewer, take: true });
  assert.equal(taken.status, 200);
  assert.equal(taken.body.role, "controller");
  viewer.pointer(20, 20, 1);
  viewer.key(0x62, true);
  await sleep(50);
  assert.equal(server.messages.filter((m) => m.type === 5).length, 1, "controller pointer forwarded");
  assert.equal(server.messages.filter((m) => m.type === 4).length, 1, "controller key forwarded");
  const state = await admin("GET", "/v1/state");
  assert.equal(state.body.controlActive, true);
  assert.equal(state.body.controlHandoffId, issued.body.id);
  assert.ok(state.body.controlLastInputAt > 0);

  const released = await pub("POST", "/api/control", { viewer: claim.body.viewer, take: false });
  assert.equal(released.body.role, "observer");
  viewer.pointer(30, 30, 0);
  await sleep(50);
  assert.equal(server.messages.filter((m) => m.type === 5).length, 1, "input after release is dropped again");
  viewer.close();
  await viewer.closed;
});

test("a watch link can never take control; taking control from a second window closes the first with 4000", async () => {
  const watch = await admin("POST", "/v1/handoffs", { kind: "watch", ownerId: "feishu:ou_group" });
  const watchClaim = await pub("POST", "/api/claim", { token: tokenOf(watch.body.url) });
  assert.equal(watchClaim.body.canControl, false);
  const watcher = await openViewer(wsUrl(watchClaim.body.viewer));
  await watcher.handshake();
  const refused = await pub("POST", "/api/control", { viewer: watchClaim.body.viewer, take: true });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, "watch_only");

  const control = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_two" });
  const first = await pub("POST", "/api/claim", { token: tokenOf(control.body.url) });
  const second = await pub("POST", "/api/claim", { token: tokenOf(control.body.url) });
  assert.equal(second.status, 200, "the same link may be opened on a second device");
  const third = await pub("POST", "/api/claim", { token: tokenOf(control.body.url) });
  assert.equal(third.status, 403);
  assert.equal(third.body.error, "too_many_claims");
  const a = await openViewer(wsUrl(first.body.viewer));
  await a.handshake();
  const b = await openViewer(wsUrl(second.body.viewer));
  await b.handshake();
  assert.equal((await pub("POST", "/api/control", { viewer: first.body.viewer, take: true })).body.role, "controller");
  assert.equal((await pub("POST", "/api/control", { viewer: second.body.viewer, take: true })).body.role, "controller");
  const closedA = await a.closed;
  assert.equal(closedA.code, 4000);
  assert.equal(closedA.reason, "control-taken");
  const statusB = await pub("GET", `/api/session?viewer=${encodeURIComponent(second.body.viewer)}`);
  assert.equal(statusB.body.role, "controller");
  const statusWatcher = await pub("GET", `/api/session?viewer=${encodeURIComponent(watchClaim.body.viewer)}`);
  assert.equal(statusWatcher.body.controlledByOther, true);

  const revoked = await admin("DELETE", `/v1/handoffs/${control.body.id}`);
  assert.equal(revoked.status, 200);
  const closedB = await b.closed;
  assert.equal(closedB.code, 4002);
  const after = await admin("GET", "/v1/state");
  assert.equal(after.body.controlActive, false);
  watcher.close();
  await watcher.closed;
});

test("unknown, expired and reused tokens are refused; unknown viewers cannot open the WebSocket", async () => {
  assert.equal((await pub("POST", "/api/claim", { token: "nope" })).body.error, "unknown_token");
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_exp", claimTtlMs: 1 });
  await sleep(10);
  assert.equal((await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) })).body.error, "expired");
  const status = await admin("GET", `/v1/handoffs/${issued.body.id}`);
  assert.equal(status.body.ended, true);
  assert.equal(status.body.endReason, "claim_window_expired");
  await assert.rejects(openViewer(wsUrl("unknown-viewer")), /closed before open|ws error/u);
});

test("a wrong VNC password closes the viewer with 4005 instead of hanging", async () => {
  const bad = await startFakeVnc({ password: "other" });
  const svc = createService({
    bind: "127.0.0.1", publicPort: 0, adminPort: 0, publicBaseUrl: "http://x", pathPrefix: "/desktop-handoff",
    novncDir: tmp, stateDir: path.join(tmp, "state2"), adminTokenFile: path.join(tmp, "admin-token"),
    vnc: { host: "127.0.0.1", port: bad.port, passwordFile: path.join(tmp, "vnc-password") }, limits: {},
  }, { log: { error() {} } });
  const p = await svc.listen();
  try {
    const res = await fetch(`http://127.0.0.1:${p.adminPort}/v1/handoffs`, { method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: JSON.stringify({ ownerId: "x" }) });
    const issued = await res.json();
    const claim = await (await fetch(`http://127.0.0.1:${p.publicPort}/desktop-handoff/api/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tokenOf(issued.url) }) })).json();
    const viewer = await openViewer(`ws://127.0.0.1:${p.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(claim.viewer)}`);
    const closed = await viewer.closed;
    assert.equal(closed.code, 4005);
  } finally {
    await svc.close();
    await bad.close();
  }
});
