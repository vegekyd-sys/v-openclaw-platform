import assert from 'node:assert/strict';

// The subagents tool and its siblings read only the caller's subagent tree (V 2026-11-24).
//
// 01:12:26.0-01:12:59.7 CST, group 十二家: /vcc (claude-cli) called the subagents tool
// {action: "list", recentMinutes: 180} right after Tianyi asked it to stop its background work. The Gateway's
// main thread stopped for 33.7 s, RSS went 5.2 -> 10.3 GB, a Feishu card send timed out, DingTalk reconnected,
// and a /vds direct message waited 115 s. The cancel that followed took 6.4 s.
//
// For three runs of one session, the list:
//   - buildControlledSubagentRunsReadContext: loaded and parsed the whole subagent_runs table
//     (27,776 runs since 9/06, 322 MiB of payload JSON). The 500 ms read cache is stamped before the load,
//     so it is already stale when the next reader comes;
//   - buildSubagentList: loaded it again, for child links and pending-descendant counts;
//   - buildSubagentList: read the agent's whole session table (makaron: 26,779 rows, 2.6 GB of entry JSON)
//     for the token usage and model of the three children.
// The same full reads sit behind /status, /subagents, the per-attempt "Active Subagents" prompt section of
// the embedded runner, and countActive/countPending/listDescendant runs and hasDescendantRunAwaitingSettle.
//
// subagent-tree-read-v1 (source: vegekyd-sys/openclaw-versa versa/port-subagents-scoped-read-20261124;
// same intent as upstream f7121470cd4 / #170998, which 9.1 cannot take as is):
// - getSubagentRunsSnapshotForSessionTrees(inMemoryRuns, roots) reads through the requester/controller and
//   child indexes the runs each visited session requested or controls, every generation of each child they
//   name, and that child's own subtree. Latest-generation, visibility, controller grouping and descendant
//   reads rooted at a visited session see exactly what the full snapshot shows them, in its order. Live
//   memory wins per run id as before; a fresh full snapshot is reused when there is one; a disk error falls
//   back to memory only, as the full read does;
// - the control scope roots it at the caller, buildSubagentList at the listed children, and the four
//   descendant readers at their root;
// - buildSubagentList reads each listed child's session row by exact key (loadExactSessionEntryReadOnly).
// OPENCLAW_V_SUBAGENT_TREE_READ=0 restores the full reads (read per call).

export const MARKER = 'subagent-tree-read-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source, name) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to ${name}`);
}

export function patchStore(source) {
  guard(source, 'subagent-registry.store.sqlite-hzGu4QSk.js');
  let out = replaceExactlyOnce(source,
    '	if (scope?.kind === "child") query = query.where("child_session_key", "=", scope.sessionKey);\n',
    `	if (scope?.kind === "child") query = query.where("child_session_key", "=", scope.sessionKey);
	// ${MARKER}: one session's edges in the tree; requester and controller each have an index.
	else if (scope?.kind === "tree-edge") query = query.where((eb) => eb.or([eb("requester_session_key", "=", scope.sessionKey), eb("controller_session_key", "=", scope.sessionKey)]));
`,
    'readSubagentRegistryRows child scope');
  out = replaceExactlyOnce(out,
    `/** Loads all persisted generations for one child session through its existing index. */
function loadSubagentRunsForChildSessionFromSqlite(childSessionKey) {
	return loadScopedSubagentRuns({
		kind: "child",
		sessionKey: childSessionKey
	});
}
`,
    `/** Loads all persisted generations for one child session through its existing index. */
function loadSubagentRunsForChildSessionFromSqlite(childSessionKey) {
	return loadScopedSubagentRuns({
		kind: "child",
		sessionKey: childSessionKey
	});
}
/** ${MARKER}: loads runs requested or controlled by one session: its edges in the session tree. */
function loadSubagentRunTreeEdgesFromSqlite(sessionKey) {
	return loadScopedSubagentRuns({
		kind: "tree-edge",
		sessionKey
	});
}
`,
    'loadSubagentRunsForChildSessionFromSqlite');
  return `${out}export { loadSubagentRunTreeEdgesFromSqlite };\n`;
}

