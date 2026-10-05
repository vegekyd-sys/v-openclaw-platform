// Apply (or roll back) the configuration half of the V Experience multi-channel release
// through a controlled restart, on production V or on the shared VLab Gateway. Same flow as
// codex-plugins-off / web-search-parallel: idle fence -> stop -> write -> start -> health.
// Nothing is written while the Gateway runs. The Worker config is derived from the Gateway
// config at Gateway start (worker-config-derive, PR #172), so only the Gateway config is
// written; the script refuses a runtime without that derivation.
//
//   sudo node activate.mjs production                    commands.allowFrom for telegram/dingtalk-connector/wecom
//   sudo node activate.mjs vlab --owner <lease owner>    VLab test robots + the same command roles
//   sudo node activate.mjs <target> --rollback [...]     restore the exact previous config and drop-ins
//
// Preconditions checked here: the runtime's command-auth chunk is V3 (otherwise widening
// commands.allowFrom hands DingTalk/WeCom non-owners every non-owner command); on VLab the
// integration lease is --owner's and the shared operation lock is free.
//
// Every activation keeps the previous config byte for byte and a receipt in
// /var/lib/v-release-config/v-experience-multichannel/. --rollback restores the newest
// receipt's backup, but only if the config is still exactly what activation wrote.
//
// Order on VLab: the runtime release must already be deployed (vlab.mjs deploy refuses a
// changed config hash), and before `vlab.mjs rollback` of that release, run --rollback here
// first so the config hash is back to the one it was staged with.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireIdleFence} from '../../shared/lifecycle.mjs';
import {assertCommandAuthV3, envNames, productionConfig, vlabConfig, vlabDropins} from './config.mjs';

const TARGETS = {
  production: {host: 'VM-8-2-ubuntu', unit: 'openclaw-gateway.service', port: 22793, companionTimer: 'openclaw-gateway-memory-snapshot.timer'},
  vlab: {host: 'VM-0-4-ubuntu', unit: 'openclaw-vlab-production-mirror-v8.service', port: 24993,
    secretsFile: '/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env',
    lease: '/srv/vlab-production-mirror/labs/control/integration.json', lock: '/srv/vlab-production-mirror/labs/control/operation.lock'},
};
const RECEIPTS = '/var/lib/v-release-config/v-experience-multichannel';
const TAG = 'v-experience-multichannel';

const [targetName, ...flags] = process.argv.slice(2);
const T = TARGETS[targetName];
assert(T, 'usage: node activate.mjs production|vlab [--owner <o>] [--rollback]');
const rollback = flags.includes('--rollback');
const owner = flags.includes('--owner') ? flags[flags.indexOf('--owner') + 1] : undefined;
assert.equal(os.hostname(), T.host, `${targetName} runs on ${T.host}`);
assert.equal(process.getuid(), 0);

const run = (cmd, args, timeout = 60000) => execFileSync(cmd, args, {encoding: 'utf8', timeout}).trim();
const pid = () => Number(run('systemctl', ['show', T.unit, '-p', 'MainPID', '--value']));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const dropinDir = `/etc/systemd/system/${T.unit}.d`;

