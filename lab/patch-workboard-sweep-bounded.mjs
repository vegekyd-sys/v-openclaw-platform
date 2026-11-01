import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// workboard-sweep-bounded: the Workboard lifecycle sweep (workboard-lifecycle-sync) stops reading every
// session and every card on the Gateway main thread. See lab/workboard-sweep-bounded.md.
//
// V, 2026-10-26 14:49 CPU profile (140 s): the per-minute partial sweep held the main thread 2.7 s,
// 1.5 s of it loading every makaron session row (list projection; the entry cache never survives a
// minute of writes) only to keep the rows updated in the last ~2 minutes. The 10-minute full sweep
// held it 9 s: the same load, 2.1 s building full display rows for ~10k sessions to read five fields,
// 1.8 s reading every card with all child tables (198k events), 1.9 s GC.
//
// 1. sessions.list lifecycleOnly + activeMinutes reads only the rows updated since the window
//    (idx_agent_session_nodes_updated_at) plus rows the writer has not validated yet
//    (entry_valid = 0), through v-session-entries-matching.mjs. The writer projects updated_at from
//    entry.updatedAt (bindSessionNode); on V all 10,046 rows agree. Selection afterwards is unchanged.
// 2. sessions.list lifecycleOnly builds rows with the fields the sweep reads (key, updatedAt, status,
//    abortedLastRun) plus the ones the active-run flags read (sessionId, agentId), with
//    buildGatewaySessionRow's own derivation, the list's row context and clock.
// 3. Where the sweep read every card (full sweeps, or more than 64 snapshot matches), it decides on
//    parent-row lifecycle states. The no-op check on a state can only pass more cards than on the full
//    card (a state has no events, so the status fence never skips); a passing card without
//    lifecycleStatusSourceUpdatedAt re-decides with the one event the fence reads, and a card that
//    still passes goes to the unchanged syncLifecycle (current card, CAS). Worktree cleanup reads its
//    candidates (worktree cards) in full.
// OPENCLAW_V_WORKBOARD_SWEEP_BOUNDED=0 restores all three.

export const MARKER = 'workboard-sweep-bounded';
export const ENV = 'OPENCLAW_V_WORKBOARD_SWEEP_BOUNDED';
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

// ---- v-session-entries-matching.mjs (V module from sessions-search-exact-read) ----
export const MATCHING = 'v-session-entries-matching.mjs';
export const MATCHING_BEFORE = 'd2d2c2cd7b33622fabcd1ab52ec003d2bf471735c64b49030294a76f27af7e02';
const matching = swap([
  [
    `// The candidate columns are projected by the session entry writer from the same entry
// (bindSessionNode: current_session_id = entry.sessionId, label = trimmed entry.label), so every
// row the callers keep is a candidate.
`,
    `// The candidate columns are projected by the session entry writer from the same entry
// (bindSessionNode: current_session_id = entry.sessionId, label = trimmed entry.label), so every
// row the callers keep is a candidate.
//
// ${MARKER}: match.updatedSince adds the rows whose updated_at column (bindSessionNode:
// entry.updatedAt) is at or after it, and every row the writer has not validated yet
// (entry_valid = 0; -1 rows do not parse and are never listed), for sessions.list activeMinutes.
`,
    'candidate column note',
  ],
  [
    `\tconst labels = strings(match.labels);
`,
    `\tconst labels = strings(match.labels);
\tconst updatedSince = typeof match.updatedSince === "number" && Number.isFinite(match.updatedSince) ? match.updatedSince : void 0;
`,
    'labels normalization',
  ],
  [
    `\t\t\tfor (const chunk of chunks(labels)) collect(db.selectFrom("session_nodes").select("session_key").where("label", "in", chunk));
`,
    `\t\t\tfor (const chunk of chunks(labels)) collect(db.selectFrom("session_nodes").select("session_key").where("label", "in", chunk));
\t\t\tif (updatedSince !== void 0) {
\t\t\t\tcollect(db.selectFrom("session_nodes").select("session_key").where("updated_at", ">=", updatedSince));
\t\t\t\tcollect(db.selectFrom("session_nodes").select("session_key").where("entry_valid", "=", 0));
\t\t\t}
`,
    'label candidates',
  ],
]);
export const patchMatching = matching.patch;
export const unpatchMatching = matching.unpatch;

