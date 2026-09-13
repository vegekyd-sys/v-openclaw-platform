import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const marker = 'vlab-openclaw94-operational-parity-v1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperSources = new Map([
  ['automatic-maintenance-coordinator.mjs', path.join(root, 'lab/release-files/automatic-maintenance-coordinator.mjs')],
  ['database-verify-resource-group.mjs', path.join(root, 'lab/release-files/database-verify-resource-group.mjs')],
  ['workboard-lookup-cache.mjs', path.join(root, 'lab/release-files/workboard-lookup-cache.mjs')],
]);

const sha256 = value => createHash('sha256').update(value).digest('hex');
function once(source, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`OpenClaw 9.4 operational parity anchor mismatch (${count}): ${before.slice(0, 120)}`);
  return source.replace(before, after);
}

export function patchMaintenance(source, coordinatorModule) {
  if (source.includes(`${marker}:maintenance`)) return source;
  let output = `import {acquireAutomaticMaintenancePermit} from "./automatic-maintenance-coordinator.mjs"; // ${marker}:maintenance\n` +
    `import { a as tryAcquireExclusiveSqliteCoordinator } from "./${coordinatorModule}";\n` + source;
  output = once(output,
    '\twhile (isCurrent()) {\n\t\tconst generation = owner.generation;',
    `\twhile (isCurrent()) {
\t\tlet permit;
\t\ttry {
\t\t\tpermit = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env})
\t\t\t\t? {finish() {}}
\t\t\t\t: acquireAutomaticMaintenancePermit(owner.database, tryAcquireExclusiveSqliteCoordinator, {
\t\t\t\t\tonReleaseError: error => getChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance coordinator release failed", {error})
\t\t\t\t});
\t\t} catch (error) {
\t\t\tgetChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance coordinator failed", {error});
\t\t\tif (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
\t\t\treturn;
\t\t}
\t\tif (!permit) {
\t\t\tif (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
\t\t\treturn;
\t\t}
\t\tlet completed = false;
\t\tconst generation = owner.generation;`);
  output = once(output,
    '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n\t\t} catch (error) {',
    '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n\t\t\tcompleted = true;\n\t\t} catch (error) {');
  output = once(output,
    '\t\t\t});\n\t\t}\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;',
    '\t\t\t});\n\t\t} finally {\n\t\t\tpermit.finish(completed);\n\t\t}\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;');
  return output;
}

export function patchVerifier(source) {
  if (source.includes(`${marker}:verifier`)) return source;
  let output = `import {prepareVerifyResourceGroup} from "./database-verify-resource-group.mjs"; // ${marker}:verifier\n` + source;
  output = once(output,
    '\tlet worker;\n\ttry {\n\t\tworker = fork(',
    '\tlet worker;\n\ttry {\n\t\tconst resourceGroup = prepareVerifyResourceGroup();\n\t\tworker = fork(');
  output = once(output,
    '\t\t});\n\t} catch (error) {\n\t\treturn Promise.reject(toStructuredErrorObject(error));',
    '\t\t});\n\t\tresourceGroup?.attach(worker.pid);\n\t} catch (error) {\n\t\tworker?.once("error", () => {});\n\t\tworker?.kill();\n\t\treturn Promise.reject(toStructuredErrorObject(error));');
  return output;
}

export function patchWorkboard(source) {
  if (source.includes(`${marker}:workboard-cache`)) return source;
  let output = `import {lookupWorkboardSnapshot} from "./workboard-lookup-cache.mjs"; // ${marker}:workboard-cache\n` + source;
  output = once(output,
    '\tasync lookup(key) {\n\t\tconst row = this.db.prepare("SELECT * FROM workboard_cards WHERE id = ?").get(key);\n\t\treturn row ? {\n\t\t\tversion: 1,\n\t\t\tcard: readCard(this.db, row)\n\t\t} : void 0;\n\t}',
    '\tasync lookup(key) {\n\t\treturn lookupWorkboardSnapshot(this.db, key, () => {\n\t\t\tconst row = this.db.prepare("SELECT * FROM workboard_cards WHERE id = ?").get(key);\n\t\t\treturn row ? {\n\t\t\t\tversion: 1,\n\t\t\t\tcard: readCard(this.db, row)\n\t\t\t} : void 0;\n\t\t});\n\t}');
  return output;
}

