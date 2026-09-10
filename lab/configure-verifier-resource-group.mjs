// Opt in only the leased shared VLab service. Never changes parent resource limits.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [owner, mode = 'check'] = process.argv.slice(2);
assert(['check', 'apply', 'restore'].includes(mode));
assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.getuid(), 0);
const base = '/srv/vlab-production-mirror/labs';
assert.equal(JSON.parse(fs.readFileSync(base + '/control/integration.json')).owner, owner);
const lock = base + '/control/operation.lock';
fs.mkdirSync(lock, {mode: 0o700});
fs.writeFileSync(lock + '/pid', String(process.pid));
try {
assert(!fs.existsSync(base + '/shared-workflow/pending.json'), 'Unfinished deployment');
const current = JSON.parse(fs.readFileSync(base + '/shared-workflow/current.json'));
assert(['concurrency-exact-sharing-v3', 'concurrency-verifier-resource-v1'].includes(current.release), 'Unexpected live candidate');
const service = 'openclaw-vlab-production-mirror-v8.service';
const show = key => execFileSync('systemctl', ['show', service, '-p', key, '--value'], {encoding: 'utf8'}).trim();
assert.equal(show('User'), 'lab-db91-parity');
assert.equal(show('MemoryHigh'), String(12 * 1024 ** 3)); assert.equal(show('MemoryMax'), String(14 * 1024 ** 3));
const directory = '/etc/systemd/system/' + service + '.d';
const filename = directory + '/70-verifier-resource-group.conf';
const content = '[Service]\nDelegate=memory\nDelegateSubgroup=foreground\nEnvironment=OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP=1\n';
const sha = createHash('sha256').update(content).digest('hex');
if (fs.existsSync(directory)) assert.equal(fs.realpathSync(directory), directory);
if (fs.existsSync(filename)) {assert.equal(fs.realpathSync(filename), filename); assert.equal(fs.readFileSync(filename, 'utf8'), content, 'Refuse unrelated drop-in');}
if (mode === 'apply') {
  fs.mkdirSync(directory, {recursive: true});
  if (!fs.existsSync(filename)) fs.writeFileSync(filename, content, {flag: 'wx', mode: 0o644});
  execFileSync('systemctl', ['daemon-reload']);
  assert.equal(show('DelegateSubgroup'), 'foreground');
} else if (mode === 'restore' && fs.existsSync(filename)) {
  const backup = base + '/control/verifier-resource-group-disabled-' + Date.now() + '.conf';
  fs.renameSync(filename, backup); execFileSync('systemctl', ['daemon-reload']);
  console.log(JSON.stringify({recoverableDropIn: backup}));
}
console.log(JSON.stringify({mode, service, dropIn: filename, sha256: sha, parentMemoryHigh: show('MemoryHigh'), parentMemoryMax: show('MemoryMax'), restartPerformed: false}));
} finally {
  fs.unlinkSync(lock + '/pid'); fs.rmdirSync(lock);
}