// ---- session-utils-list-BUP03AzS.js ----
export const LIST = 'session-utils-list-BUP03AzS.js';
export const LIST_BEFORE = 'a6e3d70fba29547fa1a9e303216fb0743798b8b71896c9e3a2eaaa5f5fc8f0a7';
const list = swap([
  [
    `//#endregion
export { listSessionVisibilityRowsFromStore, `,
    `// ${MARKER}: the rows the Workboard lifecycle sweep lists (sessions.list lifecycleOnly). It reads key,
// updatedAt, status and abortedLastRun; sessions.list adds hasActiveRun (and a running status) from
// the active-run registry, which reads sessionId and agentId. Same selection as
// listSessionsFromStoreAsync and the same derivation as buildGatewaySessionRow (the list's row context
// and clock: status from the displayed subagent run, agentId from the row classification), without
// the model, thinking, usage, ACP, child-session and transcript projections.
function listSessionLifecycleRowsFromStore(params) {
\tconst { cfg, store, opts } = params;
\tconst now = Date.now();
\tconst userProfileIdentityById = /* @__PURE__ */ new Map();
\tlet rowContext;
\tconst getRowContext = () => {
\t\trowContext ??= buildSessionListRowMetadataContext({
\t\t\tnow,
\t\t\tuserProfileIdentityById
\t\t});
\t\treturn rowContext;
\t};
\tconst hasSpawnedByFilter = typeof opts.spawnedBy === "string" && opts.spawnedBy.length > 0;
\tconst selection = selectSessionEntries({
\t\tcfg,
\t\tstore,
\t\topts,
\t\tnow,
\t\t...params.entryFilter ? { entryFilter: params.entryFilter } : {},
\t\tdefaultLimit: SESSIONS_LIST_DEFAULT_LIMIT,
\t\tgetRowContext: hasSpawnedByFilter || Boolean(normalizeOptionalString(opts.search)) ? getRowContext : void 0,
\t\tuserProfileIdentityById,
\t\tconfiguredAgentIds: new Set(listAgentIds(cfg)),
\t\tinvolvingActorId: params.involvingActorId,
\t\townerFirstActorId: params.ownerFirstActorId
\t});
\t// A few rows (the per-minute sweep: ~9 on V) each read their own scoped run index, as a single-row load does
\t// (v-subagent-scoped-row-index-v1), instead of the whole registry (9,436 runs on V, re-read on every call
\t// because the state database keeps changing). A row's status reads only its own displayed run.
\tconst scopedRows = selection.entries.length <= 64 && process.env.OPENCLAW_V_SCOPED_ROW_SUBAGENT_RUNS !== "0";
\tconst sessions = selection.entries.map(([key, entry]) => {
\t\tconst parsedAgent = parseAgentSessionKey(key);
\t\tconst rowAgentId = !parsedAgent && typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : void 0;
\t\tconst sessionAgentId = normalizeAgentId(parsedAgent?.agentId ?? rowAgentId ?? resolveSessionStoreAgentId(cfg, key));
\t\tconst subagentIndex = (scopedRows ? void 0 : getRowContext().subagentRuns) ?? buildSingleRowSubagentRunIndex(now, {
\t\t\tkey,
\t\t\tstore
\t\t});
\t\tconst subagentRun = subagentIndex ? subagentIndex.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);
\t\tconst liveSubagentRunActive = isSubagentRunLive(subagentRun) || isSubagentRunQueued(subagentRun);
\t\tconst persistedSessionStatus = entry?.status;
\t\tconst subagentStatus = subagentRun ? liveSubagentRunActive ? resolveSubagentSessionStatus(subagentRun) : persistedSessionStatus === "running" ? void 0 : persistedSessionStatus ?? (typeof subagentRun.execution.endedAt === "number" ? resolveSubagentSessionStatus(subagentRun) : void 0) : void 0;
\t\tconst { agentId } = sessionClassificationForRow(cfg, key, sessionAgentId, entry);
\t\treturn {
\t\t\tkey,
\t\t\t...agentId ? { agentId } : {},
\t\t\tupdatedAt: entry?.updatedAt ?? null,
\t\t\tsessionId: entry?.sessionId,
\t\t\tabortedLastRun: entry?.abortedLastRun,
\t\t\tstatus: subagentRun ? subagentStatus : entry?.status
\t\t};
\t});
\treturn {
\t\tts: now,
\t\tcount: sessions.length,
\t\ttotalCount: selection.totalCount,
\t\tlimitApplied: selection.limitApplied,
\t\toffset: selection.offset > 0 ? selection.offset : void 0,
\t\tnextOffset: selection.nextOffset,
\t\thasMore: selection.hasMore,
\t\tsessions
\t};
}
//#endregion
export { listSessionLifecycleRowsFromStore, listSessionVisibilityRowsFromStore, `,
    'export list',
  ],
]);
export const patchList = list.patch;
export const unpatchList = list.unpatch;

