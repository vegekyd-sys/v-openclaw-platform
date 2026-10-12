import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex');
// The existing native controller owns result injection; no public plugin hook
// changes this header. Product policy and call control now live in Voice.
export function patchNativeResultHeader(s){
 const before='Deliver all parts as the backend spoken answer. Keep every fact, value and condition; apply caller format.';
 const after='Verified result for a brief answer, not a reading obligation. Yield to caller; never resume unless asked. Preserve stated facts and conditions.';
 assert.equal(s.split(before).length-1,1,'Native final delivery header drifted');return s.replace(before,after);
}
export function build(){
 const baseline='lab/release-files/gpt-live-call/realtime-quicksilver-delegation-controller-B0yPpiHp.js';
 const source='lab/release-files/voice-native-turn-control/realtime-quicksilver-delegation-controller-B0yPpiHp.js';
 const before=readFileSync(resolve(root,baseline),'utf8');mkdirSync(dirname(resolve(root,source)),{recursive:true});writeFileSync(resolve(root,source),patchNativeResultHeader(before));
 const files=[{source,target:'openclaw/dist/realtime-quicksilver-delegation-controller-B0yPpiHp.js',before:sha(before)}];
 writeFileSync(resolve(root,'lab/voice-native-turn-control.plan.json'),JSON.stringify({files},null,2)+'\n');return {files};
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(build(),null,2));