const beforePid = pid(); assert(beforePid > 1, `${T.unit} is not running`);
const env = Object.fromEntries(fs.readFileSync(`/proc/${beforePid}/environ`, 'utf8').split('\0').filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
const configFile = env.OPENCLAW_CONFIG_PATH ?? path.join(env.OPENCLAW_STATE_DIR ?? `${env.HOME}/.openclaw`, 'openclaw.json');
const original = {text: fs.readFileSync(configFile, 'utf8'), stat: fs.statSync(configFile)};
const cfg = JSON.parse(original.text);
assert.equal(cfg.gateway.port, T.port);
const argv = fs.readFileSync(`/proc/${beforePid}/cmdline`, 'utf8').split('\0').filter(Boolean);
const core = argv.find((a) => a.endsWith('/dist/index.js'))?.slice(0, -'/dist/index.js'.length);
assert(core, 'cannot find the running core');

if (targetName === 'vlab') {
  assert(owner && !owner.startsWith('--'), '--owner <integration lease owner> is required on VLab');
  assert.equal(JSON.parse(fs.readFileSync(T.lease, 'utf8')).owner, owner, 'Integration lease belongs to another task');
}

// ---- what to write ---------------------------------------------------------------------
let next, dropins = {}, removeDropins = [], receipt;
if (!rollback) {
  const authFiles = fs.readdirSync(`${core}/dist`).filter((n) => /^command-auth-[A-Za-z0-9_-]{8}\.js$/.test(n));
  assert.equal(authFiles.length, 1, `expected one command-auth chunk in ${core}/dist`);
  const authSource = fs.readFileSync(`${core}/dist/${authFiles[0]}`, 'utf8');
  // On V the release bytes are installed (no restart) before this runs, so V3 is
  // already on disk. On VLab the config must be written before `stage` (stage
  // records the config hash; deploy and accept require it unchanged), so V3
  // arrives with the deploy minutes later. Until then VLab's test-bot channels
  // behave like V's DingTalk/WeCom today; nothing new is exposed.
  if (targetName === 'production') assertCommandAuthV3(authSource);
  else try { assertCommandAuthV3(authSource); } catch (error) { console.error(`note: ${error.message}; on VLab the release deploy brings V3 after this config`); }
  const derive = (cfg.plugins?.load?.paths ?? []).some((p) => fs.existsSync(path.join(p, 'worker-config-derive.mjs')));
  assert(derive || !cfg.plugins?.entries?.['vlab-agent-worker-isolation']?.enabled, 'Worker plugin without worker-config-derive: the Worker would not see this config');
  if (targetName === 'production') {
    const r = productionConfig(cfg);
    assert(r.changed, 'nothing to change: commands.allowFrom already covers the channels');
    next = r.config;
  } else {
    const environmentFiles = run('systemctl', ['show', T.unit, '-p', 'EnvironmentFiles', '--value']).split('\n').map((l) => l.split(' ')[0]);
    const r = vlabConfig(cfg, {secrets: envNames(fs.readFileSync(T.secretsFile, 'utf8'))});
    assert(r.changed, 'nothing to change');
    next = r.config;
    dropins = vlabDropins({environmentFiles, secretsFile: T.secretsFile});
    for (const name of Object.keys(dropins)) assert(!fs.existsSync(path.join(dropinDir, name)), `${name} already exists; roll back first`);
  }
} else {
  const names = fs.existsSync(RECEIPTS) ? fs.readdirSync(RECEIPTS).filter((n) => n.startsWith(`receipt-${targetName}-`)).sort() : [];
  assert(names.length, `no ${targetName} receipt in ${RECEIPTS}`);
  receipt = JSON.parse(fs.readFileSync(path.join(RECEIPTS, names.at(-1)), 'utf8'));
  assert(!receipt.rolledBackAt, `newest receipt ${names.at(-1)} was already rolled back`);
  assert.equal(receipt.configFile, configFile);
  assert.equal(sha(original.text), receipt.writtenSha, 'config changed since activation; refusing to overwrite it, restore by hand from ' + receipt.backup);
  next = null;
  removeDropins = receipt.dropins;
  receipt.file = path.join(RECEIPTS, names.at(-1));
}

// ---- controlled restart ----------------------------------------------------------------------
const token = String(cfg.gateway.auth.token).replace(/\$\{([^}]+)\}/g, (_, k) => { assert(env[k]); return env[k]; });
const {GatewayClient} = await import(core + '/dist/plugin-sdk/gateway-runtime.js');
async function connect() {
  let client;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Gateway connection deadline')), 20000);
      client = new GatewayClient({url: `ws://127.0.0.1:${T.port}`, token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); }});
      client.start();
    });
    return client;
  } catch (error) { client?.stop(); throw error; }
}
function writeExact(file, text, stat) {
  const temp = `${file}.${TAG}-${process.pid}`;
  fs.writeFileSync(temp, text, {flag: 'wx', mode: stat.mode & 0o777});
  fs.chownSync(temp, stat.uid, stat.gid);
  fs.renameSync(temp, file);
}

