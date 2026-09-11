import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inspectTree,processReferences} from '/usr/local/lib/v-storage-governance/core.mjs';
const current='/home/openclaw/.openclaw/nightshift';
const currentTree=new Map(inspectTree(current).map(e=>[e.relative,e]));
for(const root of ['/home/openclaw/.openclaw/nightshift.failed-20260909T084552Z','/home/openclaw/.openclaw/nightshift.failed-20260909T085819Z']){
 const tree=inspectTree(root);const different=[];let matchingBytes=0,matchingFiles=0;
 for(const entry of tree){if(entry.type==='dir')continue;const live=currentTree.get(entry.relative);if(live&&entry.type===live.type&&entry.size===live.size&&entry.mtime===live.mtime&&entry.link===live.link){matchingBytes+=entry.size;matchingFiles++;}else different.push({path:entry.relative,size:entry.size,type:entry.type});}
 console.log(JSON.stringify({root,entries:tree.length,matchingBytes,matchingFiles,differentBytes:different.reduce((n,e)=>n+e.size,0),differentFiles:different.length,different: different.slice(0,15),references:processReferences([root])}));
}
