import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// workboard-full-sweep: the Workboard lifecycle sweep's 10-minute full listing reads the session stores on a
// worker thread. See lab/workboard-full-sweep.md.
//
// V, 2026-11-17: every ~613 s the Gateway main thread stopped for 6-9 s (`liveness heartbeat delayed`).
// The CPU profile of one stop (12 s busy stretch) has `workboard-lifecycle-sync`'s full sweep in it:
// sessions.list (lifecycleOnly, no activeMinutes) loads the whole makaron store's list projection
// (22,922 rows, 2.1 GB of entry JSON; SQLite json_valid/json_type/json_remove per row, then JSON.parse)
// on the main thread, 4.8 s plus ~1.5 s of GC. The sweep keeps five fields of each row.
//
// 1. session-accessor.sqlite-transcript-state: export the per-path canonical-key proof cache
//    (assertCanonicalSqliteSessionKeysCurrent) so a worker can start from this process's proof instead of
//    re-scanning every row.
// 2. combined-store-gateway: the durable-store loop of loadCombinedSessionStoreForGatewayCore becomes
//    mergeDurableGatewayStores (same code). readDurableLifecycleSnapshot runs that loop in a worker with the
//    list projection and keeps, per merged entry, only the fields the lifecycle listing reads after the merge
//    (LIFECYCLE_SNAPSHOT_ENTRY_FIELDS). readCombinedLifecycleSnapshotInWorker resolves the targets on the main
//    thread, starts a one-shot worker (v-session-lifecycle-snapshot-worker.mjs) and returns its result.
//    loadCombinedSessionStoreForGatewayCore takes that result (opts.durableSnapshot) in place of the loop when
//    it was read for the same durable targets; incognito stores and the configured-agent filter run as before.
//    The worker also reads the persisted subagent runs the lifecycle rows' status needs (the session-list
//    projection of subagent_runs, V: 22,033 runs / 263 MB, 0.8 s of main thread), through a read-only connection
//    to the state database the main thread has open.
// 3. subagent-registry.store.sqlite: loadSubagentSessionListRunsFromSqlite / readSubagentSessionListRows take an
//    optional database (default: the shared state database, as before).
// 4. subagent-registry-read: buildSubagentSessionListReadIndexFromPersisted builds the session-list index from
//    given persisted runs merged with the in-memory registry exactly as getSubagentRunsSnapshot does.
// 5. session-utils-list: buildSessionListRowMetadataContext takes a prebuilt subagentRuns index;
//    listSessionLifecycleRowsFromStore builds it from params.persistedSubagentRuns when given.
// 6. sessions-read: the lifecycle listing without activeMinutes, whose parameters are only those the sweep
//    sends, awaits the worker first and hands its subagent runs to the rows. Any worker failure (start, clone,
//    error, exit, 120 s timeout) logs one warning and reads on the main thread as before; a failed subagent read
//    in the worker leaves the rows to read them on the main thread, as before.
// OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER=0 restores the main-thread read.

export const MARKER = 'workboard-full-sweep';
export const ENV = 'OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);
const swap = (pairs) => ({
  patch(source) {
    assert(!source.includes(MARKER), 'already patched');
    for (const [before, , what] of pairs) once(source, before, what);
    return pairs.reduce((text, [before, after]) => text.replace(before, () => after), source);
  },
  unpatch(source) {
    assert(source.includes(MARKER), 'not patched');
    for (const [, after, what] of pairs) once(source, after, `patched ${what}`);
    return pairs.reduce((text, [before, after]) => text.replace(after, () => before), source);
  },
});

// ---- session-accessor.sqlite-transcript-state-Cz9g7S9v.js ----
export const STATE = 'session-accessor.sqlite-transcript-state-Cz9g7S9v.js';
export const STATE_BEFORE = '2583a789782d3f1282e2fe4670f79ec463356950d1240237437b7537778c7b75';
const state = swap([
  [
    `export { readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch };`,
    `// ${MARKER}: the database paths this process has proven canonical (assertCanonicalSqliteSessionKeysCurrent's
// per-path cache, with the main key each was proven for), so a worker thread reading the same files starts from
// the same proof: it still compares the stored main key, and scans a path it was not handed.
function listCanonicalSessionKeyValidatedPaths() {
	return [...validatedDatabasePaths];
}
function adoptCanonicalSessionKeyValidatedPaths(entries) {
	for (const [pathname, mainKey] of entries ?? []) if (typeof pathname === "string" && pathname) validatedDatabasePaths.set(pathname, mainKey);
}
export { readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch, listCanonicalSessionKeyValidatedPaths, adoptCanonicalSessionKeyValidatedPaths };`,
    'transcript-state extra exports',
  ],
]);

