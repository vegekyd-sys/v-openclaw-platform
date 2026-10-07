// Before a person takes over, let go of any key or mouse button V's own computer
// use left pressed. V injects input through XTEST; if one release is lost (seen on
// 2026-10-06: Alt_L stuck), every click becomes Alt+click, which the window
// manager takes as "move window", and typing opens Chrome's menu. The person's
// own VNC input cannot undo that, so the service does it on take-over.
import { execFile as nodeExecFile } from "node:child_process";

const KEYBOARD = "Virtual core XTEST keyboard";
const POINTER = "Virtual core XTEST pointer";

/** Pressed key codes / button numbers from `xinput query-state`. */
export function parsePressed(text, kind) {
  const re = kind === "key" ? /key\[(\d+)\]=down/gu : /button\[(\d+)\]=down/gu;
  return [...String(text ?? "").matchAll(re)].map((m) => Number(m[1]));
}

/** keycode -> first keysym name, from `xmodmap -pke`. */
export function parseKeymap(text) {
  const map = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const m = /^keycode\s+(\d+)\s*=\s*(\S+)/u.exec(line);
    if (m && m[2] !== "NoSymbol") {
      map.set(Number(m[1]), m[2]);
    }
  }
  return map;
}

export function createInputReset({ display = ":99", execFile = nodeExecFile, log = console } = {}) {
  const env = { ...process.env, DISPLAY: display };
  const run = (cmd, args) =>
    new Promise((resolve, reject) => {
      execFile(cmd, args, { env, timeout: 4_000 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout ?? ""))));
    });
  return {
    /** Returns what it released; never throws (a missing tool must not block a take-over). */
    async releaseStuck() {
      const released = { keys: [], buttons: [] };
      try {
        const keys = parsePressed(await run("xinput", ["query-state", KEYBOARD]), "key");
        if (keys.length) {
          const keymap = parseKeymap(await run("xmodmap", ["-pke"]));
          for (const code of keys) {
            const name = keymap.get(code);
            if (name) {
              await run("xdotool", ["keyup", name]);
              released.keys.push(name);
            }
          }
        }
        for (const button of parsePressed(await run("xinput", ["query-state", POINTER]), "button")) {
          await run("xdotool", ["mouseup", String(button)]);
          released.buttons.push(button);
        }
      } catch (error) {
        log.warn?.(`input reset skipped: ${error.message}`);
      }
      if (released.keys.length || released.buttons.length) {
        log.info?.(`released stuck input before take-over: keys=${released.keys.join(",") || "-"} buttons=${released.buttons.join(",") || "-"}`);
      }
      return released;
    },
  };
}
