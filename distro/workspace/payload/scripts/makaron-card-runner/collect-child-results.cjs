#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function snapshot(files){return files.map(file=>{let s;try{s=JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {file,status:'pending'}};
if(s.failed)return {file,status:'failed',reason:s.status};
if(!s.done)return {file,status:'pending'};
const assets=(s.deliveredAssets||[]).filter(a=>a.localPath&&fs.existsSync(a.localPath)).map(a=>({...a,sha256:crypto.createHash('sha256').update(fs.readFileSync(a.localPath)).digest('hex')}));
return {file,status:assets.length?'completed':'failed',reason:assets.length?'': 'terminal_without_local_artifact',cardId:s.cardId,projectId:s.projectId,usage:s.usage,assets};});}
function collect(files,{timeoutMs=600000}={}){return new Promise((resolve,reject)=>{let settled=false;const watchers=[];let timer;
function finish(err,results){if(settled)return;settled=true;clearTimeout(timer);watchers.forEach(w=>w.close());err?reject(err):resolve(results)}
function check(){const r=snapshot(files);if(r.some(x=>x.status==='failed'))return finish(Object.assign(new Error('child_failed'),{results:r}));if(r.every(x=>x.status==='completed'))finish(null,r)}
try{for(const dir of new Set(files.map(f=>path.dirname(f))))watchers.push(fs.watch(dir,check));timer=setTimeout(()=>finish(new Error('children_timeout')),timeoutMs);check()}catch(e){finish(e)}
});}
if(require.main===module){const [manifest,out]=process.argv.slice(2);const plan=JSON.parse(fs.readFileSync(manifest,'utf8'));collect(plan.stateFiles,{timeoutMs:plan.timeoutMs}).then(children=>{const result={status:'ready_for_next_stage',parentTaskId:plan.parentTaskId,nextStage:plan.nextStage,children};fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}).catch(e=>{fs.writeFileSync(out,JSON.stringify({status:'blocked',reason:e.message,children:e.results||[]}));console.error(e.message);process.exitCode=1});}
module.exports={snapshot,collect};
