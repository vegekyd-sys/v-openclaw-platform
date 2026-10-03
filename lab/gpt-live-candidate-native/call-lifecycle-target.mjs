import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {H5_PATHS,fileIdentity,validateSharedProof} from '../gpt-live-h5-release.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const under=(file,root)=>file.startsWith(root+path.sep);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const unit=value=>typeof value==='string'&&/^[A-Za-z0-9_.:@-]+\.service$/u.test(value);
const absolute=value=>typeof value==='string'&&path.isAbsolute(value);
const sharedHome='/srv/vlab-production-mirror/labs/shared-workflow';
const readJson=file=>JSON.parse(fs.readFileSync(file));
const safeReal=file=>{try{return fs.realpathSync(file)}catch{return null}};

export function mapLifecycleRuntimeTarget(target,corePath,fileTarget) {
  assert(['shared','v'].includes(target)&&absolute(corePath));
  assert(/^(openclaw|production-worker)\/[A-Za-z0-9._/-]+$/u.test(fileTarget)&&!fileTarget.split('/').includes('..'));
  return fileTarget.startsWith('openclaw/')?path.join(corePath,fileTarget.slice(9)):
    path.join(path.dirname(corePath),target==='v'?'worker':'production-worker',fileTarget.slice('production-worker/'.length));
}

export function validateLifecycleReleaseIdentity(expected,observed) {
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(expected.release??''),'Exact release identity required');
  if(expected.target==='shared') {
    assert.equal(observed.pendingPresent,false,'Shared deployment is pending');
    const {current,manifest,artifactSha}=observed;
    assert(current&&manifest);
    assert.equal(current.release,expected.release);assert.equal(current.sourceCommit,expected.sourceCommit);
    // Canonical deploy records the new source/runtime but deliberately adds
    // artifactSha to current only when functional acceptance is recorded.
    // Before acceptance, bind the registered manifest to actual artifact bytes.
    if(current.artifactSha!==undefined)assert.equal(current.artifactSha,expected.artifactSha);
    else assert.equal(current.accepted,false,'An accepted current must carry its artifact identity');
    assert.equal(manifest.artifactSha,artifactSha);
    assert.equal(artifactSha,expected.artifactSha);assert.equal(manifest.sourceCommit,expected.sourceCommit);assert.equal(manifest.branch,'dev');
    assert.deepEqual(manifest.runtimeFiles,expected.runtimeFiles,'Live registered artifact differs from the expected runtime');
    return {release:current.release,sourceCommit:current.sourceCommit,artifactSha,accepted:current.accepted===true,pendingPresent:false,
      source:'live-canonical-current-manifest-and-artifact-bytes'};
  }
  assert.equal(expected.target,'v');
  validateSharedProof(expected.sharedAccepted,{release:expected.release,commit:expected.sourceCommit,files:expected.h5.files});
  assert.equal(expected.sharedAccepted.artifactSha,expected.artifactSha);
  assert.deepEqual(expected.sharedAccepted.runtimeFiles,expected.runtimeFiles,'V code must be the same shared accepted artifact');
  assert.deepEqual(observed.runtimeFiles,expected.sharedAccepted.runtimeFiles,'Actual V runtime differs from shared acceptance');
  // A shared accepted record is frozen by the release owner. The running V
  // process, exact H5 bytes and each installed runtime payload are read locally.
  return {release:expected.release,sourceCommit:expected.sourceCommit,artifactSha:expected.artifactSha,
    sharedAcceptanceSha256:hash(JSON.stringify(expected.sharedAccepted)),h5AcceptanceSha:expected.sharedAccepted.h5AcceptanceSha,
    source:'frozen-shared-accepted-record-matched-to-running-V-runtime-and-H5-bytes'};
}

