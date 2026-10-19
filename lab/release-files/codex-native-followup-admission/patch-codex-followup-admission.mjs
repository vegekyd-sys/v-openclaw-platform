#!/usr/bin/env node
// Codex native subagents on OpenClaw 2026.9.1 (V): a child that its parent sends
// more work to (followup_task / send_input / resume_agent, or a multi-agent V2
// "interacted" activity) must be admitted to the parent turn's native hook relay
// again, the same way it was admitted when it was spawned.
//
//   node patch-codex-followup-admission.mjs --codex <.../node_modules/@openclaw/codex> [--check]
//
// Production V 2026-10-17 21:11 CST (Memory Librarian cron, /vcodex): every hooked
// tool call in a child's follow-up turn was blocked with "Native hook relay timed
// out" after 9.4 s. The child's direct claim on the parent relay is released when
// its first turn completes; nothing claims it again for the follow-up turn, so
// core's awaitForegroundAdmission (no timeout of its own) waits until the relay
// CLI's 9 s deadline. The child's tools still run through the parent turn's
// before_tool_call policy once admitted; this only restores admission.
//
// Idempotent: every anchor must match exactly once, or its replacement must already
// be present. Written against @openclaw/codex@2026.9.1 as installed on V
// (native-subagent-monitor-CnH147jH.js sha256 33bde1f3…). See README.md next to this file.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const checkOnly = args.includes("--check");
assert(codexRoot, "usage: patch-codex-followup-admission.mjs --codex <@openclaw/codex dir> [--check]");
const MARK = "v-codex-native-followup-admission-v1";

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const dist = path.join(codexRoot, "dist");
const file = moduleIn(dist, /^native-subagent-monitor-.*\.js$/u, "registerChildThread(state, childThreadIdInput, options = {}) {");