// ---- sessions-read-C6mAMxyQ.js ----
export const READ = 'sessions-read-C6mAMxyQ.js';
export const READ_BEFORE = 'eb18ffa53ef8ff816f42010572e9cef083e575c6f16dc218b53f5866a7616a7a';
const read = swap([
  [
    'import { listSessionVisibilityRowsFromStore, _ as readSessionAutomationVersion, ',
    'import { listSessionLifecycleRowsFromStore, listSessionVisibilityRowsFromStore, _ as readSessionAutomationVersion, ',
    'session-utils-list import',
  ],
  [
    `\tconst cacheCompleted = params.request.activeMinutes === void 0 && !params.request.spawnedBy && params.request.visibilityRowsOnly !== true;
`,
    `\t// ${MARKER}: lifecycle rows lack them too.
\tconst cacheCompleted = params.request.activeMinutes === void 0 && !params.request.spawnedBy && params.request.visibilityRowsOnly !== true && !(params.request.lifecycleOnly === true && process.env.${ENV} !== "0");
`,
    'completed cache gate',
  ],
  [
    `\t\tconst run = () => measureDiagnosticsTimelineSpan("gateway.sessions.list", async function listVisibleSessions(options = {}) {
\t\t\tlet loaded = options.loaded;
\t\t\tif (!loaded) loaded = {
\t\t\t\t...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
\t\t\t\t\tagentId: p.agentId,
\t\t\t\t\tconfiguredAgentsOnly,
\t\t\t\t\tprojection: "list"
\t\t\t\t}), {
`,
    `\t\tconst run = () => measureDiagnosticsTimelineSpan("gateway.sessions.list", async function listVisibleSessions(options = {}) {
\t\t\t// ${MARKER}: the Workboard lifecycle sweep (lifecycleOnly, no visibility filter) gets lifecycle rows,
\t\t\t// and with activeMinutes its durable stores read only the rows updated in the window (one minute of
\t\t\t// slack before the selection's own cutoff, which is taken later).
\t\t\tconst lifecycleRows = p.lifecycleOnly === true && process.env.${ENV} !== "0" && !prepareSessionSharing({
\t\t\t\tclient,
\t\t\t\tcfg
\t\t\t}).entryFilter;
\t\t\tconst lifecycleUpdatedSince = lifecycleRows && typeof p.activeMinutes === "number" && Number.isFinite(p.activeMinutes) ? Date.now() - (Math.max(1, Math.floor(p.activeMinutes)) + 1) * 6e4 : void 0;
\t\t\tlet loaded = options.loaded;
\t\t\tif (!loaded) loaded = {
\t\t\t\t...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
\t\t\t\t\tagentId: p.agentId,
\t\t\t\t\tconfiguredAgentsOnly,
\t\t\t\t\tprojection: "list",
\t\t\t\t\t...lifecycleUpdatedSince !== void 0 ? { match: { updatedSince: lifecycleUpdatedSince } } : {}
\t\t\t\t}), {
`,
    'store load',
  ],
  [
    '(visibilityRowsOnly ? listSessionVisibilityRowsFromStore : listSessionsFromStoreAsync)({',
    '(visibilityRowsOnly ? listSessionVisibilityRowsFromStore : lifecycleRows ? listSessionLifecycleRowsFromStore : listSessionsFromStoreAsync)({',
    'row builder',
  ],
]);
export const patchRead = read.patch;
export const unpatchRead = read.unpatch;