export function validateLifecycleTargetIdentity(expected,actual) {
  assert.equal(expected?.schema,'gpt-live-call-validation-target-v1');
  assert(['shared','v'].includes(expected.target),'Explicit shared or V target proof required');
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(expected.validationId??''),'Unique validation id required');
  assert(/^[a-f0-9]{40}$/u.test(expected.sourceCommit??''),'Exact validation source commit required');
  assert(sha(expected.artifactSha),'Accepted or staged runtime artifact identity required');
  assert.equal(actual.target,expected.target,'Validation target changed');
  const canonicalUnit=expected.target==='v'?'openclaw-gateway.service':'openclaw-vlab-production-mirror-v8.service';
  assert.equal(expected.gateway?.unit,canonicalUnit,'Gateway service is outside the intended environment');
  for(const label of ['gateway','h5']) {
    const wanted=expected[label],observed=actual[label];assert(wanted&&observed);
    assert(unit(wanted.unit)&&Number.isSafeInteger(wanted.pid)&&wanted.pid>1&&typeof wanted.startTicks==='string'&&/^\d+$/u.test(wanted.startTicks));
    for(const key of ['unit','pid','startTicks'])assert.equal(observed[key],wanted[key],label+' process identity changed');
    assert.equal(observed.activeState,'active');assert.equal(observed.subState,'running');
    // The canonical Gateway moves its MainPID into the service's foreground
    // child cgroup. Match the exact unit path segment, including its children.
    assert(observed.cgroup.split('\n').some(line=>line.endsWith('/'+wanted.unit)||line.includes('/'+wanted.unit+'/')),
      label+' process is outside its expected service');
  }
  for(const key of ['corePath','configPath','stateRoot']) {
    assert(absolute(expected.gateway[key]));assert.equal(actual.gateway[key],expected.gateway[key],'Gateway '+key+' changed');
  }
  assert(sha(expected.gateway.configSha256));assert.equal(actual.gateway.configSha256,expected.gateway.configSha256,'Gateway config changed');
  assert(Number.isInteger(actual.gateway.port)&&actual.gateway.port>0&&actual.gateway.port<65536);
  if(expected.target==='shared')assert.equal(actual.gateway.port,24993);
  if(expected.target==='v')assert(actual.gateway.corePath.startsWith('/opt/')&&!actual.gateway.configPath.startsWith('/srv/vlab'),'Production proof points at VLab');
  assert.equal(actual.h5.root,expected.h5.root,'H5 release root changed');
  assert.equal(actual.h5.configPath,actual.gateway.configPath,'H5 uses a different Gateway configuration');
  assert.equal(actual.h5.corePath,actual.gateway.corePath,'H5 uses a different Gateway core');
  assert.equal(actual.h5.url,expected.h5.url,'H5 loopback URL changed');
  assert(/^http:\/\/127\.0\.0\.1:\d+\/$/u.test(actual.h5.url),'H5 validation must stay on loopback');
  assert.deepEqual(fileIdentity(actual.h5.files),fileIdentity(expected.h5.files),'H5 release bytes changed');
  assert(Array.isArray(expected.runtimeFiles)&&expected.runtimeFiles.length>0,'Actual runtime code hashes are required');
  assert.deepEqual(actual.runtimeFiles,expected.runtimeFiles,'Gateway runtime code bytes changed');
  if(expected.target==='shared')assert.equal(actual.integrationOwner,expected.owner,'Shared integration lease is not held by this validation owner');
  const release=validateLifecycleReleaseIdentity(expected,actual.release);
  return {target:expected.target,validationId:expected.validationId,sourceCommit:expected.sourceCommit,artifactSha:expected.artifactSha,release,
    gateway:actual.gateway,h5:actual.h5,runtimeFiles:actual.runtimeFiles,integrationOwner:actual.integrationOwner??null,
    readOnlyIdentityInspection:true,source:'actual-systemd-proc-config-and-eleven-H5-files'};
}

