// Read-only production log audit. Never prints raw logs, URLs, credentials or bodies.
import {execFileSync} from 'node:child_process';
const ssh=['-S','none','-o','ProxyCommand=/usr/local/bin/tailscale nc 100.82.39.107 22','-o','HostKeyAlias=100.82.39.107','-i','/Users/tianyicai/.ssh/v-zkda-20260719','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=10','ubuntu@100.82.39.107'];
const source=process.argv.includes('--config')?String.raw`
import fs from 'node:fs';import {createHash} from 'node:crypto';
const env=Object.fromEntries(fs.readFileSync('/proc/2725163/environ','utf8').split('\0').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
const p=env.OPENCLAW_CONFIG_PATH??((env.OPENCLAW_STATE_DIR??env.HOME+'/.openclaw')+'/openclaw.json');
const c=JSON.parse(fs.readFileSync(p,'utf8'));
console.log(JSON.stringify({configPath:p,mcp:Object.entries(c.mcp?.servers??{}).map(([name,v])=>({name,enabled:v.enabled,type:v.type,connectionTimeoutMs:v.connectionTimeoutMs,requestTimeoutMs:v.requestTimeoutMs,timeout:v.timeout,connectionScope:v.connectionScope,transport:v.command?'stdio':v.url?'url':'unspecified',executable:v.command?String(v.command).split('/').at(-1):undefined})),toolSearchEnabled:c.tools?.toolSearch?.enabled}));
console.log(JSON.stringify({voiceMemoryScript:(c.mcp?.servers?.['voice-memory']?.args??[]).filter(x=>typeof x==='string'&&x.startsWith('/')&&/\.(mjs|cjs|js)$/.test(x))}));
const workerConfigs=new Map();for(const pid of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{
 const argv=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');if(!argv.includes('/worker.mjs'))continue;
 const e=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
 const file=e.OPENCLAW_CONFIG_PATH;if(!file)continue;const w=JSON.parse(fs.readFileSync(file,'utf8'));
 const prior=workerConfigs.get(file)??{configPath:file,pids:[],mcp:Object.entries(w.mcp?.servers??{}).map(([name,v])=>({name,enabled:v.enabled,requestTimeoutMs:v.requestTimeoutMs}))};prior.pids.push(Number(pid));workerConfigs.set(file,prior);
}catch{}}
console.log(JSON.stringify({workerConfigs:[...workerConfigs.values()]}));
`:String.raw`
import fs from 'node:fs';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
const rows=[];let total=0,inWindow=0,prep=0,minTime,maxTime;const mcpOutside=[];
for await(const line of readline.createInterface({input:fs.createReadStream('/tmp/openclaw/openclaw-2026-09-08.log')})){
 let d;try{d=JSON.parse(line)}catch{continue}
 const at=d.time??'';total++;if(!minTime||at<minTime)minTime=at;if(!maxTime||at>maxTime)maxTime=at;
 const s=[d['0'],d['1'],d['2'],d['3']].filter(x=>typeof x==='string').join(' ');
 const t=Date.parse(at);if(t<Date.parse('2026-09-08T09:00:00+08:00')||t>=Date.parse('2026-09-08T12:00:00+08:00')){if(s.includes('bundle-mcp:'))mcpOutside.push(at);continue}inWindow++;if(s.includes('prep stages:'))prep++;
 if(!s.includes('bundle-mcp:'))continue;
 const server=s.match(/server "([^"]+)"/);const timeout=s.match(/within ([\d.]+)s/);
 rows.push({at,trace:d.traceId,span:d.spanId,server:server?(['figma','universal-memory'].includes(server[1])?server[1]:hash(server[1])):null,
 action:s.includes('failed to start')?'start-failed':s.includes('failed to refresh')?'refresh-failed':s.includes('closed;')?'closed':'other',
 timeout:/timed out|Request timed out|timeout/i.test(s),initialize:s.includes('initialize'),seconds:timeout?Number(timeout[1]):null,
 unauthorized:/unauthorized|\b401\b|\b403\b/i.test(s),connectionError:/ECONN|ENOTFOUND|fetch failed/.test(s)});
}
console.log(JSON.stringify({total,inWindow,prep,minTime,maxTime,mcpOutside,count:rows.length,rows}));
`;
process.stdout.write(execFileSync('ssh',[...ssh,'sudo node --input-type=module'],{input:source,encoding:'utf8',timeout:45000,maxBuffer:2*1024**2}));