// ---- combined-store-gateway-BwDhjbIt.js ----
export const COMBINED = 'combined-store-gateway-BwDhjbIt.js';
export const COMBINED_BEFORE = '0cbe8b81f9c38f945b2e6e84c301083ee66106caf50a5bba547c64d098db2a13';
const combined = swap([
  [
    `import { m as canonicalSessionKeyMigrationRequiredError } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";`,
    `import { m as canonicalSessionKeyMigrationRequiredError, listCanonicalSessionKeyValidatedPaths } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { i as openOpenClawStateDatabase } from "./openclaw-state-db-Bh3Bq87y.js";
import { Worker } from "node:worker_threads";`,
    'transcript-state import',
  ],
  [
    `/** Loads and canonicalizes session entries for gateway views across one or more agent stores. */
function loadCombinedSessionStoreForGatewayCore(cfg, opts = {}) {
	const projection = opts.projection ?? "full";
	const { configuredAgentIds, defaultAgentId, diagnostics, durableStorePath: preparedDurableStorePath, durableTargets, incognitoTargets, requestedAgentId, storeConfig } = resolveGatewaySessionStoreTargets(cfg, opts);
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	for (const target of durableTargets) {
		const agentId = target.agentId;
		const storePath = target.storePath;
		const store = loadGatewayStoreEntries({
			agentId,
			projection,
			storePath,
			...opts.match ? { match: opts.match } : {}
		});`,
    `/** Reads every durable target and merges its canonical rows into combined (the durable part of loadCombinedSessionStoreForGatewayCore). */
function mergeDurableGatewayStores(params) {
	const { cfg, combined, agentIdBySessionKey, durableTargets, requestedAgentId, projection } = params;
	for (const target of durableTargets) {
		const agentId = target.agentId;
		const storePath = target.storePath;
		const store = loadGatewayStoreEntries({
			agentId,
			projection,
			storePath,
			...params.match ? { match: params.match } : {}
		});`,
    'durable merge loop head',
  ],
  [
    `			mergeSessionEntryIntoCombined({
				cfg,
				combined,
				agentIdBySessionKey,
				entry,
				agentId: canonicalAgentId,
				canonicalKey
			});
		}
	}
	const incognitoStorePaths = mergeOpenIncognitoStores({`,
    `			mergeSessionEntryIntoCombined({
				cfg,
				combined,
				agentIdBySessionKey,
				entry,
				agentId: canonicalAgentId,
				canonicalKey
			});
		}
	}
}
// ${MARKER}: the entry fields sessions.list reads after the merge for a lifecycle listing (lifecycleOnly, no
// activeMinutes, only the parameters sessions-read's LIFECYCLE_SNAPSHOT_LIST_PARAMS allows): the configured-agent
// filter (spawnedBy, parentSessionKey), the selection (archivedAt; the phantom check: sessionId, updatedAt; the
// owner projection: owner, createdActor; the order: pinnedAt, updatedAt), the lifecycle row (updatedAt, sessionId,
// abortedLastRun, status; the row classification: chatType, heartbeatIsolatedBaseSessionKey, spawnedBy) and a
// single row's subagent index (spawnedBy, parentSessionKey).
const LIFECYCLE_SNAPSHOT_ENTRY_FIELDS = [
	"sessionId",
	"updatedAt",
	"archivedAt",
	"pinnedAt",
	"status",
	"abortedLastRun",
	"spawnedBy",
	"parentSessionKey",
	"owner",
	"createdActor",
	"chatType",
	"heartbeatIsolatedBaseSessionKey"
];
/** Runs on the lifecycle snapshot worker: the durable merge with the list projection, kept to the lifecycle fields. */
function readDurableLifecycleSnapshot(params) {
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	mergeDurableGatewayStores({
		cfg: params.cfg,
		combined,
		agentIdBySessionKey,
		durableTargets: params.durableTargets,
		requestedAgentId: params.requestedAgentId,
		projection: "list"
	});
	const entries = [];
	for (const [key, entry] of Object.entries(combined)) {
		const kept = {};
		for (const field of LIFECYCLE_SNAPSHOT_ENTRY_FIELDS) if (Object.hasOwn(entry, field)) kept[field] = entry[field];
		entries.push([key, kept]);
	}
	return {
		entries,
		agentIds: [...agentIdBySessionKey]
	};
}
const LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS = 12e4;
/** The durable part of a lifecycle listing, read and merged on a one-shot worker thread (see readDurableLifecycleSnapshot). */
function readCombinedLifecycleSnapshotInWorker(cfg, opts = {}) {
	const { durableTargets, requestedAgentId } = resolveGatewaySessionStoreTargets(cfg, opts);
	const targets = durableTargets.map((target) => ({
		agentId: target.agentId,
		storePath: target.storePath
	}));
	// The worker reads the persisted subagent runs from the state database this thread has open; without it the
	// rows read them here, as before.
	let stateDatabasePath;
	try {
		stateDatabasePath = openOpenClawStateDatabase().path;
	} catch {}
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer;
		const worker = new Worker(new URL("./v-session-lifecycle-snapshot-worker.mjs", import.meta.url), { workerData: {
			cfg,
			durableTargets: targets,
			requestedAgentId,
			canonicalValidatedPaths: listCanonicalSessionKeyValidatedPaths(),
			...typeof stateDatabasePath === "string" && stateDatabasePath ? { stateDatabasePath } : {}
		} });
		const finish = (error, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			worker.terminate().catch(() => {});
			if (error) reject(error);
			else resolve({
				...value,
				durableTargets: targets,
				requestedAgentId
			});
		};
		timer = setTimeout(() => finish(new Error(\`lifecycle snapshot worker timed out after \${LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS} ms\`)), LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS);
		timer.unref?.();
		worker.unref();
		worker.once("message", (message) => {
			if (message?.ok === true) finish(void 0, message.value);
			else finish(Object.assign(new Error(message?.error?.message ?? "lifecycle snapshot worker failed"), {
				...message?.error?.name ? { name: message.error.name } : {},
				...message?.error?.code ? { code: message.error.code } : {}
			}));
		});
		worker.once("error", (error) => finish(error));
		worker.once("exit", (code) => finish(new Error(\`lifecycle snapshot worker exited with code \${code}\`)));
	});
}
function isDurableLifecycleSnapshotFor(snapshot, durableTargets, requestedAgentId) {
	return snapshot.requestedAgentId === requestedAgentId && snapshot.durableTargets.length === durableTargets.length && snapshot.durableTargets.every((target, index) => target.agentId === durableTargets[index].agentId && target.storePath === durableTargets[index].storePath);
}
/** Loads and canonicalizes session entries for gateway views across one or more agent stores. */
function loadCombinedSessionStoreForGatewayCore(cfg, opts = {}) {
	const projection = opts.projection ?? "full";
	const { configuredAgentIds, defaultAgentId, diagnostics, durableStorePath: preparedDurableStorePath, durableTargets, incognitoTargets, requestedAgentId, storeConfig } = resolveGatewaySessionStoreTargets(cfg, opts);
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	// ${MARKER}: durable stores a lifecycle snapshot worker already read and merged for these same targets.
	const durableSnapshot = opts.durableSnapshot && isDurableLifecycleSnapshotFor(opts.durableSnapshot, durableTargets, requestedAgentId) ? opts.durableSnapshot : void 0;
	if (durableSnapshot) {
		for (const [key, entry] of durableSnapshot.entries) combined[key] = entry;
		for (const [key, agentId] of durableSnapshot.agentIds) agentIdBySessionKey.set(key, agentId);
	} else mergeDurableGatewayStores({
		cfg,
		combined,
		agentIdBySessionKey,
		durableTargets,
		requestedAgentId,
		projection,
		...opts.match ? { match: opts.match } : {}
	});
	const incognitoStorePaths = mergeOpenIncognitoStores({`,
    'durable merge loop tail',
  ],
  [
    `export { loadCombinedSessionStoreForGatewayCore as n, canPrewarmCombinedSessionStoresForGateway as t };`,
    `export { loadCombinedSessionStoreForGatewayCore as n, canPrewarmCombinedSessionStoresForGateway as t };
export { readCombinedLifecycleSnapshotInWorker, readDurableLifecycleSnapshot };`,
    'combined exports',
  ],
]);

