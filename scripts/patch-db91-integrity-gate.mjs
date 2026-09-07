import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha = text => createHash('sha256').update(text).digest('hex');
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Native 9.1 anchor drift: ' + before.slice(0, 110));
  return source.replace(before, after);
}

export function patchMaintenance(source) {
  assert(!source.includes('db91VerifyCurrent'), 'already patched');
  const before = '\t\tverifyAndRepairCanonicalSqliteIndexes(database, pathname, OPENCLAW_AGENT_SCHEMA_SQL, {\n\t\t\tallowMissingColumns: true,\n\t\t\tvalidateAfterRepair: () => assertOpenClawAgentCurrentRuntimeSchema(database, {\n\t\t\t\tagentId,\n\t\t\t\tpathname\n\t\t\t})\n\t\t});';
  source = once(source, before, '\t\tdb91VerifyCurrent({db: database, filename: pathname, agentId, schemaSql: OPENCLAW_AGENT_SCHEMA_SQL,\n\t\t\tverifyFull: verifyAndRepairCanonicalSqliteIndexes, verifyContracts: repairCanonicalSqliteIndexes, options: {\n\t\t\tallowMissingColumns: true,\n\t\t\tvalidateAfterRepair: () => assertOpenClawAgentCurrentRuntimeSchema(database, {agentId, pathname})\n\t\t}});');
  return 'import { verifyCurrentAgentDatabase as db91VerifyCurrent } from "./db91-integrity-gate.mjs";\n' + source;
}

export function patchLifecycle(source) {
  assert(!source.includes('db91Invalidate'), 'already patched');
  source = once(source, '\tif (recorded) validatedAgentDatabasePaths.delete(path.resolve(pathname));', '\tif (recorded) { db91Invalidate(pathname, {reason: "native-terminal-failure"}); validatedAgentDatabasePaths.delete(path.resolve(pathname)); }');
  source = once(source, 'function clearOpenClawAgentDatabaseOpenFailure(pathname, options = {}) {\n', 'function clearOpenClawAgentDatabaseOpenFailure(pathname, options = {}) {\n\tdb91Invalidate(pathname, {reason: "quarantine-cleared"});\n');
  source = once(source, '\n\t\tif (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);\n', '\n\t\tif (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);\n\t\tif (!incognito) db91AssertConnection(cached.db, pathname);\n');
  source = once(source, '\n\tif (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);\n', '\n\tif (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);\n\tif (!incognitoDatabases.has(database)) db91AssertConnection(database.db, pathname);\n');
  source = once(source, '\t\topenedDb = db;\n', '\t\topenedDb = db;\n\t\tdb91RememberConnection(db, pathname);\n');
  source = once(source, '\t\topenedDatabase = database;\n', '\t\topenedDatabase = database;\n\t\tdb91AssertConnection(db, pathname);\n');
  source = once(source, 'function disposeOpenClawAgentDatabaseByPath(pathname, options = {}) {\n', 'function disposeOpenClawAgentDatabaseByPath(pathname, options = {}) {\n\tdb91Invalidate(pathname, {reason: "database-dispose"});\n');
  source = once(source, '\t\tassertNoOpenClawAgentDatabaseLeases(maintenance, options);\n', '\t\tassertNoOpenClawAgentDatabaseLeases(maintenance, options);\n\t\tdb91InvalidateAll({reason: "exclusive-maintenance"});\n');
  return 'import { invalidateVerification as db91Invalidate, invalidateAllVerifications as db91InvalidateAll, assertConnectionUsable as db91AssertConnection, rememberConnection as db91RememberConnection } from "./db91-integrity-gate.mjs";\n' + source;
}

