import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const main=root+'/state/openclaw.json';
const config=JSON.parse(fs.readFileSync(main));
const old='/opt/vlab/experiments/worker-native-parity-v1';
assert(config.plugins.load.paths.includes(old));
assert.equal(JSON.parse(fs.readFileSync(old+'/openclaw.plugin.json')).id,'vlab-agent-worker-isolation');
const destination=root+'/runtime/plugins/worker-native-hooks-20260905';assert(!fs.existsSync(destination));
const worker=destination+'/worker.mjs';
const backup=root+'/backups/browser-native-hooks-20260905';
const text=fs.readFileSync(old+'/worker.mjs','utf8');
assert(!text.includes('initializeWorkerNativeHooks'));
const anchor='      const externalTaskContext = { acceptedSessionSpawns: [] };';assert.equal(text.split(anchor).length,2);
fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(old+'/worker.mjs',backup+'/worker.mjs.before',fs.constants.COPYFILE_EXCL);
fs.cpSync(old,destination,{recursive:true,verbatimSymlinks:true});
fs.copyFileSync('/tmp/native-hook-runtime.mjs',destination+'/native-hook-runtime.mjs',fs.constants.COPYFILE_EXCL);
const next='import { initializeWorkerNativeHooks } from "./native-hook-runtime.mjs";\n'+text.replace(anchor,'      await initializeWorkerNativeHooks({ pluginGeneration: preparedRuntimeLease.pluginGeneration, agentRuntimePath: configuredAgentRuntimePath() });\n'+anchor);
fs.writeFileSync(worker,next);
execFileSync('chown',['-R','vlab:vlab',destination]);
for(const [i,p] of [main,config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath].entries()) {
 const c=JSON.parse(fs.readFileSync(p));assert(c.plugins.load.paths.includes(old));
 fs.copyFileSync(p,backup+'/'+i+'.json.before',fs.constants.COPYFILE_EXCL);
 c.plugins.load.paths=c.plugins.load.paths.map(path=>path===old?destination:path);
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
console.log(JSON.stringify({patched:true,before:createHash('sha256').update(text).digest('hex'),after:createHash('sha256').update(next).digest('hex'),backup,productionChanged:false}));
