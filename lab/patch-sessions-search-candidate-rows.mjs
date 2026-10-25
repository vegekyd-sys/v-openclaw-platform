import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// sessions_search lists its candidate sessions with one sessions.list of visibility fields per scope
// (see lab/sessions-search-candidate-rows.md).
//
// The tool lists every session it may search before searching: sessions.list in pages of 200, for
// archived=false and archived=true, once without agentId and once with the requester's agent. On V
// (makaron: 9,869 sessions, 2026-10-25) that is ~100 sessions.list calls per search, each on a new
// Gateway connection from the worker, each loading the whole list projection and building full rows
// (model, thinking, usage, sharing, placement, active runs) for its page, 0.3-4.9 s on the Gateway
// main thread. Of each row the tool reads key, agentId, parentSessionKey and spawnedBy, for its
// row visibility check.
//
// sessions.list accepts visibilityRowsOnly: rows with only those four fields, derived as
// buildGatewaySessionRow derives them, from the same selection (filters, archived, order, paging),
// and the same sharing visibility filter when the caller has one. The tool asks for archived "all"
// in pages of 10,000 with it: two calls per search on V instead of ~100. A Gateway without the
// parameter rejects it as an invalid sessions.list parameter; the tool then pages as before.
// OPENCLAW_V_SESSIONS_SEARCH_CANDIDATE_ROWS=0 (worker and Gateway environment) restores the old
// paging in the tool.

export const MARKER = 'sessions-search-candidate-rows';
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

// ---- src-B9mb84px.js: sessions.list parameter schema (closed object) ----
export const SCHEMA = 'src-B9mb84px.js';
export const SCHEMA_BEFORE = '24cc77ba4cb12e8b25d9006d081f646bc2c021386c047d66452d918bcb29c995';
const schema = swap([
  [
    `\tlifecycleOnly: Type.Optional(Type.Boolean()),\n`,
    `\tlifecycleOnly: Type.Optional(Type.Boolean()),
\t/** ${MARKER}: rows carry only key, agentId, parentSessionKey and spawnedBy (session tools' row visibility check). */
\tvisibilityRowsOnly: Type.Optional(Type.Boolean()),
`,
    'lifecycleOnly schema field',
  ],
]);
export const patchSchema = schema.patch;
export const unpatchSchema = schema.unpatch;

// ---- session-utils-list-BUP03AzS.js: the visibility-row projection ----
export const LIST = 'session-utils-list-BUP03AzS.js';
export const LIST_BEFORE = '779063a67aef63b59f38a4774e6f89023c32d11b8f44691fe7e069d139c08d8e';
const list = swap([
  [
    `\t\treturn buildSessionsListResult(params, list, sessions);
\t});
}
//#endregion
export {`,
    `\t\treturn buildSessionsListResult(params, list, sessions);
\t});
}
// ${MARKER}: the rows sessions_search lists only to run its row visibility check, which reads key,
// agentId, parentSessionKey and spawnedBy. Same selection as listSessionsFromStoreAsync (filters,
// archived, order, offset/limit) and the same derivation as buildGatewaySessionRow (the list's row
// context and clock: spawnedBy from the displayed subagent run's controller, agentId from the row
// classification), without the model, thinking, usage, ACP, child-session and transcript projections.
function listSessionVisibilityRowsFromStore(params) {
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
\tconst sessions = selection.entries.map(([key, entry]) => {
\t\tconst parsedAgent = parseAgentSessionKey(key);
\t\tconst rowAgentId = !parsedAgent && typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : void 0;
\t\tconst sessionAgentId = normalizeAgentId(parsedAgent?.agentId ?? rowAgentId ?? resolveSessionStoreAgentId(cfg, key));
\t\tconst subagentIndex = getRowContext().subagentRuns ?? buildSingleRowSubagentRunIndex(now, {
\t\t\tkey,
\t\t\tstore
\t\t});
\t\tconst subagentRun = subagentIndex ? subagentIndex.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);
\t\tconst subagentOwner = normalizeOptionalString(subagentRun?.controllerSessionKey) || normalizeOptionalString(subagentRun?.requesterSessionKey);
\t\tconst { agentId } = sessionClassificationForRow(cfg, key, sessionAgentId, entry);
\t\treturn {
\t\t\tkey,
\t\t\tspawnedBy: subagentOwner || entry?.spawnedBy,
\t\t\t...agentId ? { agentId } : {},
\t\t\tparentSessionKey: entry?.parentSessionKey
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
export { listSessionVisibilityRowsFromStore,`,
    'list module tail and export',
  ],
]);
export const patchSessionList = list.patch;
export const unpatchSessionList = list.unpatch;