// ---- sessions-read-C6mAMxyQ.js ----
export const READ = 'sessions-read-C6mAMxyQ.js';
export const READ_BEFORE = '5044b9b06adf4590aaefc182d697dc964532a4894f91aa1a80191349d84efa21';
const read = swap([
  [
    `import { n as loadCombinedSessionStoreForGatewayCore } from "./combined-store-gateway-BwDhjbIt.js";`,
    `import { n as loadCombinedSessionStoreForGatewayCore, readCombinedLifecycleSnapshotInWorker } from "./combined-store-gateway-BwDhjbIt.js";`,
    'combined import',
  ],
  [
    `function isVisibilityColumnListRequest(opts) {
	return Object.entries(opts).every(([name, value]) => value === void 0 || value === false || VISIBILITY_COLUMN_LIST_PARAMS.has(name));
}`,
    `function isVisibilityColumnListRequest(opts) {
	return Object.entries(opts).every(([name, value]) => value === void 0 || value === false || VISIBILITY_COLUMN_LIST_PARAMS.has(name));
}
// ${MARKER}: the parameters of the Workboard lifecycle sweep's full listing. With only these (and no activeMinutes),
// a lifecycle listing reads no entry field beyond combined-store-gateway's LIFECYCLE_SNAPSHOT_ENTRY_FIELDS, so its
// durable stores can be read on a worker thread.
const LIFECYCLE_SNAPSHOT_LIST_PARAMS = new Set([
	"agentId",
	"configuredAgentsOnly",
	"includeGlobal",
	"includeUnknown",
	"lifecycleOnly",
	"limit",
	"offset"
]);
function isLifecycleSnapshotListRequest(opts) {
	return Object.entries(opts).every(([name, value]) => value === void 0 || value === false || LIFECYCLE_SNAPSHOT_LIST_PARAMS.has(name));
}`,
    'visibility params helper',
  ],
  [
    `				store: loaded.store,
				modelCatalog: modelCatalogByAgent,
				opts: p,`,
    `				store: loaded.store,
				modelCatalog: modelCatalogByAgent,
				opts: p,
				...durableSnapshot?.subagentRuns ? { persistedSubagentRuns: durableSnapshot.subagentRuns } : {},`,
    'rows params',
  ],
  [
    `			let loaded = options.loaded;
			if (!loaded) loaded = {
				...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly,
					projection: visibilityColumns ? "visibility" : "list",
					...lifecycleUpdatedSince !== void 0 ? { match: { updatedSince: lifecycleUpdatedSince } } : {}
				}), {`,
    `			let loaded = options.loaded;
			// ${MARKER}: the sweep's full lifecycle listing (every row of every store, V: 2.1 GB of entry JSON every ten
			// minutes) reads and merges the durable stores on a worker thread; anything that stops the worker reads here.
			let durableSnapshot;
			if (!loaded && lifecycleRows && lifecycleUpdatedSince === void 0 && !options.excludedKeys?.size && isLifecycleSnapshotListRequest(p) && process.env.OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER !== "0") try {
				durableSnapshot = await measureDiagnosticsTimelineSpan("gateway.sessions.list.lifecycle_snapshot", () => readCombinedLifecycleSnapshotInWorker(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly
				}), {
					config: cfg,
					phase: "sessions.list"
				});
			} catch (error) {
				context.logGateway?.warn?.(\`sessions.list lifecycle snapshot worker failed; reading on the main thread: \${formatErrorMessage(error)}\`);
			}
			if (!loaded) loaded = {
				...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly,
					projection: visibilityColumns ? "visibility" : "list",
					...lifecycleUpdatedSince !== void 0 ? { match: { updatedSince: lifecycleUpdatedSince } } : {},
					...durableSnapshot ? { durableSnapshot } : {}
				}), {`,
    'store load',
  ],
]);

