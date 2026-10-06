import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchVoiceWorker,patchVoicePool,patchVoiceIndex,patchNativeVoiceProcessScope} from './patch-voice-worker-process-owner.mjs';

const targets=[
 ['openclaw/dist/embedded-agent.runtime-CL7poBKY.js',patchNativeVoiceProcessScope],
 ['production-worker/worker.mjs',patchVoiceWorker],
 ['production-worker/worker-pool.mjs',patchVoicePool],
 ['production-worker/index.mjs',patchVoiceIndex],
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Build only from an independently captured runtime. This never connects to a
// Gateway or writes its files. The resulting committed files are package input.
export function buildVoiceReliabilityRuntime({beforeRoot,outputRoot,sourcePrefix,baseRelease,expectedBefore}){
 if(!baseRelease||!sourcePrefix||!expectedBefore)throw Error('Frozen baseline identity required');
 if(fs.existsSync(outputRoot))throw Error('Runtime output must be fresh');
 const files=targets.map(([target,patch])=>{
  const original=fs.readFileSync(path.join(beforeRoot,target));
  if(hash(original)!==expectedBefore[target])throw Error('Frozen runtime changed: '+target);
  const after=Buffer.from(patch(original.toString()));
  if(after.equals(original))throw Error('Baseline already contains voice patch: '+target);
  return {target,original,after,before:hash(original)};
 });
 const helper=fs.readFileSync(new URL('./realtime-direct-tools/worker-process-owner.mjs',import.meta.url));
 files.push({target:'production-worker/voice-process-owner.mjs',after:helper,before:null});
 fs.mkdirSync(outputRoot,{recursive:true});
 for(const file of files){const destination=path.join(outputRoot,file.target);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,file.after,{flag:'wx'});}
 const plan={baseRelease,files:files.map(file=>({source:path.posix.join(sourcePrefix,file.target),target:file.target,before:file.before}))};
 const proof={baseRelease,files:files.map(file=>({target:file.target,before:file.before,after:hash(file.after),bytes:file.after.length}))};
 fs.writeFileSync(path.join(outputRoot,'package-plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(outputRoot,'build-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 return {plan,proof};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [beforeRoot,outputRoot,freezeFile,sourcePrefix]=process.argv.slice(2);
 if(!sourcePrefix)throw Error('Usage: node lab/build-voice-reliability-runtime.mjs BEFORE OUTPUT FREEZE SOURCE_PREFIX');
 const freeze=JSON.parse(fs.readFileSync(freezeFile));
 const result=buildVoiceReliabilityRuntime({beforeRoot,outputRoot,sourcePrefix,...freeze});
 console.log(JSON.stringify(result.proof,null,2));
}
