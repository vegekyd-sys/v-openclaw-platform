// VLab-only diagnostic. Prints capability metadata, never config or credentials.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
const [core, mode = 'baseline'] = process.argv.slice(2);
if (!core || !core.startsWith('/srv/vlab-production-mirror/')) throw new Error('VLab core required');
const dist = path.join(core, 'dist');
const names = await fs.readdir(dist);
async function moduleWith(prefix, anchor) {
  const hits = [];
  for (const name of names.filter(n => n.startsWith(prefix) && n.endsWith('.js'))) {
    if ((await fs.readFile(path.join(dist,name),'utf8')).includes(anchor)) hits.push(name);
  }
  if (hits.length !== 1) throw new Error(`Ambiguous module ${prefix}: ${hits.length}`);
  return import(pathToFileURL(path.join(dist,hits[0])).href);
}
const runtime = await import(pathToFileURL(path.join(dist,'plugin-sdk/agent-runtime.js')).href);
const configRuntime = await import(pathToFileURL(path.join(dist,'plugin-sdk/config-runtime.js')).href);
const prepared = await moduleWith('prepared-model-runtime-', 'async function acquireAgentRunPreparedModelRuntime(');
const caps = await moduleWith('tts-capabilities-', 'function resolveChannelTtsVoiceDelivery(');
const scope = await moduleWith('generation-scope-', 'function withPluginRuntimeGenerationScope(');
const registry = await moduleWith('registry-', 'function normalizeChannelId(raw)');
const config = configRuntime.loadConfig();
const bridgeModule = await import('/opt/vlab/experiments/worker-native-parity-v1/native-attempt-bridge.mjs');
const bridge=bridgeModule.createNativeAttemptBridge();
if(mode==='candidate') globalThis[bridgeModule.NATIVE_ATTEMPT_BRIDGE]=bridge;
const agentId = 'makaron';
const lease = await prepared.t({config,agentId,
  agentDir:runtime.resolveAgentDir(config,agentId),
  workspaceDir:runtime.resolveAgentWorkspaceDir(config,agentId),
  allowGatewaySubagentBinding:true,
  ...(mode === 'load-runtime' ? {loadRuntimePlugins:true} : {})
}, {catalogMode:'static'});
try {
  const gen = lease.pluginGeneration;
  console.log(JSON.stringify({mode,channels:gen.pluginRegistry?.channels?.map(c=>c.plugin?.id ?? c.id),
    declared:gen.pluginRegistry?.channels?.find(c=>c.plugin?.id==='feishu')?.plugin?.capabilities?.tts ?? null,
    outside: caps.t('feishu') ?? null,
    scoped: await bridge.withPluginGeneration(gen,()=>scope.n({metadataSnapshot:gen.pluginMetadataSnapshot,pluginRegistry:gen.pluginRegistry},
      () => ({ normalized:registry.a('feishu'), direct:registry.t('feishu')?.capabilities?.tts ?? null,
        resolved:caps.t('feishu') ?? null})))}));
} finally { await lease.release(); }
process.exit(0);
