import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const bootstrap=read('./release-files/db91-integrity-bootstrap.mjs');
const helper=read('./release-files/gateway-module-resolution-cache.mjs');
test('Gateway acceleration leaves every native preflight byte and gate intact',()=>{
  const original=bootstrap.replace("import {installGatewayModuleResolutionCache} from './gateway-module-resolution-cache.mjs';\n",'')
    .replace('  installGatewayModuleResolutionCache({distDir, env});\n','');
  assert.equal(createHash('sha256').update(original).digest('hex'),'3b0b3e2da8162faca7fba820e56392bf3b9817cc32cd166304730a834024caa3');
  assert.ok(bootstrap.indexOf('  if (env.OPENCLAW_DB91_INTEGRITY_ENABLE')<bootstrap.indexOf('  installGatewayModuleResolutionCache('));
});
test('missing input and explicit opt-out do not install a loader',()=>{
  let installs=0;
  const source=helper.slice(helper.indexOf('let installed;')).replace('export function','function');
  const install=new Function('join','installNativeModuleResolutionCache',source+';return installGatewayModuleResolutionCache;')(path.join,()=>{installs++;return {status:()=>({enabled:true})};});
  assert.equal(install().status().enabled,false);
  assert.equal(install({distDir:'/fixture/dist',env:{OPENCLAW_GATEWAY_RESOLVE_CACHE:'0'}}).status().enabled,false);
  const a=install({distDir:'/fixture/dist',env:{}}),b=install({distDir:'/fixture/dist',env:{}});
  assert.equal(a,b); assert.equal(installs,1,'one registration per fixed runtime');
});
test('release helper and existing resolver work together in an actual Node process',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-resolve-contract-'));
  try {
    const dist=path.join(root,'dist'); fs.mkdirSync(path.join(dist,'plugin-sdk'),{recursive:true});
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'openclaw',type:'module'}));
    fs.writeFileSync(path.join(dist,'plugin-sdk/agent-runtime.js'),'export const fixture=true;');
    fs.writeFileSync(path.join(dist,'gateway-module-resolution-cache.mjs'),helper);
    fs.writeFileSync(path.join(dist,'native-module-resolution-cache.mjs'),read('../experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs'));
    fs.writeFileSync(path.join(dist,'shared.js'),'globalThis.loads=(globalThis.loads??0)+1;export const value=42;');
    for(const name of ['reply.js','agent.js']) fs.writeFileSync(path.join(dist,name),"export {value} from './shared.js';");
    const code=`import {installGatewayModuleResolutionCache} from ${JSON.stringify(pathToFileURL(path.join(dist,'gateway-module-resolution-cache.mjs')).href)};
      const first=installGatewayModuleResolutionCache({distDir:${JSON.stringify(dist)},env:{}});
      const same=installGatewayModuleResolutionCache({distDir:${JSON.stringify(dist)},env:{}});
      const reply=await import(${JSON.stringify(pathToFileURL(path.join(dist,'reply.js')).href)});
      const agent=await import(${JSON.stringify(pathToFileURL(path.join(dist,'agent.js')).href)});
      console.log(JSON.stringify({same:first===same,reply:reply.value,agent:agent.value,loads:globalThis.loads,stats:first.status()}));
      first.close?.();`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);const row=JSON.parse(result.stdout);
    assert.equal(row.same,true);assert.equal(row.loads,1);assert.equal(row.reply,42);assert.equal(row.agent,42);
    assert.equal(row.stats.enabled,true);assert.ok(row.stats.hits>=1);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
