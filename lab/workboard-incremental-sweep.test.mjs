import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchWorkboardIndex } from './patch-workboard-incremental-sweep.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const original = read('./release-files/lifecycle-workboard-index.js');
const released = read('./release-files/workboard-incremental-sweep/index.js');

test('release file is V\'s Workboard plugin with only the incremental sweep', () => {
  assert.equal(patchWorkboardIndex(original), released);
  assert.throws(() => patchWorkboardIndex(released), /Expected exactly one/);
});

// The lifecycle-sync region of the released file, run against an in-memory store and Gateway.
function loadLifecycle() {
  const start = released.indexOf('//#region extensions/workboard/src/lifecycle-sync.ts');
  const end = released.indexOf('//#endregion', start);
  const region = released.slice(start, end);
  const deps = {
    resolveGlobalSingleton: (_key, create) => create(),
    isRecord: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    cardSessionKey: (card) => card.sessionKey,
    cardRunId: (card) => card.runId,
    workboardCardSessionLookupKey: (card) => card.sessionKey ?? '',
    workboardCardMatchesLifecycleLink: () => false,
    isWorkboardWorktreeCleanupCandidate: () => false,
    cleanupWorkboardCardWorktree: async () => {},
  };
  return new Function(...Object.keys(deps), `${region}\nreturn { createWorkboardLifecycleService, readWorkboardLifecycleSessions };`)(...Object.values(deps));
}

function harness({ cards, sessions = () => [], available = () => true, fail = () => false } = {}) {
  const { createWorkboardLifecycleService, readWorkboardLifecycleSessions } = loadLifecycle();
  const requests = [], synced = [], failed = [];
  let lists = 0;
  const store = {
    list: async () => { lists += 1; return structuredClone(cards); },
    syncLifecycle: async (id, update) => { synced.push({ id, ...update }); return true; },
    failPreparedLaunch: async (id) => { failed.push(id); return true; },
  };
  const gateway = {
    isAvailable: async () => available(),
    request: async (method, params) => {
      requests.push({ method, params });
      if (fail()) throw new Error('gateway busy');
      return { sessions: sessions(params) };
    },
  };
  const service = createWorkboardLifecycleService({ store, readSessions: (options) => readWorkboardLifecycleSessions(gateway, options) });
  const warnings = [];
  service.start({ logger: { warn: (message) => warnings.push(message) } });
  return { service, requests, synced, failed, warnings, lists: () => lists };
}

async function settle() { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); }
async function tick(ms) { mock.timers.tick(ms); await settle(); }

const linked = [{ id: 'c1', sessionKey: 'agent:makaron:subagent:workboard-c1', status: 'running', metadata: {} }];
const listCalls = (requests) => requests.filter((r) => r.method === 'sessions.list').map((r) => r.params.activeMinutes ?? 'all');

test('between full sweeps only recently updated sessions are listed; a full sweep every 10 minutes', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
  const h = harness({ cards: linked });
  h.service.onGatewayStart(); await settle();
  for (let i = 0; i < 11; i += 1) await tick(60_000);
  // first sweep and the one 10 minutes later are full, the others ask for the last 2 minutes
  assert.deepEqual(listCalls(h.requests), ['all', 2, 2, 2, 2, 2, 2, 2, 2, 2, 'all', 2]);
  h.service.stop();
});

test('a session that changed is still synced by a partial sweep, an absent one is left alone', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
  let done = false;
  const cards = [...linked, { id: 'c2', sessionKey: 'agent:makaron:subagent:workboard-c2', status: 'running', metadata: {} }];
  const h = harness({ cards, sessions: (params) => (params.activeMinutes && done ? [{ key: 'agent:makaron:subagent:workboard-c1', status: 'done', updatedAt: Date.now() }] : []) });
  h.service.onGatewayStart(); await settle();
  done = true;
  await tick(60_000);
  assert.deepEqual(h.synced.map((s) => [s.id, s.targetStatus]), [['c1', 'review']]);
  h.service.stop();
});

test('prepared launches force a full sweep, and only a complete list may fail them', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
  let prepared = false;
  const cards = linked.map((card) => ({ ...card }));
  const h = harness({ cards, sessions: () => [] });
  h.service.onGatewayStart(); await settle();
  await tick(60_000);
  assert.deepEqual(listCalls(h.requests), ['all', 2]);
  assert.deepEqual(h.failed, []);
  cards.push({ id: 'p1', sessionKey: 'agent:makaron:subagent:workboard-p1', status: 'ready', metadata: { automation: { launch: { phase: 'prepared', preparedAt: Date.now() } } } });
  prepared = true;
  await tick(60_000);
  assert.equal(prepared, true);
  assert.deepEqual(listCalls(h.requests), ['all', 2, 'all']);
  assert.deepEqual(h.failed, ['p1']);
  h.service.stop();
});

test('an unavailable or failing Gateway does not advance the sweep window', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
  let up = true, broken = false;
  const h = harness({ cards: linked, available: () => up, fail: () => broken });
  h.service.onGatewayStart(); await settle();
  up = false; await tick(60_000);
  up = true; broken = true; await tick(60_000);
  broken = false; await tick(60_000);
  // the third minute's partial sweep covers all three minutes since the last answered sweep
  assert.deepEqual(listCalls(h.requests), ['all', 3, 4]);
  assert.equal(h.warnings.length, 1);
  h.service.stop();
});

test('the card list is read again only when the sweep changed a card', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
  let report = false;
  const h = harness({ cards: linked, sessions: () => (report ? [{ key: 'agent:makaron:subagent:workboard-c1', status: 'running', hasActiveRun: true, updatedAt: Date.now() }] : []) });
  h.service.onGatewayStart(); await settle();
  assert.equal(h.lists(), 1);
  report = true; await tick(60_000);
  assert.equal(h.lists(), 3);
  h.service.stop();
});
