import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha,target,validateFiles,assertVersion,installFiles,fingerprint,save,suspensionReady} from './files.mjs';
const tmp=t=>{const d=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vlab-workflow-')));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
function fixture(t) {const root=tmp(t);fs.mkdirSync(root+'/openclaw/dist',{recursive:true});fs.writeFileSync(root+'/openclaw/dist/a.mjs','export const a=1;');return root;}
test('reject traversal, state, external symlink, duplicate and corrupt payloads',t=>{
 const root=fixture(t),f={target:'openclaw/dist/a.mjs',before:sha('export const a=1;'),after:sha('export const a=2;'),content:Buffer.from('export const a=2;').toString('base64')};
 validateFiles(root,[f]);
 for(const p of ['../a.mjs','openclaw/../../a.mjs','openclaw/.env','openclaw/state/a.json','openclaw/auth.json','/tmp/a.js'])assert.throws(()=>target(root,p));
 for(const p of ['openclaw/sessions/a.js','production-worker/state/a.js','npm/projects/x/browser/a.js','openclaw/dist/config/sessions/.env','openclaw/dist/auth.json'])assert.throws(()=>target(root,p),undefined,p);
 target(root,'openclaw/dist/config/sessions/session-transcript-reconcile.worker.js');target(root,'openclaw/dist/browser/a.js');
 fs.symlinkSync(os.tmpdir(),root+'/openclaw/external');assert.throws(()=>target(root,'openclaw/external/a.js'));
 assert.throws(()=>validateFiles(root,[f,f]));assert.throws(()=>validateFiles(root,[{...f,content:Buffer.from('bad').toString('base64')}]));
});
test('channel plugin targets: npm projects and runtime/extensions are code targets, other top-level dirs are not',t=>{
 const root=fixture(t);
 fs.mkdirSync(root+'/extensions/wecom-openclaw-plugin/dist/src',{recursive:true});
 fs.mkdirSync(root+'/npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0/node_modules/@dingtalk-real-ai/dingtalk-connector/dist',{recursive:true});
 assert.equal(target(root,'extensions/wecom-openclaw-plugin/dist/src/monitor.js'),root+'/extensions/wecom-openclaw-plugin/dist/src/monitor.js');
 target(root,'extensions/wecom-openclaw-plugin/dist/src/new-chunk.js');
 target(root,'npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0/node_modules/@dingtalk-real-ai/dingtalk-connector/dist/runtime-C81EKBS1.mjs');
 for(const p of ['extension/x/a.js','extensionsx/a.js','state/extensions/a.js','extensions/wecom-openclaw-plugin/.env','extensions/wecom-openclaw-plugin/state/a.json','extensions/wecom-openclaw-plugin/a.sh','extensions/../openclaw/a.js'])
  assert.throws(()=>target(root,p),undefined,p);
 fs.symlinkSync(os.tmpdir(),root+'/extensions/linked');assert.throws(()=>target(root,'extensions/linked/a.js'));
 const f={target:'extensions/wecom-openclaw-plugin/dist/src/monitor.js',before:null,after:sha('x'),content:Buffer.from('x').toString('base64')};
 validateFiles(root,[f]);
});
test('copy-on-write deployment preserves hardlinked baseline and rollback restores exact fingerprint',t=>{
 const root=fixture(t),old=fingerprint(root),payload=tmp(t);fs.mkdirSync(payload+'/before');fs.mkdirSync(payload+'/after');
 fs.linkSync(root+'/openclaw/dist/a.mjs',payload+'/before/0');fs.writeFileSync(payload+'/after/0','export const a=2;');fs.writeFileSync(payload+'/after/1','export const b=3;');
 const files=[{target:'openclaw/dist/a.mjs',before:sha('export const a=1;'),after:sha('export const a=2;')},{target:'openclaw/dist/b.mjs',before:null,after:sha('export const b=3;')}];
 assertVersion(root,files,'before');installFiles(root,files,payload,'after');assertVersion(root,files,'after');
 assert.equal(fs.readFileSync(payload+'/before/0','utf8'),'export const a=1;');assert.notEqual(fingerprint(root).sha256,old.sha256);
 installFiles(root,files,payload,'before');assert.deepEqual(fingerprint(root),old);assert(!fs.existsSync(root+'/openclaw/dist/b.mjs'));
});
test('unrelated code changes and touched-file drift are detected',t=>{
 const root=fixture(t),old=fingerprint(root).sha256;fs.writeFileSync(root+'/openclaw/dist/other.mjs','1');assert.notEqual(fingerprint(root).sha256,old);
 assert.throws(()=>assertVersion(root,[{target:'openclaw/dist/a.mjs',before:sha('unexpected')}],'before'));
});
test('two real worktrees share Git only; exact merge and dirty-dev gates',t=>{
 const root=tmp(t),repo=root+'/repo',dev=root+'/dev';fs.mkdirSync(repo);
 const git=(d,...a)=>execFileSync('git',['-C',d,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(repo,'init','-b','main');git(repo,'config','user.name','Workflow test');git(repo,'config','user.email','workflow@example.invalid');
 fs.writeFileSync(repo+'/README.md','test');git(repo,'add','.');git(repo,'commit','-m','base');
 fs.mkdirSync(repo+'/node_modules');fs.writeFileSync(repo+'/node_modules/large','not copied');
 const cli=path.resolve(import.meta.dirname,'../vlab.mjs');
 const call=(...args)=>JSON.parse(execFileSync(process.execPath,[cli,...args,'--repo',repo],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 call('init','--base','main','--path',dev);
 const a=call('new','--task','task-a','--path',root+'/a','--owner','a');const b=call('new','--task','task-b','--path',root+'/b','--owner','b');
 assert(!fs.existsSync(a.worktree+'/node_modules'));assert(!fs.existsSync(a.worktree+'/state'));assert.equal(git(a.worktree,'rev-parse','--path-format=absolute','--git-common-dir'),git(b.worktree,'rev-parse','--path-format=absolute','--git-common-dir'));
 fs.writeFileSync(a.worktree+'/a.txt','a');git(a.worktree,'add','.');git(a.worktree,'commit','-m','task a');const commit=git(a.worktree,'rev-parse','HEAD');
 assert.throws(()=>call('merge','--branch',a.branch,'--commit','0'.repeat(40)));assert(!fs.existsSync(b.worktree+'/a.txt'));
 fs.writeFileSync(dev+'/dirty','other task');assert.throws(()=>call('merge','--branch',a.branch,'--commit',commit));assert.equal(fs.readFileSync(dev+'/dirty','utf8'),'other task');fs.unlinkSync(dev+'/dirty');
 const m=call('merge','--branch',a.branch,'--commit',commit);assert.equal(m.commit,git(dev,'rev-parse','HEAD'));assert(fs.existsSync(dev+'/a.txt'));
});

test('OpenClaw ready response omits activeCount; draining and expired fences never permit cutover',()=>{
 assert.equal(suspensionReady({status:'ready',expiresAtMs:20000},0),true);
 assert.equal(suspensionReady({status:'draining',activeCount:1,expiresAtMs:20000},0),false);
 assert.throws(()=>suspensionReady({status:'running',expiresAtMs:20000},0));
 assert.throws(()=>suspensionReady({status:'ready',expiresAtMs:4000},0));
});

test('idle fence checks optional Workers before suspension and releases on drain timeout',async()=>{
 const {acquireIdleFence}=await import('./lifecycle.mjs');const seen=[];
 const call=async m=>{seen.push(m);if(m==='vlab.workers.status'){assert(!seen.includes('gateway.suspend.prepare'));return {pending:0,workers:[{activeCount:0,queued:0}]};}if(m==='gateway.suspend.prepare')return {suspensionId:'test'};if(m==='gateway.suspend.status')return {status:'ready',expiresAtMs:20000};};
 assert.equal((await acquireIdleFence(call,'test',{now:()=>0})).suspensionId,'test');
 assert.deepEqual(seen,['vlab.workers.status','gateway.suspend.prepare','gateway.suspend.status']);
 let resumed=false;
 const busy=async m=>{if(m==='gateway.suspend.status')return {status:'draining',activeCount:1,expiresAtMs:20000};if(m==='gateway.suspend.resume'){resumed=true;return{};}if(m==='vlab.workers.status')return {pending:0,workers:[]};return {suspensionId:'busy'};};
 await assert.rejects(acquireIdleFence(busy,'busy',{now:()=>0,timeoutMs:0}),/deferred/);assert(resumed);
});

test('all-Native idle fence accepts only the exact missing Worker RPC error',async()=>{
 const {acquireIdleFence}=await import('./lifecycle.mjs');const seen=[];
 const native=async m=>{seen.push(m);if(m==='vlab.workers.status')throw Error('unknown method: vlab.workers.status');if(m==='gateway.suspend.prepare')return {suspensionId:'native'};if(m==='gateway.suspend.status')return {status:'ready',expiresAtMs:20000};};
 assert.equal((await acquireIdleFence(native,'native',{now:()=>0})).suspensionId,'native');
 assert.deepEqual(seen,['vlab.workers.status','gateway.suspend.prepare','gateway.suspend.status']);
 const failed=[];
 const transport=async m=>{failed.push(m);throw Error('Gateway connect deadline');};
 await assert.rejects(acquireIdleFence(transport,'failed',{now:()=>0}),/Gateway connect deadline/);
 assert.deepEqual(failed,['vlab.workers.status']);
});
test('a release that adds a plugin directory: deploy creates it like its parent, rollback removes it and restores the exact fingerprint',t=>{
 const root=fixture(t),payload=tmp(t);fs.mkdirSync(payload+'/before');fs.mkdirSync(payload+'/after');
 fs.mkdirSync(root+'/extensions/wecom-openclaw-plugin/dist',{recursive:true});fs.writeFileSync(root+'/extensions/wecom-openclaw-plugin/dist/m.js','w');
 fs.chmodSync(root+'/extensions',0o700);
 const old=fingerprint(root);
 const added=['extensions/v-session-relay/index.js','extensions/v-session-relay/core/transports/agent.js','extensions/v-session-relay/openclaw.plugin.json'];
 const files=[{target:'openclaw/dist/a.mjs',before:sha('export const a=1;'),after:sha('export const a=2;')},...added.map(p=>({target:p,before:null,after:sha(p)}))];
 fs.writeFileSync(payload+'/before/0','export const a=1;');fs.writeFileSync(payload+'/after/0','export const a=2;');
 added.forEach((p,i)=>fs.writeFileSync(payload+'/after/'+(i+1),p));
 validateFiles(root,files.map((f,i)=>({...f,content:fs.readFileSync(payload+'/after/'+i).toString('base64')})));
 assertVersion(root,files,'before');installFiles(root,files,payload,'after');assertVersion(root,files,'after');
 for(const d of ['extensions/v-session-relay','extensions/v-session-relay/core','extensions/v-session-relay/core/transports'])
  assert.equal(fs.statSync(root+'/'+d).mode&0o777,0o700,d);
 assert.equal(fs.statSync(root+'/extensions/v-session-relay/index.js').mode&0o777,0o644);
 installFiles(root,files,payload,'before');assertVersion(root,files,'before');
 assert.deepEqual(fingerprint(root),old);
 assert.equal(fs.existsSync(root+'/extensions/v-session-relay'),false);
 assert.deepEqual(fs.readdirSync(root+'/extensions'),['wecom-openclaw-plugin']);
 // A directory that holds something else stays; the top-level directory always stays.
 installFiles(root,files,payload,'after');fs.writeFileSync(root+'/extensions/v-session-relay/core/keep.js','k');
 installFiles(root,files,payload,'before');
 assert.deepEqual(fs.readdirSync(root+'/extensions/v-session-relay'),['core']);assert.deepEqual(fs.readdirSync(root+'/extensions/v-session-relay/core'),['keep.js']);
 const solo=[{target:'extensions/x.js',before:null,after:sha('x')}];
 fs.mkdirSync(payload+'/s/after',{recursive:true});fs.writeFileSync(payload+'/s/after/0','x');
 installFiles(root,solo,payload+'/s','after');installFiles(root,solo,payload+'/s','before');assert(fs.existsSync(root+'/extensions'));
});
