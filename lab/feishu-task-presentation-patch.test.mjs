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
  assert.equal(plan.env.BOUND_TASK_HARNESS,harness);assert.equal(plan.user,'lab-db91-parity');assert.equal(plan.files.length,10);
  for(const file of [...plan.tests,...plan.support,...plan.files.map(f=>f.source)])assert(fs.existsSync(file),file);
  const release=JSON.parse(fs.readFileSync('lab/feishu-task-presentation.plan.json'));
  assert(!release.files.some(f=>f.target.includes('bound-task-candidate')));assert(!release.files.some(f=>f.target.includes('/dist/dist/')));
 }
});
