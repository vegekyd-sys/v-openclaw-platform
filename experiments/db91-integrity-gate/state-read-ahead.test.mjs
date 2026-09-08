import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preReadState,patchStateReadAhead} from './state-read-ahead.mjs';
test('disabled is a no-op; patch preserves native operation and rejects drift',()=>{
  assert.deepEqual(preReadState('/not-a-file',{}),{enabled:false});
  const source='before\n\t\tunpublished = runWithOpenClawStateWriteAccess({\n nativeFullIntegrity(); });';
  const patched=patchStateReadAhead(source);
  assert(patched.includes('nativeFullIntegrity();'));
  assert(patched.indexOf('preReadState(pathname, env)')<patched.indexOf('unpublished ='));
  assert.throws(()=>patchStateReadAhead(patched));assert.throws(()=>patchStateReadAhead('drift'));
});
test('read-only bounded pre-read is not a corruption certificate',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'db91-state-read-')));
  try{
    fs.mkdirSync(path.join(root,'state'));const filename=path.join(root,'state','openclaw.sqlite');
    const fd=fs.openSync(filename,'wx');fs.ftruncateSync(fd,32*1024*1024);fs.closeSync(fd);
    const env={OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE:'1',OPENCLAW_DB91_INTEGRITY_STATE_ROOT:root};
    const before=fs.statSync(filename);assert.equal(preReadState(filename,env).bytes,before.size);
    assert.equal(fs.statSync(filename).mtimeMs,before.mtimeMs);
    assert.throws(()=>preReadState(path.join(root,'other'),env));
    fs.renameSync(filename,filename+'.real');fs.symlinkSync(filename+'.real',filename);
    assert.throws(()=>preReadState(filename,env));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
