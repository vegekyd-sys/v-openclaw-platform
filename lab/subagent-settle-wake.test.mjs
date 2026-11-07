import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-subagent-settle-wake.mjs';
import { OUTPUT_DIR, PLAN } from './build-subagent-settle-wake.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

test('plan lists the patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

for (const file of FILES) {
  test(`${file.name} carries the marker, parses, and refuses a second patch`, () => {
    const out = read(file.name);
    assert(out.includes(MARKER));
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

// Pull a top-level function out of the patched chunk and run it against stubs.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

function loadSharedResolver() {
  const src = extractFunction(read('gateway-request-scope-CmMd3nUp.js'), 'getSharedGatewayContextResolver');
  const gatewayContextResolvers = new WeakMap();
  const fn = new Function('gatewayContextResolvers', `${src}\nreturn getSharedGatewayContextResolver;`)(gatewayContextResolvers);
  return { share: fn, bind: (owner, resolver) => gatewayContextResolvers.set(owner, resolver) };
}

test('separately fenced owners of one live Gateway share it (the 11/07 batch)', () => {
  const { share, bind } = loadSharedResolver();
  let live = true;
  const instance = {};
  instance.resolveGatewayContext = () => (live ? instance : undefined);
  // V's fenceScheduledGatewayContextResolver: a new closure per registration.
  const fence = () => () => instance.resolveGatewayContext();
  const spawned = {}; const createdA = {}; const createdB = {};
  bind(spawned, () => instance);
  bind(createdA, fence());
  bind(createdB, fence());
  const shared = share([spawned, createdA, createdB]);
  assert.equal(shared(), instance);
  live = false;
  assert.equal(shared(), undefined, 'a retired instance still rejects');
});

test('other instances and mixed bound/unbound batches still reject; identical owners unchanged', () => {
  const { share, bind } = loadSharedResolver();
  const a = {}; a.resolveGatewayContext = () => a;
  const b = {}; b.resolveGatewayContext = () => b;
  const x = {}; const y = {}; const z = {};
  bind(x, () => a); bind(y, () => b);
  assert.equal(share([x, y])(), undefined);
  assert.equal(share([x, z])(), undefined);
  const same = () => a;
  const p = {}; const q = {};
  bind(p, same); bind(q, same);
  assert.equal(share([p, q]), same);
  assert.equal(share([{}, {}]), undefined);
  assert.equal(share([]), undefined);
});

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
    readTaskRecord: () => structuredClone(task),
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
  return { block: (reason) => run({ subagent, taskId: task.taskId, reason }), calls, subagentRuns };
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

test('a completion whose only task row is the Gateway CLI row is blocked in the registry alone', () => {
  const { block, calls, subagentRuns } = loadBlock({ subagent: subagentRecord(), task: cliRow() });
  assert.equal(block('requester settle wake attempts exhausted'), true);
  assert.deepEqual(calls, [['subagent-row', '284f7211']]);
  assert.equal(subagentRuns.get('284f7211').delivery.status, 'failed');
  assert.equal(subagentRuns.get('284f7211').suppressCompletionDelivery, true);
});

test('a CLI row of another child, or an unsettled subagent task, is still refused', () => {
  assert.equal(loadBlock({ subagent: subagentRecord(), task: cliRow({ childSessionKey: 'agent:makaron:subagent:other' }) }).block('x'), false);
  assert.equal(loadBlock({ subagent: subagentRecord(), task: cliRow({ runtime: 'subagent', status: 'running' }) }).block('x'), false);
  assert.equal(loadBlock({ subagent: subagentRecord(), task: cliRow({ runId: 'other-run' }) }).block('x'), false);
});

test('an ordinary subagent task row keeps the task projection and blocked notice', () => {
  const task = cliRow({ runtime: 'subagent', ownerKey: 'agent:makaron:feishu:group:oc_test', requesterSessionKey: 'agent:makaron:feishu:group:oc_test', deliveryStatus: 'pending', notifyPolicy: 'done_only' });
  const { block, calls } = loadBlock({ subagent: subagentRecord(), task });
  assert.equal(block('requester settle wake failed'), true);
  assert.deepEqual(calls, ['notice-queued', 'task-settled', ['task-published', 'subagent']]);
});
