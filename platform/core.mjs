import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import os from 'node:os';

export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const idPattern = /^[a-z][a-z0-9-]*$/;
const versionPattern = /^\d{4}\.\d{1,2}\.\d{1,2}$/;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function safeFile(root, relative) {
  if (!nonempty(relative) || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(x => !x || x === '.' || x === '..')) throw Error(`Unsafe catalog path: ${relative}`);
  const base = fs.realpathSync(root), target = path.resolve(base, relative);
  let part = base;
  for (const segment of relative.split('/')) {
    part = path.join(part,segment);
    if (fs.lstatSync(part).isSymbolicLink()) throw Error(`Catalog path contains a symlink: ${relative}`);
  }
  const actual = fs.realpathSync(target);
  if (!actual.startsWith(base + path.sep) || !fs.statSync(actual).isFile()) throw Error(`Catalog path escapes source root: ${relative}`);
  return actual;
}

export function loadCatalog(root) {
  return JSON.parse(fs.readFileSync(safeFile(root, 'platform/catalog.json'), 'utf8'));
}

export function discoverPatches(root) {
  const result = [];
  for (const directory of ['scripts', 'experiments/agent-worker-isolation-v1']) {
    const walk = relative => {
      const target = path.join(root, relative);
      if (!fs.existsSync(target)) return;
      for (const item of fs.readdirSync(target, {withFileTypes: true})) {
        if (['node_modules', '.git', 'outputs'].includes(item.name)) continue;
        const file = `${relative}/${item.name}`;
        if (item.isSymbolicLink()) {
          if (/^patch-.*\.mjs$/.test(item.name)) throw Error(`Patch must not be a symlink: ${file}`);
          continue;
        }
        if (item.isDirectory()) walk(file);
        else if (/^patch-.*\.mjs$/.test(item.name) && !item.name.endsWith('.test.mjs')) result.push(file);
      }
    };
    walk(directory);
  }
  return result.sort();
}

