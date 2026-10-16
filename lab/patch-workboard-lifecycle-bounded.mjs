import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one patch anchor: ${before.slice(0, 90)}`);
  return source.replace(before, after);
};

export function patchSqlite(source) {
  assert(!source.includes('WORKBOARD_LIFECYCLE_STATE_COLUMNS'), 'already patched');
  const columns = 'id, status, position, created_at, updated_at, started_at, agent_id, session_key, run_id, execution_id, execution_kind, execution_mode, execution_status, execution_engine, execution_model, execution_session_key, execution_run_id, execution_started_at, execution_updated_at, automation_json, claim_json, stale_json, archived_at, lifecycle_status_source_updated_at';
  source = once(source, 'var WorkboardSqliteCardStore = class {', `// Parent-row state only: never notes, attempts, comments, artifacts or full event histories.
const WORKBOARD_LIFECYCLE_STATE_COLUMNS = ${JSON.stringify(columns)};
function readCardLifecycleState(row) {
\tconst link = readCardLifecycleLink(row);
\tconst claim = parseJson(row.claim_json);
\tconst stale = parseJson(row.stale_json);
\tconst sourceUpdatedAt = numberValue(row, "lifecycle_status_source_updated_at");
\treturn {
\t\t...link,
\t\tstatus: requiredString(row, "status"),
\t\tposition: requiredNumber(row, "position"),
\t\tcreatedAt: requiredNumber(row, "created_at"),
\t\tupdatedAt: requiredNumber(row, "updated_at"),
\t\t...numberValue(row, "started_at") !== void 0 ? { startedAt: numberValue(row, "started_at") } : {},
\t\t...readExecution(row) ? { execution: readExecution(row) } : {},
\t\tmetadata: {
\t\t\t...link.metadata,
\t\t\t...claim ? { claim } : {},
\t\t\t...stale ? { stale } : {},
\t\t\t...sourceUpdatedAt !== void 0 ? { lifecycleStatusSourceUpdatedAt: sourceUpdatedAt } : {}
\t\t}
\t};
}
var WorkboardSqliteCardStore = class {`);
  source = once(source, '\tasync listLifecycleLinks() {', `\tasync listLifecycleStates() {
\t\tconst rows = this.db.prepare(\`SELECT \${WORKBOARD_LIFECYCLE_STATE_COLUMNS} FROM workboard_cards ORDER BY created_at ASC, id ASC\`).all();
\t\tconst states = [];
\t\tfor (let i = 0; i < rows.length; i += 1) {
\t\t\tstates.push(readCardLifecycleState(rows[i]));
\t\t\tif ((i + 1) % 128 === 0) await new Promise((resolve) => setImmediate(resolve));
\t\t}
\t\treturn states;
\t}
\tasync lookupLifecycleState(key) {
\t\tconst row = this.db.prepare(\`SELECT \${WORKBOARD_LIFECYCLE_STATE_COLUMNS} FROM workboard_cards WHERE id = ?\`).get(key);
\t\tif (!row) return;
\t\tconst state = readCardLifecycleState(row);
\t\t// The original lifecycle guard falls back to the last status-transition event.
\t\t// Match reverse ordinal order, including NULL from_status on moved events.
\t\tif (state.metadata.lifecycleStatusSourceUpdatedAt === void 0) {
\t\t\tconst event = this.db.prepare(\`SELECT kind, at, from_status, to_status FROM workboard_card_events
\t\t\t\tWHERE card_id = ? AND to_status = ? AND
\t\t\t\t((kind = 'created' AND to_status <> 'todo') OR (kind = 'moved' AND from_status IS NOT to_status))
\t\t\t\tORDER BY ordinal DESC LIMIT 1\`).get(key, state.status);
\t\t\tif (event) state.events = [{ kind: event.kind, at: event.at,
\t\t\t\t...event.from_status ? { fromStatus: event.from_status } : {}, toStatus: event.to_status }];
\t\t}
\t\treturn state;
\t}
\tasync listLifecycleLinks() {`);
  return source;
}

export function patchRuntime(source) {
  assert(!source.includes('function buildWorkboardLifecyclePatch('), 'already patched');
  const start = source.indexOf('\tasync syncLifecycle(id, input) {');
  const end = source.indexOf('\n\tasync prepareStart(', start);
  assert(start > 0 && end > start);
  const method = source.slice(start, end);
  const bodyStart = method.indexOf('(card) => {') + '(card) => {'.length;
  const bodyEnd = method.indexOf('\n\t\t\t}, { allowAutomationLaunch: true }');
  assert(bodyStart > 0 && bodyEnd > bodyStart);
  const patchBody = method.slice(bodyStart, bodyEnd).replace(/^\t{4}/gm, '\t');
  source = once(source, 'var WorkboardStore = class WorkboardStore extends WorkboardNotificationStore {', `// The exact native patch builder is shared by the narrow no-op check and the CAS path.
// A projection is never persisted: possible changes always reload the complete current card.
function buildWorkboardLifecyclePatch(card, input) {${patchBody}
}
var WorkboardStore = class WorkboardStore extends WorkboardNotificationStore {`);
  source = once(source, method, `\tasync syncLifecycle(id, input) {
\t\treturn await this.enqueueMutation(async () => {
\t\t\tif (typeof this.cardStore?.lookupLifecycleState === "function") {
\t\t\t\tconst state = await this.cardStore.lookupLifecycleState(id);
\t\t\t\tif (!state) throw new Error(\`card not found: \${id}\`);
\t\t\t\tif (!buildWorkboardLifecyclePatch(state, input)) return false;
\t\t\t}
\t\t\treturn (await this.updateLatestCard(id, (card) => buildWorkboardLifecyclePatch(card, input), { allowAutomationLaunch: true })).updated;
\t\t});
\t}`);
  source = once(source, '\tasync listLifecycleCandidates(source) {', `\tasync listLifecycleStates() {
\t\tif (typeof this.cardStore?.listLifecycleStates !== "function") return;
\t\treturn (await this.cardStore.listLifecycleStates()).toSorted(compareCards);
\t}
\tasync listLifecycleCandidates(source) {`);
  const anchor = '\t\t\t...typeof store.listLifecycleLinks === "function" ? {listLifecycleLinks: async () => await store.listLifecycleLinks()} : {},';
  source = once(source, anchor, `${anchor}
\t\t\t...typeof store.listLifecycleStates === "function" ? {listLifecycleStates: async () => await store.listLifecycleStates()} : {},
\t\t\t...typeof store.lookupLifecycleState === "function" ? {lookupLifecycleState: async (key) => await store.lookupLifecycleState(key)} : {},`);
  return source;
}

export function patchPlugin(source) {
  assert(!source.includes('let states = await params.store.listLifecycleStates?.();'), 'already patched');
  source = once(source, '\tlet count = 0;\n\tfor (const card of params.cards ?? await params.store.list()) {', `\tlet count = 0;
\tlet visited = 0;
\tfor (const card of params.cards ?? await params.store.list()) {
\t\t// Promise-only mutation queues do not give the socket poll phase a turn.
\t\tif (++visited % 32 === 0) await new Promise((resolve) => setImmediate(resolve));`);
  const anchor = '\t\t\t\ttry {\n\t\t\t\t\tconst links = await readWorkboardLifecycleLinks(params.store);';
  source = once(source, anchor, `\t\t\t\ttry {
\t\t\t\t\tlet states = await params.store.listLifecycleStates?.();
\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\tif (states) {
\t\t\t\t\t\t// Keep native sweep scope, ordering, full-session cadence and cleanup budgets.
\t\t\t\t\t\t// Only the representation changes: full cards are loaded by mutations/cleanup.
\t\t\t\t\t\tlet selected;
\t\t\t\t\t\tconst hasLinks = states.some(workboardLinkNeedsReconciliation);
\t\t\t\t\t\tlet window = [];
\t\t\t\t\t\tif (hasLinks) {
\t\t\t\t\t\t\tconst worktreeIds = workboardWorktreeLinkIds(states);
\t\t\t\t\t\t\tconst start = worktreeLinkCursor % Math.max(worktreeIds.length, 1);
\t\t\t\t\t\t\twindow = [...worktreeIds.slice(start), ...worktreeIds.slice(0, start)].slice(0, WORKBOARD_WORKTREE_LINK_WINDOW);
\t\t\t\t\t\t\tworktreeLinkCursor = worktreeIds.length === 0 ? 0 : (start + window.length) % worktreeIds.length;
\t\t\t\t\t\t}
\t\t\t\t\t\tif (states.some(needsWorkboardLifecycleReconciliation)) try {
\t\t\t\t\t\t\tconst sweepStartedAt = Date.now();
\t\t\t\t\t\t\tconst full = lastSweepStartedAt === void 0 || lastFullSweepAt === void 0 || sweepStartedAt - lastFullSweepAt >= WORKBOARD_LIFECYCLE_FULL_SWEEP_MS || sweepStartedAt < lastSweepStartedAt || states.some((card) => !card.metadata?.archivedAt && card.metadata?.automation?.launch?.phase === "prepared");
\t\t\t\t\t\t\tconst snapshot = await params.readSessions({
\t\t\t\t\t\t\t\tincludeUnknown: states.some((card) => !card.metadata?.archivedAt && cardSessionKey(card) === "unknown"),
\t\t\t\t\t\t\t\t...full ? {} : { activeMinutes: Math.ceil((sweepStartedAt - lastSweepStartedAt) / 6e4) + 1 }
\t\t\t\t\t\t\t});
\t\t\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\t\t\tconst snapshotIds = full ? void 0 : workboardLifecycleSnapshotCardIds(states, snapshot.sessions);
\t\t\t\t\t\t\tif (hasLinks && snapshotIds && snapshotIds.length <= WORKBOARD_LIFECYCLE_HYDRATE_LIMIT) {
\t\t\t\t\t\t\t\tselected = new Set([...window, ...snapshotIds]);
\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t// As before, observe card state after the asynchronous session read.
\t\t\t\t\t\t\tstates = await params.store.listLifecycleStates();
\t\t\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\t\t\tconst changed = await syncWorkboardLifecycleSessions({ store: params.store,
\t\t\t\t\t\t\t\tcards: selected ? states.filter((card) => selected.has(card.id)) : states,
\t\t\t\t\t\t\t\t...snapshot, now: params.now?.() ?? Date.now() });
\t\t\t\t\t\t\tif (generation !== owner) return;
\t\t\t\t\t\t\tif (snapshot.listed === true) {
\t\t\t\t\t\t\t\tlastSweepStartedAt = sweepStartedAt;
\t\t\t\t\t\t\t\tif (full) lastFullSweepAt = sweepStartedAt;
\t\t\t\t\t\t\t}
\t\t\t\t\t\t\tif (changed !== 0) states = await params.store.listLifecycleStates();
\t\t\t\t\t\t} catch (error) {
\t\t\t\t\t\t\tctx.logger.warn(\`workboard lifecycle sync failed: \${String(error)}\`);
\t\t\t\t\t\t}
\t\t\t\t\t\tif (generation === owner) await cleanupWorktrees(selected ? states.filter((card) => selected.has(card.id)) : states, (message) => ctx.logger.warn(message));
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tconst links = await readWorkboardLifecycleLinks(params.store);`);
  return source;
}

export function build(root = new URL('./', import.meta.url)) {
  for (const [input, output, patch] of [
    ['workboard-start-context/sqlite-store-CH-caj1l.js', 'sqlite-store-CH-caj1l.js', patchSqlite],
    ['workboard-start-context/runtime-api-1CCazqtv.js', 'runtime-api-1CCazqtv.js', patchRuntime],
    ['workboard-sweep-links/index.js', 'index.js', patchPlugin],
  ]) fs.writeFileSync(new URL(`release-files/workboard-lifecycle-bounded/${output}`, root), patch(fs.readFileSync(new URL(`release-files/${input}`, root), 'utf8')));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
