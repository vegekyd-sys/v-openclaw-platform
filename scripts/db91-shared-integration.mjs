// Shared VLab only. All writes require a live integration lease and exact scope.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildPlan} from './patch-db91-integrity-gate.mjs';
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const core = root + '/runtime/npm-global/lib/node_modules/openclaw';
const configFile = root + '/state/openclaw.json';
const evidence = root + '/state/db91-c5-release-20260907';
const unit = 'openclaw-vlab-production-mirror-v8.service';
const owner = 'codex-db91-contention-20260907';
const node = '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dropin = '/etc/systemd/system/' + unit + '.d/95-db91-integrity.conf';
const run = (bin, args, extra = {}) => execFileSync(bin, args, {encoding: 'utf8', timeout: 30000, ...extra}).trim();
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = file => sha(fs.readFileSync(file));
const lease = () => assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner, owner);
const pid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
const mode = process.argv[2];
assert.equal(os.hostname(), 'VM-0-4-ubuntu'); lease();
assert.equal(read(core + '/package.json').version, '2026.9.1'); assert.equal(fs.realpathSync(core), core);
const commit = run('git', ['-c', 'safe.directory=' + source, '-C', source, 'rev-parse', 'HEAD']);
assert.equal(run('git', ['-c', 'safe.directory=' + source, '-C', source, 'status', '--porcelain']), '');
const switches = ['INTEGRITY', 'PROVENANCE', 'MEMORY_SCHEMA', 'MAINTENANCE'];
const flags = enabled => '[Service]\n' + switches.map(flag => 'Environment=OPENCLAW_DB91_' + flag + '_ENABLE=' + enabled + '\n').join('') + 'Environment=OPENCLAW_DB91_INTEGRITY_STATE_ROOT=' + root + '/state\nEnvironment=OPENCLAW_CONFIG_PATH=' + configFile + '\n';
const installers = [['integrity-gate', 'bundle-backup'], ['memory-provenance', 'memory-backup'], ['maintenance-throttle', 'maintenance-backup']];
const patchFiles = () => {
  const integrity = buildPlan(core).map(p => ({filename:p.filename, beforeSha:p.before===null?null:sha(p.before), afterSha:sha(p.after)}));
  const others = installers.slice(1).flatMap(([name]) => JSON.parse(run(node, [source + '/scripts/patch-db91-' + name + '.mjs', 'check', core])).files);
  const plan = [...integrity, ...others];
  assert.equal(plan.length,11); assert.equal(new Set(plan.map(p=>p.filename)).size,11);
  return plan;
};
const record = (phase, data) => {
  const report = {at: new Date().toISOString(), phase, owner, commit, ...data};
  fs.writeFileSync(evidence + '/' + Date.now() + '-' + phase + '.json', JSON.stringify(report, null, 2), {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify(report));
};
if (mode === 'restart-step' || mode === 'rollback-step') {
  const manifest = read(evidence + '/manifest.json'); assert.equal(manifest.commit, commit); assert.equal(pid(), 0, 'never patch an active Gateway');
  assert.equal(hash(configFile), manifest.configSha);
  const action = mode === 'restart-step' ? 'ensure' : 'rollback';
  // Check every file before touching any subset; all three installers also
  // validate exact before/after bytes and preserve unrelated edits.
  for (const p of manifest.files) {
    const current=fs.existsSync(p.filename)?hash(p.filename):null;
    assert(current===p.beforeSha||current===p.afterSha,'concurrent release file change');
  }
  const order=action==='rollback'?[...installers].reverse():installers;
  for (const [name,backup] of order) {
    if(action==='rollback'&&!fs.existsSync(evidence+'/'+backup+'/changes.json')) continue;
    console.log(run(node, [source + '/scripts/patch-db91-' + name + '.mjs', action, core, evidence + '/' + backup], {timeout: 120000}));
  }
  process.exit(0);
}
if (mode === 'prepare-rollback') {
  assert.equal(process.getuid(), 0); const saved = read(evidence + '/manifest.json'); assert.equal(saved.commit, commit);
  assert.equal(hash(configFile), saved.configSha);
  const current = fs.readFileSync(dropin, 'utf8'); assert(current === fs.readFileSync(evidence + '/dropin.staged.txt', 'utf8') || current === flags('1'));
  fs.writeFileSync(dropin, flags('0') + 'ExecStartPre=' + node + ' ' + source + '/scripts/db91-shared-integration.mjs rollback-step\n', {mode: 0o644});
  run('systemctl', ['daemon-reload']); record('rollback-prepared', {nextStep: 'restart the same unit under this lease; recheck active work if Gateway is responsive'}); process.exit(0);
}
assert.equal(process.getuid(), 0, 'management actions require the explicit administrator');
const gatewayPid = pid(); assert(gatewayPid > 1);
for (const pair of fs.readFileSync('/proc/' + gatewayPid + '/environ', 'utf8').split('\0')) {
  const at = pair.indexOf('='); if (at > 0) process.env[pair.slice(0, at)] = pair.slice(at + 1);
}
assert.equal(process.env.OPENCLAW_CONFIG_PATH, configFile);
const configBytes = fs.readFileSync(configFile), cfg = JSON.parse(configBytes);
assert.equal(cfg.gateway.port, 24993); assert.equal(cfg.gateway.reload?.mode, 'off');
const {GatewayClient} = await import(core + '/dist/plugin-sdk/gateway-runtime.js');
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {client?.stop(); reject(Error('Gateway connection timeout'));}, 20000);
  client = new GatewayClient({url: 'ws://127.0.0.1:24993', token: cfg.gateway.auth.token, deviceIdentity: null, clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write'],
    onHelloOk: () => {clearTimeout(timer); resolve();}, onConnectError: error => {clearTimeout(timer); client?.stop(); reject(error);}}); client.start();
});
const call = (method, params = {}, timeoutMs = 45000) => client.request(method, params, {timeoutMs});
const idle = async () => {
  const s = await call('vlab.workers.status'); assert.equal(s.closing, false); assert.equal(s.pending, 0);
  assert(s.workers.length > 0 && s.workers.every(w => w.ready && w.activeCount === 0 && w.queued === 0), 'Worker business is active');
  const sessions = await call('sessions.list', {limit: 1000}); assert(!sessions.hasMore, 'uninspected sessions');
  assert(!(sessions.sessions ?? []).some(s => s.hasActiveRun || ['running', 'queued', 'busy', 'active'].includes(s.status)), 'active session business');
  return {pending: s.pending, workers: s.workers.map(w => ({pid: w.pid, ready: w.ready, activeCount: w.activeCount, queued: w.queued}))};
};
try {
  if (mode === 'inspect') {
    console.log(JSON.stringify({owner, commit, gatewayPid, coreVersion: '2026.9.1', configSha: sha(configBytes), workerPaths: cfg.plugins.load.paths.filter(p => p.includes('worker-')), idle: await idle(), patchFiles: patchFiles().map(p => path.relative(core, p.filename))}));
  } else if (mode === 'stage') {
    const before = await idle(); assert(!fs.existsSync(evidence) && !fs.existsSync(dropin));
    const plan = patchFiles(); const st = fs.statSync(configFile);
    for (const p of plan.filter(p => p.beforeSha !== null)) assert.equal(fs.statSync(p.filename).uid, st.uid, 'restart step must own its exact native files');
    const voiceFile = core + '/dist/agent-command-DPfawBbr.js';
    assert.equal(hash(voiceFile), 'f914243041fab139683a7fbf74ed6817da3312791e89dc3586d981e88c83df4a', 'preserve identified voice CAS increment');
    fs.mkdirSync(evidence, {mode: 0o700}); fs.chownSync(evidence, st.uid, st.gid);
    const saved = {owner, commit, gatewayPid, configSha: sha(configBytes), voiceFile, voiceSha: hash(voiceFile), files: plan};
    fs.writeFileSync(evidence + '/manifest.json', JSON.stringify(saved, null, 2), {mode: 0o600}); fs.chownSync(evidence + '/manifest.json', st.uid, st.gid);
    fs.writeFileSync(evidence + '/original-config.json', configBytes, {mode: 0o600});
    fs.writeFileSync(evidence + '/unit.before.txt', run('systemctl', ['cat', unit]), {mode: 0o600});
    await idle(); lease(); assert.equal(pid(), gatewayPid); assert.equal(hash(configFile), saved.configSha);
    const body = flags('1') + 'ExecStartPre=' + node + ' ' + source + '/scripts/db91-shared-integration.mjs restart-step\n';
    fs.mkdirSync(path.dirname(dropin), {recursive: true}); fs.writeFileSync(dropin, body, {mode: 0o644, flag: 'wx'});
    fs.writeFileSync(evidence + '/dropin.staged.txt', body, {mode: 0o600});
    run('systemctl', ['daemon-reload']); assert.equal(pid(), gatewayPid);
    record('staged', {gatewayPid, before, configUnchanged: true, nativeFilesNotYetPatched: true});
  } else if (mode === 'restart') {
    const saved = read(evidence + '/manifest.json'); assert.equal(commit, saved.commit); assert.equal(gatewayPid, saved.gatewayPid);
    assert.equal(fs.readFileSync(dropin, 'utf8'), fs.readFileSync(evidence + '/dropin.staged.txt', 'utf8'));
    await idle(); lease(); assert.equal(hash(configFile), saved.configSha);
    client.stop(); run('systemctl', ['restart', unit], {timeout: 120000});
    record('restart-requested', {beforePid: gatewayPid, afterPid: pid(), businessAcceptance: false});
  } else if (mode === 'probe') {
    await idle();
    const stamp = Date.now(), key = 'agent:makaron:explicit:db91-shared-' + stamp;
    const marker = 'DB91_SHARED_' + stamp; let runId, terminal;
    try {
      const sent = await call('chat.send', {agentId: 'makaron', sessionKey: key, deliver: false, idempotencyKey: key, timeoutMs: 180000,
        message: `用户授权的VLab内部数据库修复验收。不要读写业务文件、记忆或配置，不访问网络或浏览器，不委托，不发外部消息。只调用exec执行 printf '${marker}_TOOL\\n'。看到真实结果后只回复 ${marker}_FINAL。`}); runId = sent.runId;
      for (let i = 0; i < 6; i++) {const r = await call('agent.wait', {runId, timeoutMs: 30000}); if (!['running', 'timeout'].includes(r.status)) {terminal = r.status; break;}}
      assert.equal(terminal, 'ok');
      const h = await call('chat.history', {agentId: 'makaron', sessionKey: key, limit: 30}), messages = h.messages ?? [];
      assert(messages.some(m => /tool/i.test(m.role) && JSON.stringify(m).includes(marker + '_TOOL')));
      assert(messages.some(m => m.role === 'assistant' && (m.content ?? []).some(c => c.type === 'text' && c.text.includes(marker + '_FINAL'))));
      assert(!messages.some(m => m.isError || m.stopReason === 'error'));
      assert.equal(h.sessionInfo?.agentRuntime?.id, 'vlab-worker');
      record('probe', {gatewayPid, runId, key, elapsedMs: Date.now() - stamp, realToolResult: true, finalReply: true, externalDelivery: false, runtime: h.sessionInfo.agentRuntime.id, idle: await idle()});
    } finally {if (runId && !terminal) await call('chat.abort', {sessionKey: key, runId}).catch(() => {});}
  } else if (mode === 'verify') {
    const saved = read(evidence + '/manifest.json'); assert.equal(hash(configFile), saved.configSha); assert.equal(hash(saved.voiceFile), saved.voiceSha);
    for (const p of saved.files) assert.equal(hash(p.filename), p.afterSha);
    assert(process.env.OPENCLAW_DB91_INTEGRITY_EPOCH && process.env.OPENCLAW_DB91_INTEGRITY_DIR?.startsWith(root + '/state/.db91-integrity/'));
    for(const flag of switches) assert.equal(process.env['OPENCLAW_DB91_'+flag+'_ENABLE'],'1');
    const receipts = fs.readdirSync(process.env.OPENCLAW_DB91_INTEGRITY_DIR).filter(n => n.endsWith('.json') && !n.includes('revoked'));
    assert(receipts.length > 0); const status = await idle();
    // Retain only the environment switch after successful activation. Future
    // restarts no longer depend on this temporary integration control checkout.
    const current = fs.readFileSync(dropin, 'utf8'); assert(current === fs.readFileSync(evidence + '/dropin.staged.txt', 'utf8') || current === flags('1'));
    fs.writeFileSync(dropin, flags('1'), {mode: 0o644}); run('systemctl', ['daemon-reload']); assert.equal(pid(), gatewayPid);
    record('verified', {gatewayPid, configUnchanged: true, voicePatchPreserved: true, installedFiles: saved.files.length, preflightReceipts: receipts.length, idle: status});
  } else throw Error('Expected inspect, stage, restart, probe, verify, restart-step or rollback-step');
} finally {client?.stop();}
