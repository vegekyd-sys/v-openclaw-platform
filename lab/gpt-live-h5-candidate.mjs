// Disposable full-path test bootstrap. It never changes shared runtime/state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {configureCandidateOpenAIAuth,installCandidateOpenAIAuth} from './gpt-live-call-live-auth.mjs';
import {GPT_LIVE_CALL_INSTRUCTIONS} from './gpt-live-h5/instructions.mjs';
import {createLiveH5Server} from './gpt-live-h5/server.mjs';
import {createDirectVoiceService} from './realtime-direct-tools/session.mjs';
import {isolateCandidateAgentRuntime,candidateLarkEnvironment} from './realtime-direct-tools/candidate-environment.mjs';
import {parsePublicProgressDiagnostics} from './gpt-live-h5-provenance-evidence.mjs';
import {collectCandidateSelectedModelReferences,assertCandidateSelectedModelsPreserved,scopeCandidateAgentToAgentAllow,disableCandidateParallelToolCalls,preflightCandidateConfig,applyCandidateBackendRouteDiagnostic,assertCandidateBackendRouteDiagnosticPair,assertCandidateBackendDiagnosticPaths} from './gpt-live-candidate-config-guard.mjs';
import {startOwnedProcObserver} from './gpt-live-candidate-native/os-observer-lifecycle.mjs';
import {parseVoiceConfirmationDiagnostics} from './gpt-live-candidate-native/confirmation-evidence.mjs';

