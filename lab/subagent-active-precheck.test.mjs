import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { BEFORE_SHA, HELPER, MARKER, NAME, patchHistoryImagePrune, sha256, unpatchHistoryImagePrune } from './patch-subagent-active-precheck.mjs';
import { mayHaveActiveSubagentRuns } from './release-files/subagent-active-precheck/v-subagent-active-precheck.mjs';

// subagent-active-precheck: the embedded attempt skips the whole subagent registry when nothing in the
// session's tree can be active. See lab/subagent-active-precheck.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/subagent-active-precheck.plan.json'));
const dir = 'lab/release-files/subagent-active-precheck';
const released = read(`${dir}/${NAME}`);
const original = unpatchHistoryImagePrune(released);

test('plan pins V bytes before and the release files after', () => {
  const [chunk, helper] = plan.files;
  assert.equal(chunk.target, `openclaw/dist/${NAME}`);
  assert.equal(chunk.source, `${dir}/${NAME}`);
  assert.equal(chunk.before, BEFORE_SHA);
  assert.equal(sha256(original), BEFORE_SHA, 'V bytes');
  assert.equal(sha256(released), chunk.after, 'release bytes');
  assert.equal(helper.target, `openclaw/dist/${HELPER}`);
  assert.equal(sha256(read(`${dir}/${HELPER}`)), helper.after, 'helper bytes');
  assert.equal(patchHistoryImagePrune(original), released);
  assert.throws(() => patchHistoryImagePrune(released), /already patched/);
});

test('the patch only adds lines, and the original listing still follows the check', () => {
  const lines = new Set(released.split('\n'));
  assert.deepEqual(original.split('\n').filter((line) => !lines.has(line)), []);
  assert.ok(released.indexOf(MARKER) < released.indexOf('const runs = listControlledSubagentRuns(controllerSessionKey'));
  assert.ok(released.includes('OPENCLAW_V_SUBAGENT_ACTIVE_PRECHECK !== "0"'));
});

const ended = { status: 'terminal', endedAt: 1 };
const database = (rows) => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE subagent_runs (run_id TEXT PRIMARY KEY, child_session_key TEXT, controller_session_key TEXT, requester_session_key TEXT, created_at INTEGER, payload_json TEXT)');
  const insert = db.prepare('INSERT INTO subagent_runs VALUES (?, ?, ?, ?, 1, ?)');
  rows.forEach((row, i) => insert.run(`r${i}`, row.child, row.controller ?? null, row.requester, JSON.stringify({ execution: row.execution ?? ended, cleanupCompletedAt: 'cleanup' in row ? row.cleanup : 2 })));
  return db;
};
const may = (rows, key = 'k', memory = new Map()) => mayHaveActiveSubagentRuns(database(rows), memory, key);

test('nothing to find: no rows, an empty key, or a settled tree', () => {
  assert.equal(may([]), false);
  assert.equal(may([{ child: 'c', requester: 'k' }], '  '), false);
  assert.equal(may([{ child: 'c', controller: 'k', requester: 'k' }, { child: 'g', controller: 'c', requester: 'c' }]), false);
  assert.equal(may([{ child: 'x', requester: 'other', execution: { status: 'running' } }]), false);
});

test('any unsettled run in reach goes to the original path', () => {
  const running = { status: 'running' };
  assert.equal(may([{ child: 'c', requester: 'k', execution: running }]), true, 'child by requester');
  assert.equal(may([{ child: 'c', controller: 'k', requester: 'z', execution: running }]), true, 'child by controller');
  assert.equal(may([{ child: 'c', requester: 'k' }, { child: 'g', requester: 'c', execution: running }]), true, 'grandchild');
  assert.equal(may([{ child: 'c', requester: 'k' }, { child: 'g', requester: 'c', cleanup: null }]), true, 'ended, cleanup pending');
  assert.equal(may([{ child: 'c', requester: 'k', execution: { status: 'terminal' } }]), true, 'terminal without endedAt');
});

test('descendants follow the requester edge only, as the read index does', () => {
  assert.equal(may([{ child: 'c', requester: 'k' }, { child: 'g', controller: 'c', requester: 'z', execution: { status: 'running' } }]), false);
});

test('a cycle ends', () => {
  assert.equal(may([{ child: 'c', requester: 'k' }, { child: 'k', requester: 'c' }]), false);
});

test('an in-memory run counts even when the row says otherwise', () => {
  const live = new Map([['m', { requesterSessionKey: 'k', childSessionKey: 'c', execution: { status: 'running' } }]]);
  assert.equal(may([], 'k', live), true);
  const nested = new Map([['m', { requesterSessionKey: 'c', childSessionKey: 'g', execution: { status: 'running' } }]]);
  assert.equal(may([{ child: 'c', requester: 'k' }], 'k', nested), true);
  const settled = new Map([['m', { requesterSessionKey: 'k', childSessionKey: 'c', execution: ended, cleanupCompletedAt: 2 }]]);
  assert.equal(may([], 'k', settled), false);
});

test('more rows than the budget goes to the original path', () => {
  const rows = Array.from({ length: 5001 }, (_, i) => ({ child: `c${i}`, requester: 'k' }));
  assert.equal(may(rows), true);
});