// ---- sqlite-store-CH-caj1l.js ----
export const SQLITE = 'sqlite-store-CH-caj1l.js';
export const SQLITE_BEFORE = '12c1f54644fb13a2babe6d043af32b7d097b71eca9c5cf8ef77d259a935d9b28';
// The automation keys the sweep reads (boardId for a card's workboard session key, launch, workspace for
// worktree cleanup candidates), as SQLite's JSON text (->). A row whose automation is not a JSON object
// (invalid, or another JSON value) keeps automation_json for the original parse.
const AUTOMATION_OBJECT = "json_valid(automation_json) AND json_type(automation_json) = 'object'";
const SWEEP_AUTOMATION_COLUMNS = `CASE WHEN ${AUTOMATION_OBJECT} THEN 1 ELSE 0 END AS automation_object, CASE WHEN ${AUTOMATION_OBJECT} THEN NULL ELSE automation_json END AS automation_json, CASE WHEN ${AUTOMATION_OBJECT} THEN automation_json -> '$.boardId' END AS automation_board_id, CASE WHEN ${AUTOMATION_OBJECT} THEN automation_json -> '$.launch' END AS automation_launch, CASE WHEN ${AUTOMATION_OBJECT} THEN automation_json -> '$.workspace' END AS automation_workspace`;
const STATE_COLUMNS = `id, status, position, created_at, updated_at, started_at, agent_id, session_key, run_id, execution_id, execution_mode, execution_status, execution_engine, execution_model, execution_session_key, execution_run_id, execution_started_at, execution_updated_at, ${SWEEP_AUTOMATION_COLUMNS}, claim_json, stale_json, archived_at, lifecycle_status_source_updated_at`;
const sqlite = swap([
  [
    'var WorkboardSqliteCardStore = class {\n',
    `// ${MARKER}: a card's lifecycle state from its parent row (no notes, labels or child tables): every card
// field the lifecycle sweep reads, built as readCard builds it. Events are left out; see
// lifecycleStatusTransition. Of the automation only boardId, launch and workspace are read.
const WORKBOARD_SWEEP_AUTOMATION_COLUMNS = ${JSON.stringify(SWEEP_AUTOMATION_COLUMNS)};
const WORKBOARD_LIFECYCLE_STATE_COLUMNS = ${JSON.stringify(STATE_COLUMNS)};
function readSweepAutomation(row) {
\tif (row.automation_object !== 1) return parseJson(row.automation_json);
\tconst automation = {};
\tif (typeof row.automation_board_id === "string") automation.boardId = JSON.parse(row.automation_board_id);
\tif (typeof row.automation_launch === "string") automation.launch = JSON.parse(row.automation_launch);
\tif (typeof row.automation_workspace === "string") automation.workspace = JSON.parse(row.automation_workspace);
\treturn automation;
}
function readCardLifecycleState(row) {
\tconst automation = readSweepAutomation(row);
\tconst claim = parseJson(row.claim_json);
\tconst stale = parseJson(row.stale_json);
\tconst lifecycleStatusSourceUpdatedAt = numberValue(row, "lifecycle_status_source_updated_at");
\tconst execution = readExecution(row);
\treturn {
\t\tid: requiredString(row, "id"),
\t\tstatus: requiredString(row, "status"),
\t\tposition: requiredNumber(row, "position"),
\t\tcreatedAt: requiredNumber(row, "created_at"),
\t\tupdatedAt: requiredNumber(row, "updated_at"),
\t\t...stringValue(row, "agent_id") ? { agentId: stringValue(row, "agent_id") } : {},
\t\t...stringValue(row, "session_key") ? { sessionKey: stringValue(row, "session_key") } : {},
\t\t...stringValue(row, "run_id") ? { runId: stringValue(row, "run_id") } : {},
\t\t...execution ? { execution } : {},
\t\t...numberValue(row, "started_at") !== void 0 ? { startedAt: numberValue(row, "started_at") } : {},
\t\tmetadata: {
\t\t\t...automation ? { automation } : {},
\t\t\t...claim ? { claim } : {},
\t\t\t...numberValue(row, "archived_at") !== void 0 ? { archivedAt: numberValue(row, "archived_at") } : {},
\t\t\t...stale ? { stale } : {},
\t\t\t...lifecycleStatusSourceUpdatedAt !== void 0 ? { lifecycleStatusSourceUpdatedAt } : {}
\t\t}
\t};
}
var WorkboardSqliteCardStore = class {
`,
    'card store class',
  ],
  [
    '\tasync listLifecycleLinks() {\n',
    `\t/** ${MARKER}: lifecycle states of the unarchived cards (as listLifecycleMatchLinks skips archived rows), in entries() order. */
\tasync listLifecycleStates() {
\t\treturn this.db.prepare(\`SELECT \${WORKBOARD_LIFECYCLE_STATE_COLUMNS} FROM workboard_cards
\t\t\tWHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0)
\t\t\tORDER BY created_at ASC, id ASC\`).all().map(readCardLifecycleState);
\t}
\t/** ${MARKER}: the event latestStatusTransitionAt returns for a card in this status: the last created (status not todo) or status-changing moved event into it. */
\tasync lifecycleStatusTransition(cardId, status) {
\t\tconst row = this.db.prepare(\`SELECT kind, at, from_status, to_status FROM workboard_card_events
\t\t\tWHERE card_id = ? AND to_status = ? AND ((kind = 'created' AND ? <> 'todo') OR (kind = 'moved' AND (from_status IS NULL OR from_status = '' OR from_status <> to_status)))
\t\t\tORDER BY ordinal DESC LIMIT 1\`).get(cardId, status, status);
\t\tif (!row) return;
\t\treturn {
\t\t\tkind: requiredString(row, "kind"),
\t\t\tat: requiredNumber(row, "at"),
\t\t\t...stringValue(row, "from_status") ? { fromStatus: stringValue(row, "from_status") } : {},
\t\t\ttoStatus: requiredString(row, "to_status")
\t\t};
\t}
\t/** ${MARKER}: listLifecycleLinks for the lifecycle sweep, with the automation keys it reads. */
\tasync listLifecycleSweepLinks() {
\t\treturn this.db.prepare(\`SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, \${WORKBOARD_SWEEP_AUTOMATION_COLUMNS}, archived_at FROM workboard_cards ORDER BY created_at ASC, id ASC\`).all().map((row) => {
\t\t\tconst link = readCardLifecycleLink({ ...row, automation_json: null });
\t\t\tconst automation = readSweepAutomation(row);
\t\t\tif (automation) link.metadata = { automation, ...link.metadata };
\t\t\treturn link;
\t\t});
\t}
\tasync listLifecycleLinks() {
`,
    'lifecycle links method',
  ],
]);
export const patchSqlite = sqlite.patch;
export const unpatchSqlite = sqlite.unpatch;

