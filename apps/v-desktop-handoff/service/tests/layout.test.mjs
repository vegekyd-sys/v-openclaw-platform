// Phone layout: the X screen goes portrait only for the viewer that holds control,
// and the service puts it back on every path that ends that control.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDisplayLayout, normalizeSize, parseWmctrl, parseXrandr } from "../lib/display-layout.mjs";
import { createService } from "../server.mjs";
import { startFakeVnc } from "./fake-vnc.mjs";
import { openViewer } from "./rfb-client.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeX({ width = 1280, height = 800, wmctrl = true } = {}) {
  const calls = [];
  let current = { width, height };
  const modes = new Map([["1280x800", { width: 1280, height: 800 }]]);
  const windows = [
    { id: "0x00c00003", desk: -1, x: 0, y: 0, w: 1280, h: 27, title: "xfce4-panel" },
    { id: "0x02a00004", desk: 0, x: 10, y: 37, w: 1050, h: 753, title: "New Tab - Google Chrome" },
  ];
  const execFile = (cmd, args, _opts, cb) => {
    calls.push([cmd, ...args].join(" "));
    if (cmd === "xrandr" && args.length === 0) {
      cb(null, `Screen 0: minimum 32 x 32, current ${current.width} x ${current.height}, maximum 32768 x 32768\nVNC-0 connected ${current.width}x${current.height}+0+0 0mm x 0mm\n`, "");
    } else if (cmd === "xrandr" && args[0] === "--newmode") {
      modes.set(args[1], { width: Number(args[3]), height: Number(args[7]) });
      cb(null, "", "");
    } else if (cmd === "xrandr" && args[0] === "--output") {
      const mode = modes.get(args[3]);
      if (!mode) {
        cb(new Error("unknown mode"), "", "");
        return;
      }
      current = { ...mode };
      cb(null, "", "");
    } else if (cmd === "wmctrl" && !wmctrl) {
      cb(new Error("spawn wmctrl ENOENT"), "", "");
    } else if (cmd === "wmctrl" && args[0] === "-lG") {
      cb(null, windows.map((w) => `${w.id} ${w.desk} ${w.x} ${w.y} ${w.w} ${w.h} host ${w.title}`).join("\n"), "");
    } else {
      cb(null, "", "");
    }
  };
  return { execFile, calls, get current() { return current; } };
}

test("parsers and size rules", () => {
  assert.deepEqual(normalizeSize(601, 1003), { width: 600, height: 1000 });
  assert.deepEqual(normalizeSize(491, 861), { width: 528, height: 928 }, "narrower than Chrome allows: scaled up, same aspect");
  assert.deepEqual(normalizeSize(900, 5000), { width: 904, height: 1920 });
  assert.equal(normalizeSize("x", 10), null);
  assert.deepEqual(parseXrandr("Screen 0: minimum 32 x 32, current 488 x 864, maximum 1\nVNC-0 connected 488x864+0+0"), { output: "VNC-0", current: { width: 488, height: 864 } });
  const wins = parseWmctrl("0x00c00003 -1 0 0 1280 27 h xfce4-panel\n0x02a00004  0 10   37   1050 753  h New Tab - Google Chrome\n");
  assert.deepEqual(wins, [{ id: "0x02a00004", x: 10, y: 37, width: 1050, height: 753 }], "sticky panel/desktop windows are left alone");
});

test("phone resizes the screen and maximises windows; restore puts both back", async () => {
  const x = fakeX();
  const layout = createDisplayLayout({ execFile: x.execFile, log: {}, settleMs: 1 });
  const state = await layout.phone("viewer-a", 601, 1003);
  assert.deepEqual(state, { mode: "phone", owner: "viewer-a", width: 600, height: 1000 });
  assert.deepEqual(x.current, { width: 600, height: 1000 });
  assert.ok(x.calls.includes("wmctrl -i -r 0x02a00004 -b add,maximized_vert,maximized_horz"));
  assert.ok(!x.calls.some((c) => c.includes("0x00c00003 -b")), "panel is not touched");
  await layout.restore("test");
  assert.deepEqual(x.current, { width: 1280, height: 800 });
  assert.deepEqual(layout.state.mode, "desktop");
  assert.ok(x.calls.includes("wmctrl -i -r 0x02a00004 -e 0,10,37,1050,753"), "window goes back to where it was");
  const before = x.calls.length;
  await layout.restore("again");
  assert.equal(x.calls.length, before, "restoring twice is a no-op");
});

