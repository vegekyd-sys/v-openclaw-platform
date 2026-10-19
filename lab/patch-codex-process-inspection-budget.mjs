// codex-process-inspection-budget-v1: Codex app-server identity inspection gets its own wider
// deadline and one retry, on V's bytes of the Codex plugin's transport-stdio-CyPldczm.js.
//
// V 2026-10-17 03:28: the first /vds message of Tianyi's main session (7612daa9, 21,327 events)
// failed after 3.6 s with "Cannot inspect Codex processes. Process inspection exceeded its
// deadline". Spawning the app-server registers the child: reapRegisteredCodexAppServerOrphans
// and the register callback read a few /proc entries (readCodexAppServerProcessSnapshot with the
// default deadline Date.now() + 2 s, readCodexAppServerProcessCommand with + 2 s). Each await
// waits for the Gateway main thread, which at that moment spent 2.57 s in the synchronous
// codex-bounded-history read of the same turn, so the deadline passed before the reads resumed
// and the turn failed; resending worked.
//
// The 2 s budget belongs to process containment (SIGSTOP/SIGKILL of descendants), whose calls pass
// their own deadlines and are left unchanged. Identity inspection for registration and orphan
// reaping now defaults to 15 s, and a deadline failure there is retried once with a fresh budget.
// Nothing else changes: same /proc reads, same identity checks, same errors when /proc is
// unavailable or permission is denied.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MARKER = "codex-process-inspection-budget-v1";
export const TRANSPORT_FILE = "transport-stdio-CyPldczm.js";
export const TRANSPORT_BEFORE = "513e62ddeba5545431e34fc8a189ae53ee3425752c859cc1454d3eb1ce554d2d";
export const PLUGIN_DIST = "npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist";

const replaceOnce = (source, before, after, label) => {
  assert.equal(source.split(before).length, 2, `${label}: anchor must occur exactly once`);
  return source.replace(before, () => after);
};

export function patchCodexProcessInspectionBudget(source) {
  assert.ok(!source.includes(MARKER), `${TRANSPORT_FILE} already carries ${MARKER}`);
  assert.equal(createHash("sha256").update(source).digest("hex"), TRANSPORT_BEFORE, `${TRANSPORT_FILE} is not V's bytes`);
  let out = replaceOnce(source,
    "const MAX_PROCESS_CONTAINMENT_MS$1 = 2e3;\n",
    `const MAX_PROCESS_CONTAINMENT_MS$1 = 2e3;
// ${MARKER}: identity reads for registration and orphan reaping wait for the event loop like any
// other await; a busy Gateway main thread must not turn them into a failed turn.
const PROCESS_IDENTITY_INSPECTION_MS = 15e3;
async function withProcessInspectionRetry(read) {
	try {
		return await read();
	} catch (error) {
		if (!(error instanceof ProcessInspectionError) || error.reason !== "deadline") throw error;
		return await read();
	}
}
`, "budget constant");
  out = replaceOnce(out,
    "async function readCodexAppServerProcessSnapshot(deadline = Date.now() + MAX_PROCESS_CONTAINMENT_MS$1, pids) {",
    "async function readCodexAppServerProcessSnapshot(deadline = Date.now() + PROCESS_IDENTITY_INSPECTION_MS, pids) {",
    "snapshot default deadline");
  // orphan reaping: the per-entry identity read
  out = replaceOnce(out,
    "\t\tconst snapshot = await readCodexAppServerProcessSnapshot(void 0, [registration.parent.pid, registration.child.pid]);",
    "\t\tconst snapshot = await withProcessInspectionRetry(() => readCodexAppServerProcessSnapshot(void 0, [registration.parent.pid, registration.child.pid]));",
    "reap snapshot");
  // the orphan-cleanup loop budget must cover a retried 15 s read
  out = replaceOnce(out,
    "\tconst deadline = requestedDeadline ?? Date.now() + 1e4;",
    "\tconst deadline = requestedDeadline ?? Date.now() + 2 * PROCESS_IDENTITY_INSPECTION_MS;",
    "reap budget");
  // registration of the spawned child
  out = replaceOnce(out,
    "\t\tconst snapshot = await readCodexAppServerProcessSnapshot(void 0, [child.pid]);",
    "\t\tconst snapshot = await withProcessInspectionRetry(() => readCodexAppServerProcessSnapshot(void 0, [child.pid]));",
    "register snapshot");
  out = replaceOnce(out,
    "\t\tconst command = await readCodexAppServerProcessCommand(spawned, Date.now() + 2e3);",
    "\t\tconst command = await withProcessInspectionRetry(() => readCodexAppServerProcessCommand(spawned, Date.now() + PROCESS_IDENTITY_INSPECTION_MS));",
    "register command");
  return `// ${MARKER}\n${out}`;
}
