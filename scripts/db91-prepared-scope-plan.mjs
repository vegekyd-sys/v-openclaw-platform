import assert from 'node:assert/strict';
function once(s,a,b){assert.equal(s.split(a).length,2,'unique prepared-scope anchor: '+a);return s.replace(a,b);}
export function scopeIndex(s){return 'import {preparedScope} from "./db91-prepared-scope.mjs";\n'+once(s,'                nativeHarnessData,','                nativeHarnessData,\n                nativePreparedScope: preparedScope(params),');}
export function scopeWorker(s){return 'import {withPreparedScope} from "./db91-prepared-scope.mjs";\n'+once(s,'() => runDb91HiAgentBody(message, abortSignal)','() => withPreparedScope(message, () => runDb91HiAgentBody(message, abortSignal))');}
export function scopeNative(s){
  // Only replace the otherwise unbounded preload default. Native load planning
  // still resolves selected model/harness dependencies and applies local policy.
  const anchor='const startupPluginIds = params.basePluginIds ?? (requestPluginRegistry ? listRuntimePluginIdsFromRegistry(requestPluginRegistry) : metadataSnapshot.pluginIds ?? (activePluginIds.length > 0 ? activePluginIds : void 0));';
  return once(s,anchor,anchor.replace('activePluginIds : void 0','activePluginIds : globalThis[Symbol.for("db91.prepared.scope")]?.get()'));
}
