import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {MEMO_MARKER, patchProviderEnvVarsChunk} from './patch-auth-lookup-memo.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const sha = value => createHash('sha256').update(value).digest('hex');
const base = fs.readFileSync(path.join(here, 'release-files/openclaw-9.1-base/provider-env-vars-BMbvepMk.js'), 'utf8');
const built = fs.readFileSync(path.join(here, 'release-files/auth-lookup-memo/provider-env-vars-BMbvepMk.js'), 'utf8');

test('release file is the patched upstream chunk; patch applies once', () => {
  assert.equal(sha(base), '78bedb00551a0b7f7d54f1a2bb8448053decb0f91ba72d04d9d7ddd25fb58cad');
  const patched = patchProviderEnvVarsChunk(base);
  assert.equal(built, patched);
  assert.throws(() => patchProviderEnvVarsChunk(patched), /already patched/);
  assert.ok(patched.includes(MEMO_MARKER));
});

test('uncached body is unchanged and exports are untouched', () => {
  const body = src => src.slice(src.indexOf('\tconst lookupParams = {'), src.indexOf('/** Resolves env vars used by setup'));
  assert.equal(body(built), body(base));
  const exports = src => src.slice(src.lastIndexOf('export {'));
  assert.equal(exports(built), exports(base));
});

// Run the memo wrapper against fakes by evaluating just the patched function region.
function loadWrapper(resolveSnapshot, compute) {
  const start = built.indexOf(`// ${MEMO_MARKER}`);
  const end = built.indexOf('function resolveProviderAuthLookupMapsFromSnapshot(');
  const region = built.slice(start, end);
  return new Function('resolveProviderMetadataSnapshot', 'resolveProviderAuthLookupMapsFromSnapshot', 'process',
    `${region}\nreturn resolveProviderAuthLookupMaps;`)(resolveSnapshot, compute, process);
}

test('memo keys on snapshot, config object and trust flag; switch turns it off', () => {
  const snapshotA = {plugins: []}, snapshotB = {plugins: []};
  let snapshot = snapshotA, computed = 0;
  const f = loadWrapper(() => snapshot, (params, snap) => ({snap, config: params?.config, n: ++computed}));
  const config = {};
  const first = f({config});
  assert.equal(f({config}), first);
  assert.equal(f({config, workspaceDir: '/x'}), first, 'workspaceDir only selects the snapshot');
  assert.notEqual(f({config: {}}), first);
  assert.notEqual(f({config, includeUntrustedWorkspacePlugins: false}), first);
  assert.notEqual(f({config, includeUntrustedWorkspacePlugins: true}), first);
  assert.equal(f({config, includeUntrustedWorkspacePlugins: undefined}), first);
  const noConfig = f({});
  assert.equal(f(undefined), noConfig);
  snapshot = snapshotB;
  assert.notEqual(f({config}), first, 'a new snapshot recomputes');
  const before = computed;
  process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO = '0';
  try {
    f({config}); f({config});
    assert.equal(computed, before + 2);
  } finally {
    delete process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO;
  }
});
