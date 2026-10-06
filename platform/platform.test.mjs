import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {safeFile,sha256,auditCatalog,releaseCheck,upgradePlan,parseTapSummary,runOffline,loadCatalog} from './core.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const minimalTest="import test from 'node:test'; import assert from 'node:assert/strict'; test('fixture',()=>assert.equal(1,1));\n";
function fixture(t,testSource=minimalTest){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'v-platform-contract-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'tests'));
  fs.writeFileSync(path.join(root,'scripts/patch-fixture.mjs'),'export const fixture = true;\n');
  fs.writeFileSync(path.join(root,'tests/fixture.test.mjs'),testSource);
  const catalog={schemaVersion:1,name:'V-Platform',releaseId:'fixture-1',openclawVersion:'2026.9.1',
    components:[{id:'core',role:'fixture core',expectedVersion:'2026.9.1',artifactState:'not-locked'}],
    offlineSuites:[{id:'fixture-tests',files:['tests/fixture.test.mjs']}],
    capabilities:[{id:'tool-result',required:true,components:['core'],offlineSuites:['fixture-tests'],liveAssertions:['Actual tool and final result']}],
    adaptations:[{id:'patch-fixture',file:'scripts/patch-fixture.mjs',component:'core',disposition:'needs-live-reconciliation',reason:'fixture contract',hostVersions:['2026.9.1'],sourceSha256:sha256(fs.readFileSync(path.join(root,'scripts/patch-fixture.mjs')))}],
    externalInputs:[{id:'runtime',status:'unresolved',reason:'runtime must be locked'}],assemblyBlockers:['not installed']};
  return {root,catalog};
}

