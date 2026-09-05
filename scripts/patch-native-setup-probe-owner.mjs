import fs from 'node:fs';import assert from 'node:assert/strict';import os from 'node:os';import {pathToFileURL}from'node:url';
export const marker='// vlab-native-setup-probe-owner-v1';
export function patchNativeSetupProbeOwner(before) {
if(before.includes(marker))return before;
const start='function selectPreparedAgentHarness(params) {\n\treturn selectAgentHarnessDecision({';
assert.equal(before.split(start).length,2);
const prefix=`function selectPreparedAgentHarness(params) {
\t${marker}
\tconst selected = selectAgentHarnessDecision({`;
const tail='\t\tpreparedModelProvider: params.runtimePlan?.auth !== void 0\n\t});\n}\nasync function runAgentHarnessOperation';
assert.equal(before.split(tail).length,2);
const replacement=`\t\tpreparedModelProvider: params.runtimePlan?.auth !== void 0
\t});
\tif (selected.harness.id === "vlab-worker" && params.sessionPersistence === "detached" && params.disableTools === true && params.modelRun === true && /^agent:[^:]+:setup-inference:incognito-probe-setup-inference-/.test(params.sessionKey ?? "") && params.sessionManager && !params.sessionManager.getSessionTarget()) {
\t\t// Retain native admission and caller-owned memory BEFORE plugin authority
\t\t// is stripped. This is not an error fallback or a durable chat route.
\t\treturn selectAgentHarnessDecision({provider:params.provider,modelId:params.modelId,config:params.config,agentId:params.agentId,sessionKey:params.sessionKey,agentHarnessId:"openclaw"});
\t}
\treturn selected;
}
async function runAgentHarnessOperation`;
const after=before.replace(start,prefix).replace(tail,replacement);
return after;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const root=process.argv[2];assert(root?.includes('/labs/instances/')||os.hostname()==='VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync(root+'/package.json')).version,'2026.9.1');
const files=fs.readdirSync(root+'/dist').filter(n=>/^selection-.*\.js$/.test(n)).map(n=>root+'/dist/'+n).filter(p=>fs.readFileSync(p,'utf8').includes('function selectPreparedAgentHarness(params) {'));
assert.equal(files.length,1);const file=files[0],before=fs.readFileSync(file,'utf8'),after=patchNativeSetupProbeOwner(before);
if(before===after){console.log(JSON.stringify({changed:false}));process.exit(0);}
if(process.argv[3]!=='--apply'){console.log(JSON.stringify({applicable:true,file}));process.exit(0);}
fs.copyFileSync(file,file+'.before-native-setup-probe');fs.writeFileSync(file,after);console.log(JSON.stringify({changed:true,file}));
}