// ---- v-session-lifecycle-snapshot-worker.mjs (new) ----
export const WORKER = 'v-session-lifecycle-snapshot-worker.mjs';
export const WORKER_SOURCE = `// ${MARKER}: one-shot worker for readCombinedLifecycleSnapshotInWorker (combined-store-gateway): reads and merges the
// durable session stores of a Workboard full lifecycle listing off the Gateway main thread and posts back the
// lifecycle fields of every merged entry. It starts from the main thread's canonical-key proofs.
import { parentPort, workerData } from "node:worker_threads";
import { adoptCanonicalSessionKeyValidatedPaths } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { readDurableLifecycleSnapshot } from "./combined-store-gateway-BwDhjbIt.js";
import { a as loadSubagentSessionListRunsFromSqlite } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
// The session-list projection of the persisted subagent runs (the main thread's getSubagentRunsSnapshot reads the
// same query on its state database handle and ignores a failed read; here a failure leaves that read to it).
function readPersistedSubagentRuns(pathname) {
	if (typeof pathname !== "string" || !pathname) return;
	try {
		const db = openNodeSqliteDatabase(pathname, { readOnly: true });
		try {
			db.exec(\`PRAGMA busy_timeout = \${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};\`);
			return loadSubagentSessionListRunsFromSqlite({ db });
		} finally {
			clearNodeSqliteKyselyCacheForDatabase(db);
			db.close();
		}
	} catch {
		return;
	}
}
try {
	adoptCanonicalSessionKeyValidatedPaths(workerData.canonicalValidatedPaths);
	const value = readDurableLifecycleSnapshot(workerData);
	const subagentRuns = readPersistedSubagentRuns(workerData.stateDatabasePath);
	parentPort.postMessage({
		ok: true,
		value: subagentRuns ? {
			...value,
			subagentRuns
		} : value
	});
} catch (error) {
	parentPort.postMessage({
		ok: false,
		error: {
			name: error?.name,
			message: error instanceof Error ? error.message : String(error),
			code: error?.code
		}
	});
}
`;

