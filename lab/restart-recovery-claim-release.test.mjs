import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLAIM_RELEASE_MARKER, patchReplyAdmissionTicket } from './patch-restart-recovery-claim-release.mjs';
import { CLAIM_RELEASE_BEFORE, CLAIM_RELEASE_INPUT, CLAIM_RELEASE_OUTPUT } from './build-restart-recovery-claim-release.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stock = read(CLAIM_RELEASE_INPUT);
const patched = read(CLAIM_RELEASE_OUTPUT);

test('release file is the patched stock chunk', () => {
  assert.equal(sha(stock), CLAIM_RELEASE_BEFORE);
  assert.equal(sha(patchReplyAdmissionTicket(stock)), sha(patched));
  assert.throws(() => patchReplyAdmissionTicket(patched), /already patched/);
  assert.ok(patched.includes(CLAIM_RELEASE_MARKER));
  assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, CLAIM_RELEASE_OUTPUT)]).status, 0);
});

// Runs the chunk's real claim controller against an in-memory session store.
function loadController(source) {
  const start = source.indexOf('async function retireTerminalRestartRecoverySourceClaim(params) {');
  const end = source.indexOf('//#region src/auto-reply/reply/commentary-progress-owner.ts');
  assert.ok(start > 0 && end > start);
  const store = new Map();
  const norm = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const deps = {
    randomUUID,
    normalizeOptionalString: norm,
    loadSessionEntry: ({ sessionKey }) => store.get(sessionKey),
    updateSessionEntry: async ({ sessionKey }, update) => {
      const current = store.get(sessionKey);
      const patch = current ? update(current) : null;
      if (!patch) return null;
      const next = { ...current, ...patch };
      store.set(sessionKey, next);
      return next;
    },
    patchSessionEntryCore: async ({ sessionKey }, update) => deps.updateSessionEntry({ sessionKey }, update),
    sessionMatchesExpectedTranscriptTurn: ({ entry }, { expectedSessionId, expectedSessionState }) =>
      entry.sessionId === expectedSessionId && Object.entries(expectedSessionState ?? {}).every(([key, value]) => entry[key] === value),
    hasRestartRecoveryTerminalRun: (entry, runId) => (entry?.restartRecoveryTerminalRunIds ?? []).includes(runId),
    hasRestartRecoverySourceClaim: (entry, sourceTurnId) =>
      norm(sourceTurnId) !== undefined && norm(entry?.restartRecoveryDeliveryRunId) !== undefined && norm(entry?.restartRecoveryDeliverySourceRunId) === norm(sourceTurnId),
    buildRestartRecoveryClaimCleanupPatch: ({ entry, recordTerminalSource, terminalSourceRunId }) => {
      const source = norm(terminalSourceRunId) ?? norm(entry.restartRecoveryDeliverySourceRunId);
      return {
        restartRecoveryDeliveryContext: undefined, restartRecoveryDeliveryRunId: undefined, restartRecoveryDeliverySourceRunId: undefined,
        restartRecoverySourceIngress: undefined, restartRecoveryBeforeAgentReplyState: undefined, restartRecoveryDeliveryReceiptState: undefined,
        ...(recordTerminalSource && source ? { restartRecoveryTerminalRunIds: [...(entry.restartRecoveryTerminalRunIds ?? []), source] } : {}),
      };
    },
    assertAgentRunLifecycleGenerationCurrent: () => {},
    createAgentRunStaleLifecycleError: () => new Error('stale'),
  };
  const make = new Function(...Object.keys(deps), `${source.slice(start, end)}; return createReplyRestartRecoveryClaimController;`);
  return { store, create: make(...Object.values(deps)) };
}

function recorder(store, sessionKey, { failAfterCommit }) {
  return {
    hasPersisted: () => false,
    persistApproved: async ({ sessionLifecyclePatch }) => {
      // Same order as persistUserTurnTranscript: the turn and lifecycle patch commit, then the projection wait.
      const next = { ...store.get(sessionKey), ...sessionLifecyclePatch };
      store.set(sessionKey, next);
      if (failAfterCommit) throw new Error('SessionTranscriptProjectionUnavailableError: Session transcript projection is rebuilding');
      return { sessionEntry: next };
    },
  };
}

function scenario(source) {
  const { store, create } = loadController(source);
  const sessionKey = 'agent:main:feishu:group:oc_test';
  store.set(sessionKey, { sessionId: 's1', status: 'done', endedAt: 1, startedAt: 0, runtimeMs: 1 });
  const controller = (sourceTurnId) => create({
    sessionKey, storePath: '/store', sourceTurnId,
    getSessionId: () => 's1', getEntry: () => store.get(sessionKey), setEntry: () => {},
    resolveDeliveryContext: () => ({ channel: 'feishu', to: 'oc_test' }),
    resolveUserTurnTarget: () => ({}),
    lifecycleGeneration: undefined, isRestartAbort: () => false,
  });
  const admit = (sourceTurnId, failAfterCommit = false, custom) => controller(sourceTurnId)
    .admitUserTurn(Object.assign(custom ?? recorder(store, sessionKey, { failAfterCommit }), {
      getPersistedMessage: () => ({ idempotencyKey: sourceTurnId }),
    }));
  return { store, sessionKey, admit };
}

test('stock chunk: a projection error after the claim commit wedges the session', async () => {
  const { store, sessionKey, admit } = scenario(stock);
  await assert.rejects(admit('m1', true), /projection is rebuilding/);
  assert.equal(store.get(sessionKey).status, 'running');
  await assert.rejects(admit('m2'), /restart recovery claim changed before agent adoption/);
  assert.equal(await admit('m1'), 'duplicate-source');
});

test('patched chunk: the failed admission releases its claim and both messages are admitted', async () => {
  const { store, sessionKey, admit } = scenario(patched);
  await assert.rejects(admit('m1', true), /projection is rebuilding/);
  const after = store.get(sessionKey);
  assert.equal(after.status, 'done');
  assert.equal(after.endedAt, 1);
  assert.equal(after.restartRecoveryDeliveryRunId, undefined);
  assert.equal(after.restartRecoveryTerminalRunIds, undefined);
  assert.equal(await admit('m1'), 'admitted');
  assert.equal(store.get(sessionKey).restartRecoveryDeliverySourceRunId, 'm1');
});

test('patched chunk: a claim another writer took over meanwhile is left alone', async () => {
  const { store, sessionKey, admit } = scenario(patched);
  const takeover = { status: 'running', restartRecoveryDeliveryRunId: 'other-run', restartRecoveryDeliverySourceRunId: 'm9' };
  const failing = recorder(store, sessionKey, { failAfterCommit: true });
  const persist = failing.persistApproved;
  failing.persistApproved = async (options) => {
    try { return await persist(options); } finally { store.set(sessionKey, { ...store.get(sessionKey), ...takeover }); }
  };
  await assert.rejects(admit('m1', true, failing), /projection is rebuilding/);
  assert.equal(store.get(sessionKey).restartRecoveryDeliveryRunId, 'other-run');
  assert.equal(store.get(sessionKey).status, 'running');
});
