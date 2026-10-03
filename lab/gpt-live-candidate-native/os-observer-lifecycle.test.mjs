import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnedProcObserverConfig,validateOwnedProcObserverBinding,validateOwnedProcObserverStart} from './os-observer-lifecycle.mjs';

const hash='a'.repeat(64),commit='b'.repeat(40),id='candidate-12345678-1234-1234-1234-123456789abc',unit='vlab-'+id+'.service';
test('frozen OS config rejects escaping or colliding paths and a shortened observation budget',()=>{
  const config={schemaVersion:1,scriptPath:'lab/gpt-live-candidate-native/owned-proc-witness.py',scriptSha256:hash,
    expectedOwner:'thread-owner',expectedUser:'private-user',durationSeconds:1800,pollMs:50,
    bindingPath:'/tmp/codex-gpt-live-pr154-test/owned-cli-binding.json',outputPath:'/tmp/codex-gpt-live-pr154-test/proc.jsonl'};
  const context={evidenceDir:'/tmp/codex-gpt-live-pr154-test'};
  assert.equal(validateOwnedProcObserverConfig(config,context),config);
  for(const change of [{bindingPath:'/tmp/neighbor/binding.json'},{outputPath:'/tmp/codex-gpt-live-pr154-test/../neighbor.jsonl'},
    {durationSeconds:600},{pollMs:100},{scriptSha256:'bad'},{expectedOwner:''},{outputPath:config.bindingPath}])
    assert.throws(()=>validateOwnedProcObserverConfig({...config,...change},context));
});
test('owner proof must come from the exact external CLI binding, not a runner environment label',()=>{
  const binding={candidateId:id,unit,owner:'thread-owner',sourceCommit:commit,planSha256:hash,freezeSha256:hash,
    identitySource:'exact-owned-cli-invocation'};
  const context={candidateId:id,unit,sourceCommit:commit,expectedOwner:'thread-owner'};
  assert.equal(validateOwnedProcObserverBinding(binding,context),binding);
  for(const change of [{candidateId:'neighbor'},{owner:'neighbor'},{unit:'neighbor.service'},
    {identitySource:'runner-environment'},{sourceCommit:'c'.repeat(40)},{planSha256:'unfrozen'}])
    assert.throws(()=>validateOwnedProcObserverBinding({...binding,...change},context));
});
test('first native case is gated by actual observer-start with Gateway PID and start ticks',()=>{
  const expected={candidateId:id,unit,owner:'thread-owner',sourceCommit:commit,gatewayPid:12345,gatewayStartTimeTicks:45678,
    ownerBindingSha256:hash,observerSourceSha256:hash,durationSeconds:1800,pollMs:50};
  const row={type:'observer-start',at:1000,...expected,readOnly:true,signalsSent:false,gatewayCallsMade:false,
    envRecorded:false,fullCommandRecorded:false,execCallBindingEstablished:false};
  assert.equal(validateOwnedProcObserverStart(row,expected),row);
  for(const change of [{gatewayPid:999},{gatewayStartTimeTicks:45679},{owner:'neighbor'},{observerSourceSha256:'b'.repeat(64)},
    {ownerBindingSha256:'b'.repeat(64)},{type:'observer-end'},{at:NaN},{signalsSent:true},{envRecorded:true},
    {fullCommandRecorded:true},{execCallBindingEstablished:true}])assert.throws(()=>validateOwnedProcObserverStart({...row,...change},expected));
});
