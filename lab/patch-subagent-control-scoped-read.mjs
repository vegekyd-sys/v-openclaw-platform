import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Two whole-registry reads a Codex turn pays on the Gateway's main thread. See lab/subagent-control-scoped-read.md.
//
// buildControlledSubagentRunsReadContext (session_status, /status, the sessions and subagents tools) read
// and parsed every subagent_runs row (V, 2026-11-01: 13,572 rows, 217 MB) to answer about one session. It
// now reads the session's tree through the existing indexes, the way buildSingleRowSubagentRunIndex
// already does; a key above the row budget or an error takes the original path.
// OPENCLAW_V_SCOPED_CONTROL_SUBAGENT_RUNS=0 restores the original path.
//
// The Codex plugin's task runtime listed by cloning and sorting every task (V: 22,421) on each turn, then
// kept the ones owned by its session. It now starts from the owner index.
// OPENCLAW_V_HARNESS_TASKS_BY_OWNER=0 restores the original list.

export const MARKER = 'subagent-control-scoped-read';
export const RELEASE_DIR = 'lab/release-files/subagent-control-scoped-read';
export const HELPER = 'v-subagent-control-scoped-runs.mjs';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const FILES = {
  'subagent-control-scope-DA4oSvgr.js': {
    target: 'openclaw/dist/subagent-control-scope-DA4oSvgr.js',
    before: 'feb68aa7963a2a571b22a2b53976957ba293eab009399b9ecb1286e69e3a1c02',
    replacements: [
      [
        'import { w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
        `import { loadSubagentRunTreeFromSqlite, w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { loadControlledSubagentRuns } from "./${HELPER}";
`,
      ],
      [
        '\tconst snapshot = getSubagentRunsSnapshotForRead(subagentRuns);\n\tconst readIndex = buildSubagentRunReadIndexFromRuns({ runs: snapshot });\n',
        `\t// ${MARKER}: the session's tree through the indexes; the whole registry only when that declines.
\tlet snapshot = null;
\tif (process.env.OPENCLAW_V_SCOPED_CONTROL_SUBAGENT_RUNS !== "0") try {
\t\tsnapshot = loadControlledSubagentRuns({
\t\t\tkey,
\t\t\tinMemoryRuns: subagentRuns,
\t\t\tloadTree: loadSubagentRunTreeFromSqlite,
\t\t\tmaxRuns: Number(process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? 256)
\t\t});
\t} catch {}
\tsnapshot ??= getSubagentRunsSnapshotForRead(subagentRuns);
\tconst readIndex = buildSubagentRunReadIndexFromRuns({ runs: snapshot });
`,
      ],
    ],
  },
  'plugin-sdk/agent-harness-task-runtime.js': {
    target: 'openclaw/dist/plugin-sdk/agent-harness-task-runtime.js',
    before: '50dc439b5cbb8a16860aab0bd8b4f4fd485f16a246f881820be5c0ea9c0754e3',
    replacements: [
      [
        'import { E as listTaskRecords } from "../task-registry-B4-CJZk7.js";\n',
        'import { A as listTasksForOwnerKey, E as listTaskRecords } from "../task-registry-B4-CJZk7.js";\n',
      ],
      [
        '\t\t\treturn listTaskRecords().filter((task) => task.runtime === runtime',
        `\t\t\t// ${MARKER}: the filter below only keeps tasks this key owns, so start from the owner index.
\t\t\tconst records = process.env.OPENCLAW_V_HARNESS_TASKS_BY_OWNER === "0" ? listTaskRecords() : listTasksForOwnerKey(requesterSessionKey);
\t\t\treturn records.filter((task) => task.runtime === runtime`,
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
