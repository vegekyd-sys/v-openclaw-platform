// Stop Codex from listing its own skills in /vds (and every other Codex-runtime) threads of makaron;
// OpenClaw's skills list stays and remains the only one.
//
// Why: on V a new Feishu /vds thread carried three skills lists (docs/experiments/vds-prompt-dedup-20261120.md):
// OpenClaw's (inside <openclaw_workspace_context>, 376 skills, ~20k tokens) and Codex's own
// <skills_instructions> twice (thread start ~17.6k tokens, first turn ~20.0k tokens). The OpenClaw plugin
// already turns Codex's listing off (skills.include_instructions = false, "native skill isolation"),
// but only when OPENCLAW_STATE_DIR is a non-default directory; V runs on the default ~/.openclaw, so
// the listing stayed on there (and never shows in VLab or candidates, which use other state dirs).
// In 7 days of V rollouts (5108 threads) no SKILL.md that only Codex's listing names was read; every
// skill read was under a root OpenClaw's list covers. The key only drops the listing: skills stay
// enabled, so explicit skill inputs (skills/list) still resolve.
//
// Takes effect for threads started after the write: Codex app-server reads config.toml at
// thread/start (candidate-verified, no Gateway restart). Existing threads keep the lists already in
// their history until they are replaced or compacted.
//
// Usage (root): node configure-v-codex-native-skills.mjs check|apply|restore
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";

const KEY = "include_instructions";
const TABLE = "[skills]";
const isHeader = (line) => /^\s*\[/u.test(line);
const isTable = (line) => line.trim() === TABLE;
const keyRe = new RegExp(`^\\s*${KEY}\\s*=`, "u");
const dottedRe = new RegExp(`^\\s*skills\\.${KEY}\\s*=`, "u");

/** Current value of skills.include_instructions: true, false, or undefined (unset: Codex lists skills). */
export function includeInstructionsOf(text) {
  let inSkills = false;
  let inRoot = true;
  for (const line of text.split("\n")) {
    if (isHeader(line)) { inSkills = isTable(line); inRoot = false; continue; }
    const m = (inSkills && keyRe.test(line)) || (inRoot && dottedRe.test(line)) ? line.split("=")[1].replace(/#.*/u, "").trim() : null;
    if (m === "true") return true;
    if (m === "false") return false;
  }
  return undefined;
}

/**
 * Returns the text with skills.include_instructions = false (want false) or without it (want undefined).
 * Only the one key line (and a [skills] table left empty by restore) changes; the rest is kept byte for byte.
 */
export function setIncludeInstructions(text, want) {
  assert(want === false || want === undefined, "want is false or undefined");
  const lines = text.split("\n");
  let inSkills = false;
  let inRoot = true;
  let tableAt = -1;
  const keyLines = [];
  for (const [i, line] of lines.entries()) {
    if (isHeader(line)) { inSkills = isTable(line); inRoot = false; if (inSkills) { assert.equal(tableAt, -1, "[skills] is defined twice"); tableAt = i; } continue; }
    if ((inSkills && keyRe.test(line)) || (inRoot && dottedRe.test(line))) keyLines.push(i);
  }
  assert(keyLines.length <= 1, "skills.include_instructions is set more than once");
  if (want === false) {
    if (keyLines.length) {
      const i = keyLines[0];
      lines[i] = dottedRe.test(lines[i]) ? `skills.${KEY} = false` : `${KEY} = false`;
      return lines.join("\n");
    }
    if (tableAt >= 0) { lines.splice(tableAt + 1, 0, `${KEY} = false`); return lines.join("\n"); }
    const body = text.endsWith("\n") || text === "" ? text : `${text}\n`;
    return `${body}${body.trim() ? "\n" : ""}${TABLE}\n${KEY} = false\n`;
  }
  if (!keyLines.length) return text;
  lines.splice(keyLines[0], 1);
  // drop a [skills] table that is now empty (only blank lines until the next header or the end)
  if (tableAt >= 0) {
    let end = tableAt + 1;
    while (end < lines.length && !isHeader(lines[end])) end += 1;
    if (lines.slice(tableAt + 1, end).every((l) => !l.trim())) {
      let start = tableAt;
      while (start > 0 && !lines[start - 1].trim()) start -= 1; // the blank line apply put before it
      lines.splice(start, end - start, ...(end < lines.length && start > 0 ? [""] : []));
      if (end >= lines.length && lines.length && lines.at(-1) !== "") lines.push("");
    }
  }
  return lines.join("\n");
}

const targets = {
  "VM-8-2-ubuntu": "/home/openclaw/.openclaw/agents/makaron/agent/codex-home/config.toml",
  // Shared VLab runs on a non-default state dir, so the plugin's isolation already hides Codex's
  // listing there; the file is kept in step with V anyway.
  "VM-0-4-ubuntu": "/srv/vlab-production-mirror/labs/instances/db91-parity/state/agents/makaron/agent/codex-home/config.toml",
};

function main() {
  const [mode = "check"] = process.argv.slice(2);
  assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
  assert.equal(process.getuid(), 0, "run as root");
  const file = targets[os.hostname()];
  assert(file, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
  assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
  const raw = fs.readFileSync(file, "utf8");
  const before = includeInstructionsOf(raw);
  const want = mode === "restore" ? undefined : false;
  const change = {};
  if (mode !== "check" && before !== want) {
    const next = setIncludeInstructions(raw, want);
    assert.equal(includeInstructionsOf(next), want, "edit did not take");
    const stat = fs.statSync(file);
    const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
    const backup = `${file}.bak-native-skills-${stamp}`;
    fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
    fs.chownSync(backup, stat.uid, stat.gid);
    const tmp = `${file}.tmp-native-skills-${process.pid}`;
    fs.writeFileSync(tmp, next, { flag: "wx", mode: stat.mode & 0o777 });
    fs.chownSync(tmp, stat.uid, stat.gid);
    fs.renameSync(tmp, file);
    Object.assign(change, { backup, from: before ?? null, to: want ?? null });
  }
  const after = includeInstructionsOf(fs.readFileSync(file, "utf8"));
  if (mode !== "check") assert.equal(after, want, `${file} does not have the expected value`);
  console.log(JSON.stringify({
    mode, host: os.hostname(), file, includeInstructions: after ?? null, change,
    restartRequired: false,
    note: "applies to Codex threads started after the write; existing threads keep the lists in their history",
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
