// Cap the window Claude Code auto-compacts against under the claude-cli harness (/vcc).
//
// Why: OpenClaw injects CLAUDE_CODE_AUTO_COMPACT_WINDOW=<model window> into every claude it
// spawns, which for the Claude 5 models is their full 1M. Claude Code then compacts only
// at ~967k (window minus a 33k buffer), about 3% below the hard limit. On V (2026-10-11 12:30 CST) one /vcc session
// resumed for eight days reached 976k tokens; the next call was "Prompt is too long" and
// the reactive compaction could not fit either ("automatic compaction failed: Request
// size exceeds model context window"). Every call in that session also re-read ~950k
// cached tokens.
//
// Fix: an `env` block in the Gateway user's ~/.claude/settings.json. OpenClaw always runs
// claude with --setting-sources user, and a user-settings env value overrides the one
// OpenClaw injects; Claude Code still clamps it to the model window, so runs on a 200k
// window keep 200k. 900k (Tianyi, 2026-10-11: use as much of 1M as is safe) compacts at
// ~867k and keeps ~130k tokens below the limit for the last tool round and for the
// compaction request itself (on V a compaction at 980k still fit). The model window
// stays 1M.
// Validated by lab/candidate/vcc-compact-window{,-baseline,-precedence}.plan.json.
//
// Why not models.providers.anthropic.models[].contextTokens (OpenClaw's own cap): on 9.1
// claude-opus-5-5 is not in the static catalog but generated from the Opus 5 template, and
// a configured row of that id replaces the generated entry (contextWindow, reasoning,
// thinkingLevels disappear from models.list).
//
// No Gateway restart: each claude process reads the setting when it starts (an idle warm
// process is recycled after 10 min). Usage (root):
//   node configure-v-claude-code-compact-window.mjs check|apply|restore
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [mode = "check"] = process.argv.slice(2);
assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
assert.equal(process.getuid(), 0, "run as root");

const KEY = "CLAUDE_CODE_AUTO_COMPACT_WINDOW";
const VALUE = "900000";
const users = { "VM-8-2-ubuntu": "openclaw", "VM-0-4-ubuntu": "lab-db91-parity" };
const user = users[os.hostname()];
assert(user, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
const [, , uid, gid, , home] = execFileSync("getent", ["passwd", user], { encoding: "utf8" }).trim().split(":");
const dir = path.join(home, ".claude");
const file = path.join(dir, "settings.json");
assert(fs.statSync(dir).isDirectory(), `${dir} missing: is Claude Code logged in for ${user}?`);
if (fs.existsSync(file)) assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);

const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
const before = read();
const current = before?.env?.[KEY];
const want = mode === "apply" ? VALUE : mode === "restore" ? undefined : current;
assert(current === undefined || current === VALUE, `${file} sets ${KEY}=${current}, not written by this script; edit by hand`);

let change = null;
if (mode !== "check" && current !== want) {
  const next = structuredClone(before ?? {});
  if (want === undefined) {
    delete next.env[KEY];
    if (Object.keys(next.env).length === 0) delete next.env;
  } else {
    next.env = { ...(next.env ?? {}), [KEY]: want };
  }
  const stamp = `${new Date().toISOString().replace(/[-:.]/gu, "")}-${process.pid}`;
  let backup = null;
  if (before !== null) {
    backup = `${file}.bak-compact-window-${stamp}`;
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    fs.chownSync(backup, Number(uid), Number(gid));
  }
  if (Object.keys(next).length === 0) {
    fs.rmSync(file);
  } else {
    const tmp = `${file}.tmp-compact-window-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fs.chownSync(tmp, Number(uid), Number(gid));
    fs.renameSync(tmp, file);
  }
  change = { backup, removedFile: Object.keys(next).length === 0 };
}

const after = read();
assert.equal(after?.env?.[KEY], want, `${file} did not take the expected value`);
console.log(JSON.stringify({
  mode, host: os.hostname(), user, file, key: KEY,
  value: after?.env?.[KEY] ?? null, settingsKeys: after ? Object.keys(after) : null, change,
  takesEffect: change ? "each claude process on its next start; no Gateway restart" : null,
}, null, 1));
