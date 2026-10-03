// Payment QR codes on V's screen (Alipay / WeChat checkout): find one, and render
// a clean, large copy for the Feishu card. A QR shrunk inside a desktop
// screenshot is usually too small to scan; decoding it and re-encoding the same
// payload gives a crisp image that any phone can scan.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let jsQR;
const decoder = () => {
  if (!jsQR) {
    const mod = require("../vendor/jsQR.cjs");
    jsQR = mod.default ?? mod;
  }
  return jsQR;
};

/** One RGBA frame of the X display, or null. */
export function captureDesktopRgba({ display = ":99", ffmpeg = "ffmpeg", timeoutMs = 8_000, runner = execFile } = {}) {
  return new Promise((resolve) => {
    runner(
      ffmpeg,
      ["-hide_banner", "-f", "x11grab", "-i", display, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
      { encoding: "buffer", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const size = String(stderr ?? "").match(/Video: rawvideo[^\n]*?, (\d{2,5})x(\d{2,5})/u) ?? String(stderr ?? "").match(/, (\d{2,5})x(\d{2,5})[, ]/u);
        if (error || !size || !stdout?.length) {
          resolve(null);
          return;
        }
        const width = Number(size[1]);
        const height = Number(size[2]);
        resolve(stdout.length >= width * height * 4 ? { data: new Uint8ClampedArray(stdout.buffer, stdout.byteOffset, width * height * 4), width, height } : null);
      },
    );
  });
}

/** The QR code payload on this frame, or null. */
export function findQr(frame) {
  if (!frame) {
    return null;
  }
  const found = decoder()(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
  return found?.data ? { data: found.data, location: found.location } : null;
}

/** A large PNG of the same payload (null when the encoder is unavailable). */
export async function renderQrPng(text, { width = 640 } = {}) {
  try {
    const mod = await import("qrcode");
    const qrcode = mod.default ?? mod;
    return await qrcode.toBuffer(text, { type: "png", width, margin: 2, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
