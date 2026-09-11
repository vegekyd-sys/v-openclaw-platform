import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeExecutionConfig,workerExecutionConfig} from './native-execution-config.mjs';
const fixture = () => ({gateway:{port:24993,auth:{token:'synthetic-only'}},plugins:{entries:{'vlab-agent-worker-isolation':{enabled:true,config:{keep:true}},feishu:{enabled:true}},allow:['feishu','vlab-agent-worker-isolation'],load:{paths:['/test/runtime/production-worker','/test/provider']}},agents:{defaults:{model:{primary:'deepseek/deepseek-flash',fallbacks:[]},maxConcurrent:45,models:{flash:{agentRuntime:{id:'vlab-worker',extra:42}},codex:{agentRuntime:{id:'codex'}},plain:{}}}},channels:{unchanged:true}});
test('only Worker selection changes; original and all other settings retained',()=>{
 const original=fixture(), before=structuredClone(original), next=nativeExecutionConfig(original,'/test');
 assert.deepEqual(original,before);assert.equal(next.plugins.entries['vlab-agent-worker-isolation'].enabled,false);
 assert.deepEqual(next.plugins.allow,['feishu']);assert.deepEqual(next.plugins.load.paths,['/test/provider']);
 assert.equal(next.agents.defaults.models.flash.agentRuntime.id,'openclaw');
 next.plugins.entries['vlab-agent-worker-isolation'].enabled=true;next.plugins.allow=before.plugins.allow;next.plugins.load.paths=before.plugins.load.paths;next.agents.defaults.models.flash.agentRuntime.id='vlab-worker';
 assert.deepEqual(next,before);
});
test('reject other ports and already disabled sources',()=>{
 const c=fixture();c.gateway.port=18789;assert.throws(()=>nativeExecutionConfig(c,'/test'));
 c.gateway.port=24993;c.plugins.entries['vlab-agent-worker-isolation'].enabled=false;assert.throws(()=>nativeExecutionConfig(c,'/test'));
});
test('merge-restores Worker routing without overwriting later VLab config',()=>{
 const original=fixture(), current=nativeExecutionConfig(original,'/test');
 current.channels={feishu:{enabled:true,later:true}};
 current.plugins.entries.feishu={enabled:true};
 current.plugins.allow.push('feishu');
 current.plugins.load.paths.push('/test/feishu');
 current.agents.defaults.models.later={agentRuntime:{id:'openclaw'},keep:true};
 const before=structuredClone(current);
 const next=workerExecutionConfig(current,original,'/test');
 assert.equal(next.plugins.entries['vlab-agent-worker-isolation'].enabled,true);
 assert(next.plugins.allow.includes('vlab-agent-worker-isolation'));
 assert(next.plugins.load.paths.includes('/test/runtime/production-worker'));
 assert.equal(next.agents.defaults.models.flash.agentRuntime.id,'vlab-worker');
 assert.deepEqual(next.channels,current.channels);
 assert.deepEqual(next.plugins.entries.feishu,current.plugins.entries.feishu);
 assert(next.plugins.allow.includes('feishu'));
 assert(next.plugins.load.paths.includes('/test/feishu'));
 assert.deepEqual(next.agents.defaults.models.later,current.agents.defaults.models.later);
 assert.deepEqual(current,before);
});
test('merge-restore refuses drifted Worker settings and model ownership',()=>{
 const original=fixture(), current=nativeExecutionConfig(original,'/test');
 current.plugins.entries['vlab-agent-worker-isolation'].config.minWorkers=2;
 assert.throws(()=>workerExecutionConfig(current,original,'/test'));
 const other=nativeExecutionConfig(original,'/test');
 other.agents.defaults.models.flash.agentRuntime.id='codex';
 assert.throws(()=>workerExecutionConfig(other,original,'/test'),/Unexpected current runtime/);
});
