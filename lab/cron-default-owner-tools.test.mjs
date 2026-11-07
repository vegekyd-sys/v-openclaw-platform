import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-cron-default-owner-tools.mjs';
import { OUTPUT_DIR, PLAN } from './build-cron-default-owner-tools.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

test('plan lists the patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

for (const file of FILES) {
  test(`${file.name} carries the marker, parses, and refuses a second patch`, () => {
    const out = read(file.name);
    assert(out.includes(MARKER));
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

// Pull a top-level function out of the patched chunk and run it against stubs.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

const OWNER = { agentId: 'makaron', sessionKey: 'agent:makaron:feishu:group:oc_test', accountId: 'default' };
const POLICY = { version: 1, mode: 'account', ownerSessionKey: OWNER.sessionKey, ownerAccountId: OWNER.accountId };

function loadRunToolsAllow() {
  const src = extractFunction(read('isolated-agent-BxeXdw5A.js'), 'resolveCronRunToolsAllow');
  // Same contract as V's resolveCronScheduledToolPolicy: a policy only for a defined list
  // whose account owner matches the persisted owner.
  const resolveCronScheduledToolPolicy = ({ toolsAllow, scheduledToolPolicy, owner }) => {
    if (toolsAllow === undefined || !scheduledToolPolicy) return undefined;
    if (scheduledToolPolicy.mode === 'trusted') return scheduledToolPolicy;
    return owner?.sessionKey === scheduledToolPolicy.ownerSessionKey && owner?.accountId === scheduledToolPolicy.ownerAccountId
      ? scheduledToolPolicy
      : undefined;
  };
  return new Function('resolveCronScheduledToolPolicy', `${src}\nreturn resolveCronRunToolsAllow;`)(resolveCronScheduledToolPolicy);
}

// The shape of V's 19:30 X drafts job (eb525073), trimmed.
const snapshotJob = (patch = {}) => ({
  owner: OWNER,
  scheduledToolPolicy: POLICY,
  payload: { kind: 'agentTurn', message: 'drafts', toolsAllow: ['message', 'memory_get', 'file_write'], toolsAllowIsDefault: true },
  ...patch,
});

test('an automatic creator snapshot runs with its owner conversation\'s tools', () => {
  const resolve = loadRunToolsAllow();
  assert.deepEqual(resolve(snapshotJob()), ['*']);
});

test('lists that are not automatic owner-bound snapshots keep their stored list', () => {
  const resolve = loadRunToolsAllow();
  const stored = ['message', 'memory_get', 'file_write'];
  const cases = {
    explicit: snapshotJob({ payload: { kind: 'agentTurn', message: 'x', toolsAllow: stored } }),
    'owner mismatch': snapshotJob({ owner: { ...OWNER, sessionKey: 'agent:makaron:feishu:group:oc_other' } }),
    'no owner policy': snapshotJob({ scheduledToolPolicy: undefined }),
    'condition trigger': snapshotJob({ trigger: { script: 'return { fire: true }' } }),
    'codex app authority': snapshotJob({ runtimeAuthority: { version: 1 } }),
    'authority recovery': snapshotJob({ runtimeAuthorityRecoveryRequired: true }),
  };
  for (const [label, job] of Object.entries(cases)) {
    assert.deepEqual(resolve(job), stored, label);
  }
  assert.deepEqual(resolve({ ...snapshotJob(), payload: { kind: 'script', script: 'x', toolsAllow: stored, toolsAllowIsDefault: true } }), stored, 'script payload');
});

test('run preparation and the command preflight both use the resolved list', () => {
  const out = read('isolated-agent-BxeXdw5A.js');
  assert.match(out, /const agentPayload = input\.job\.payload\.kind === "agentTurn" \? \{\n\t\t\t\.\.\.input\.job\.payload,\n\t\t\ttoolsAllow: resolveCronRunToolsAllow\(input\.job\)\n\t\t\} : null;/u);
  const preflight = extractFunction(out, 'resolveCronCommandPromptPreflight');
  assert.match(preflight, /classifyCronAgentTurnShellPrompt\(\{\n\t\t\.\.\.job\.payload,\n\t\ttoolsAllow: resolveCronRunToolsAllow\(job\)\n\t\}\)/u);
  // Trigger scripts and script payloads keep reading the stored list.
  assert.equal(out.split('resolveCronRunToolsAllow(').length, 4);
});

test('a wildcard list keeps the creator exec pin without inserting exec', () => {
  const src = extractFunction(read('scheduled-tool-policy-WcH3cpLk.js'), 'restoreCronPinnedExecGrant');
  const restore = new Function('resolveMatchingCronExecTarget', `${src}\nreturn restoreCronPinnedExecGrant;`)(() => ({ grantIndex: 0 }));
  assert.deepEqual(restore({ toolsAllow: ['*'] }), ['*']);
  assert.deepEqual(restore({ toolsAllow: ['read'] }), ['exec', 'read']);
});
