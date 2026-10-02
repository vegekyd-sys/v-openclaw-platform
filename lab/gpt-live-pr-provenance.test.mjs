import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PR_URL,PR_BRANCH,digest,validatePrCandidate,buildPrController} from './gpt-live-pr-provenance.mjs';
const files=[{target:'openclaw/dist/example.js',before:null,content:'ZXhhbXBsZQ=='}];
const instructions='Only report complete backend facts.';
const policy={prUrl:PR_URL,branch:PR_BRANCH,owner:'trial-owner',releaseId:'gpt-live-trial',sourceCommit:'a'.repeat(40),baseRelease:'aligned-baseline',filesSha:digest(JSON.stringify(files)),trialInstructionsSha:digest(instructions)};
const req={owner:policy.owner,id:policy.releaseId,branch:PR_BRANCH,sourceCommit:policy.sourceCommit,candidatePr:{url:PR_URL,head:policy.sourceCommit,productionAuthorized:false},baseRelease:policy.baseRelease,files,trialInstructions:instructions};
test('PR provenance binds exact owner, head, baseline and artifact bytes',()=>assert.deepEqual(validatePrCandidate(req,policy),req.candidatePr));
test('mismatched provenance and production claims fail closed',()=>{
  for(const patch of [{owner:'other'}, {id:'different-release'}, {branch:'dev'}, {sourceCommit:'b'.repeat(40)}, {candidatePr:{...req.candidatePr,productionAuthorized:true}}, {baseRelease:'stale'}, {files:[]}, {syncFromV:{vRelease:'fake'}}, {trialInstructions:'changed'}, {trialInstructions:{}}, {config:{gateway:{port:0}}}])assert.throws(()=>validatePrCandidate({...req,...patch},policy));
});
test('private controller retains shared concurrency, fingerprint, idle fence and rollback guards',()=>{
  const original=fs.readFileSync(new URL('./shared/server.mjs',import.meta.url),'utf8');const source=buildPrController(original);
  for(const guard of ["lease(req.owner)","operation.lock","acquireIdleFence(x.call",'pending.json','fingerprint(RUNTIME).sha256','assertVersion(RUNTIME,m.files','current().v?.aligned,true','Rollback fingerprint mismatch'])assert(source.includes(guard),guard);
  assert(source.includes('candidatePr=validatePrCandidate(req,PR_POLICY)'));assert(source.includes("'PR controller only supports a reversible VLab trial'"));
  assert(original.includes("assert.equal(req.branch,'dev','Only merged dev artifacts may deploy');"));
  assert.throws(()=>buildPrController(original.replace("assert.equal(req.branch,'dev','Only merged dev artifacts may deploy');",'')));
});
