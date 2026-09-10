// Materialize an exact, reviewable code-only patch from the current release.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = {baseRelease: null, files: []};
const sha = s => createHash('sha256').update(s).digest('hex');
function once(s, a, b) { assert.equal(s.split(a).length, 2, a.slice(0, 100)); return s.replace(a, b); }
function read(name) {
  const r = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--repo', '/Users/tianyicai/vlab-dev', '--target', 'openclaw/dist/' + name], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2}));
  plan.baseRelease ??= r.current.release; assert.equal(plan.baseRelease, r.current.release);
  const s = Buffer.from(r.content, 'base64').toString(); assert.equal(sha(s), r.sha256);
  const fixture = path.join(root, 'lab/fixtures/concurrency-native-baseline/' + name);
  if (!fs.existsSync(fixture)) fs.writeFileSync(fixture, s, {flag: 'wx'});
  plan.files.push({source: 'lab/release-files/' + name, target: 'openclaw/dist/' + name, before: r.sha256});
  return s;
}
const evictionName = 'session-history-eviction-d5aiCsHS.js';
let eviction = read(evictionName);
eviction = once(eviction, '\tconst selectedEntries = readSessionEntryStore(database, { sessionKeys: selectedKeys });', '\tconst selectedEntryRows = readSessionEntryStore(database, { sessionKeys: selectedKeys });\n\tconst selectedEntries = params.planOnly === true ? Object.fromEntries(Object.entries(selectedEntryRows).map(([key, entry]) => [key, cloneSessionEntry(entry)])) : selectedEntryRows;');
eviction = once(eviction, '\tconst archivedWorktrees = [];\n\tfor (const key of archivedKeys)', '\tconst plannedEntryArchives = [];\n\tconst archivedWorktrees = [];\n\tfor (const key of archivedKeys)');
eviction = once(eviction, '\t\tentry.archivedAt = planned.archivedAt;\n\t\twriteSessionEntry(database, key, entry);', '\t\tconst expectedEntry = params.planOnly === true ? cloneSessionEntry(entry) : void 0;\n\t\tentry.archivedAt = planned.archivedAt;\n\t\tif (params.planOnly === true) plannedEntryArchives.push({sessionKey: key, expectedEntry, entry: cloneSessionEntry(entry)});\n\t\telse writeSessionEntry(database, key, entry);');
const regionStart = eviction.indexOf('function applySessionEntryMaintenance('), regionEnd = eviction.indexOf('/** Finalizes maintenance after its caller releases the per-store writer lane. */');
let region = eviction.slice(regionStart, regionEnd);
assert.equal(region.split('\t\t...archivedWorktrees.length ? { archivedWorktrees } : {},').length, 3);
region = region.replaceAll('\t\t...archivedWorktrees.length ? { archivedWorktrees } : {},', '\t\t...params.planOnly === true ? { plannedEntryArchives } : {},\n\t\t...archivedWorktrees.length ? { archivedWorktrees } : {},');
eviction = eviction.slice(0, regionStart) + region + eviction.slice(regionEnd);
eviction += `
// Automatic planning is read-only. Revalidate exact entry snapshots at commit.
export function commitPlannedSessionMaintenanceArchives(database, plan) {
  const pending = plan.plannedEntryArchives ?? [];
  const {unchanged} = partitionUnchangedPlannedLifecycleArtifactEntries(database, pending);
  const committedKeys = new Set(unchanged.map(item => item.sessionKey));
  for (const item of unchanged) writeSessionEntry(database, item.sessionKey, item.entry);
  const {plannedEntryArchives, ...committed} = plan;
  return {...committed, archived: unchanged.length,
    ...(plan.archivedWorktrees ? {archivedWorktrees: plan.archivedWorktrees.filter(item => committedKeys.has(item.sessionKey))} : {})};
}
`;
fs.writeFileSync(path.join(root, 'lab/release-files/' + evictionName), eviction);
const entryName = 'session-accessor.sqlite-entry-BlklNPKQ.js';
let entry = read(entryName);
entry = 'import {acquireAutomaticMaintenancePermit} from "./automatic-maintenance-coordinator.mjs";\nimport {l as runSqliteDeferredTransactionSync, o as tryAcquireExclusiveSqliteCoordinator} from "./node-sqlite-CL-d6drd.js";\nimport {commitPlannedSessionMaintenanceArchives} from "./session-history-eviction-d5aiCsHS.js";\n' + entry;
entry = once(entry, '\t\tconst generation = owner.generation;\n\t\tconst activeSessionKeys', `		// Incognito has no shared physical store. All ordinary file-backed callers
		// use the existing native coordinator primitive on a data-free sidecar.
		let permit;
		try {
			permit = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env})
				? {finish() {}}
				: acquireAutomaticMaintenancePermit(owner.database, tryAcquireExclusiveSqliteCoordinator, {
					onReleaseError: error => getChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance coordinator release failed", {error})
				});
		} catch (error) {
			getChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance coordinator failed", {error});
			if (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
			return;
		}
		if (!permit) {
			if (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
			return;
		}
		let completed = false;
		const generation = owner.generation;
		const activeSessionKeys`);
entry = once(entry, `				return runOpenClawAgentWriteTransaction((database) => applySessionEntryMaintenance(database, {
					activeSessionKeys,
					archiveDirectory: owner.archiveDirectory,
					maintenanceConfig: owner.maintenanceConfig,
					storePath: owner.storePath
				}), toDatabaseOptions(owner.scope));`, `				// Global selection runs in a native deferred read snapshot, not BEGIN
				// IMMEDIATE. Foreground writers in other processes remain unblocked.
				const planned = runSqliteDeferredTransactionSync(owner.database.db, () => applySessionEntryMaintenance(owner.database, {
					activeSessionKeys,
					archiveDirectory: owner.archiveDirectory,
					maintenanceConfig: owner.maintenanceConfig,
					storePath: owner.storePath,
					planOnly: true
				}));
				if (!planned.plannedEntryArchives?.length) return planned;
				return withSqliteBeginContentionRetry({database: owner.database.db,
					run: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(owner.scope)),
					operation: database => isCurrent() ? commitPlannedSessionMaintenanceArchives(database, planned) : void 0});`);
entry = once(entry, '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });', '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n\t\t\tcompleted = true;');
entry = once(entry, '\t\t}\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;', '\t\t} finally {\n\t\t\tpermit.finish(completed);\n\t\t}\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;');
fs.writeFileSync(path.join(root, 'lab/release-files/' + entryName), entry);
plan.files.push({source: 'lab/release-files/automatic-maintenance-coordinator.mjs', target: 'openclaw/dist/automatic-maintenance-coordinator.mjs', before: null});
fs.writeFileSync(path.join(root, 'lab/short-maintenance-transactions-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify(plan));
