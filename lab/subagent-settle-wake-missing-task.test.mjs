import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-subagent-settle-wake-missing-task.mjs';
import { OUTPUT_DIR, PLAN } from './build-subagent-settle-wake-missing-task.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

test('plan lists the patched file with V before-bytes (v1 already on V)', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

for (const file of FILES) {
  test(`${file.name} carries both markers, parses, and refuses a second patch`, () => {
    const out = read(file.name);
    assert(out.includes(MARKER) && out.includes('subagent-settle-wake-shared-gateway-v1'));
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

function loadBlock({ subagent, task }) {
  const source = read('subagent-completion-admission.store-JmpNDYTF.js');
  const src = [
    extractFunction(source, 'blockSubagentCompletionDelivery'),
    extractFunction(source, 'publishCommittedRecords'),
    extractFunction(source, 'publishCommittedSubagent'),
  ].join('\n');
  const calls = [];
  const subagentRuns = new Map();
  const stubs = {
    subagentRuns,
    runOpenClawStateWriteTransaction: (fn) => fn({ db: {} }),
    readSubagentRun: () => structuredClone(subagent),
    readTaskRecord: () => (task ? structuredClone(task) : undefined),
    ensureDeliveryState: (s) => (s.delivery ??= {}),
    loadPendingFinalDeliveryPayload: () => undefined,
    markRequesterSettleWakePending: () => calls.push('rearm'),
    upsertSubagentRunRowInDatabase: (_db, s) => calls.push(['subagent-row', s.runId]),
    bindSubagentRunRecord: (s) => s,
    deferSqlitePostCommitPublication: (_db, fn) => fn(),
    publishTaskRecordAfterAtomicStore: (t) => calls.push(['task-published', t.runtime]),
    resolveRequiredCompletionDeliveryFailureTerminalResult: () => ({}),
    SUSPENDED_RETENTION_MS: 1,
    formatTaskBlockedFollowupMessage: () => 'blocked',
    prepareClaimedSessionDelivery: () => ({ id: 'q1' }),
    resolveEventSessionKey: (k) => k,
    upsertBoundDeliveryQueueEntryInDatabase: () => calls.push('notice-queued'),
    bindDeliveryQueueEntry: (e) => e,
    SESSION_DELIVERY_QUEUE_NAME: 'session',
    settleSubagentCompletionDelivery: () => calls.push('task-settled'),
    scheduleSessionDelivery: () => {},
  };
  const run = new Function('stubs', `with (stubs) { ${src}\nreturn blockSubagentCompletionDelivery; }`)(stubs);
  return { block: (reason) => run({ subagent, taskId: task?.taskId ?? '', reason }), calls, subagentRuns };
}

const CHILD = 'agent:makaron:subagent:32273ee4';
const subagentRecord = () => ({
  runId: '284f7211', childSessionKey: CHILD, expectsCompletionMessage: true,
  execution: { status: 'terminal', outcome: { status: 'ok' } }, delivery: { status: 'pending' },
});
// The vision_probe row on V: the Gateway CLI tracking row for the same run.
const cliRow = (patch = {}) => ({
  taskId: 'a6167c14', runtime: 'cli', runId: '284f7211', childSessionKey: CHILD,
  ownerKey: CHILD, status: 'succeeded', deliveryStatus: 'not_applicable', notifyPolicy: 'silent', ...patch,
});


const row = (patch = {}) => ({
  taskId: 'a6167c14', runtime: 'cli', runId: '284f7211', childSessionKey: CHILD,
  ownerKey: CHILD, status: 'succeeded', deliveryStatus: 'not_applicable', notifyPolicy: 'silent', ...patch,
});

test('V 11/08: no subagent task row at all (empty task id) is blocked in the registry alone', () => {
  const { block, calls, subagentRuns } = loadBlock({ subagent: subagentRecord(), task: undefined });
  assert.equal(block('requester settle wake attempts exhausted'), true);
  assert.deepEqual(calls, [['subagent-row', '284f7211']]);
  assert.equal(subagentRuns.get('284f7211').delivery.status, 'failed');
  assert.equal(subagentRuns.get('284f7211').suppressCompletionDelivery, true);
});

test('v1 behaviour kept: CLI row of the same run blocked alone; other child, other run or unsettled task refused', () => {
  assert.equal(loadBlock({ subagent: subagentRecord(), task: row() }).block('x'), true);
  assert.equal(loadBlock({ subagent: subagentRecord(), task: row({ childSessionKey: 'agent:makaron:subagent:other' }) }).block('x'), false);
  assert.equal(loadBlock({ subagent: subagentRecord(), task: row({ runId: 'other-run' }) }).block('x'), false);
  assert.equal(loadBlock({ subagent: subagentRecord(), task: row({ runtime: 'subagent', status: 'running' }) }).block('x'), false);
});

test('an ordinary subagent task row keeps the task projection and blocked notice', () => {
  const task = row({ runtime: 'subagent', ownerKey: 'agent:makaron:feishu:group:oc_test', requesterSessionKey: 'agent:makaron:feishu:group:oc_test', deliveryStatus: 'pending', notifyPolicy: 'done_only' });
  const { block, calls } = loadBlock({ subagent: subagentRecord(), task });
  assert.equal(block('requester settle wake failed'), true);
  assert.deepEqual(calls, ['notice-queued', 'task-settled', ['task-published', 'subagent']]);
});
