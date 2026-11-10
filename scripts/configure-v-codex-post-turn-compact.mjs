// Let Codex compact at the end of the turn that leaves its thread near the compaction line,
// instead of at the start of the next message (Codex's own `model_post_turn_compact_threshold_percent`).
//
// Why: on V (2026-11-10, /vds = Codex 0.159.2 + DeepSeek) a thread compacts at 900,000 tokens. A turn
// that ends just under the line (880–899k) leaves the compaction to the start of the next message:
// V re-delivers the ~75k-character OpenClaw workspace context (a new skill, the macOS node list in
// another order) and Codex re-injects its policy on resume after 30 idle minutes, which pushes the
// count over 900k, and Codex compacts before it answers. Codex sends the compaction request without
// tools, so DeepSeek's cached prefix breaks and ~750k tokens are computed cold: 18–32 s of
// "📦 正在整理上下文" before the first word, most often on the first message after a break
// (10/27–11/10: 14 of 32 DeepSeek compactions came before the turn's first output).
// With the threshold, Codex compacts right after the answer of the turn that ends at >= the
// threshold, while the reader is reading; the next message starts at ~150k.
//
// The value is a percentage of the usable window (DeepSeek on V: 1,000,000 × 95% = 950,000;
// 90 → 855,000, 45k below the 900k line, room for one re-delivered context plus the message).
// Codex also applies it to GPT threads in this CODEX_HOME (same rule, their own window).
// Validated by lab/candidate/codex-post-turn-compact-{v,post,hot}.plan.json.
//
// No Gateway restart: the Codex app-server loads config.toml whenever it starts or resumes a thread.
// A thread that is live right now keeps its loaded config until it is unloaded (30 idle minutes)
// or its app-server restarts. Usage (root):
//   node configure-v-codex-post-turn-compact.mjs check|apply|restore
// Runs on production V and on shared VLab (picked by hostname). `restore` removes the line.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const KEY = "model_post_turn_compact_threshold_percent";
export const VALUE = 90;

const LINE = new RegExp(`^\\s*${KEY}\\s*=\\s*(.*?)\\s*(#.*)?$`, "u");

/** The top-level value of KEY in a config.toml text, or undefined. Throws if it sits under a table. */
export function readSetting(text) {
  let table = false;
  for (const line of text.split("\n")) {
    if (/^\s*\[/u.test(line)) table = true;
    const m = line.match(LINE);
    if (!m) continue;
    assert(!table, `${KEY} appears under a [table]; edit by hand`);
    const n = Number(m[1]);
    assert(Number.isInteger(n), `${KEY} = ${m[1]} is not an integer; edit by hand`);
    return n;
  }
  return undefined;
}

/** config.toml text with KEY set to `value` (or removed when undefined); top-level keys go before any table. */
export function writeSetting(text, value) {
  const kept = text.split("\n").filter((line) => !LINE.test(line));
  if (value === undefined) return kept.join("\n");
  return `${KEY} = ${value}\n${kept.join("\n")}`;
}

function main() {
  const [mode = "check"] = process.argv.slice(2);
  assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
  assert.equal(process.getuid(), 0, "run as root");
  const homes = {
    "VM-8-2-ubuntu": { user: "openclaw", codexHome: "/home/openclaw/.openclaw/agents/makaron/agent/codex-home" },
    "VM-0-4-ubuntu": { user: "lab-db91-parity", codexHome: process.env.VLAB_MAKARON_CODEX_HOME },
  };
  const target = homes[os.hostname()];
  assert(target, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
  assert(target.codexHome, "shared VLab: set VLAB_MAKARON_CODEX_HOME to the Gateway's makaron codex-home");
  const [, , uid, gid] = execFileSync("getent", ["passwd", target.user], { encoding: "utf8" }).trim().split(":");
  const file = path.join(target.codexHome, "config.toml");
  assert(fs.existsSync(file), `${file} missing`);
  assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);

  const before = fs.readFileSync(file, "utf8");
  const current = readSetting(before);
  const want = mode === "apply" ? VALUE : mode === "restore" ? undefined : current;
  assert(current === undefined || current === VALUE, `${file} already sets ${KEY} = ${current}, not this script's ${VALUE}; edit by hand`);

  let change = null;
  if (mode !== "check" && current !== want) {
    const stamp = `${new Date().toISOString().replace(/[-:.]/gu, "")}-${process.pid}`;
    const backup = `${file}.bak-post-turn-compact-${stamp}`;
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    fs.chownSync(backup, Number(uid), Number(gid));
    fs.chmodSync(backup, 0o600);
    const tmp = `${file}.tmp-post-turn-compact-${process.pid}`;
    fs.writeFileSync(tmp, writeSetting(before, want), { flag: "wx", mode: 0o600 });
    fs.chownSync(tmp, Number(uid), Number(gid));
    fs.renameSync(tmp, file);
    change = { backup };
  }

  const after = fs.readFileSync(file, "utf8");
  assert.equal(readSetting(after), want, `${file} did not take the expected value`);
  console.log(JSON.stringify({
    mode, host: os.hostname(), file, key: KEY, value: readSetting(after) ?? null, change,
    takesEffect: change ? "each Codex thread the next time its app-server starts or resumes it; no Gateway restart" : null,
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
