import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// subagent-scoped-row-index (V Gateway GC stalls after 2026-10-20 23:11, see lab/subagent-scoped-row-index.md):
// a single session row (session events, transcript broadcasts, chat.history, sessions.describe) reads
// only the subagent runs its answers depend on, through the registry's indexes, instead of the whole
// registry (5,039 runs, 56 MB of payload JSON on V; reloaded once the 500 ms cache is stale).
// Applies to V's bytes as of release memsearch-overlap-20261021 (session-utils-list after #437).
// OPENCLAW_V_SCOPED_ROW_SUBAGENT_RUNS=0 restores the whole-registry index.
export const MARKER = 'v-subagent-scoped-row-index-v1';
export const RELEASE_DIR = 'lab/release-files/subagent-scoped-row-index';

export const FILES = {
  'subagent-registry.store.sqlite-hzGu4QSk.js': {
    before: 'f37ed94d1c2bbf904bfb2614734bdd40d62fa239ff9dc0c26786035cf8fff1bb',
    replacements: [
      [
        'import { sql } from "kysely";\n',
        'import { sql } from "kysely";\nimport { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";\n',
      ],
      [
        '/** Loads the canonical subagent registry from shared SQLite state. */\nfunction loadSubagentRegistryFromSqlite() {',
        `// ${MARKER}: the persisted runs one session row's read index needs, in one read snapshot,
// through the child / requester / controller indexes:
//   - runs controlled by controllerKey (controller column, or requester when it has none);
//   - every run whose child is in the closure (latest-generation and display lookups);
//   - every run whose requester is in the closure (descendant walk), whose children join the closure.
// The closure starts at rootKeys and also follows inMemoryRuns. Rows are returned in the whole
// registry's order (created_at, run_id), parsed by the same rowToSubagentRunRecord, with the closure's
// child and requester keys so the caller can select the in-memory runs the same way. Returns null when
// the key has more than maxRuns direct runs or the closure grows past 4 x maxRuns.
function loadSubagentRunTreeFromSqlite(params) {
	const { db } = openOpenClawStateDatabase();
	const stateDb = getNodeSqliteKysely(db);
	const controllerKey = params.controllerKey.trim();
	const read = () => {
		const parsed = new Map();
		const childKeys = new Set();
		const requesterKeys = new Set();
		let pendingChild = [];
		let pendingRequester = [];
		const addKey = (key) => {
			const value = typeof key === "string" ? key.trim() : "";
			if (!value) return;
			if (!childKeys.has(value)) {
				childKeys.add(value);
				pendingChild.push(value);
			}
			if (!requesterKeys.has(value)) {
				requesterKeys.add(value);
				pendingRequester.push(value);
			}
		};
		const parse = (row) => {
			if (!parsed.has(row.run_id)) parsed.set(row.run_id, {
				row,
				run: rowToSubagentRunRecord(row)
			});
			return parsed.get(row.run_id).run;
		};
		const select = (column, keys) => {
			const rows = [];
			for (let offset = 0; offset < keys.length; offset += 400) rows.push(...executeSqliteQuerySync(db, stateDb.selectFrom("subagent_runs").selectAll().where(column, "in", keys.slice(offset, offset + 400))).rows);
			return rows;
		};
		// A key with many direct runs (agent:makaron:main: ~4,300) reads about the whole table either way;
		// the caller keeps the cached whole-registry snapshot for it (null), which is cheaper under bursts.
		const maxRuns = params.maxRuns ?? Infinity;
		if (Number.isFinite(maxRuns) && controllerKey) {
			const direct = executeSqliteQuerySync(db, stateDb.selectFrom("subagent_runs").select((eb) => eb.fn.countAll().as("count")).where((eb) => eb.or([eb("requester_session_key", "=", controllerKey), eb("controller_session_key", "=", controllerKey)]))).rows[0];
			if (Number(direct?.count ?? 0) > maxRuns) return null;
		}
		for (const key of params.rootKeys) addKey(key);
		if (controllerKey) for (const row of executeSqliteQuerySync(db, stateDb.selectFrom("subagent_runs").selectAll().where((eb) => eb.or([eb("controller_session_key", "=", controllerKey), eb.and([eb.or([eb("controller_session_key", "is", null), eb("controller_session_key", "=", "")]), eb("requester_session_key", "=", controllerKey)])]))).rows) {
			const run = parse(row);
			if (run) addKey(run.childSessionKey);
		}
		const inMemoryRuns = [...params.inMemoryRuns ?? []];
		while (pendingChild.length > 0 || pendingRequester.length > 0) {
			const requesters = pendingRequester;
			pendingRequester = [];
			for (const row of select("requester_session_key", requesters)) {
				const run = parse(row);
				if (run) addKey(run.childSessionKey);
			}
			const children = pendingChild;
			pendingChild = [];
			// Other generations of these children: run ids from the child index, full rows only for new ones.
			const unseen = [];
			for (let offset = 0; offset < children.length; offset += 400) for (const row of executeSqliteQuerySync(db, stateDb.selectFrom("subagent_runs").select("run_id").where("child_session_key", "in", children.slice(offset, offset + 400))).rows) if (!parsed.has(row.run_id)) unseen.push(row.run_id);
			select("run_id", unseen).forEach(parse);
			if (parsed.size > maxRuns * 4) return null;
			for (const entry of inMemoryRuns) if (requesterKeys.has(entry.requesterSessionKey) || controllerKey && (entry.controllerSessionKey?.trim() || entry.requesterSessionKey) === controllerKey) addKey(entry.childSessionKey);
		}
		return {
			runs: [...parsed.values()].filter((item) => item.run).sort((left, right) => Number(left.row.created_at) - Number(right.row.created_at) || Buffer.compare(Buffer.from(String(left.row.run_id)), Buffer.from(String(right.row.run_id)))).map((item) => item.run),
			childKeys,
			requesterKeys
		};
	};
	return db.isTransaction ? read() : runSqliteDeferredTransactionSync(db, read);
}
/** Loads the canonical subagent registry from shared SQLite state. */
function loadSubagentRegistryFromSqlite() {`,
      ],
      [
        'export { getSubagentRunsForCollectorGroup as C,',
        'export { loadSubagentRunTreeFromSqlite };\nexport { getSubagentRunsForCollectorGroup as C,',
      ],
    ],
  },
  'session-utils-list-BUP03AzS.js': {
    before: '2f30da37be847e6b5df22fdb154f9aa471f355acc3dd67ace90c90abea3a8b6d',
    replacements: [
      [
        'import { w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
        'import { loadSubagentRunTreeFromSqlite, w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
      ],
      [
        `function buildSingleRowSubagentRunIndex(now) {
	return buildSubagentRunReadIndexFromRuns({`,
        `// ${MARKER}: a row only asks the index about its own key, its runtime children
// (runs it controls), its store children and their descendants. With a scope, load just the runs
// those answers read (loadSubagentRunTreeFromSqlite) and the in-memory runs of the same closure, merged
// in the whole snapshot's order with in-memory runs winning. Session events and transcript broadcasts build one row each, so the 500 ms
// whole-registry reload ran for nearly every event on V (967 GB allocated in 2 h, 2026-10-20).
function buildSingleRowSubagentRunIndex(now, scope) {
	if (scope?.key && process.env.OPENCLAW_V_SCOPED_ROW_SUBAGENT_RUNS !== "0") try {
		const key = scope.key.trim();
		const maxRuns = Number(process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? 256);
		const tree = loadSubagentRunTreeFromSqlite({
			maxRuns,
			controllerKey: key,
			rootKeys: [key, ...scope.store ? buildStoreChildSessionCandidateIndex(scope.store, new Set([key])).get(key) ?? [] : []],
			inMemoryRuns: subagentRunRegistry.values()
		});
		if (!tree) throw new Error("subagent run closure above OPENCLAW_V_SCOPED_ROW_MAX_RUNS");
		const runs = /* @__PURE__ */ new Map();
		for (const entry of tree.runs) runs.set(entry.runId, entry);
		// The Gateway restores every persisted run into memory; keep the ones in the closure, and any
		// that replaces a persisted run already selected (in-memory wins, as in the whole snapshot).
		const inMemoryRuns = [];
		for (const [runId, entry] of subagentRunRegistry) if (runs.has(runId) || tree.childKeys.has(entry.childSessionKey.trim()) || tree.requesterKeys.has(entry.requesterSessionKey) || (entry.controllerSessionKey?.trim() || entry.requesterSessionKey) === key) {
			runs.set(runId, entry);
			inMemoryRuns.push(entry);
		}
		return buildSubagentRunReadIndexFromRuns({
			runs,
			inMemoryRuns,
			now
		});
	} catch {}
	return buildSubagentRunReadIndexFromRuns({`,
      ],
      [
        'const subagentIndex = rowContext?.subagentRuns ?? params.subagentRuns ?? buildSingleRowSubagentRunIndex(now);',
        'const subagentIndex = rowContext?.subagentRuns ?? params.subagentRuns ?? buildSingleRowSubagentRunIndex(now, {\n\t\tkey,\n\t\tstore\n\t});',
      ],
      [
        `	if (!entry) return { row: null };
	const subagentRuns = buildSingleRowSubagentRunIndex(now);`,
        `	if (!entry) return { row: null };
	const subagentRuns = buildSingleRowSubagentRunIndex(now, {
		key: canonicalKey,
		store
	});`,
      ],
      [
        `function buildGatewaySessionInfo(params) {
	const now = params.now ?? Date.now();
	const subagentRuns = buildSingleRowSubagentRunIndex(now);`,
        `function buildGatewaySessionInfo(params) {
	const now = params.now ?? Date.now();
	const subagentRuns = buildSingleRowSubagentRunIndex(now, {
		key: params.key,
		store: params.store
	});`,
      ],
    ],
  },
};

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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