// Reject an invalid observer before copying/opening the private database or
// starting a Gateway. A controls-only probe uses the same native controls path.
const directCase=process.env.DIRECT_VOICE_CASES??'hybrid';
if(process.env.DIRECT_VOICE_AUTOMATED==='1'){
  assert(process.env.V_REALTIME_DIRECT_TOOLS==='1','Direct automated validation requires native voice tools');
  assert(['hybrid','hybrid-core','single-query','followup','core','controls'].includes(directCase),'Unknown direct voice observer case');
}
const runtime=process.env.VLAB_CANDIDATE_RUNTIME,state=process.env.OPENCLAW_STATE_DIR,configPath=process.env.OPENCLAW_CONFIG_PATH;
assert(runtime&&state&&configPath,'Disposable candidate environment required');
const agentRuntimeEnvironment=isolateCandidateAgentRuntime(process.env,runtime);
const toolEnvironment=candidateLarkEnvironment(process.env);
Object.assign(process.env,toolEnvironment);
const scratch=path.join(state,'tmp');fs.mkdirSync(scratch,{recursive:true,mode:0o700});
for(const key of ['TMPDIR','TMP','TEMP'])process.env[key]=scratch;
if(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE_GZIP) {
  const audio=gunzipSync(fs.readFileSync(path.resolve(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE_GZIP)),{maxOutputLength:32*1024**2});
  assert(audio.subarray(0,4).toString()==='RIFF'&&audio.subarray(8,12).toString()==='WAVE','Synthetic input must be a WAV');
  const fixture=path.join(state,'synthetic-main-input.wav');fs.writeFileSync(fixture,audio,{mode:0o600,flag:'wx'});
  process.env.GPT_LIVE_CALL_AUDIO_FIXTURE=fixture;
}
const clipsArchive=process.env.GPT_LIVE_H5_USER_CLIPS_ARCHIVE;
if(clipsArchive) {
  const names=execFileSync('tar',['-tzf',path.resolve(clipsArchive)],{encoding:'utf8'}).trim().split('\n');
  const allowed=process.env.GPT_LIVE_H5_CASE==='call-lifecycle'
    ?new Set(['manifest.json',...['keep-call','memory-web','end-call'].flatMap(name=>[name+'.wav',name+'.txt'])])
    :process.env.GPT_LIVE_H5_COMPREHENSIVE_CLIPS==='1'
    ?new Set(['manifest.json',...['long-task','barge','cancel-task','new-greeting','count','ack','followup',
      ...((process.env.GPT_LIVE_H5_CASE??'').split(',').includes('comprehensive-queued-steer')?['queued-task']:[]),
      ...(process.env.GPT_LIVE_H5_CONTROL_CONFIRMATION==='1'?['confirmation']:[])].flatMap(name=>[name+'.wav',name+'.txt'])])
    :new Set(['silence.wav',...['long-request','long-child-request','chat','barge','new-greeting'].flatMap(name=>[name+'.wav',name+'.txt'])]);
  assert(names.length===allowed.size&&names.every(name=>allowed.has(name))&&new Set(names).size===names.length,'Unexpected or missing synthetic clip archive member');
  const entries=execFileSync('tar',['-tvzf',path.resolve(clipsArchive)],{encoding:'utf8'}).trim().split('\n');
  let expandedBytes=0;
  for(const entry of entries) {
    const fields=entry.trim().split(/\s+/u),size=Number(fields[2]);
    assert(fields[0].startsWith('-')&&Number.isSafeInteger(size)&&size>=0&&size<=24*1024**2,'Synthetic clip must be a bounded regular file');
    expandedBytes+=size;
  }
  assert(entries.length===names.length&&expandedBytes<=40*1024**2,'Synthetic clip archive size mismatch');
  const clips=path.join(state,'synthetic-user-clips');fs.mkdirSync(clips,{mode:0o700});
  execFileSync('tar',['-xzf',path.resolve(clipsArchive),'--no-same-owner','--no-same-permissions','-C',clips]);
  process.env.GPT_LIVE_H5_USER_CLIPS_DIR=clips;
}
process.env.XDG_CACHE_HOME=path.join(state,'cache');fs.mkdirSync(process.env.XDG_CACHE_HOME,{recursive:true,mode:0o700});
// Native plugin convergence invokes npm. Every npm writable location and
// configuration file must belong to this Candidate, including inherited keys.
const npmPrivate={cache:path.join(state,'cache/npm'),prefix:path.join(state,'npm-prefix'),userconfig:path.join(state,'npm-user.npmrc'),globalconfig:path.join(state,'npm-global.npmrc')};
for(const key of ['cache','prefix'])fs.mkdirSync(npmPrivate[key],{recursive:true,mode:0o700});
for(const key of ['userconfig','globalconfig'])fs.writeFileSync(npmPrivate[key],'',{mode:0o600,flag:'wx'});
for(const [key,value] of Object.entries(npmPrivate))for(const prefix of ['npm_config_','NPM_CONFIG_'])process.env[prefix+(prefix==='npm_config_'?key:key.toUpperCase())]=value;
let config=JSON.parse(fs.readFileSync(configPath));
// Explicit diagnostic only. Without this frozen plan flag, retain the original
// selected-model path; a Pro diagnostic never replaces normal Flash validation.
const backendRouteFlag=process.env.GPT_LIVE_H5_BACKEND_ROUTE_DIAGNOSTIC;
const backendRouteOptions={flag:backendRouteFlag,candidateId:process.env.VLAB_CANDIDATE_ID};
const mainRouteBefore=backendRouteFlag===undefined?undefined:structuredClone(config);
if(backendRouteFlag!==undefined)config=applyCandidateBackendRouteDiagnostic(config,{...backendRouteOptions,label:'main'}).config;
// This experiment exercises Makaron and a real child of the same agent. Other
// agents have independent selected harnesses and are outside this closure.
const modelIsolation=[];
function isolateMakaronModelScope(cfg,label) {
  assert(cfg.agents?.entries?.makaron,'Candidate Makaron agent unavailable');
  const selectedBefore=structuredClone(cfg);
  const agents=cfg.agents;
  const beforeSelections={defaults:agents.defaults?.model??null,entries:Object.fromEntries(Object.entries(agents.entries??{}).map(([id,agent])=>[id,{model:agent.model??null,subagents:agent.subagents??null}]))};
  const excludedAgentIds=Object.keys(agents.entries??{}).filter(id=>id!=='makaron');
  agents.entries={makaron:agents.entries.makaron};
  if(Array.isArray(agents.list))agents.list=agents.list.filter(agent=>agent.id==='makaron');
  const excludedBindings=(cfg.bindings??[]).filter(binding=>binding.agentId!=='makaron').map(binding=>({agentId:binding.agentId}));
  if(Array.isArray(cfg.bindings))cfg.bindings=cfg.bindings.filter(binding=>binding.agentId==='makaron');
  const main=agents.entries.makaron;
  main.subagents={...(main.subagents??{}),allowAgents:['makaron']};
  const selected=new Set();
  const collect=value=>{if(typeof value==='string')selected.add(value);else if(Array.isArray(value))for(const item of value)collect(item);else if(value&&typeof value==='object')for(const key of ['primary','fallbacks'])collect(value[key]);};
  for(const ref of collectCandidateSelectedModelReferences(cfg))collect(ref.model);
  const removedAliases=[],selectedRuntimeProof=[];
  for(const [scope,agent] of [['defaults',agents.defaults??{}],['makaron',main],...(agents.list??[]).map(agent=>['list:'+agent.id,agent])]) {
    for(const [model,definition] of Object.entries(agent.models??{})) {
      const runtimeId=definition?.agentRuntime?.id;
      if(selected.has(model))selectedRuntimeProof.push({scope,model,runtimeId:runtimeId??null,definitionSha256:createHash('sha256').update(JSON.stringify(definition)).digest('hex')});
      if(['codex','claude-cli'].includes(runtimeId)) {
        assert(!selected.has(model)&&!model.includes('*'),'Selected or wildcard external runtime requires a private harness closure');
        removedAliases.push({scope,model,runtimeId,definitionSha256:createHash('sha256').update(JSON.stringify(definition)).digest('hex')});delete agent.models[model];
      }
    }
  }
  for(const provider of Object.values(cfg.models?.providers??{})) {
    assert(!['codex','claude-cli'].includes(provider.agentRuntime?.id),'Provider external runtime is selected');
    for(const model of provider.models??[])assert(!['codex','claude-cli'].includes(model.agentRuntime?.id),'Provider model runtime requires private closure');
  }
  assert.deepEqual(main.model,beforeSelections.entries.makaron.model,'Makaron selected model changed');
  assert.deepEqual(agents.defaults.model,beforeSelections.defaults,'Default selected model changed');
  const preservedSelectedModels=assertCandidateSelectedModelsPreserved(selectedBefore,cfg);
  const scopedPolicy=scopeCandidateAgentToAgentAllow(cfg);cfg.tools=scopedPolicy.config.tools;
  modelIsolation.push({preservedSelectedModels,agentToAgentScope:{changed:scopedPolicy.changed,excludedAgentIds:scopedPolicy.excludedAgentIds},label,scope:'Makaron parent and same-agent child',excludedAgentIds,excludedBindings,retainedBindingAgentIds:(cfg.bindings??[]).map(binding=>binding.agentId),beforeSelections,afterSelections:{defaults:agents.defaults.model,makaron:{model:main.model,subagents:main.subagents}},selectedModels:[...selected],selectedRuntimeProof,removedAliases});
}
isolateMakaronModelScope(config,'main');
const providerRequestPolicy=[];
const mainProviderPolicy=disableCandidateParallelToolCalls(config,{label:'main'});
config.agents=mainProviderPolicy.config.agents;providerRequestPolicy.push(mainProviderPolicy.diagnostic);
config.channels={};config.cron={...(config.cron??{}),enabled:false};
config.browser={...(config.browser??{}),enabled:false};
config.agents.defaults.heartbeat={...(config.agents.defaults.heartbeat??{}),every:'0m'};
config.tools={...(config.tools??{}),deny:[...new Set([...(config.tools?.deny??[]),'message','cron'])]};
if(config.tools.exec?.cwd)config.tools.exec.cwd=config.agents.entries.makaron.workspace;
config.logging={...(config.logging??{}),file:path.join(state,'candidate-gateway.log')};
if (process.env.GPT_LIVE_H5_CASE !== 'caller-links')
  config.talk={...(config.talk??{}),realtime:{...(config.talk?.realtime??{}),instructions:GPT_LIVE_CALL_INSTRUCTIONS}};
