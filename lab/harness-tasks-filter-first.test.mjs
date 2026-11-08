import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-harness-tasks-filter-first.mjs';

// harness-tasks-filter-first: see lab/harness-tasks-filter-first.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/harness-tasks-filter-first.plan.json'));
const NAME = 'plugin-sdk/agent-harness-task-runtime.js';
const spec = FILES[NAME];

test('plan pins V bytes before and the release file after', () => {
  const released = read(`${RELEASE_DIR}/${NAME}`);
  const original = unpatchFile(NAME, released);
  const entry = plan.files.find((file) => file.target === spec.target);
  assert.ok(entry);
  assert.equal(plan.files.length, 1);
  assert.equal(entry.source, `${RELEASE_DIR}/${NAME}`);
  assert.equal(entry.before, spec.before);
  assert.equal(sha256(original), spec.before, 'V bytes');
  assert.equal(sha256(released), entry.after, 'release bytes');
  assert.equal(patchFile(NAME, original), released);
  assert.throws(() => patchFile(NAME, released), /already patched/);
});

// V's registry, copied from task-registry-B4-CJZk7.js and task-registry-activity-DSlVVJwD.js (2026.9.1 db91.6).
function cloneTaskRecord(record) {
  return { ...record, ...(record.detail !== void 0 ? { detail: structuredClone(record.detail) } : {}) };
}
function compareTasksNewestFirst(left, right) {
  const createdAtDiff = right.createdAt - left.createdAt;
  if (createdAtDiff !== 0) return createdAtDiff;
  return (right.insertionIndex ?? 0) - (left.insertionIndex ?? 0);
}
function registry(tasks) {
  const calls = [];
  const listTaskRecords = (filter) => {
    calls.push({ filtered: Boolean(filter) });
    const records = [...tasks.values()];
    return (filter ? records.filter(filter) : records)
      .map((task, insertionIndex) => Object.assign({}, cloneTaskRecord(task), { insertionIndex }))
      .toSorted(compareTasksNewestFirst)
      .map(({ insertionIndex: _insertionIndex, ...task }) => task);
  };
  return { listTaskRecords, calls };
}

// The shipped method body, run against the registry above.
function scopedList(source) {
  const start = source.indexOf('\t\tlistTaskRecords() {\n');
  const end = source.indexOf('\n\t\t}\n', start);
  assert.ok(start > 0 && end > start);
  const body = source.slice(start + '\t\tlistTaskRecords() {\n'.length, end);
  return new Function('listTaskRecords', 'runtime', 'taskKind', 'requesterSessionKey', 'runIdPrefix', 'process', body);
}

function fixture() {
  const tasks = new Map();
  let n = 0;
  const owners = ['agent:makaron:feishu:group:a', 'agent:makaron:feishu:group:b', 'agent:main:main'];
  for (let i = 0; i < 600; i += 1) {
    const owner = owners[i % 3];
    const taskId = `t${n++}`;
    tasks.set(taskId, {
      taskId,
      runtime: i % 5 === 0 ? 'cli' : 'subagent',
      taskKind: i % 7 === 0 ? 'other-harness' : 'codex-native-subagent',
      scopeKind: i % 11 === 0 ? 'system' : 'session',
      ownerKey: owner,
      requesterSessionKey: owner,
      runId: i % 13 === 0 ? `other:${i}` : `codex:${i}`,
      createdAt: 1_000 + Math.floor(i / 4), // four tasks per millisecond: the tie-break decides order
      status: i % 2 ? 'running' : 'succeeded',
      ...(i % 3 === 0 ? { detail: { nested: { i } } } : {}),
    });
  }
  return tasks;
}

for (const [label, args] of [
  ['kind and prefix', ['subagent', 'codex-native-subagent', 'agent:makaron:feishu:group:a', 'codex:']],
  ['no kind, no prefix', ['subagent', undefined, 'agent:makaron:feishu:group:b', undefined]],
  ['owner with no tasks', ['subagent', 'codex-native-subagent', 'agent:makaron:feishu:group:none', 'codex:']],
]) {
  test(`same records in the same order as V's call: ${label}`, () => {
    const released = read(`${RELEASE_DIR}/${NAME}`);
    const original = unpatchFile(NAME, released);
    const tasks = fixture();
    const before = registry(tasks);
    const expected = scopedList(original)(before.listTaskRecords, ...args, { env: {} });
    const on = registry(tasks);
    const actual = scopedList(released)(on.listTaskRecords, ...args, { env: {} });
    assert.deepEqual(actual, expected);
    assert.deepEqual(on.calls, [{ filtered: true }], 'filters before cloning');
    const off = registry(tasks);
    const restored = scopedList(released)(off.listTaskRecords, ...args, { env: { OPENCLAW_V_HARNESS_TASKS_FILTER_FIRST: '0' } });
    assert.deepEqual(restored, expected);
    assert.deepEqual(off.calls, [{ filtered: false }], 'the switch restores the whole list');
    if (label !== 'owner with no tasks') assert.ok(expected.length > 10);
    // detail is still a copy, not the registry's object
    const withDetail = actual.find((task) => task.detail);
    if (withDetail) assert.notEqual(withDetail.detail, tasks.get(withDetail.taskId).detail);
  });
}

test('the release names its marker once', () => {
  const released = read(`${RELEASE_DIR}/${NAME}`);
  assert.equal(released.split(MARKER).length, 2);
});