const TREE_READ = `// ${MARKER}: reads rooted at sessions walk the requester/controller and child indexes, not the whole table.
function indexLiveSubagentRunsForTree(inMemoryRuns) {
	const edges = /* @__PURE__ */ new Map();
	const generations = /* @__PURE__ */ new Map();
	const push = (index, key, entry) => {
		const bucket = index.get(key);
		if (bucket) bucket.push(entry);
		else index.set(key, [entry]);
	};
	for (const entry of inMemoryRuns.values()) {
		const requester = entry.requesterSessionKey;
		const controller = entry.controllerSessionKey?.trim();
		push(edges, requester, entry);
		if (controller && controller !== requester) push(edges, controller, entry);
		push(generations, entry.childSessionKey, entry);
	}
	return {
		edges: (sessionKey) => edges.get(sessionKey) ?? [],
		generations: (childSessionKey) => generations.get(childSessionKey) ?? []
	};
}
function compareSubagentRunStorageOrder(left, right) {
	if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
	return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
}
/**
* Exact runs for reads rooted at these sessions: a visited session's requested or controlled runs, every
* generation of each child they name, and that child's own subtree, in the full snapshot's order.
*/
function getSubagentRunsSnapshotForSessionTrees(inMemoryRuns, rootSessionKeys) {
	if (process.env.OPENCLAW_V_SUBAGENT_TREE_READ === "0") return getSubagentRunsSnapshotForRead(inMemoryRuns);
	const roots = [...new Set([...rootSessionKeys].map((key) => key.trim()).filter(Boolean))];
	if (roots.length === 0) return /* @__PURE__ */ new Map();
	let persisted;
	if (shouldReadPersistedSubagentRuns()) {
		if (getFreshPersistedSubagentRunsSnapshot(persistedSubagentRunsReadCache, Date.now())) return getSubagentRunsSnapshotForRead(inMemoryRuns);
		persisted = {
			edges: __strLoadTreeEdges,
			generations: loadSubagentRunsForChildSessionFromSqlite
		};
	}
	const collect = (reader) => {
		const live = indexLiveSubagentRunsForTree(inMemoryRuns);
		const taken = /* @__PURE__ */ new Map();
		const persistedRunIds = /* @__PURE__ */ new Set();
		const visited = new Set(roots);
		const loadedChildren = /* @__PURE__ */ new Set();
		const sessions = [...roots];
		const children = [];
		const take = (entry) => {
			if (taken.has(entry.runId)) return;
			taken.set(entry.runId, entry);
			const child = entry.childSessionKey;
			if (!loadedChildren.has(child)) {
				loadedChildren.add(child);
				children.push(child);
			}
			if (!visited.has(child)) {
				visited.add(child);
				sessions.push(child);
			}
		};
		const merge = (rows, liveRows) => {
			for (const row of rows) {
				persistedRunIds.add(row.runId);
				if (!inMemoryRuns.has(row.runId)) take(row);
			}
			for (const row of liveRows) take(row);
		};
		while (sessions.length > 0 || children.length > 0) {
			const child = children.pop();
			if (child !== void 0) {
				merge(reader?.generations(child) ?? [], live.generations(child));
				continue;
			}
			const session = sessions.pop();
			merge(reader?.edges(session) ?? [], live.edges(session));
		}
		const stored = [];
		const liveOnly = /* @__PURE__ */ new Set();
		for (const entry of taken.values()) if (persistedRunIds.has(entry.runId)) stored.push(entry);
		else liveOnly.add(entry.runId);
		const snapshot = /* @__PURE__ */ new Map();
		for (const entry of stored.toSorted(compareSubagentRunStorageOrder)) snapshot.set(entry.runId, entry);
		for (const [runId, entry] of inMemoryRuns) if (liveOnly.has(runId)) snapshot.set(runId, entry);
		return snapshot;
	};
	if (persisted) try {
		return collect(persisted);
	} catch {}
	return collect(void 0);
}
`;

export function patchRead(source) {
  guard(source, 'subagent-registry-read-UaDFTyfW.js');
  let out = replaceExactlyOnce(source,
    'import { n as hasSubagentRunEnded, r as isLiveUnendedSubagentRun } from "./subagent-run-liveness-CrhVXF5Y.js";\n',
    'import { n as hasSubagentRunEnded, r as isLiveUnendedSubagentRun } from "./subagent-run-liveness-CrhVXF5Y.js";\nimport { loadSubagentRunTreeEdgesFromSqlite as __strLoadTreeEdges } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
    'liveness import');
  out = replaceExactlyOnce(out,
    '//#endregion\n//#region src/agents/subagents/registry/subagent-registry-read.ts\n',
    `${TREE_READ}//#endregion\n//#region src/agents/subagents/registry/subagent-registry-read.ts\n`,
    'state/read region boundary');
  for (const [name, fn] of [
    ['countActiveDescendantRuns', 'countActiveDescendantRunsFromRuns'],
    ['listDescendantRunsForRequester', 'listDescendantRunsForRequesterFromRuns'],
    ['countPendingDescendantRuns', 'countPendingDescendantRunsFromRuns'],
  ]) {
    out = replaceExactlyOnce(out,
      `	return ${fn}(getSubagentRunsSnapshotForRead(subagentRuns), rootSessionKey);\n`,
      `	return ${fn}(getSubagentRunsSnapshotForSessionTrees(subagentRuns, [rootSessionKey]), rootSessionKey);\n`,
      name);
  }
  out = replaceExactlyOnce(out,
    '	return hasDescendantRunAwaitingSettleFromRuns(getSubagentSessionListRunsSnapshotForRead(subagentRuns), rootSessionKey, excludeRunId, requesterAgentId);\n',
    `	// ${MARKER}: the rooted subtree carries topology, liveness and delivery disposition for every run the walk visits.
	return hasDescendantRunAwaitingSettleFromRuns(process.env.OPENCLAW_V_SUBAGENT_TREE_READ === "0" ? getSubagentSessionListRunsSnapshotForRead(subagentRuns) : getSubagentRunsSnapshotForSessionTrees(subagentRuns, [rootSessionKey]), rootSessionKey, excludeRunId, requesterAgentId);\n`,
    'hasDescendantRunAwaitingSettle');
  return `${out}export { getSubagentRunsSnapshotForSessionTrees };\n`;
}