// ---- runtime-api-1CCazqtv.js ----
export const RUNTIME = 'runtime-api-1CCazqtv.js';
export const RUNTIME_BEFORE = '3bc03ce67684e78c753e73acecc21aefba43d8eb5e614f89f9295a7c82f96985';
const runtime = swap([
  [
    '\t\t\t...typeof store.listLifecycleMatchLinks === "function" ? {listLifecycleMatchLinks: async () => await store.listLifecycleMatchLinks()} : {},\n',
    `\t\t\t...typeof store.listLifecycleMatchLinks === "function" ? {listLifecycleMatchLinks: async () => await store.listLifecycleMatchLinks()} : {},
\t\t\t// ${MARKER}
\t\t\t...typeof store.listLifecycleSweepLinks === "function" ? {listLifecycleSweepLinks: async () => await store.listLifecycleSweepLinks()} : {},
\t\t\t...typeof store.listLifecycleStates === "function" ? {listLifecycleStates: async () => await store.listLifecycleStates()} : {},
\t\t\t...typeof store.lifecycleStatusTransition === "function" ? {lifecycleStatusTransition: async (cardId, status) => await store.lifecycleStatusTransition(cardId, status)} : {},
`,
    'card store wrapper',
  ],
  [
    '\tasync list(options = {}) {\n',
    `\t/** ${MARKER}: lifecycle states of the unarchived cards, sorted as list() sorts. */
\tasync listLifecycleStates() {
\t\treturn (await this.cardStore.listLifecycleStates()).toSorted(compareCards);
\t}
\tasync lifecycleStatusTransition(cardId, status) {
\t\treturn await this.cardStore.lifecycleStatusTransition(cardId, status);
\t}
\tasync list(options = {}) {
`,
    'store list method',
  ],
]);
export const patchRuntime = runtime.patch;
export const unpatchRuntime = runtime.unpatch;

