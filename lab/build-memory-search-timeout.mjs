import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {patchMemorySearchTimeout} from './patch-memory-search-timeout.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),target='openclaw/dist/tools-Byg09TOP.js';
const snapshot=JSON.parse(execFileSync(process.execPath,['/Users/tianyicai/vlab-dev/lab/vlab.mjs','read-code','--target',target],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000}));
const source=Buffer.from(snapshot.content,'base64').toString('utf8'),sha=x=>createHash('sha256').update(x).digest('hex');if(sha(source)!==snapshot.sha256)throw new Error('Source checksum mismatch');
const candidate=patchMemorySearchTimeout(source);fs.writeFileSync(path.join(dir,'release-files/memory-search-timeout-tools.js'),candidate);
fs.writeFileSync(path.join(dir,'memory-search-timeout-plan.json'),JSON.stringify({baseRelease:snapshot.current.release,files:[{source:'lab/release-files/memory-search-timeout-tools.js',target,before:snapshot.sha256}]},null,2)+'\n');
console.log(JSON.stringify({baseRelease:snapshot.current.release,before:snapshot.sha256,after:sha(candidate)}));
