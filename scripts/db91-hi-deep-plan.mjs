import assert from 'node:assert/strict';
const symbol='globalThis[Symbol.for("db91.hi.deep")]';
function once(s,a,b){assert.equal(s.split(a).length,2,'unique deep anchor: '+a);return s.replace(a,b);}
export function deepWorker(s){return 'import {db91Deep} from "./db91-hi-deep.mjs";\n'+once(s,'() => runDb91HiAgentBody(message, abortSignal)','() => db91Deep.run(message, () => runDb91HiAgentBody(message, abortSignal))');}
export function deepPrepared(s){
  const anchor='\tonBuildStats?.({';
  s=once(s,anchor,`\t${symbol}?.mark("prepared-build-stats",{workspaceFactsMs,runtimePluginMs,pluginMetadataMs,staticProviderCatalogMs,ambientCredentialsMs,agentFactsMs,configuredProjectionMs,catalogSourceMs,registryMs});\n`+anchor);
  return s;
}
export function deepBundle(s){
  const start='async function prepareEmbeddedAttemptBundleTools(params) {';
  s=once(s,start,start+`\n const db91DeepMark=stage=>${symbol}?.mark("bundle-"+stage);db91DeepMark("start");`);
  for(const [anchor,label]of [
    ['\tconst providedClientTools =','normalized'],
    ['\tconst bundleMetadataSnapshot = params.getCurrentAttemptPluginMetadataSnapshot();','metadata-start'],
    ['\tconst mcpConfig = {','metadata-end'],
    ['\tconst bundleMcpSessionRuntime =','mcp-session-start'],
    ['\tconst bundleMcpRuntime = bundleMcpSessionRuntime ?','mcp-session-end'],
    ['\tlet bundleLspRuntime;','mcp-materialized'],
    ['\t\tconst allowedBundleMcpTools =','lsp-end'],
    ['\t\tconst projectTools = (coreTools) => {','policy-normalized'],
  ]){
    const at=s.indexOf(start),end=s.indexOf('//#endregion',at),body=s.slice(at,end);
    s=s.slice(0,at)+once(body,anchor,`\t db91DeepMark(${JSON.stringify(label)});\n`+anchor)+s.slice(end);
  }
  return s;
}
export function deepTransport(s){
  return once(s,' let db91FirstBody=false;',` let db91FirstBody=false;\n ${symbol}?.model(context);`);
}
