import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchWorkboardIndex, HYDRATE_LIMIT } from './patch-workboard-sweep-links.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const original = read('./release-files/workboard-incremental-sweep/index.js');
const released = read('./release-files/workboard-sweep-links/index.js');

test('release file is V\'s Workboard plugin after #212 with only the link-based partial sweep', () => {
  assert.equal(patchWorkboardIndex(original), released);
  assert.throws(() => patchWorkboardIndex(released), /Expected exactly one/);
});

// Native helpers, as in runtime-api (cardBoardId, workboardSessionKeyForCard, lookup key).
const cardSessionKey = (card) => card.sessionKey ?? card.execution?.sessionKey;
const sanitize = (value, fallback) => ((value ?? fallback).trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || fallback).slice(0, 96);
const generatedKey = (card) => {
  const suffix = `subagent:workboard-${sanitize(card.metadata?.automation?.boardId ?? 'default', 'default')}-${sanitize(card.id, 'card')}`;
  return card.agentId ? `agent:${sanitize(card.agentId, 'agent')}:${suffix}` : suffix;
};
const terminal = (card) => ['review', 'blocked', 'done'].includes(card.execution?.status ?? card.status);

// The lifecycle-sync region of a plugin file, run against an in-memory store and Gateway.
function loadLifecycle(source) {
  const start = source.indexOf('//#region extensions/workboard/src/lifecycle-sync.ts');
  const end = source.indexOf('//#endregion', start);
  const deps = {
    resolveGlobalSingleton: (_key, create) => create(),
    isRecord: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    cardSessionKey,
    cardRunId: (card) => card.runId ?? card.execution?.runId,
    workboardCardSessionLookupKey: (card) => cardSessionKey(card) ?? generatedKey(card),
    workboardCardMatchesLifecycleLink: () => false,
    isWorkboardWorktreeCleanupCandidate: (card) => {
      const w = card.metadata?.automation?.workspace;
      return Boolean(w?.kind === 'worktree' && w.path && w.sourcePath && terminal(card));
    },
    cleanupWorkboardCardWorktree: async () => {},
  };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}\nreturn { createWorkboardLifecycleService, readWorkboardLifecycleSessions };`)(...Object.values(deps));
}

// The native link projection: parent-row fields only.
const toLink = (card) => ({
  id: card.id,
  ...card.agentId ? { agentId: card.agentId } : {},
  ...card.sessionKey ? { sessionKey: card.sessionKey } : {},
  ...card.runId ? { runId: card.runId } : {},
  ...card.execution ? { execution: { ...card.execution.sessionKey ? { sessionKey: card.execution.sessionKey } : {}, ...card.execution.runId ? { runId: card.execution.runId } : {} } } : {},
  metadata: { ...card.metadata?.automation ? { automation: card.metadata.automation } : {}, ...card.metadata?.archivedAt !== undefined ? { archivedAt: card.metadata.archivedAt } : {} },
});

function harness({ source = released, cards, sessions = () => [], links = true } = {}) {
  const { createWorkboardLifecycleService, readWorkboardLifecycleSessions } = loadLifecycle(source);
  const requests = [], synced = [], failed = [], reads = [], cleaned = [];
  const order = (a, b) => cards.indexOf(a) - cards.indexOf(b);
  const store = {
    list: async (options = {}) => {
      reads.push(options.cardIds ? [...options.cardIds].sort() : 'all');
      const picked = options.cardIds ? cards.filter((card) => options.cardIds.includes(card.id)) : cards;
      return structuredClone(picked.toSorted(order));
    },
    syncLifecycle: async (id, update) => {
      synced.push({ id, ...update });
      const card = cards.find((c) => c.id === id);
      if (update.targetStatus) card.status = update.targetStatus;
      return true;
    },
    failPreparedLaunch: async (id) => { failed.push(id); return true; },
    ...links ? { cardStore: { listLifecycleLinks: async () => { reads.push('links'); return cards.map(toLink); } } } : {},
  };
  const gateway = {
    isAvailable: async () => true,
    request: async (method, params) => { requests.push({ method, params }); return { sessions: sessions(params) }; },
  };
  const worktrees = { removeIfLossless: async () => true };
  const service = createWorkboardLifecycleService({ store, worktrees, readSessions: (options) => readWorkboardLifecycleSessions(gateway, options) });
  const warnings = [];
  service.start({ logger: { warn: (message) => warnings.push(message) } });
  return { service, requests, synced, failed, reads, cleaned, warnings, store };
}

async function settle() { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); }
async function tick(ms) { mock.timers.tick(ms); await settle(); }
function clock(t) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_791_200_000_000 });
  t.after(() => mock.timers.reset());
}

const card = (id, fields = {}) => ({ id, status: 'running', agentId: 'nightshift', sessionKey: `agent:nightshift:subagent:workboard-default-${id}`, metadata: {}, ...fields });
const many = (n) => Array.from({ length: n }, (_, i) => card(`c${i}`));
const reported = (id, fields = {}) => ({ key: `agent:nightshift:subagent:workboard-default-${id}`, status: 'done', updatedAt: Date.now(), ...fields });

test('partial sweeps read links and only the cards their sessions name; full sweeps read every card', async (t) => {
  clock(t);
  let report = [];
  const cards = many(200);
  const h = harness({ cards, sessions: (params) => (params.activeMinutes ? report : []) });
  h.service.onGatewayStart(); await settle();
  assert.deepEqual(h.reads, ['links', 'all']);
  h.reads.length = 0;
  await tick(60_000);
  // nothing changed: links only, no card is loaded
  assert.deepEqual(h.reads, ['links', []]);
  h.reads.length = 0;
  report = [reported('c7')];
  await tick(60_000);
  assert.deepEqual(h.reads, ['links', ['c7'], ['c7']]);
  assert.deepEqual(h.synced.map((s) => [s.id, s.targetStatus]), [['c7', 'review']]);
  h.reads.length = 0; report = [];
  for (let i = 0; i < 8; i += 1) await tick(60_000);
  // ten minutes after the first full sweep, the next one reads every card again
  assert.deepEqual(h.reads.filter((r) => r === 'all').length, 1);
  assert.deepEqual(h.requests.filter((r) => r.method === 'sessions.list').map((r) => r.params.activeMinutes ?? 'all'), ['all', 2, 2, 2, 2, 2, 2, 2, 2, 2, 'all']);
  h.service.stop();
});

test('a partial sweep syncs exactly what the full-list sweep syncs', async (t) => {
  // Scoped key, agentless generated key, execution key, archived card, unrelated card.
  const build = () => [
    card('a'),
    { id: 'b', status: 'running', metadata: { claim: { ownerId: 'workboard-dispatcher' } }, agentId: 'workboard-dispatcher' },
    { id: 'c', status: 'running', execution: { sessionKey: 'agent:main:feishu:group:x', runId: 'r1', status: 'running' }, metadata: {} },
    card('d', { metadata: { archivedAt: 5 } }),
    card('e'),
  ];
  const sessions = () => [
    reported('a'),
    { key: 'agent:other:subagent:workboard-default-b', status: 'failed', updatedAt: Date.now() },
    { key: 'agent:main:feishu:group:x', status: 'done', updatedAt: Date.now() },
    reported('d'),
  ];
  const run = async (source, links) => {
    const cards = build();
    const h = harness({ source, cards, links, sessions: (params) => (params.activeMinutes ? sessions() : []) });
    h.service.onGatewayStart(); await settle();
    await tick(60_000);
    h.service.stop();
    return { synced: h.synced.map((s) => [s.id, s.targetStatus]).sort(), reads: h.reads };
  };
  clock(t);
  const before = await run(original, true);
  mock.timers.reset(); clock(t);
  const after = await run(released, true);
  assert.deepEqual(after.synced, before.synced);
  assert.deepEqual(after.synced.map(([id]) => id), ['a', 'b', 'c']);
  assert.deepEqual(after.reads.at(-2), ['a', 'b', 'c']);
  assert(!after.reads.slice(2).includes('all'));
});

test('worktree cleanup sees the same candidates without reading every card', async (t) => {
  clock(t);
  const ws = (id) => ({ automation: { workspace: { kind: 'worktree', path: `/wt/${id}`, sourcePath: '/repo' } } });
  const cards = [
    ...many(50),
    card('w1', { status: 'review', metadata: ws('w1') }),
    card('w2', { status: 'running', metadata: ws('w2') }),
    card('w3', { status: 'done', metadata: { automation: { workspace: { kind: 'worktree', path: '/repo' } } } }),
    card('w4', { status: 'blocked', metadata: { ...ws('w4'), archivedAt: 9 } }),
  ];
  const h = harness({ cards });
  h.service.onGatewayStart(); await settle();
  h.reads.length = 0;
  await tick(60_000);
  // links, then the worktree candidates (archived included, as the native filter does)
  assert.deepEqual(h.reads, ['links', ['w1', 'w2', 'w4']]);
  h.service.stop();
});

test(`more than ${HYDRATE_LIMIT} selected cards fall back to one full read`, async (t) => {
  clock(t);
  const cards = many(HYDRATE_LIMIT + 1);
  const h = harness({ cards, sessions: (params) => (params.activeMinutes ? cards.map((c) => reported(c.id, { status: 'running', hasActiveRun: true })) : []) });
  h.service.onGatewayStart(); await settle();
  h.reads.length = 0;
  await tick(60_000);
  assert.deepEqual(h.reads, ['links', 'all', 'all']);
  h.service.stop();
});

test('a store without the link projection keeps the original full-list sweep', async (t) => {
  clock(t);
  const h = harness({ cards: many(3), links: false });
  h.service.onGatewayStart(); await settle();
  await tick(60_000);
  assert.deepEqual(h.reads, ['all', 'all']);
  h.service.stop();
});

test('links without any linked card defer to the full card check (running, claimed or stale cards)', async (t) => {
  clock(t);
  const cards = [{ id: 'r', status: 'running', metadata: {} }];
  const h = harness({ cards, sessions: () => [{ key: 'subagent:workboard-default-r', status: 'done', updatedAt: Date.now() }] });
  h.service.onGatewayStart(); await settle();
  // the original path: full read, and again after the sync changed the card
  assert.deepEqual(h.reads, ['links', 'all', 'all']);
  assert.deepEqual(h.synced.map((s) => s.id), ['r']);
  h.service.stop();
});

test('prepared launches still force a full sweep that can fail them', async (t) => {
  clock(t);
  const cards = many(3);
  const h = harness({ cards });
  h.service.onGatewayStart(); await settle();
  cards.push(card('p1', { status: 'ready', metadata: { automation: { launch: { phase: 'prepared', preparedAt: Date.now() } } } }));
  h.reads.length = 0;
  await tick(60_000);
  // full read, and a second one because failing the launch changed a card
  assert.deepEqual(h.reads, ['links', 'all', 'all']);
  assert.deepEqual(h.failed, ['p1']);
  h.service.stop();
});
