import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {planDb91Config,db91ReleaseUnit,db91SignalPolicy,oldDb91Core,oldDb91Worker,db91Release} from './db91-production-plan.mjs';
test('release changes only exact runtime pointers and preserves user settings',()=>{
 const before={plugins:{load:{paths:['/unrelated',oldDb91Worker]}},mcp:{servers:{'universal-memory':{enabled:false},'voice-memory':{enabled:true,env:{VOICE_MEMORY_OPENCLAW_ROOT:oldDb91Core}}}},agents:{model:'keep',maxConcurrent:45},privateValue:'fixture'};
 const after=JSON.parse(planDb91Config(JSON.stringify(before)));
 assert.equal(after.plugins.load.paths[1],db91Release+'/worker');assert.equal(after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT,db91Release+'/core');
 after.plugins.load.paths[1]=oldDb91Worker;after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT=oldDb91Core;assert.deepEqual(after,before);
 assert.throws(()=>planDb91Config(JSON.stringify({})));assert.throws(()=>planDb91Config(planDb91Config(JSON.stringify(before))));
});
test('dedicated native signal is not preempted by synchronous TERM exit hook',()=>{
 const fixture=`const native=()=>Promise.resolve().then(()=>{console.log('native-restart');process.exit(0)});process.on('SIGTERM',native);process.on('SIGUSR1',native);process.on('SIGTERM',()=>process.exit(0));setTimeout(()=>process.kill(process.pid,process.argv[1]),10);setTimeout(()=>process.exit(2),1000);`;
 assert.equal(execFileSync(process.execPath,['-e',fixture,'SIGTERM'],{encoding:'utf8',timeout:5000}).trim(),'');
 assert.equal(execFileSync(process.execPath,['-e',fixture,'SIGUSR1'],{encoding:'utf8',timeout:5000}).trim(),'native-restart');
});
test('unit preserves established command options and startup hooks',()=>{
 const unit=db91ReleaseUnit();assert(unit.includes('--inspect=127.0.0.1:9229 --max-old-space-size=12288'));
 assert.equal((unit.match(/^ExecStartPre=.+$/gm)||[]).length,3);assert(!unit.includes(oldDb91Core));
 assert.equal((unit.match(/^ExecStartPre=-\+/gm)||[]).length,2,'Both established root prestart helpers retain their systemd identity prefix');
 assert(unit.includes('ExecStartPre=/opt/node-v22.23.1/bin/node'),'Session hotset prestart stays unprivileged');
 assert(!/Timeout|MemoryHigh|MemoryMax|CPUQuota/.test(unit));assert(unit.includes('KillMode=mixed'));
 assert.equal(db91SignalPolicy,'[Service]\nKillMode=mixed\nKillSignal=SIGUSR1\n');
 assert(!unit.includes('KillSignal='),'Ordinary service stops retain their original signal');
});
