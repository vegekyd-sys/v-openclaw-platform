import assert from "node:assert/strict";
import net from "node:net";
import zlib from "node:zlib";
import { test } from "node:test";
import { captureRfbFrame } from "../lib/rfb-capture.mjs";
import { encodePng, downscaleRgba } from "../lib/png.mjs";
import { vncAuthResponse } from "../lib/vnc-auth.mjs";
import { createService } from "../server.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** macOS-style Screen Sharing that answers one full Raw framebuffer update. */
function fakeScreenSharing({ password, width, height, fill, extra = null, encoding = 0 }) {
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let stage = 0;
    const challenge = Buffer.alloc(16, 3);
    const pixel = Buffer.alloc(4);
    pixel[0] = fill.b;
    pixel[1] = fill.g;
    pixel[2] = fill.r;
    pixel[3] = 0;
    socket.write("RFB 003.889\n");
    socket.on("data", (data) => {
      buf = Buffer.concat([buf, data]);
      if (stage === 0 && buf.length >= 12) {
        buf = buf.subarray(12);
        stage = 1;
        socket.write(Buffer.from([3, 30, 35, 2])); // Apple types + VncAuth
      }
      if (stage === 1 && buf.length >= 1) {
        buf = buf.subarray(1);
        stage = 2;
        socket.write(challenge);
      }
      if (stage === 2 && buf.length >= 16) {
        assert.equal(buf.subarray(0, 16).equals(vncAuthResponse(password, challenge)), true, "VncAuth answer");
        buf = buf.subarray(16);
        stage = 3;
        socket.write(Buffer.from([0, 0, 0, 0]));
      }
      if (stage === 3 && buf.length >= 1) {
        buf = buf.subarray(1); // ClientInit
        stage = 4;
        const head = Buffer.alloc(24);
        head.writeUInt16BE(width, 0);
        head.writeUInt16BE(height, 2);
        const name = Buffer.from("MacBook Pro");
        head.writeUInt32BE(name.length, 20);
        socket.write(Buffer.concat([head, name]));
      }
      // Collect client messages until a FramebufferUpdateRequest (type 3) arrives.
      while (stage >= 4 && buf.length >= 1) {
        const type = buf[0];
        if (type === 0) {
          // SetPixelFormat: 20 bytes; must be 32bpp little-endian true colour.
          if (buf.length < 20) return;
          assert.equal(buf[4], 32, "bits per pixel");
          assert.equal(buf[7], 1, "true-colour flag");
          assert.equal(buf[14], 16, "red shift");
          buf = buf.subarray(20);
        } else if (type === 2) {
          if (buf.length < 4) return;
          const count = buf.readUInt16BE(2);
          if (buf.length < 4 + count * 4) return;
          assert.deepEqual(
            Array.from({ length: count }, (_, i) => buf.readInt32BE(4 + i * 4)),
            [0],
            "only Raw is requested",
          );
          buf = buf.subarray(4 + count * 4);
        } else if (type === 3) {
          if (buf.length < 10) return;
          buf = buf.subarray(10);
          stage = 5;
          const rects = [extra, { x: 0, y: 0, w: width, h: height, encoding }].filter(Boolean);
          const head = Buffer.alloc(4);
          head[0] = 0;
          head.writeUInt16BE(rects.length, 2);
          socket.write(head);
          for (const rect of rects) {
            const rhead = Buffer.alloc(12);
            rhead.writeUInt16BE(rect.x, 0);
            rhead.writeUInt16BE(rect.y, 2);
            rhead.writeUInt16BE(rect.w, 4);
            rhead.writeUInt16BE(rect.h, 6);
            rhead.writeInt32BE(rect.encoding, 8);
            const body = Buffer.alloc(rect.w * rect.h * 4, 0);
            if (rect.encoding === 0) {
              for (let i = 0; i < rect.w * rect.h; i += 1) {
                pixel.copy(body, i * 4);
              }
            }
            socket.write(Buffer.concat([rhead, body]));
          }
        } else {
          return; // unknown client message: stop parsing
        }
      }
    });
  });
  return server;
}

