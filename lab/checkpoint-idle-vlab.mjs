// Explicit, bounded native SQLite checkpoint; never delete a WAL file directly.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.version, 'v22.23.1');
const owner = process.argv[2]; assert(owner);
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, owner);
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim()); assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
assert.equal(env.OPENCLAW_STATE_DIR, base + '/state');
Object.assign(process.env, env);
const cfg = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)); assert.equal(cfg.gateway.port, 24993);
const {GatewayClient} = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
try {
  await new Promise((resolve, reject) => {
    client = new GatewayClient({url: 'ws://127.0.0.1:24993', token: cfg.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]), deviceIdentity: null, clientName: 'cli', mode: 'cli', scopes: ['operator.read'], onHelloOk: resolve, onConnectError: reject}); client.start();
  });
  const s = await client.request('vlab.workers.status', {});
  assert(!s.pending && s.workers.every(w => !w.activeCount && !w.queued && !w.detachedTaskCount), 'Shared Gateway busy');
} finally { client?.stop(); }
const path = base + '/state/agents/makaron/agent/openclaw-agent.sqlite';
assert.equal(fs.realpathSync(path), path); assert(fs.statSync(path).isFile());
const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
const uid = Number(status.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(status.match(/^Gid:\s+(\d+)/m)[1]);
assert(uid > 0 && gid > 0); process.setgroups([]); process.setgid(gid); process.setuid(uid);
const bytes = () => {const d = fs.statfsSync(base); return d.bavail * d.bsize;};
const before = bytes(), db = new DatabaseSync(path, {timeout: 0});
try {
  const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  assert.equal(result.busy, 0, 'Checkpoint busy: no manual truncation or retry');
  console.log(JSON.stringify({checkpoint: result, freeBefore: before, freeAfter: bytes(), logicalDataDeleted: false}));
} finally { db.close(); }
