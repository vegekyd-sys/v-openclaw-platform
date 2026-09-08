// Backup-directory only, never opens a live production database.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);process.umask(0o077);
const root=fs.realpathSync('/home/openclaw/.openclaw/backups/db91-production-parity-20260908');
const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));assert(manifest.exportSealedAt);
const allowed=new Set(['openclaw.sqlite','main.sqlite','xiaoai.sqlite','dealclaw.sqlite','short-v.sqlite','v-codex.sqlite','makaron.sqlite','global-state.sqlite','nightshift-state.sqlite']);
assert.equal(manifest.databases.length,9);
for(const record of manifest.databases){
 assert(allowed.has(record.file));const source=path.join(root,record.file),target=source+'.zst',partial=target+'.partial';
 assert.equal(fs.realpathSync(source),source);const before=fs.statSync(source);assert.equal(before.size,record.bytes);
 if(fs.existsSync(target)){execFileSync('zstd',['-q','--test',target]);console.log(JSON.stringify({file:record.file,reusedExistingFrame:true}));continue;}
 assert(!fs.existsSync(partial),'Inspect partial compression before retry');const space=fs.statfsSync(root);assert(space.bavail*space.bsize>record.bytes*1.02+2*1024**3);
 execFileSync('zstd',['-q','-T1','-1','--keep','-o',partial,source],{stdio:['ignore','ignore','pipe'],timeout:900000});
 const after=fs.statSync(source);assert.equal(after.ino,before.ino);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);
 execFileSync('zstd',['-q','--test',partial]);fs.renameSync(partial,target);
 console.log(JSON.stringify({file:record.file,bytes:before.size,compressedBytes:fs.statSync(target).size,sealedSourceUnchanged:true}));
}