// ---- sessions-read-C6mAMxyQ.js: sessions.list handler ----
export const READ = 'sessions-read-C6mAMxyQ.js';
export const READ_BEFORE = '2d2d0fb1da978015e168ba3d6c05965104b84bb1bf7a2acd08173582a421267a';
const read = swap([
  [
    `import { _ as readSessionAutomationVersion, n as listSessionsFromStoreAsync,`,
    `import { listSessionVisibilityRowsFromStore, _ as readSessionAutomationVersion, n as listSessionsFromStoreAsync,`,
    'session list import',
  ],
  [
    // Visibility rows have none of the active-run fields resolveSessionListExpiration checks before
    // keeping a result, so they are not kept (in-flight requests are still shared).
    `\tconst cacheCompleted = params.request.activeMinutes === void 0 && !params.request.spawnedBy;\n`,
    `\t// ${MARKER}: visibility rows lack the active-run fields that decide whether a list may be kept.
\tconst cacheCompleted = params.request.activeMinutes === void 0 && !params.request.spawnedBy && params.request.visibilityRowsOnly !== true;
`,
    'completed-list cache condition',
  ],
  [
    `\t\t\tconst lifecycleOnly = p.lifecycleOnly === true && !visibilityFilter;\n`,
    `\t\t\tconst lifecycleOnly = p.lifecycleOnly === true && !visibilityFilter;
\t\t\t// ${MARKER}: rows with only the session tools' visibility fields; the sharing projection runs
\t\t\t// only for a caller with a visibility filter (it decides which rows that caller sees).
\t\t\tconst visibilityRowsOnly = p.visibilityRowsOnly === true;
`,
    'lifecycleOnly flag',
  ],
  [
    `\t\t\tconst result = await measureDiagnosticsTimelineSpan("gateway.sessions.list.rows", () => listSessionsFromStoreAsync({\n`,
    `\t\t\tconst result = await measureDiagnosticsTimelineSpan("gateway.sessions.list.rows", () => (visibilityRowsOnly ? listSessionVisibilityRowsFromStore : listSessionsFromStoreAsync)({\n`,
    'row listing call',
  ],
  [
    `\t\t\tconst { sharingTargets, membershipKeys } = lifecycleOnly ? {\n`,
    `\t\t\tconst { sharingTargets, membershipKeys } = lifecycleOnly || visibilityRowsOnly && !visibilityFilter ? {\n`,
    'sharing stage condition',
  ],
  [
    `\t\t\tconst projectPlacement = lifecycleOnly ? () => ({}) : createSessionPlacementBatchProjector(context, result.sessions);
\t\t\tconst trackedActiveRuns = collectTrackedActiveSessionRuns(context);
\t\t\tconst projectedAgentRunIndex = buildProjectedAgentRunIndex();
\t\t\tconst sharing = prepareSessionSharing({
\t\t\t\tclient,
\t\t\t\tcfg
\t\t\t});
\t\t\tconst sessions = measureDiagnosticsTimelineSpanSync("gateway.sessions.list.active_run_flags", () => {\n`,
    `\t\t\tconst projectPlacement = lifecycleOnly || visibilityRowsOnly ? () => ({}) : createSessionPlacementBatchProjector(context, result.sessions);
\t\t\tconst trackedActiveRuns = visibilityRowsOnly ? void 0 : collectTrackedActiveSessionRuns(context);
\t\t\tconst projectedAgentRunIndex = visibilityRowsOnly ? void 0 : buildProjectedAgentRunIndex();
\t\t\tconst sharing = prepareSessionSharing({
\t\t\t\tclient,
\t\t\t\tcfg
\t\t\t});
\t\t\tconst sessions = visibilityRowsOnly ? result.sessions : measureDiagnosticsTimelineSpanSync("gateway.sessions.list.active_run_flags", () => {\n`,
    'row decoration',
  ],
]);
export const patchSessionsRead = read.patch;
export const unpatchSessionsRead = read.unpatch;

