import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFrame, decodeFrame } from "../lib/ws.mjs";
import { createRfbClientMessageSplitter, stripCursorEncodings } from "../lib/rfb-filter.mjs";
import { HandoffRegistry } from "../lib/registry.mjs";
import { vncAuthResponse, vncDesKey } from "../lib/vnc-auth.mjs";

function maskFrame(opcode, payload, fin = true) {
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
  const frame = encodeFrame(opcode, masked);
  frame[0] = (fin ? 0x80 : 0) | opcode;
  const headerLength = frame.length - masked.length;
  const out = Buffer.concat([frame.subarray(0, headerLength), mask, masked]);
  out[1] |= 0x80;
  return out;
}

test("ws frames: masked client frames decode, short and long payloads round-trip, unmasked is rejected", () => {
  for (const size of [0, 5, 125, 126, 300, 65_535, 70_000]) {
    const payload = Buffer.alloc(size, 7);
    const frame = maskFrame(0x2, payload);
    const decoded = decodeFrame(frame);
    assert.equal(decoded.opcode, 0x2);
    assert.equal(decoded.totalLength, frame.length);
    assert.ok(decoded.payload.equals(payload));
  }
  assert.equal(decodeFrame(maskFrame(0x2, Buffer.alloc(3)).subarray(0, 4)), null, "partial frame waits");
  assert.equal(typeof decodeFrame(encodeFrame(0x2, Buffer.alloc(3))), "string", "unmasked client frame is a protocol error");
});

test("rfb splitter: messages split across chunks, unknown type fails closed", () => {
  const splitter = createRfbClientMessageSplitter();
  const pointer = Buffer.from([5, 0, 0, 10, 0, 20]);
  const key = Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61]);
  const seen = [];
  const decide = (type) => { seen.push(type); return type !== 5; };
  const a = splitter.split(Buffer.concat([pointer, key]).subarray(0, 7), decide);
  const b = splitter.split(Buffer.concat([pointer, key]).subarray(7), decide);
  assert.deepEqual(seen, [5, 4]);
  assert.equal(a.forward.length + b.forward.length, key.length, "pointer dropped, key forwarded");
  const bad = splitter.split(Buffer.from([99]), decide);
  assert.match(bad.error, /unsupported/u);
  assert.match(splitter.split(Buffer.from([3]), decide).error, /unsupported/u, "stays failed");
});

test("stripCursorEncodings removes only cursor pseudo-encodings and fixes the count", () => {
  const msg = Buffer.alloc(4 + 5 * 4);
  msg[0] = 2;
  msg.writeUInt16BE(5, 2);
  [7, -239, 16, -261, -308].forEach((e, i) => msg.writeInt32BE(e, 4 + i * 4));
  const out = stripCursorEncodings(msg);
  assert.equal(out.readUInt16BE(2), 3);
  assert.deepEqual([0, 1, 2].map((i) => out.readInt32BE(4 + i * 4)), [7, 16, -308]);
});

test("registry: claim window, session ttl, idle demotion and claim caps", () => {
  let now = 1_000_000;
  const audit = [];
  const registry = new HandoffRegistry({ now: () => now, onAudit: (e) => audit.push(e), limits: { claimTtlMs: 1000, sessionTtlMs: 5000, idleControlMs: 2000, maxClaims: 1, maxViewers: 8 } });
  const issued = registry.issue({ kind: "control", ownerId: "u1", sessionKey: "agent:x:feishu:direct:u1", reason: "login" });
  assert.equal(registry.claim("wrong").error, "unknown_token");
  now += 1001;
  assert.equal(registry.claim(issued.token).error, "expired");
  const second = registry.issue({ kind: "control", ownerId: "u1" });
  const claim = registry.claim(second.token);
  assert.equal(claim.canControl, true);
  assert.equal(registry.claim(second.token).error, "too_many_claims");
  const closes = [];
  const link = { close: (code, reason) => closes.push([code, reason]) };
  assert.equal(registry.attachViewer(claim.viewer, link).viewer.role, "observer");
  assert.equal(registry.takeControl(claim.viewer).role, "controller");
  assert.equal(registry.isController(claim.viewer), true);
  now += 2001;
  registry.tick();
  assert.equal(registry.isController(claim.viewer), false, "idle controller demoted");
  assert.equal(registry.viewerStatus(claim.viewer).role, "observer");
  registry.takeControl(claim.viewer);
  now += 5000;
  registry.tick();
  assert.deepEqual(closes.at(-1), [4001, "session_expired"]);
  assert.equal(registry.state().controlActive, false);
  assert.ok(audit.some((e) => e.event === "control_released" && e.reason === "idle"));
  assert.ok(!JSON.stringify(audit).includes(second.token), "token never audited");
});

test("vnc DES key bit order matches the VNC convention", () => {
  assert.deepEqual([...vncDesKey("\x01")], [0x80, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(vncAuthResponse("secret", Buffer.alloc(16)).length, 16);
  assert.throws(() => vncAuthResponse("x", Buffer.alloc(8)));
});

test("registry: hand back from the chat demotes only this handoff's controller and keeps the handoff open", () => {
  let now = 1_000_000;
  const audit = [];
  const registry = new HandoffRegistry({ now: () => now, onAudit: (e) => audit.push(e) });
  const a = registry.issue({ kind: "control", ownerId: "u1", sessionKey: "s1" });
  const b = registry.issue({ kind: "control", ownerId: "u1", sessionKey: "s2" });
  const ca = registry.claim(a.token);
  registry.attachViewer(ca.viewer, { close() {} });
  assert.equal(registry.handBack("missing"), null);
  assert.deepEqual(registry.handBack(a.id), { id: a.id, released: false, ended: false }, "nobody controls yet");
  registry.takeControl(ca.viewer);
  assert.equal(registry.handBack(b.id).released, false, "another handoff cannot release this controller");
  assert.equal(registry.isController(ca.viewer), true);
  assert.equal(registry.handBack(a.id).released, true);
  assert.equal(registry.isController(ca.viewer), false);
  assert.equal(registry.handoffStatus(a.id).ended, false, "handoff stays open so 接管电脑 works again");
  assert.equal(registry.takeControl(ca.viewer).role, "controller", "can take control again");
  assert.ok(audit.some((e) => e.event === "control_released" && e.reason === "handed_back_from_chat"));
});