function readProcess(service) {
  const properties=Object.fromEntries(execFileSync('systemctl',['show',service,'-p','MainPID,ActiveState,SubState'],{encoding:'utf8',timeout:10000})
    .trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
  const pid=Number(properties.MainPID);assert(Number.isSafeInteger(pid)&&pid>1,'Expected service is not running');
  const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8'),startTicks=stat.slice(stat.lastIndexOf(')')+2).split(/\s+/u)[19];
  const argv=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
  const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
  return {unit:service,pid,startTicks,activeState:properties.ActiveState,subState:properties.SubState,cgroup:fs.readFileSync(`/proc/${pid}/cgroup`,'utf8'),argv,env};
}

export async function inspectLifecycleValidationTarget({target,proofPath,configPath,corePath,stateRoot,url}) {
  assert(['shared','v'].includes(target)&&absolute(proofPath),'Exact live validation proof path required');
  const proofStat=fs.lstatSync(proofPath);assert(proofStat.isFile()&&(proofStat.mode&0o077)===0,'Target proof must be a private regular file');
  const expected=JSON.parse(fs.readFileSync(proofPath));assert.equal(expected.target,target);
  assert.equal(expected.gateway?.unit,target==='v'?'openclaw-gateway.service':'openclaw-vlab-production-mirror-v8.service');
  assert(unit(expected.h5?.unit)&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(expected.release??''),'Exact H5 service and release required');
  const gatewayProcess=readProcess(expected.gateway.unit),h5Process=readProcess(expected.h5.unit);
  const entry=gatewayProcess.argv.find(arg=>arg.endsWith('/dist/index.js'));assert(entry&&gatewayProcess.argv.includes('gateway'));
  const actualCore=fs.realpathSync(path.dirname(path.dirname(entry))),actualConfig=fs.realpathSync(gatewayProcess.env.OPENCLAW_CONFIG_PATH);
  const actualState=fs.realpathSync(gatewayProcess.env.OPENCLAW_STATE_DIR||path.dirname(actualConfig));
  assert.equal(fs.realpathSync(corePath),actualCore);assert.equal(fs.realpathSync(configPath),actualConfig);assert.equal(fs.realpathSync(stateRoot),actualState);
  const config=JSON.parse(fs.readFileSync(actualConfig));
  const h5Root=fs.realpathSync(expected.h5.root),serverPath=path.join(h5Root,'lab/gpt-live-h5/server.mjs');
  assert(h5Process.argv.some(arg=>absolute(arg)&&safeReal(arg)===serverPath),'H5 process does not run the expected release server');
  const files=H5_PATHS.map(name=>({name,sha:hash(fs.readFileSync(path.join(h5Root,name)))}));
  const runtimeRoot=path.dirname(actualCore),runtimeFiles=expected.runtimeFiles.map(file=>{
    assert(/^(openclaw|production-worker)\/[A-Za-z0-9._/-]+$/u.test(file.target)&&!file.target.split('/').includes('..')&&sha(file.after));
    const resolved=mapLifecycleRuntimeTarget(target,actualCore,file.target);
    const real=fs.realpathSync(resolved),worker=fs.realpathSync(path.join(runtimeRoot,target==='v'?'worker':'production-worker'));
    assert(under(real,actualCore)||under(real,worker),'Runtime hash escaped actual core/Worker');
    return {target:file.target,after:hash(fs.readFileSync(real))};
  });
  const actual={target,gateway:{unit:gatewayProcess.unit,pid:gatewayProcess.pid,startTicks:gatewayProcess.startTicks,
    activeState:gatewayProcess.activeState,subState:gatewayProcess.subState,cgroup:gatewayProcess.cgroup,corePath:actualCore,configPath:actualConfig,stateRoot:actualState,
    configSha256:hash(fs.readFileSync(actualConfig)),port:config.gateway.port},
    h5:{unit:h5Process.unit,pid:h5Process.pid,startTicks:h5Process.startTicks,activeState:h5Process.activeState,subState:h5Process.subState,cgroup:h5Process.cgroup,
      root:h5Root,url,corePath:fs.realpathSync(h5Process.env.GPT_LIVE_H5_RUNTIME_ROOT),configPath:fs.realpathSync(h5Process.env.OPENCLAW_CONFIG_PATH),files},runtimeFiles,
    integrationOwner:target==='shared'?readJson('/srv/vlab-production-mirror/labs/control/integration.json').owner:null};
  if(target==='shared') {
    const releaseDir=path.join(sharedHome,'releases',expected.release),manifest=readJson(path.join(releaseDir,'manifest.json'));
    actual.release={pendingPresent:fs.existsSync(path.join(sharedHome,'pending.json')),current:readJson(path.join(sharedHome,'current.json')),
      manifest:{sourceCommit:manifest.sourceCommit,branch:manifest.branch,artifactSha:manifest.artifactSha,
        runtimeFiles:manifest.files.map(file=>({target:file.target,after:file.after}))},artifactSha:hash(fs.readFileSync(path.join(releaseDir,'artifact.json')))};
  } else actual.release={runtimeFiles};
  const sanitized=validateLifecycleTargetIdentity(expected,actual);
  // Verify all publicly served bytes too. server.mjs is deliberately not served;
  // its disk hash and exact running H5 process are checked above.
  const served=[];
  for(const file of files.filter(f=>!f.name.endsWith('/server.mjs'))) {
    const route=file.name.includes('/rtc-h5/assets/')?'assets/'+path.basename(file.name):file.name.endsWith('/index.html')?'':path.basename(file.name);
    const response=await fetch(new URL(route,url));assert.equal(response.status,200);
    const digest=hash(Buffer.from(await response.arrayBuffer()));assert.equal(digest,file.sha,'Served H5 bytes changed');served.push({route,sha:digest});
  }
  const database=path.join(actualState,'agents/makaron/agent/openclaw-agent.sqlite');assert(under(fs.realpathSync(database),actualState),'Voice owner database escaped its real state root');
  return {proof:{...sanitized,served,proofSha256:hash(fs.readFileSync(proofPath)),observedAt:Date.now()},config,
    gatewayEnvironment:gatewayProcess.env,agentDatabasePath:database};
}

