import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { patchOpenClawDelegateTimeout, patchSystemAgentTransportAuthority } from './gateway-self-config-authority.mjs';
import {
  OWNER_DIRECT_HELPER,
  patchDelegateClosedApprovalMisread,
  patchSystemAgentOwnerDirectAutoReview,
} from './gateway-self-config-realpath.mjs';

const resolveOwner = new Function(`${OWNER_DIRECT_HELPER}; return resolveDelegatedOwnerDirectMessage;`)();
const owner = 'ou_cb133fd4414f0607e8b46a3195c7b9d8';
const direct = {
  agentId: 'makaron',
  sessionKey: `agent:makaron:feishu:direct:${owner}`,
  turnSourceChannel: 'feishu',
  turnSourceTo: `user:${owner}`,
};
const callerIdentity = { agentId: 'makaron', sessionKey: direct.sessionKey };

test('only an exact configured owner direct message qualifies', () => {
  assert.equal(resolveOwner({
    delegation: { ...direct, turnSourceChannel: 'webchat' },
    callerIdentity,
    cfg: { commands: { ownerAllowFrom: [`feishu:${owner}`] } },
  }), `feishu:${owner}`);
  for (const params of [
    { delegation: { ...direct, sessionKey: `agent:makaron:feishu:group:${owner}` }, callerIdentity: { ...callerIdentity, sessionKey: `agent:makaron:feishu:group:${owner}` } },
    { delegation: direct, callerIdentity: { ...callerIdentity, agentId: 'someone-else' } },
  ]) assert.equal(resolveOwner({ ...params, cfg: { commands: { ownerAllowFrom: [`feishu:${owner}`] } } }), undefined);
  assert.equal(resolveOwner({ delegation: direct, callerIdentity, cfg: { commands: { ownerAllowFrom: ['*'] } } }), undefined);
  assert.equal(resolveOwner({ delegation: direct, callerIdentity, cfg: { commands: { ownerAllowFrom: ['feishu:someone-else'] } } }), undefined);
});

test('system agent owner patch is exact, idempotent, and keeps active authority at use time', () => {
  const fixture = readFileSync(new URL('./fixtures/gateway-self-config-authority/system-agent-BhnNvC3z.js', import.meta.url), 'utf8');
  const baseline = patchSystemAgentTransportAuthority(fixture);
  const patched = patchSystemAgentOwnerDirectAutoReview(baseline);
  assert.equal(patchSystemAgentOwnerDirectAutoReview(patched), patched);
  assert.match(patched, /manager\.resolveAutoReview\(record\.id/);
  assert.match(patched, /assertLiveApprovalAuthority\(\)/);
  assert.match(patched, /await queuedApproval\.ownerApplication/);
  assert.match(patched, /if \(!appliedReply\?\.applied\) throw/);
  assert.match(patched, /agentId !== callerIdentity\.agentId/);
  assert.throws(() => patchSystemAgentOwnerDirectAutoReview('unrelated'), /refuse drift/);
});

test('delegate never treats an invisible approval as operator action', () => {
  const fixture = readFileSync(new URL('./fixtures/gateway-self-config-authority/openclaw-tools-BODVdJQD.js', import.meta.url), 'utf8');
  const baseline = patchOpenClawDelegateTimeout(fixture);
  const patched = patchDelegateClosedApprovalMisread(baseline);
  assert.equal(patchDelegateClosedApprovalMisread(patched), patched);
  assert.doesNotMatch(patched, /approvalRecordClosed/);
  assert.doesNotMatch(patched, /The approval record closed after operator action/);
  assert.match(patched, /needsApproval: true/);
  assert.match(patched, /proposalId: result\.proposalId/);
  assert.throws(() => patchDelegateClosedApprovalMisread('unrelated'), /refuse drift/);
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
for (const [name, baselinePatch, realPathPatch] of [
  ['openclaw-tools-BODVdJQD.js', patchOpenClawDelegateTimeout, patchDelegateClosedApprovalMisread],
  ['system-agent-BhnNvC3z.js', patchSystemAgentTransportAuthority, patchSystemAgentOwnerDirectAutoReview],
]) test(`${name} release file is exactly derived from the prior accepted patch`, () => {
  const fixture = readFileSync(new URL(`./fixtures/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
  const release = readFileSync(new URL(`./release-files/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
  assert.equal(release, realPathPatch(baselinePatch(fixture)));
  assert.equal(sha256(release).length, 64);
});