export function patchVerifierWorker(source) {
  assert(!source.includes('db91BeginNative'), 'already patched');
  source = once(source, '\t\t\tconst prepared = await location.prepareSqliteReadOnlyLocationInProcess(target.path);', '\t\t\tconst db91Direct = target.kind === "agent" && Boolean(process.env.OPENCLAW_DB91_INTEGRITY_EPOCH);\n\t\t\tconst prepared = db91Direct ? {location: target.path} : await location.prepareSqliteReadOnlyLocationInProcess(target.path);');
  source = once(source, '\t\t\tdatabase = sqlite.openNodeSqliteDatabase(prepared.location, { readOnly: true });', '\t\t\tconst db91FileIdentity = db91Direct ? db91CaptureNative(target.path) : null;\n\t\t\tdatabase = sqlite.openNodeSqliteDatabase(prepared.location, { readOnly: true });');
  source = once(source, '\t\t\tdatabase.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);', '\t\t\tdatabase.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);\n\t\t\tif (db91Direct) database.exec("BEGIN;");');
  source = once(source, '\t\t\tintegrity.assertSqliteIntegrity(database, target.label);', '\t\t\tconst db91Ticket = target.kind === "agent" && prepared.location === target.path ? db91BeginNative(database, target.path, {expectedFileIdentity: db91FileIdentity}) : null;\n\t\t\tintegrity.assertSqliteIntegrity(database, target.label);\n\t\t\tconst db91Verification = db91FinishNative(database, target.path, db91Ticket);');
  source = once(source, '\t\t\tconst db91Verification = db91FinishNative(database, target.path, db91Ticket);', '\t\t\tconst db91Verification = db91FinishNative(database, target.path, db91Ticket);\n\t\t\tif (db91Direct) database.exec("ROLLBACK;");');
  source = once(source, '\t\t\t\tpath: target.path,\n\t\t\t\tok: true', '\t\t\t\tpath: target.path,\n\t\t\t\tdb91Verification,\n\t\t\t\tok: true');
  return 'import { captureNativeVerificationFile as db91CaptureNative, beginNativeVerification as db91BeginNative, finishNativeVerification as db91FinishNative } from "../db91-integrity-gate.mjs";\n' + source;
}

export function patchVerifierOwner(source) {
  assert(!source.includes('db91Publish'), 'already patched');
  source = once(source, '\t\tif (result.ok) {\n', '\t\tif (result.ok) {\n\t\t\ttry { db91Publish(result.db91Verification, result.path); } catch (error) { log$1.warn("DB91 verification cache refresh failed; native strict fallback remains", {error: String(error)}); }\n');
  return 'import { publishVerificationProof as db91Publish } from "./db91-integrity-gate.mjs";\n' + source;
}

export function patchEntry(source) {
  return once(source, '\t\trun: () => withCliProcessScope(() => runLegacyCliEntry(process.argv, void 0, { retainConsoleRoutingUntilProcessExit: true })),', '\t\trun: () => withCliProcessScope(async () => {\n\t\t\tif (process.env.OPENCLAW_DB91_INTEGRITY_ENABLE === "1") {\n\t\t\t\tconst { bootstrapGatewayIntegrity } = await import("./db91-integrity-bootstrap.mjs");\n\t\t\t\tawait bootstrapGatewayIntegrity({distDir: fileURLToPath(new URL("./", import.meta.url))});\n\t\t\t}\n\t\t\treturn runLegacyCliEntry(process.argv, void 0, { retainConsoleRoutingUntilProcessExit: true });\n\t\t}),');
}

