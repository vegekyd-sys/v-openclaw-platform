import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {patchNativeResultHeader} from './build-voice-native-turn-control.mjs';
test('minimum native patch changes only delivery header, preserving queues, tools and ownership',()=>{
 const source=fs.readFileSync(new URL('./release-files/gpt-live-call/realtime-quicksilver-delegation-controller-B0yPpiHp.js',import.meta.url),'utf8');
 const old='Deliver all parts as the backend spoken answer. Keep every fact, value and condition; apply caller format.';
 const current='Verified result for a brief answer, not a reading obligation. Yield to caller; never resume unless asked. Preserve stated facts and conditions.';
 const after=patchNativeResultHeader(source);assert.equal(after.replace(current,old),source);
 const plan=JSON.parse(fs.readFileSync(new URL('./voice-native-turn-control.plan.json',import.meta.url)));assert.equal(plan.files.length,1);assert.match(plan.files[0].target,/delegation-controller/);
});
test('upgrade drift is rejected before producing a deployment overlay',()=>{assert.throws(()=>patchNativeResultHeader('upgraded controller'),/drifted/);});
