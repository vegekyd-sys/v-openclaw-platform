import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import {target} from '../platform/lab-instance.mjs';
import {nativeExportBindings} from '../experiments/agent-worker-isolation-v1/runtime-path.mjs';

export const marker = 'vlab91-native-attempt-bridge-v1';
const symbol = 'versa.vlab.native-attempt-91-v1';
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Native attempt anchor mismatch: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}
export function patchAttempt(source, permissionFile) {
  if (source.includes(marker)) return source;
  if (!/^permission-change-[\w-]+\.js$/.test(permissionFile)) throw new Error('Invalid native permission module');
  let result = once(source, 'async function runEmbeddedAttempt(input) {\n\tlet params = input;',
    `async function runEmbeddedAttempt(input) {\n\t// ${marker}: preserve native permission/lifecycle implementation.\n\tlet params = globalThis[Symbol.for("${symbol}")]?.prepare(input) ?? input;`);
  const anchor = '\tsetActiveEmbeddedRun(attempt.sessionId, queueHandle, attempt.sessionKey, attempt.sessionFile, input.hookAgentId);';
  result = once(result, anchor, anchor + `
\tglobalThis[Symbol.for("${symbol}")]?.bind(attempt, queueHandle,
\t\t() => ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) === queueHandle,
\t\t(mode, revoke) => authorizeVlabNativePermission(queueHandle.permissionChangeOwner, mode,
\t\t\t() => queueHandle.applyPermissionMode(mode, revoke)));`);
  return `import { n as authorizeVlabNativePermission } from "./${permissionFile}";\n` + result;
}
export function patchMessage(source) {
  if (source.includes(marker)) return source;
  const anchor = '\t\t\tif (signal?.aborted) throw createAbortError("Message send aborted");';
  return once(source, anchor, anchor + `
\t\t\t// ${marker}: validate the opaque capability in its Gateway owner.
\t\t\tconst workerMessageBridge = globalThis[Symbol.for("${symbol}")];
\t\t\tif (workerMessageBridge) {
\t\t\t\tconst relayed = await workerMessageBridge.executeMessage(options, toolCallId, args, signal);
\t\t\t\tif (relayed.handled) return relayed.result;
\t\t\t}`);
}
export function patchGatewayIdentity(source) {
  const identityMarker='vlab91-native-gateway-identity-v1';
  if(source.includes(identityMarker))return source;
  const anchor='\tif (identity.signedAgentRuntimeIdentityToken) return identity.signedAgentRuntimeIdentityToken;';
  return once(source,anchor,`\t// ${identityMarker}: ask the original Gateway admission to mint native identity.\n\tconst workerIdentityBridge = globalThis[Symbol.for("${symbol}")];\n\tif (workerIdentityBridge) return await workerIdentityBridge.resolveGatewayIdentity(identity, params);\n`+anchor)+
    '\nexport { resolveAgentRuntimeIdentityTokenForGatewayTool as vlabResolveNativeGatewayIdentity };\n';
}
export function patchHostIdentity(source) {
  const identityMarker='vlab91-native-gateway-identity-v1';
  if(source.includes(identityMarker))return source;
  const importMatch=source.match(/import \{ t as callGatewayTool \} from "(\.\/gateway-[\w-]+\.js)";/);
  if(!importMatch)throw new Error('Native host Gateway import changed');
  let result=once(source,importMatch[0],`import { t as callGatewayTool, vlabResolveNativeGatewayIdentity } from "${importMatch[1]}";`);
  return once(result,'\t\tkind: "agent-harness-host-capability",',`\t\tkind: "agent-harness-host-capability",
\t\t// ${identityMarker}: keeps original delegated authority and revocation.
\t\tvlabResolveGatewayIdentity: async (request) => {
\t\t\tassertActive();
\t\t\tif (typeof request.method !== "string") throw new Error("Invalid Worker Gateway method");
\t\t\tconst result = await withCaller(() => vlabResolveNativeGatewayIdentity({
\t\t\t\tmethod: request.method, required: request.required === true,
\t\t\t\topts: {}, target: "local", signal: request.signal
\t\t\t}), request.signal);
\t\t\tassertActive();
\t\t\treturn result;
\t\t},`);
}
function addResolverImport(source) {
  if (source.includes('t as bindGatewayContextResolver')) return source;
  const matches=[...source.matchAll(/import \{ ([^}]+) \} from "(\.\/gateway-request-scope-[\w-]+\.js)";/g)];
  if(matches.length!==1 || !matches[0][1].includes('r as getGatewayContextResolver')) throw new Error('Native resolver import changed');
  return once(source,matches[0][0],`import { ${matches[0][1]}, t as bindGatewayContextResolver } from "${matches[0][2]}";`);
}
export function patchDeferredSubagentContext(source) {
  const contextMarker='vlab91-native-deferred-subagent-context-v1';
  const lateMarker='vlab91-native-deferred-subagent-context-v2';
  const lateBinding=`\t// ${lateMarker}: Gateway binds the native runtime after plugin registration.\n\tlet capturedResolver = getGatewayContextResolver(runtime.subagent);\n\tbindGatewayContextResolver(deferred, () => {\n\t\tcapturedResolver ??= getGatewayContextResolver(runtime.subagent);\n\t\tif (!capturedResolver) throw new Error("Native Gateway subagent context is not ready");\n\t\treturn capturedResolver();\n\t});`;
  if(source.includes(lateMarker)) return source;
  if(source.includes(contextMarker)) {
    let result=source;
    if(!result.includes('t as bindGatewayContextResolver'))result=addResolverImport(result);
    return once(result,'\tbindGatewayContextResolver(deferred, getGatewayContextResolver(runtime.subagent));',lateBinding);
  }
  const anchor='function createDeferredGatewaySubagentRuntime(runtime) {\n\treturn {';
  let result=source;
  if(result.includes('from "./gateway-request-scope-')) {
    result=addResolverImport(result);
  }
  result=once(result,anchor,`function createDeferredGatewaySubagentRuntime(runtime) {\n\t// ${contextMarker}: preserve the native lifecycle-fenced instance resolver.\n\tconst deferred = {`);
  return once(result,'\n\t};\n}\nfunction createDeferredGatewayNodesRuntime(runtime) {',
    '\n\t};\n'+lateBinding+'\n\treturn deferred;\n}\nfunction createDeferredGatewayNodesRuntime(runtime) {');
}
export function patchScopedSubagentContext(source) {
  const scopedMarker='vlab91-native-scoped-subagent-context-v1';
  if(source.includes(scopedMarker))return source;
  let result=once(source,'\t\t\tconst subagent = getRuntimeProperty();\n\t\t\treturn {',
    `\t\t\tconst subagent = getRuntimeProperty();\n\t\t\t// ${scopedMarker}: retain the underlying Gateway fence across the plugin facade.\n\t\t\tconst scopedSubagent = {`);
  return once(result,'\n\t\t\t};\n\t\t} });\n\t\tpluginRuntimeById.set(pluginId, runtime);',
    '\n\t\t\t};\n\t\t\tbindGatewayContextResolver(scopedSubagent, getGatewayContextResolver(subagent));\n\t\t\treturn scopedSubagent;\n\t\t} });\n\t\tpluginRuntimeById.set(pluginId, runtime);');
}
async function main() {
  const [core, mode, name, owner] = process.argv.slice(2);
  if (!core || !['--check', '--apply'].includes(mode)) throw new Error('Usage: core-package --check|--apply');
  const version=JSON.parse(await fs.readFile(path.join(core, 'package.json'))).version;
  if (!['2026.9.1','2026.9.2'].includes(version)) throw new Error('Requires reviewed OpenClaw 2026.9.1 or 2026.9.2');
  if(mode==='--apply'){
    const m=target(name,owner,{stopped:true});
    assert.equal(await fs.realpath(core),await fs.realpath(m.root+'/runtime/openclaw'),'Only the owned candidate core may be patched');
  }
  const dist = path.join(core, 'dist');
  const names = await fs.readdir(dist);
  const unique = async (pattern, anchor) => {
    const found = [];
    for (const n of names.filter(n => pattern.test(n))) if ((await fs.readFile(path.join(dist,n),'utf8')).includes(anchor)) found.push(n);
    if (found.length !== 1) throw new Error(`Expected one ${pattern}, got ${found.length}`);
    return found[0];
  };
  const permission = await unique(/^permission-change-[\w-]+\.js$/, 'withAuthorizedPermissionChange as n');
  const scope = await unique(/^gateway-request-scope-[\w-]+\.js$/, 'function bindGatewayContextResolver');
  assert.deepEqual(nativeExportBindings(await fs.readFile(path.join(dist,scope),'utf8'),['bindGatewayContextResolver','getGatewayContextResolver']),
    {bindGatewayContextResolver:'t',getGatewayContextResolver:'r'});
  const specs = [
    [await unique(/^builtin-openclaw-[\w-]+\.js$/, 'async function runEmbeddedAttempt(input)'), s => patchAttempt(s, permission)],
    [await unique(/^openclaw-tools-[\w-]+\.js$/, 'function createMessageTool(options)'), patchMessage],
    [await unique(/^gateway-[\w-]+\.js$/, 'async function resolveAgentRuntimeIdentityTokenForGatewayTool'), patchGatewayIdentity],
    [await unique(/^host-capability-[\w-]+\.js$/, 'function createAgentHarnessHostCapabilities'), patchHostIdentity],
    [await unique(/^loader-[\w-]+\.js$/, 'function createDeferredGatewaySubagentRuntime(runtime)'), s=>patchScopedSubagentContext(patchDeferredSubagentContext(s))],
  ];
  const changes = await Promise.all(specs.map(async ([name, patch]) => {
    const file = path.join(dist,name), before = await fs.readFile(file,'utf8');
    return {file,before,after:patch(before)};
  }));
  for (const c of changes) {
    if (mode === '--apply' && c.before !== c.after) {
      if (!c.before.includes('vlab91-native-deferred-subagent-context-v1')) {
        await fs.copyFile(c.file,c.file+'.'+marker+'.bak',fs.constants.COPYFILE_EXCL);
      }
      const st = await fs.stat(c.file), tmp = c.file+'.tmp-'+process.pid;
      await fs.writeFile(tmp,c.after,{mode:st.mode});
      await fs.chown(tmp,st.uid,st.gid);
      await fs.rename(tmp,c.file);
    }
    console.log(`${mode} ${c.before === c.after ? 'unchanged' : 'patched'} ${c.file}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode=1; });

