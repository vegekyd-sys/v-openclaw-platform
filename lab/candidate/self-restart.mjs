// Candidate drill: scripts/v-self-restart.py against a real Gateway under systemd.
//
// Boots a private Gateway as a systemd unit (runtime unit file, Restart=always, like V), then:
//   A. a restart with a config change and a session to wake: the change lands only
//      while the Gateway is stopped, a planted stale Codex registration is removed,
//      the Gateway comes back ready on a new pid, and the session gets a wake turn;
//   B. a change that passes --dry-run but stops the Gateway from starting (TLS on,
//      cert files missing): the tool
//      must notice, put the old config back, start again and report "rolled-back";
//   C. a change that fails --dry-run: refused before anything stops;
//   D. a cron turn is running (a command job sleeping ~75 s): the idle gate waits
//      for it and only then stops the Gateway;
//   E. --while-stopped edits both the Gateway and the Worker config: applied,
//      validated, Gateway ready on them;
//   F. --while-stopped edits both configs and then fails: both restored byte for
//      byte, Gateway ready on the old ones;
//   G. --if-busy abort with a cron turn running: gives up, Gateway untouched.
// A stream cron (resident watcher, like V's GrokBot bridge) runs throughout: it
// must not hold the idle gate, and every restart must report it running again.
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
assert(fs.existsSync(path.resolve('scripts/v-self-restart-gateway.mjs')), 'Gateway helper missing from the candidate inputs');
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
// Cron on, with an empty private store: only the drill's own jobs exist.
config.cron = {...(config.cron ?? {}), enabled: true};
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