/** Missing media binaries fail before opening a paid native browser session. */
export function preflightLifecycleMedia(media={}) {
  const defaults={chrome:'/usr/bin/google-chrome',ffmpeg:'/usr/bin/ffmpeg',pulseaudio:'/usr/bin/pulseaudio',paplay:'/usr/bin/paplay',python:'/usr/bin/python3'};
  if(media.pactl)defaults.pactl='/usr/bin/pactl';
  const args={chrome:['--version'],ffmpeg:['-version'],pulseaudio:['--version'],paplay:['--version'],pactl:['--version'],python:['--version']},executables={},proof=[];
  let bundleProof=null;
  if(media.bundle) {
    assert(absolute(media.bundle.root)&&sha(media.bundle.sha256)&&Array.isArray(media.bundle.files)&&media.bundle.files.length>0,'Frozen private media bundle required');
    const root=fs.realpathSync(media.bundle.root),files=media.bundle.files.map(file=>{
      assert(typeof file.name==='string'&&file.name&&!path.isAbsolute(file.name)&&!file.name.split('/').includes('..')&&sha(file.sha256));
      const real=fs.realpathSync(path.join(root,file.name));assert(under(real,root),'Media bundle file escaped its private root');
      assert.equal(hash(fs.readFileSync(real)),file.sha256,'Media bundle bytes changed');return {name:file.name,sha256:file.sha256};
    }).sort((a,b)=>a.name.localeCompare(b.name));
    assert.equal(new Set(files.map(f=>f.name)).size,files.length,'Duplicate media bundle member');
    assert.equal(hash(JSON.stringify(files)),media.bundle.sha256,'Media bundle identity changed');
    bundleProof={root,sha256:media.bundle.sha256,files};
  }
  const libraryPaths=typeof media.libraryPath==='string'?media.libraryPath.split(':'):media.libraryPath??[];
  assert(Array.isArray(libraryPaths));
  const canonicalDirectory=directory=>{assert(absolute(directory));const real=fs.realpathSync(directory);assert(fs.statSync(real).isDirectory());
    assert(bundleProof&&under(real,bundleProof.root),'Private media module/library path must stay in its frozen bundle');return real;};
  const libraryPath=libraryPaths.map(canonicalDirectory).join(':'),moduleDirectory=media.moduleDirectory?canonicalDirectory(media.moduleDirectory):null;
  for(const [name,fallback] of Object.entries(defaults)) {
    const wanted=media[name]??{path:fallback};assert(absolute(wanted.path),'Media dependency path must be absolute');
    if(media[name])assert(sha(wanted.sha256),'Explicit media dependency must have a frozen hash');
    const real=fs.realpathSync(wanted.path);fs.accessSync(real,fs.constants.X_OK);
    assert(fs.statSync(real).isFile(),'Media dependency must be an executable regular file');
    const observedSha256=hash(fs.readFileSync(real));if(wanted.sha256!==undefined)assert.equal(observedSha256,wanted.sha256,'Frozen media dependency changed');
    const pulseBinary=['pulseaudio','paplay','pactl'].includes(name);
    if(pulseBinary&&bundleProof)assert(under(real,bundleProof.root),'Private Pulse executable escaped frozen bundle');
    const version=execFileSync(real,args[name],{encoding:'utf8',env:pulseBinary&&libraryPath?{...process.env,LD_LIBRARY_PATH:libraryPath}:process.env,
      timeout:10000,maxBuffer:1024**2,stdio:['ignore','pipe','pipe']}).split('\n')[0].slice(0,240);
    executables[name]=real;proof.push({name,path:real,sha256:observedSha256,version});
  }
  return {executables,proof,bundleProof,moduleDirectory,libraryPath,paidVoiceStarted:false,installedPackages:false};
}

