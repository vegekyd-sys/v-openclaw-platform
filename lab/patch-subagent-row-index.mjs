import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Every session row the Gateway builds walked the whole in-memory subagent registry twice: inside the
// run-tree loader (which also copied it) and to pick the live runs of the row's closure. V holds
// 13-16k retained runs. The registry Map already keeps a child-session index through every mutation;
// this adds indexes by trimmed child key, exact requester key and owner key (controller, else
// requester), records the keys each run was indexed under, and keeps an insertion sequence so selected
// runs come back in Map iteration order. Same runs, same order as the scan.
// See lab/subagent-row-index.md. Source: openclaw-versa 1422a7978de (branch
// versa/subagent-row-index-lookup-20261108 on versa/port-backlog-20261029).
// OPENCLAW_V_SUBAGENT_ROW_INDEX=0 restores the scans, read on each row.

export const MARKER = 'subagent-row-index';
export const RELEASE_DIR = 'lab/release-files/subagent-row-index';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const STORE = 'subagent-registry.store.sqlite-hzGu4QSk.js';
const LIST = 'session-utils-list-BUP03AzS.js';

export const FILES = {
  [STORE]: {
    target: `openclaw/dist/${STORE}`,
    before: '4bc27059fa5b0127892c1f0f3f6285d3334a98333f781e9f1dab245ab9bba9e7',
    replacements: [
      [
        'const runsByCollectorGroupKey = /* @__PURE__ */ new Map();\n',
        `const runsByCollectorGroupKey = /* @__PURE__ */ new Map();
// ${MARKER}: row lookup indexes by trimmed child, exact requester and owner key, with the keys each
// run was indexed under, and an insertion sequence that reproduces Map iteration order.
const rowLookupKeysByRunId = /* @__PURE__ */ new Map();
const runsByTrimmedChildSessionKey = /* @__PURE__ */ new Map();
const runsByRequesterSessionKey = /* @__PURE__ */ new Map();
const runsByOwnerSessionKey = /* @__PURE__ */ new Map();
const insertionSeqByRunId = /* @__PURE__ */ new Map();
let nextInsertionSeq = 0;
function rowLookupKeys(entry) {
	return {
		child: entry.childSessionKey?.trim() || void 0,
		requester: entry.requesterSessionKey || void 0,
		owner: entry.controllerSessionKey?.trim() || entry.requesterSessionKey || void 0
	};
}
function unindexRowLookup(runId) {
	const keys = rowLookupKeysByRunId.get(runId);
	if (!keys) return;
	rowLookupKeysByRunId.delete(runId);
	for (const [index, key] of [
		[runsByTrimmedChildSessionKey, keys.child],
		[runsByRequesterSessionKey, keys.requester],
		[runsByOwnerSessionKey, keys.owner]
	]) {
		const indexed = key ? index.get(key) : void 0;
		if (indexed) {
			indexed.delete(runId);
			if (indexed.size === 0) index.delete(key);
		}
	}
}
function indexRowLookup(runId, entry) {
	const keys = rowLookupKeys(entry);
	rowLookupKeysByRunId.set(runId, keys);
	indexSubagentRun(runsByTrimmedChildSessionKey, keys.child, runId, entry);
	indexSubagentRun(runsByRequesterSessionKey, keys.requester, runId, entry);
	indexSubagentRun(runsByOwnerSessionKey, keys.owner, runId, entry);
}
`,
      ],
      [
        '\t\tsuper.set(runId, entry);\n\t\tindexSubagentRun(runsByChildSessionKey, entry.childSessionKey, runId, entry);\n',
        '\t\tif (!this.has(runId)) insertionSeqByRunId.set(runId, nextInsertionSeq++);\n\t\tunindexRowLookup(runId);\n\t\tsuper.set(runId, entry);\n\t\tindexRowLookup(runId, entry);\n\t\tindexSubagentRun(runsByChildSessionKey, entry.childSessionKey, runId, entry);\n',
      ],
      [
        '\t\treturn super.delete(runId);\n\t}\n',
        '\t\tconst deleted = super.delete(runId);\n\t\tif (deleted) {\n\t\t\tunindexRowLookup(runId);\n\t\t\tinsertionSeqByRunId.delete(runId);\n\t\t}\n\t\treturn deleted;\n\t}\n',
      ],
      [
        '\t\trunsByCollectorGroupKey.clear();\n\t}\n};\nconst subagentRuns = new SubagentRunMap();\n',
        `\t\trunsByCollectorGroupKey.clear();
\t\trowLookupKeysByRunId.clear();
\t\trunsByTrimmedChildSessionKey.clear();
\t\trunsByRequesterSessionKey.clear();
\t\trunsByOwnerSessionKey.clear();
\t\tinsertionSeqByRunId.clear();
\t}
};
const subagentRuns = new SubagentRunMap();
/** Live runs whose requester session key is exactly this key. */
function getSubagentRunsForRequesterSession(requesterSessionKey) {
\treturn runsByRequesterSessionKey.get(requesterSessionKey)?.values() ?? [];
}
/** Live runs owned by this key: controller key, or requester key when there is no controller. */
function getSubagentRunsForOwnerSession(ownerSessionKey) {
\treturn runsByOwnerSessionKey.get(ownerSessionKey)?.values() ?? [];
}
/** The live runs a session row selects, without scanning the registry, in registry iteration order. */
function selectSubagentRunsForRowLookup(params) {
\tconst selected = /* @__PURE__ */ new Map();
\tfor (const runId of params.runIds) {
\t\tconst entry = subagentRuns.get(runId);
\t\tif (entry) selected.set(runId, entry);
\t}
\tfor (const [index, keys] of [
\t\t[runsByTrimmedChildSessionKey, params.childKeys],
\t\t[runsByRequesterSessionKey, params.requesterKeys],
\t\t[runsByOwnerSessionKey, [params.ownerKey]]
\t]) for (const key of keys) for (const [runId, entry] of index.get(key) ?? []) selected.set(runId, entry);
\treturn [...selected].toSorted(([left], [right]) => (insertionSeqByRunId.get(left) ?? 0) - (insertionSeqByRunId.get(right) ?? 0));
}
`,
      ],
      [
        '\t\tconst inMemoryRuns = [...params.inMemoryRuns ?? []];\n',
        '\t\tconst inMemoryLookup = params.inMemoryRuns === void 0 ? params.inMemoryLookup : void 0;\n\t\tconst inMemoryRuns = inMemoryLookup ? [] : [...params.inMemoryRuns ?? []];\n',
      ],
      [
        '\t\t\tfor (const entry of inMemoryRuns) if (requesterKeys.has(entry.requesterSessionKey)',
        `\t\t\tif (inMemoryLookup) {
\t\t\t\tfor (const key of requesterKeys) for (const entry of inMemoryLookup.requester(key)) addKey(entry.childSessionKey);
\t\t\t\tif (controllerKey) for (const entry of inMemoryLookup.owner(controllerKey)) addKey(entry.childSessionKey);
\t\t\t}
\t\t\tfor (const entry of inMemoryRuns) if (requesterKeys.has(entry.requesterSessionKey)`,
      ],
      [
        'export { loadSubagentRunTreeFromSqlite };\n',
        'export { loadSubagentRunTreeFromSqlite };\nexport { getSubagentRunsForOwnerSession, getSubagentRunsForRequesterSession, selectSubagentRunsForRowLookup };\n',
      ],
    ],
  },
  [LIST]: {
    target: `openclaw/dist/${LIST}`,
    before: 'a6d40fb5ae98bb8b61ff157487b4a59942c32f126620eda56869c24fc06b3de2',
    replacements: [
      [
        'import { loadSubagentRunTreeFromSqlite, w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
        'import { getSubagentRunsForOwnerSession, getSubagentRunsForRequesterSession, loadSubagentRunTreeFromSqlite, selectSubagentRunsForRowLookup, w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
      ],
      [
        '\t\tconst maxRuns = Number(process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? 256);\n\t\tconst tree = loadSubagentRunTreeFromSqlite({',
        `\t\tconst maxRuns = Number(process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? 256);
\t\t// ${MARKER}: live runs through the registry's row lookup indexes, not two scans.
\t\tconst useRowIndex = process.env.OPENCLAW_V_SUBAGENT_ROW_INDEX !== "0";
\t\tconst tree = loadSubagentRunTreeFromSqlite({`,
      ],
      [
        '\t\t\tinMemoryRuns: subagentRunRegistry.values()\n\t\t});\n\t\tif (!tree) throw new Error("subagent run closure above OPENCLAW_V_SCOPED_ROW_MAX_RUNS");\n',
        '\t\t\t...useRowIndex ? { inMemoryLookup: {\n\t\t\t\trequester: getSubagentRunsForRequesterSession,\n\t\t\t\towner: getSubagentRunsForOwnerSession\n\t\t\t} } : { inMemoryRuns: subagentRunRegistry.values() }\n\t\t});\n\t\tif (!tree) throw new Error("subagent run closure above OPENCLAW_V_SCOPED_ROW_MAX_RUNS");\n',
      ],
      [
        '\t\tfor (const [runId, entry] of subagentRunRegistry) if (runs.has(runId) || tree.childKeys.has(entry.childSessionKey.trim())',
        '\t\tconst candidates = useRowIndex ? selectSubagentRunsForRowLookup({\n\t\t\trunIds: runs.keys(),\n\t\t\tchildKeys: tree.childKeys,\n\t\t\trequesterKeys: tree.requesterKeys,\n\t\t\townerKey: key\n\t\t}) : subagentRunRegistry;\n\t\tfor (const [runId, entry] of candidates) if (runs.has(runId) || tree.childKeys.has(entry.childSessionKey.trim())',
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
