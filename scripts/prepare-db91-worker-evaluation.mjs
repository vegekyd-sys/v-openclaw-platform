import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildConfig, assertSafeConfig} from '../lab/config.mjs';

const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
const [mode, providerSource] = process.argv.slice(2);
assert(['native', 'single', 'multi'].includes(mode));
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.getuid(), 0, 'prepare through the explicit VLab owner operation');
const manifest = JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(manifest.owner, 'codex-db91-contention-20260907');
assert.equal(manifest.root, root);
assert.equal(execFileSync('systemctl', ['show', manifest.unit, '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim(), '0', 'stop owned instance before changing the evaluation mode');
assert.equal(fs.realpathSync(root), root);
let provider;
if (providerSource) {
  assert.equal(providerSource, '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/openclaw.json');
  provider = structuredClone(JSON.parse(fs.readFileSync(providerSource)).models?.providers?.deepseek);
  assert(provider && typeof provider.apiKey === 'string' && !provider.apiKey.includes('${') && !/[\r\n"\\]/.test(provider.apiKey), 'expected explicit VLab static provider key');
  fs.writeFileSync(root + '/secrets.env', `DEEPSEEK_API_KEY="${provider.apiKey}"\n`, {mode: 0o600});
  delete provider.apiKey;
} else {
  provider = structuredClone(JSON.parse(fs.readFileSync(root + '/state/openclaw.json')).models?.providers?.deepseek);
  assert(provider, 'initial evaluation requires the approved VLab provider source');
  delete provider.apiKey;
}
const previous = JSON.parse(fs.readFileSync(root + '/state/openclaw.json'));
const providerPlugin = previous.plugins.load.paths.find(p => !p.endsWith('/worker'));
const {config, overlay} = buildConfig(root, manifest.port, {provider, providerPluginPath: providerPlugin, worker: mode !== 'native'});
config.gateway.auth.token = previous.gateway.auth.token;
overlay.gateway.auth.token = previous.gateway.auth.token;
for (const cfg of [config, overlay]) {
  cfg.messages = {queue: {mode: 'steer'}};
  cfg.agents.defaults.thinkingDefault = 'low';
}
if (mode !== 'native') {
  const worker = config.plugins.entries['vlab-agent-worker-isolation'].config;
  worker.minWorkers = worker.maxWorkers = mode === 'single' ? 1 : 2;
  worker.sessionsPerWorker = mode === 'single' ? 2 : 1;
  fs.cpSync(root + '/source/experiments/agent-worker-isolation-v1', root + '/runtime/worker', {recursive: true});
}
assertSafeConfig(config, root, manifest.port);
assertSafeConfig(overlay, root, manifest.port);
const snapshot = root + '/tmp/evaluation-config-' + mode + '-' + Date.now();
fs.mkdirSync(snapshot, {mode: 0o700});
for (const name of ['openclaw.json', 'worker-openclaw.json']) fs.copyFileSync(root + '/state/' + name, snapshot + '/' + name);
fs.writeFileSync(root + '/state/openclaw.json', JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
fs.writeFileSync(root + '/state/worker-openclaw.json', JSON.stringify(overlay, null, 2) + '\n', {mode: 0o600});
fs.writeFileSync(root + '/tmp/evaluation-mode.json', JSON.stringify({mode, at: new Date().toISOString(), sourceCommit: execFileSync('git', ['-c', 'safe.directory=' + root + '/source', '-C', root + '/source', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()}));
execFileSync('chown', ['-R', manifest.user + ':' + manifest.user, root + '/runtime/worker', root + '/state', root + '/tmp', root + '/secrets.env']);
console.log(JSON.stringify({mode, nativeDatabaseCodeUnchanged: true, owner: manifest.owner, port: manifest.port, totalSessionCapacity: 2, channelsEnabled: false}));