const PATCHES = [
  // 1. Multi-agent V2: the parent's follow-up shows up as a subAgentActivity item of
  //    kind "interacted" on the parent thread.
  ["\t\t\t\t\treturn state;\n\t\t\t\t}\n\t\t\t\tconst isCompletedSpawnAgentTool = ",
    "\t\t\t\t\treturn state;\n\t\t\t\t}\n"
    + `\t\t\t\t// ${MARK}: a follow-up from the parent's current turn admits the child again.\n`
    + "\t\t\t\tif (notification.method === \"item/completed\" && readStringField(item, \"type\") === \"subAgentActivity\" && normalizeIdentifier(readStringField(item, \"kind\")) === \"interacted\") {\n"
    + "\t\t\t\t\tconst childThreadId = readStringField(item, \"agentThreadId\")?.trim();\n"
    + "\t\t\t\t\tif (childThreadId) this.readmitFollowupChild(state, childThreadId, owner);\n"
    + "\t\t\t\t\treturn state;\n"
    + "\t\t\t\t}\n"
    + "\t\t\t\tconst isCompletedSpawnAgentTool = "],
  // 2. Multi-agent V1: followupTask / sendInput / resumeAgent collab tool calls.
  ["\t\t\t\t}, owner) : this.registerChildThread(state, childThreadId)) && accepted;\n\t\t\t\tif (!accepted) return;\n",
    "\t\t\t\t}, owner) : this.registerChildThread(state, childThreadId)) && accepted;\n"
    + `\t\t\t\tif (notification.method === "item/completed" && readStringField(item, "type") === "collabAgentToolCall" && CODEX_FOLLOWUP_COLLAB_TOOLS.has(normalizeIdentifier(readStringField(item, "tool"))) && normalizeIdentifier(readStringField(item, "status")) === "completed") for (const childThreadId of childThreadIds) this.readmitFollowupChild(state, childThreadId, owner); // ${MARK}\n`
    + "\t\t\t\tif (!accepted) return;\n"],
  // 3. The admission itself: only a child this monitor registered under this parent,
  //    only for the owner of the parent's current turn. A child whose state is still
  //    live is claimed like a spawn and released on its next turn completion. A child
  //    whose previous result is still being delivered keeps that state untouched; it
  //    gets a claim for this follow-up turn only, released on its next turn/completed.
  ["\tregisterChildThread(state, childThreadIdInput, options = {}) {\n",
    `\t// ${MARK}\n`
    + "\treadmitFollowupChild(state, childThreadIdInput, owner) {\n"
    + "\t\tconst childThreadId = childThreadIdInput.trim();\n"
    + "\t\tif (!childThreadId || !owner?.claimDirectChild || this.disposed) return;\n"
    + "\t\tconst existing = this.childStates.get(childThreadId);\n"
    + "\t\tconst revision = this.threadStatusRevisions.get(childThreadId);\n"
    + "\t\tif ((existing ? existing.parentThreadId : revision?.parentThreadId) !== state.parentThreadId) return;\n"
    + "\t\tif (existing?.releaseDirectChild || this.followupDirectClaims?.has(childThreadId)) return;\n"
    + "\t\tlet admission;\n"
    + "\t\tif (existing?.terminal) {\n"
    + "\t\t\t(this.followupDirectClaims ??= /* @__PURE__ */ new Map()).set(childThreadId, owner.claimDirectChild(childThreadId));\n"
    + "\t\t\tadmission = \"turn-scoped\";\n"
    + "\t\t} else {\n"
    + "\t\t\tif (existing) existing.settledWithoutCompletion = false;\n"
    + "\t\t\tif (revision?.terminal) revision.terminal = false;\n"
    + "\t\t\tif (this.registerChildThread(state, childThreadId, { claimDirectChild: owner.claimDirectChild })?.releaseDirectChild) admission = \"child-state\";\n"
    + "\t\t}\n"
    + "\t\tif (admission) embeddedAgentLog.info(\"Codex native subagent follow-up admitted to the parent relay\", { childThreadId, parentThreadId: state.parentThreadId, admission });\n"
    + "\t}\n"
    + "\tregisterChildThread(state, childThreadIdInput, options = {}) {\n"],
  // 4. Release a turn-scoped follow-up claim when that child turn ends, before any
  //    early return for children the monitor no longer tracks.
  ["\t\tconst threadId = readStringField(params, \"threadId\")?.trim() ?? readStringField(startedThread, \"id\")?.trim();\n",
    "\t\tconst threadId = readStringField(params, \"threadId\")?.trim() ?? readStringField(startedThread, \"id\")?.trim();\n"
    + `\t\tif (notification.method === "turn/completed" && threadId && this.followupDirectClaims?.has(threadId)) { // ${MARK}\n`
    + "\t\t\tconst releaseFollowupClaim = this.followupDirectClaims.get(threadId);\n"
    + "\t\t\tthis.followupDirectClaims.delete(threadId);\n"
    + "\t\t\treleaseFollowupClaim?.();\n"
    + "\t\t}\n"],
  ["function normalizeIdentifier(value) {\n",
    `const CODEX_FOLLOWUP_COLLAB_TOOLS = new Set(["followuptask", "sendinput", "resumeagent"]); // ${MARK}\n`
    + "function normalizeIdentifier(value) {\n"],
];

const report = [];
let src = fs.readFileSync(file, "utf8");
for (const [from, to] of PATCHES) {
  if (src.includes(to)) { report.push({ anchor: from.slice(0, 40), state: "already" }); continue; }
  assert.equal(src.split(from).length - 1, 1, `anchor must match exactly once in ${path.basename(file)}: ${JSON.stringify(from.slice(0, 80))}`);
  if (!checkOnly) src = src.replace(from, to);
  report.push({ anchor: from.slice(0, 40), state: checkOnly ? "pending" : "applied" });
}
if (!checkOnly) fs.writeFileSync(file, src);
console.log(JSON.stringify({ checkOnly, file: path.basename(file), report }, null, 1));