export function auditCatalog(root, catalog) {
  const errors = [], warnings = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(catalog.schemaVersion === 1, 'Unsupported schemaVersion');
  check(catalog.name === 'V-Platform', 'Unexpected platform name');
  check(nonempty(catalog.releaseId), 'Missing releaseId');
  check(versionPattern.test(catalog.openclawVersion), 'OpenClaw version must be exact');
  const components = Array.isArray(catalog.components) ? catalog.components : [];
  const suites = Array.isArray(catalog.offlineSuites) ? catalog.offlineSuites : [];
  const capabilities = Array.isArray(catalog.capabilities) ? catalog.capabilities : [];
  const patches = Array.isArray(catalog.adaptations) ? catalog.adaptations : [];
  const external = Array.isArray(catalog.externalInputs) ? catalog.externalInputs : [];
  for (const [kind, items] of [['component',components],['suite',suites],['capability',capabilities],['adaptation',patches],['external input',external]]) {
    check(items.length > 0, `No ${kind} entries`);
    const ids = new Set();
    for (const item of items) {check(idPattern.test(item.id), `Invalid ${kind} id: ${item.id}`);check(!ids.has(item.id), `Duplicate ${kind} id: ${item.id}`);ids.add(item.id);}
  }
  const componentIds = new Set(components.map(x=>x.id)), suiteIds = new Set(suites.map(x=>x.id));
  const trackedTests = new Set();
  const fingerprints = [];
  for (const component of components) {
    check(nonempty(component.role), `Missing role: ${component.id}`);
    check(nonempty(component.expectedVersion), `Missing expectedVersion: ${component.id}`);
    check(['not-locked','locked'].includes(component.artifactState), `Invalid artifactState: ${component.id}`);
    if (component.artifactState === 'locked') check(/^[a-f0-9]{64}$/.test(component.artifactSha256), `Invalid artifact hash: ${component.id}`);
    else warnings.push(`Artifact not locked: ${component.id}`);
  }
  for (const suite of suites) {
    check(Array.isArray(suite.files) && suite.files.length > 0, `Empty offline suite: ${suite.id}`);
    for (const file of suite.files ?? []) {
      check(file.endsWith('.test.mjs'), `Not an audited Node test: ${file}`);
      check(!trackedTests.has(file), `Test registered twice: ${file}`);trackedTests.add(file);
      try {fingerprints.push([file,sha256(fs.readFileSync(safeFile(root,file)))]);} catch(e) {errors.push(e.message);}
    }
  }
  const deferredTests = new Set();
  for (const entry of catalog.deferredTestFiles ?? []) {
    check(nonempty(entry.reason), `Missing deferred-test reason: ${entry.file}`);
    check(!trackedTests.has(entry.file) && !deferredTests.has(entry.file), `Duplicate deferred test: ${entry.file}`);
    deferredTests.add(entry.file);
    try {safeFile(root,entry.file);} catch(e) {errors.push(e.message);}
  }
  // New tests must be explicitly assigned or explicitly deferred, never silently omitted.
  for (const directory of ['scripts','tests','lab','platform','experiments/agent-worker-isolation-v1']) {
    const walk = relative => {
      if (!fs.existsSync(path.join(root,relative))) return;
      for (const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
        if (['node_modules','.git','outputs'].includes(item.name)) continue;
        const file = `${relative}/${item.name}`;
        if (item.isSymbolicLink()) {check(!item.name.endsWith('.test.mjs'), `Test must not be a symlink: ${file}`);continue;}
        if (item.isDirectory()) walk(file);
        else if (item.name.endsWith('.test.mjs')) check(trackedTests.has(file)||deferredTests.has(file), `Unregistered test: ${file}`);
      }
    };
    walk(directory);
  }
  for (const capability of capabilities) {
    check(capability.required === true, `Required baseline capability cannot be silently disabled: ${capability.id}`);
    check(Array.isArray(capability.components) && capability.components.length > 0, `Capability has no owner: ${capability.id}`);
    for (const owner of capability.components ?? []) check(componentIds.has(owner), `Unknown component ${owner} in ${capability.id}`);
    check(Array.isArray(capability.offlineSuites), `Missing offline coverage declaration: ${capability.id}`);
    for (const suite of capability.offlineSuites ?? []) check(suiteIds.has(suite), `Unknown suite ${suite} in ${capability.id}`);
    if (!(capability.offlineSuites?.length)) check(nonempty(capability.offlineGap), `Unexplained offline coverage gap: ${capability.id}`);
    check(Array.isArray(capability.liveAssertions) && capability.liveAssertions.length > 0 && capability.liveAssertions.every(nonempty), `Missing real-result acceptance: ${capability.id}`);
  }
  const registered = new Set();
  for (const patch of patches) {
    check(!registered.has(patch.file), `Patch registered twice: ${patch.file}`);registered.add(patch.file);
    check(componentIds.has(patch.component), `Patch has unknown component: ${patch.id}`);
    check(['needs-live-reconciliation','excluded-candidate'].includes(patch.disposition), `Invalid patch disposition: ${patch.id}`);
    check(nonempty(patch.reason), `Missing adaptation reason: ${patch.id}`);
    check(Array.isArray(patch.hostVersions) && patch.hostVersions.length > 0 && patch.hostVersions.every(v=>versionPattern.test(v)), `Missing exact reviewed host boundary: ${patch.id}`);
    check(/^[a-f0-9]{64}$/.test(patch.sourceSha256), `Invalid patch fingerprint: ${patch.id}`);
    try {
      const actual = sha256(fs.readFileSync(safeFile(root,patch.file)));fingerprints.push([patch.file,actual]);
      check(actual === patch.sourceSha256, `Adaptation source drift: ${patch.id}`);
    } catch(e) {errors.push(e.message);}
  }
  try { for (const file of discoverPatches(root)) check(registered.has(file), `Unregistered adaptation: ${file}`); } catch(e) {errors.push(e.message);}
  check(Array.isArray(catalog.assemblyBlockers) && catalog.assemblyBlockers.every(nonempty), 'Invalid assemblyBlockers');
  for (const item of external) {
    check(nonempty(item.reason), `Missing external input reason: ${item.id}`);
    check(item.status === 'unresolved', `External source must remain unresolved until content import is implemented: ${item.id}`);
  }
  // This fingerprint is for catalog/patch/test inventory only, NOT executable artifact attestation.
  const inventoryFingerprint = sha256(JSON.stringify([catalog,fingerprints.sort((a,b)=>a[0].localeCompare(b[0]))]));
  return {schemaVersion:1,kind:'catalog-audit',releaseId:catalog.releaseId,catalogValid:errors.length===0,inventoryFingerprint,
    scope:'catalog-and-registered-patch-test-sources-only',counts:{components:components.length,capabilities:capabilities.length,adaptations:patches.length,offlineFiles:trackedTests.size},errors,warnings,releaseReady:false};
}

export function releaseCheck(root, catalog) {
  const audit = auditCatalog(root,catalog);
  const blockers = [...audit.errors,...(catalog.assemblyBlockers??[])];
  for (const c of catalog.components??[]) if(c.artifactState!=='locked')blockers.push(`artifact-lock:${c.id}`);
  for (const p of catalog.adaptations??[]) if(p.disposition==='needs-live-reconciliation')blockers.push(`live-adaptation-reconciliation:${p.id}`);
  for (const x of catalog.externalInputs??[]) blockers.push(`external-source:${x.id}`);
  for (const c of catalog.capabilities??[]) blockers.push(`fresh-candidate-evidence:${c.id}`);
  // Phase 1 has no artifact or external evidence verifier. A JSON claim can never turn it green.
  blockers.push('artifact-installer-and-bound-evidence-verifier-not-implemented');
  return {schemaVersion:1,kind:'release-gate',releaseId:catalog.releaseId,releaseReady:false,blockers:[...new Set(blockers)]};
}

