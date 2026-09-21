import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  CALLER_AFTER,
  KEEPALIVE_AFTER,
  patchGatewayKeepaliveCaller,
  patchWebSocketKeepalive,
} from "./patch-websocket-keepalive-backport.mjs";

function loadKeepalive() {
  return Function("WebSocket", `${KEEPALIVE_AFTER}; return startWebSocketKeepalive;`)({ OPEN: 1 });
}

function withClock(run) {
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
    run({ tick: () => tick(), setNow: (value) => { now = value; } });
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance,
    });
  }
}

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

test("queued ping is not treated as a missed pong at the next 25 second tick", () => {
  withClock(({ tick, setNow }) => {
    const socket = new FakeSocket();
    const transport = new FakeTransport();
    let missed = 0;
    loadKeepalive()(socket, () => { missed += 1; }, transport);

    setNow(25_000);
    tick();
    assert.equal(transport.timeout, 25_000);
    setNow(50_000);
    tick();
    assert.equal(missed, 0);

    socket.pingCallback();
    assert.equal(transport.timeout, 0);
    setNow(74_999);
    tick();
    assert.equal(missed, 0);
    setNow(75_000);
    tick();
    assert.equal(missed, 1);
  });
});

test("pong clears a flushed ping before its full response window expires", () => {
  withClock(({ tick, setNow }) => {
    const socket = new FakeSocket();
    const transport = new FakeTransport();
    let missed = 0;
    loadKeepalive()(socket, () => { missed += 1; }, transport);

    setNow(25_000);
    tick();
    socket.pingCallback();
    setNow(49_000);
    socket.emit("pong");
    setNow(50_000);
    tick();
    assert.equal(missed, 0);
    assert.equal(transport.timeout, 25_000);
  });
});

test("patches fail closed on runtime drift and pass the upgrade transport", () => {
  assert.throws(() => patchWebSocketKeepalive("unrelated"), /anchor drifted/);
  assert.throws(() => patchGatewayKeepaliveCaller("unrelated"), /anchor drifted/);
  assert.match(CALLER_AFTER, /upgradeReq\.socket/);
});