export function buildPlan(core) {
  const dist = path.join(core, 'dist');
  const files = fs.readdirSync(dist).filter(name => name.endsWith('.js'));
  const select = (prefix, marker) => {
    const candidates = files.filter(name => name.startsWith(prefix) && fs.readFileSync(path.join(dist, name), 'utf8').includes(marker));
    assert.equal(candidates.length, 1, 'Ambiguous native bundle: ' + prefix);
    return path.join(dist, candidates[0]);
  };
  const targets = [
    [select('openclaw-agent-db-maintenance-', 'function assertAgentDatabaseIntegrityBeforeMutation('), patchMaintenance],
    [select('openclaw-agent-db-', 'function openOpenClawAgentDatabase('), patchLifecycle],
    [path.join(dist, 'state/openclaw-database-verify.worker.js'), patchVerifierWorker],
    [select('openclaw-database-verify-', 'function applyOpenClawDatabaseVerificationResults('), patchVerifierOwner],
    [path.join(dist, 'index.js'), patchEntry]
  ];
  const plan = targets.map(([filename, transform]) => {
    const before = fs.readFileSync(filename, 'utf8');
    return {filename, before, after: transform(before)};
  });
  const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../experiments/db91-integrity-gate');
  for (const [name, target] of [['gate.mjs', 'db91-integrity-gate.mjs'], ['bootstrap.mjs', 'db91-integrity-bootstrap.mjs']]) {
    const filename = path.join(dist, target);
    assert(!fs.existsSync(filename), 'Refuse to overwrite an existing helper');
    let after = fs.readFileSync(path.join(assets, name), 'utf8');
    if (name === 'bootstrap.mjs') after = after.replace("from './gate.mjs'", "from './db91-integrity-gate.mjs'");
    plan.push({filename, before: null, after});
  }
  return plan;
}

function writeFile(filename, text, template) {
  const stat = fs.statSync(template ?? filename);
  const temporary = filename + '.db91-' + process.pid + '.tmp';
  fs.writeFileSync(temporary, text, {flag: 'wx', mode: stat.mode & 0o777});
  fs.chownSync(temporary, stat.uid, stat.gid);
  fs.renameSync(temporary, filename);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, core, backup] = process.argv.slice(2);
  assert(['check', 'apply', 'ensure', 'rollback'].includes(action) && core && path.isAbsolute(core));
  assert.equal(fs.realpathSync(core), core);
  if (action === 'rollback') {
    assert(backup && path.isAbsolute(backup));
    const plan = JSON.parse(fs.readFileSync(path.join(backup, 'changes.json'), 'utf8'));
    assert(Array.isArray(plan) && plan.length === 7 && plan.every(p => p.filename.startsWith(core + '/dist/')));
    // A stopped process may have interrupted a multi-file installation. Accept
    // only exact before/after bytes; any third-party edit still blocks rollback.
    for (const p of plan) {
      const current = fs.existsSync(p.filename) ? fs.readFileSync(p.filename, 'utf8') : null;
      assert(current === p.after || current === p.before, 'Concurrent bundle change: rollback refused');
    }
    for (const p of plan) {
      const current = fs.existsSync(p.filename) ? fs.readFileSync(p.filename, 'utf8') : null;
      if (current === p.before) continue;
      if (p.before === null) fs.unlinkSync(p.filename); else writeFile(p.filename, p.before);
    }
    console.log(JSON.stringify({action, restored: plan.length}));
  } else {
    if (action === 'ensure' && backup && fs.existsSync(path.join(backup, 'changes.json'))) {
      const prior = JSON.parse(fs.readFileSync(path.join(backup, 'changes.json'), 'utf8'));
      assert(Array.isArray(prior) && prior.length === 7 && prior.every(p => p.filename.startsWith(core + '/dist/')));
      for (const p of prior) assert.equal(fs.readFileSync(p.filename, 'utf8'), p.after, 'Existing installation differs; do not retry a partial or competing change');
      console.log(JSON.stringify({action, alreadyApplied: true, files: prior.length}));
      process.exit(0);
    }
    const plan = buildPlan(core);
    if (action === 'apply' || action === 'ensure') {
      assert(backup && path.isAbsolute(backup) && !fs.existsSync(backup), 'New exact backup directory required');
      fs.mkdirSync(backup, {recursive: true, mode: 0o700});
      fs.writeFileSync(path.join(backup, 'changes.json'), JSON.stringify(plan), {flag: 'wx', mode: 0o600});
      for (const p of plan) writeFile(p.filename, p.after, p.before === null ? path.join(core, 'dist/index.js') : undefined);
    }
    console.log(JSON.stringify({action, gateEnabled: false, files: plan.map(p => ({path: path.relative(core, p.filename), beforeSha: p.before === null ? null : sha(p.before), afterSha: sha(p.after)}))}));
  }
}
