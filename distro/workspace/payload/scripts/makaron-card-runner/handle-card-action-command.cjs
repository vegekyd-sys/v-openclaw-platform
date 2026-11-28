#!/usr/bin/env node
'use strict';

// Deterministic executor for a Makaron card button command delivered through
// OpenClaw's normal synthetic-command path. No OpenClaw bundle patch needed.

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const ROOT=require('./workspace-root.cjs');
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:'';}
const chatId=String(arg('--chat')).replace(/^chat:/,'').trim();
const cardId=String(arg('--card')).trim();
const action=String(arg('--action')).trim();
const operatorOpenId=String(arg('--operator')).trim();
if(!chatId||!/^om_[A-Za-z0-9]+$/.test(cardId)||!['accept','regen'].includes(action)){
  console.error('Usage: handle-card-action-command.cjs --chat oc_xxx --card om_xxx --action accept|regen [--operator ou_xxx]');
  process.exit(2);
}
const dir=path.join(ROOT,'tmp','makaron-card-actions');
fs.mkdirSync(dir,{recursive:true});
const payload=path.join(dir,`agent-${Date.now()}-${action}-${cardId}.json`);
fs.writeFileSync(payload,JSON.stringify({chatId,cardId,operatorOpenId,actionName:`makaron.card.${action}`,receivedAt:Date.now()},null,2));
const result=spawnSync(process.execPath,[path.join(ROOT,'scripts/makaron-card-runner/card-action-fast.cjs'),'--payload',payload],{cwd:ROOT,encoding:'utf8'});
if(result.status!==0){
  console.error(String(result.stderr||result.stdout||'card action failed').trim());
  process.exit(result.status||1);
}
console.log(JSON.stringify({ok:true,chatId,cardId,action,payload,result:JSON.parse(result.stdout)},null,2));
