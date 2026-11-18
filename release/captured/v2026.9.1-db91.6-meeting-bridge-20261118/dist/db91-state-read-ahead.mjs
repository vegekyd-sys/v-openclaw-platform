// Performance only: warm the main file BEFORE acquiring state-lifecycle.
// Ownership admission, sidecar recovery and full native verification stay intact.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export function preReadState(filename, env=process.env) {
  if(env.OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE!=='1') return {enabled:false};
  const root=env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT;
  assert(root&&path.isAbsolute(root));
  assert.equal(filename,path.join(root,'state','openclaw.sqlite'));
  if(!fs.existsSync(filename)) return {enabled:true,absent:true};
  assert.equal(fs.realpathSync(filename),filename);
  const stat=fs.lstatSync(filename);assert(stat.isFile()&&!stat.isSymbolicLink());
  if(stat.size<32*1024*1024||stat.size>1024*1024*1024) return {enabled:true,skippedSize:true};
  const started=performance.now();let bytes=0;
  const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const opened=fs.fstatSync(fd);assert.equal(opened.ino,stat.ino);assert.equal(opened.dev,stat.dev);
    const buffer=Buffer.allocUnsafe(1024*1024);
    // Read only the initial length: ongoing writes cannot extend this loop.
    while(bytes<opened.size){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,opened.size-bytes),bytes);if(!n)break;bytes+=n;}
  } finally {fs.closeSync(fd);}
  // No validation result is cached or inferred from this untrusted pre-read.
  const result={enabled:true,bytes,ms:Math.round(performance.now()-started)};
  if(env.OPENCLAW_DB91_PHASE_TRACE==='1')process.stderr.write('[parity-state-read-ahead] '+JSON.stringify({pid:process.pid,at:Date.now(),...result})+'\n');
  return result;
}

export function patchStateReadAhead(source){
  assert(!source.includes('preReadState'),'Already patched');
  const anchor='\t\tunpublished = runWithOpenClawStateWriteAccess({';
  assert.equal(source.split(anchor).length,2,'State open anchor drift');
  return 'import {preReadState} from "./db91-state-read-ahead.mjs";\n'+source.replace(anchor,'\t\tpreReadState(pathname, env);\n'+anchor);
}