function decodePng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "bit depth");
      assert.equal(data[9], 6, "colour type RGBA");
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (stride + 1)], 0, "row filter none");
    raw.copy(rgba, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { width, height, rgba };
}

function pixelAt(frame, x, y) {
  const at = (y * frame.width + x) * 4;
  return { r: frame.rgba[at], g: frame.rgba[at + 1], b: frame.rgba[at + 2] };
}

test("captures one Raw frame and returns it as PNG in the asked pixel format", async () => {
  const server = fakeScreenSharing({ password: "t3stPw9z", width: 8, height: 4, fill: { r: 10, g: 200, b: 30 } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const png = await captureRfbFrame({ host: "127.0.0.1", port, password: "t3stPw9z", maxWidth: 64 });
    const frame = decodePng(png);
    assert.deepEqual({ width: frame.width, height: frame.height }, { width: 8, height: 4 });
    assert.deepEqual(pixelAt(frame, 0, 0), { r: 10, g: 200, b: 30 });
    assert.deepEqual(pixelAt(frame, 7, 3), { r: 10, g: 200, b: 30 });
  } finally {
    server.close();
  }
});

test("downscales an ultrawide frame to the card width", async () => {
  const server = fakeScreenSharing({ password: "t3stPw9z", width: 100, height: 50, fill: { r: 1, g: 2, b: 3 } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const png = await captureRfbFrame({ host: "127.0.0.1", port, password: "t3stPw9z", maxWidth: 20 });
    const frame = decodePng(png);
    assert.equal(frame.width, 20);
    assert.equal(frame.height, 10);
    assert.deepEqual(pixelAt(frame, 19, 9), { r: 1, g: 2, b: 3 });
  } finally {
    server.close();
  }
});

test("a non-Raw rectangle fails instead of guessing the encoding", async () => {
  const server = fakeScreenSharing({ password: "t3stPw9z", width: 4, height: 4, fill: { r: 0, g: 0, b: 0 }, encoding: 2 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    await assert.rejects(
      captureRfbFrame({ host: "127.0.0.1", port, password: "t3stPw9z" }),
      /ignored SetEncodings/u,
    );
  } finally {
    server.close();
  }
});

test("a server that never answers the update request times out", async () => {
  const server = net.createServer((socket) => {
    socket.write("RFB 003.008\n"); // stays silent afterwards
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    await assert.rejects(captureRfbFrame({ host: "127.0.0.1", port, password: "x", timeoutMs: 500 }));
  } finally {
    server.close();
  }
});

test("the admin capture endpoint serves the frame as image/png", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v-handoff-capture-"));
  const tokenFile = path.join(dir, "admin-token");
  fs.writeFileSync(tokenFile, "a".repeat(24), { mode: 0o600 });
  const png = encodePng({ width: 2, height: 1, rgba: Buffer.from([9, 8, 7, 255, 1, 2, 3, 255]) });
  const service = createService(
    {
      stateDir: dir,
      adminTokenFile: tokenFile,
      publicPort: 0,
      adminPort: 0,
      vnc: { host: "127.0.0.1", port: 1, password: "x" },
      layout: { enabled: false },
    },
    { captureFrame: async () => png },
  );
  const ports = await service.listen();
  try {
    const unauthorized = await fetch(`http://127.0.0.1:${ports.adminPort}/v1/capture`);
    assert.equal(unauthorized.status, 401);
    const res = await fetch(`http://127.0.0.1:${ports.adminPort}/v1/capture`, {
      headers: { authorization: `Bearer ${"a".repeat(24)}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await res.arrayBuffer()).equals(png), true);
  } finally {
    await service.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("downscaleRgba keeps a narrow frame untouched", () => {
  const rgba = Buffer.alloc(4 * 4, 255);
  const out = downscaleRgba({ width: 2, height: 2, rgba, maxWidth: 1280 });
  assert.equal(out.rgba, rgba);
  assert.deepEqual({ width: out.width, height: out.height }, { width: 2, height: 2 });
});
