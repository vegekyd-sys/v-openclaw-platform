// Read-only batch anchor census. Compatibility is NOT inferred from anchors.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {target,readJson,record,digest,sourceCommit} from './lab-instance.mjs';
import {patchSessionsSpawnGatewayProxy} from '../experiments/agent-worker-isolation-v1/patch-openclaw-sessions-spawn-gateway-proxy.mjs';
import {patchSessionsYieldExternalTask} from '../experiments/agent-worker-isolation-v1/patch-openclaw-sessions-yield-external-task.mjs';
import {patchSkillWorkshopWorkerProxy} from '../experiments/agent-worker-isolation-v1/patch-openclaw-skill-workshop-worker-proxy.mjs';
import {patchWorkerExecConfigDomainBundle} from '../experiments/agent-worker-isolation-v1/patch-openclaw-worker-exec-config-domain.mjs';
import {patchChannelRegistry} from '../scripts/patch-worker-channel-registry.mjs';
import {patchNativeSetupProbeOwner} from '../scripts/patch-native-setup-probe-owner.mjs';
import {patchOpenClawMediaCompletionBundle} from '../scripts/patch-openclaw-media-completion-relay.mjs';
import {patchOpenClawSessionStoreBundle} from '../scripts/patch-openclaw-session-hotset.mjs';

const [name,owner,version]=process.argv.slice(2),m=target(name,owner);
assert(['2026.9.1','2026.9.2'].includes(version));
const core=version==='2026.9.1'?`${m.root}/runtime/openclaw-before-92`:`${m.root}/runtime/core92/node_modules/openclaw`;
assert.equal(readJson(`${core}/package.json`).version,version);
const catalog=readJson(`${m.root}/source/platform/catalog.json`),dist=`${core}/dist`;
const sources=fs.readdirSync(dist).filter(name=>name.endsWith('.js')).map(name=>({name,source:fs.readFileSync(`${dist}/${name}`,'utf8')}));
const specs=[
 ['patch-openclaw-sessions-spawn-gateway-proxy','function createSessionsSpawnTool(opts)',patchSessionsSpawnGatewayProxy],
 ['patch-openclaw-sessions-yield-external-task','function createSessionsYieldTool(opts)',patchSessionsYieldExternalTask],
 ['patch-openclaw-skill-workshop-worker-proxy','Create the Skill Workshop tool for proposal discovery',patchSkillWorkshopWorkerProxy],
 ['patch-openclaw-worker-exec-config-domain','const execParams = normalizeParams(rawArgs);',patchWorkerExecConfigDomainBundle],
 ['patch-worker-channel-registry','function getActivePluginChannelRegistrySnapshotFromState()',patchChannelRegistry],
 ['patch-native-setup-probe-owner','function selectPreparedAgentHarness(params)',patchNativeSetupProbeOwner],
 ['patch-openclaw-media-completion-relay','function scheduleMediaGenerationTaskCompletion(params)',patchOpenClawMediaCompletionBundle],
 ['patch-openclaw-session-hotset','const persisted = projectSessionStoreForPersistence({',s=>patchOpenClawSessionStoreBundle(s,'file:///not-applied-hotset-fixture.mjs')],
];
const rows=catalog.adaptations.map(entry=>{
 const base={id:entry.id,reviewedVersion:entry.hostVersions.includes(version),accepted:false};
 if(entry.disposition==='excluded-candidate')return {...base,status:'excluded-candidate'};
 const spec=specs.find(x=>x[0]===entry.id);
 if(!spec)return {...base,status:entry.id==='patch-openclaw-worker-native-attempt'?'separate-five-bundle-check-required':'component-specific-review-required'};
 const found=sources.filter(x=>x.source.includes(spec[1]));
 if(found.length!==1)return {...base,status:'anchor-unresolved',candidates:found.map(x=>x.name)};
 const {name:file,source}=found[0],beforeSha256=digest(source);
 try{
  const result=spec[2](source),after=typeof result==='string'?result:result.source;
  assert.equal(typeof after,'string');
  return {...base,file,beforeSha256,status:after===source?'marker-already-present':'anchor-compatible-needs-review',wouldChange:after!==source};
 }catch(error){return {...base,file,beforeSha256,status:'anchor-drift',error:String(error.message).slice(0,220)};}
});
record(m,'compat-census',{version,commit:sourceCommit(m),runtimeModified:false,rows,releaseReady:false});