/** Read only this test's voice owner from the existing native SQLite record. */
export function readLifecycleVoiceOwner({database,stateRoot,voiceSessionId,python='/usr/bin/python3'}) {
  assert(absolute(database)&&absolute(stateRoot)&&typeof voiceSessionId==='string'&&voiceSessionId);
  const value=JSON.parse(execFileSync(python,['-c',String.raw`
import json,os,sqlite3,sys,urllib.parse,hashlib
database,root,voice=sys.argv[1:4]
assert os.path.realpath(database).startswith(os.path.realpath(root)+os.sep),'Voice owner database escaped selected state'
db=sqlite3.connect('file:'+urllib.parse.quote(os.path.realpath(database))+'?mode=ro',uri=True)
db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
assert db.execute('SELECT agent_id FROM schema_meta LIMIT 1').fetchone()[0]=='makaron'
row=db.execute('SELECT value_json FROM cache_entries WHERE scope=? AND key=?',('talk-client-voice-sessions',voice)).fetchone()
assert row,'Exact voice owner record absent'
record=json.loads(row[0]);assert record['voiceSessionId']==voice and record['agentId']=='makaron' and record['origin']=='client' and record['status']=='open'
out={k:record.get(k) for k in ('version','voiceSessionId','agentId','sessionKey','origin','status','createdAt','updatedAt')}
out.update(queryOnly=True,recordSha256=hashlib.sha256(row[0].encode()).hexdigest(),source='exact-native-voice-session-SQLite-cache-entry')
print(json.dumps(out));db.rollback();db.close()
`,database,stateRoot,voiceSessionId],{encoding:'utf8',maxBuffer:1024**2}));
  assert.equal(value.voiceSessionId,voiceSessionId);assert(value.sessionKey?.startsWith('agent:makaron:explicit:gpt-live-h5-experiment-'));
  return value;
}
