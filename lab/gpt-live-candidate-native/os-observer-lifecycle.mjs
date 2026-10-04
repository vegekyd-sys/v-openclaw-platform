import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const hash=value=>createHash('sha256').update(value).digest('hex');
const beneath=(parent,child)=>child===parent||child.startsWith(parent+path.sep);

export function validateOwnedProcObserverConfig(config,{evidenceDir}={}) {
  assert(config?.schemaVersion===1,'Frozen OS observer config schema required');
  assert(typeof config.scriptPath==='string'&&config.scriptPath,'Frozen OS observer script required');
  assert(/^[a-f0-9]{64}$/u.test(config.scriptSha256??''),'Frozen OS observer script SHA required');
  assert(typeof config.expectedOwner==='string'&&config.expectedOwner,'Explicit CLI owner required');
  assert(typeof config.expectedUser==='string'&&config.expectedUser,'Explicit private service user required');
  assert(config.durationSeconds===1800&&config.pollMs===50,'OS observer must cover the frozen three-case budget');
  for(const name of ['bindingPath','outputPath'])assert(path.isAbsolute(config[name]??'')&&
    beneath(evidenceDir,config[name])&&path.normalize(config[name])===config[name],'OS observer path outside this evidence directory');
  assert(config.bindingPath!==config.outputPath,'CLI binding cannot be the OS output');
  return config;
}

export function validateOwnedProcObserverBinding(binding,{candidateId,unit,sourceCommit,expectedOwner}={}) {
  assert(binding?.candidateId===candidateId&&binding.unit===unit,'Independent CLI binding has another Candidate');
  assert(binding.owner===expectedOwner,'Independent CLI binding has another owner');
  assert(binding.sourceCommit===sourceCommit&&/^[a-f0-9]{40}$/u.test(sourceCommit??''),'CLI binding source differs from the frozen product');
  assert(binding.identitySource==='exact-owned-cli-invocation','Runner environment does not prove CLI owner');
  for(const name of ['planSha256','freezeSha256'])assert(/^[a-f0-9]{64}$/u.test(binding[name]??''),'Independent CLI input hashes required');
  return binding;
}

export function validateOwnedProcObserverStart(row,expected) {
  assert(row?.type==='observer-start'&&Number.isFinite(row.at),'Actual OS observer-start required');
  for(const name of ['candidateId','unit','owner','sourceCommit','gatewayPid','gatewayStartTimeTicks',
    'ownerBindingSha256','observerSourceSha256','durationSeconds','pollMs'])
    assert.equal(row[name],expected[name],'OS observer start identity mismatch: '+name);
  assert(row.readOnly===true&&row.signalsSent===false&&row.gatewayCallsMade===false&&
    row.envRecorded===false&&row.fullCommandRecorded===false,'OS observer must remain a read-only source');
  assert(row.execCallBindingEstablished===false,'OS sampling is not native exec/cancel acceptance');
  return row;
}

function procIdentity(pid,unit) {
  const directory='/proc/'+pid;
  const raw=fs.readFileSync(directory+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+1).trim().split(/\s+/u);
  assert(fields.length>=22,'Incomplete actual Gateway proc identity');
  const startTicks=Number(fields[19]);assert(Number.isSafeInteger(startTicks)&&startTicks>0,'Actual Gateway start ticks required');
  assert(fs.statSync(directory).uid===process.getuid(),'Gateway must have this private service uid');
  const groups=fs.readFileSync(directory+'/cgroup','utf8').trim().split('\n').map(row=>row.split(':').slice(2).join(':'));
  const cgroup=groups.find(value=>value.endsWith('/'+unit));assert(cgroup,'Gateway is outside the exact owned Candidate unit');
  return {pid,startTicks,cgroup};
}

function firstOutputRow(outputPath) {
  if(!fs.existsSync(outputPath))return null;
  const fd=fs.openSync(outputPath,'r');try {
    const bytes=Buffer.alloc(16384),length=fs.readSync(fd,bytes,0,bytes.length,0),text=bytes.subarray(0,length).toString('utf8');
    const end=text.indexOf('\n');return end<0?null:JSON.parse(text.slice(0,end));
  }finally{fs.closeSync(fd);}
}

