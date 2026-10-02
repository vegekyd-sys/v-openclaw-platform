import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateTrialInstructions} from './gpt-live-pr-config.mjs';

export const PR_URL='https://github.com/vegekyd-sys/v-openclaw-platform/pull/154';
export const PR_BRANCH='codex/gpt-live-streaming-call-pr';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function validatePrCandidate(req, policy) {
  const fields=new Set(['command','id','owner','branch','sourceCommit','baseRelease','files','candidatePr','trialInstructions']);
  assert(Object.keys(req).every(key=>fields.has(key)),'PR artifact contains unsupported settings');
  assert.equal(policy.prUrl,PR_URL);
  assert.equal(policy.branch,PR_BRANCH);
  assert(/^[a-f0-9]{40}$/.test(policy.sourceCommit));
  assert(/^[\w-]+$/.test(policy.owner));
  assert.equal(req.owner,policy.owner,'Candidate belongs to another owner');
  assert.equal(req.id,policy.releaseId,'Candidate release changed');
  assert.equal(req.branch,policy.branch,'Candidate branch changed');
  assert.equal(req.sourceCommit,policy.sourceCommit,'Candidate is not the reviewed PR head');
  assert.equal(req.candidatePr?.url,policy.prUrl);
  assert.equal(req.candidatePr?.head,policy.sourceCommit);
  assert.equal(req.candidatePr?.productionAuthorized,false);
  assert.equal(req.syncFromV,undefined,'A PR experiment cannot claim V parity');
  assert.equal(req.baseRelease,policy.baseRelease,'Candidate baseline changed');
  assert.equal(digest(JSON.stringify(req.files)),policy.filesSha,'Candidate bytes changed after verification');
  validateTrialInstructions(req.trialInstructions,policy.trialInstructionsSha);
  return {url:policy.prUrl,head:policy.sourceCommit,productionAuthorized:false};
}

// This controller is installed in the task's private directory. The global
// VLab controller and dev-only deployment rule retain their original bytes.
export function buildPrController(source) {
  function replaceOnce(before,after) {
    assert.equal(source.split(before).length,2,'Shared controller layout changed; review before rebuilding');
    source=source.replace(before,after);
  }
  replaceOnce("const LAB='/srv/vlab-production-mirror/labs';", "import {validatePrCandidate} from './gpt-live-pr-provenance.mjs';\nimport {stageTrialConfig,assertTrialConfig,installTrialRelease} from './gpt-live-pr-config.mjs';\nconst PR_POLICY=JSON.parse(fs.readFileSync(new URL('./policy.json',import.meta.url)));\nconst LAB='/srv/vlab-production-mirror/labs';");
  replaceOnce("  assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);", "  assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);\n  assert(['status','read-code','rpc','test','stage','deploy','rollback'].includes(req.command),'PR controller only supports a reversible VLab trial');\n  if(['test','stage','deploy','rollback'].includes(req.command))assert.equal(req.owner,PR_POLICY.owner,'PR controller owner changed');");
  replaceOnce("assert.equal(req.branch,'dev','Only merged dev artifacts may deploy');", 'const candidatePr=validatePrCandidate(req,PR_POLICY);');
  replaceOnce('branch:req.branch,syncFromV:syncFromV?req.syncFromV:undefined,', 'branch:req.branch,candidatePr,syncFromV:syncFromV?req.syncFromV:undefined,');
  replaceOnce("      save(dir+'/artifact.json',req);", `      const stagedLive=live();
      const trialConfig=stageTrialConfig({configPath:stagedLive.env.OPENCLAW_CONFIG_PATH,releaseDir:dir,
        instructions:req.trialInstructions,instructionsSha:PR_POLICY.trialInstructionsSha,beforeSha:stagedLive.configSha});
      assert.equal(live().configSha,trialConfig.before,'Configuration changed during staging');
      assert.equal(pid(),stagedLive.pid,'Gateway changed during staging');
      save(dir+'/artifact.json',req);`);
  replaceOnce("artifactSha:hashFile(dir+'/artifact.json'),configSha:live().configSha,files:", "artifactSha:hashFile(dir+'/artifact.json'),configSha:trialConfig.before,trialConfig,files:");
  const start=source.indexOf('async function cutover(req,rollback=false) {');
  const end=source.indexOf('\nasync function main(req) {',start);
  assert(start>=0&&end>start,'Shared cutover layout changed; review before rebuilding');
  source=source.slice(0,start)+cutoverPrTrial.toString().replace('cutoverPrTrial','cutover')+source.slice(end);
  return source;
}

