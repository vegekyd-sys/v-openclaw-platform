import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { MARKER, ORIGINAL_OPEN, PATCHED_OPEN, SESSION_KEYS_FN, patchAgentCommandChunk } from './patch-worker-prewarm-session-keys.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const release = read('./release-files/worker-prewarm-session-keys/agent-command-DPfawBbr.js');
const base = read('./release-files/worker-prewarm-secrets/agent-command-DPfawBbr.js');

test('release is the worker-prewarm-secrets chunk plus only the session-key step', () => {
  assert.equal(createHash('sha256').update(base).digest('hex'), '150d9003e6526e4faa5a4c9ab3454f05a3614b180cd5f832926dad28344439af');
  assert.equal(patchAgentCommandChunk(base), release);
  assert.throws(() => patchAgentCommandChunk(release), /already patched/);
  const unpatched = release
    .replace(SESSION_KEYS_FN, '')
    .replace(PATCHED_OPEN, ORIGINAL_OPEN)
    .replace('return { sessionStorePrepared: true, ...sessionKeys, ...secrets };', 'return { sessionStorePrepared: true, ...secrets };')
    .replace('\t\tsessionStorePrepared: true,\n\t\t...sessionKeys,\n', '\t\tsessionStorePrepared: true,\n');
  assert.equal(unpatched, base);
});

test('the scan runs before the writable open, behind its switch, and both returns carry it', () => {
  const body = release.slice(release.indexOf('async function prewarmAgentCommandRuntimes'), release.indexOf(MARKER));
  const step = body.indexOf('await prewarmCanonicalSessionKeys(normalizeAgentId(params.agentId))');
  assert(step > body.indexOf('if (!params?.config || !params.agentId) return'));
  assert(step < body.indexOf('openOpenClawAgentDatabase({'));
  assert(body.includes('process.env.OPENCLAW_WORKER_EAGER_PREPARE_SESSION_KEYS === "0" ? {} :'));
  assert.equal(body.split('...sessionKeys').length, 3);
});

test('the step reads through the read-only helper and never throws', async () => {
  const fn = SESSION_KEYS_FN.slice(SESSION_KEYS_FN.indexOf('async function'));
  const calls = [];
  const make = (impl) => new Function('performance', 'importer',
    `${fn.replaceAll('await Promise.all([import("./session-accessor.sqlite-transcript-state-Cz9g7S9v.js"), import("./openclaw-agent-db-readonly-wb-jdztx.js")])', 'await importer()')}\nreturn prewarmCanonicalSessionKeys;`)(performance, impl);
  const ok = make(async () => [{ p: (db) => calls.push(db) }, { n: (op, options) => ({ found: true, value: op({ options }) }) }]);
  assert.deepEqual(Object.keys(await ok('main')).sort(), ['sessionKeysMs', 'sessionKeysPrepared']);
  assert.equal(calls[0].options.agentId, 'main');
  const missing = make(async () => [{ p: () => {} }, { n: () => ({ found: false, reason: 'database-missing' }) }]);
  assert.equal((await missing('main')).sessionKeysReason, 'database-missing');
  const broken = make(async () => [{ p: () => { throw new Error('requires repair'); } }, { n: (op) => ({ found: true, value: op({}) }) }]);
  assert.deepEqual(await broken('main'), { sessionKeysPrepared: false, sessionKeysError: 'requires repair' });
});
