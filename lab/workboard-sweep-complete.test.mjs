// workboard-sweep-complete: the Workboard lifecycle sweep's full listing covers the whole session catalog, and a
// complete snapshot fails only an orphaned prepared launch. Offline checks of the release file; the V-scale run with
// the real sessions.list handler and WorkboardStore is lab/candidate/workboard-sweep-complete-ab.mjs
// (see lab/workboard-sweep-complete.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ENV, FILES, INDEX, MARKER } from './patch-workboard-sweep-complete.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/workboard-sweep-complete.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
// V's bytes (db91.6 core/dist on 2026-11-18): the workboard-sweep-bounded (#487) release.
const ORIGIN = path.join(repo, 'lab/release-files/workboard-sweep-bounded', INDEX);
const RELEASE = path.join(repo, 'lab/release-files/workboard-sweep-complete', INDEX);
const vBytes = fs.readFileSync(ORIGIN, 'utf8');
const released = fs.readFileSync(RELEASE, 'utf8');

test('plan replaces V bytes of the Workboard plugin; patch and unpatch round-trip', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map(([name]) => `openclaw/dist/${name}`));
  const [[, before, patch, unpatch]] = FILES;
  const [file] = plan.files;
  assert.equal(file.before, before);
  assert.equal(sha(vBytes), before, 'workboard-sweep-bounded release is not V\'s bytes');
  assert.equal(sha(released), file.after, file.source);
  assert.equal(patch(vBytes), released, 'patch(V)');
  assert.equal(unpatch(released), vBytes, 'unpatch(release)');
  const r = spawnSync(process.execPath, ['--check', RELEASE], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(released, new RegExp(MARKER, 'u'));
  // no other pending plan in this repository replaces the same file from V's bytes
  for (const name of fs.readdirSync(path.join(repo, 'lab')).filter((n) => n.endsWith('.plan.json') && n !== 'workboard-sweep-complete.plan.json')) {
    const other = JSON.parse(fs.readFileSync(path.join(repo, 'lab', name), 'utf8'));
    for (const f of other.files ?? []) if (f.target === file.target) assert.notEqual(f.before, before, `${name} also patches V's ${INDEX}`);
  }
});

