import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildVoiceReliabilityRuntime} from '../build-voice-reliability-runtime.mjs';

test('committed voice runtime package carries exact captured before and generated after bytes',()=>{
 const root=new URL('../release-files/voice-reliability-20261007/',import.meta.url);
 const proof=JSON.parse(fs.readFileSync(new URL('build-proof.json',root))),plan=JSON.parse(fs.readFileSync(new URL('package-plan.json',root)));
 assert.equal(plan.baseRelease,proof.baseRelease);assert.equal(plan.files.length,6);
 for(const file of proof.files){const bytes=fs.readFileSync(new URL(file.target,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.after);assert.equal(bytes.length,file.bytes);assert.equal(plan.files.find(f=>f.target===file.target).before,file.before);}
 assert.equal(proof.files.find(f=>f.target.endsWith('voice-process-owner.mjs')).before,null);
});

test('runtime packaging rejects drift before creating output and cannot overwrite another build',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voice-package-'));
 try{
  const beforeRoot=path.join(directory,'before'),outputRoot=path.join(directory,'output');
  fs.mkdirSync(path.join(beforeRoot,'openclaw/dist'),{recursive:true});fs.writeFileSync(path.join(beforeRoot,'openclaw/dist/embedded-agent.runtime-CL7poBKY.js'),'drift');
  const args={beforeRoot,outputRoot,baseRelease:'frozen',sourcePrefix:'lab/release-files/test',expectedBefore:{'openclaw/dist/embedded-agent.runtime-CL7poBKY.js':'0'.repeat(64)}};
  assert.throws(()=>buildVoiceReliabilityRuntime(args),/Frozen runtime changed/);assert(!fs.existsSync(outputRoot));
  fs.mkdirSync(outputRoot);assert.throws(()=>buildVoiceReliabilityRuntime(args),/must be fresh/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
