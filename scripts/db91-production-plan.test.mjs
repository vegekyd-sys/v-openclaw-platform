import test from 'node:test';import assert from 'node:assert/strict';
import {planDb91Config,db91ReleaseUnit,db91SignalPolicy,oldDb91Core,oldDb91Worker,db91Release} from './db91-production-plan.mjs';
test('release changes only exact runtime pointers and preserves user settings',()=>{
 const before={plugins:{load:{paths:['/unrelated',oldDb91Worker]}},mcp:{servers:{'universal-memory':{enabled:false},'voice-memory':{enabled:true,env:{VOICE_MEMORY_OPENCLAW_ROOT:oldDb91Core}}}},agents:{model:'keep',maxConcurrent:45},privateValue:'fixture'};
 const after=JSON.parse(planDb91Config(JSON.stringify(before)));
 assert.equal(after.plugins.load.paths[1],db91Release+'/worker');assert.equal(after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT,db91Release+'/core');
 after.plugins.load.paths[1]=oldDb91Worker;after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT=oldDb91Core;assert.deepEqual(after,before);
 assert.throws(()=>planDb91Config(JSON.stringify({})));assert.throws(()=>planDb91Config(planDb91Config(JSON.stringify(before))));
});
test('unit preserves established command options and startup hooks',()=>{
 const unit=db91ReleaseUnit();assert(unit.includes('--inspect=127.0.0.1:9229 --max-old-space-size=12288'));
 assert.equal((unit.match(/^ExecStartPre=.+$/gm)||[]).length,3);assert(!unit.includes(oldDb91Core));
 assert.equal((unit.match(/^ExecStartPre=-\+/gm)||[]).length,2,'Both established root prestart helpers retain their systemd identity prefix');
 assert(unit.includes('ExecStartPre=/opt/node-v22.23.1/bin/node'),'Session hotset prestart stays unprivileged');
 assert(!/Timeout|MemoryHigh|MemoryMax|CPUQuota/.test(unit));assert(unit.includes('KillMode=mixed'));
 assert.equal(db91SignalPolicy,'[Service]\nKillMode=mixed\n');
});
