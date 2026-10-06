// One framebuffer of a remote VNC server, as a PNG — no viewer required.
//
// Used for machines with no local display to grab (Tianyi's Mac): the handoff
// service is already the thing that speaks Screen Sharing, so the card picture
// comes from the same connection the takeover page uses. Raw encoding is the
// only one every server must support, so we ask for exactly that and decode it
// here; a failure returns null at the caller and the card falls back to V's
// cover, never to a broken send.
import { connectVnc, ByteReader } from "./rfb-proxy.mjs";
import { encodePng, downscaleRgba } from "./png.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_WIDTH = 1280;

// Ask for 32bpp, depth 24, little-endian true colour: one pixel is
// R<<16 | G<<8 | B, i.e. bytes B, G, R, X.
const PIXEL_FORMAT = Buffer.alloc(16);
PIXEL_FORMAT[0] = 32; // bits per pixel
PIXEL_FORMAT[1] = 24; // depth
PIXEL_FORMAT[2] = 0; // big-endian flag
PIXEL_FORMAT[3] = 1; // true-colour flag
PIXEL_FORMAT.writeUInt16BE(255, 4); // red max
PIXEL_FORMAT.writeUInt16BE(255, 6); // green max
PIXEL_FORMAT.writeUInt16BE(255, 8); // blue max
PIXEL_FORMAT[10] = 16; // red shift
PIXEL_FORMAT[11] = 8; // green shift
PIXEL_FORMAT[12] = 0; // blue shift

function setPixelFormat() {
  const out = Buffer.alloc(20);
  out[0] = 0; // message-type SetPixelFormat
  PIXEL_FORMAT.copy(out, 4);
  return out;
}

function setEncodings(encodings) {
  const out = Buffer.alloc(4 + encodings.length * 4);
  out[0] = 2; // message-type SetEncodings
  out.writeUInt16BE(encodings.length, 2);
  encodings.forEach((encoding, index) => out.writeInt32BE(encoding, 4 + index * 4));
  return out;
}

function framebufferUpdateRequest({ width, height }) {
  const out = Buffer.alloc(10);
  out[0] = 3; // message-type FramebufferUpdateRequest
  out[1] = 0; // incremental
  out.writeUInt16BE(0, 2); // x
  out.writeUInt16BE(0, 4); // y
  out.writeUInt16BE(width, 6);
  out.writeUInt16BE(height, 8);
  return out;
}

/**
 * One full-screen frame from a VNC server, as PNG bytes.
 * Throws on any protocol surprise; the caller decides the fallback.
 */
export async function captureRfbFrame({ host, port, password, timeoutMs = DEFAULT_TIMEOUT_MS, maxWidth = DEFAULT_MAX_WIDTH }) {
  const vnc = await connectVnc({ host, port, password, timeoutMs });
  const { socket, serverInit, leftover } = vnc;
  const width = serverInit.readUInt16BE(0);
  const height = serverInit.readUInt16BE(2);
  const reader = new ByteReader();
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      socket.destroy(new Error("frame capture timed out"));
    }
  }, timeoutMs);
  timer.unref?.();
  try {
    socket.on("data", (chunk) => reader.push(chunk));
    socket.on("error", (error) => reader.end(error));
    socket.on("close", () => reader.end(new Error("VNC server closed during frame capture")));
    reader.push(leftover);
    socket.write(setPixelFormat());
    socket.write(setEncodings([0])); // Raw only
    socket.write(framebufferUpdateRequest({ width, height }));
    const rgba = Buffer.alloc(width * height * 4);
    let drew = 0;
    while (drew < width * height) {
      const type = (await reader.read(1))[0];
      if (type === 0) {
        await reader.read(1); // padding
        const rects = (await reader.read(2)).readUInt16BE(0);
        if (rects === 0) {
          continue;
        }
        for (let i = 0; i < rects; i += 1) {
          const head = await reader.read(12);
          const x = head.readUInt16BE(0);
          const y = head.readUInt16BE(2);
          const w = head.readUInt16BE(4);
          const h = head.readUInt16BE(6);
          const encoding = head.readInt32BE(8);
          if (encoding !== 0) {
            throw new Error(`VNC server ignored SetEncodings (encoding ${encoding})`);
          }
          const pixels = await reader.read(w * h * 4);
          for (let row = 0; row < h; row += 1) {
            const ty = y + row;
            if (ty >= height) {
              break;
            }
            for (let col = 0; col < w; col += 1) {
              const tx = x + col;
              if (tx >= width) {
                break;
              }
              const from = (row * w + col) * 4;
              const to = (ty * width + tx) * 4;
              rgba[to] = pixels[from + 2]; // R
              rgba[to + 1] = pixels[from + 1]; // G
              rgba[to + 2] = pixels[from]; // B
              rgba[to + 3] = 255;
            }
          }
          drew += w * h;
        }
      } else if (type === 1) {
        // SetColourMapEntries: padding + first + count, then 6 bytes per entry.
        await reader.read(5);
        const colourCount = (await reader.read(2)).readUInt16BE(0);
        await reader.read(colourCount * 6);
      } else if (type === 2) {
        // Bell: no payload.
      } else if (type === 3) {
        // ServerCutText: 3 padding bytes, then a 32-bit length.
        await reader.read(3);
        const length = (await reader.read(4)).readUInt32BE(0);
        if (length > 0) {
          await reader.read(length);
        }
      } else {
        throw new Error(`unexpected RFB message type ${type} during frame capture`);
      }
    }
    settled = true;
    return encodePng(downscaleRgba({ width, height, rgba, maxWidth }));
  } finally {
    clearTimeout(timer);
    reader.end(new Error("frame capture finished"));
    socket.destroy();
  }
}
