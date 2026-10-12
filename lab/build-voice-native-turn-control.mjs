import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex');
// The existing native controller owns result injection; no public plugin hook
// changes this header. Product policy and call control now live in Voice.
export function patchNativeResultHeader(s){
 const before='Deliver all parts as the backend spoken answer. Keep every fact, value and condition; apply caller format.';
 const after='Verified result for a brief answer, not a reading obligation. Yield to caller; never resume unless asked. Preserve stated facts and conditions.';
 assert.equal(s.split(before).length-1,1,'Native final delivery header drifted');s=s.replace(before,after);
 const replace=(before,after)=>{assert.equal(s.split(before).length-1,1,'Native delivery seam drifted');s=s.replace(before,after);};
 replace('let terminalKind = "final";', 'let terminalKind = "final";\n\t\tlet terminalDeliveryChannel = "speakable";');
 replace('const deliverProgress = (progress, channel) => {', 'const deliverProgress = (progress, channel) => {\n\t\t\tif (delegation.userTranscriptRevision !== this.userTranscriptRevision) channel = "commentary";');
 replace('const spoken = this.options.onBackendResult?.({delegationId:delegation.id,text:result.text});', 'const projected = this.options.onBackendResult?.({delegationId:delegation.id,text:result.text});\n\t\t\tconst quiet = projected && typeof projected === "object" && projected.channel === "commentary";\n\t\t\tconst spoken = quiet ? projected.spokenText : projected;\n\t\t\tif (quiet) terminalDeliveryChannel = "commentary";');
 replace('const staleQueuedReply = delegation.queuedPredecessorCompleted && delegation.userTranscriptRevision !== this.userTranscriptRevision;', 'const staleQueuedReply = delegation.userTranscriptRevision !== this.userTranscriptRevision;');
 replace('staleQueuedReply ? "commentary" : "speakable", { kind: terminalKind', 'staleQueuedReply ? "commentary" : terminalDeliveryChannel, { kind: terminalKind');
 return s;
}
export function build(){
 const baseline='lab/release-files/gpt-live-call/realtime-quicksilver-delegation-controller-B0yPpiHp.js';
 const source='lab/release-files/voice-native-turn-control/realtime-quicksilver-delegation-controller-B0yPpiHp.js';
 const before=readFileSync(resolve(root,baseline),'utf8');mkdirSync(dirname(resolve(root,source)),{recursive:true});writeFileSync(resolve(root,source),patchNativeResultHeader(before));
 const files=[{source,target:'openclaw/dist/realtime-quicksilver-delegation-controller-B0yPpiHp.js',before:sha(before)}];
 writeFileSync(resolve(root,'lab/voice-native-turn-control.plan.json'),JSON.stringify({files},null,2)+'\n');return {files};
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(build(),null,2));
