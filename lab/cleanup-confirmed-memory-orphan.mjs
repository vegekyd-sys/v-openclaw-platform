import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {processReferences,diskUsage} from '/usr/local/lib/v-storage-governance/core.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes('memory-orphan-cleanup-20260911'));
const main='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
const orphan=main+'.memory-reindex-44edaec4-3a53-4c48-a975-46702df5deee';
const paths=[orphan,orphan+'-wal',orphan+'-shm'];
assert(fs.statSync(main).size>8e9,'Published database no longer matches reviewed state');
const stats=paths.map(p=>{const s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink());assert.equal(s.nlink,1);return s;});
assert.equal(stats[0].ino,6959670);assert.equal(stats[0].size,5711929344);assert.equal(Math.floor(stats[0].mtimeMs/1000),1789057581);assert.equal(stats[1].size,0);
assert.equal(processReferences(paths).length,0,'Orphan is in use');
const report={at:new Date().toISOString(),reason:'Aborted unpublished memory-only reindex; published full index retained',files:paths.map((path,i)=>({path,size:stats[i].size,ino:stats[i].ino})),before:diskUsage('/')};
fs.writeFileSync('/var/lib/v-storage-governance/memory-orphan-cleanup-20260911.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
assert.equal(processReferences(paths).length,0);
for(let i=paths.length-1;i>=0;i--){const s=fs.lstatSync(paths[i]);assert.equal(s.ino,stats[i].ino);assert.equal(s.size,stats[i].size);assert.equal(s.mtimeMs,stats[i].mtimeMs);fs.unlinkSync(paths[i]);}
console.log(JSON.stringify({removedBytes:stats.reduce((n,s)=>n+s.blocks*512,0),remainingPublishedBytes:fs.statSync(main).size,after:diskUsage('/')}));
