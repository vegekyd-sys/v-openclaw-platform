import test from 'node:test';
import assert from 'node:assert/strict';
import { patchAttempt, patchMessage, patchGatewayIdentity, patchHostIdentity, marker } from './patch-openclaw91-worker-native-attempt.mjs';
test('attempt bridge adds native authorization and is idempotent',()=>{
  const input='async function runEmbeddedAttempt(input) {\n\tlet params = input;\n}\n\tsetActiveEmbeddedRun(attempt.sessionId, queueHandle, attempt.sessionKey, attempt.sessionFile, input.hookAgentId);';
  const out=patchAttempt(input,'permission-change-fixture.js');
  assert.ok(out.includes(marker));assert.ok(out.includes('authorizeVlabNativePermission(queueHandle.permissionChangeOwner'));
  assert.equal(patchAttempt(out,'permission-change-fixture.js'),out);
  assert.throws(()=>patchAttempt('changed','permission-change-fixture.js'),/mismatch/);
});
test('identity relay preserves local target checks and delegates minting to native core',()=>{
 const input='\tif (identity.signedAgentRuntimeIdentityToken) return identity.signedAgentRuntimeIdentityToken;';
 const result=patchGatewayIdentity(input);
 assert.ok(result.includes('workerIdentityBridge.resolveGatewayIdentity(identity, params)'));
 assert.equal(patchGatewayIdentity(result),result);
 const host='import { t as callGatewayTool } from "./gateway-fixture.js";\n\t\tkind: "agent-harness-host-capability",';
 const patched=patchHostIdentity(host);
 assert.ok(patched.includes('await withCaller(() => vlabResolveNativeGatewayIdentity'));
 assert.ok(patched.includes('assertActive();'));
 assert.equal(patchHostIdentity(patched),patched);
});
test('message execution is Gateway-owned only when Worker explicitly handles it',()=>{
  const input='\t\t\tif (signal?.aborted) throw createAbortError("Message send aborted");';
  const out=patchMessage(input);assert.ok(out.includes('if (relayed.handled) return relayed.result'));
  assert.equal(patchMessage(out),out);assert.throws(()=>patchMessage('changed'),/mismatch/);
});
