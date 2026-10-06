import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchWorkboardIndex } from './patch-workboard-full-sweep-noop.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const original = read('./release-files/workboard-incremental-sweep/index.js');
const released = read('./release-files/workboard-full-sweep-noop/index.js');
// V's Workboard runtime (store) as captured with the #212 release.
const api = read('../release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006/dist/runtime-api-1CCazqtv.js');

test('release file is V\'s Workboard plugin after #212 with only the full-sweep no-op skip', () => {
  assert.equal(patchWorkboardIndex(original), released);
  assert.throws(() => patchWorkboardIndex(released), /Expected exactly one/);
});

const fn = (s, name) => { const m = s.match(new RegExp('^function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'm')); assert(m, name); return m[0]; };
const constant = (s, name) => { const m = s.match(new RegExp('^const ' + name + ' = \\{[\\s\\S]*?^\\};', 'm')); assert(m, name); return m[0]; };

// The patch builder inside the native store's syncLifecycle, unchanged.
const buildPatch = (() => {
  const start = api.indexOf('\tasync syncLifecycle(id, input) {');
  const open = '(await this.updateLatestCard(id, (card) => {';
  const from = api.indexOf(open, start) + open.length;
  const to = api.indexOf('\n\t\t\t}, { allowAutomationLaunch: true })', from);
  assert(start > 0 && from > start && to > from, 'syncLifecycle patch builder');
  const helpers = ['cardSessionKey', 'cardRunId', 'latestStatusTransitionAt', 'shouldSkipPersistedLifecycleStatusUpdate', 'shouldSyncWorkboardLifecycleStatus', 'preparedLaunchMatchesCard', 'acceptedLaunchForAssociation', 'executionAssociationPatch', 'lifecycleExecution'];
  return new Function(helpers.map((n) => fn(api, n)).join('\n') + `\nreturn (input) => (card) => {${api.slice(from, to)}\n};`)();
})();

// The plugin's predicate and the sweep's observation → store input mapping, from the release file.
const plugin = new Function(`${constant(released, 'LIFECYCLE_TARGETS')}\n${fn(released, 'workboardLifecycleSyncIsNoop')}\nreturn { LIFECYCLE_TARGETS, workboardLifecycleSyncIsNoop };`)();
const storeInput = (observation, association, now) => {
  const target = plugin.LIFECYCLE_TARGETS[observation.state];
  return { targetStatus: 'card' in target ? target.card : undefined, executionStatus: 'execution' in target ? target.execution : undefined, sourceUpdatedAt: observation.sourceUpdatedAt, stale: observation.stale, now, association };
};

// Deterministic pseudo-random cards and observations around the boundary of each condition.
function* cases(n) {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const statuses = ['backlog', 'todo', 'ready', 'running', 'review', 'blocked', 'done', 'scheduled', 'triage'];
  const keys = ['agent:a:subagent:workboard-default-c', 'agent:b:subagent:workboard-default-c', undefined];
  for (let i = 0; i < n; i += 1) {
    const sessionKey = pick(keys), executionKey = pick([sessionKey, sessionKey, sessionKey, ...keys]), sessionKeyListed = pick([sessionKey ?? keys[0], sessionKey ?? keys[0], ...keys.slice(0, 2)]);
    const status = pick(statuses);
    const card = {
      id: 'c', status, updatedAt: 100, startedAt: 50,
      ...sessionKey ? { sessionKey } : {},
      ...rnd() < 0.3 ? { runId: pick(['r1', 'r2']) } : {},
      ...rnd() < 0.8 ? { execution: { id: 'c:agent-session', kind: 'agent-session', mode: 'autonomous', status: pick([status, status, 'running', 'review', 'blocked', 'idle', ...statuses]), ...executionKey ? { sessionKey: executionKey } : {}, ...rnd() < 0.3 ? { runId: pick(['r1', 'r2']) } : {}, updatedAt: 90 } } : {},
      events: rnd() < 0.5 ? [{ kind: 'moved', fromStatus: 'todo', toStatus: status, at: pick([80, 120]) }] : [],
      metadata: {
        ...rnd() < 0.3 ? { lifecycleStatusSourceUpdatedAt: pick([80, 120]) } : {},
        ...rnd() < 0.3 ? { stale: { detectedAt: 1, lastSessionUpdatedAt: pick([10, 20]), reason: pick(['Linked session has not reported recent activity.', 'other']) } } : {},
        ...rnd() < 0.3 ? { automation: { launch: pick([
          { phase: 'prepared', preparedAt: 60, requestedSessionKey: sessionKey, provisionalRunId: 'r1' },
          { phase: 'accepted', acceptedSessionKey: pick(keys), acceptedRunId: 'r1' },
          { phase: 'other' },
        ]) } } : {},
        ...rnd() < 0.3 ? { attempts: [{ id: 'a', status: 'running', runId: 'r1', sessionKey }] } : {},
      },
    };
    const state = pick(['running', 'succeeded', 'failed', 'idle', 'stale']);
    const observation = { state, sourceUpdatedAt: pick([undefined, 100, 110]), ...state === 'stale' ? { stale: { detectedAt: 2, lastSessionUpdatedAt: pick([10, 20]), reason: pick(['Linked session has not reported recent activity.', 'other']) } } : {} };
    const association = {
      ...(card.sessionKey ?? card.execution?.sessionKey) ? { expectedSessionKey: card.sessionKey ?? card.execution?.sessionKey } : {},
      ...(card.runId ?? card.execution?.runId) ? { expectedRunId: card.runId ?? card.execution?.runId } : {},
      sessionKey: sessionKeyListed,
      ...rnd() < 0.1 ? { acceptedAt: 70 } : {},
    };
    yield { card, observation, association };
  }
}

test('whenever the sweep skips a card, the native store would have built no patch for it', () => {
  let skipped = 0, called = 0;
  for (const { card, observation, association } of cases(200_000)) {
    if (!plugin.workboardLifecycleSyncIsNoop(card, observation, association)) { called += 1; continue; }
    skipped += 1;
    const patch = buildPatch(storeInput(observation, association, 1000))(structuredClone(card));
    assert.equal(patch, undefined, JSON.stringify({ card, observation, association, patch }));
  }
  // the generator reaches both sides
  assert(skipped > 1000 && called > 1000, `skipped ${skipped}, called ${called}`);
});

test('a card already linked to its finished session is skipped; changes still reach the store', () => {
  const key = 'agent:nightshift:subagent:workboard-default-c';
  const synced = { id: 'c', status: 'review', sessionKey: key, execution: { status: 'review', sessionKey: key }, metadata: {} };
  const done = { state: 'succeeded', sourceUpdatedAt: 200 };
  assert.equal(plugin.workboardLifecycleSyncIsNoop(synced, done, { expectedSessionKey: key, sessionKey: key }), true);
  // the card is still running: it must move to review
  assert.equal(plugin.workboardLifecycleSyncIsNoop({ ...synced, status: 'running' }, done, { expectedSessionKey: key, sessionKey: key }), false);
  // execution not linked yet
  assert.equal(plugin.workboardLifecycleSyncIsNoop({ ...synced, execution: undefined }, done, { expectedSessionKey: key, sessionKey: key }), false);
  // the session went stale, or a stale marker must be cleared
  assert.equal(plugin.workboardLifecycleSyncIsNoop({ ...synced, status: 'running', execution: { status: 'running', sessionKey: key } }, { state: 'stale', sourceUpdatedAt: 1, stale: { lastSessionUpdatedAt: 1, reason: 'x' } }, { expectedSessionKey: key, sessionKey: key }), false);
  assert.equal(plugin.workboardLifecycleSyncIsNoop({ ...synced, metadata: { stale: { lastSessionUpdatedAt: 1, reason: 'x' } } }, done, { expectedSessionKey: key, sessionKey: key }), false);
});
