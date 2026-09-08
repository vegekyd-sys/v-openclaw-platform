// Negative controls exercise the actual installed native checker, not a mock.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const instance='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.env.OPENCLAW_STATE_DIR,instance+'/state');
const root=fs.mkdtempSync(instance+'/tmp/native-preread-negative-');
fs.mkdirSync(root+'/state');const filename=root+'/state/openclaw.sqlite';
const {preReadState}=await import(instance+'/runtime/openclaw/dist/db91-state-read-ahead.mjs');
const {t:check}=await import(instance+'/runtime/openclaw/dist/sqlite-integrity-BBPyeEpy.js');
const env={OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE:'1',OPENCLAW_DB91_INTEGRITY_STATE_ROOT:root};
let db=new DatabaseSync(filename);
db.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY);CREATE TABLE child(id INTEGER REFERENCES parent(id));CREATE TABLE payload(data BLOB);INSERT INTO payload VALUES(zeroblob(33554432));');
check(db,'private-negative-control');db.close();
const healthy=preReadState(filename,env);assert(healthy.bytes>=33554432);
db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=OFF;INSERT INTO child VALUES(999);');db.close();
preReadState(filename,env);db=new DatabaseSync(filename);
assert.throws(()=>check(db,'private-negative-control'),e=>e.name==='SqliteIntegrityError');
db.exec('DELETE FROM child');check(db,'private-negative-control');db.close();
// A broken b-tree page still passes a byte pre-read, but MUST fail verification.
const fd=fs.openSync(filename,'r+');fs.writeSync(fd,Buffer.alloc(100,255),0,100,4096);fs.closeSync(fd);
preReadState(filename,env);db=new DatabaseSync(filename);
assert.throws(()=>check(db,'private-negative-control'));db.close();
const report={root,healthyBytes:healthy.bytes,nativeFullCheck:true,foreignKeyDamageRejected:true,physicalDamageRejected:true,productionDataUsed:false};
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
