import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// gateway-fullread-hotpaths (V Gateway 30-40 s main-thread stalls, see lab/gateway-fullread-hotpaths.md):
// four periodic or per-run paths stop materializing every session entry / task / workboard card.
// Applies to V's db91-release-v2026.9.1-db91.6 bytes (also the shared VLab runtime on 2026-10-20).
// OPENCLAW_V_FULLREAD_HOTPATHS=0 restores the original reads at every patched site.
export const MARKER = 'v-gateway-fullread-hotpaths-v1';
export const RELEASE_DIR = 'lab/release-files/gateway-fullread-hotpaths';
const OFF = 'process.env.OPENCLAW_V_FULLREAD_HOTPATHS === "0"';

export const FILES = {
  // 1. resolveCronSession: every cron run parsed the whole store (full projection, never cached)
  //    to look at one or two keys.
  'session-D4AJhdUK.js': {
    before: 'aa29d9709e92f6e8f7fa1c624b84f94e03e74492d8bd8dfed61df35a10b9cdb1',
    replacements: [
      [
        'import { d as loadSessionEntry } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
        'import { d as loadSessionEntry, l as loadExactSessionEntry } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
      ],
      [
        '/** Resolves or rolls over the cron session entry for one isolated-agent run. */\nfunction resolveCronSession(params) {',
        `// ${MARKER}: the run reads (and later writes) only its own key and, for a bound
// "current" job, the source key; callers never enumerate the store. Each key is read exactly, on
// the same writable handle and full projection as the whole-store read, and errors still throw.
// The whole-store read parsed ~335 MB of entry JSON per cron run on V (2026-10-19).
function readCronSessionStoreKeys(params) {
	const store = {};
	for (const sessionKey of new Set(params.sessionKeys)) {
		if (!sessionKey || sessionKey !== sessionKey.trim()) continue;
		const loaded = loadExactSessionEntry({
			agentId: params.agentId,
			storePath: params.storePath,
			sessionKey
		});
		if (loaded) store[sessionKey] = loaded.entry;
	}
	return store;
}
/** Resolves or rolls over the cron session entry for one isolated-agent run. */
function resolveCronSession(params) {`,
      ],
      [
        `	const store = params.store ?? Object.fromEntries(listSessionEntriesCore({
		agentId: params.agentId,
		storePath
	}).map(({ sessionKey, entry }) => [sessionKey, entry]));`,
        `	const store = params.store ?? (${OFF} ? Object.fromEntries(listSessionEntriesCore({
		agentId: params.agentId,
		storePath
	}).map(({ sessionKey, entry }) => [sessionKey, entry])) : readCronSessionStoreKeys({
		agentId: params.agentId,
		storePath,
		sessionKeys: [params.sessionKey, params.sourceSessionKey?.trim()]
	}));`,
      ],
    ],
  },
  // 2. sweepCronRunSessions: every 5 minutes per agent, parsed the whole store (full projection)
  //    to find cron run keys; V had none.
  'service-CzmmKrEg.js': {
    before: 'e4fa375a7d41594328e70c383339e56e538f64daa7f49365074434cc1d894cda',
    replacements: [
      [
        'import { f as loadSessionEntryReadOnly, u as loadExactSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
        'import { f as loadSessionEntryReadOnly, loadExactSessionEntriesReadOnly, o as listSessionEntryKeysReadOnly, u as loadExactSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n',
      ],
      [
        `/**
* Sweeps completed isolated cron run sessions while preserving base cron sessions.
*`,
        `// ${MARKER}: list keys only (no entry JSON), keep cron run keys, then read just
// those rows (full projection, one snapshot) in key order, as the whole-store read returned them.
function listCronRunSessionEntries(scope) {
	if (${OFF}) return listSessionEntriesCore(scope);
	const keys = listSessionEntryKeysReadOnly(scope).filter((sessionKey) => isCronRunSessionKey(sessionKey));
	return keys.length === 0 ? [] : loadExactSessionEntriesReadOnly({
		...scope,
		projection: "full"
	}, keys);
}
/**
* Sweeps completed isolated cron run sessions while preserving base cron sessions.
*`,
      ],
      [
        `		for (const { sessionKey, entry } of listSessionEntriesCore({
			agentId: params.agentId,
			storePath
		})) {
			if (!isCronRunSessionKey(sessionKey)) continue;`,
        `		for (const { sessionKey, entry } of listCronRunSessionEntries({
			agentId: params.agentId,
			storePath
		})) {
			if (!isCronRunSessionKey(sessionKey)) continue;`,
      ],
    ],
  },
  // 3. runTaskRegistryMaintenance: every 60 s cloned every task (detail structuredClone'd) only to
  //    iterate task ids and group cron history; each task is re-read with getTaskById anyway.
  'task-registry.maintenance-C4nMaDY9.js': {
    before: '00e9bdb46e0874179c52f34e4754e257ee5331a4890dd52b7123ea5d303293d9',
    replacements: [
      [
        'import { j as ensureTaskRegistryReady } from "./task-registry-activity-DSlVVJwD.js";\n',
        'import { et as vLiveTaskRecords, j as ensureTaskRegistryReady, w as compareTasksNewestFirst } from "./task-registry-activity-DSlVVJwD.js";\n',
      ],
      [
        'async function runTaskRegistryMaintenance() {',
        `// ${MARKER}: the sweep reads ids and cron-history fields from the live records, in
// listTaskRecords order, without cloning them; every decision still uses getTaskById's fresh copy.
function listTaskRecordsForMaintenanceSweep() {
	if (taskRegistryMaintenanceRuntime !== defaultTaskRegistryMaintenanceRuntime || ${OFF}) return taskRegistryMaintenanceRuntime.listTaskRecords();
	return [...vLiveTaskRecords.values()].map((task, insertionIndex) => ({
		createdAt: task.createdAt,
		insertionIndex,
		task
	})).toSorted(compareTasksNewestFirst).map(({ task }) => task);
}
async function runTaskRegistryMaintenance() {`,
      ],
      [
        `	let pruned = 0;
	const tasks = taskRegistryMaintenanceRuntime.listTaskRecords();
	const cronHistoryOverflowTaskIds = collectCronHistoryOverflowTaskIds(tasks);`,
        `	let pruned = 0;
	const tasks = listTaskRecordsForMaintenanceSweep();
	const cronHistoryOverflowTaskIds = collectCronHistoryOverflowTaskIds(tasks);`,
      ],
    ],
  },
  // 4. Workboard lifecycle candidates: every subagent/agent end parsed every card's automation JSON
  //    (7,505 cards, 13 MB on V) to match one session key.
  'sqlite-store-CH-caj1l.js': {
    before: '9043747801b1f3e590f8194da6bb33e41322abc36f32ace8abad07f87a5149a0',
    replacements: [
      [
        'var WorkboardSqliteCardStore = class {',
        `// ${MARKER}: the lifecycle matcher reads automation.boardId only, and only for a card
// without a linked session key (it then derives the card's workboard session key). For those rows
// SQLite returns boardId when it is a JSON string or absent; any other shape (or invalid JSON) keeps
// the row's automation JSON for the original parse. Rows with an integer non-zero archived_at are
// skipped: the matcher drops them.
function readCardLifecycleMatchLink(row) {
	const automation = row.automation_json !== null && row.automation_json !== void 0 ? parseJson(row.automation_json) : row.automation_board_type === "text" ? { boardId: row.automation_board_id } : void 0;
	return {
		id: requiredString(row, "id"),
		...stringValue(row, "agent_id") ? {agentId: stringValue(row, "agent_id")} : {},
		...stringValue(row, "session_key") ? {sessionKey: stringValue(row, "session_key")} : {},
		...stringValue(row, "run_id") ? {runId: stringValue(row, "run_id")} : {},
		...stringValue(row, "execution_id") ? {execution: {
			...stringValue(row, "execution_session_key") ? {sessionKey: stringValue(row, "execution_session_key")} : {},
			...stringValue(row, "execution_run_id") ? {runId: stringValue(row, "execution_run_id")} : {}
		}} : {},
		metadata: {
			...automation ? {automation} : {},
			...numberValue(row, "archived_at") !== void 0 ? {archivedAt: numberValue(row, "archived_at")} : {}
		}
	};
}
var WorkboardSqliteCardStore = class {`,
      ],
      [
        `	async listLifecycleLinks() {
		return this.db.prepare("SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, automation_json, archived_at FROM workboard_cards ORDER BY created_at ASC, id ASC").all().map(readCardLifecycleLink);
	}`,
        `	async listLifecycleLinks() {
		return this.db.prepare("SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, automation_json, archived_at FROM workboard_cards ORDER BY created_at ASC, id ASC").all().map(readCardLifecycleLink);
	}
	async listLifecycleMatchLinks() {
		return this.db.prepare(\`SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, archived_at,
          CASE WHEN linked THEN NULL WHEN json_valid(automation_json) THEN json_type(automation_json, '$.boardId') END AS automation_board_type,
          CASE WHEN linked THEN NULL WHEN json_valid(automation_json) THEN json_extract(automation_json, '$.boardId') END AS automation_board_id,
          CASE WHEN linked OR automation_json IS NULL OR automation_json = '' THEN NULL
            WHEN json_valid(automation_json) AND (json_type(automation_json, '$.boardId') IS NULL OR json_type(automation_json, '$.boardId') IN ('null', 'text')) THEN NULL
            ELSE automation_json END AS automation_json
        FROM (SELECT *, (coalesce(session_key, '') <> '' OR (coalesce(execution_id, '') <> '' AND coalesce(execution_session_key, '') <> '')) AS linked
          FROM workboard_cards
          WHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0))
        ORDER BY created_at ASC, id ASC\`).all().map(readCardLifecycleMatchLink);
	}`,
      ],
    ],
  },
  'runtime-api-1CCazqtv.js': {
    before: '64c75937b86979ed594fcbd8b904d323bff5dd2c864bdca3e8a1fd6c94f916c5',
    replacements: [
      [
        '			...typeof store.listLifecycleLinks === "function" ? {listLifecycleLinks: async () => await store.listLifecycleLinks()} : {},\n',
        '			...typeof store.listLifecycleLinks === "function" ? {listLifecycleLinks: async () => await store.listLifecycleLinks()} : {},\n			...typeof store.listLifecycleMatchLinks === "function" ? {listLifecycleMatchLinks: async () => await store.listLifecycleMatchLinks()} : {},\n',
      ],
      [
        `		if (!this.cardStore?.listLifecycleLinks) return await this.list();
		const links = await this.cardStore.listLifecycleLinks();`,
        `		if (!this.cardStore?.listLifecycleLinks) return await this.list();
		// ${MARKER}: narrow match projection (no automation JSON parse, archived rows skipped).
		const links = typeof this.cardStore.listLifecycleMatchLinks === "function" && !(${OFF}) ? await this.cardStore.listLifecycleMatchLinks() : await this.cardStore.listLifecycleLinks();`,
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
