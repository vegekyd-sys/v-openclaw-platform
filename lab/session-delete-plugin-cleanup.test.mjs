import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-session-delete-plugin-cleanup.mjs';
import { OUTPUT_DIR, PLAN } from './build-session-delete-plugin-cleanup.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const RELEASE = 'session-accessor-K0XuW6ln.js';
const patched = fs.readFileSync(path.join(repo, OUTPUT_DIR, RELEASE), 'utf8');
// V's bytes as captured by an earlier release (sha256 = plan before).
const captured = fs.readFileSync(path.join(repo, 'release/captured/v2026.9.1-db91.6-archive-retention-cutoff-20261017/dist', RELEASE), 'utf8');

test('plan lists the patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.equal(plan.files[0].before, FILES[0].before);
  assert.equal(createHash('sha256').update(captured).digest('hex'), FILES[0].before);
});

test('the release file is the patch applied to V bytes, parses, and refuses a second patch', () => {
  assert.equal(FILES[0].patch(captured), patched);
  assert(patched.includes(MARKER));
  assert.throws(() => FILES[0].patch(patched), /already patched/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, RELEASE)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

// Run the release's candidate selector against an in-memory store.
function selector(store) {
  const calls = { list: [], get: [] };
  const src = patched.slice(patched.indexOf('function listPluginHostCleanupCandidates(params) {'));
  const fn = src.slice(0, src.indexOf('\n}\n') + 2);
  const project = (entry, projection) => {
    if (projection !== 'list') return structuredClone(entry);
    const { skillsSnapshot: _s, systemPromptReport: _r, ...meta } = entry;
    return structuredClone(meta);
  };
  const deps = {
    listSessionEntriesCore: (scope) => {
      calls.list.push(scope.projection ?? 'full');
      return Object.entries(store).map(([sessionKey, entry]) => ({ sessionKey, entry: project(entry, scope.projection) }));
    },
    openSessionEntryReadView: () => ({ get: (key) => { calls.get.push(key); return store[key]; } }),
    // Same rule as the bundled matcher: no key matches all, else persisted key or session id.
    matchesPluginHostCleanupSession: (entryKey, entry, sessionKey) => {
      const key = String(sessionKey ?? '').trim().toLowerCase();
      return !key || entryKey.toLowerCase() === key || String(entry.sessionId ?? '').toLowerCase() === key;
    },
  };
  const run = new Function(...Object.keys(deps), `${fn}\nreturn listPluginHostCleanupCandidates;`)(...Object.values(deps));
  return { calls, run };
}
const store = {
  'agent:main:explicit:target': { sessionId: 'target-session', skillsSnapshot: { prompt: 'big' }, pluginExtensions: { p: {} } },
  'agent:main:explicit:other': { sessionId: 'other-session', skillsSnapshot: { prompt: 'big' }, pluginExtensions: { p: {} } },
};

for (const [name, sessionKey] of [['persisted key', 'agent:main:explicit:target'], ['session id', 'TARGET-SESSION']]) {
  test(`a session-scoped cleanup (${name}) lists metadata and reads only the matched entry whole`, () => {
    const { calls, run } = selector(store);
    const out = run({ agentId: 'main', storePath: '/s', sessionKey });
    assert.deepEqual(calls.list, ['list']);
    assert.deepEqual(calls.get, ['agent:main:explicit:target']);
    assert.deepEqual(out, [{ sessionKey: 'agent:main:explicit:target', entry: store['agent:main:explicit:target'] }]);
    assert.notEqual(out[0].entry, store['agent:main:explicit:target'], 'borrowed entries are cloned');
  });
}

test('a store-wide cleanup still lists every complete entry', () => {
  const { calls, run } = selector(store);
  const out = run({ agentId: 'main', storePath: '/s', pluginId: 'p' });
  assert.deepEqual(calls.list, ['full']);
  assert.deepEqual(calls.get, []);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].entry.skillsSnapshot, { prompt: 'big' });
});

test('the cleanup loop uses the selector', () => {
  const start = patched.indexOf('async function cleanupPluginHostSessionStore(params) {');
  const body = patched.slice(start, patched.indexOf('\n}\n', start));
  assert(body.includes('of listPluginHostCleanupCandidates(params)) {'));
  assert(!body.includes('listSessionEntriesCore('));
});
