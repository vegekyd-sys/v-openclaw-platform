// Candidate drill: scripts/v-self-restart.py against a real Gateway under systemd.
//
// Boots a private Gateway as a systemd unit (runtime unit file, Restart=always, like V), then:
//   A. a restart with a config change and a session to wake: the change lands only
//      while the Gateway is stopped, a planted stale Codex registration is removed,
//      the Gateway comes back ready on a new pid, and the session gets a wake turn;
//   B. a change that passes --dry-run but stops the Gateway from starting (TLS on,
//      cert files missing): the tool
//      must notice, put the old config back, start again and report "rolled-back";
//   C. a change that fails --dry-run: refused before anything stops.
// Runs as the candidate's admin identity because the tool needs root (sudo).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const dataDir = process.env.VLAB_CANDIDATE_DATA;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && dataDir && sharedState, 'candidate runtime environment is required');
const tool = path.resolve('scripts/v-self-restart.py');
assert(fs.existsSync(tool), 'scripts/v-self-restart.py missing from the candidate inputs');
const cli = path.join(runtime, 'openclaw', 'dist', 'index.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const user = os.userInfo();
const tag = crypto.randomBytes(3).toString('hex');
const unit = `cand-self-restart-gw-${tag}.service`;
const toolState = path.join(dataDir, 'self-restart-state');
const receipt = {unit, scenarios: {}};
const toolRuns = [];
const unitFile = `/run/systemd/system/${unit}`;

function run(argv, opts = {}) {
  const r = spawnSync(argv[0], argv.slice(1), {encoding: 'utf8', timeout: opts.timeout ?? 120000, maxBuffer: 32 << 20, env: opts.env ?? process.env});
  if (opts.check !== false && r.status !== 0) throw new Error(`${argv.slice(0, 4).join(' ')} -> ${r.status}\n${r.stdout}\n${r.stderr}`.slice(-4000));
  return r;
}
const sudo = (argv, opts) => run(['sudo', '-n', ...argv], opts);
const show = (prop) => sudo(['systemctl', 'show', unit, '-p', prop, '--value']).stdout.trim();
const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

for (const [key, dir] of Object.entries({TMPDIR: 'tmp', XDG_CACHE_HOME: 'cache', npm_config_cache: 'npm-cache'})) {
  process.env[key] = path.join(dataDir, dir);
  fs.mkdirSync(process.env[key], {recursive: true, mode: 0o700});
}

// ---- private Gateway config: no channels, no cron, one Worker ----
const config = readConfig();
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, 'candidate Gateway port is missing');
config.channels = {};
config.cron = {...(config.cron ?? {}), enabled: false};
if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, {minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0});
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith('..'), 'candidate Worker config escaped state');
  const worker = JSON.parse(fs.readFileSync(path.join(sharedState, rel), 'utf8')
    .replaceAll(sharedState, stateDir)
    .replaceAll('/srv/vlab-production-mirror/labs/instances/db91-parity/runtime', runtime));
  worker.channels = {};
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), {recursive: true});
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(worker, null, 2)}\n`, {mode: 0o600});
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});

// The tool calls `openclaw ...`; on V that is /usr/local/bin/openclaw.
const wrapper = path.join(dataDir, 'openclaw');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec ${process.execPath} ${cli} "$@"\n`, {mode: 0o755});

// Everything the Gateway needs, through a 0600 env file so credentials stay off argv.
const envFile = path.join(dataDir, 'gateway.env');
const keep = Object.entries(process.env).filter(([k]) => !/^(SUDO_|SSH_|_$|PWD$|OLDPWD$|SHLVL$)/u.test(k));
fs.writeFileSync(envFile, keep.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + `\nOPENCLAW_GATEWAY_PORT=${port}\n`, {mode: 0o600});

const toolEnv = {
  ...process.env,
  V_SELF_RESTART_UNIT: unit,
  V_SELF_RESTART_CONFIG: configPath,
  V_SELF_RESTART_STATE_DB: path.join(stateDir, 'state', 'openclaw.sqlite'),
  V_SELF_RESTART_RUN_AS: user.username,
  V_SELF_RESTART_RUN_AS_HOME: user.homedir,
  V_SELF_RESTART_OPENCLAW: wrapper,
  V_SELF_RESTART_STATE_DIR: toolState,
  V_SELF_RESTART_CLI_ENV: [`OPENCLAW_CONFIG_PATH=${configPath}`, `OPENCLAW_STATE_DIR=${stateDir}`,
    `OPENCLAW_GATEWAY_PORT=${port}`, `TMPDIR=${process.env.TMPDIR}`].join(' '),
};
const toolArgv = (args) => ['sudo', '-n', '--preserve-env=' + Object.keys(toolEnv).filter((k) => k.startsWith('V_SELF_RESTART_')).join(','),
  '/usr/bin/python3', tool, ...args];

