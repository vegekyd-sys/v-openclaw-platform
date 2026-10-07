// Switch production V's web_search to Parallel through a controlled restart (same flow as
// codex-plugins-off): idle fence -> stop -> install @openclaw/parallel-plugin@2026.9.1 and
// write both configs -> start -> wait for health. Nothing is written while the Gateway runs,
// so the live config watcher never sees it. On any failure before start, both configs are
// restored from the exact text read here. Night Shift holds and resumes itself (PR #125).
//
//   sudo node activate-production.mjs              switch to parallel-free
//   sudo node activate-production.mjs --rollback   switch back to gemini (plugin stays installed)
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireIdleFence} from '../../shared/lifecycle.mjs';
import {useParallelWebSearch, useGeminiWebSearch} from './config.mjs';

assert.equal(os.hostname(), 'VM-8-2-ubuntu');
assert.equal(process.getuid(), 0);
const rollback = process.argv.includes('--rollback');
const PLUGIN = '@openclaw/parallel-plugin@2026.9.1';
const unit = 'openclaw-gateway.service';
const companionTimer = 'openclaw-gateway-memory-snapshot.timer';
const core = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const root = '/home/openclaw/.openclaw';
const run = (cmd, args, timeout = 60000) => execFileSync(cmd, args, {encoding: 'utf8', timeout}).trim();
const pid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const transform = rollback ? useGeminiWebSearch : useParallelWebSearch;

const beforePid = pid(); assert(beforePid > 1);
const env = Object.fromEntries(fs.readFileSync(`/proc/${beforePid}/environ`, 'utf8').split('\0').filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
assert.equal(env.OPENCLAW_CONFIG_PATH ?? root + '/openclaw.json', root + '/openclaw.json');
const cfg = JSON.parse(fs.readFileSync(root + '/openclaw.json'));
assert.equal(cfg.gateway.port, 22793);
const worker = cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
assert.equal(worker, root + '/experiments/agent-worker-isolation-v1/worker-openclaw.json');
const files = [root + '/openclaw.json', worker];
const original = files.map((file) => ({file, text: fs.readFileSync(file, 'utf8'), stat: fs.statSync(file)}));
for (const c of original) {
  const {changed, reason} = transform(JSON.parse(c.text));
  assert(changed, `${c.file}: nothing to change (${reason})`);
}

function writeExact(file, text, stat, tag) {
  const temp = `${file}.${tag}-${process.pid}`;
  fs.writeFileSync(temp, text, {flag: 'wx', mode: stat.mode & 0o777});
  fs.chownSync(temp, stat.uid, stat.gid);
  fs.renameSync(temp, file);
}

const token = cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => { assert(env[key]); return env[key]; });
const {GatewayClient} = await import(core + '/dist/plugin-sdk/gateway-runtime.js');
async function connect() {
  let client;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Gateway connection deadline')), 20000);
      client = new GatewayClient({url: 'ws://127.0.0.1:22793', token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); }});
      client.start();
    });
    return client;
  } catch (error) { client?.stop(); throw error; }
}

const client = await connect();
let held, stopped = false, applied = false, timerWasActive = false, ready = false;
const written = [];
try {
  assert.equal((await client.request('health', {})).ok, true);
  held = await acquireIdleFence((method, params) => client.request(method, params, {timeoutMs: 30000}), `web-search-parallel-${Date.now()}`);
  assert.equal(pid(), beforePid);
  for (const c of original) assert.equal(fs.readFileSync(c.file, 'utf8'), c.text, 'Concurrent configuration change');
  console.log(JSON.stringify({phase: 'idle-fence-ready', beforePid, suspensionId: held.suspensionId}));
  timerWasActive = run('systemctl', ['show', companionTimer, '-p', 'ActiveState', '--value']) === 'active';
  if (timerWasActive) run('systemctl', ['stop', companionTimer]);
  run('systemctl', ['stop', unit], 190000); stopped = true; assert.equal(pid(), 0); client.stop();
  try {
    if (!rollback) {
      // As the service user with the Gateway's environment; may also record the install in config.
      const out = execFileSync('/usr/sbin/runuser', ['-u', 'openclaw', '--', 'env', '-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
        process.execPath, core + '/dist/index.js', 'plugins', 'install', PLUGIN, '--pin', '--force', '--accept-capabilities', '--acknowledge-install-policy-warning'],
      {encoding: 'utf8', timeout: 300000, cwd: root});
      console.log(JSON.stringify({phase: 'plugin-installed', plugin: PLUGIN, tail: out.trim().split('\n').slice(-3)}));
    }
    for (const c of original) {
      const now = fs.readFileSync(c.file, 'utf8');
      const {config} = transform(JSON.parse(now));
      fs.writeFileSync(`${c.file}.before-web-search-${rollback ? 'gemini' : 'parallel'}-${Date.now()}`, c.text, {flag: 'wx', mode: c.stat.mode & 0o777});
      writeExact(c.file, JSON.stringify(config, null, 2) + '\n', c.stat, 'web-search-parallel');
      written.push(c.file);
      assert.equal(JSON.parse(fs.readFileSync(c.file)).tools.web.search.provider, rollback ? 'gemini' : 'parallel-free');
    }
    applied = true;
  } catch (error) {
    for (const c of original) if (fs.readFileSync(c.file, 'utf8') !== c.text) writeExact(c.file, c.text, c.stat, 'web-search-parallel-restore');
    throw error;
  } finally { run('systemctl', ['start', unit]); stopped = false; }
  const deadline = Date.now() + 900000;
  while (Date.now() < deadline) {
    let probe;
    try { probe = await connect(); ready = (await probe.request('health', {})).ok === true; } catch {} finally { probe?.stop(); }
    if (ready) break;
    assert(pid() > 1, 'Gateway exited during startup'); await delay(2000);
  }
  assert(ready, 'Gateway readiness timeout; inspect logs and preserve backups');
  assert.notEqual(pid(), beforePid);
  console.log(JSON.stringify({phase: 'activated', beforePid, afterPid: pid(), provider: rollback ? 'gemini' : 'parallel-free',
    configurations: files.map((file) => ({file, sha256: hash(file)})),
    functionalAcceptance: 'Real Feishu turn still required: web_search result provider parallel-free and a visible reply'}));
} finally {
  if (stopped) run('systemctl', ['start', unit]);
  if (!applied && held?.suspensionId && pid() === beforePid) await client.request('gateway.suspend.resume', {suspensionId: held.suspensionId}).catch(() => {});
  client.stop();
  if (timerWasActive && (ready || pid() === beforePid)) run('systemctl', ['start', companionTimer]);
}
