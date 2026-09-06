import test from 'node:test';
import assert from 'node:assert/strict';
import { patchAttempt, patchMessage, patchGatewayIdentity, patchHostIdentity, patchDeferredSubagentContext, marker } from './patch-openclaw-worker-native-attempt.mjs';
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
test('deferred plugin runtime retains native Gateway instance fencing',()=>{
 const source='import { r as getGatewayContextResolver, u as withPluginRuntimePluginScope } from "./gateway-request-scope-fixture.js";\nfunction createDeferredGatewaySubagentRuntime(runtime) {\n\treturn {\n\t\trun: (...args) => runtime.subagent.run(...args)\n\t};\n}\nfunction createDeferredGatewayNodesRuntime(runtime) {';
 const out=patchDeferredSubagentContext(source);
 assert.ok(out.includes('capturedResolver ??= getGatewayContextResolver(runtime.subagent)'));
 assert.match(out,/t as bindGatewayContextResolver/);
 assert.equal(patchDeferredSubagentContext(out),out);
});

test('9.2 loader import aliases preserve native owner checks',()=>{
 const source='import { d as withPluginRuntimePluginScope, f as withPluginRuntimeRegistryScope, r as getGatewayContextResolver, u as withPluginRuntimePluginIdScope } from "./gateway-request-scope-fixture.js";\nfunction createDeferredGatewaySubagentRuntime(runtime) {\n\treturn {\n\t\trun: (...args) => runtime.subagent.run(...args)\n\t};\n}\nfunction createDeferredGatewayNodesRuntime(runtime) {';
 const out=patchDeferredSubagentContext(source);
 assert.ok(out.includes('d as withPluginRuntimePluginScope'));
 assert.ok(out.includes('u as withPluginRuntimePluginIdScope'));
 assert.ok(out.includes('t as bindGatewayContextResolver'));
 assert.ok(out.includes('Native Gateway subagent context is not ready'));
 assert.equal(patchDeferredSubagentContext(out),out);
 assert.throws(()=>patchDeferredSubagentContext(source.replace('r as getGatewayContextResolver','a as getGatewayContextResolver')), /import changed/);
});