// The shared VLab operation lock (lab/shared/server.mjs takes the same one for deploy/rollback).
let lockHeld = false;
if (T.lock) { fs.mkdirSync(T.lock, {mode: 0o700}); lockHeld = true; }
let client;
try { client = await connect(); } catch (error) { if (lockHeld) fs.rmdirSync(T.lock); throw error; }
let held, stopped = false, applied = false, timerWasActive = false, ready = false;
const writtenDropins = [], removedDropins = [];
try {
  assert.equal((await client.request('health', {})).ok, true);
  held = await acquireIdleFence((method, params) => client.request(method, params, {timeoutMs: 30000}), `${TAG}-${Date.now()}`);
  assert.equal(pid(), beforePid);
  assert.equal(fs.readFileSync(configFile, 'utf8'), original.text, 'Concurrent configuration change');
  console.log(JSON.stringify({phase: 'idle-fence-ready', target: targetName, rollback, beforePid}));
  if (T.companionTimer) {
    timerWasActive = run('systemctl', ['show', T.companionTimer, '-p', 'ActiveState', '--value']) === 'active';
    if (timerWasActive) run('systemctl', ['stop', T.companionTimer]);
  }
  run('systemctl', ['stop', T.unit], 300000); stopped = true; assert.equal(pid(), 0); client.stop();
  try {
    if (!rollback) {
      fs.mkdirSync(RECEIPTS, {recursive: true, mode: 0o700});
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
      const backup = `${configFile}.before-${TAG}-${stamp}`;
      fs.writeFileSync(backup, original.text, {flag: 'wx', mode: original.stat.mode & 0o777});
      fs.chownSync(backup, original.stat.uid, original.stat.gid);
      const text = JSON.stringify(next, null, 2) + '\n';
      writeExact(configFile, text, original.stat);
      fs.mkdirSync(dropinDir, {recursive: true});
      for (const [name, body] of Object.entries(dropins)) {
        fs.writeFileSync(path.join(dropinDir, name), body, {flag: 'wx', mode: 0o644});
        writtenDropins.push(path.join(dropinDir, name));
      }
      if (writtenDropins.length) run('systemctl', ['daemon-reload']);
      fs.writeFileSync(path.join(RECEIPTS, `receipt-${targetName}-${stamp}.json`), JSON.stringify({
        target: targetName, at: new Date().toISOString(), configFile, backup, beforeSha: sha(original.text), writtenSha: sha(text), dropins: writtenDropins,
      }, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    } else {
      writeExact(configFile, fs.readFileSync(receipt.backup, 'utf8'), original.stat);
      assert.equal(sha(fs.readFileSync(configFile)), receipt.beforeSha, 'restored config differs from the recorded original');
      for (const d of removeDropins) if (fs.existsSync(d)) { fs.unlinkSync(d); removedDropins.push(d); }
      if (removeDropins.length) run('systemctl', ['daemon-reload']);
      fs.writeFileSync(receipt.file, JSON.stringify({...receipt, file: undefined, rolledBackAt: new Date().toISOString()}, null, 2) + '\n');
    }
    applied = true;
  } catch (error) {
    if (fs.readFileSync(configFile, 'utf8') !== original.text) writeExact(configFile, original.text, original.stat);
    for (const d of writtenDropins) fs.rmSync(d, {force: true});
    if (writtenDropins.length || removedDropins.length) run('systemctl', ['daemon-reload']);
    throw error;
  } finally { run('systemctl', ['start', T.unit]); stopped = false; }
  const deadline = Date.now() + 900000;
  while (Date.now() < deadline) {
    let probe;
    try { probe = await connect(); ready = (await probe.request('health', {})).ok === true; } catch {} finally { probe?.stop(); }
    if (ready) break;
    assert(pid() > 1, 'Gateway exited during startup'); await delay(2000);
  }
  assert(ready, 'Gateway readiness timeout; inspect logs; the receipt and backup allow --rollback');
  console.log(JSON.stringify({phase: rollback ? 'rolled-back' : 'activated', target: targetName, beforePid, afterPid: pid(), configSha: sha(fs.readFileSync(configFile)),
    dropins: rollback ? removedDropins.map((d) => `-${d}`) : writtenDropins,
    functionalAcceptance: rollback ? 'n/a' : 'Real turns still required: non-owner /model on each channel, /status refused; on VLab each test robot answers'}));
} finally {
  if (stopped) run('systemctl', ['start', T.unit]);
  if (!applied && held?.suspensionId && pid() === beforePid) await client.request('gateway.suspend.resume', {suspensionId: held.suspensionId}).catch(() => {});
  client.stop();
  if (timerWasActive && (ready || pid() === beforePid)) run('systemctl', ['start', T.companionTimer]);
  if (lockHeld) fs.rmdirSync(T.lock);
}