test("missing wmctrl still resizes the screen", async () => {
  const x = fakeX({ wmctrl: false });
  const layout = createDisplayLayout({ execFile: x.execFile, log: {}, settleMs: 1 });
  await layout.phone("v", 600, 800);
  assert.deepEqual(x.current, { width: 600, height: 800 });
  await layout.restore();
  assert.deepEqual(x.current, { width: 1280, height: 800 });
});

test("recover puts a leftover phone size back at start", async () => {
  const x = fakeX({ width: 600, height: 1000 });
  const layout = createDisplayLayout({ execFile: x.execFile, log: {}, settleMs: 1 });
  await layout.recover();
  assert.deepEqual(x.current, { width: 1280, height: 800 });
});

// ---- service enforcement ----
let tmp;
let vnc;
let service;
let ports;
let x;
const adminToken = "test-admin-token-0123456789abcdef";
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
const wsUrl = (viewer) => `ws://127.0.0.1:${ports.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(viewer)}`;

async function controller() {
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_layout" });
  const claim = await pub("POST", "/api/claim", { token: new URL(issued.body.url).hash.slice(1) });
  const ws = await openViewer(wsUrl(claim.body.viewer));
  await ws.handshake();
  assert.equal((await pub("POST", "/api/control", { viewer: claim.body.viewer, take: true })).status, 200);
  return { id: issued.body.id, viewer: claim.body.viewer, ws };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-layout-"));
  fs.writeFileSync(path.join(tmp, "admin-token"), `${adminToken}\n`);
  fs.writeFileSync(path.join(tmp, "vnc-password"), "pw123456\n");
  vnc = await startFakeVnc({ password: "pw123456" });
  x = fakeX();
  const layout = createDisplayLayout({ execFile: x.execFile, log: {}, settleMs: 1 });
  service = createService(
    {
      bind: "127.0.0.1",
      publicPort: 0,
      adminPort: 0,
      publicBaseUrl: "https://example.test",
      pathPrefix: "/desktop-handoff",
      novncDir: tmp,
      stateDir: path.join(tmp, "state"),
      adminTokenFile: path.join(tmp, "admin-token"),
      vnc: { host: "127.0.0.1", port: vnc.port, passwordFile: path.join(tmp, "vnc-password") },
      limits: { claimTtlMs: 60_000, sessionTtlMs: 60_000, idleControlMs: 60_000, maxViewers: 8, maxClaims: 4 },
    },
    { log: { error() {}, info() {} }, layout },
  );
  ports = await service.listen();
});

