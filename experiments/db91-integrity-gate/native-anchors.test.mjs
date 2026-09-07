import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {buildPlan, patchMaintenance, patchLifecycle, patchEntry, patchVerifierWorker} from '../../scripts/patch-db91-integrity-gate.mjs';
const core = process.env.DB91_NATIVE_CORE;
const enabled = Boolean(core);
const selected = (prefix, marker) => fs.readdirSync(path.join(core, 'dist')).filter(x => x.startsWith(prefix) && x.endsWith('.js')).map(x => fs.readFileSync(path.join(core, 'dist', x), 'utf8')).find(x => x.includes(marker));

test('real 9.1 bundle transforms exactly five native files and two added helpers', {skip: !enabled}, () => {
  const plan = buildPlan(core);
  assert.equal(plan.length, 7);
  assert.equal(plan.filter(x => x.before === null).length, 2);
  for (const p of plan) execFileSync(process.execPath, ['--check', '--input-type=module'], {input: p.after});
});

test('real maintenance function retains full checks for migrations and exact schema validation', {skip: !enabled}, () => {
  const before = selected('openclaw-agent-db-maintenance-', 'function assertAgentDatabaseIntegrityBeforeMutation(');
  const source = patchMaintenance(before);
  const start = source.indexOf('function assertAgentDatabaseIntegrityBeforeMutation(');
  const end = source.indexOf('\nfunction persistAgentSchemaMetadata', start);
  assert(end > start);
  const functionSource = source.slice(start, end);
  for (const [version, pending, expected] of [[19, false, 'shared'], [19, true, 'full'], [18, false, 'full'], [0, false, 'full']]) {
    const calls = [];
    const context = {OPENCLAW_SQLITE_BUSY_TIMEOUT_MS: 5000, OPENCLAW_AGENT_SCHEMA_SQL: 'canonical',
      readSqliteUserVersion: () => version,
      hasPendingMemoryChunkMetadataMigration: () => pending,
      hasPendingSessionKeyContractSchemaMigration: () => false,
      hasRetiredAgentStateLeaseSchema: () => false,
      hasPendingSessionConversationRouteContextColumn: () => false,
      hasPendingSessionTranscriptContextEligibilityColumn: () => false,
      hasPendingInputConsumptionColumnMigration: () => false,
      hasPendingSessionProjectColumn: () => false,
      agentDbLog: {info() {}},
      assertSqliteIntegrity: () => calls.push('full'),
      verifyAndRepairCanonicalSqliteIndexes() {}, repairCanonicalSqliteIndexes() {},
      db91VerifyCurrent: opts => {assert.equal(opts.agentId, 'lab'); assert.equal(opts.options.allowMissingColumns, true); calls.push('shared');},
      assertOpenClawAgentCurrentRuntimeSchema: (_db, opts) => {assert.equal(opts.agentId, 'lab'); calls.push('schema');}
    };
    const fn = vm.runInNewContext(functionSource + '; assertAgentDatabaseIntegrityBeforeMutation', context);
    const db = {exec() {}, prepare: () => ({get: () => 1})};
    fn(db, 'lab', '/synthetic/agent.sqlite');
    assert.equal(calls[0], expected);
    assert.equal(calls.includes('schema'), expected === 'shared');
  }
});

test('real lifecycle retains original failures and adds replacement/revocation guards', {skip: !enabled}, () => {
  const before = selected('openclaw-agent-db-', 'function openOpenClawAgentDatabase(');
  const after = patchLifecycle(before);
  assert(after.includes('db91RememberConnection(db, pathname)'));
  assert(after.indexOf('if (cachedDatabaseOpenFailures.has(pathname))') < after.indexOf('db91AssertConnection(cached.db, pathname)'));
  assert(after.includes('db91InvalidateAll({reason: "exclusive-maintenance"})'));
  assert(after.indexOf('assertNoOpenClawAgentDatabaseLeases(maintenance, options)') < after.indexOf('db91InvalidateAll({reason: "exclusive-maintenance"})'));
  assert.throws(() => patchLifecycle(after), /already patched/);
});

test('real entry is patched only inside main CLI scope and has a strict opt-in', {skip: !enabled}, () => {
  const before = fs.readFileSync(path.join(core, 'dist/index.js'), 'utf8');
  const after = patchEntry(before);
  assert(after.includes('if (process.env.OPENCLAW_DB91_INTEGRITY_ENABLE === "1")'));
  assert(after.includes('await bootstrapGatewayIntegrity'));
  assert(after.startsWith('#!/usr/bin/env node\n'));
  assert(after.includes('const handledRootVersion = isMain && tryHandleRootVersionFastPath(process.argv)'));
});

test('bundle drift is rejected rather than guessed around', {skip: !enabled}, () => {
  const before = selected('openclaw-agent-db-maintenance-', 'function assertAgentDatabaseIntegrityBeforeMutation(');
  assert.throws(() => patchMaintenance(before.replaceAll('allowMissingColumns: true', 'allowMissingColumns: false')), /anchor drift/);
});

test('native checker uses source read transaction only for opted-in agent DBs; default snapshot path retained', {skip: !enabled}, () => {
  const before = fs.readFileSync(path.join(core, 'dist/state/openclaw-database-verify.worker.js'), 'utf8');
  const after = patchVerifierWorker(before);
  assert(after.includes('target.kind === "agent" && Boolean(process.env.OPENCLAW_DB91_INTEGRITY_EPOCH)'));
  assert(after.includes('db91Direct ? {location: target.path} : await location.prepareSqliteReadOnlyLocationInProcess(target.path)'));
  assert(after.indexOf('database.exec("BEGIN;")') < after.indexOf('db91BeginNative(database'));
  assert(after.indexOf('integrity.assertSqliteIntegrity(database') < after.indexOf('db91FinishNative(database'));
  assert(after.indexOf('db91FinishNative(database') < after.indexOf('database.exec("ROLLBACK;")'));
  assert(after.includes('database?.close()'));
});
