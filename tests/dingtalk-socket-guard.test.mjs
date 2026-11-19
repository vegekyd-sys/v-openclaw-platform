// DingTalk connector stop() must not leave a socket without an "error"
// listener (V Gateway crashes 2026-11-08 and 2026-11-12, "Unexpected server
// response: 400"). See apps/v-experience/dingtalk/patch-socket-guard.mjs.
//
// The repository has no `ws`, so this runs the chunk's real stop() against a
// stand-in socket with ws@8's semantics that matter here: it is a Node
// EventEmitter (an "error" nobody listens to throws), a refused upgrade emits
// "error" "Unexpected server response: <status>", and terminate() during the
// handshake emits "error" on the next tick. The same check against the real
// ws and dingtalk-stream from V's npm project:
// lab/candidate/dingtalk-socket-guard-repro.mjs (and the Gateway candidate
// lab/candidate/dingtalk-socket-guard.plan.json).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import test from "node:test";
import { patchConnectionChunk } from "../apps/v-experience/dingtalk/patch.mjs";
import { patchConnectionChunk as patchInterSessionConnection } from "../apps/v-experience/dingtalk/patch-inter-session.mjs";
import { patchSocketGuard, SOCKET_GUARD_MARKER } from "../apps/v-experience/dingtalk/patch-socket-guard.mjs";
import { buildStop } from "../lab/candidate/dingtalk-socket-guard-repro.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const upstream = fs.readFileSync(new URL("../apps/v-experience/dingtalk/baseline/connection-DCvu-l09.mjs", import.meta.url), "utf8");
const vCurrent = patchConnectionChunk(upstream);
const guarded = patchSocketGuard(vCurrent);
const release = JSON.parse(fs.readFileSync(new URL("../lab/release-files/dingtalk-socket-guard/manifest.json", import.meta.url), "utf8"));
const shipped = fs.readFileSync(new URL("../lab/release-files/dingtalk-socket-guard/dist/connection-DCvu-l09.mjs", import.meta.url), "utf8");

class FakeWs extends EventEmitter {
  readyState = 0; // CONNECTING
  terminated = false;
  refuseUpgrade(status) {
    if (this.terminated) return false; // the request was aborted; no answer arrives
    this.readyState = 2;
    this.emit("error", new Error(`Unexpected server response: ${status}`));
    this.readyState = 3;
    this.emit("close", 1006, "");
    return true;
  }
  terminate() {
    if (this.readyState !== 0) return;
    this.terminated = true;
    this.readyState = 2;
    process.nextTick(() => {
      this.emit("error", new Error("WebSocket was closed before the connection was established"));
      this.readyState = 3;
      this.emit("close", 1006, "");
    });
  }
}

const logs = [];
const logger = Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (m) => logs.push(`${level}: ${m}`)]));
const stoppedSocket = (chunk) => {
  const socket = new FakeWs();
  socket.on("error", () => {}); // dingtalk-stream's own listener
  buildStop(chunk, { client: { socket }, logger })();
  return socket;
};

test("the guard builds V's current connection chunk into the shipped bytes", () => {
  assert.equal(sha(vCurrent), "397c42c3f66d0cd7898168de21be1607303723cd797d9174ad4b1d6694d44520", "v-experience build no longer gives V's bytes");
  assert.equal(release.length, 1);
  assert.equal(release[0].before, sha(vCurrent));
  assert.equal(release[0].after, sha(guarded));
  assert.equal(sha(shipped), release[0].after, "lab/release-files bytes differ from the patch output");
  assert.equal(patchSocketGuard(guarded), guarded, "idempotent");
  assert(patchSocketGuard(upstream).includes(SOCKET_GUARD_MARKER), "applies to the upstream chunk too");
  assert.equal(guarded.split("\n").length - vCurrent.split("\n").length, 12, "only stop() changed");
  // The inter-session bridge patch still applies on top of the guard.
  assert.match(patchInterSessionConnection(guarded), /vInterUnregister\(vInterBridges\);[\s\S]*v-dingtalk-socket-guard-v1/u);
});

test("old stop(): the refused handshake of a stopped socket throws out of the process", () => {
  const socket = stoppedSocket(vCurrent);
  assert.equal(socket.listenerCount("error"), 0, "old stop() should leave no error listener");
  assert.equal(socket.readyState, 0, "old stop() leaves the handshake running");
  assert.throws(() => socket.refuseUpgrade(400), /Unexpected server response: 400/u);
});

test("new stop(): the socket keeps an error listener and its handshake is aborted", async () => {
  logs.length = 0;
  const socket = stoppedSocket(guarded);
  assert.equal(socket.listenerCount("error"), 1);
  assert.equal(socket.terminated, true);
  await new Promise((r) => setImmediate(r));
  assert.equal(socket.readyState, 3);
  assert.equal(socket.refuseUpgrade(400), false, "an aborted handshake gets no answer");
  assert.deepEqual(logs.filter((l) => l.startsWith("warn:")), ["warn: stopped connection socket error (ignored): WebSocket was closed before the connection was established"]);
});

test("new stop(): an error that still reaches the stopped socket is logged, not thrown", () => {
  logs.length = 0;
  const socket = new FakeWs();
  socket.terminate = () => {}; // e.g. the answer was already on its way
  buildStop(guarded, { client: { socket }, logger })();
  assert.doesNotThrow(() => socket.refuseUpgrade(400));
  assert.deepEqual(logs.filter((l) => l.startsWith("warn:")), ["warn: stopped connection socket error (ignored): Unexpected server response: 400"]);
});

test("new stop(): an open socket is left to onAbort's disconnect()", () => {
  const socket = new FakeWs();
  socket.readyState = 1;
  let terminated = false;
  socket.terminate = () => { terminated = true; };
  buildStop(guarded, { client: { socket }, logger })();
  assert.equal(terminated, false);
  assert.equal(socket.listenerCount("error"), 1);
  assert.doesNotThrow(() => buildStop(guarded, { client: {}, logger })(), "no socket yet");
});