export function upgradePlan(root, catalog, targetVersion) {
  if (!versionPattern.test(targetVersion)) throw Error('Target must be an exact OpenClaw version such as 2026.9.2');
  const audit=auditCatalog(root,catalog);
  if(!audit.catalogValid)throw Error(`Catalog failed: ${audit.errors.join('; ')}`);
  return {schemaVersion:1,kind:'upgrade-plan',releaseId:catalog.releaseId,from:catalog.openclawVersion,to:targetVersion,readOnly:true,
    inventoryIntegrityChecked:true,targetArtifactTested:false,
    adaptations:(catalog.adaptations??[]).map(x=>({id:x.id,component:x.component,action:x.disposition==='excluded-candidate'?'keep-excluded':x.hostVersions.includes(targetVersion)?'reconcile-and-retest':'review-host-contract-before-use'})),
    requiredCapabilities:catalog.capabilities.map(x=>x.id),
    preservedPolicies:['default models and account selections','explicit tool and cross-agent access restrictions','single channel owner','independent state and credentials'],
    stages:['lock accepted 9.1 inputs','rebuild clean owned 9.1 instance','offline contracts','build target with reviewed adapters','migration and rollback rehearsal','real dual-runtime and channel results','V and Codex acceptance','explicit production release approval'],
    releaseReady:false};
}

export function parseTapSummary(output) {
  const fields=['tests','pass','fail','cancelled','skipped','todo'];
  const result={};
  for(const field of fields){const matches=[...output.matchAll(new RegExp(`^# ${field} (\\d+)\\s*$`,'gm'))];result[field]=matches.length===1?Number(matches[0][1]):null;}
  result.valid=fields.every(f=>Number.isInteger(result[f]))&&result.tests>0&&result.pass===result.tests&&result.fail===0&&result.cancelled===0&&result.skipped===0&&result.todo===0;
  return result;
}

export async function runOffline(root, catalog, {timeoutMs=120000}={}) {
  const audit=auditCatalog(root,catalog);
  if(!audit.catalogValid)throw Error(`Catalog failed: ${audit.errors.join('; ')}`);
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>300000)throw Error('Invalid offline test timeout');
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'v-platform-tests-'));
  const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:home,USER:'v-platform-test',TMPDIR:home,TMP:home,TEMP:home,LANG:'C.UTF-8',TZ:'UTC',NO_COLOR:'1',CI:'1'};
  const files=catalog.offlineSuites.flatMap(s=>s.files).map(f=>safeFile(root,f));
  const started=Date.now();
  try{
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--test','--test-concurrency=2','--test-reporter=tap',...files],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
      let stdout='',stderr='',timedOut=false,overflow=false,killTimer;
      const signal=sig=>{try{if(process.platform==='win32')child.kill(sig);else process.kill(-child.pid,sig);}catch(e){if(e.code!=='ESRCH')throw e;}};
      const terminate=()=>{signal('SIGTERM');killTimer??=setTimeout(()=>signal('SIGKILL'),1000);};
      const timer=setTimeout(()=>{timedOut=true;terminate();},timeoutMs);
      const collect=(which,data)=>{if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+data.length>8*1024*1024){overflow=true;terminate();return;}if(which==='stdout')stdout+=data.toString();else stderr+=data.toString();};
      child.stdout.on('data',data=>collect('stdout',data));child.stderr.on('data',data=>collect('stderr',data));
      child.once('error',e=>{clearTimeout(timer);clearTimeout(killTimer);reject(e);});
      child.once('close',(code,signalName)=>{clearTimeout(timer);clearTimeout(killTimer);resolve({code,signal:signalName,timedOut,overflow,stdout,stderr});});
    });
    const counts=parseTapSummary(result.stdout);
    const failures=result.stdout.split('\n').filter(line=>/^not ok\b/.test(line));
    return {schemaVersion:1,kind:'offline-test-report',releaseId:catalog.releaseId,inventoryFingerprint:audit.inventoryFingerprint,
      at:new Date().toISOString(),elapsedMs:Date.now()-started,node:process.version,platform:process.platform,files:files.length,
      passed:result.code===0&&!result.timedOut&&!result.overflow&&counts.valid,counts,
      exitCode:result.code,signal:result.signal,timedOut:result.timedOut,outputLimitExceeded:result.overflow,failures,
      // Only synthetic offline tests run here; keep failure output bounded, no inherited credentials.
      diagnostics:result.code===0&&counts.valid?undefined:(result.stderr+'\n'+result.stdout).slice(-18000),
      realModelCalls:0,productionMutations:0,releaseReady:false};
  }finally{
    // Only this function's exact mkdtemp directory, never a configured HOME or workspace.
    fs.rmSync(home,{recursive:true,force:true});
  }
}
