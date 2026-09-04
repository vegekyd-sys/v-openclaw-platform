import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const base = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const files = ['state/openclaw.json', 'experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const entries = files.map(relative => {
  const path = `${base}/${relative}`;
  const before = fs.readFileSync(path, 'utf8');
  const config = JSON.parse(before);
  assert.equal(config.channels.feishu.appId, '${VLAB_FEISHU_APP_ID}');
  assert(config.messages?.visibleReplies === undefined || config.messages.visibleReplies === 'automatic', 'Unexpected explicit source reply policy');
  assert(config.messages?.groupChat?.visibleReplies === undefined || config.messages.groupChat.visibleReplies === 'automatic', 'Unexpected explicit group reply policy');
  return { path, before, config };
});
for (const { path, before, config } of entries) {
  if (config.messages?.visibleReplies === 'automatic') continue;
  fs.writeFileSync(`${path}.pre-vlab91-automatic-replies`, before, { flag: 'wx', mode: 0o600 });
  config.messages ??= {};
  config.messages.visibleReplies = 'automatic';
  const info = fs.statSync(path);
  const tmp = `${path}.automatic-replies.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: info.mode & 0o777 });
  fs.chownSync(tmp, info.uid, info.gid);
  fs.renameSync(tmp, path);
}
console.log('VLab native messages.visibleReplies=automatic; production unchanged');
