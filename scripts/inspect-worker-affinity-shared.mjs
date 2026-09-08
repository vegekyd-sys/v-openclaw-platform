import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash}from'node:crypto';import{execFileSync}from'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const lease=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json'));assert.equal(lease.owner,'codex-db91-contention-20260907');
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const worker=cfg.plugins.load.paths.find(p=>p.includes('worker-v-platform-'));assert(worker?.startsWith(root));
const stat=fs.statfsSync(root),pool=worker+'/worker-pool.mjs';
console.log(JSON.stringify({root,worker,poolSha:createHash('sha256').update(fs.readFileSync(pool)).digest('hex'),poolBytes:fs.statSync(pool).size,
 databaseBytes:fs.statSync(root+'/state/agents/makaron/agent/openclaw-agent.sqlite').size,
 diskAvailable:stat.bavail*stat.bsize,memAvailable:fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:.*$/m)?.[0],
 workerConfig:cfg.plugins.entries['vlab-agent-worker-isolation'].config,mainMax:cfg.agents.defaults.maxConcurrent,reload:cfg.gateway.reload,
 mcp:Object.entries(cfg.mcp?.servers??{}).map(([name,s])=>({name,enabled:s.enabled,transport:s.transport,url:s.url?new URL(s.url).origin+new URL(s.url).pathname:undefined})),
 flags:execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','CPUQuotaPerSecUSec','-p','MemoryHigh','-p','MemoryMax','-p','MainPID'],{encoding:'utf8'}).trim()}));
