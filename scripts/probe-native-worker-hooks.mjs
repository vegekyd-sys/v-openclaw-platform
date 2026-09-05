import assert from 'node:assert/strict';
const root='/srv/vlab-production-mirror/labs/instances/astra';
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const sdk=root+'/runtime/openclaw/dist/plugin-sdk';
const {loadConfig}=await import(sdk+'/config-runtime.js');
const {resolveAgentDir,resolveAgentWorkspaceDir}=await import(sdk+'/agent-runtime.js');
const {resolveOpenClawPreparedModelRuntimePath}=await import(root+'/source/experiments/agent-worker-isolation-v1/runtime-path.mjs');
const {acquireAgentRunPreparedModelRuntime}=await import(resolveOpenClawPreparedModelRuntimePath({agentRuntimePath:sdk+'/agent-runtime.js'}));
const {getGlobalHookRunner}=await import(root+'/runtime/openclaw/dist/plugins/hook-runner-global.js');
const {initializeWorkerNativeHooks}=await import(root+'/runtime/native-hook-runtime.mjs');
const config=loadConfig(),agentId='v-codex';
const lease=await acquireAgentRunPreparedModelRuntime({config,agentId,agentDir:resolveAgentDir(config,agentId),workspaceDir:resolveAgentWorkspaceDir(config,agentId),allowGatewaySubagentBinding:true},{catalogMode:'static'});
try {
 const registry=lease.pluginGeneration?.pluginRegistry;
 console.log(JSON.stringify({phase:'before',runnerExists:!!getGlobalHookRunner(),registryExists:!!registry,typedHooks:registry?.typedHooks?.map(h=>({pluginId:h.pluginId,hookName:h.hookName}))}));
 assert(registry);await initializeWorkerNativeHooks({pluginGeneration:lease.pluginGeneration,agentRuntimePath:sdk+'/agent-runtime.js'});
 const result=await getGlobalHookRunner().runBeforeToolCall({toolName:'browser',params:{action:'status'}},{sessionKey:'lab-native-hooks-probe'});
 assert.equal(result.block,true);assert.match(result.blockReason,/LAB_BROWSER_DIFFERENT_MANAGER/);
 console.log(JSON.stringify({phase:'after',runnerExists:!!getGlobalHookRunner(),beforeToolCall:getGlobalHookRunner()?.hasHooks('before_tool_call'),nativeHookActuallyRan:true,noModelCall:true}));
} finally {lease.release();}
