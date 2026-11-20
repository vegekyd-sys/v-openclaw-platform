import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, patchUsage } from './patch-usage-session-select.mjs';
import { OUTPUT_DIR, PLAN } from './build-usage-session-select.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const out = fs.readFileSync(path.join(repo, OUTPUT_DIR, 'usage-C3nh9kcO.js'), 'utf8');
// V's bytes since startup-stall-usage-20261114 are the usage-offload release file.
const base = fs.readFileSync(path.join(repo, 'lab/release-files/usage-offload/usage-C3nh9kcO.js'), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

function extract(name) {
  const start = out.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  let depth = 0;
  for (let i = out.indexOf('{', start); i < out.length; i += 1) {
    if (out[i] === '{') depth += 1;
    else if (out[i] === '}' && (depth -= 1) === 0) return out.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test('plan replaces usage-C3nh9kcO.js by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, [{
    source: `${OUTPUT_DIR}/usage-C3nh9kcO.js`,
    target: 'openclaw/dist/usage-C3nh9kcO.js',
    before: FILES[0].before,
  }]);
  assert.equal(sha(base), FILES[0].before);
  assert.equal(patchUsage(base), out);
  assert(out.includes(MARKER));
  assert.throws(() => patchUsage(out), /already applied/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, 'usage-C3nh9kcO.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('one session reads its matching rows; lists read the list projection, then context weights', () => {
  assert.match(out, /\.\.\.specificKey && groupingMode !== "family" \? \{ match: resolveSpecificUsageSessionMatch\(config, expectDefined\(effectiveAgentId, "specific session owner"\), specificKey\) \} : \{ projection: "list" \}/u);
  assert.doesNotMatch(out, /loadCombinedSessionStoreForGatewayCore\(config, effectiveAgentId \? \{ agentId: effectiveAgentId \} : \{\}\)/u);
  assert.match(out, /\t\t\t\t\t\tvisibilityFilter\n\t\t\t\t\t\}\);\n\t\t\t\t\tloadUsageContextWeights\(\{\n\t\t\t\t\t\tconfig,\n\t\t\t\t\t\tentries: mergedEntries,\n\t\t\t\t\t\tlimit\n/u);

  const resolveSpecific = new Function('resolveStoredSessionKeyForAgentStore', 'parseAgentSessionKey',
    `${extract('resolveSpecificUsageSessionMatch')}\nreturn resolveSpecificUsageSessionMatch;`)(
    ({ sessionKey }) => sessionKey,
    (key) => (key.startsWith('agent:') ? { agentId: key.split(':')[1], rest: key.split(':').slice(2).join(':') } : null),
  );
  assert.deepEqual(resolveSpecific({}, 'makaron', 'agent:makaron:feishu:direct:ou_1'), {
    sessionKeys: ['agent:makaron:feishu:direct:ou_1', 'agent:makaron:feishu:direct:ou_1'],
    sessionIds: ['feishu:direct:ou_1', 'agent:makaron:feishu:direct:ou_1'],
  });

  const calls = [];
  const loadContextWeights = new Function('loadCombinedSessionStoreForGatewayCore',
    `${extract('loadUsageContextWeights')}\nreturn loadUsageContextWeights;`)((config, opts) => {
    calls.push(opts);
    return { store: Object.fromEntries(opts.match.sessionKeys.map((key) => [key, { systemPromptReport: { key } }])) };
  });
  const entries = [
    { key: 'a', agentId: 'makaron', storeEntry: { sessionId: 'a' } },
    { key: 'b', agentId: 'makaron', storeEntry: { sessionId: 'b', systemPromptReport: { own: true } } },
    { key: 'agent:makaron:c', agentId: 'makaron' },
    { key: 'd', agentId: 'ops', storeEntry: { sessionId: 'd' } },
    { key: 'e', agentId: 'makaron', storeEntry: { sessionId: 'e' } },
  ];
  loadContextWeights({ config: {}, entries, limit: 4 });
  assert.deepEqual(calls, [
    { agentId: 'makaron', match: { sessionKeys: ['a'] } },
    { agentId: 'ops', match: { sessionKeys: ['d'] } },
  ]);
  assert.deepEqual(entries.map((e) => e.storeEntry?.systemPromptReport ?? null), [{ key: 'a' }, { own: true }, null, { key: 'd' }, null]);
});

test('read-scoped callers without an operator role run in the usage worker', () => {
  const can = (admin, cap) => new Function('isGatewayAdmin', 'operatorSessionCap',
    `${extract('canRunUsageRpcInWorker')}\nreturn canRunUsageRpcInWorker;`)(() => admin, () => cap);
  assert.equal(can(true, undefined)('sessions.usage', {}, {}), true);
  assert.equal(can(false, undefined)('sessions.usage', {}, {}), true, 'openclaw gateway call (operator.read), no roles');
  assert.equal(can(false, undefined)('usage.cost', {}, {}), true);
  assert.equal(can(false, 'none')('sessions.usage', {}, {}), false, 'filtered by an operator role');
  assert.equal(can(false, 'read')('sessions.usage', {}, {}), false, 'role-bound callers keep their own identity');
  assert.equal(can(true, 'none')('sessions.usage', {}, {}), false);
  assert.equal(can(false, 'none')('sessions.usage.logs', {}, {}), true);
});
