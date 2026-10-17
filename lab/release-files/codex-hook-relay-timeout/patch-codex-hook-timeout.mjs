#!/usr/bin/env node
// Optional, separate decision: give Codex's PreToolUse relay hook a longer budget on
// OpenClaw 2026.9.1 (V). The Codex harness hardcodes `nativeHookRelay: { enabled: true }`,
// so the hook timeout is the plugin default (10 s; relay CLI --timeout 9000) and no
// config key can change it. This sets hookTimeoutSec for turns and side questions.
//
//   node patch-codex-hook-timeout.mjs --codex <.../node_modules/@openclaw/codex> --seconds 30 [--check]
//
// Still fail-closed: when the budget runs out the call is denied as before; only the
// wait before that is longer. See README.md next to this file for the measurements.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const seconds = Number(option("--seconds"));
const checkOnly = args.includes("--check");
assert(codexRoot && Number.isInteger(seconds) && seconds >= 10 && seconds <= 120, "usage: patch-codex-hook-timeout.mjs --codex <@openclaw/codex dir> --seconds <10..120> [--check]");
const MARK = "v-codex-hook-relay-timeout-v1";

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const dist = path.join(codexRoot, "dist");
const hits = fs.readdirSync(dist).filter((f) => /^harness-.*\.js$/u.test(f)).map((f) => path.join(dist, f))
  .filter((f) => fs.readFileSync(f, "utf8").includes("runCodexAppServerAttempt(params, {"));
assert.equal(hits.length, 1, `expected one harness module, found ${hits.length}`);
const file = hits[0];

const FROM = "\t\t\t\tnativeHookRelay: { enabled: true }\n";
const to = `\t\t\t\tnativeHookRelay: { enabled: true, hookTimeoutSec: ${seconds} } // ${MARK}\n`;
let src = fs.readFileSync(file, "utf8");
const stale = src.match(new RegExp(`nativeHookRelay: \\{ enabled: true, hookTimeoutSec: (\\d+) \\} // ${MARK}`, "u"));
let state;
if (stale && Number(stale[1]) === seconds && !src.includes(FROM)) state = "already";
else {
  assert(!stale, `already patched with ${stale?.[1]} s; restore the original file first`);
  assert.equal(src.split(FROM).length - 1, 2, "expected the turn and side-question anchors exactly once each");
  if (!checkOnly) fs.writeFileSync(file, src.replaceAll(FROM, to));
  state = checkOnly ? "pending" : "applied";
}
console.log(JSON.stringify({ checkOnly, file: path.basename(file), seconds, state }, null, 1));
