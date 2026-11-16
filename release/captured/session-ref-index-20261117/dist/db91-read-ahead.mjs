// Read-ahead changes I/O order, never the mandatory native integrity check.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const MIN_BYTES=32*1024*1024;
export async function readAheadDatabase(filename,{env=process.env,minBytes=MIN_BYTES}={}){
  if(env.OPENCLAW_DB91_READ_AHEAD_ENABLE!=='1')return {enabled:false};
  const root=env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT;
  assert(root&&path.isAbsolute(root)&&path.isAbsolute(filename));
  assert(filename.startsWith(path.join(root,'agents')+'/'),'Read-ahead must stay inside explicit agent state');
  assert.equal(fs.realpathSync(filename),filename);
  const stat=fs.lstatSync(filename);assert(stat.isFile()&&!stat.isSymbolicLink());
  if(stat.size<minBytes)return {enabled:true,skippedSmall:true,bytes:0,ms:0};
  const start=performance.now();let bytes=0;
  // A single bounded buffer streams one target immediately before its existing
  // full verifier. Do not hold the complete database in JS memory or scan all
  // agents ahead of time, which would evict the first agent from page cache.
  const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const opened=fs.fstatSync(fd);assert.equal(opened.ino,stat.ino);assert.equal(opened.dev,stat.dev);
    const stream=fs.createReadStream(filename,{fd,autoClose:false,highWaterMark:1024*1024});
    for await(const chunk of stream)bytes+=chunk.length;
    const after=fs.lstatSync(filename);
    assert.equal(after.ino,opened.ino,'Database replaced during read-ahead');
    assert.equal(after.dev,opened.dev,'Database device changed during read-ahead');
    // Concurrent ordinary writes remain legal; the native verifier captures its
    // own identity and read transaction AFTER this performance-only pre-read.
    return {enabled:true,bytes,ms:Math.round(performance.now()-start)};
  }finally{fs.closeSync(fd);}
}

export function patchVerificationWorker(source){
  const before='\t\t\tconst db91FileIdentity = db91Direct ? db91CaptureNative(target.path) : null;';
  assert.equal(source.split(before).length,2,'Verification worker anchor drift');
  source=source.replace(before,'\t\t\tconst db91ReadAhead = db91Direct ? await readAheadDatabase(target.path) : {enabled:false};\n'+before);
  const verify='\t\t\tintegrity.assertSqliteIntegrity(database, target.label);';
  assert.equal(source.split(verify).length,2);
  source=source.replace(verify,'\t\t\tconst db91ScanStarted = performance.now();\n'+verify+'\n\t\t\tconst db91ScanMs = Math.round(performance.now()-db91ScanStarted);\n\t\t\tif(process.env.OPENCLAW_DB91_PHASE_TRACE===\'1\')console.error(\'[parity-native-verify] \'+JSON.stringify({agent:target.path.split(\'/\').at(-3),scanMs:db91ScanMs,readAhead:db91ReadAhead}));');
  return 'import {readAheadDatabase} from "../db91-read-ahead.mjs";\n'+source;
}