// ---- subagent-registry.store.sqlite-hzGu4QSk.js ----
export const STORE = 'subagent-registry.store.sqlite-hzGu4QSk.js';
export const STORE_BEFORE = '23154eac039ed5f2c73388ac92db900e120262d65522d00b131af802d1d62542';
const store = swap([
  [
    `function readSubagentSessionListRows() {
	const { db } = openOpenClawStateDatabase();`,
    `// ${MARKER}: database is the state database to read (default: the shared handle), for the lifecycle snapshot worker.
function readSubagentSessionListRows(database) {
	const { db } = database ?? openOpenClawStateDatabase();`,
    'session-list rows',
  ],
  [
    `function loadSubagentSessionListRunsFromSqlite() {
	const runs = /* @__PURE__ */ new Map();
	for (const row of readSubagentSessionListRows()) {`,
    `function loadSubagentSessionListRunsFromSqlite(database) {
	const runs = /* @__PURE__ */ new Map();
	for (const row of readSubagentSessionListRows(database)) {`,
    'session-list runs',
  ],
]);

// ---- subagent-registry-read-UaDFTyfW.js ----
export const REGISTRY = 'subagent-registry-read-UaDFTyfW.js';
export const REGISTRY_BEFORE = '142bb5158e21a3b68c3cd80fd6cd52beeb8904f632ca39ba9b08e4d1fb2db5c0';
const registry = swap([
  [
    `/** Builds an O(1) latest-run lookup from one persisted and in-memory snapshot. */
function buildLatestSubagentRunReadIndex() {`,
    `/**
* ${MARKER}: buildSubagentSessionListReadIndex with the persisted runs already read (loadSubagentSessionListRunsFromSqlite on
* the lifecycle snapshot worker), merged with the in-memory registry as getSubagentRunsSnapshot merges them.
*/
export function buildSubagentSessionListReadIndexFromPersisted(persisted, now = Date.now()) {
	const merged = /* @__PURE__ */ new Map();
	if (shouldReadPersistedSubagentRuns()) for (const entry of persisted.values()) merged.set(entry.runId, entry);
	for (const [runId, entry] of subagentRuns) merged.set(runId, persistedSubagentSessionListRunsReadCache.project(entry));
	return buildSubagentRunReadIndexFromRuns({
		runs: merged,
		inMemoryRuns: subagentRuns.values(),
		now
	});
}
/** Builds an O(1) latest-run lookup from one persisted and in-memory snapshot. */
function buildLatestSubagentRunReadIndex() {`,
    'latest-run index',
  ],
]);

