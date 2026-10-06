// One still frame of the VNC desktop, for chat cards of machines the Gateway
// cannot screenshot locally (Tianyi's Mac): connect as a shared client, ask for
// one full raw frame in 32-bit BGRX, scale it down and return a PNG.
import zlib from "node:zlib";
import { connectVnc } from "./rfb-proxy.mjs";

// 32 bpp, depth 24, little-endian, true colour, 8 bits per channel: bytes are B,G,R,X.
const PIXEL_FORMAT = Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]);
const RAW = 0;

/** Reads exact byte counts from a socket that already finished the RFB handshake. */
function socketReader(socket, leftover) {
  let buffer = leftover?.length ? Buffer.from(leftover) : Buffer.alloc(0);
  let waiter = null;
  let failure = null;
  const flush = () => {
    if (waiter && buffer.length >= waiter.n) {
      const { n, resolve } = waiter;
      waiter = null;
      const out = buffer.subarray(0, n);
      buffer = buffer.subarray(n);
      resolve(out);
    } else if (waiter && failure) {
      const { reject } = waiter;
      waiter = null;
      reject(failure);
    }
  };
  socket.on("data", (chunk) => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    flush();
  });
  socket.on("error", (error) => {
    failure = error;
    flush();
  });
  socket.on("close", () => {
    failure ??= new Error("VNC server closed the connection");
    flush();
  });
  return {
    read: (n) =>
      new Promise((resolve, reject) => {
        waiter = { n, resolve, reject };
        flush();
      }),
    fail: (error) => {
      failure = error;
      flush();
    },
  };
}

/** Reads server messages until the whole screen arrived in raw rectangles (or the server goes quiet after a partial frame). */
async function readFrame(reader, width, height, { quietMs }) {
  const bgrx = Buffer.alloc(width * height * 4);
  let covered = 0;
  let updates = 0;
  while (covered < width * height) {
    let quietTimer;
    const next = reader.read(1);
    const type = updates > 0 ? await Promise.race([next, new Promise((resolve) => (quietTimer = setTimeout(() => resolve(null), quietMs)))]) : await next;
    clearTimeout(quietTimer);
    if (type === null) {
      break; // a partial frame is still a better card picture than none
    }
    switch (type[0]) {
      case 0: {
        const head = await reader.read(3);
        const rects = head.readUInt16BE(1);
        for (let i = 0; i < rects; i += 1) {
          const r = await reader.read(12);
          const x = r.readUInt16BE(0);
          const y = r.readUInt16BE(2);
          const w = r.readUInt16BE(4);
          const h = r.readUInt16BE(6);
          const encoding = r.readInt32BE(8);
          if (encoding !== RAW) {
            throw new Error(`VNC server sent encoding ${encoding}, only raw was requested`);
          }
          const pixels = await reader.read(w * h * 4);
          for (let row = 0; row < h && y + row < height; row += 1) {
            const cols = Math.min(w, width - x);
            if (cols <= 0) break;
            pixels.copy(bgrx, ((y + row) * width + x) * 4, row * w * 4, row * w * 4 + cols * 4);
          }
          covered += w * h;
        }
        updates += 1;
        break;
      }
      case 1: {
        const head = await reader.read(5);
        await reader.read(head.readUInt16BE(3) * 6);
        break;
      }
      case 2:
        break;
      case 3: {
        const head = await reader.read(7);
        await reader.read(head.readUInt32BE(3));
        break;
      }
      default:
        throw new Error(`unexpected VNC server message ${type[0]}`);
    }
  }
  return bgrx;
}

/** Box-filtered downscale of BGRX to RGB rows. */
export function scaleToRgb(bgrx, width, height, maxWidth) {
  const factor = Math.max(1, Math.ceil(width / maxWidth));
  const outW = Math.floor(width / factor);
  const outH = Math.floor(height / factor);
  const rgb = Buffer.alloc(outW * outH * 3);
  const area = factor * factor;
  for (let oy = 0; oy < outH; oy += 1) {
    for (let ox = 0; ox < outW; ox += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        let i = ((oy * factor + dy) * width + ox * factor) * 4;
        for (let dx = 0; dx < factor; dx += 1, i += 4) {
          b += bgrx[i];
          g += bgrx[i + 1];
          r += bgrx[i + 2];
        }
      }
      const o = (oy * outW + ox) * 3;
      rgb[o] = Math.round(r / area);
      rgb[o + 1] = Math.round(g / area);
      rgb[o + 2] = Math.round(b / area);
    }
  }
  return { rgb, width: outW, height: outH };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** 8-bit RGB PNG. */
export function encodePng(rgb, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); // filter 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PNG of the VNC desktop now, at most maxWidth pixels wide. */
export async function captureVncPng({ host, port, password, maxWidth = 1280, timeoutMs = 20_000, quietMs = 1_500, connect = connectVnc }) {
  const { socket, serverInit, leftover } = await connect({ host, port, password, timeoutMs: Math.min(timeoutMs, 10_000) });
  const reader = socketReader(socket, leftover);
  const timer = setTimeout(() => {
    reader.fail(new Error("VNC capture timed out"));
    socket.destroy();
  }, timeoutMs);
  try {
    const width = serverInit.readUInt16BE(0);
    const height = serverInit.readUInt16BE(2);
    if (!width || !height) {
      throw new Error("VNC server reported an empty screen");
    }
    const setPixelFormat = Buffer.alloc(20);
    PIXEL_FORMAT.copy(setPixelFormat, 4);
    const setEncodings = Buffer.from([2, 0, 0, 1, 0, 0, 0, RAW]);
    const request = Buffer.alloc(10);
    request[0] = 3; // FramebufferUpdateRequest, non-incremental
    request.writeUInt16BE(width, 6);
    request.writeUInt16BE(height, 8);
    socket.write(Buffer.concat([setPixelFormat, setEncodings, request]));
    const bgrx = await readFrame(reader, width, height, { quietMs });
    const scaled = scaleToRgb(bgrx, width, height, maxWidth);
    return { png: encodePng(scaled.rgb, scaled.width, scaled.height), width: scaled.width, height: scaled.height, sourceWidth: width, sourceHeight: height };
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}