const workerConfigPath = workerPlugin?.workerConfigPath ?? path.join(dataDir, 'no-worker-config.json');
const toolEnv = {
  ...process.env,
  V_SELF_RESTART_UNIT: unit,
  V_SELF_RESTART_CONFIG: configPath,
  V_SELF_RESTART_WORKER_CONFIG: workerConfigPath,
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

const cliEnv = {...process.env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_GATEWAY_PORT: String(port)};
const openclaw = (args, opts = {}) => run([wrapper, ...args], {env: cliEnv, timeout: 180000, ...opts});
function cronJobs() {
  const r = openclaw(['cron', 'list', '--all', '--json']);
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  return out.jobs ?? [];
}
function jobByName(name) {
  const job = cronJobs().find((j) => j.name === name);
  assert(job, `cron job ${name} not found`);
  return job;
}
async function waitFor(what, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    assert(Date.now() < deadline, `timed out waiting for ${what}`);
    await sleep(2000);
  }
}
const streamName = `drill-stream-${tag}`;
const busyName = `drill-busy-${tag}`;
const streamRunning = () => jobByName(streamName).state?.streamStatus === 'running';
// The tool's record of the stream check after a restart.
function assertStreamBack(name, record) {
  assert(record.streams?.ok, `${name}: stream not reported running: ${JSON.stringify(record.streams)}`);
  assert(record.streams.enabled >= 1 && record.streams.running === record.streams.enabled, `${name}: ${JSON.stringify(record.streams)}`);
  assert((record.streamsBefore ?? []).includes(jobByName(streamName).id), `${name}: stream was not seen running before the stop`);
  assert(streamRunning(), `${name}: stream not running now`);
  assert(!(record.warnings ?? []).some((w) => w.includes('stream')), `${name}: stream warning ${JSON.stringify(record.warnings)}`);
}
async function startBusyTurn(seconds) {
  const job = jobByName(busyName);
  openclaw(['cron', 'run', job.id]);
  await waitFor('busy cron turn to start', () => jobByName(busyName).state?.runningAtMs, 60000);
  return Date.now();
}
const stepNames = (record) => record.steps.map((s) => s.step);

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

  // A resident stream watcher, shaped like V's GrokBot bridge, and a command job
  // that keeps a cron turn running for ~75 s when triggered.
  openclaw(['cron', 'add', '--name', streamName, '--agent', 'makaron', '--session', 'isolated', '--no-deliver',
    '--stream-command', JSON.stringify(['sh', '-c', 'while true; do sleep 20; done']), '--stream-mode', 'match',
    '--stream-match', '^DRILL_EVENT ', '--message', 'drill stream event; reply with exactly: ok']);
  openclaw(['cron', 'add', '--name', busyName, '--every', '24h', '--no-deliver', '--command', 'sleep 75',
    '--timeout-seconds', '300']);
  await waitFor('stream watcher running', streamRunning, 120000);
  receipt.streamJob = jobByName(streamName).id;

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
  assert.equal(a.record.idleGate?.result, 'idle', `A: idle gate ${JSON.stringify(a.record.idleGate)}`);
  assertStreamBack('A', a.record);

  // ---- B: passes --dry-run, Gateway cannot serve -> rollback ----
  const before = fs.readFileSync(configPath, 'utf8');
  const b = await selfRestart('B', ['--reason', 'candidate drill B', '--requested-by', 'candidate', '--delay', '1', '--force',
    '--ready-timeout', '240', '--set',
    'gateway.tls={"enabled":true,"autoGenerate":false,"certPath":"/nonexistent/drill-cert.pem","keyPath":"/nonexistent/drill-key.pem"}']);
  receipt.scenarios.B = {...b, configRestored: fs.readFileSync(configPath, 'utf8') === before, activeAfter: sudo(['systemctl', 'is-active', unit], {check: false}).stdout.trim()};
  assert.equal(b.record.outcome, 'rolled-back', JSON.stringify(b.record).slice(-2000));
  assert(receipt.scenarios.B.configRestored, 'B: config not restored byte-for-byte');
  assert.equal(receipt.scenarios.B.activeAfter, 'active');
  await waitFor('stream running after B', streamRunning, 180000);

  // ---- C: fails --dry-run -> refused, nothing stops ----
  const pidC = show('MainPID');
  const c = await selfRestart('C', ['--reason', 'candidate drill C', '--requested-by', 'candidate', '--force',
    '--set', 'gateway.noSuchKeyForDrill=1'], {expectRc: 3});
  receipt.scenarios.C = {...c, pidUnchanged: show('MainPID') === pidC};
  assert(receipt.scenarios.C.pidUnchanged, 'C: Gateway restarted on a refused change');

  // ---- D: a cron turn is running -> the gate waits for it ----
  const busyStarted = await startBusyTurn();
  const d = await selfRestart('D', ['--reason', 'candidate drill D', '--requested-by', 'candidate', '--delay', '1', '--force',
    '--idle-timeout', '600']);
  const dSteps = stepNames(d.record);
  const busyStep = d.record.steps.find((x) => x.step === 'busy');
  const busyRun = jobByName(busyName).state ?? {};
  receipt.scenarios.D = {...d, busyStep, idleGate: d.record.idleGate, busyLastRunStatus: busyRun.lastRunStatus ?? busyRun.lastStatus,
    busyLastDurationMs: busyRun.lastDurationMs, stopAfterBusyStartS: Math.round((Date.parse(d.record.steps.find((x) => x.step === 'stopped').at.replace(' CST', '+08:00').replace(' ', 'T')) - busyStarted) / 1000)};
  assert.equal(d.record.outcome, 'ok', JSON.stringify(d.record).slice(-2000));
  assert(busyStep && busyStep.reasons.some((r) => r.includes('cron 回合在跑')), `D: no cron busy step ${JSON.stringify(d.record.steps)}`);
  assert(!busyStep.reasons.some((r) => r.includes(streamName)), 'D: the stream watcher counted as busy');
  assert.equal(d.record.idleGate.result, 'idle');
  assert(d.record.idleGate.waitedS >= 30, `D: waited only ${d.record.idleGate.waitedS}s`);
  assert(dSteps.indexOf('busy') < dSteps.indexOf('idle') && dSteps.indexOf('idle') < dSteps.indexOf('stopped'), `D: order ${dSteps}`);
  assert.equal(receipt.scenarios.D.busyLastRunStatus, 'ok', 'D: the busy cron turn did not finish normally (cut off by the stop?)');
  assertStreamBack('D', d.record);

  // ---- E: --while-stopped edits both configs -> applied and validated ----
  const editScript = path.join(dataDir, 'edit-configs.mjs');
  fs.writeFileSync(editScript, [
    "import fs from 'node:fs';",
    "const [mode, value] = process.argv.slice(2);",
    "for (const f of [process.env.V_SELF_RESTART_CONFIG, process.env.V_SELF_RESTART_WORKER_CONFIG]) {",
    "  if (!fs.existsSync(f)) continue;",
    "  const c = JSON.parse(fs.readFileSync(f, 'utf8'));",
    "  c.messages = {...(c.messages ?? {}), ackReaction: value};",
    "  fs.writeFileSync(f + '.tmp', JSON.stringify(c, null, 2) + '\\n'); fs.renameSync(f + '.tmp', f);",  // rename: a new inode, as a real activation would
    "}",
    "if (mode === 'fail') { console.error('drill: activation step failed after editing'); process.exit(7); }",
    ''].join('\n'));
  const ePid = show('MainPID');
  const e = await selfRestart('E', ['--reason', 'candidate drill E', '--requested-by', 'candidate', '--delay', '1', '--force',
    '--while-stopped', `${process.execPath} ${editScript} ok "white_check_mark"`]);
  const workerAck = () => (fs.existsSync(workerConfigPath) ? JSON.parse(fs.readFileSync(workerConfigPath, 'utf8')).messages?.ackReaction : null);
  receipt.scenarios.E = {...e, pidAfter: show('MainPID'), ackReaction: readConfig().messages?.ackReaction, workerAckReaction: workerAck(),
    whileStopped: e.record.whileStoppedResult, configValidation: e.record.configValidation, configOwnerSteps: e.record.steps.filter((x) => x.step === 'config-owner-restored')};
  assert.equal(e.record.outcome, 'ok', JSON.stringify(e.record).slice(-2000));
  assert.notEqual(receipt.scenarios.E.pidAfter, ePid);
  assert.equal(e.record.whileStoppedResult.rc, 0);
  assert.equal(receipt.scenarios.E.ackReaction, 'white_check_mark', 'E: Gateway config not changed');
  if (fs.existsSync(workerConfigPath)) assert.equal(receipt.scenarios.E.workerAckReaction, 'white_check_mark', 'E: Worker config not changed');
  assert(e.record.configValidation.length >= 1 && e.record.configValidation.every((v) => v.ok), `E: ${JSON.stringify(e.record.configValidation)}`);
  assert(Object.keys(e.record.configBackups).includes(configPath));
  const es = stepNames(e.record);
  assert(es.indexOf('stopped') < es.indexOf('while-stopped') && es.indexOf('while-stopped') < es.indexOf('start'), `E: order ${es}`);
  assertStreamBack('E', e.record);

  // ---- F: --while-stopped edits both configs, then fails -> both restored ----
  const beforeF = fs.readFileSync(configPath, 'utf8');
  const beforeFWorker = fs.existsSync(workerConfigPath) ? fs.readFileSync(workerConfigPath, 'utf8') : null;
  const f = await selfRestart('F', ['--reason', 'candidate drill F', '--requested-by', 'candidate', '--delay', '1', '--force',
    '--while-stopped', `${process.execPath} ${editScript} fail "x"`]);
  receipt.scenarios.F = {...f, whileStopped: f.record.whileStoppedResult, configRestored: fs.readFileSync(configPath, 'utf8') === beforeF,
    workerConfigRestored: beforeFWorker === null || fs.readFileSync(workerConfigPath, 'utf8') === beforeFWorker,
    activeAfter: sudo(['systemctl', 'is-active', unit], {check: false}).stdout.trim()};
  assert.equal(f.record.outcome, 'rolled-back', JSON.stringify(f.record).slice(-2000));
  assert.equal(f.record.whileStoppedResult.rc, 7);
  assert(receipt.scenarios.F.configRestored, 'F: Gateway config not restored byte-for-byte');
  assert(receipt.scenarios.F.workerConfigRestored, 'F: Worker config not restored byte-for-byte');
  assert.equal(receipt.scenarios.F.activeAfter, 'active');
  assert(!stepNames(f.record).includes('start'), 'F: started on the half-edited configs');
  assertStreamBack('F', f.record);

  // ---- G: --if-busy abort with a cron turn running -> untouched ----
  await startBusyTurn();
  const gPid = show('MainPID');
  const beforeG = fs.readFileSync(configPath, 'utf8');
  const g = await selfRestart('G', ['--reason', 'candidate drill G', '--requested-by', 'candidate', '--delay', '0', '--force',
    '--if-busy', 'abort', '--idle-timeout', '20', '--set', 'messages.ackReaction="eyes"']);
  receipt.scenarios.G = {...g, pidUnchanged: show('MainPID') === gPid, configUnchanged: fs.readFileSync(configPath, 'utf8') === beforeG};
  assert.equal(g.record.outcome, 'busy-aborted', JSON.stringify(g.record).slice(-2000));
  assert(receipt.scenarios.G.pidUnchanged && receipt.scenarios.G.configUnchanged, 'G: Gateway or config touched');
  assert(!stepNames(g.record).includes('stopped'));
  await waitFor('busy cron turn to finish', () => !jobByName(busyName).state?.runningAtMs, 180000);
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
