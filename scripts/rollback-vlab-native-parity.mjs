import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { patchChannelRegistry, marker } from './patch-worker-channel-registry.mjs';

// Lab-only surgical rollback: preserve unrelated configuration/model changes.
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const mode = process.argv[2];
assert(['--check', '--apply'].includes(mode), 'Expected --check or --apply');
const generation = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const previous = '/opt/vlab/experiments/worker-openclaw91-transcript-v1';
const candidate = '/opt/vlab/experiments/worker-native-parity-v1';
assert(fs.existsSync(previous + '/worker.mjs'));
const dist = generation + '/runtime/npm-global/lib/node_modules/openclaw/dist';
const backups = fs.readdirSync(dist).filter(name => name.endsWith('.' + marker + '.bak'));
assert.equal(backups.length, 1, 'Expected one registry patch backup');
const backup = path.join(dist, backups[0]);
const core = backup.slice(0, -('.' + marker + '.bak').length);
const original = fs.readFileSync(backup, 'utf8');
const current = fs.readFileSync(core, 'utf8');
assert.equal(current, patchChannelRegistry(original), 'Core changed since patch: do not overwrite another experiment');
const plans = [{ file: core, changed: original }];
for (const file of [generation + '/state/openclaw.json', generation + '/experiments/agent-worker-isolation-v1/worker-openclaw.json']) {
  const raw = fs.readFileSync(file, 'utf8');
  assert(raw.includes(candidate), 'Worker path drift: review manually');
  const changed = raw.replaceAll(candidate, previous);
  JSON.parse(changed);
  plans.push({ file, changed });
}
for (const plan of plans) plan.stat = fs.statSync(plan.file);
if (mode === '--apply') {
  // Back up every current file first. No bulk config restore or data deletion.
  for (const plan of plans) fs.copyFileSync(plan.file, plan.file + '.parity-rollback-' + process.pid, fs.constants.COPYFILE_EXCL);
  for (const plan of plans) {
    const temporary = plan.file + '.parity-rollback-tmp-' + process.pid;
    fs.writeFileSync(temporary, plan.changed, { flag: 'wx', mode: plan.stat.mode & 0o777 });
    fs.chownSync(temporary, plan.stat.uid, plan.stat.gid);
    fs.renameSync(temporary, plan.file);
  }
}
console.log(JSON.stringify({ mode, files: plans.length, restartRequired: mode === '--apply', modelPreserved: true }));
