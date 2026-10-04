// Phone layout for the handoff desktop: while a phone holds control, the X
// screen is resized to a portrait size so pages lay out for a narrow screen,
// and the open windows are maximised to fill it. Everything is put back when
// that phone stops being the controller. The service enforces this from the
// registry state (see syncLayout in server.mjs); the page only asks.
import { execFile as nodeExecFile } from "node:child_process";

const MIN_SIDE = 320;
const MAX_SIDE = 1920;
// Chrome will not make a window narrower than about 510 px, and the window
// manager refuses to maximise a window that cannot fit. Narrower requests are
// scaled up keeping the phone's aspect ratio.
const MIN_WIDTH = 528;

function runner(execFile) {
  return (cmd, args, env) =>
    new Promise((resolve, reject) => {
      execFile(cmd, args, { env, timeout: 8_000 }, (error, stdout, stderr) => {
        if (error) {
          error.stderr = String(stderr ?? "");
          reject(error);
          return;
        }
        resolve(String(stdout ?? ""));
      });
    });
}

/** Rounds a requested size to what the desktop accepts (multiples of 8, bounded). */
export function normalizeSize(width, height) {
  let w0 = Number(width);
  let h0 = Number(height);
  if (w0 > 0 && h0 > 0 && w0 < MIN_WIDTH) {
    h0 = (h0 * MIN_WIDTH) / w0;
    w0 = MIN_WIDTH;
  }
  const fit = (value) => {
    const n = Math.round(Number(value) / 8) * 8;
    return Number.isFinite(n) ? Math.min(MAX_SIDE, Math.max(MIN_SIDE, n)) : null;
  };
  const w = fit(w0);
  const h = fit(h0);
  return w && h ? { width: w, height: h } : null;
}

export function parseGeometry(text) {
  const m = /^(\d+)x(\d+)$/u.exec(String(text ?? "").trim());
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** First connected output and the current screen size from `xrandr` output. */
export function parseXrandr(text) {
  const screen = /current (\d+) x (\d+)/u.exec(text);
  const output = /^(\S+) connected/mu.exec(text);
  return {
    output: output ? output[1] : null,
    current: screen ? { width: Number(screen[1]), height: Number(screen[2]) } : null,
  };
}

/** Managed windows that live on a workspace (skips the desktop and panels, which are sticky: -1). */
export function parseWmctrl(text) {
  const windows = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s/iu.exec(line);
    if (!m || m[2] === "-1") {
      continue;
    }
    windows.push({ id: m[1], x: Number(m[3]), y: Number(m[4]), width: Number(m[5]), height: Number(m[6]) });
  }
  return windows;
}

export function createDisplayLayout({ display = ":99", base = "1280x800", execFile = nodeExecFile, log = console, settleMs = 300 } = {}) {
  const settle = () => new Promise((resolve) => setTimeout(resolve, settleMs));
  const run = runner(execFile);
  const env = { ...process.env, DISPLAY: display };
  const baseSize = parseGeometry(base);
  if (!baseSize) {
    throw new Error(`layout.base must look like 1280x800, got ${base}`);
  }
  let state = { mode: "desktop", owner: null, size: baseSize, windows: [] };
  let queue = Promise.resolve();
  const serial = (fn) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  async function xrandr() {
    return parseXrandr(await run("xrandr", [], env));
  }

  async function setScreen(size) {
    const { output } = await xrandr();
    if (!output) {
      throw new Error("no connected output");
    }
    const standard = size.width === baseSize.width && size.height === baseSize.height;
    const name = standard ? `${size.width}x${size.height}` : `v-phone-${size.width}x${size.height}`;
    if (!standard) {
      // Xvnc ignores the timings; they only have to be well formed.
      const { width: w, height: h } = size;
      await run("xrandr", ["--newmode", name, "60", `${w}`, `${w + 8}`, `${w + 16}`, `${w + 24}`, `${h}`, `${h + 1}`, `${h + 2}`, `${h + 3}`], env).catch(() => {});
      await run("xrandr", ["--addmode", output, name], env).catch(() => {});
    }
    await run("xrandr", ["--output", output, "--mode", name], env);
  }

  async function listWindows() {
    try {
      return parseWmctrl(await run("wmctrl", ["-lG"], env));
    } catch (error) {
      log.warn?.(`wmctrl unavailable, windows keep their size: ${error.message}`);
      return null;
    }
  }

  async function maximize(windows) {
    for (const win of windows) {
      await run("wmctrl", ["-i", "-r", win.id, "-b", "add,maximized_vert,maximized_horz"], env).catch(() => {});
    }
  }

  async function restoreWindows(windows) {
    const place = async () => {
      for (const win of windows) {
        await run("wmctrl", ["-i", "-r", win.id, "-b", "remove,maximized_vert,maximized_horz"], env).catch(() => {});
        await run("wmctrl", ["-i", "-r", win.id, "-e", `0,${win.x},${win.y},${win.width},${win.height}`], env).catch(() => {});
      }
    };
    await place();
    // The window manager refits windows to a new screen size on its own schedule and
    // can undo the placement; check once more and put them back if it did.
    await settle();
    const now = (await listWindows()) ?? [];
    const moved = windows.some((win) => {
      const cur = now.find((w) => w.id === win.id);
      return cur && (Math.abs(cur.width - win.width) > 4 || Math.abs(cur.height - win.height) > 4);
    });
    if (moved) {
      await place();
    }
  }

  return {
    get state() {
      return { mode: state.mode, owner: state.owner, width: state.size.width, height: state.size.height };
    },
    /** Portrait (or any phone) size for `owner`; windows are remembered and maximised. */
    phone(owner, width, height) {
      return serial(async () => {
        const size = normalizeSize(width, height);
        if (!size) {
          throw new Error("bad size");
        }
        const windows = state.mode === "desktop" ? (await listWindows()) ?? [] : state.windows;
        await setScreen(size);
        await settle(); // let the window manager see the new screen before maximising
        await maximize(windows);
        state = { mode: "phone", owner, size, windows };
        log.info?.(`layout phone ${size.width}x${size.height}`);
        return this.state;
      });
    },
    /** Back to the base size and the windows' previous places. Safe to call any time. */
    restore(reason = "restore") {
      return serial(async () => {
        if (state.mode === "desktop") {
          return this.state;
        }
        const { windows } = state;
        await setScreen(baseSize);
        await settle();
        await restoreWindows(windows);
        state = { mode: "desktop", owner: null, size: baseSize, windows: [] };
        log.info?.(`layout desktop ${baseSize.width}x${baseSize.height} (${reason})`);
        return this.state;
      });
    },
    /** At start: a crash may have left the phone size behind. */
    recover() {
      return serial(async () => {
        const { current } = await xrandr();
        if (current && (current.width !== baseSize.width || current.height !== baseSize.height)) {
          await setScreen(baseSize);
          log.info?.(`layout recovered ${current.width}x${current.height} -> ${base}`);
        }
        return this.state;
      });
    },
  };
}