after(async () => {
  await service?.close();
  await vnc?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("only the controller can ask for the phone layout; the session reports it", async () => {
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_x" });
  const claim = await pub("POST", "/api/claim", { token: new URL(issued.body.url).hash.slice(1) });
  const denied = await pub("POST", "/api/layout", { viewer: claim.body.viewer, mode: "phone", width: 400, height: 800 });
  assert.equal(denied.status, 403);
  assert.deepEqual(x.current, { width: 1280, height: 800 });

  const c = await controller();
  const ok = await pub("POST", "/api/layout", { viewer: c.viewer, mode: "phone", width: 600, height: 800 });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { mode: "phone", width: 600, height: 800 });
  const session = await pub("GET", `/api/session?viewer=${encodeURIComponent(c.viewer)}`);
  assert.equal(session.body.layout.mode, "phone");
  const other = await pub("GET", `/api/session?viewer=${encodeURIComponent(claim.body.viewer)}`);
  assert.equal(other.body.layout.mode, "desktop", "another viewer is not told it owns the phone layout");
  await pub("POST", "/api/control", { viewer: c.viewer, take: false });
  await sleep(50);
  assert.deepEqual(x.current, { width: 1280, height: 800 }, "release restores");
  c.ws.close();
});

for (const [name, end] of [
  ["hand-back from the chat", async (c) => admin("POST", `/v1/handoffs/${c.id}/handback`)],
  ["revoke", async (c) => admin("DELETE", `/v1/handoffs/${c.id}`)],
  ["page closed (socket gone)", async (c) => c.ws.close()],
  ["another window takes control", async () => controller()],
]) {
  test(`phone layout is undone on: ${name}`, async () => {
    const c = await controller();
    await pub("POST", "/api/layout", { viewer: c.viewer, mode: "phone", width: 600, height: 800 });
    assert.deepEqual(x.current, { width: 600, height: 800 });
    const next = await end(c);
    for (let i = 0; i < 40 && x.current.width !== 1280; i++) {
      await sleep(25);
    }
    assert.deepEqual(x.current, { width: 1280, height: 800 });
    c.ws.close();
    next?.ws?.close?.();
  });
}

test("hand-back and revoke answer only after the desktop is restored (slow window manager)", async () => {
  const slowX = fakeX();
  const slowLayout = createDisplayLayout({ execFile: slowX.execFile, log: {}, settleMs: 150 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-layout-slow-"));
  fs.writeFileSync(path.join(dir, "admin-token"), `${adminToken}\n`);
  fs.writeFileSync(path.join(dir, "vnc-password"), "pw123456\n");
  const svc = createService(
    {
      bind: "127.0.0.1",
      publicPort: 0,
      adminPort: 0,
      publicBaseUrl: "https://example.test",
      pathPrefix: "/desktop-handoff",
      novncDir: dir,
      stateDir: path.join(dir, "state"),
      adminTokenFile: path.join(dir, "admin-token"),
      vnc: { host: "127.0.0.1", port: vnc.port, passwordFile: path.join(dir, "vnc-password") },
      limits: { claimTtlMs: 60_000, sessionTtlMs: 60_000, idleControlMs: 60_000, maxViewers: 8, maxClaims: 4 },
    },
    { log: { error() {}, info() {} }, layout: slowLayout },
  );
  const p = await svc.listen();
  const call = async (port, method, route, body, auth) => {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${adminToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    for (const end of ["handback", "revoke"]) {
      const issued = await call(p.adminPort, "POST", "/v1/handoffs", { kind: "control", ownerId: "feishu:ou_slow" }, true);
      const claim = await call(p.publicPort, "POST", "/desktop-handoff/api/claim", { token: new URL(issued.body.url).hash.slice(1) });
      const ws = await openViewer(`ws://127.0.0.1:${p.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(claim.body.viewer)}`);
      await ws.handshake();
      await call(p.publicPort, "POST", "/desktop-handoff/api/control", { viewer: claim.body.viewer, take: true });
      await call(p.publicPort, "POST", "/desktop-handoff/api/layout", { viewer: claim.body.viewer, mode: "phone", width: 600, height: 800 });
      assert.deepEqual(slowX.current, { width: 600, height: 800 });
      if (end === "handback") {
        assert.equal((await call(p.adminPort, "POST", `/v1/handoffs/${issued.body.id}/handback`, undefined, true)).status, 200);
      } else {
        assert.equal((await call(p.adminPort, "DELETE", `/v1/handoffs/${issued.body.id}`, undefined, true)).status, 200);
      }
      // No polling: the answer itself must mean "restored".
      assert.deepEqual(slowX.current, { width: 1280, height: 800 }, `${end} answered before the desktop was restored`);
      assert.ok(slowX.calls.includes("wmctrl -i -r 0x02a00004 -e 0,10,37,1050,753"), "windows are back in place too");
      ws.close();
    }
  } finally {
    await svc.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