// ---- session-utils-list-BUP03AzS.js ----
export const LIST = 'session-utils-list-BUP03AzS.js';
export const LIST_BEFORE = '5392dd6581423d3a86d49f08db79c20941dcc24d663343605ad473a584c3054c';
const listRows = swap([
  [
    `import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, c as getSessionDisplaySubagentRunByChildSessionKey, d as isSubagentRunLive, f as isSubagentRunQueued, h as listSubagentRunsForController, i as countActiveDescendantRuns, r as buildSubagentSessionListReadIndex } from "./subagent-registry-read-UaDFTyfW.js";`,
    `import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, c as getSessionDisplaySubagentRunByChildSessionKey, d as isSubagentRunLive, f as isSubagentRunQueued, h as listSubagentRunsForController, i as countActiveDescendantRuns, r as buildSubagentSessionListReadIndex, buildSubagentSessionListReadIndexFromPersisted } from "./subagent-registry-read-UaDFTyfW.js";`,
    'subagent read import',
  ],
  [
    `function buildSessionListRowMetadataContext(params) {
	return {
		subagentRuns: buildSubagentSessionListReadIndex(params.now),`,
    `function buildSessionListRowMetadataContext(params) {
	return {
		// ${MARKER}: an index the caller already built (the lifecycle rows, from the snapshot worker's persisted runs).
		subagentRuns: params.subagentRuns ?? buildSubagentSessionListReadIndex(params.now),`,
    'row context',
  ],
  [
    `	let rowContext;
	const getRowContext = () => {
		rowContext ??= buildSessionListRowMetadataContext({
			now,
			userProfileIdentityById
		});
		return rowContext;
	};
	const hasSpawnedByFilter = typeof opts.spawnedBy === "string" && opts.spawnedBy.length > 0;
	const selection = selectSessionEntries({
		cfg,
		store,
		opts,
		now,
		...params.entryFilter ? { entryFilter: params.entryFilter } : {},
		defaultLimit: SESSIONS_LIST_DEFAULT_LIMIT,
		getRowContext: hasSpawnedByFilter || Boolean(normalizeOptionalString(opts.search)) ? getRowContext : void 0,
		userProfileIdentityById,
		configuredAgentIds: new Set(listAgentIds(cfg)),
		involvingActorId: params.involvingActorId,
		ownerFirstActorId: params.ownerFirstActorId
	});
	// A few rows`,
    `	let rowContext;
	const getRowContext = () => {
		rowContext ??= buildSessionListRowMetadataContext({
			now,
			userProfileIdentityById,
			// ${MARKER}: persisted subagent runs the lifecycle snapshot worker already read.
			...params.persistedSubagentRuns ? { subagentRuns: buildSubagentSessionListReadIndexFromPersisted(params.persistedSubagentRuns, now) } : {}
		});
		return rowContext;
	};
	const hasSpawnedByFilter = typeof opts.spawnedBy === "string" && opts.spawnedBy.length > 0;
	const selection = selectSessionEntries({
		cfg,
		store,
		opts,
		now,
		...params.entryFilter ? { entryFilter: params.entryFilter } : {},
		defaultLimit: SESSIONS_LIST_DEFAULT_LIMIT,
		getRowContext: hasSpawnedByFilter || Boolean(normalizeOptionalString(opts.search)) ? getRowContext : void 0,
		userProfileIdentityById,
		configuredAgentIds: new Set(listAgentIds(cfg)),
		involvingActorId: params.involvingActorId,
		ownerFirstActorId: params.ownerFirstActorId
	});
	// A few rows`,
    'lifecycle rows context',
  ],
]);

// [file, before sha256 (null = new file), patch(source), unpatch(source)]
export const FILES = [
  [STATE, STATE_BEFORE, state.patch, state.unpatch],
  [COMBINED, COMBINED_BEFORE, combined.patch, combined.unpatch],
  [READ, READ_BEFORE, read.patch, read.unpatch],
  [STORE, STORE_BEFORE, store.patch, store.unpatch],
  [REGISTRY, REGISTRY_BEFORE, registry.patch, registry.unpatch],
  [LIST, LIST_BEFORE, listRows.patch, listRows.unpatch],
  [WORKER, null, () => WORKER_SOURCE, () => null],
];
