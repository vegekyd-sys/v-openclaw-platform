import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeExecutionConfig} from './native-execution-config.mjs';
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
