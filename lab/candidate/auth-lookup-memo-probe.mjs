// Real-dist probe for lab/release-files/auth-lookup-memo (Node 24, against a dist dir with the patched chunk):
// cached result equals the uncached one, repeats return the same object, a new config object recomputes.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict';
const dist = process.argv[2];
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-')); process.env.OPENCLAW_STATE_DIR = state; process.env.HOME = state;
const m = await import(path.join(dist, 'provider-env-vars-BMbvepMk.js'));
const f = m.o;
const config = {plugins: {}};
let t = performance.now(); const a = f({config}); const cold = performance.now() - t;
t = performance.now(); const b = f({config}); const warm = performance.now() - t;
process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO = '0';
t = performance.now(); const c = f({config}); const off = performance.now() - t;
delete process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO;
const d = f({config: {plugins: {}}});
const e = f({config, includeUntrustedWorkspacePlugins: false});
assert.equal(a, b); assert.notEqual(a, c); assert.deepEqual(a, c); assert.notEqual(a, d); assert.deepEqual(a, d);
const eOff = (process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO='0', f({config, includeUntrustedWorkspacePlugins: false})); delete process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO;
assert.deepEqual(e, eOff);
console.log(JSON.stringify({providers: Object.keys(a.envCandidateMap).length, aliases: Object.keys(a.aliasMap).length, coldMs: cold.toFixed(1), warmMs: warm.toFixed(3), uncachedMs: off.toFixed(1)}));
