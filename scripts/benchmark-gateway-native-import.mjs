// No Gateway, model, business state or installed-runtime changes. Measure the
// actual lazy reply module graph in fresh processes with empty private state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fork} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=process.argv[2];assert.ok(root&&path.isAbsolute(root));
const dist=path.join(root,'openclaw/dist');
const target=path.join(dist,'get-reply-CqW1y05D.js');
const moduleSha=createHash('sha256').update(fs.readFileSync(target)).digest('hex');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-native-import-'));
const helper=fs.readFileSync(new URL('../lab/release-files/gateway-module-resolution-cache.mjs',import.meta.url),'utf8')
  .replace("'./native-module-resolution-cache.mjs'",JSON.stringify(new URL('../experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs',import.meta.url).href));
const helperFile=path.join(scratch,'gateway-helper.mjs');fs.writeFileSync(helperFile,helper);
const childFile=path.join(scratch,'measure.mjs');
fs.writeFileSync(childFile,`
import {installGatewayModuleResolutionCache} from ${JSON.stringify(pathToFileURL(helperFile).href)};
const variant=process.argv[2];
const cache=variant==='candidate'?installGatewayModuleResolutionCache({distDir:${JSON.stringify(dist)}}):null;
const start=performance.now(),cpu=process.cpuUsage();
try {
  const native=await import(${JSON.stringify(pathToFileURL(target).href)});
  if(typeof native.t!=='function') throw Error('Native reply export drift');
  const used=process.cpuUsage(cpu),stats=cache?.status();
  if(variant==='candidate'&&(!stats?.enabled||!(stats.hits>0))) throw Error('Gateway resolver candidate did not activate');
  process.send?.({variant,ms:performance.now()-start,cpuMs:(used.user+used.system)/1000,stats,memory:process.memoryUsage(),exportVerified:true},()=>process.exit(0));
} catch(error) {console.error(error.message);process.exitCode=1;} finally {cache?.close?.();}
`);
async function sample(variant,index) {
  const state=path.join(scratch,'state-'+index);fs.mkdirSync(state,{mode:0o700});
  const env={...process.env,OPENCLAW_STATE_DIR:state,OPENCLAW_AGENT_DIR:path.join(state,'agent'),
    OPENCLAW_CONFIG_PATH:path.join(state,'absent.json'),OPENCLAW_DB91_INTEGRITY_ENABLE:'0',
    OPENCLAW_GATEWAY_RESOLVE_CACHE:'1',OPENCLAW_WORKER_RESOLVE_CACHE:'1',
    NODE_DISABLE_COMPILE_CACHE:'1',OPENCLAW_SKIP_CHANNELS:'1'};
  delete env.NODE_COMPILE_CACHE;
  const child=fork(childFile,[variant],{env,execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
  let errorText='',result;
  child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-2000);});
  child.on('message',row=>{result=row;});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');},60000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);code===0&&!signal&&result?resolve():reject(Error('Native import fixture failed: '+errorText));});
  });
  return {index,moduleSha,...result};
}
try {
  for(const [index,variant] of ['baseline','candidate','candidate','baseline','baseline','candidate'].entries())
    console.log(JSON.stringify(await sample(variant,index)));
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
