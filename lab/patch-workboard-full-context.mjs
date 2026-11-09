import assert from 'node:assert/strict';

// Workboard card workers start with the agent's full workspace context (V 2026-11-09).
//
// Upstream dispatches every Workboard card with lightContext: true, and the card's session key is
// subagent-shaped (agent:<id>:subagent:workboard-<board>-<card>). Light context empties the
// bootstrap files (applyContextModeFilter returns []) and, on the Codex harness, also sets
// project_doc_max_bytes 0; the subagent filter would then keep only AGENTS.md and MEMORY.md. So a
// card worker started without AGENTS.md, SOUL.md, IDENTITY.md and USER.md on every harness (the
// Worker forwards bootstrapContextMode unchanged). On V all 435 Night Shift card threads of
// 2026-11-09 ran without the workspace rules, the whole-tree-grep rule among them, while every chat
// thread had them (docs/incidents/2026-11-09-recursive-scan.md).
//
// A card worker does the agent's own work, so it now starts like a chat:
// - runtime-api: dispatch passes lightContext false;
// - workspace: filterBootstrapFilesForSession keeps every file for subagent:workboard-* keys.
// OPENCLAW_WORKBOARD_LIGHT_CONTEXT=1 (Gateway environment) restores upstream's start for both.
//
// Source: openclaw-versa versa/port-workboard-full-context-20261109 @ 87199af7dfd.

export const MARKER = 'v-workboard-full-context-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/runtime-api-1CCazqtv.js (extensions/workboard/src/dispatcher.ts)
export function patchRuntimeApi(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `				idempotencyKey: runId,
				lightContext: true,
				deliver: false,`,
    `				idempotencyKey: runId,
				// ${MARKER}: card workers start with the agent's full workspace context.
				lightContext: process.env.OPENCLAW_WORKBOARD_LIGHT_CONTEXT === "1",
				deliver: false,`,
    'Workboard dispatch lightContext');
}

// core/dist/workspace-BFk42BX6.js (src/agents/workspace.ts)
export function patchWorkspace(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `	if (isSubagent) return privacyFilteredFiles.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);`,
    `	// ${MARKER}: Workboard card workers keep every bootstrap file despite their subagent-shaped key.
	if (isSubagent && isWorkboardWorkerWithFullContext(sessionKey)) return privacyFilteredFiles;
	if (isSubagent) return privacyFilteredFiles.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);`,
    'subagent bootstrap filter');
  out = replaceExactlyOnce(out,
    `function hasGlobPattern(pattern) {`,
    `function isWorkboardWorkerWithFullContext(sessionKey) {
	return process.env.OPENCLAW_WORKBOARD_LIGHT_CONTEXT !== "1" && /(?:^|:)subagent:workboard-/u.test(sessionKey?.trim().toLowerCase() ?? "");
}
function hasGlobPattern(pattern) {`,
    'hasGlobPattern anchor');
  return out;
}

export const FILES = [
  { name: 'runtime-api-1CCazqtv.js', base: 'core/dist', target: 'openclaw/dist', before: '62ecf47e8b884b72e25bee5b993a4a90ad0cdaf95003c4ac3a5d8d019b8da7ed', patch: patchRuntimeApi },
  { name: 'workspace-BFk42BX6.js', base: 'core/dist', target: 'openclaw/dist', before: '5c74cd7c84c4745fb615bff621836be5a5473949c29db0b115ab81f72a4ce027', patch: patchWorkspace },
];
