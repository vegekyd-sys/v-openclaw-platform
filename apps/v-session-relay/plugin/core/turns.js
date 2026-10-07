// Which turns are part of an exchange, told apart without waiting for the ledger (an
// inline sessions_send has no record until the requester's tool call returns, after
// the target's turn already ran):
//   - a request turn starts from OpenClaw's inter-session envelope
//     "[Inter-session message] sourceSession=<key> ... sourceTool=sessions_send";
//   - a result turn is the core patch's `sessions-send-result:<target run>`.
// Markers are files because before_prompt_build and before_tool_call may run in a
// worker while the requester's hooks run elsewhere.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HEADER = /\[Inter-session message\]([^\n]*)/u;

/** { sourceSession, sourceTool } from a prompt that starts from another session, else null. */
export function interSessionSource(prompt) {
  const m = String(prompt ?? "").match(HEADER);
  if (!m) {
    return null;
  }
  const field = (name) => m[1].match(new RegExp(`${name}=(\\S+)`, "u"))?.[1] ?? null;
  return { sourceSession: field("sourceSession"), sourceTool: field("sourceTool") };
}

export class TurnMarkers {
  constructor(dir) {
    this.dir = dir;
  }

  file(kind, key) {
    const name = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 32);
    return path.join(this.dir, kind, `${name}.json`);
  }

  put(kind, key, value) {
    const file = this.file(kind, key);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...value, at: Date.now() }), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  get(kind, key, { maxAgeMs = 24 * 3600_000 } = {}) {
    try {
      const value = JSON.parse(fs.readFileSync(this.file(kind, key), "utf8"));
      return Date.now() - (value.at ?? 0) <= maxAgeMs ? value : null;
    } catch {
      return null;
    }
  }

  /** Most recent value of a kind matching `pred`, newer than maxAgeMs. */
  latest(kind, pred, { maxAgeMs = 30 * 60_000 } = {}) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(this.dir, kind));
    } catch {
      return null;
    }
    let best = null;
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const value = JSON.parse(fs.readFileSync(path.join(this.dir, kind, name), "utf8"));
        if (Date.now() - (value.at ?? 0) <= maxAgeMs && pred(value) && (!best || value.at > best.at)) best = value;
      } catch {
        /* torn or foreign file */
      }
    }
    return best;
  }

  prune({ maxAgeMs = 24 * 3600_000 } = {}) {
    for (const kind of ["request-turns", "sends"]) {
      let names = [];
      try {
        names = fs.readdirSync(path.join(this.dir, kind));
      } catch {
        continue;
      }
      for (const name of names) {
        const file = path.join(this.dir, kind, name);
        try {
          if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) fs.rmSync(file, { force: true });
        } catch {
          /* gone */
        }
      }
    }
  }
}
