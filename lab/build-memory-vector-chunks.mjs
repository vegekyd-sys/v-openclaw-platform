// Mechanical artifact generation from the configured read-only code endpoint.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {patchMemoryVectorChunks} from './patch-memory-vector-chunks.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),target='openclaw/dist/extensions/memory-core/manager-runtime.js';
const snapshot=JSON.parse(execFileSync(process.execPath,['/Users/tianyicai/vlab-dev/lab/vlab.mjs','read-code','--target',target],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000}));
const source=Buffer.from(snapshot.content,'base64').toString('utf8');const sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(source)!==snapshot.sha256)throw new Error('Source checksum mismatch');
const candidate=patchMemoryVectorChunks(source);fs.writeFileSync(path.join(dir,'release-files/memory-vector-chunks-manager.js'),candidate);
fs.writeFileSync(path.join(dir,'memory-vector-chunks-plan.json'),JSON.stringify({baseRelease:snapshot.current.release,files:[{source:'lab/release-files/memory-vector-chunks-manager.js',target,before:snapshot.sha256}]},null,2)+'\n');
console.log(JSON.stringify({baseRelease:snapshot.current.release,before:snapshot.sha256,after:sha(candidate)}));