export async function startOwnedProcObserver({configPath,candidateId,unit,sourceCommit,gatewayPid,
  candidateRuntime,evidenceDir,signal}={}) {
  assert(/^candidate-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(candidateId??''));
  assert(unit==='vlab-'+candidateId+'.service','Exact private Candidate unit required');
  assert(Number.isInteger(gatewayPid)&&gatewayPid>1,'Inventory Gateway PID required');
  const frozen=validateOwnedProcObserverConfig(JSON.parse(fs.readFileSync(path.resolve(configPath),'utf8')),{evidenceDir});
  const scriptPath=fs.realpathSync(path.resolve(frozen.scriptPath)),script=fs.readFileSync(scriptPath);
  assert.equal(hash(script),frozen.scriptSha256,'Frozen OS source changed');
  assert(fs.realpathSync(evidenceDir)===evidenceDir,'OS evidence directory must be canonical');
  assert(!fs.existsSync(frozen.outputPath),'Never reuse an old OS witness');
  const actual=procIdentity(gatewayPid,unit),argv=fs.readFileSync('/proc/'+gatewayPid+'/cmdline').toString('utf8').split('\0');
  assert(argv.includes(path.join(candidateRuntime,'openclaw/dist/index.js'))&&argv.includes('gateway'),'Gateway executable differs from this private runtime');
  const required={candidateId,unit,gatewayPid,gatewayStartTimeTicks:actual.startTicks,cgroup:actual.cgroup,
    sourceCommit,scriptPath,scriptSha256:frozen.scriptSha256,bindingPath:frozen.bindingPath,outputPath:frozen.outputPath,
    durationSeconds:frozen.durationSeconds,pollMs:frozen.pollMs,phase:'waiting-independent-cli-owner-binding',
    createdAt:Date.now(),bindingDeadlineMs:120000,paidVoiceStarted:false};
  fs.writeFileSync(path.join(evidenceDir,'os-observer-required.json'),JSON.stringify(required,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({osObserverRequired:required}));
  for(const deadline=Date.now()+120000;!fs.existsSync(frozen.bindingPath);) {
    assert(!signal?.aborted,'Candidate stopped while awaiting its CLI owner binding');
    assert(Date.now()<deadline,'Independent CLI owner binding deadline; no paid case was started');
    assert.deepEqual(procIdentity(gatewayPid,unit),actual,'Gateway identity drift while awaiting binding');
    await delay(200);
  }
  const bindingStat=fs.statSync(frozen.bindingPath);
  assert(fs.realpathSync(frozen.bindingPath)===frozen.bindingPath&&bindingStat.isFile()&&
    (bindingStat.mode&0o777)===0o600&&bindingStat.uid===process.getuid(),'CLI binding must be canonical 0600 and readable by this private user');
  const bindingBytes=fs.readFileSync(frozen.bindingPath);
  validateOwnedProcObserverBinding(JSON.parse(bindingBytes),{candidateId,unit,sourceCommit,expectedOwner:frozen.expectedOwner});
  const args=[scriptPath,'--candidate-id',candidateId,'--unit',unit,'--gateway-pid',String(gatewayPid),
    '--gateway-start-ticks',String(actual.startTicks),'--binding-path',frozen.bindingPath,
    '--expected-owner',frozen.expectedOwner,'--expected-user',frozen.expectedUser,'--output',frozen.outputPath,
    '--duration-seconds',String(frozen.durationSeconds),'--poll-ms',String(frozen.pollMs)];
  const stderrPath=path.join(evidenceDir,'owned-proc-observer-stderr.log'),stderr=fs.openSync(stderrPath,'wx',0o600);
  const child=spawn('/usr/bin/python3',args,{stdio:['ignore','ignore',stderr]});fs.closeSync(stderr);
  let spawnError;child.once('error',error=>{spawnError=error});
  const expected={candidateId,unit,owner:frozen.expectedOwner,sourceCommit,gatewayPid,gatewayStartTimeTicks:actual.startTicks,
    ownerBindingSha256:hash(bindingBytes),observerSourceSha256:frozen.scriptSha256,durationSeconds:frozen.durationSeconds,pollMs:frozen.pollMs};
  try {
    let row;
    for(const deadline=Date.now()+10000;!(row=firstOutputRow(frozen.outputPath));) {
      assert(!signal?.aborted,'Candidate stopped before the OS observer was ready');
      if(spawnError)throw spawnError;
      assert(child.exitCode===null&&child.signalCode===null,'OS observer exited before any paid case');
      assert(Date.now()<deadline,'Actual OS observer-start deadline; no paid case was started');await delay(50);
    }
    validateOwnedProcObserverStart(row,expected);
    assert(child.exitCode===null&&child.signalCode===null,'OS observer ended before the first paid case');
    const receipt={...required,phase:'read-only-observer-ready-before-first-native-case',readyAt:Date.now(),
      observerPid:child.pid,actualStart:row,ownerBindingSha256:expected.ownerBindingSha256,paidVoiceStarted:false};
    fs.writeFileSync(path.join(evidenceDir,'owned-proc-observer-launch.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({osObserverReady:receipt}));return {child,receipt};
  }catch(error){
    // Stop only the helper this function just created. Observed processes and
    // unrelated units are never signaled by the read-only observer.
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');throw error;
  }
}
