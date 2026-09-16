import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {patchPluginState,patchDreamingState} from './patch-worker-loop-state.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const files=[['plugin-state-store-PhQA2Nhh.js',patchPluginState,'68cd2f15ca331bb633c9f18491ec74a08a7f80d9459aba36d3258ae3e3aa0b32'],['dreaming-state-B0qd2W7q.js',patchDreamingState,'19e1fab8b1c8a682f47418c7dbca35bcc09c2f7ca4d40fe8b4a6c7a368a829ff']];
for(const [name,patch,expected] of files)test('rebuild exact '+name+' from frozen native baseline',()=>{
  const before=read('./fixtures/worker-loop-native-baseline/'+name);
  assert.equal(createHash('sha256').update(before).digest('hex'),expected);
  assert.equal(patch(before),read('./release-files/'+name));
  assert.throws(()=>patch(patch(before)),'Never stack this patch twice');
});
test('single-row writes, migration imports and retention policy remain unchanged',()=>{
  const a=read('./fixtures/worker-loop-native-baseline/plugin-state-store-PhQA2Nhh.js'), b=read('./release-files/plugin-state-store-PhQA2Nhh.js');
  for(const [start,end] of [['function registerPluginStateEntry(', 'function pluginStateRegisterBatch('],['function pluginStateRegister(params)', '/** Prepared doctor rows'],['function pluginStateImportBatch(', 'function pluginStateRegisterSequencedJournalEntry(']]) {
    const baselineEnd=end==='function pluginStateRegisterBatch('? 'function pluginStateRegister(params)':end;
    const slice=(s,x,y)=>s.slice(s.indexOf(x),s.indexOf(y,s.indexOf(x))).trim();
    let updated=slice(b,start,end);
    if(end==='function pluginStateRegisterBatch(')updated=updated.replace(/\/\/ Bounded native batches[^\n]*$/,'').trim();
    assert.equal(updated,slice(a,start,baselineEnd));
  }
});