// ---- openclaw-tools-BODVdJQD.js: sessions_search candidate listing ----
export const TOOLS = 'openclaw-tools-BODVdJQD.js';
export const TOOLS_BEFORE = 'af27d9ae18e783d376b31ed9e5ad6082a305225bdfadde53e58f0045c7cd6019';
const tools = swap([
  [
    `\tconst listPages = async (agentId) => {
\t\tfor (const archived of [false, true]) {
\t\t\tlet offset = 0;
\t\t\twhile (true) {
\t\t\t\tconst page = await params.gatewayCall({
\t\t\t\t\tmethod: "sessions.list",
\t\t\t\t\tparams: {
\t\t\t\t\t\tlimit: 200,
\t\t\t\t\t\toffset,
\t\t\t\t\t\tarchived,
\t\t\t\t\t\tincludeGlobal: !params.restrictToSpawned,
\t\t\t\t\t\tincludeUnknown: false,
\t\t\t\t\t\t...agentId ? { agentId } : {},
\t\t\t\t\t\t...params.restrictToSpawned ? { spawnedBy: params.effectiveRequesterKey } : {}
\t\t\t\t\t}
\t\t\t\t});
`,
    `\t// ${MARKER}: active and archived sessions in one listing of the fields read below, 10,000 rows a
\t// page (was 200-row pages per archived state: ~100 sessions.list calls per search on V). A Gateway
\t// without visibilityRowsOnly rejects it as an invalid parameter; then the 200-row pages as before.
\tlet candidateRows = process.env.OPENCLAW_V_SESSIONS_SEARCH_CANDIDATE_ROWS !== "0";
\tconst listPages = async (agentId) => {
\t\tfor (const archived of candidateRows ? ["all"] : [false, true]) {
\t\t\tlet offset = 0;
\t\t\twhile (true) {
\t\t\t\tlet page;
\t\t\t\ttry {
\t\t\t\t\tpage = await params.gatewayCall({
\t\t\t\t\t\tmethod: "sessions.list",
\t\t\t\t\t\tparams: {
\t\t\t\t\t\t\tlimit: candidateRows ? 1e4 : 200,
\t\t\t\t\t\t\toffset,
\t\t\t\t\t\t\tarchived,
\t\t\t\t\t\t\tincludeGlobal: !params.restrictToSpawned,
\t\t\t\t\t\t\tincludeUnknown: false,
\t\t\t\t\t\t\t...agentId ? { agentId } : {},
\t\t\t\t\t\t\t...params.restrictToSpawned ? { spawnedBy: params.effectiveRequesterKey } : {},
\t\t\t\t\t\t\t...candidateRows ? { visibilityRowsOnly: true } : {}
\t\t\t\t\t\t}
\t\t\t\t\t});
\t\t\t\t} catch (error) {
\t\t\t\t\tif (!candidateRows || offset !== 0 || !/invalid sessions\\.list params/iu.test(String(error?.message ?? error))) throw error;
\t\t\t\t\tcandidateRows = false;
\t\t\t\t\treturn await listPages(agentId);
\t\t\t\t}
`,
    'sessions_search candidate listing',
  ],
]);
export const patchSessionsSearchTool = tools.patch;
export const unpatchSessionsSearchTool = tools.unpatch;

export const FILES = [
  [SCHEMA, SCHEMA_BEFORE, patchSchema, unpatchSchema],
  [LIST, LIST_BEFORE, patchSessionList, unpatchSessionList],
  [READ, READ_BEFORE, patchSessionsRead, unpatchSessionsRead],
  [TOOLS, TOOLS_BEFORE, patchSessionsSearchTool, unpatchSessionsSearchTool],
];
