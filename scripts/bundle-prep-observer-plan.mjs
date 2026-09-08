import assert from 'node:assert/strict';
const tag='bundlePrepObserver';
function once(s,a,b){assert.equal(s.split(a).length,2,'unique observer anchor: '+a);return s.replace(a,b);}
export function observeBundle(source){
  assert(!source.includes('bundle-prep-observer.mjs'),'observer already installed');
  const anchor='async function prepareEmbeddedAttemptBundleTools(params) {';
  const start=source.indexOf(anchor),end=source.indexOf('//#endregion',start);assert(start>=0&&end>start);
  let body=source.slice(start,end);
  body=once(body,anchor,anchor+`\n return ${tag}.run(params.attempt, () => prepareEmbeddedAttemptBundleToolsObserved(params));\n}\nasync function prepareEmbeddedAttemptBundleToolsObserved(params) {\n ${tag}.mark("bundle-start");`);
  for(const [a,label]of [
    ['\tconst providedClientTools =','normalize-core-end'],
    ['\tconst bundleMetadataSnapshot = params.getCurrentAttemptPluginMetadataSnapshot();','metadata-start'],
    ['\tconst mcpConfig = {','metadata-end'],
    ['\tconst bundleMcpSessionRuntime =','mcp-runtime-start'],
    ['\tconst bundleMcpRuntime = bundleMcpSessionRuntime ?','mcp-runtime-end'],
    ['\tlet bundleLspRuntime;','mcp-materialize-end'],
    ['\t\tconst allowedBundleMcpTools =','lsp-end'],
    ['\t\tconst projectTools = (coreTools) => {','policy-normalize-end'],
  ])body=once(body,a,`\t${tag}.mark(${JSON.stringify(label)});\n`+a);
  const projected='\t\tconst uncompactedEffectiveTools = [...projectTools(tools)];';
  body=once(body,projected,projected+`\n ${tag}.mark("projection-end");`);
  return `import {${tag}} from "./bundle-prep-observer.mjs";\n`+source.slice(0,start)+body+source.slice(end);
}
export function observeMcp(source){
  assert(!source.includes('bundle-prep-observer.mjs'),'observer already installed');
  let s=source;
  const mark=(a,stage,fields='{}')=>{s=once(s,a,`${tag}.mark(${JSON.stringify(stage)},${fields});\n`+a);};
  mark('\tconst invalidateCatalog = () => {','catalog-invalidation-handler-installed');
  // Record invalidation only when it occurs within an observed bundle scope.
  s=once(s,'\t\tcatalogInvalidationGeneration += 1;\n\t\tcatalog = null;',`\t\t${tag}.mark("catalog-invalidated",{generation:catalogInvalidationGeneration+1});\n\t\tcatalogInvalidationGeneration += 1;\n\t\tcatalog = null;`);
  mark('\t\tif (catalogInFlight) return catalogInFlight;','catalog-load','{inFlight:Boolean(catalogInFlight),retry:Boolean(retryBaseCatalog)}');
  mark('\t\t\t\tconst tasks = preparedEntries.map(','catalog-queue','{count:preparedEntries.length}');
  s=once(s,'\t\t\t\t\tlet session = sessions.get(serverName);',`\t\t\t\t\t${tag}.mark("server-task-start",{server:serverName});\n\t\t\t\t\tlet session = sessions.get(serverName);`);
  const connect='await ensureSessionConnected(session, resolved.connectionTimeoutMs);';
  s=once(s,connect,`await ${tag}.wait("server-connect",{server:serverName,reused:reusedSession,connected:Boolean(session.connected),connectionTimeoutMs:resolved.connectionTimeoutMs},()=>ensureSessionConnected(session, resolved.connectionTimeoutMs));`);
  const list='await listAllTools(session.client, getCatalogListTimeoutMs(rawServer, resolved.requestTimeoutMs), lifecycleAbortController.signal);';
  s=once(s,list,`await ${tag}.wait("server-list",{server:serverName,requestTimeoutMs:getCatalogListTimeoutMs(rawServer, resolved.requestTimeoutMs)},()=>listAllTools(session.client, getCatalogListTimeoutMs(rawServer, resolved.requestTimeoutMs), lifecycleAbortController.signal));`);
  mark('\t\t\t\t\t\tconst toolFilter = normalizeMcpToolFilter','server-normalize-start','{server:serverName}');
  mark('\t\t\t\t\t\tsession.toolMetadata = normalizedTools.metadata;','server-normalize-end','{server:serverName,count:normalizedTools.tools.length}');
  mark('\t\t\t\t\t\tconst message = redactMcpDiagnosticError(error);','server-failed','{server:serverName,aborted:error?.name==="AbortError"}');
  s=once(s,'\tconst getCatalog = async () => {',`\tconst getCatalog = async () => {\n ${tag}.mark("catalog-get",{cached:Boolean(catalog),inFlight:Boolean(catalogInFlight),retryDue:catalogRetryIsDue()});`);
  return `import {${tag}} from "../bundle-prep-observer.mjs";\n`+s;
}
export function observeMaterialize(source){
  assert(!source.includes('bundle-prep-observer.mjs'),'observer already installed');
  const a='await runtime.getCatalog()';
  return `import {${tag}} from "./bundle-prep-observer.mjs";\n`+once(source,a,`await ${tag}.wait("catalog-await",{},()=>runtime.getCatalog())`);
}
