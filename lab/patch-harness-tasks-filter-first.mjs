import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// The Codex harness's task runtime asked the registry for every task (cloned and sorted, V 2026-11-08:
// 18,867) on each turn and then kept the few its session owns. It now passes the same predicate to
// listTaskRecords(filter), which filters before it clones and sorts: same records, same order.
// VLab c10 profile with a V-sized registry: about 220 ms of Gateway main thread per Codex turn.
// See lab/harness-tasks-filter-first.md. Source: openclaw-versa 2523e563e9d.
// OPENCLAW_V_HARNESS_TASKS_FILTER_FIRST=0 restores the original call, read on each call.

export const MARKER = 'harness-tasks-filter-first';
export const RELEASE_DIR = 'lab/release-files/harness-tasks-filter-first';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const ORIGINAL_CALL = '\t\t\treturn listTaskRecords().filter((task) => task.runtime === runtime && (!taskKind || task.taskKind === taskKind) && task.scopeKind === "session" && task.ownerKey === requesterSessionKey && (!runIdPrefix || task.runId?.startsWith(runIdPrefix)));\n';

export const FILES = {
  'plugin-sdk/agent-harness-task-runtime.js': {
    target: 'openclaw/dist/plugin-sdk/agent-harness-task-runtime.js',
    before: '50dc439b5cbb8a16860aab0bd8b4f4fd485f16a246f881820be5c0ea9c0754e3',
    replacements: [
      [
        ORIGINAL_CALL,
        `\t\t\t// ${MARKER}: filter before the registry clones and sorts; same records, same order.
\t\t\tconst keep = (task) => task.runtime === runtime && (!taskKind || task.taskKind === taskKind) && task.scopeKind === "session" && task.ownerKey === requesterSessionKey && (!runIdPrefix || task.runId?.startsWith(runIdPrefix));
\t\t\treturn process.env.OPENCLAW_V_HARNESS_TASKS_FILTER_FIRST === "0" ? listTaskRecords().filter(keep) : listTaskRecords(keep);
`,
      ],
    ],
  },
};

export function patchFile(name, source) {
  const spec = FILES[name];
  assert(spec, `unknown file ${name}`);
  assert(!source.includes(MARKER), `${name} already patched`);
  assert.equal(sha256(source), spec.before, `${name} is not V's bytes`);
  let output = source;
  for (const [from, to] of spec.replacements) {
    assert.equal(output.split(from).length, 2, `${name}: anchor must occur once: ${from.slice(0, 80)}`);
    output = output.replace(from, () => to);
  }
  return output;
}

export function unpatchFile(name, release) {
  const spec = FILES[name];
  let output = release;
  for (const [from, to] of [...spec.replacements].reverse()) {
    assert.equal(output.split(to).length, 2, `${name}: patched text must occur once: ${to.slice(0, 80)}`);
    output = output.replace(to, () => from);
  }
  return output;
}
