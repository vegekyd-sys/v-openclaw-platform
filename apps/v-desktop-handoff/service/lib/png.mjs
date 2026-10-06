// Minimal PNG encoder (8-bit RGBA, no interlace).
//
// The service runs with no image library: node's zlib is enough for a card
// picture. Kept tiny and dependency-free so the handoff host needs nothing new.
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const out = Buffer.alloc(4 + 4 + data.length + 4);
  head.copy(out, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Top-down RGBA (4 bytes per pixel) -> PNG bytes. */
export function encodePng({ width, height, rgba }) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError("encodePng needs positive integer width and height");
  }
  if (!Buffer.isBuffer(rgba) || rgba.length < width * height * 4) {
    throw new TypeError("encodePng needs an RGBA buffer of width*height*4 bytes");
  }
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Nearest-neighbour downscale so a 3440x1440 ultrawide becomes a card-sized
 * picture without an image library. Returns the input untouched when it is
 * already narrow enough.
 */
export function downscaleRgba({ width, height, rgba, maxWidth }) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || width <= maxWidth) {
    return { width, height, rgba };
  }
  const outWidth = Math.floor(maxWidth);
  const outHeight = Math.max(1, Math.round((height * outWidth) / width));
  const out = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / outWidth));
      const from = (sy * width + sx) * 4;
      const to = (y * outWidth + x) * 4;
      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, rgba: out };
}