// Emitted into the private controller, with its existing shared dependencies.
async function cutoverPrTrial(req,rollback=false) {
  lease(req.owner);assert(!fs.existsSync(HOME+'/pending.json'),'Unresolved deployment: inspect pending.json before retry');
  const before=current();const id=name(req.id);const dir=HOME+'/releases/'+id;const m=read(dir+'/manifest.json');
  assert.equal(sha(fs.readFileSync(dir+'/artifact.json')),m.artifactSha);
  const artifact=read(dir+'/artifact.json');validatePrCandidate(artifact,PR_POLICY);
  if(rollback)assert.equal(before.release,id,'Only current release can roll back');
  else assert.equal(before.release,m.baseRelease,'Candidate based on another release');
  const from=rollback?'after':'before',to=rollback?'before':'after';
  assert.equal(m.configSha,m.trialConfig?.before,'Trial configuration baseline changed');
  const assertConfig=side=>assertTrialConfig({transaction:m.trialConfig,releaseDir:dir,configPath:live().env.OPENCLAW_CONFIG_PATH,
    instructions:artifact.trialInstructions,instructionsSha:PR_POLICY.trialInstructionsSha,side});
  assertConfig(from);
  assert.equal(fingerprint(RUNTIME).sha256,before.runtimeSha,'Runtime changed outside workflow; reconcile before deploying');
  assertVersion(RUNTIME,m.files,from);
  const x=await connect();let suspension,stopped=false,installed=false;
  const waitReady=async side=>{
    const ceiling=Date.now()+900000;let ready=false,sawMainPid=false;
    while(Date.now()<ceiling){
      const mainPid=pid();if(mainPid===0&&sawMainPid)break;if(mainPid!==0)sawMainPid=true;
      try{const h=await rpc('health',{});assert.equal(h.ok,true);ready=true;break;}catch{await delay(2000);}
    }
    assert(ready,'Installed but Gateway not ready; source recovery required');
    assertVersion(RUNTIME,m.files,side);assertConfig(side);
    assert.equal(live().configSha,m.trialConfig[side],'Trial configuration readiness mismatch');
  };
  try {
    suspension=await acquireIdleFence(x.call,'vlab-workflow-'+Date.now());
    assert.equal(pid(),x.l.pid);lease(req.owner);assertConfig(from);assertVersion(RUNTIME,m.files,from);
    save(HOME+'/pending.json',{id,rollback,before,at:new Date().toISOString(),owner:req.owner});
    await installTrialRelease({transaction:m.trialConfig,releaseDir:dir,from,to,
      stop:()=>{stopped=true;run('systemctl',['stop',UNIT]);assert.equal(pid(),0);},
      start:()=>{run('systemctl',['start',UNIT]);stopped=false;},
      installCode:side=>installFiles(RUNTIME,m.files,dir,side),waitReady});
    installed=true;x.c.stop();
    const runtimeSha=fingerprint(RUNTIME).sha256;
    if(rollback)assert.equal(runtimeSha,m.parent.runtimeSha,'Rollback fingerprint mismatch');
    const next=rollback?m.parent:{release:id,sourceCommit:m.sourceCommit,baseline:before.baseline,runtimeSha,accepted:false,
      candidatePr:m.candidatePr,v:{aligned:false,aheadBy:id,since:new Date().toISOString()}};
    replace(HOME+'/current.json',next);
    const receipt={id,rollback,at:new Date().toISOString(),beforePid:x.l.pid,afterPid:pid(),current:next,configSha:m.trialConfig[to],
      artifactSha:m.artifactSha,statePreserved:true,acceptance:'Gateway readiness only; functional evidence required'};
    save(HOME+'/receipts/'+Date.now()+'-'+id+'.json',receipt);fs.unlinkSync(HOME+'/pending.json');return receipt;
  } finally {
    try{if(stopped)run('systemctl',['start',UNIT]);}
    finally{
      try{if(!installed&&suspension?.suspensionId)await x.call('gateway.suspend.resume',{suspensionId:suspension.suspensionId}).catch(()=>{});}
      finally{x.c.stop();}
    }
  }
}
