import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';
import {replacePublicCode} from './db91-firstword-files.mjs';
test('apply and rollback preserve executable code readability under service umask',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'db91-firstword-files-'));
 const file=path.join(dir,'index.mjs');fs.writeFileSync(file,'before');fs.chmodSync(file,0o644);
 const stat=fs.statSync(file),metadata={mode:stat.mode&0o777,uid:stat.uid,gid:stat.gid};
 const mask=process.umask(0o077);
 try{
  for(const bytes of ['after','before']){
   replacePublicCode(file,Buffer.from(bytes),metadata);
   assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.statSync(file).mode&0o777,0o644);
   assert.equal(fs.statSync(file).uid,stat.uid);
  }
 }finally{process.umask(mask);fs.rmSync(dir,{recursive:true});}
});
