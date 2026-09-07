// Isolated native 9.1 process, synthetic state only. Used by native-acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const [core, root, mode = 'read'] = process.argv.slice(2);
const rows = Number(process.env.DB91_SYNTHETIC_ROWS ?? 8192);
assert([8192, 32768].includes(rows));
assert(root.startsWith('/srv/vlab-production-mirror/labs/instances/db91-fix/tmp/native-gate-'));
assert.equal(process.env.OPENCLAW_STATE_DIR, root + '/state');
const dist = path.join(core, 'dist');
const candidates = fs.readdirSync(dist).filter(n => n.startsWith('openclaw-agent-db-') && n.endsWith('.js') && fs.readFileSync(path.join(dist, n), 'utf8').includes('function openOpenClawAgentDatabase('));
assert.equal(candidates.length, 1);
const file = path.join(dist, candidates[0]);
const src = fs.readFileSync(file, 'utf8');
const mod = await import(pathToFileURL(file).href);
const get = name => mod[src.slice(src.lastIndexOf('export {')).match(new RegExp('\\b' + name + ' as (\\w+)'))[1]];
const gate = await import(pathToFileURL(path.join(dist, 'db91-integrity-gate.mjs')).href);
const started = performance.now();
const opened = get('openOpenClawAgentDatabase')({agentId: 'db91synthetic', agentDir: root + '/state/agents/db91synthetic/agent', env: process.env});
const elapsedMs = performance.now() - started;
if (mode === 'create') {
  opened.db.exec('CREATE TABLE db91_fixture_parent(id INTEGER PRIMARY KEY, payload TEXT); CREATE TABLE db91_fixture_child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES db91_fixture_parent(id)); BEGIN IMMEDIATE');
  const insert = opened.db.prepare('INSERT INTO db91_fixture_parent VALUES(?, ?)');
  const payload = 'db91-synthetic-'.repeat(2048);
  for (let i = 0; i < rows; i++) insert.run(i, payload);
  opened.db.exec('INSERT INTO db91_fixture_child VALUES(1,1); COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
}
assert.equal(opened.db.prepare('SELECT count(*) AS n FROM db91_fixture_parent').get().n, rows);
assert.equal(opened.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
assert.throws(() => opened.db.exec('INSERT INTO db91_fixture_child VALUES(99,999999)'), /FOREIGN KEY/i);
get('closeOpenClawAgentDatabases')();
console.log(JSON.stringify({mode, elapsedMs, bytes: fs.statSync(opened.path).size, stats: gate.getIntegrityGateStats(), rows, foreignKeysEnforced: true}));
