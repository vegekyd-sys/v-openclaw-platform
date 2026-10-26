// Inter-session collaboration, WP3 (docs/inter-session/design.md §3.5): lets other
// in-process components add rows to V's task registry bridge, so work that is not a
// task in the registry (a sessions_send request another session is working on) shows
// in the requester's background line like any other background work.
//
// V's core `task-registry-activity-*.js` already carries the bridge
// (v-task-registry-bridge-v1, lab/release-files/feishu-task-status/): a global object
// whose `listActive(sessionKey)` lists a session's unfinished tasks for the Feishu
// card and v-experience (Telegram, DingTalk, WeCom). `listActive` is reassigned every
// time the chunk is evaluated, so a plugin that wrapped it would be overwritten; the
// hook has to live in the dist, next to the optional `listActivePersisted` /
// `listActiveSubagentsPersisted` hooks that are written the same way.
//
// Two additive edits, nothing else changes:
//   - `vTaskRegistryBridge.extraSources ??= new Set()` right after the bridge object is
//     created (the plugin may create the object, and the set, first; `??=` keeps both);
//   - before `listActive` returns, every source is called with the session key and its
//     rows are appended. A source that throws, returns something that is not iterable,
//     or throws while being iterated adds nothing; rows without a `taskId`, or whose
//     `taskId` is already listed (a registry task, a persisted row, another source),
//     are skipped.
//
// Generated from the exact bytes V runs (release-artifact-rebase-trap); stacks on the
// existing v-task-registry-bridge-v1 code, which stays as it is.
import fs from "node:fs";

export const MARKER = "v-task-bridge-extra-sources-v1";
export const FILE = "task-registry-activity-DSlVVJwD.js";
/** The marker of the bridge this patch extends; it must be present in the input. */
export const BRIDGE_MARKER = "v-task-registry-bridge-v1";
/** Same literal as contracts.js SYMBOL_KEYS.taskRegistryBridge (TASK_REGISTRY_BRIDGE). */
export const BRIDGE_SYMBOL_KEY = "openclaw.v.taskRegistryBridge";

export const BRIDGE_ANCHOR = `const vTaskRegistryBridge = globalThis[Symbol.for("${BRIDGE_SYMBOL_KEY}")] ??= { listeners: new Set() };\n`;
export const RETURN_ANCHOR = "\treturn active;\n};\nfunction vTaskRegistryBridgeNotify(event) {\n";

export const BRIDGE_INIT = `// ${MARKER}: other in-process components (the v-session-relay plugin) add rows to
// listActive by putting a source in this set: (sessionKey) => TaskLike[].
vTaskRegistryBridge.extraSources ??= new Set();
`;

export const EXTRA_ROWS = `\t// Rows from extraSources: a failing source adds nothing, and a taskId is listed once.
\ttry {
\t\tconst listed = new Set(active.map((task) => task?.taskId));
\t\tfor (const source of vTaskRegistryBridge.extraSources ?? []) {
\t\t\tlet rows = [];
\t\t\ttry {
\t\t\t\tfor (const row of source(key) ?? []) if (row?.taskId) rows.push(row);
\t\t\t} catch {
\t\t\t\trows = [];
\t\t\t}
\t\t\tfor (const row of rows) {
\t\t\t\tif (listed.has(row.taskId)) continue;
\t\t\t\tlisted.add(row.taskId);
\t\t\t\tactive.push(row);
\t\t\t}
\t\t}
\t} catch {}
`;

function once(source, anchor, label) {
  const parts = source.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: expected exactly one anchor, found ${parts.length - 1}`);
  }
  return parts;
}

/** Patched source of task-registry-activity-DSlVVJwD.js, from the exact bytes V runs. */
export function patchTaskBridgeExtraSources(source) {
  if (source.includes(MARKER)) {
    throw new Error("already patched");
  }
  if (source.split(BRIDGE_MARKER).length !== 2) {
    throw new Error(`${BRIDGE_MARKER} must be present exactly once (V's task registry bridge)`);
  }
  const [beforeBridge, afterBridge] = once(source, BRIDGE_ANCHOR, "task registry bridge object");
  let out = `${beforeBridge}${BRIDGE_ANCHOR}${BRIDGE_INIT}${afterBridge}`;
  const [beforeReturn, afterReturn] = once(out, RETURN_ANCHOR, "listActive return");
  out = `${beforeReturn}${EXTRA_ROWS}${RETURN_ANCHOR}${afterReturn}`;
  return out;
}

// node patch.mjs <input> <output>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, patchTaskBridgeExtraSources(fs.readFileSync(input, "utf8")));
}
