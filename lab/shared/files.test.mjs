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
 fs.symlinkSync(os.tmpdir(),root+'/openclaw/external');assert.throws(()=>target(root,'openclaw/external/a.js'));
 assert.throws(()=>validateFiles(root,[f,f]));assert.throws(()=>validateFiles(root,[{...f,content:Buffer.from('bad').toString('base64')}]));
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
