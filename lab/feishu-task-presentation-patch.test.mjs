import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildTaskPresentation,CAPTURE} from './build-feishu-task-presentation.mjs';
import {patchTaskPresentationMonitor} from './patch-feishu-task-presentation.mjs';
test('candidate files regenerate from the captured current bytes, parse, and preserve existing Voice confirmation',()=>{
 const {files}=buildTaskPresentation({write:false});
 for(const f of files){assert(fs.existsSync(f.source),f.source);execFileSync(process.execPath,['--check',f.source]);}
 const m=fs.readFileSync(files.find(f=>f.target.endsWith('monitor.account-WFdlCDhR.js')).source,'utf8');
 assert(m.includes('vVoiceConfirmation'));assert(m.includes('createFeishuReplyDispatcher'));assert(m.includes('v_bg_tasks'));
 assert(m.includes('resumeMessageId'));assert(m.includes('taskCheckpoint'));
 for(const f of files){const hash=execFileSync('shasum',['-a','256',f.source],{encoding:'utf8'}).split(' ')[0];assert.equal(hash,f.sha256,f.source);}
});
test('monitor patch refuses a changed anchor and double application',()=>{
 const source=fs.readFileSync(CAPTURE+'.feishu/dist/dist/monitor.account-WFdlCDhR.js','utf8');
 assert.throws(()=>patchTaskPresentationMonitor(source.replace('const typingTargetMessageId =','const changedTypingTarget =')),/anchor drift/);
 assert.throws(()=>patchTaskPresentationMonitor(patchTaskPresentationMonitor(source)),/already patched/);
});
test('Worker and VDS plans isolate candidate-only probes and include all source dependencies',()=>{
 for(const harness of ['worker','vds']){
  const plan=JSON.parse(fs.readFileSync(`lab/feishu-task-presentation.${harness}.plan.json`));
  assert.equal(plan.env.BOUND_TASK_HARNESS,harness);assert.equal(plan.user,'lab-db91-parity');assert.equal(plan.files.length,13);assert(plan.files.some(f=>f.target==='openclaw/dist/session-task-lifecycle.mjs'));
  for(const file of [...plan.tests,...plan.support,...plan.files.map(f=>f.source)])assert(fs.existsSync(file),file);
  const release=JSON.parse(fs.readFileSync('lab/feishu-task-presentation.plan.json'));
  assert(!release.files.some(f=>f.target.includes('bound-task-candidate')));assert(!release.files.some(f=>f.target.includes('/dist/dist/')));
 }
});
test('captured sessions_send announce keeps its fallback unless the exact target run has a native owner',async()=>{
 const {patchTaskPresentationSessionsSend}=await import('./patch-feishu-task-presentation.mjs');
 const patched=patchTaskPresentationSessionsSend(fs.readFileSync(CAPTURE+'/dist/sessions-spawn-tool-1FQMTkIo.js','utf8'));
 const start=patched.indexOf('async function runSessionsSendA2AFlow(params) {'),end=patched.indexOf('//#endregion',start);
 const source=patched.slice(start,end);const prior=process.env.V_FEISHU_TASK_PRESENTATION;process.env.V_FEISHU_TASK_PRESENTATION='1';
 try {for(const same of [false,true])for(const owned of [false,true,'error']){
  const sends=[],queries=[];let modelSteps=0;
  const deps={callAgentToolGatewayRequest:async()=>{},isNonDeliverableSessionsReply:()=>false,resolveAnnounceTarget:async()=>({channel:'feishu'}),sameOwnedSession:()=>same,
   resolveNestedAgentLaneForSession:()=> 'candidate',buildAgentToAgentAnnounceContext:()=>'',runAgentStep:async()=>{modelSteps++;return 'announced';},deliverAnnounceReply:async p=>sends.push(p),isAnnounceSkip:()=>false,log$1:{warn(message,detail){throw Error(message+': '+detail.error);}},formatErrorMessage:e=>e.message};
  const run=new Function(...Object.keys(deps),source+';return runSessionsSendA2AFlow;')(...Object.values(deps));
  await run({roundOneReply:'real primary result',waitRunId:'owned-run',targetSessionKey:'agent:test:target',targetAgentId:'test',requesterSessionKey:'agent:test:source',requesterChannel:'feishu',maxPingPongTurns:0,
   callGateway:async p=>{queries.push(p);if(owned==='error')throw Error('RPC unavailable');return {owned};}});
  assert.equal(sends.length,owned===true?0:1);assert.equal(modelSteps,owned===true||same?0:1);assert.equal(queries[0].params.runId,'owned-run');
 }} finally {if(prior===undefined)delete process.env.V_FEISHU_TASK_PRESENTATION;else process.env.V_FEISHU_TASK_PRESENTATION=prior;}
});
