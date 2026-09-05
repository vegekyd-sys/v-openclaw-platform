import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchChannelRegistry, marker } from './patch-worker-channel-registry.mjs';
import { createNativeAttemptBridge } from '../experiments/agent-worker-isolation-v1/native-attempt-bridge.mjs';
const source = `const PLUGIN_REGISTRY_STATE = Symbol.for('test.registry');
function getActivePluginChannelRegistrySnapshotFromState() {
\tconst state = globalThis[PLUGIN_REGISTRY_STATE];
return {registry:state?.activeRegistry ?? null,version:state?.activeVersion ?? 0};
}`;
test('native registry is unchanged outside Worker; per-run capabilities survive concurrent awaits', async()=>{
  const b=createNativeAttemptBridge(), context=vm.createContext({}), symbol=Symbol.for('versa.vlab.native-attempt-91-v1');
  context[Symbol.for('test.registry')]={activeRegistry:{channels:['gateway']},activeVersion:7};
  vm.runInContext(patchChannelRegistry(source),context);
  assert.equal(context.getActivePluginChannelRegistrySnapshotFromState().version,7);
  context[symbol]=b;
  const a={channels:['feishu'],futureCapability:{enabled:true}}, c={channels:['wecom']};
  await Promise.all([a,c].map(pluginRegistry=>b.withPluginGeneration({pluginRegistry},async()=>{
    await new Promise(r=>setTimeout(r,5));
    assert.equal(context.getActivePluginChannelRegistrySnapshotFromState().registry,pluginRegistry);
  })));
  assert.equal(context.getActivePluginChannelRegistrySnapshotFromState().version,7);
  assert.equal(b.getChannelRegistry(),undefined);
});
test('patch is idempotent and rejects upstream drift',()=>{
  const patched=patchChannelRegistry(source);assert.ok(patched.includes(marker));
  assert.equal(patchChannelRegistry(patched),patched);
  assert.throws(()=>patchChannelRegistry('changed upstream'),/contract changed/);
});
