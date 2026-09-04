import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const action = process.argv[2];
assert(['enable', 'restore'].includes(action));
const file = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/openclaw.json';
const saved = `${file}.vlab91-codex-dm-binding.json`;
const config = JSON.parse(fs.readFileSync(file));
assert.equal(config.channels.feishu.appId, '${VLAB_FEISHU_APP_ID}');
const peer = 'ou_775a78b0aaae67da5e15eeaf102e3cd9';
const matches = config.bindings.filter(binding => binding.match?.channel === 'feishu' && binding.match?.peer?.id === peer);
assert.equal(matches.length, 1, 'Expected exactly the existing VLab test DM binding');
const binding = matches[0];
if (action === 'enable') {
  assert(['makaron', 'v-codex'].includes(binding.agentId));
  if (fs.existsSync(saved)) {
    const original = JSON.parse(fs.readFileSync(saved));
    assert.equal(original.agentId, 'makaron');
    assert.deepEqual(binding.match, original.match);
  } else {
    fs.writeFileSync(saved, JSON.stringify(binding), { flag: 'wx', mode: 0o600 });
  }
  binding.agentId = 'v-codex';
} else {
  const original = JSON.parse(fs.readFileSync(saved));
  assert.equal(original.agentId, 'makaron');
  assert(['makaron', 'v-codex'].includes(binding.agentId));
  assert.deepEqual(binding.match, original.match);
  // Restore this one route only, never overwrite intervening config edits.
  binding.agentId = original.agentId;
}
const info = fs.statSync(file);
const tmp = `${file}.codex-dm.tmp`;
fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: info.mode & 0o777 });
fs.chownSync(tmp, info.uid, info.gid);
fs.renameSync(tmp, file);
console.log(JSON.stringify({ action, changedBindings: 1, agentId: binding.agentId, productionChanged: false }));