async function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inv = show('InvocationID');
    const text = sudo(['journalctl', `_SYSTEMD_INVOCATION_ID=${inv}`, '-o', 'cat', '--no-pager'], {timeout: 60000}).stdout
      .replace(/\x1b\[[0-9;]*m/gu, '');
    if (text.includes('[gateway] ready')) return;
    await sleep(3000);
  }
  throw new Error('private Gateway never became ready');
}

async function selfRestart(name, args, {expectRc = 0} = {}) {
  const t0 = Date.now();
  const r = run(toolArgv(args), {env: toolEnv, check: false, timeout: 600000});
  const result = {rc: r.status, stdout: r.stdout.slice(-1500), stderr: r.stderr.slice(-1500)};
  assert.equal(r.status, expectRc, `${name}: request rc ${r.status}\n${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) return {request: result};
  const id = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).id;
  toolRuns.push(id);
  let rec;
  for (;;) {
    rec = JSON.parse(run(toolArgv(['--status', id]), {env: toolEnv}).stdout);
    if (rec.state === 'finished' && (rec.wake !== undefined || !rec.sessionKey || rec.outcome !== 'ok')) break;
    assert(Date.now() - t0 < 1500000, `${name}: self-restart did not finish`);
    await sleep(5000);
  }
  return {request: result, record: rec, wallSeconds: Math.round((Date.now() - t0) / 1000)};
}

function plantOrphan() {
  const db = new DatabaseSync(toolEnv.V_SELF_RESTART_STATE_DB);
  const dead = 4000000 + Math.floor(Math.random() * 100000);
  db.prepare(`INSERT INTO plugin_state_entries (plugin_id, namespace, entry_key, value_json, created_at)
    VALUES ('codex', 'app-server-processes', ?, ?, ?)`).run(`drill-${tag}`,
    JSON.stringify({parent: {pid: dead, pgid: dead, startedAt: 'drill'}, child: {pid: dead + 1, pgid: dead + 1, startedAt: 'drill'}}), Date.now());
  db.close();
}
function orphanCount() {
  const db = new DatabaseSync(toolEnv.V_SELF_RESTART_STATE_DB, {readOnly: true});
  const n = db.prepare(`SELECT count(*) AS n FROM plugin_state_entries WHERE entry_key = ?`).get(`drill-${tag}`).n;
  db.close();
  return n;
}
function wakeTurns(sessionKey) {
  const dbPath = path.join(stateDir, 'agents', 'makaron', 'agent', 'openclaw-agent.sqlite');
  if (!fs.existsSync(dbPath)) return {db: 'missing'};
  const db = new DatabaseSync(dbPath, {readOnly: true});
  const ids = db.prepare('SELECT session_id FROM session_windows WHERE session_key = ?').all(sessionKey).map((r) => r.session_id);
  const events = ids.length ? db.prepare(`SELECT event_json FROM transcript_events WHERE session_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  db.close();
  const text = events.map((e) => e.event_json).join('\n');
  return {sessions: ids.length, events: events.length, sawWakeMessage: text.includes('v-self-restart'), assistantReplied: /"role":"assistant"/u.test(text)};
}

try {
  // A real unit file, like V's: a transient (systemd-run) unit is garbage-collected
  // once stopped and cannot be started again, which is exactly what the tool does.
  fs.writeFileSync(path.join(dataDir, unit), [
    '[Unit]', `Description=candidate Gateway for the v-self-restart drill ${tag}`, '',
    '[Service]', `User=${user.uid}`, `Group=${user.gid}`, `EnvironmentFile=${envFile}`, `WorkingDirectory=${dataDir}`,
    `ExecStart=${process.execPath} --max-old-space-size=8192 ${cli} gateway --port ${port}`,
    'Restart=always', 'RestartSec=5', 'KillMode=control-group', 'TimeoutStopSec=45', ''].join('\n'));
  sudo(['install', '-m', '0644', path.join(dataDir, unit), unitFile]);
  sudo(['systemctl', 'daemon-reload']);
  sudo(['systemctl', 'start', unit]);
  await waitReady(1200000);
  receipt.firstPid = show('MainPID');

  // ---- A: change + stale Codex registration + wake ----
  plantOrphan();
  const sessionKey = `agent:makaron:self-restart-drill-${tag}`;
  const a = await selfRestart('A', ['--reason', 'candidate drill A', '--requested-by', 'candidate', '--delay', '2',
    '--set', 'messages.ackReaction="eyes"', '--session-key', sessionKey,
    '--then', 'Reply with exactly: drill wake ok'], {});
  receipt.scenarios.A = {...a, pidAfter: show('MainPID'), ackReaction: readConfig().messages?.ackReaction,
    orphanLeft: orphanCount(), wakeTurns: wakeTurns(sessionKey)};
  assert.equal(a.record.outcome, 'ok', JSON.stringify(a.record).slice(-2000));
  assert.notEqual(receipt.scenarios.A.pidAfter, receipt.firstPid, 'A: Gateway pid did not change');
  assert.equal(receipt.scenarios.A.ackReaction, 'eyes', 'A: config change not applied');
  assert.equal(receipt.scenarios.A.orphanLeft, 0, 'A: stale Codex registration survived');
  assert(a.record.codexOrphans.deleted.length >= 1, 'A: cleanup reported nothing');
  // No channels in a candidate, so --deliver is refused and the tool falls back
  // to an undelivered wake; on V the group session resolves its own route.
  assert.equal(a.record.wake?.rc, 0, `A: wake failed ${JSON.stringify(a.record.wake)}`);
  assert(receipt.scenarios.A.wakeTurns.sawWakeMessage, 'A: wake message never reached the session');

  // ---- B: passes --dry-run, Gateway cannot serve -> rollback ----
  const before = fs.readFileSync(configPath, 'utf8');
  const b = await selfRestart('B', ['--reason', 'candidate drill B', '--requested-by', 'candidate', '--delay', '1', '--force',
    '--ready-timeout', '240', '--set',
    'gateway.tls={"enabled":true,"autoGenerate":false,"certPath":"/nonexistent/drill-cert.pem","keyPath":"/nonexistent/drill-key.pem"}']);
  receipt.scenarios.B = {...b, configRestored: fs.readFileSync(configPath, 'utf8') === before, activeAfter: sudo(['systemctl', 'is-active', unit], {check: false}).stdout.trim()};
  assert.equal(b.record.outcome, 'rolled-back', JSON.stringify(b.record).slice(-2000));
  assert(receipt.scenarios.B.configRestored, 'B: config not restored byte-for-byte');
  assert.equal(receipt.scenarios.B.activeAfter, 'active');

  // ---- C: fails --dry-run -> refused, nothing stops ----
  const pidC = show('MainPID');
  const c = await selfRestart('C', ['--reason', 'candidate drill C', '--requested-by', 'candidate', '--force',
    '--set', 'gateway.noSuchKeyForDrill=1'], {expectRc: 3});
  receipt.scenarios.C = {...c, pidUnchanged: show('MainPID') === pidC};
  assert(receipt.scenarios.C.pidUnchanged, 'C: Gateway restarted on a refused change');
  receipt.pass = true;
} catch (error) {
  receipt.pass = false;
  receipt.error = String(error.stack ?? error).slice(-4000);
  receipt.journalTail = sudo(['journalctl', '-u', unit, '-o', 'cat', '--no-pager', '-n', '80'], {check: false}).stdout
    .replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, '$1$2[redacted]').slice(-6000);
} finally {
  // The tool's own run units live outside this candidate's process group and
  // read files from its directory: stop them before anything is removed.
  for (const id of toolRuns) sudo(['systemctl', 'stop', `v-self-restart-${id}.service`], {check: false, timeout: 120000});
  sudo(['systemctl', 'stop', unit], {check: false, timeout: 120000});
  sudo(['systemctl', 'reset-failed', unit], {check: false});
  sudo(['rm', '-f', unitFile], {check: false});
  sudo(['systemctl', 'daemon-reload'], {check: false});
  run(['sudo', '-n', 'rm', '-rf', toolState], {check: false});
}
console.log(JSON.stringify(receipt, null, 1));
process.exit(receipt.pass ? 0 : 1);
