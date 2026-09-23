import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath, 'Candidate runtime required');
const dist = path.join(runtime, 'openclaw', 'dist');
const patchPath = path.join(process.cwd(), 'lab/release-files/feishu-model-switch-roles/patch-runtime.mjs');
const patch = spawnSync(process.execPath, [patchPath, path.join(runtime, 'openclaw'), '--apply'], { encoding: 'utf8' });
assert.equal(patch.status, 0, patch.stderr);

const names = fs.readdirSync(dist);
const target = (prefix) => {
  const pattern = new RegExp(`^${prefix.replaceAll('.', '\\.')}[A-Za-z0-9_-]{8}\\.js$`);
  const matches = names.filter(n => pattern.test(n));
  assert.equal(matches.length, 1, `${prefix} target not unique`);
  return path.join(dist, matches[0]);
};
for (const prefix of ['command-auth-']) {
  const file = target(prefix);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${prefix}: ${check.stderr}`);
}
const auth = await import(`file://${target('command-auth-')}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const owner = 'feishu:ou_owner_test_123';
const colleague = 'ou_coworker_test_123';
config.commands = { ...(config.commands ?? {}), ownerAllowFrom: [owner], allowFrom: { feishu: ['*'] } };
config.channels.feishu = { ...(config.channels.feishu ?? {}), allowFrom: ['*'] };
const permit = (sender, commandText) => auth.n({
  cfg: config,
  ctx: { Provider: 'feishu', Surface: 'feishu', AccountId: 'default', SenderId: sender,
    From: sender, To: 'feishu:bot', ChatType: 'direct', commandText },
  commandAuthorized: true,
});
const ownerModel = permit(owner, '/model vcodex');
const colleagueModel = permit(colleague, '/model vds');
const colleagueVcc = permit(colleague, '/model vcc');
const colleagueVcodex = permit(colleague, '/model vcodex');
const colleagueStatus = permit(colleague, '/model status');
const colleagueRestart = permit(colleague, '/restart');
const colleagueBash = permit(colleague, '/bash ls');
assert.equal(ownerModel.senderIsOwner, true);
assert.equal(ownerModel.isAuthorizedSender, true);
assert.equal(colleagueModel.senderIsOwner, false);
assert.equal(colleagueModel.isAuthorizedSender, true);
assert.equal(colleagueVcc.isAuthorizedSender, true);
assert.equal(colleagueVcodex.isAuthorizedSender, true);
assert.equal(colleagueStatus.isAuthorizedSender, true);
assert.equal(colleagueRestart.isAuthorizedSender, false);
assert.equal(colleagueBash.isAuthorizedSender, false);

console.log(JSON.stringify({ ok: true, checks: ['owner', 'model', 'status', 'restart-denied', 'bash-denied', 'vcodex-allowed', 'vcc-allowed', 'vds-allowed', 'syntax'] }));
