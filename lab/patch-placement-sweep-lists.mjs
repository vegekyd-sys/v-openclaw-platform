import assert from 'node:assert/strict';

// The once-a-minute worker placement sweep stops reading every placement row.
//
// worker_session_placements holds one row per session that ever ran a local turn (V 2394 on
// 2026-10-05, the shared VLab mirror ~3,900). store.list() reads every row with SELECT * and
// decodes each one through the placement row codec. A read-only profile of the shared VLab
// Gateway on 2026-10-06 (release firsttext-r1-20261006, after #193's absence-only evidence)
// still showed the minute sweep at 410-730 ms on the main thread: placement-store list(), the
// codec's fromRow and GC. Each minute the sweep called list():
//   - once in session retirement, which then read session evidence for every row;
//   - twice per publishPlacementChanges (a before and an after snapshot) for both the reconcile
//     sweep and the auto-suspend sweep, to find the five fields whose change is announced;
//   - once in the disk-space sweep, which keeps only active placements;
//   - twice per connected node when node workspace retention publishes, which keeps only the
//     placements of that node's environments;
//   - once per environment reconcile in the reconcile guard, which keeps one environment's.
//
// This adds two read-only store methods and uses them where they return the same answer:
//   listChangeSnapshot()           the five announced fields of every row: one narrow SELECT, no codec
//   listByEnvironmentIds(ids)      full records whose environment_id is one of ids, by session id
// and reads the existing listForReconcile() (every state except local and reclaimed) and getMany()
// where only those rows can matter. A caller given a store without the new methods keeps list().
// The auto-suspend sweep only acts on an active placement without a turn claim, and only when a
// worker profile sets suspendAfter; when neither holds, the minute sweep now skips it, and with it
// that publication's before and after snapshots of every row.
//
// Session retirement between full passes checks only listForReconcile() placements, the ones that
// can own a worker environment that needs tearing down. Local and reclaimed rows (row cleanup
// only) are still retired by the startup pass, by every session-identity mutation pass, and by a
// full pass at most every 10 minutes, instead of every minute.

export const FULL_RETIREMENT_INTERVAL_MS = 600_000;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const STORE_MARKER = '\t\tlistChangeSnapshot() {\n';
const STARTUP_MARKER = 'const WORKER_PLACEMENT_FULL_RETIREMENT_INTERVAL_MS = ';

export function patchPlacementStore(source) {
  if (source.includes(STORE_MARKER)) return source;
  return replaceExactlyOnce(source,
    `\t\tlist() {
\t\t\tconst db = read();
\t\t\treturn executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().orderBy("session_id")).rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));
\t\t}
`,
    `\t\tlist() {
\t\t\tconst db = read();
\t\t\treturn executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().orderBy("session_id")).rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));
\t\t},
${STORE_MARKER}\t\t\treturn read().prepare("SELECT session_id, agent_id, session_key, state, transition_generation, updated_at_ms FROM worker_session_placements ORDER BY session_id").all().map((row) => ({
\t\t\t\tsessionId: row.session_id,
\t\t\t\tagentId: row.agent_id,
\t\t\t\tsessionKey: row.session_key,
\t\t\t\tstate: row.state,
\t\t\t\tgeneration: row.transition_generation,
\t\t\t\tupdatedAtMs: row.updated_at_ms
\t\t\t}));
\t\t},
\t\tlistByEnvironmentIds(environmentIds) {
\t\t\tconst ids = [...new Set(environmentIds)].filter((environmentId) => typeof environmentId === "string" && environmentId.length > 0);
\t\t\tconst records = [];
\t\t\tconst db = read();
\t\t\tfor (let offset = 0; offset < ids.length; offset += 250) for (const row of executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().where("environment_id", "in", ids.slice(offset, offset + 250))).rows) records.push(withWorkspaceResultConflict(fromRow$1(row)));
\t\t\treturn records.toSorted((left, right) => left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0);
\t\t}
`,
    'placement store list()');
}

