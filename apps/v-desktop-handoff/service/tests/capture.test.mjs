import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { test } from "node:test";
import { captureVncPng, encodePng, scaleToRgb } from "../lib/capture.mjs";
import { createService } from "../server.mjs";
import { startFakeVnc } from "./fake-vnc.mjs";

/** {width, height, rgb} of an 8-bit RGB, filter-0 PNG (what encodePng writes). */
function decodePng(png) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = 8;
  let width;
  let height;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 2);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (width * 3 + 1)], 0);
    raw.copy(rgb, y * width * 3, y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1));
  }
  return { width, height, rgb };
}

const quadrants = (width, height) => (x, y) => (x < width / 2 ? (y < height / 2 ? [255, 0, 0] : [0, 255, 0]) : y < height / 2 ? [0, 0, 255] : [255, 255, 255]);

test("encodePng round-trips RGB pixels", () => {
  const rgb = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const png = encodePng(rgb, 2, 2);
  assert.deepEqual(decodePng(png), { width: 2, height: 2, rgb });
});

test("scaleToRgb averages blocks and swaps BGRX to RGB", () => {
  // 4x2 BGRX: left 2x2 block is pure red, right block averages blue 0 and 200
  const px = (r, g, b) => [b, g, r, 0];
  const bgrx = Buffer.from([...px(255, 0, 0), ...px(255, 0, 0), ...px(0, 0, 0), ...px(0, 0, 200), ...px(255, 0, 0), ...px(255, 0, 0), ...px(0, 0, 0), ...px(0, 0, 200)]);
  const scaled = scaleToRgb(bgrx, 4, 2, 2);
  assert.equal(scaled.width, 2);
  assert.equal(scaled.height, 1);
  assert.deepEqual([...scaled.rgb], [255, 0, 0, 0, 0, 100]);
});

test("captureVncPng asks for zlib (then raw) 32-bit frames and returns the scaled screen", async () => {
  const vnc = await startFakeVnc({ password: "pw123456", width: 40, height: 20, frame: quadrants(40, 20) });
  try {
    const shot = await captureVncPng({ host: "127.0.0.1", port: vnc.port, password: "pw123456", maxWidth: 20 });
    assert.equal(shot.sourceWidth, 40);
    assert.equal(shot.width, 20);
    assert.equal(shot.height, 10);
    const { rgb } = decodePng(shot.png);
    const at = (x, y) => [...rgb.subarray((y * 20 + x) * 3, (y * 20 + x) * 3 + 3)];
    assert.deepEqual(at(2, 2), [255, 0, 0]);
    assert.deepEqual(at(2, 8), [0, 255, 0]);
    assert.deepEqual(at(15, 2), [0, 0, 255]);
    assert.deepEqual(at(15, 8), [255, 255, 255]);
    const client = vnc.clients[0];
    assert.equal(client.shared, 1, "joins as a shared client so a live viewer is not kicked");
    assert.deepEqual(client.setEncodings, [[6, 0]], "zlib first: ~6x less data than raw on the Mac");
    const pixelFormat = client.messages.find((m) => m.type === 0).bytes.subarray(4);
    assert.deepEqual([...pixelFormat.subarray(0, 4)], [32, 24, 0, 1]);
    const request = client.messages.find((m) => m.type === 3).bytes;
    assert.equal(request[1], 0, "non-incremental");
  } finally {
    await vnc.close();
  }
});

test("a partial frame still yields a picture once the server goes quiet", async () => {
  const vnc = await startFakeVnc({ password: "pw123456", width: 8, height: 8 }); // answers with a single 1x1 rectangle
  try {
    const shot = await captureVncPng({ host: "127.0.0.1", port: vnc.port, password: "pw123456", maxWidth: 8, quietMs: 50 });
    assert.equal(shot.width, 8);
    assert.equal(decodePng(shot.png).rgb.length, 8 * 8 * 3);
  } finally {
    await vnc.close();
  }
});

test("GET /v1/capture returns a PNG for the admin token only", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-handoff-capture-"));
  const adminToken = "test-admin-token-0123456789abcdef";
  fs.writeFileSync(path.join(tmp, "admin-token"), `${adminToken}\n`);
  fs.writeFileSync(path.join(tmp, "vnc-password"), "pw123456\n");
  const vnc = await startFakeVnc({ password: "pw123456", width: 64, height: 32, frame: quadrants(64, 32) });
  const service = createService({
    bind: "127.0.0.1", publicPort: 0, adminPort: 0, publicBaseUrl: "http://x", pathPrefix: "/desktop-handoff",
    novncDir: tmp, stateDir: path.join(tmp, "state"), adminTokenFile: path.join(tmp, "admin-token"),
    vnc: { host: "127.0.0.1", port: vnc.port, passwordFile: path.join(tmp, "vnc-password") }, limits: {},
  }, { log: { error() {} } });
  const ports = await service.listen();
  try {
    const url = `http://127.0.0.1:${ports.adminPort}/v1/capture?maxWidth=32`;
    assert.equal((await fetch(url)).status, 401);
    const res = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    const { width, height } = decodePng(Buffer.from(await res.arrayBuffer()));
    assert.deepEqual([width, height], [64, 32], "maxWidth is floored at 160, so a 64-wide screen is not scaled");
  } finally {
    await service.close();
    await vnc.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
