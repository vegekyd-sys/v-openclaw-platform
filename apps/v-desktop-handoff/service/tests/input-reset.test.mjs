// Keys/buttons V's computer use left pressed (XTEST) are released before a person takes over.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInputReset, parseKeymap, parsePressed } from "../lib/input-reset.mjs";
import { createService } from "../server.mjs";
import { startFakeVnc } from "./fake-vnc.mjs";
import { openViewer } from "./rfb-client.mjs";

const KEYBOARD_STATE = "1 class :\nKeyClass\n\tkey[8]=up\n\tkey[64]=down\n\tkey[133]=down\n\tkey[200]=up\n";
const POINTER_STATE = "2 classes :\nButtonClass\n\tbutton[1]=down\n\tbutton[2]=up\n\tbutton[3]=up\nValuatorClass Mode=Relative\n\tvaluator[0]=10\n";
const KEYMAP = "keycode  37 = Control_L NoSymbol Control_L\nkeycode  64 = Alt_L Meta_L Alt_L Meta_L\nkeycode 133 = Super_L NoSymbol Super_L\nkeycode 200 = NoSymbol\n";

function fakeX({ keyboard = KEYBOARD_STATE, pointer = POINTER_STATE, missing = false } = {}) {
  const calls = [];
  const execFile = (cmd, args, _opts, cb) => {
    calls.push([cmd, ...args].join(" "));
    if (missing) {
      cb(new Error(`spawn ${cmd} ENOENT`), "", "");
    } else if (cmd === "xinput") {
      cb(null, args[1].includes("keyboard") ? keyboard : pointer, "");
    } else if (cmd === "xmodmap") {
      cb(null, KEYMAP, "");
    } else {
      cb(null, "", "");
    }
  };
  return { execFile, calls };
}

test("parsers", () => {
  assert.deepEqual(parsePressed(KEYBOARD_STATE, "key"), [64, 133]);
  assert.deepEqual(parsePressed(POINTER_STATE, "button"), [1]);
  const map = parseKeymap(KEYMAP);
  assert.equal(map.get(64), "Alt_L");
  assert.equal(map.has(200), false, "NoSymbol keycodes are skipped");
});

test("stuck Alt/Super and a held button are released through XTEST", async () => {
  const x = fakeX();
  const released = await createInputReset({ execFile: x.execFile, log: {} }).releaseStuck();
  assert.deepEqual(released, { keys: ["Alt_L", "Super_L"], buttons: [1] });
  assert.ok(x.calls.includes("xdotool keyup Alt_L"));
  assert.ok(x.calls.includes("xdotool keyup Super_L"));
  assert.ok(x.calls.includes("xdotool mouseup 1"));
});

test("nothing pressed: nothing sent; tools missing: no throw", async () => {
  const clean = fakeX({ keyboard: "key[64]=up\n", pointer: "button[1]=up\n" });
  assert.deepEqual(await createInputReset({ execFile: clean.execFile, log: {} }).releaseStuck(), { keys: [], buttons: [] });
  assert.ok(!clean.calls.some((c) => c.startsWith("xdotool")));
  const missing = fakeX({ missing: true });
  assert.deepEqual(await createInputReset({ execFile: missing.execFile, log: {} }).releaseStuck(), { keys: [], buttons: [] });
});

// ---- the control API calls it on take-over only ----
let tmp;
let vnc;
let service;
let ports;
const resets = [];
const adminToken = "test-admin-token-0123456789abcdef";
const call = async (port, method, route, body, auth) => {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${adminToken}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-input-"));
  fs.writeFileSync(path.join(tmp, "admin-token"), `${adminToken}\n`);
  fs.writeFileSync(path.join(tmp, "vnc-password"), "pw123456\n");
  vnc = await startFakeVnc({ password: "pw123456" });
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
    { log: { error() {} }, inputReset: { releaseStuck: async () => resets.push(Date.now()) } },
  );
  ports = await service.listen();
});

after(async () => {
  await service?.close();
  await vnc?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("take-over releases stuck input first; a watch-only link never triggers it", async () => {
  for (const kind of ["watch", "control"]) {
    const issued = await call(ports.adminPort, "POST", "/v1/handoffs", { kind, ownerId: "feishu:ou_x" }, true);
    const claim = await call(ports.publicPort, "POST", "/desktop-handoff/api/claim", { token: new URL(issued.body.url).hash.slice(1) });
    const ws = await openViewer(`ws://127.0.0.1:${ports.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(claim.body.viewer)}`);
    await ws.handshake();
    const before = resets.length;
    const res = await call(ports.publicPort, "POST", "/desktop-handoff/api/control", { viewer: claim.body.viewer, take: true });
    if (kind === "watch") {
      assert.equal(res.status, 403);
      assert.equal(resets.length, before);
    } else {
      assert.equal(res.status, 200);
      assert.equal(resets.length, before + 1);
    }
    ws.close();
  }
});