configureCandidateOpenAIAuth(config);
const memoryQuery=process.env.GPT_LIVE_H5_MEMORY_QUERY?.trim();
const fullTools=process.env.GPT_LIVE_H5_FULL_TOOLS==='1';
const allowed=new Set(['vlab-agent-worker-isolation','deepseek','openai','xai',...(fullTools?['memory-core','google','web-readability']:[])]);
if(config.plugins?.entries)config.plugins.entries=Object.fromEntries(Object.entries(config.plugins.entries).filter(([id])=>allowed.has(id)));
if(Array.isArray(config.plugins?.allow))config.plugins.allow=config.plugins.allow.filter(id=>allowed.has(id));
// Load-path packages can live outside the runtime snapshot. Copy only the
// explicitly enabled package bytes; its SDK host link must target this private
// runtime before native plugin convergence can touch it.
const pluginIsolation=[];
const externalSourceFreeze=process.env.GPT_LIVE_H5_EXTERNAL_PLUGIN_SOURCES?JSON.parse(fs.readFileSync(path.resolve(process.env.GPT_LIVE_H5_EXTERNAL_PLUGIN_SOURCES))):null;
if(fullTools&&config.plugins?.load?.paths) {
  const privateLoadPaths=[];
  for(const source of config.plugins.load.paths) {
    const manifestPath=path.join(source,'openclaw.plugin.json');
    if(!fs.existsSync(manifestPath))continue;
    const manifest=JSON.parse(fs.readFileSync(manifestPath));if(!allowed.has(manifest.id))continue;
    assert(/^[a-z0-9][a-z0-9_-]*$/u.test(manifest.id),'Explicit plugin ID required');
    const sourceReal=fs.realpathSync(source);
    if(sourceReal.startsWith(fs.realpathSync(runtime)+'/')||sourceReal.startsWith(fs.realpathSync(state)+'/')) {
      privateLoadPaths.push(sourceReal);pluginIsolation.push({id:manifest.id,source:sourceReal,privateLoadPath:sourceReal,alreadyPrivate:true});continue;
    }
    const target=path.join(state,'isolated-plugin-sources',manifest.id);assert(!fs.existsSync(target),'Plugin snapshot target must be fresh');
    const expected=externalSourceFreeze?.plugins?.find(plugin=>plugin.id===manifest.id&&plugin.source===sourceReal);
    assert(expected,'External plugin source must be frozen before Candidate dispatch');
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    fs.cpSync(sourceReal,target,{recursive:true,dereference:false,filter:file=>!['.env','.npmrc','credentials'].includes(path.basename(file))&&!path.basename(file).startsWith('.env.')});
    const fileProof=[],links=[];
    const walk=(directory)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const destination=path.join(directory,entry.name),relative=path.relative(target,destination),original=path.join(sourceReal,relative);
      if(entry.isSymbolicLink()) {
        const originalTarget=fs.readlinkSync(original);
        assert(relative==='node_modules/openclaw','Unrecognized external plugin host link');
        fs.unlinkSync(destination);fs.symlinkSync(path.join(runtime,'openclaw'),destination);
        links.push({path:relative,sourceTarget:originalTarget,privateTarget:path.join(runtime,'openclaw')});
      } else if(entry.isDirectory())walk(destination);
      else if(entry.isFile()){const bytes=fs.readFileSync(destination),sourceBytes=fs.readFileSync(original),sha=createHash('sha256').update(bytes).digest('hex');assert(bytes.equals(sourceBytes),'External plugin snapshot byte drift');fileProof.push({path:relative,sha256:sha,bytes:bytes.length});}
      else assert.fail('Unexpected external plugin file type');
    }};walk(target);
    assert.deepEqual([...fileProof].sort((a,b)=>a.path.localeCompare(b.path,'en')),[...expected.sourceFiles].sort((a,b)=>a.path.localeCompare(b.path,'en')),'External plugin source changed after dispatch freeze');
    assert.deepEqual(links.map(link=>({path:link.path,target:link.sourceTarget})),expected.hostLinks,'External plugin host link changed after dispatch freeze');
    pluginIsolation.push({id:manifest.id,source:sourceReal,privateLoadPath:target,alreadyPrivate:false,sourceFiles:fileProof,sourceFilesSha256:createHash('sha256').update(JSON.stringify(fileProof)).digest('hex'),hostLinks:links});
    privateLoadPaths.push(target);
  }
  config.plugins.load.paths=privateLoadPaths;
}
if(process.env.VOICE_WORKER_PROCESS_OWNER==='1'){
  const {patchVoiceWorker,patchVoicePool,patchVoiceIndex,patchNativeVoiceProcessScope}=await import('./patch-voice-worker-process-owner.mjs');
  const roots=(config.plugins?.load?.paths??[]).filter(p=>fs.existsSync(path.join(p,'openclaw.plugin.json'))&&JSON.parse(fs.readFileSync(path.join(p,'openclaw.plugin.json'))).id==='vlab-agent-worker-isolation');
  assert(roots.length===1,'Exact private Worker plugin required');
  const root=fs.realpathSync(roots[0]);assert(root.startsWith(fs.realpathSync(path.dirname(runtime))+'/'),'Worker patch must stay in own Candidate');
  const receipts=[];
  const nativeScopeFile=path.join(runtime,'openclaw/dist/embedded-agent.runtime-CL7poBKY.js');
  const nativeBefore=fs.readFileSync(nativeScopeFile),nativeAfter=patchNativeVoiceProcessScope(nativeBefore.toString());
  fs.copyFileSync('lab/realtime-direct-tools/worker-process-owner.mjs',path.join(runtime,'openclaw/dist/voice-process-owner.mjs'));
  fs.writeFileSync(nativeScopeFile,nativeAfter);receipts.push({name:'embedded-agent.runtime-CL7poBKY.js',before:createHash('sha256').update(nativeBefore).digest('hex'),after:createHash('sha256').update(nativeAfter).digest('hex')});
  for(const [name,patch] of [['worker.mjs',patchVoiceWorker],['worker-pool.mjs',patchVoicePool],['index.mjs',patchVoiceIndex]]){const before=fs.readFileSync(path.join(root,name)),after=patch(before.toString());fs.writeFileSync(path.join(root,name),after);receipts.push({name,before:createHash('sha256').update(before).digest('hex'),after:createHash('sha256').update(after).digest('hex')});}
  fs.copyFileSync('lab/realtime-direct-tools/worker-process-owner.mjs',path.join(root,'voice-process-owner.mjs'));
  fs.mkdirSync(process.env.GPT_LIVE_H5_EVIDENCE_DIR,{recursive:true,mode:0o700});fs.writeFileSync(path.join(process.env.GPT_LIVE_H5_EVIDENCE_DIR,'worker-process-owner-patch.json'),JSON.stringify({candidateId:process.env.VLAB_CANDIDATE_ID,sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT,root,receipts})+'\n',{mode:0o600,flag:'wx'});
}
const worker=config.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
assert(worker?.workerConfigPath,'Worker configuration unavailable');
const relative=path.relative(state,worker.workerConfigPath);assert(!relative.startsWith('..'));
const workerBytes=fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR,relative),'utf8')
 .replaceAll(process.env.VLAB_SHARED_STATE_DIR,state).replaceAll('/srv/vlab-production-mirror/labs/instances/db91-parity/runtime',runtime);