export function patchControlScope(source) {
  guard(source, 'subagent-control-scope-DA4oSvgr.js');
  let out = replaceExactlyOnce(source,
    'import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, o as getLatestLiveSubagentRunByChildSessionKey } from "./subagent-registry-read-UaDFTyfW.js";\n',
    'import { T as buildSubagentRunReadIndexFromRuns, o as getLatestLiveSubagentRunByChildSessionKey, getSubagentRunsSnapshotForSessionTrees } from "./subagent-registry-read-UaDFTyfW.js";\n',
    'registry-read import');
  out = replaceExactlyOnce(out,
    '	const snapshot = getSubagentRunsSnapshotForRead(subagentRuns);\n	const readIndex = buildSubagentRunReadIndexFromRuns({ runs: snapshot });\n',
    `	// ${MARKER}: visibility needs only the runs this session requested or controls, and their subtrees.
	const snapshot = getSubagentRunsSnapshotForSessionTrees(subagentRuns, [key]);
	const readIndex = buildSubagentRunReadIndexFromRuns({ runs: snapshot });\n`,
    'buildControlledSubagentRunsReadContext snapshot');
  return out;
}

export function patchList(source) {
  guard(source, 'subagent-list-BS8F5xN_.js');
  let out = replaceExactlyOnce(source,
    'import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
    'import { a as listSessionEntriesReadOnly, u as loadExactSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
    'session accessor import');
  out = replaceExactlyOnce(out,
    'import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead } from "./subagent-registry-read-UaDFTyfW.js";\n',
    'import { T as buildSubagentRunReadIndexFromRuns, getSubagentRunsSnapshotForSessionTrees } from "./subagent-registry-read-UaDFTyfW.js";\n',
    'registry-read import');
  out = replaceExactlyOnce(out,
    `	let store = params.cache.get(storePath);
	if (!store) {
		store = Object.fromEntries(listSessionEntriesReadOnly({
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		params.cache.set(storePath, store);
	}
	return {
		storePath,
		entry: store[params.key]
	};
`,
    `	let store = params.cache.get(storePath);
	// ${MARKER}: one primary-key row per listed child, not the agent's whole session table.
	if (process.env.OPENCLAW_V_SUBAGENT_TREE_READ !== "0") {
		if (!store) {
			store = /* @__PURE__ */ new Map();
			params.cache.set(storePath, store);
		}
		if (!store.has(params.key)) store.set(params.key, loadExactSessionEntryReadOnly({
			storePath,
			sessionKey: params.key
		})?.entry);
		return {
			storePath,
			entry: store.get(params.key)
		};
	}
	if (!store) {
		store = Object.fromEntries(listSessionEntriesReadOnly({
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		params.cache.set(storePath, store);
	}
	return {
		storePath,
		entry: store[params.key]
	};
`,
    'resolveSessionEntryForKey');
  out = replaceExactlyOnce(out,
    '	const { childSessionsByController, readIndex } = buildLatestSubagentRunIndex(getSubagentRunsSnapshotForRead(subagentRuns));\n',
    `	// ${MARKER}: rows read below are keyed by the listed children: their subtrees and child links.
	const { childSessionsByController, readIndex } = buildLatestSubagentRunIndex(getSubagentRunsSnapshotForSessionTrees(subagentRuns, params.runs.map((entry) => entry.childSessionKey)));\n`,
    'buildSubagentList snapshot');
  return out;
}

// V's bytes (/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist, 2026-11-24).
export const FILES = [
  { name: 'subagent-registry.store.sqlite-hzGu4QSk.js', base: 'lab/release-files/workboard-full-sweep', target: 'openclaw/dist', before: '27cf50a04416aeb7bbe4a1a3910389538cca8969fb7cd18b305a3933d01ef277', patch: patchStore },
  { name: 'subagent-registry-read-UaDFTyfW.js', base: 'lab/release-files/workboard-full-sweep', target: 'openclaw/dist', before: '4c88db9ca42dc14f7a45ed557722de1e5e02f63a740d4d9f032c5325c4a9d21b', patch: patchRead },
  { name: 'subagent-control-scope-DA4oSvgr.js', base: 'lab/release-files/subagent-tree-read/v-base', target: 'openclaw/dist', before: 'feb68aa7963a2a571b22a2b53976957ba293eab009399b9ecb1286e69e3a1c02', patch: patchControlScope },
  { name: 'subagent-list-BS8F5xN_.js', base: 'lab/release-files/subagent-tree-read/v-base', target: 'openclaw/dist', before: '41610a02e7ede4076e8b372e89d05f5e09058b8d241f2e1e8eaa0e553128869f', patch: patchList },
];
