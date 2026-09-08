import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readAheadDatabase,patchVerificationWorker} from './read-ahead.mjs';
test('disabled default never touches disk',async()=>assert.deepEqual(await readAheadDatabase('/missing',{env:{}}),{enabled:false}));
test('read-ahead preserves bytes and rejects escaped and symlink targets',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'db91-read-ahead-')));const dir=path.join(root,'agents','test','agent');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'openclaw-agent.sqlite');const data=Buffer.alloc(2*1024*1024,37);fs.writeFileSync(file,data);
 const env={OPENCLAW_DB91_READ_AHEAD_ENABLE:'1',OPENCLAW_DB91_INTEGRITY_STATE_ROOT:root};
 try{
  assert.equal((await readAheadDatabase(file,{env,minBytes:1})).bytes,data.length);assert(fs.readFileSync(file).equals(data));
  assert.equal((await readAheadDatabase(file,{env})).skippedSmall,true);
  await assert.rejects(()=>readAheadDatabase('/tmp/not-owned.sqlite',{env,minBytes:1}));
  const link=path.join(dir,'link.sqlite');fs.symlinkSync(file,link);await assert.rejects(()=>readAheadDatabase(link,{env,minBytes:1}));
 }finally{fs.rmSync(root,{recursive:true});}
});
test('patch keeps full verification exactly once and runs pre-read before identity capture',()=>{
 const source='\t\t\tconst db91FileIdentity = db91Direct ? db91CaptureNative(target.path) : null;\n\t\t\tintegrity.assertSqliteIntegrity(database, target.label);';
 const result=patchVerificationWorker(source);
 assert.equal(result.split('integrity.assertSqliteIntegrity(database, target.label);').length,2);
 assert(result.indexOf('await readAheadDatabase')<result.indexOf('db91CaptureNative'));
 assert.throws(()=>patchVerificationWorker('changed'));
});