test('checked-in catalog inventories 9.1 without claiming install acceptance',()=>{
  const catalog=loadCatalog(repo),audit=auditCatalog(repo,catalog);
  assert.equal(audit.catalogValid,true,JSON.stringify(audit.errors));
  assert.deepEqual(audit.counts,{components:12,capabilities:16,adaptations:26,offlineFiles:232});
  assert.equal(audit.releaseReady,false);
  assert(catalog.adaptations.find(p=>p.id==='patch-browser-target-timeout').disposition==='excluded-candidate');
});
test('unregistered patch fails inventory',t=>{
  const {root,catalog}=fixture(t);fs.writeFileSync(path.join(root,'scripts/patch-forgotten.mjs'),'export {};');
  assert(auditCatalog(root,catalog).errors.some(e=>e.includes('Unregistered adaptation')));
});
test('nested patch cannot escape discovery',t=>{
  const {root,catalog}=fixture(t);fs.mkdirSync(path.join(root,'scripts/new'));fs.writeFileSync(path.join(root,'scripts/new/patch-new.mjs'),'export {};');
  assert(auditCatalog(root,catalog).errors.some(e=>e.includes('scripts/new/patch-new.mjs')));
});
test('new test cannot be silently left out of the unified entry',t=>{
  const {root,catalog}=fixture(t);fs.writeFileSync(path.join(root,'tests/new.test.mjs'),minimalTest);
  assert(auditCatalog(root,catalog).errors.some(e=>e.includes('Unregistered test')));
  catalog.deferredTestFiles=[{file:'tests/new.test.mjs',reason:'Requires an explicit real artifact fixture'}];
  assert.equal(auditCatalog(root,catalog).catalogValid,true);
});
test('patch fingerprint drift fails before any test or plan',async t=>{
  const {root,catalog}=fixture(t);fs.appendFileSync(path.join(root,'scripts/patch-fixture.mjs'),'// drift');
  assert(auditCatalog(root,catalog).errors.some(e=>e.includes('source drift')));
  assert.throws(()=>upgradePlan(root,catalog,'2026.9.2'),/Catalog failed/);
  await assert.rejects(runOffline(root,catalog),/Catalog failed/);
});
test('absent file and duplicate test are errors',t=>{
  const {root,catalog}=fixture(t);catalog.offlineSuites[0].files.push('tests/fixture.test.mjs','tests/missing.test.mjs');
  const a=auditCatalog(root,catalog);assert.equal(a.catalogValid,false);assert(a.errors.some(e=>e.includes('registered twice')));
});
test('all capabilities require declared owners, coverage and actual-result gates',t=>{
  const {root,catalog}=fixture(t);Object.assign(catalog.capabilities[0],{required:false,components:['missing'],offlineSuites:[],liveAssertions:[]});
  const a=auditCatalog(root,catalog);assert(a.errors.length>=4);
});
test('unknown suite and duplicate stable ids fail',t=>{
  const {root,catalog}=fixture(t);catalog.capabilities[0].offlineSuites=['missing'];catalog.components.push({...catalog.components[0]});
  const a=auditCatalog(root,catalog);assert(a.errors.some(e=>e.includes('Duplicate component')));assert(a.errors.some(e=>e.includes('Unknown suite')));
});
test('absolute paths, traversal and escaping symlinks are rejected',t=>{
  const {root,catalog}=fixture(t);
  for(const file of ['/tmp/anything','../anything','tests/../file','tests\\file','tests//file'])assert.throws(()=>safeFile(root,file));
  fs.symlinkSync(os.tmpdir(),path.join(root,'outside'));
  assert.throws(()=>safeFile(root,'outside/'+path.basename(root)+'/tests/fixture.test.mjs'),/symlink|escapes/);
  fs.symlinkSync(path.join(root,'tests/fixture.test.mjs'),path.join(root,'scripts/patch-link.mjs'));
  assert(auditCatalog(root,catalog).errors.some(e=>e.includes('symlink')));
});
test('upgrade plan is read-only, exact-version and does not inherit compatibility',t=>{
  const {root,catalog}=fixture(t),before=JSON.stringify(catalog);
  const plan=upgradePlan(root,catalog,'2026.9.2');
  assert.equal(plan.adaptations[0].action,'review-host-contract-before-use');assert.equal(plan.readOnly,true);assert.equal(plan.targetArtifactTested,false);
  assert.equal(JSON.stringify(catalog),before);
  for(const target of ['latest','>=2026.9.1','2026.9.2;echo nope'])assert.throws(()=>upgradePlan(root,catalog,target));
});
test('excluded candidate remains excluded even at the original host version',t=>{
  const {root,catalog}=fixture(t);catalog.adaptations[0].disposition='excluded-candidate';
  assert.equal(upgradePlan(root,catalog,'2026.9.1').adaptations[0].action,'keep-excluded');
});
test('release gate cannot turn green by writing PASS into the catalog',t=>{
  const {root,catalog}=fixture(t);catalog.assemblyBlockers=[];catalog.components[0].artifactState='locked';catalog.components[0].artifactSha256='a'.repeat(64);
  catalog.evidence={all:'PASS'};catalog.capabilities[0].liveStatus='PASS';
  const gate=releaseCheck(root,catalog);assert.equal(gate.releaseReady,false);
  assert(gate.blockers.includes('fresh-candidate-evidence:tool-result'));assert(gate.blockers.includes('artifact-installer-and-bound-evidence-verifier-not-implemented'));
});
test('TAP requires actual tests, no failure, no skip, no todo and complete summary',()=>{
  const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(parseTapSummary(tap).valid,true);
  for(const bad of ['',tap.replace('# tests 2','# tests 0'),tap.replace('# skipped 0','# skipped 1'),tap.replace('# todo 0','# todo 1'),tap.replace('# fail 0','# fail 1'),tap.replace('# cancelled 0','# cancelled 1'),tap+'# tests 2\n'])assert.equal(parseTapSummary(bad).valid,false);
});
test('offline executor clears production environment and uses a temporary HOME',async t=>{
  const source="import test from 'node:test';import assert from 'node:assert/strict';test('environment',()=>{assert.equal(process.env.V_PLATFORM_PARENT_CANARY,undefined);assert.equal(process.env.OPENCLAW_CONFIG_PATH,undefined);assert.equal(process.env.NODE_OPTIONS,undefined);assert.match(process.env.HOME,/v-platform-tests-/);});";
  const {root,catalog}=fixture(t,source),previous=process.env.V_PLATFORM_PARENT_CANARY;
  process.env.V_PLATFORM_PARENT_CANARY='synthetic-parent-only';
  try{const result=await runOffline(root,catalog);assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.realModelCalls,0);assert.equal(result.releaseReady,false);}finally{if(previous===undefined)delete process.env.V_PLATFORM_PARENT_CANARY;else process.env.V_PLATFORM_PARENT_CANARY=previous;}
});
test('offline executor does not count skipped tests as acceptance',async t=>{
  const {root,catalog}=fixture(t,"import test from 'node:test';test('missing actual bundle',{skip:true},()=>{});");
  const result=await runOffline(root,catalog);assert.equal(result.passed,false);assert.equal(result.counts.skipped,1);
});
test('offline executor returns failure and bounded diagnostics',async t=>{
  const {root,catalog}=fixture(t,"import test from 'node:test';test('synthetic-failure',()=>{throw Error('fixture failed');});");
  const result=await runOffline(root,catalog);assert.equal(result.passed,false);assert.equal(result.counts.fail,1);assert(result.failures.length>0);
});
test('offline executor terminates hung synthetic test process group',async t=>{
  const {root,catalog}=fixture(t,"import test from 'node:test';test('hung',async()=>{await new Promise(()=>{setInterval(()=>{},1000)});});");
  const result=await runOffline(root,catalog,{timeoutMs:300});assert.equal(result.passed,false);assert.equal(result.timedOut,true);
});
