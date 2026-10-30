// First screen of the widget for the card, rendered by headless Chrome from the loopback
// copy of the frame URL. Same sandbox header and CSP as a viewer gets; no network, no profile.
// Best effort: a card without a picture still opens the widget.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function captureWidget({ chromePath = "google-chrome", url, width = 720, height = 520, timeoutMs = 15_000, runner = execFile }) {
  return new Promise((resolve) => {
    // Not os.tmpdir(): Chrome's profile socket fails past 108 bytes, and a service's TMPDIR can be long.
    const dir = fs.mkdtempSync("/tmp/v-widget-");
    const out = path.join(dir, "shot.png");
    const done = (bytes) => { fs.rmSync(dir, { recursive: true, force: true }); resolve(bytes); };
    runner(chromePath, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--mute-audio",
      "--no-sandbox", `--user-data-dir=${path.join(dir, "p")}`, `--window-size=${width},${height}`, "--virtual-time-budget=2000",
      `--screenshot=${out}`, url,
    ], { timeout: timeoutMs, env: { ...process.env, TMPDIR: dir } }, () => {
      try { done(fs.readFileSync(out)); } catch { done(null); }
    });
  });
}
