import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { MARKER, patchSubagentRegistry, patchTaskRegistry } from './patch-registry-lazy-first-turn.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
// V on 2026-11-08: subagent-registry is the captured V patch (source-map versa), task-registry is npm's
const baseSubagent = read('../release/captured/cron-default-owner-tools-20261107/dist/subagent-registry-C24yr_PF.js');
const baseTask = read('./fixtures/registry-lazy-first-turn/task-registry-B4-CJZk7.js');
const subagent = read('./release-files/registry-lazy-first-turn/subagent-registry-C24yr_PF.js');
const task = read('./release-files/registry-lazy-first-turn/task-registry-B4-CJZk7.js');

test("release files are V's bytes plus only this patch", () => {
  assert.equal(sha(baseSubagent), '1d9f45d61e7201f27cd79b5941985443e4639b2bc21a0d4e1d97b386ad190a47');
  assert.equal(sha(baseTask), '6051d0be944bbb0a83694fc5df0321d469ebb48c4831b3c579e93c891120ff78');
  assert.equal(patchSubagentRegistry(baseSubagent), subagent);
  assert.equal(patchTaskRegistry(baseTask), task);
  assert.throws(() => patchSubagentRegistry(subagent), /already patched/);
  assert.throws(() => patchTaskRegistry(task), /already patched/);
});

// the source of one top-level function of a dist file
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

function precheck({ rows = [], table = true, env = {}, memory = new Map() } = {}) {
  const db = new DatabaseSync(':memory:');
  if (table) {
    db.exec('CREATE TABLE subagent_runs (run_id TEXT PRIMARY KEY, child_session_key TEXT, controller_session_key TEXT, requester_session_key TEXT, created_at INTEGER, payload_json TEXT)');
    db.exec('CREATE INDEX idx_subagent_runs_requester_session_key ON subagent_runs(requester_session_key, created_at DESC, run_id)');
    const insert = db.prepare('INSERT INTO subagent_runs VALUES (?, ?, NULL, ?, ?, ?)');
    rows.forEach((r, i) => insert.run(`run-${i}`, `child-${i}`, r.requester, i, JSON.stringify({ requesterSessionKey: r.requester, delivery: r.delivery })));
  }
  const src = [
    'const V_STEERING_PRECHECK_MAX_ROWS = 5e3;',
    fn(subagent, 'isStaleLease'), fn(subagent, 'sortPendingSteeringItems'),
    fn(subagent, 'listPendingAgentSteeringItemsFromSubagentRuns'), fn(subagent, 'mayHavePendingAgentSteeringItems'),
    'this.run = mayHavePendingAgentSteeringItems;',
  ].join('\n');
  const context = { process: { env }, openOpenClawStateDatabase: () => ({ db }), Date };
  vm.runInNewContext(src, context, { filename: 'precheck.js' });
  return (key) => context.run(memory, key);
}
const payload = (requester) => ({ requesterSessionKey: requester, childSessionKey: 'c', task: 'x' });
const ME = 'agent:makaron:feishu:direct:ou_me';

test('no steering item for this requester: the restore can be skipped', () => {
  const run = precheck({ rows: [
    { requester: ME, delivery: { status: 'not_required' } },
    { requester: ME, delivery: { status: 'delivered', payload: undefined } },
    { requester: 'agent:makaron:feishu:direct:ou_other', delivery: { status: 'pending', payload: payload('agent:makaron:feishu:direct:ou_other') } },
  ] });
  assert.equal(run(ME), false);
  assert.equal(run(`  ${ME} `), false);
  assert.equal(run(''), false);
});

test('a pending or leased payload of this requester takes the original path', () => {
  assert.equal(precheck({ rows: [{ requester: ME, delivery: { status: 'pending', payload: payload(ME) } }] })(ME), true);
  assert.equal(precheck({ rows: [{ requester: ME, delivery: { status: 'in_progress', payload: payload(ME), steeringLeasedAt: 1 } }] })(ME), true);
});

test('an item only in memory (not persisted yet) takes the original path', () => {
  const memory = new Map([['run-m', { delivery: { status: 'pending', payload: payload(ME) } }]]);
  assert.equal(precheck({ memory })(ME), true);
});

test('any doubt takes the original path: query error, too many rows, the switch', () => {
  assert.equal(precheck({ table: false })(ME), true);
  const many = Array.from({ length: 5001 }, () => ({ requester: ME, delivery: { status: 'not_required' } }));
  assert.equal(precheck({ rows: many })(ME), true);
  assert.equal(precheck({ env: { OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN: '0' } })(ME), true);
});

test('leasePendingAgentSteeringItems asks the precheck before restoring', () => {
  const i = subagent.indexOf('function leasePendingAgentSteeringItems(params) {');
  assert(i > 0 && subagent.slice(i, i + 200).includes('if (!mayHavePendingAgentSteeringItems(runs, params.requesterSessionKey)) return;\n\t\trestoreOnce();'));
  assert(subagent.includes(`// ${MARKER}`));
});

function taskList({ env = {}, storeThrows = false } = {}) {
  const calls = [];
  const src = `${fn(task, 'listFreshTasksForOwnerKey')}\nthis.run = listFreshTasksForOwnerKey;`;
  const context = {
    process: { env }, Map, Object,
    ensureTaskRegistryReady: () => calls.push('restore'),
    normalizeOptionalString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    getTaskRegistryStore: () => ({ listTasksForOwnerKey: (k) => { calls.push(`store:${k}`); if (storeThrows) throw new Error('read failed'); return [{ taskId: 't1', createdAt: 1 }, { taskId: 't2', createdAt: 2 }]; } }),
    cloneTaskRecord: (t) => ({ ...t }), normalizeTaskTimestamps: (t) => t, compareTasksNewestFirst: (a, b) => b.createdAt - a.createdAt,
    taskRegistryLog: { warn: () => calls.push('warn') },
    listTasksFromIndex: () => { calls.push('memory'); return ['from-memory']; }, taskIdsByOwnerKey: new Map(),
  };
  vm.runInNewContext(src, context);
  return { result: context.run('owner-1'), calls };
}

test('owner tasks come from the store without restoring the registry; the fallback still restores', () => {
  const ok = taskList();
  assert.deepEqual(ok.calls, ['store:owner-1']);
  assert.deepEqual(Array.from(ok.result, (t) => t.taskId), ['t2', 't1']);
  const failed = taskList({ storeThrows: true });
  assert.deepEqual(failed.calls, ['store:owner-1', 'warn', 'restore', 'memory']);
  assert.deepEqual(Array.from(failed.result), ['from-memory']);
  const off = taskList({ env: { OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN: '0' } });
  assert.deepEqual(off.calls, ['restore', 'store:owner-1']);
});
