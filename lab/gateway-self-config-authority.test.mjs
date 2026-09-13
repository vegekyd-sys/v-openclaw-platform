import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GATEWAY_AFTER,
  GATEWAY_BEFORE,
  OPENCLAW_TOOL_AFTER,
  OPENCLAW_TOOL_BEFORE,
  SESSIONS_HELPERS_AFTER,
  SESSIONS_HELPERS_BEFORE,
  SYSTEM_AGENT_AUTHORITY_AFTER,
  SYSTEM_AGENT_AUTHORITY_BEFORE,
  SYSTEM_AGENT_CALL_AFTER,
  SYSTEM_AGENT_CALL_BEFORE,
  patchGatewayAgentRuntimeIdentityMethods,
  patchInProcessGatewayFallbackOptions,
  patchOpenClawDelegateTimeout,
  patchSystemAgentTransportAuthority,
} from './gateway-self-config-authority.mjs';
import {
  patchDelegateClosedApprovalMisread,
  patchSystemAgentOwnerDirectAutoReview,
} from './gateway-self-config-realpath.mjs';

for (const [name, patch, before, after] of [
  ['runtime identity allowlist', patchGatewayAgentRuntimeIdentityMethods, GATEWAY_BEFORE, GATEWAY_AFTER],
  ['fallback timeout propagation', patchInProcessGatewayFallbackOptions, SESSIONS_HELPERS_BEFORE, SESSIONS_HELPERS_AFTER],
  ['OpenClaw delegate timeout', patchOpenClawDelegateTimeout, OPENCLAW_TOOL_BEFORE, OPENCLAW_TOOL_AFTER],
]) {
  test(`${name} patch is exact, idempotent, and refuses drift`, () => {
    const source = `prefix\n${before}\nsuffix`;
    const patched = patch(source);
    assert.equal(patched, `prefix\n${after}\nsuffix`);
    assert.equal(patch(patched), patched);
    assert.throws(() => patch('unrelated'), /refuse drift/);
    assert.throws(() => patch(`${source}\n${source}`), /ambiguous/);
  });
}

test('System Agent transport authority patch is exact, idempotent, and refuses drift', () => {
  const source = `${SYSTEM_AGENT_AUTHORITY_BEFORE}\nbody\n${SYSTEM_AGENT_CALL_BEFORE}`;
  const expected = `${SYSTEM_AGENT_AUTHORITY_AFTER}\nbody\n${SYSTEM_AGENT_CALL_AFTER}`;
  const patched = patchSystemAgentTransportAuthority(source);
  assert.equal(patched, expected);
  assert.equal(patchSystemAgentTransportAuthority(patched), patched);
  assert.throws(() => patchSystemAgentTransportAuthority('unrelated'), /refuse drift/);
});

test('authority remains bounded to the active caller and only adds the delegated methods', () => {
  const patched = patchGatewayAgentRuntimeIdentityMethods(GATEWAY_BEFORE);
  assert.equal((patched.match(/"openclaw\.chat"/g) ?? []).length, 1);
  assert.equal((patched.match(/"approval\.get"/g) ?? []).length, 1);
  assert.equal(patched.includes('config.set'), false);
  assert.equal(patched.includes('gateway.restart'), false);
});

test('delegated approval accepts only the verified local backend identity and preserves worker use-time validation', () => {
  const patched = patchSystemAgentTransportAuthority(`${SYSTEM_AGENT_AUTHORITY_BEFORE}\nbody\n${SYSTEM_AGENT_CALL_BEFORE}`);
  assert.match(patched, /params\.client\?\.internal\?\.agentRuntimeIdentity/);
  assert.match(patched, /runtimeDelegatedAuthority\?\.kind === "worker"/);
  assert.match(patched, /turnClaim: workerTurnClaim/);
  assert.match(patched, /\n\t\t\t\t\t\tclient,/);
  assert.doesNotMatch(patched, /auth\?\.agentRuntimeIdentityToken/);
});

test('delegate timeout is two minutes and reaches the remote fallback transport', () => {
  const delegate = patchOpenClawDelegateTimeout(OPENCLAW_TOOL_BEFORE);
  const fallback = patchInProcessGatewayFallbackOptions(SESSIONS_HELPERS_BEFORE);
  assert.match(delegate, /timeoutMs: 12e4/);
  assert.match(delegate, /callGateway\("approval\.get", \{ id: result\.proposalId \}/);
  assert.match(delegate, /approvalRecordClosed/);
  assert.match(delegate, /approval not found/);
  assert.match(delegate, /approval\?\.status === "pending"/);
  assert.match(delegate, /setTimeout\(resolve, 8e3\)/);
  assert.match(delegate, /signal\?\.throwIfAborted/);
  assert.match(delegate, /Read the affected Gateway setting now/);
  assert.match(fallback, /options\.timeoutMs/);
  assert.match(fallback, /options\.signal/);
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
for (const [name, patch, beforeSha, afterSha] of [
  ['gateway-DVu5Urba.js', patchGatewayAgentRuntimeIdentityMethods, '2beb3a88a1a0609e46b3f331473a73a63b1c8f10454359a5a3ed6c9582a68344', 'fbe3bf4335c1974c2c6120480dbe9cb2ed34756e8e7c1178d4ff6db4fef8ba02'],
  ['sessions-helpers-Bn_vDNby.js', patchInProcessGatewayFallbackOptions, 'f88076204b3df1773c093e837f436c902a5fee899ebda1760be8b34d6ae5eb60', '4c8dd6f402ee54ce0eee133cfefe25e01340a485d598390ad21d22fc8ed8206c'],
  ['openclaw-tools-BODVdJQD.js', (source) => patchDelegateClosedApprovalMisread(patchOpenClawDelegateTimeout(source)), '62ede7a96acbba962115aee945882cfe132ae199c326c577e23097f4cfda2c94', 'b5934202f8e5a152c416cea77ef8033eb121cc0da4671f43137c6837f3932e6a'],
  ['system-agent-BhnNvC3z.js', (source) => patchSystemAgentOwnerDirectAutoReview(patchSystemAgentTransportAuthority(source)), 'edce966071cb789c23d00f6b80757f4fcf91f7ecc877236da599a8430fa22442', 'a92bba21afb0b9e85b7b327d9da269002c7930c0849e2509010927fa7f67c77d'],
]) {
  test(`${name} release artifact is derived from the exact live baseline`, () => {
    const before = readFileSync(new URL(`./fixtures/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
    const after = readFileSync(new URL(`./release-files/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
    assert.equal(sha256(before), beforeSha);
    assert.equal(after, patch(before));
    assert.equal(sha256(after), afterSha);
  });
}