export function patchPlacementStartup(source) {
  if (source.includes(STARTUP_MARKER)) return source;
  let out = source;
  out = replaceExactlyOnce(out,
    '\tconst snapshotPlacements = () => new Map(params.placements.list().map((placement) => [placement.sessionId, {',
    '\tconst snapshotPlacements = () => new Map((typeof params.placements.listChangeSnapshot === "function" ? params.placements.listChangeSnapshot() : params.placements.list()).map((placement) => [placement.sessionId, {',
    'change snapshot');
  out = replaceExactlyOnce(out,
    '\t\tconst references = params.placements.list().filter((placement) => placement.environmentId === environmentId);',
    '\t\tconst references = (typeof params.placements.listByEnvironmentIds === "function" ? params.placements.listByEnvironmentIds([environmentId]) : params.placements.list()).filter((placement) => placement.environmentId === environmentId);',
    'reconcile guard references');
  out = replaceExactlyOnce(out,
    '\t\tplacements: options.placements.list().filter((placement) => placement.environmentId !== null && environmentIds.has(placement.environmentId))',
    '\t\tplacements: (typeof options.placements.listByEnvironmentIds === "function" ? options.placements.listByEnvironmentIds([...environmentIds]) : options.placements.list()).filter((placement) => placement.environmentId !== null && environmentIds.has(placement.environmentId))',
    'node bundle hash placements');
  out = replaceExactlyOnce(out,
    '\tconst placements = new Map(options.placements.list().map((placement) => [placement.sessionId, placement]));\n\tconst pendingResults',
    '\tconst placements = readNodeAttachedPlacements(options, nodeId);\n\tconst pendingResults',
    'node retain entries placements');
  out = replaceExactlyOnce(out,
    'function snapshotEntriesForNode(options, nodeId) {\n',
    `/** The placements attached to this node's environments, by session id (all of them without getMany). */
function readNodeAttachedPlacements(options, nodeId) {
	if (typeof options.placements.getMany === "function") try {
		return options.placements.getMany(nodeEnvironments(options, nodeId).flatMap((environment) => environment.attachedSessionIds).filter((sessionId) => typeof sessionId === "string" && sessionId.trim().length > 0));
	} catch {}
	return new Map(options.placements.list().map((placement) => [placement.sessionId, placement]));
}
function snapshotEntriesForNode(options, nodeId) {
`,
    'node retain entries');
  out = replaceExactlyOnce(out,
    '\t\tconst active = params.placements.list().filter((placement) => placement.state === "active");',
    '\t\tconst active = (typeof params.placements.listForReconcile === "function" ? params.placements.listForReconcile().toSorted((left, right) => left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0) : params.placements.list()).filter((placement) => placement.state === "active");',
    'disk-space active placements');
  out = replaceExactlyOnce(out,
    '\tconst reconcile = async () => {\n\t\tconst placements = deps.placements.list();\n',
    '\tconst reconcile = async (options) => {\n\t\tconst placements = options?.full === false && typeof deps.placements.listForReconcile === "function" ? deps.placements.listForReconcile() : deps.placements.list();\n',
    'session retirement list');
  out = replaceExactlyOnce(out,
    '\treturn { async sweep() {\n\t\tconst profiles = options.getConfig().cloudWorkers?.profiles;\n\t\tif (!profiles || !Object.values(profiles).some((profile) => profile.suspendAfter)) return;\n',
    '\treturn {\n\tenabled() {\n\t\tconst profiles = options.getConfig().cloudWorkers?.profiles;\n\t\treturn Boolean(profiles && Object.values(profiles).some((profile) => profile.suspendAfter)) && options.placements.listForReconcile().some((placement) => placement.state === "active" && !placement.turnClaim);\n\t},\n\tasync sweep() {\n\t\tconst profiles = options.getConfig().cloudWorkers?.profiles;\n\t\tif (!profiles || !Object.values(profiles).some((profile) => profile.suspendAfter)) return;\n',
    'auto-suspend sweep');
  out = replaceExactlyOnce(out,
    '\t\t\t\tif (stopped || placementIdleSuspend.current) return;\n',
    '\t\t\t\tif (stopped || placementIdleSuspend.current || placementIdleSweep.enabled?.() === false) return;\n',
    'auto-suspend start');
  out = replaceExactlyOnce(out,
    'const WORKER_PLACEMENT_RECONCILE_INTERVAL_MS = 6e4;\n',
    `const WORKER_PLACEMENT_RECONCILE_INTERVAL_MS = 6e4;\n/** Between full passes, the minute sweep retires only placements that can own a worker environment. */\n${STARTUP_MARKER}${FULL_RETIREMENT_INTERVAL_MS};\n`,
    'reconcile interval');
  out = replaceExactlyOnce(out,
    `\t\tlet stopped = false;
\t\tconst uninstallEnvironmentReconcileGuard = installWorkerPlacementReconcileGuard({`,
    `\t\tlet stopped = false;
\t\tlet lastFullRetirementAt;
\t\tconst uninstallEnvironmentReconcileGuard = installWorkerPlacementReconcileGuard({`,
    'runtime state');
  out = replaceExactlyOnce(out,
    `\t\tconst reconcileActivePlacements = () => {
\t\t\tif (stopped) return Promise.resolve();
\t\t\tif (placementReconcile.current) return placementReconcile.current;
\t\t\treturn trackOperation(placementReconcile, publishPlacementChanges(async () => {
\t\t\t\tawait sessionRetirement.reconcile();
`,
    `\t\tconst reconcileActivePlacements = (fullRetirement) => {
\t\t\tif (stopped) return Promise.resolve();
\t\t\tif (placementReconcile.current) return placementReconcile.current;
\t\t\tconst full = fullRetirement !== false;
\t\t\treturn trackOperation(placementReconcile, publishPlacementChanges(async () => {
\t\t\t\tif (full) lastFullRetirementAt = Date.now();
\t\t\t\tawait sessionRetirement.reconcile({ full });
`,
    'reconcile active placements');
  out = replaceExactlyOnce(out,
    '\t\t\treconcileActivePlacements().then(() => {',
    '\t\t\treconcileActivePlacements(lastFullRetirementAt === void 0 || Date.now() - lastFullRetirementAt >= WORKER_PLACEMENT_FULL_RETIREMENT_INTERVAL_MS || Date.now() < lastFullRetirementAt).then(() => {',
    'minute sweep');
  out = replaceExactlyOnce(out,
    '\t\t\ttrackOperation(placementReconcile, publishPlacementChanges(() => sessionRetirement.reconcile()), "Worker placement reconcile sweep failed");',
    '\t\t\tlastFullRetirementAt = Date.now();\n\t\t\ttrackOperation(placementReconcile, publishPlacementChanges(() => sessionRetirement.reconcile()), "Worker placement reconcile sweep failed");',
    'startup retirement');
  return out;
}
