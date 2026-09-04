import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const main = JSON.parse(fs.readFileSync(`${root}/state/openclaw.json`, 'utf8'));
assert.equal(main.channels.feishu.appId, '${VLAB_FEISHU_APP_ID}');
assert.equal(main.channels.feishu.appSecret, '${VLAB_FEISHU_APP_SECRET}');
const path = `${root}/experiments/agent-worker-isolation-v1/worker-openclaw.json`;
const original = fs.readFileSync(path, 'utf8');
const overlay = JSON.parse(original);
assert.equal(overlay.channels?.feishu, undefined, 'Overlay changed since audit; inspect before retry');
const stat = fs.statSync(path);
const backup = `${path}.pre-feishu-tools-20260904`;
fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
fs.chownSync(backup, stat.uid, stat.gid);
overlay.channels ??= {};
// Same account availability as production Workers; this process runs native
// agentCommand, not a second Gateway. Only the lab-specific env references copy.
overlay.channels.feishu = structuredClone(main.channels.feishu);
const tmp = `${path}.feishu-tools-${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(overlay, null, 2) + '\n', { flag: 'wx', mode: stat.mode & 0o777 });
fs.chownSync(tmp, stat.uid, stat.gid);
fs.renameSync(tmp, path);
console.log(JSON.stringify({ ok: true, field: 'channels.feishu', credentialSource: 'VLAB_FEISHU env references', backup }));