let workerConfig=JSON.parse(workerBytes);
const workerRouteBefore=backendRouteFlag===undefined?undefined:structuredClone(workerConfig);
if(backendRouteFlag!==undefined)workerConfig=applyCandidateBackendRouteDiagnostic(workerConfig,{...backendRouteOptions,label:'worker'}).config;
isolateMakaronModelScope(workerConfig,'worker');
const workerProviderPolicy=disableCandidateParallelToolCalls(workerConfig,{label:'worker'});
workerConfig.agents=workerProviderPolicy.config.agents;providerRequestPolicy.push(workerProviderPolicy.diagnostic);
workerConfig.agents??={};workerConfig.agents.defaults??={};
workerConfig.agents.defaults.workspace=config.agents.defaults.workspace;
for(const [agentId,agent] of Object.entries(workerConfig.agents.entries??{})) {
  assert(config.agents.entries?.[agentId],'Worker has an agent outside the Candidate configuration');
  agent.workspace=config.agents.entries[agentId].workspace;
  agent.agentDir=config.agents.entries[agentId].agentDir;
}
for(const agent of workerConfig.agents.list??[]) {
  assert(config.agents.entries?.[agent.id],'Worker list has an agent outside the Candidate configuration');
  agent.workspace=config.agents.entries[agent.id].workspace;
  agent.agentDir=config.agents.entries[agent.id].agentDir;
}
workerConfig.channels={};workerConfig.cron={...(workerConfig.cron??{}),enabled:false};
workerConfig.browser={...(workerConfig.browser??{}),enabled:false};
workerConfig.agents.defaults.heartbeat={...(workerConfig.agents.defaults.heartbeat??{}),every:'0m'};
workerConfig.tools={...(workerConfig.tools??{}),deny:[...new Set([...(workerConfig.tools?.deny??[]),'message','cron'])]};
if(workerConfig.tools.exec?.cwd)workerConfig.tools.exec.cwd=config.agents.entries.makaron.workspace;
if(fullTools) {
  workerConfig.plugins??={};workerConfig.plugins.entries??={};
  workerConfig.plugins.entries=Object.fromEntries(Object.entries(workerConfig.plugins.entries).filter(([id])=>allowed.has(id)));
  workerConfig.plugins.allow=(workerConfig.plugins.allow??[]).filter(id=>allowed.has(id));
  for(const id of ['memory-core','google','web-readability']) {
    if(config.plugins?.entries?.[id])workerConfig.plugins.entries[id]=config.plugins.entries[id];
  }
  workerConfig.plugins.allow=[...new Set([...(workerConfig.plugins.allow??[]),'memory-core','google','web-readability'])];
  workerConfig.tools.web=config.tools?.web??workerConfig.tools.web;
  workerConfig.plugins.load={...(workerConfig.plugins.load??{}),paths:config.plugins?.load?.paths??[]};
}
let backendRouteDiagnostic;
if(backendRouteFlag!==undefined) {
  // Resolve the nearest existing ancestor before creating any Worker config
  // directories, so a symlink cannot redirect this diagnostic into shared state.
  const target=path.resolve(worker.workerConfigPath);let ancestor=target;
  while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const workerTarget=path.join(fs.realpathSync(ancestor),path.relative(ancestor,target));
  assert.equal(workerTarget,target,'Candidate backend Worker target has a noncanonical ancestor');
  const privatePaths=assertCandidateBackendDiagnosticPaths({candidateId:process.env.VLAB_CANDIDATE_ID,
    candidateRoot:fs.realpathSync(path.dirname(runtime)),runtime:fs.realpathSync(runtime),state:fs.realpathSync(state),
    configPath:fs.realpathSync(configPath),workerConfigPath:workerTarget});
  backendRouteDiagnostic={...assertCandidateBackendRouteDiagnosticPair({mainBefore:mainRouteBefore,mainAfter:config,
    workerBefore:workerRouteBefore,workerAfter:workerConfig},backendRouteOptions),...privatePaths};
}
fs.mkdirSync(path.dirname(worker.workerConfigPath),{recursive:true});fs.writeFileSync(worker.workerConfigPath,JSON.stringify(workerConfig,null,2)+'\n',{mode:0o600});
worker.gatewayConfigPath=configPath;fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
const schemaPreflight=[];
for(const [label,target] of [['main',configPath],['worker',worker.workerConfigPath]])schemaPreflight.push(await preflightCandidateConfig({candidateRoot:path.dirname(runtime),runtime,state,configPath:target,label}));
const privateAgentDb=path.join(state,'agents/makaron/agent/openclaw-agent.sqlite');fs.mkdirSync(path.dirname(privateAgentDb),{recursive:true,mode:0o700});
let toolsEnvironment;
if(fullTools) {
  assert(fs.existsSync(privateAgentDb),'Full tools require a consistent makaron agent database in plan.databases');
  const sharedConfig=JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH));
  const sourceWorkspace=sharedConfig.agents.entries.makaron.workspace;
  const privateWorkspace=config.agents.entries.makaron.workspace;
  assert(path.resolve(privateWorkspace).startsWith(path.resolve(process.env.VLAB_CANDIDATE_DATA)+'/'),'Candidate workspace must be private');
  const inventory=JSON.parse(execFileSync('python3',['-c',String.raw`import hashlib,json,sqlite3,sys
db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
required=['schema_meta','auth_profile_store','auth_profile_state','memory_index_sources','memory_index_chunks']
tables={row[0] for row in db.execute("select name from sqlite_master where type='table'")}
assert all(name in tables for name in required),'Snapshot is missing current runtime database tables'
assert db.execute("select agent_id from schema_meta limit 1").fetchone()[0]=='makaron','Snapshot agent identity is not makaron'
paths=[row[0] for row in db.execute("select path from memory_index_sources where source='memory'")]
schema=list(db.execute("select type,name,tbl_name,sql from sqlite_master order by name"))
sources=list(db.execute("select path,source,hash from memory_index_sources order by path,source"))
fingerprint=lambda value:hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
print(json.dumps({'sourceCount':len(paths),'chunkCount':db.execute('select count(*) from memory_index_chunks').fetchone()[0],'paths':paths,
 'requiredTablesPresent':True,'snapshotAgentId':'makaron','schemaSqlSha256':fingerprint(schema),'memorySourcesSha256':fingerprint(sources),
 'snapshotReadMode':'SQLite readonly of runner online-backup (runner quick_check retained)','userVersion':db.execute('PRAGMA user_version').fetchone()[0]}))
db.close()`,privateAgentDb],{encoding:'utf8'}));
  assert(inventory.sourceCount>0&&inventory.chunkCount>0,'Memory snapshot must contain actual indexed memory');
  let copied=0,missing=0,bytes=0;
  for(const relativePath of new Set([...inventory.paths,'AGENTS.md','SOUL.md','USER.md','MEMORY.md','IDENTITY.md','TOOLS.md'])) {
    const source=path.resolve(sourceWorkspace,relativePath),destination=path.resolve(privateWorkspace,relativePath);
    assert(source.startsWith(path.resolve(sourceWorkspace)+'/')&&destination.startsWith(path.resolve(privateWorkspace)+'/'),'Memory source path escaped private workspace');
    if(!fs.existsSync(source)||!fs.statSync(source).isFile()){missing++;continue;}
    assert(fs.realpathSync(source).startsWith(fs.realpathSync(sourceWorkspace)+'/'),'Memory source symlink escaped workspace');
    fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    fs.copyFileSync(source,destination);fs.chmodSync(destination,0o600);copied++;bytes+=fs.statSync(destination).size;
  }
  toolsEnvironment={schemaPreflight,npmPrivate,pluginIsolation,modelIsolation,providerRequestPolicy,...(backendRouteDiagnostic?{backendRouteDiagnostic}:{}),actualMemorySnapshot:true,memorySources:inventory.sourceCount,memoryChunks:inventory.chunkCount,copiedMemoryFiles:copied,missingMemoryFiles:missing,copiedMemoryBytes:bytes,
    snapshotSchemaProof:{requiredTablesPresent:inventory.requiredTablesPresent,snapshotAgentId:inventory.snapshotAgentId,schemaSqlSha256:inventory.schemaSqlSha256,memorySourcesSha256:inventory.memorySourcesSha256,
      userVersion:inventory.userVersion,snapshotReadMode:inventory.snapshotReadMode},
    memoryDatabaseBytes:fs.statSync(privateAgentDb).size,plugins:[...allowed],webSearchEnabled:config.tools?.web?.search?.enabled===true,webSearchProvider:config.tools?.web?.search?.provider??null,
    channelsDisabled:true,cronDisabled:true,heartbeatDisabled:true,browserDisabled:true,privateWritableState:true,
    mainAgentPaths:Object.fromEntries(Object.entries(config.agents.entries??{}).map(([id,agent])=>[id,{workspace:agent.workspace,agentDir:agent.agentDir}])),
    workerAgentPaths:Object.fromEntries(Object.entries(workerConfig.agents.entries??{}).map(([id,agent])=>[id,{workspace:agent.workspace,agentDir:agent.agentDir}])),
    workerDefaultWorkspace:workerConfig.agents.defaults.workspace};
}
// A consistent live snapshot already has the current schema. The actual Gateway
// retains its full native preflight; do not perform a duplicate multi-GB open here.
if(!fullTools) {
  const {g:openAgentDatabase,a:closeAgentDatabases}=await import(`${runtime}/openclaw/dist/openclaw-agent-db-CUTe8BX6.js`);
  openAgentDatabase({agentId:'makaron',path:privateAgentDb,env:process.env});closeAgentDatabases();
}
installCandidateOpenAIAuth();
if(process.env.GPT_LIVE_H5_EVIDENCE_DIR) {
  const evidenceBase=process.env.GPT_LIVE_H5_EVIDENCE_DIR;assert(path.isAbsolute(evidenceBase),'Absolute evidence path required');
  fs.mkdirSync(evidenceBase,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(evidenceBase,'bootstrap-isolation.json'),JSON.stringify({candidateId:process.env.VLAB_CANDIDATE_ID,createdAt:new Date().toISOString(),...toolsEnvironment,...(backendRouteDiagnostic?{backendRouteDiagnostic}:{}),providerRequestPolicy,mainPluginAllow:config.plugins.allow,workerPluginAllow:workerConfig.plugins.allow,mainEnabledPlugins:Object.keys(config.plugins.entries??{}),workerEnabledPlugins:Object.keys(workerConfig.plugins.entries??{}),nativeVoiceStarted:false},null,2)+'\n',{mode:0o600});
}
const tracePath=path.join(state,'gateway-stdout.log'),sessionPath=path.join(state,'h5-session.json');
fs.writeFileSync(tracePath,'',{flag:'wx',mode:0o600});
let gateway,client,bridge,smoke,osObserver;let recent=[];
const experience=process.env.GPT_LIVE_H5_INTERACTIVE==='1';
const experienceAfterTests=process.env.GPT_LIVE_H5_EXPERIENCE_AFTER_TESTS==='1';
const shutdown=new AbortController();
const requestShutdown=()=>shutdown.abort();
if(experience||experienceAfterTests){process.once('SIGTERM',requestShutdown);process.once('SIGINT',requestShutdown);}
let experienceMetadata,experienceReadyPath,experienceReadyWritten=false,experienceOutcome='failed';
function launch() {
  gateway=spawn(process.execPath,['--max-old-space-size=4096',`${runtime}/openclaw/dist/index.js`,'gateway','--port',String(config.gateway.port)],{env:{...process.env,OPENCLAW_GATEWAY_PORT:String(config.gateway.port),OPENCLAW_GPT_LIVE_PROGRESS_TRACE:'1'},stdio:['ignore','pipe','pipe']});
  for(const stream of [gateway.stdout,gateway.stderr])stream.on('data',chunk=>{fs.appendFileSync(tracePath,chunk);recent.push(String(chunk));if(recent.length>30)recent.shift();});
}
async function stop(child) {
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
  await Promise.race([done,delay(10000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await Promise.race([done,delay(2000)]);
}
async function port() {
  const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const result=server.address().port;await new Promise(resolve=>server.close(resolve));return result;
}
try {
  const {GatewayClient}=await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  launch();let ready=false,migrationRestarted=false;
  const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>{assert(process.env[key]);return process.env[key];});
  for(const deadline=Date.now()+(fullTools?900000:300000);Date.now()<deadline;) {
    assert(!shutdown.signal.aborted,'Candidate experience stopped during startup');
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Private Gateway connection deadline')),5000);
        client=new GatewayClient({url:`ws://127.0.0.1:${config.gateway.port}`,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],caps:process.env.V_REALTIME_DIRECT_TOOLS==='1'?['voice-direct-tools','tool-events']:undefined,
          onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:error=>{clearTimeout(timer);reject(error);},onEvent:event=>bridge?.emit(event)});client.start();
      });
      const catalog=await client.request('talk.catalog',{}, {timeoutMs:15000});
      assert(catalog.realtime?.providers?.some(p=>p.id==='openai'&&p.configured&&(p.models??[]).some(m=>(typeof m==='string'?m:m.id)==='gpt-live-1-codex')),'Native GPT Live provider unavailable');
      ready=true;break;
    } catch(error) {
      client?.stop();client=null;
      if(gateway.exitCode!==null) {
        if(!migrationRestarted&&recent.some(line=>line.includes('plugin migration inputs changed during startup convergence'))){migrationRestarted=true;launch();}
        else throw Error('Private Gateway stopped before native provider readiness');
      }
      await delay(1000);
    }
  }
  assert(ready,'Private Gateway readiness deadline');
  const inventoryOnly=process.env.GPT_LIVE_H5_INVENTORY_ONLY==='1';
  if(inventoryOnly||process.env.GPT_LIVE_H5_INVENTORY_BEFORE_NATIVE==='1') {
    assert(memoryQuery,'Explicit private memory query required');
    assert(fullTools,'Inventory mode requires the full real tools environment');
    const evidenceBase=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
    assert(evidenceBase&&path.isAbsolute(evidenceBase),'Absolute inventory evidence directory required');
    fs.mkdirSync(evidenceBase,{recursive:true,mode:0o700});
    const catalog=await client.request('tools.catalog',{agentId:'makaron',includePlugins:true},{timeoutMs:20000});
    const names=(catalog.groups??[]).flatMap(group=>(group.tools??[]).map(tool=>tool.id));
    const invocationResults=[];
    for(const [name,args] of [['memory_search',{query:memoryQuery,maxResults:3}],['web_search',{query:'site:openai.com Realtime API interruptions official documentation',count:3}]]) {
      const invokedAt=Date.now();
      const result=await client.request('tools.invoke',{agentId:'makaron',sessionKey:'agent:makaron:explicit:gpt-live-candidate-inventory-'+process.env.VLAB_CANDIDATE_ID,name,args},{timeoutMs:120000});
      const file=path.join(evidenceBase,name+'-tool-result.json');
      fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{mode:0o600});
      const serialized=JSON.stringify(result.output??null);
      const body=typeof result.output==='string'?result.output:(result.output?.content??[]).filter(item=>item.type==='text').map(item=>item.text??'').join('\n');
      let structured;try{structured=JSON.parse(body);}catch{}
      const isError=result.output?.isError===true||structured?.error||structured?.isError===true;
      const nonempty=name==='memory_search'?(Array.isArray(structured?.results)&&structured.results.length>0)||(Array.isArray(structured?.matches)&&structured.matches.length>0):/https:\/\/[^\s"<>]*openai\.com/iu.test(body);
      invocationResults.push({name,invokedAt,completedAt:Date.now(),ok:result.ok===true&&!isError&&Boolean(nonempty),rpcOk:result.ok===true,actualNonemptyResult:Boolean(nonempty),source:result.source??null,
        resultSha256:createHash('sha256').update(serialized).digest('hex'),resultBytes:Buffer.byteLength(serialized),resultPath:file,
        error:result.ok===false?String(result.error?.code??'failed'):null});
    }
    const inventory={...toolsEnvironment,candidateId:process.env.VLAB_CANDIDATE_ID,gatewayPid:gateway.pid,
      configuredTools:{memory_search:names.includes('memory_search'),memory_get:names.includes('memory_get'),web_search:names.includes('web_search'),web_fetch:names.includes('web_fetch')},
      invocationResults,actualBackendTools:true,actualNativeVoice:false,productAccepted:false};
    fs.writeFileSync(path.join(evidenceBase,'tools-environment-inventory.json'),JSON.stringify(inventory,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({toolsEnvironmentInventory:inventory}));
    assert(invocationResults.every(result=>result.ok),'Candidate real tool invocation failed');
  }
  if(!inventoryOnly) {
  const guardedGateway={request:async(method,params,options)=>{
    const result=await client.request(method,params,options);
    if(method==='talk.client.create')fs.writeFileSync(sessionPath,JSON.stringify({sessionKey:params.sessionKey,voiceSessionId:result.voiceSessionId}),{mode:0o600});
    return result;
  }};
  let directVoice;
  if(process.env.V_REALTIME_DIRECT_TOOLS==='1') {
    const wsModule=await import(`${runtime}/openclaw/node_modules/ws/wrapper.mjs`);
    const credentialPath=process.env.V_REALTIME_GROK_CREDENTIAL_FILE;
    let grokKey=process.env.XAI_API_KEY;
    if(credentialPath){const st=fs.lstatSync(credentialPath);assert(st.isFile()&&(st.mode&0o077)===0,'Grok credential file must be private');grokKey=JSON.parse(fs.readFileSync(credentialPath)).apiKey;}
    const auditPath=path.join(process.env.GPT_LIVE_H5_EVIDENCE_DIR,'direct-voice-audit.jsonl');
    fs.writeFileSync(auditPath,'',{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(process.env.GPT_LIVE_H5_EVIDENCE_DIR,'native-environment-isolation.json'),JSON.stringify({agentRuntimeEnvironment,toolEnvironment},null,2)+'\n',{mode:0o600,flag:'wx'});
    directVoice=createDirectVoiceService({gateway:guardedGateway,wsModule,toolEnvironment,apiKeys:{seeduplex:process.env.VOLCENGINE_REALTIME_API_KEY,grok:grokKey},
      audit:value=>fs.appendFileSync(auditPath,JSON.stringify({at:Date.now(),...value})+'\n'),
      onOutputAudio:(id,pcm)=>fs.appendFileSync(path.join(process.env.GPT_LIVE_H5_EVIDENCE_DIR,`provider-${id}.pcm`),pcm,{mode:0o600}),
      loadContext:async sessionKey=>{
        const history=await guardedGateway.request('chat.history',{sessionKey,limit:6},{timeoutMs:10000});
        return JSON.stringify((history.messages??[]).map(m=>({role:m.role,content:m.content}))).slice(-12000);
      }});
  }
  bridge=createLiveH5Server({gateway:guardedGateway,directVoice,offer:async(reservation,sdp)=>{
    const response=await fetch(`http://127.0.0.1:${config.gateway.port}${reservation.offerUrl}`,{method:'POST',headers:{authorization:`Bearer ${reservation.clientSecret}`,'content-type':'application/sdp'},body:sdp,signal:AbortSignal.timeout(25000)});
    assert(response.ok,'Native SDP exchange failed');return response.text();
  }});
  const h5port=await port();await new Promise(resolve=>bridge.server.listen(h5port,'127.0.0.1',resolve));
  const appSha=createHash('sha256').update(fs.readFileSync('lab/gpt-live-h5/app.js')).digest('hex');
  async function holdForExperience(caseResults=[]) {
    const {waitForExperience}=await import('./gpt-live-h5-experience-lifecycle.mjs');
    const durationSeconds=Number(process.env.GPT_LIVE_H5_EXPERIENCE_SECONDS??7200);
    assert(Number.isSafeInteger(durationSeconds)&&durationSeconds>=1&&durationSeconds<=14400,'Candidate experience duration must be 1–14400 seconds');
    experienceReadyPath=process.env.GPT_LIVE_H5_EXPERIENCE_READY;
    assert(experienceReadyPath&&path.isAbsolute(experienceReadyPath),'Absolute candidate experience readiness path required');
    assert(process.env.VLAB_CANDIDATE_ID&&process.env.VLAB_CANDIDATE_UNIT,'Candidate experience identity required');
    assert(!shutdown.signal.aborted,'Candidate experience stopped before readiness');
    const readyAt=Date.now();
    experienceMetadata={candidateId:process.env.VLAB_CANDIDATE_ID,unit:process.env.VLAB_CANDIDATE_UNIT,
      remotePort:h5port,gatewayPid:gateway.pid,appSha,sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT??null,caseResults,productAccepted:false,humanAccepted:false,diagnosticOnly:caseResults.some(result=>!result.passed),
      readyAt:new Date(readyAt).toISOString(),expiresAt:new Date(readyAt+durationSeconds*1000).toISOString(),state:'ready'};
    fs.mkdirSync(path.dirname(experienceReadyPath),{recursive:true,mode:0o700});
    fs.writeFileSync(experienceReadyPath,JSON.stringify(experienceMetadata,null,2)+'\n',{mode:0o600,flag:'wx'});
    experienceReadyWritten=true;
    if(process.env.DIRECT_VOICE_AUTOMATED==='1'){
      smoke=spawn(process.execPath,['lab/realtime-direct-tools/native-smoke.mjs'],{env:{...process.env,DIRECT_VOICE_EVIDENCE:path.join(process.env.GPT_LIVE_H5_EVIDENCE_DIR,'native'),DIRECT_VOICE_CLIPS:path.resolve('tmp/voice-reliability/clips'),DIRECT_VOICE_CASES:directCase},stdio:'inherit'});
      const code=await new Promise((resolve,reject)=>{smoke.once('error',reject);smoke.once('exit',resolve);});
      assert.equal(code,0,'Original direct voice workflow failed; native evidence retained');experienceOutcome={status:'automation-completed'};return;
    }
    experienceOutcome=await waitForExperience({durationMs:durationSeconds*1000,gateway,signal:shutdown.signal});
  }
  if(experience)await holdForExperience();else {
  const cases=(process.env.GPT_LIVE_H5_CASE??'workflow').split(',');
  assert(cases.every(value=>['workflow','cancel','close-reopen','barge-chat','comprehensive-long','comprehensive-controls','comprehensive-queued-steer','call-lifecycle','caller-links'].includes(value)),'Unknown candidate H5 case');
  const evidenceBase=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
  assert(evidenceBase&&path.isAbsolute(evidenceBase),'Absolute candidate evidence directory required');
  fs.mkdirSync(evidenceBase,{recursive:true,mode:0o700});
  if(cases.some(testCase=>testCase.startsWith('comprehensive-'))) {
    assert(process.env.GPT_LIVE_H5_OS_OBSERVER_CONFIG,'Comprehensive native cases require a frozen first-case OS observer barrier');
    const started=await startOwnedProcObserver({configPath:process.env.GPT_LIVE_H5_OS_OBSERVER_CONFIG,
      candidateId:process.env.VLAB_CANDIDATE_ID,unit:process.env.VLAB_CANDIDATE_UNIT,
      sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT,gatewayPid:gateway.pid,candidateRuntime:runtime,evidenceDir:evidenceBase,
      signal:shutdown.signal});osObserver=started.child;
  }
  const results=[];
  for(const testCase of cases) {
    if(osObserver)assert(osObserver.exitCode===null&&osObserver.signalCode===null,'OS witness must still cover this original native case');
    const helper=testCase==='caller-links'?'lab/gpt-live-candidate-native/caller-links-smoke.mjs':testCase==='call-lifecycle'?'lab/gpt-live-candidate-native/call-lifecycle-smoke.mjs':testCase.startsWith('comprehensive-')?'lab/gpt-live-candidate-native/native-smoke.mjs':testCase==='workflow'?'lab/gpt-live-h5-provenance-smoke.mjs':'lab/gpt-live-h5-control-smoke.mjs';
    const clips=process.env.GPT_LIVE_H5_USER_CLIPS_DIR;
    smoke=spawn(process.execPath,[helper],{env:{...process.env,
      GPT_LIVE_H5_CASE:testCase,GPT_LIVE_H5_EVIDENCE_DIR:cases.length>1?path.join(evidenceBase,testCase):evidenceBase,
      ...(clips?{GPT_LIVE_H5_USER_CLIPS_DIR:path.resolve(clips),...(!testCase.startsWith('comprehensive-')&&testCase!=='workflow'&&testCase!=='call-lifecycle'?{GPT_LIVE_CALL_AUDIO_FIXTURE:path.join(path.resolve(clips),'silence.wav')}:{})}:{}),
      GPT_LIVE_H5_READY:'1',GPT_LIVE_H5_URL:`http://127.0.0.1:${h5port}`,GPT_LIVE_H5_APP_SHA:appSha,GPT_LIVE_H5_GATEWAY_PID:String(gateway.pid),
      GPT_LIVE_H5_RUNTIME_ROOT:runtime+'/openclaw',GPT_LIVE_H5_TRACE_PATH:tracePath,GPT_LIVE_H5_SESSION_PATH:sessionPath},stdio:'inherit'});
    const code=await new Promise((resolve,reject)=>{smoke.once('error',reject);smoke.once('exit',code=>resolve(code));});
    results.push({case:testCase,code,passed:code===0});
  }
  fs.writeFileSync(path.join(evidenceBase,'case-results.json'),JSON.stringify(results,null,2)+'\n',{mode:0o600});
  const diagnosticHoldSeconds=Number(process.env.GPT_LIVE_H5_DIAGNOSTIC_HOLD_SECONDS??0);
  assert(Number.isInteger(diagnosticHoldSeconds)&&diagnosticHoldSeconds>=0&&diagnosticHoldSeconds<=1800,'Bounded owned diagnostic hold required');
  if(experienceAfterTests)await holdForExperience(results);
  else if(diagnosticHoldSeconds>0) {
    const at=Date.now();fs.writeFileSync(path.join(evidenceBase,'diagnostic-hold.json'),JSON.stringify({candidateId:process.env.VLAB_CANDIDATE_ID,unit:process.env.VLAB_CANDIDATE_UNIT,privateH5Port:h5port,gatewayPid:gateway.pid,appSha,caseResults:results,state:'idle-private-diagnostic',humanAccepted:false,productAccepted:false,readyAt:new Date(at).toISOString(),expiresAt:new Date(at+diagnosticHoldSeconds*1000).toISOString()},null,2)+'\n',{mode:0o600});
    await delay(diagnosticHoldSeconds*1000);
  }
  assert(results.every(result=>result.passed),'Full native H5 cases failed: '+results.filter(result=>!result.passed).map(result=>result.case).join(', '));
  }
  }
} catch(error) {
  console.error(JSON.stringify({candidateFailed:error.message,gatewayExit:gateway?.exitCode??null,
    gatewayRecent:recent.slice(-8).map(line=>line.replace(/(token|api.?key|authorization|secret|password)[=: ]+[^\s]+/giu,'$1=[redacted]').replace(/https?:\/\/\S+/giu,'[endpoint]').slice(0,300))}));process.exitCode=1;
} finally {
  process.removeListener('SIGTERM',requestShutdown);process.removeListener('SIGINT',requestShutdown);
  await stop(smoke);
  await stop(osObserver);
  try { await bridge?.dispose(); } finally {
    client?.stop(); await stop(gateway);
    // Preserve only structured, metadata-only public trace events. The private
    // Gateway stdout/config/auth are removed by the candidate runner.
    const evidence=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
    if(evidence&&path.isAbsolute(evidence)&&fs.existsSync(tracePath)) {
      fs.mkdirSync(evidence,{recursive:true,mode:0o700});
      fs.writeFileSync(path.join(evidence,'native-public-diagnostics.json'),
        JSON.stringify(parsePublicProgressDiagnostics(fs.readFileSync(tracePath,'utf8')),null,2)+'\n',{mode:0o600});
      fs.writeFileSync(path.join(evidence,'voice-confirmation-core-diagnostics.json'),
        JSON.stringify(parseVoiceConfirmationDiagnostics(fs.readFileSync(tracePath,'utf8')),null,2)+'\n',{mode:0o600});
    }
    if(experienceReadyWritten)fs.writeFileSync(experienceReadyPath,
      JSON.stringify({...experienceMetadata,state:'closed',outcome:experienceOutcome,closedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  }
}