async function unique(dist, pattern, anchor) {
  const matches = [];
  for (const name of (await fs.readdir(dist)).filter(candidate => pattern.test(candidate))) {
    const source = await fs.readFile(path.join(dist, name), 'utf8');
    if (source.includes(anchor)) matches.push({name, source});
  }
  assert.equal(matches.length, 1, `Expected one ${pattern} containing ${anchor}; got ${matches.length}`);
  return matches[0];
}

export async function buildPatch(core) {
  const pkg = JSON.parse(await fs.readFile(path.join(core, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '2026.9.4', 'Requires reviewed OpenClaw 2026.9.4');
  const dist = path.join(core, 'dist');
  const coordinator = await unique(dist, /^sqlite-coordinator-[\w-]+\.mjs$/, 'function tryAcquireExclusiveSqliteCoordinator(');
  const maintenance = await unique(dist, /^session-accessor\.sqlite-entry-[\w-]+\.mjs$/, 'function kickSessionEntryMaintenanceAfterWrite(');
  const verifier = await unique(dist, /^openclaw-database-verify-[\w-]+\.mjs$/, 'function runDatabaseVerifyWorker(');
  const workboard = await unique(dist, /^sqlite-store-[\w-]+\.mjs$/, 'var WorkboardSqliteCardStore = class');
  const changes = [
    {name: maintenance.name, before: maintenance.source, after: patchMaintenance(maintenance.source, coordinator.name)},
    {name: verifier.name, before: verifier.source, after: patchVerifier(verifier.source)},
    {name: workboard.name, before: workboard.source, after: patchWorkboard(workboard.source)},
  ];
  for (const [name, sourceFile] of helperSources) {
    const after = await fs.readFile(sourceFile, 'utf8');
    const before = await fs.readFile(path.join(dist, name), 'utf8').catch(error => {
      if (error?.code !== 'ENOENT') throw error;
      return null;
    });
    if (before !== null && before !== after) throw new Error(`Existing ${name} differs from reviewed source`);
    changes.push({name, before, after});
  }
  return changes;
}

async function atomicWrite(file, content, metadata) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, {mode: metadata.mode});
  await fs.chown(temporary, metadata.uid, metadata.gid);
  await fs.rename(temporary, file);
}

export async function applyPatch(core, apply = false) {
  const changes = await buildPatch(core);
  const manifest = {patch: marker, version: '2026.9.4', files: changes.map(({name, before, after}) => ({
    name, before: before === null ? null : sha256(before), after: sha256(after), changed: before !== after,
  }))};
  if (apply && changes.some(change => change.before !== change.after)) {
    const backup = path.join(core, `.${marker}.backup`);
    await fs.mkdir(backup);
    for (const change of changes) if (change.before !== null) await fs.writeFile(path.join(backup, change.name), change.before);
    await fs.writeFile(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const dist = path.join(core, 'dist');
    for (const change of changes) if (change.before !== change.after) {
      const target = path.join(dist, change.name);
      const metadata = change.before === null ? await fs.stat(path.join(dist, changes[0].name)) : await fs.stat(target);
      await atomicWrite(target, change.after, metadata);
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [core, mode] = process.argv.slice(2);
  if (!core || !path.isAbsolute(core) || !['--check', '--apply'].includes(mode)) {
    console.error('Usage: node patch-openclaw94-operational-parity.mjs /absolute/core --check|--apply');
    process.exitCode = 1;
  } else applyPatch(core, mode === '--apply').then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
