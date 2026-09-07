// Withdraw only this task's not-yet-activated restart hook. Never undo live code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const owner = 'codex-db91-contention-20260907';
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const evidence = root + '/state/db91-integrity-release-20260907';
const unit = 'openclaw-vlab-production-mirror-v8.service';
const dropin = '/etc/systemd/system/' + unit + '.d/95-db91-integrity.conf';
const read = p => JSON.parse(fs.readFileSync(p));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pid = () => Number(execFileSync('systemctl', ['show', unit, '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim());
assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.getuid(), 0);
assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner, owner);
const saved = read(evidence + '/manifest.json'); assert.equal(saved.owner, owner);
assert.equal(pid(), saved.gatewayPid, 'unexpected restart: inspect live patch before any unstage');
assert.equal(hash(root + '/state/openclaw.json'), saved.configSha);
for (const p of saved.files) {
  assert(p.filename.startsWith(root + '/runtime/npm-global/lib/node_modules/openclaw/dist/'));
  if (p.beforeSha === null) assert(!fs.existsSync(p.filename), 'patch already activated'); else assert.equal(hash(p.filename), p.beforeSha);
}
assert.equal(fs.readFileSync(dropin, 'utf8'), fs.readFileSync(evidence + '/dropin.staged.txt', 'utf8'));
fs.unlinkSync(dropin);
execFileSync('systemctl', ['daemon-reload']); assert.equal(pid(), saved.gatewayPid);
const result = {at: new Date().toISOString(), owner, gatewayPid: pid(), stagedRestartHookRemoved: true, nativeCodeUnchanged: true, configUnchanged: true, reason: 'user requires multi-project high-load write and chat acceptance before production'};
fs.writeFileSync(evidence + '/unstaged.json', JSON.stringify(result, null, 2), {mode: 0o600, flag: 'wx'});
console.log(JSON.stringify(result));