// The lifecycle-sync region of a build, with the plugin-local helpers it closes over.
function lifecycle(source) {
  const start = source.indexOf('//#region extensions/workboard/src/lifecycle-sync.ts');
  const end = source.indexOf('//#endregion', start);
  assert(start > 0 && end > start);
  const deps = {
    resolveGlobalSingleton: (_key, create) => create(),
    isRecord: (x) => !!x && typeof x === 'object' && !Array.isArray(x),
    cardSessionKey: (card) => card.sessionKey,
    cardRunId: (card) => card.runId,
    workboardCardSessionLookupKey: (card) => card.execution?.sessionKey ?? card.sessionKey ?? '',
    workboardCardMatchesLifecycleLink: () => false,
    isWorkboardWorktreeCleanupCandidate: () => false,
    cleanupWorkboardCardWorktree: async () => {},
  };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}\nreturn { readWorkboardLifecycleSessions, syncWorkboardLifecycleSessions };`)(...Object.values(deps));
}
const before = lifecycle(vBytes);
const after = lifecycle(released);

async function read(build, payload, options) {
  const calls = [];
  const gateway = { isAvailable: async () => true, request: async (method, params) => { calls.push(params); return payload; } };
  const snapshot = await build.readWorkboardLifecycleSessions(gateway, options);
  return { snapshot, params: calls[0] };
}
const page = (n) => Array.from({ length: n }, (_, i) => ({ key: `agent:makaron:subagent:s${i}`, status: 'done', updatedAt: i }));

test('a full read lists the whole catalog and is complete when the Gateway says nothing is left', async () => {
  // V today: 10,000 of ~22,900 rows, hasMore true: never complete
  const truncated = { sessions: page(10_000), hasMore: true, totalCount: 22_900 };
  assert.equal((await read(before, truncated)).snapshot.complete, false);
  assert.equal((await read(before, truncated)).params.limit, 10_000);
  const whole = { sessions: page(22_900), hasMore: false, totalCount: 22_900 };
  const r = await read(after, whole);
  assert.equal(r.params.limit, 1_000_000);
  assert.equal(r.snapshot.complete, true);
  assert.equal(r.snapshot.sessions.length, 22_900);
  // the Gateway's hasMore wins over the page length
  assert.equal((await read(after, { sessions: page(3), hasMore: true })).snapshot.complete, false);
  // no hasMore (older peer): only a page shorter than the old fixed page counts, as before
  assert.equal((await read(after, { sessions: page(10_000) })).snapshot.complete, false);
  assert.equal((await read(after, { sessions: page(9_999) })).snapshot.complete, true);
  // the incremental read keeps its page and is never complete
  const partial = await read(after, { sessions: page(3), hasMore: false }, { includeUnknown: false, activeMinutes: 2 });
  assert.equal(partial.params.limit, 10_000);
  assert.equal(partial.snapshot.complete, false);
  // all other request parameters are unchanged (workboard-full-sweep #614's worker whitelist reads them)
  const { limit: _a, ...b } = (await read(before, whole)).params;
  const { limit: _b, ...a } = r.params;
  assert.deepEqual(a, b);
});

test(`${ENV}=0 restores the fixed page and length-based completeness`, async () => {
  process.env[ENV] = '0';
  try {
    for (const payload of [{ sessions: page(10_000), hasMore: false }, { sessions: page(3), hasMore: true }]) {
      const a = await read(after, payload);
      const b = await read(before, payload);
      assert.deepEqual(a.params, b.params);
      assert.deepEqual(a.snapshot, b.snapshot);
    }
  } finally {
    delete process.env[ENV];
  }
});

test('a complete snapshot fails only orphaned prepared launches', async () => {
  const now = 2_000_000_000_000;
  const processStartedAt = now - 3_600_000;
  const grace = 30 * 60 * 1000;
  const card = (id, preparedAt) => ({
    id, status: 'running', sessionKey: `agent:makaron:subagent:workboard-${id}`, runId: `run-${id}`,
    execution: { status: 'running', sessionKey: `agent:makaron:subagent:workboard-${id}`, runId: `run-${id}` },
    metadata: { automation: { launch: { phase: 'prepared', requestedSessionKey: `agent:makaron:subagent:workboard-${id}`, provisionalRunId: `run-${id}`, preparedAt } } },
  });
  const cards = [
    card('earlier-process', processStartedAt - 1),
    card('at-process-start', processStartedAt),
    card('in-flight', now - 5_000),
    card('just-inside-grace', now - grace + 1),
    card('past-grace', now - grace),
  ];
  const run = async (build, extra) => {
    const failed = [];
    const store = { failPreparedLaunch: async (id) => { failed.push(id); return true; }, lifecycleSyncPatch: () => undefined };
    await build.syncWorkboardLifecycleSessions({ store, cards, sessions: [], complete: true, now, ...extra });
    return failed;
  };
  // V: any prepared launch without a session fails once the snapshot is complete (the September race)
  assert.deepEqual(await run(before, {}), cards.map((c) => c.id));
  assert.deepEqual(await run(after, { snapshotStartedAt: now, processStartedAt }), ['earlier-process', 'at-process-start', 'past-grace']);
  // an incomplete snapshot fails nothing, as before
  const store = { failPreparedLaunch: async () => assert.fail('failed on an incomplete snapshot'), lifecycleSyncPatch: () => undefined };
  await after.syncWorkboardLifecycleSessions({ store, cards, sessions: [], complete: false, now, snapshotStartedAt: now, processStartedAt });
  // the switch restores V's decision
  process.env[ENV] = '0';
  try {
    assert.deepEqual(await run(after, { snapshotStartedAt: now, processStartedAt }), cards.map((c) => c.id));
  } finally {
    delete process.env[ENV];
  }
});

test('the reconcile passes the sweep start and the process start to the sync', () => {
  assert.match(released, /\t\t\t\t\t\t\tsnapshotStartedAt: sweepStartedAt,\n\t\t\t\t\t\t\tprocessStartedAt: params\.processStartedAt \?\? performance\.timeOrigin,\n\t\t\t\t\t\t\tnow: params\.now\?\.\(\) \?\? Date\.now\(\)/u);
  assert.match(released, /const sweepStartedAt = Date\.now\(\);/u);
});
