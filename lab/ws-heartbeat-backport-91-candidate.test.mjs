import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert.ok(runtime, "VLAB_CANDIDATE_RUNTIME is required");

class FakeSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  pingCallback;
  ping(_data, _mask, callback) {
    this.pingCallback = callback;
  }
}

class FakeTransport extends EventEmitter {
  timeout = 0;
  setTimeout(value) {
    this.timeout = value;
    return this;
  }
}

test("candidate runtime preserves a queued ping and starts the pong deadline after flush", async () => {
  const helperPath = path.join(runtime, "openclaw/dist/websocket-keepalive-Jg8mBtsJ.js");
  const { t: startWebSocketKeepalive } = await import(pathToFileURL(helperPath));
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalPerformance = globalThis.performance;
  let tick;
  let now = 0;
  globalThis.setInterval = (callback) => {
    tick = callback;
    return 1;
  };
  globalThis.clearInterval = () => {};
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });
  try {
    const socket = new FakeSocket();
    const transport = new FakeTransport();
    let missed = 0;
    startWebSocketKeepalive(socket, () => { missed += 1; }, transport);
    now = 25_000;
    tick();
    now = 50_000;
    tick();
    assert.equal(missed, 0);
    socket.pingCallback();
    now = 74_999;
    tick();
    assert.equal(missed, 0);
    now = 75_000;
    tick();
    assert.equal(missed, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance,
    });
  }
});

test("candidate Gateway owner passes its upgrade transport to keepalive", async () => {
  const caller = await readFile(
    path.join(runtime, "openclaw/dist/server-ws-runtime-BJcMZyBf.js"),
    "utf8",
  );
  assert.match(caller, /}, upgradeReq\.socket\);/);
});
