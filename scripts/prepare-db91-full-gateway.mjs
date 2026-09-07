// Move only the accepted private clone into the owned Gateway; source is untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
const fixture = root + '/tmp/full-native-v1';
assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.getuid(), 0);
const manifest = JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(manifest.owner, 'codex-db91-contention-20260907'); assert.equal(manifest.root, root);
assert.equal(execFileSync('systemctl', ['show', manifest.unit, '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim(), '0');
const report = JSON.parse(fs.readFileSync(fixture + '/report.json'));
assert(report.completeVLabSnapshot && report.schemaOwnerPreserved && report.reused.length === 6 && report.reused.every(r => r.stats.full === 0));
const source = fixture + '/state/agents/makaron/agent/openclaw-agent.sqlite';
const target = root + '/state/agents/makaron/agent/openclaw-agent.sqlite';
if (!fs.existsSync(target)) {
  assert.equal(spawnSync('fuser', [source]).status, 1);
  fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o700});
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(source + suffix)) fs.renameSync(source + suffix, target + suffix);
  fs.writeFileSync(fixture + '/gateway-clone-location.json', JSON.stringify({at: new Date().toISOString(), movedFrom: source, target, originalSource: report.source.source, originalUntouched: true}), {mode: 0o600});
} else {
  const moved = JSON.parse(fs.readFileSync(fixture + '/gateway-clone-location.json')); assert.equal(moved.target, target);
}
for (const name of ['openclaw.json', 'worker-openclaw.json']) {
  const file = root + '/state/' + name, original = fs.readFileSync(file, 'utf8'), config = JSON.parse(original);
  config.agents.entries.makaron = {...config.agents.entries.lab, name: 'Full VLab DB Acceptance', agentDir: root + '/state/agents/makaron/agent'};
  // The real snapshot is exercised through new explicitly named test sessions;
  // scheduled work and channel bindings remain disabled by the base profile.
  assert.equal(config.cron.enabled, false); assert.equal(config.browser.enabled, false); assert.equal(Object.keys(config.channels).length, 0);
  fs.writeFileSync(root + '/tmp/full-gateway-config-before-' + Date.now() + '-' + name, original, {mode: 0o600});
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
}
execFileSync('chown', ['-R', manifest.user + ':' + manifest.user, root + '/state/agents/makaron']);
console.log(JSON.stringify({owner: manifest.owner, fullDb: target, bytes: fs.statSync(target).size, agentId: 'makaron', channelsEnabled: false, originalSourceUntouched: true}));
