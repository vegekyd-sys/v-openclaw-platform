// Run the existing native two-process CAS regression against the full VLab DB.
// No model call, no independent Gateway, only one dedicated test session.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const owner = process.argv[2];
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, owner);
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const disk = fs.statfsSync(base); assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3);
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim()); assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
Object.assign(process.env, env);
assert.equal(env.OPENCLAW_STATE_DIR, base + '/state');
assert.equal(JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)).gateway.port, 24993);
process.env.OPENCLAW_PACKAGE_ROOT = base + '/runtime/openclaw';
const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
const uid = Number(status.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(status.match(/^Gid:\s+(\d+)/m)[1]);
assert(uid > 0 && gid > 0, 'Gateway must not run as root');
process.setgroups([]); process.setgid(gid); process.setuid(uid);
process.argv = [process.argv[0], process.argv[1], 'sqlite', 'success'];
await import('../scripts/probe-openclaw91-session-races.mjs');
