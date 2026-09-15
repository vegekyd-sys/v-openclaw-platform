import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import zlib from 'node:zlib';
const decoded=archive=>archive.encoding==='zstd'?zlib.zstdDecompressSync(archive.bytes):Buffer.from(archive.bytes);
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const shared=path.dirname(process.env.VLAB_SHARED_STATE_DIR)+'/runtime';
process.env.OPENCLAW_READONLY_INITIALIZATION_CACHE='1';
const databasePath=process.env.VLAB_SHARED_STATE_DIR+'/agents/makaron/agent/openclaw-agent.sqlite';
const options={agentId:'makaron',path:databasePath};
const readonly=await import(runtime+'/openclaw/dist/openclaw-agent-db-readonly-wb-jdztx.js');
const snapshot=await import(runtime+'/openclaw/dist/session-accessor.sqlite-delete-snapshot-D_8sMB0n.js');
const before=await import(shared+'/openclaw/dist/config/sessions/session-accessor.sqlite-archive.worker.js');
const after=await import(runtime+'/openclaw/dist/nightshift-session-archive.worker.js');
const archiveDirectory=process.env.VLAB_CANDIDATE_DATA+'/archive-proof';
const sessionId='b7b87800-510c-433f-8e3c-0af83d748c03';
const input=readonly.n(database=>({snapshot:snapshot.t(database.db,sessionId),inTransaction:database.db.isTransaction,events:database.db.prepare('SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq ASC').all(sessionId).map(r=>r.event_json)}),options);
assert(input.found&&input.value.inTransaction&&input.value.events.length>0);
const plan={agentId:'makaron',databasePath,archiveDirectory,sessionId,snapshot:input.value.snapshot,reason:'deleted'};
test('reproduces the live cached-read-only nested BEGIN failure',async()=>{
 await assert.rejects(before.materializeTranscriptArchiveInWorker(plan),/cannot start a transaction within a transaction/);
});
test('archives real historical transcript bytes inside the existing read snapshot',async()=>{
 const value=await after.materializeTranscriptArchiveInWorker(plan);
 assert.equal(value.sessionId,sessionId);assert(['zstd','identity'].includes(value.archive.encoding));
 const expected=Buffer.from(input.value.events.join('\n')+'\n');
 assert.deepEqual(decoded(value.archive),expected);
 assert.equal(value.archive.sha256,createHash('sha256').update(value.archive.bytes).digest('hex'));
 assert.equal(fs.readdirSync(archiveDirectory).length,0);
 console.log(JSON.stringify({event:'real-readonly-archive',rows:input.value.events.length,bytes:expected.length,sha256:value.archive.sha256,sharedWrites:0}));
});
test('changed snapshot still rejects without publishing or leaving staged files',async()=>{
 await assert.rejects(after.materializeTranscriptArchiveInWorker({...plan,snapshot:{...plan.snapshot,transcriptUpdatedAt:(plan.snapshot.transcriptUpdatedAt??0)+1}}),/state changed before archive/);
 assert.equal(fs.readdirSync(archiveDirectory).length,0);
 const current=readonly.n(db=>snapshot.t(db.db,sessionId),options);assert.deepEqual(current.value,plan.snapshot);
});
test('uncached read-only access still opens and releases its own archive snapshot',async()=>{
 process.env.OPENCLAW_READONLY_INITIALIZATION_CACHE='0';
 const value=await after.materializeTranscriptArchiveInWorker(plan);assert.equal(decoded(value.archive).length,Buffer.byteLength(input.value.events.join('\n')+'\n'));
 assert.equal(fs.readdirSync(archiveDirectory).length,0);
});

test('native parent launches the corrected worker and returns byte-identical materialized plans',async()=>{
 process.env.OPENCLAW_READONLY_INITIALIZATION_CACHE='1';
 const parent=await import(runtime+'/openclaw/dist/session-accessor.sqlite-archive-CuBPV-IT.js');
 const values=await parent.r([{...plan,archiveTranscript:true}]);
 assert.equal(values.length,1);assert.equal(values[0].sessionId,sessionId);
 assert.deepEqual(decoded(values[0].archive),Buffer.from(input.value.events.join('\n')+'\n'));
 assert.equal(fs.readdirSync(archiveDirectory).length,0);
});