// ---- extensions/workboard/index.js ----
export const INDEX = 'extensions/workboard/index.js';
export const INDEX_BEFORE = '610d45feca74199c313a83640a520c6b4108e7a0390e4b8ac4612106b9330804';
const index = swap([
  [
    `async function readWorkboardLifecycleLinks(store) {
\treturn typeof store.cardStore?.listLifecycleLinks === "function" ? await store.cardStore.listLifecycleLinks() : void 0;
}
`,
    `async function readWorkboardLifecycleLinks(store) {
\t// ${MARKER}: the same links with only the automation keys this sweep reads (no JSON parse of every card's automation).
\tif (typeof store.cardStore?.listLifecycleSweepLinks === "function" && process.env.${ENV} !== "0") return await store.cardStore.listLifecycleSweepLinks();
\treturn typeof store.cardStore?.listLifecycleLinks === "function" ? await store.cardStore.listLifecycleLinks() : void 0;
}
`,
    'lifecycle links read',
  ],
  [
    `\t\t// v-workboard-sweep-light-v1: decide on the card the sweep already listed; only cards that would change
\t\t// pay for a queued mutation and a fresh read with child rows.
\t\tif (typeof params.store.lifecycleSyncPatch === "function" && params.store.lifecycleSyncPatch(card, workboardLifecycleSyncInput({
\t\t\tobservation,
\t\t\tnow,
\t\t\tassociation
\t\t})) === void 0) continue;
`,
    `\t\t// v-workboard-sweep-light-v1: decide on the card the sweep already listed; only cards that would change
\t\t// pay for a queued mutation and a fresh read with child rows.
\t\tif (typeof params.store.lifecycleSyncPatch === "function") {
\t\t\tconst syncInput = workboardLifecycleSyncInput({
\t\t\t\tobservation,
\t\t\t\tnow,
\t\t\t\tassociation
\t\t\t});
\t\t\tif (params.store.lifecycleSyncPatch(card, syncInput) === void 0) continue;
\t\t\t// ${MARKER}: a lifecycle state has no events, so the status fence (shouldSkipPersistedLifecycleStatusUpdate)
\t\t\t// never skips it and the check above passes a superset of cards. Re-decide with the one event the fence
\t\t\t// reads when it would read events.
\t\t\tif (params.projected && card.metadata?.lifecycleStatusSourceUpdatedAt === void 0) {
\t\t\t\tconst transition = await params.store.lifecycleStatusTransition(card.id, card.status);
\t\t\t\tif (transition && params.store.lifecycleSyncPatch({
\t\t\t\t\t...card,
\t\t\t\t\tevents: [transition]
\t\t\t\t}, syncInput) === void 0) continue;
\t\t\t}
\t\t}
`,
    'sweep no-op check',
  ],
  [
    `\t\t\t\t\t\tif (!cards) {
\t\t\t\t\t\t\tconst snapshotIds = full ? void 0 : workboardLifecycleSnapshotCardIds(links, snapshot.sessions);
\t\t\t\t\t\t\tcardIds = snapshotIds && snapshotIds.length <= WORKBOARD_LIFECYCLE_HYDRATE_LIMIT ? [...new Set([...cardIds, ...snapshotIds])] : void 0;
\t\t\t\t\t\t\tcards = await readCards();
\t\t\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\t\t}
\t\t\t\t\t\tconst changed = await syncWorkboardLifecycleSessions({
\t\t\t\t\t\t\tstore: params.store,
\t\t\t\t\t\t\tcards,
\t\t\t\t\t\t\t...snapshot,
\t\t\t\t\t\t\tnow: params.now?.() ?? Date.now()
\t\t\t\t\t\t});
`,
    `\t\t\t\t\t\tlet projected = false;
\t\t\t\t\t\tif (!cards) {
\t\t\t\t\t\t\tconst snapshotIds = full ? void 0 : workboardLifecycleSnapshotCardIds(links, snapshot.sessions);
\t\t\t\t\t\t\tcardIds = snapshotIds && snapshotIds.length <= WORKBOARD_LIFECYCLE_HYDRATE_LIMIT ? [...new Set([...cardIds, ...snapshotIds])] : void 0;
\t\t\t\t\t\t\t// ${MARKER}: where this read every card with its child rows, decide on lifecycle states; worktree
\t\t\t\t\t\t\t// cleanup (below) reads its candidates, the worktree cards, in full.
\t\t\t\t\t\t\tif (!cardIds && typeof params.store.cardStore?.listLifecycleStates === "function" && typeof params.store.cardStore?.lifecycleStatusTransition === "function" && process.env.${ENV} !== "0") {
\t\t\t\t\t\t\t\tprojected = true;
\t\t\t\t\t\t\t\tcards = await params.store.listLifecycleStates();
\t\t\t\t\t\t\t\tcardIds = workboardWorktreeLinkIds(links);
\t\t\t\t\t\t\t} else cards = await readCards();
\t\t\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\t\t}
\t\t\t\t\t\tconst changed = await syncWorkboardLifecycleSessions({
\t\t\t\t\t\t\tstore: params.store,
\t\t\t\t\t\t\tcards,
\t\t\t\t\t\t\t...snapshot,
\t\t\t\t\t\t\t...projected ? { projected: true } : {},
\t\t\t\t\t\t\tnow: params.now?.() ?? Date.now()
\t\t\t\t\t\t});
`,
    'sweep card read',
  ],
  [
    '\t\t\t\t\t\tif (changed !== 0) cards = await readCards();\n',
    '\t\t\t\t\t\tif (changed !== 0 || projected) cards = await readCards();\n',
    'post-sync card read',
  ],
]);
export const patchIndex = index.patch;
export const unpatchIndex = index.unpatch;

export const FILES = [
  [MATCHING, MATCHING_BEFORE, patchMatching, unpatchMatching],
  [LIST, LIST_BEFORE, patchList, unpatchList],
  [READ, READ_BEFORE, patchRead, unpatchRead],
  [SQLITE, SQLITE_BEFORE, patchSqlite, unpatchSqlite],
  [RUNTIME, RUNTIME_BEFORE, patchRuntime, unpatchRuntime],
  [INDEX, INDEX_BEFORE, patchIndex, unpatchIndex],
];
