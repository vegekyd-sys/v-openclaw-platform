import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const read = n => fs.readFileSync(new URL('./release-files/' + n, import.meta.url), 'utf8');
const loader = read('optional-public-surface-loader.js'), policy = read('optional-provider-policy-surface.js');
const fn = (s, name) => {const m=s.match(new RegExp('^function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'm')); assert(m,name); return m[0];};
function makeLoader() {
  const state={cache:new Map(), resolves:0, loads:0, errors:0, present:false, module:{}, failure:null};
  const deps={path,OPENCLAW_PACKAGE_ROOT:'/native/root',getPluginCacheRoot:()=>({artifacts:state.cache}),resolveBundledPluginsDir:env=>env?.dir,areBundledPluginsDisabled:env=>!!env?.disabled,
    resolveBundledPluginPublicSurfacePath:p=>{state.resolves++; if(state.failure?.at==='resolve') throw state.failure.error; return !p.env?.disabled&&state.present ? (p.bundledPluginsDir??'/native/root')+'/surface.js':null;},
    loadValidatedPublicSurfaceModule:p=>{state.loads++; state.last=p; if(state.failure?.at==='load') throw state.failure.error; return state.module;},
    MissingPublicSurfaceError:class extends Error {constructor(m){super(m);state.errors++;}}
  };
  const names=['createResolutionKey','resolvePublicSurfaceLocationUncached','resolvePublicSurfaceLocation','loadBundledPublicSurfaceAtLocation','tryLoadBundledPluginPublicArtifactModuleSync','loadBundledPluginPublicArtifactModuleSync'];
  return {state,...new Function(...Object.keys(deps),names.map(n=>fn(loader,n)).join('\n')+'\nreturn {optional:tryLoadBundledPluginPublicArtifactModuleSync,required:loadBundledPluginPublicArtifactModuleSync};')(...Object.values(deps))};
}
const params={dirName:'deepseek',artifactBasename:'provider-policy-api.js'};
test('cached optional absence allocates no error; required API still throws every time',()=>{
  const {state,optional,required}=makeLoader();
  for(let i=0;i<1000;i++) assert.deepEqual(optional(params),{found:false});
  assert.equal(state.resolves,1);assert.equal(state.loads,0);assert.equal(state.errors,0);
  for(let i=0;i<3;i++) assert.throws(()=>required(params),/Unable to resolve bundled plugin public surface/);
  assert.equal(state.errors,3);
});
for(const value of [{hook:()=>42},null,undefined,false,0]) test('found tag preserves real module value '+String(value),()=>{
  const {state,optional,required}=makeLoader();state.present=true;state.module=value;
  assert.deepEqual(optional(params),{found:true,module:value});assert.equal(required(params),value);
  assert.equal(state.loads,2);assert.equal(state.last.origin,'bundled');assert.equal(state.last.boundaryRoot,'/native/root');
});
test('original cache invalidation and env-qualified roots/disabled modes stay authoritative',()=>{
  const {state,optional}=makeLoader();assert.equal(optional(params).found,false);
  state.present=true;assert.equal(optional(params).found,false);
  state.cache.clear();assert.equal(optional(params).found,true);
  assert.equal(optional({...params,env:{disabled:true}}).found,false);
  assert.equal(optional({...params,env:{dir:'/different'}}).found,true);
  assert.equal(state.last.boundaryRoot,'/different');assert.equal(state.last.boundaryLabel,'plugin root');
});
for(const at of ['resolve','load']) test('native '+at+' errors retain exact identity',()=>{
  const {state,optional,required}=makeLoader(),error=new Error('native guard rejected');state.present=true;state.failure={at,error};
  assert.throws(()=>optional(params),e=>e===error);assert.throws(()=>required(params),e=>e===error);
});
function makePolicy(load) {
  const names=['extractProviderPolicySurface','extractBundledProviderPolicySurface','resolveProviderPolicySurface','resolveDirectBundledProviderPolicySurface','resolveTrustedExternalProviderPolicySurface'];
  return new Function('tryLoadBundledPluginPublicArtifactModuleSync','loadPluginPublicArtifactModuleSync',policy.slice(policy.indexOf('const PROVIDER_POLICY_ARTIFACT_CANDIDATES'),policy.indexOf('function extractProviderPolicySurface'))+names.map(n=>fn(policy,n)).join('\n')+'\nreturn {direct:resolveDirectBundledProviderPolicySurface,external:resolveTrustedExternalProviderPolicySurface};')(load,()=>{throw new Error('external native path');});
}
test('optional absence returns the same null policy and invalid IDs never load',()=>{
  let calls=0;const p=makePolicy(()=>{calls++;return {found:false};});assert.equal(p.direct('deepseek'),null);assert.equal(calls,1);
  for(const id of ['.','..','a/b','a\\b','a:b']) assert.equal(p.direct(id),null);assert.equal(calls,1);
});
test('available policy hooks and bundled-only metadata retain original function identity',()=>{
  const hook=()=>7,project=()=>8;const p=makePolicy(()=>({found:true,module:{resolveModelRoutes:hook,projectConfiguredModelRow:project,deprecatedProfileIds:['legacy'],other:42}}));
  assert.deepEqual(p.direct('openai'),{resolveModelRoutes:hook,projectConfiguredModelRow:project,deprecatedProfileIds:['legacy']});
});
test('real invalid module and getter errors are not disguised as missing',()=>{
  assert.throws(()=>makePolicy(()=>({found:true,module:null})).direct('x'),TypeError);
  const error=new Error('getter guard');const module={get deprecatedProfileIds(){throw error;}};
  assert.throws(()=>makePolicy(()=>({found:true,module})).direct('x'),e=>e===error);
});
test('existing specifically tolerated load error and all other errors remain distinct',()=>{
  assert.equal(makePolicy(()=>{throw new Error('Unable to resolve bundled plugin public surface test');}).direct('x'),null);
  const error=new Error('hardlink/permission/import failure');assert.throws(()=>makePolicy(()=>{throw error;}).direct('x'),e=>e===error);
});
test('untrusted external installs still refuse and trusted external path is unchanged',()=>{
  const p=makePolicy(()=>assert.fail('bundled path called'));assert.equal(p.external({trustedOfficialInstall:false}),null);
  assert.throws(()=>p.external({trustedOfficialInstall:true}),/external native path/);
});
test('required loader, boundary security, external install and all existing helpers restore byte-for-byte',()=>{
  const originalLoader=loader.replace(fn(loader,'tryLoadBundledPluginPublicArtifactModuleSync')+'\n','').replace('export { tryLoadBundledPluginPublicArtifactModuleSync as o, loadBundledPluginPublicArtifactModuleSync as n,','export { loadBundledPluginPublicArtifactModuleSync as n,');
  const originalPolicy=policy.replace('o as tryLoadBundledPluginPublicArtifactModuleSync','n as loadBundledPluginPublicArtifactModuleSync').replace(`\t\tloadModule: (artifactBasename) => {
\t\t\tconst resolved = tryLoadBundledPluginPublicArtifactModuleSync({ dirName: pluginId, artifactBasename });
\t\t\treturn resolved.found ? resolved.module : {};
\t\t},`,`\t\tloadModule: (artifactBasename) => loadBundledPluginPublicArtifactModuleSync({
\t\t\tdirName: pluginId,
\t\t\tartifactBasename
\t\t}),`);
  assert.equal(createHash('sha256').update(originalLoader).digest('hex'),'57794d0baea89de6f9fc7a1fc975ff7f3bdc230d895f88a9833c8da9108ba943');
  assert.equal(createHash('sha256').update(originalPolicy).digest('hex'),'4711dae93f8bec59f1571d229f69167737376249624b7b75f92100ec0196b5e7');
});
