// Real-dist probe for lab/release-files/async-writer-admission (run with Node 24 against a dist dir):
// while another process holds the Agent DB writer lease, a session-entry upsert must keep the event loop ticking.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const dist = process.argv[2];
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-e2e-'));
process.env.OPENCLAW_STATE_DIR = state; process.env.HOME = state;
const m = await import(path.join(dist, 'session-accessor.sqlite-entry-BlklNPKQ.js'));
const upsert = m.S;
const scope = {agentId: 'main', sessionKey: 'agent:main:main'};
await upsert(scope, {sessionId: crypto.randomUUID(), updatedAt: Date.now()});
const dbs = []; (function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.sqlite')) dbs.push(p);} })(state);
const dbPath = dbs.find(p => /agent/.test(p)) ?? dbs[0];
const coord = dbPath + '.session-writer-coordinator';
const holdMs = 600;
const child = spawn(process.execPath, ['--input-type=module', '-e', `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec('PRAGMA busy_timeout=5000; BEGIN EXCLUSIVE'); process.stdout.write('held\\n'); setTimeout(()=>{db.exec('ROLLBACK');db.close();}, ${holdMs});`, coord], {stdio:['ignore','pipe','inherit']});
const exited = new Promise(r => child.once('exit', r));
await new Promise(r => child.stdout.once('data', r));
let maxGap = 0, last = Date.now(), ticks = 0;
const timer = setInterval(() => { const t = Date.now(); maxGap = Math.max(maxGap, t - last); last = t; ticks++; }, 5);
const t0 = Date.now();
const entry = await upsert(scope, {updatedAt: Date.now(), label: 'second'});
const waited = Date.now() - t0;
clearInterval(timer); await exited;
const loaded = m.d(scope);
console.log(JSON.stringify({db: path.basename(dbPath), waitedMs: waited, maxLoopGapMs: maxGap, ticks, label: entry?.label ?? loaded?.label}));
