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
  patchGatewayAgentRuntimeIdentityMethods,
  patchInProcessGatewayFallbackOptions,
  patchOpenClawDelegateTimeout,
} from './gateway-self-config-authority.mjs';

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

test('authority remains bounded to the active caller and only adds openclaw.chat', () => {
  const patched = patchGatewayAgentRuntimeIdentityMethods(GATEWAY_BEFORE);
  assert.equal((patched.match(/"openclaw\.chat"/g) ?? []).length, 1);
  assert.equal(patched.includes('config.set'), false);
  assert.equal(patched.includes('gateway.restart'), false);
});

test('delegate timeout is two minutes and reaches the remote fallback transport', () => {
  const delegate = patchOpenClawDelegateTimeout(OPENCLAW_TOOL_BEFORE);
  const fallback = patchInProcessGatewayFallbackOptions(SESSIONS_HELPERS_BEFORE);
  assert.match(delegate, /timeoutMs: 12e4/);
  assert.match(fallback, /options\.timeoutMs/);
  assert.match(fallback, /options\.signal/);
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
for (const [name, patch, beforeSha, afterSha] of [
  ['gateway-DVu5Urba.js', patchGatewayAgentRuntimeIdentityMethods, '2beb3a88a1a0609e46b3f331473a73a63b1c8f10454359a5a3ed6c9582a68344', 'd9802bcb326491cfea724c0d8248ef42a805d6ca9ea639ee1e20d2faee33aad7'],
  ['sessions-helpers-Bn_vDNby.js', patchInProcessGatewayFallbackOptions, 'f88076204b3df1773c093e837f436c902a5fee899ebda1760be8b34d6ae5eb60', '4c8dd6f402ee54ce0eee133cfefe25e01340a485d598390ad21d22fc8ed8206c'],
  ['openclaw-tools-BODVdJQD.js', patchOpenClawDelegateTimeout, '62ede7a96acbba962115aee945882cfe132ae199c326c577e23097f4cfda2c94', '8536373e36af8252a880b807a25f63f6050ac3f2867a001d4ded8f0ea3c51dec'],
]) {
  test(`${name} release artifact is derived from the exact live baseline`, () => {
    const before = readFileSync(new URL(`./fixtures/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
    const after = readFileSync(new URL(`./release-files/gateway-self-config-authority/${name}`, import.meta.url), 'utf8');
    assert.equal(sha256(before), beforeSha);
    assert.equal(after, patch(before));
    assert.equal(sha256(after), afterSha);
  });
}
