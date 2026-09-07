import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.env.OPENCLAW_CONFIG_PATH, root + '/state/openclaw.json');
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
const {mode} = JSON.parse(fs.readFileSync(root + '/tmp/evaluation-mode.json'));
const verifyGate = process.argv.includes('--verify-gate');
const agentId = process.argv.includes('--complete-db') ? 'makaron' : 'lab';
const {GatewayClient} = await import(root + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {client.stop(); reject(Error('connect timeout'));}, 15000);
  client = new GatewayClient({url: 'ws://127.0.0.1:26300', token: config.gateway.auth.token, deviceIdentity: null,
    clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write'],
    onHelloOk: () => {clearTimeout(timer); resolve();},
    onConnectError: e => {clearTimeout(timer); client.stop(); reject(e);}});
  client.start();
});
const call = (method, params, timeoutMs = 12000) => client.request(method, params, {timeoutMs});
const samples = [];
let poll = true;
const health = (async () => {
  while (poll) {
    const at = performance.now();
    try {await call('health', {}, 5000); samples.push({ms: performance.now() - at, ok: true});}
    catch {samples.push({ms: performance.now() - at, ok: false});}
    await new Promise(r => setTimeout(r, 500));
  }
})();
const stamp = Date.now();
try {
  const started = performance.now();
  const outcomes = await Promise.all(['A', 'B'].map(async label => {
    const key = `agent:${agentId}:explicit:db91-${mode}-${label}-${stamp}`;
    const marker = `DB91_${mode}_${label}_${stamp}`;
    const at = performance.now();
    const admitted = await call('chat.send', {agentId, sessionKey: key, deliver: false,
      idempotencyKey: marker, timeoutMs: 150000,
      message: `这是隔离 VLab 并发验收，不处理真实业务，不联网，不发消息，不委托，不修改配置。必须先用 exec 执行下面的命令：sleep 4; printf '${marker}_TOOL\\n'。${verifyGate ? '然后必须调用 lab_db91_verification_status 工具查询本执行进程的校验状态，不调用其他 probe。' : ''}工具完成后只回复 ${marker}_FINAL。`});
    let terminal;
    for (let n = 0; n < 5; n++) {
      terminal = await call('agent.wait', {runId: admitted.runId, timeoutMs: 30000}, 40000);
      if (!['timeout', 'running'].includes(terminal.status)) break;
    }
    assert.equal(terminal.status, 'ok', `${label} did not complete`);
    let history;
    for (let n = 0; n < 10; n++) {
      try {history = await call('chat.history', {agentId, sessionKey: key, limit: 30}); break;}
      catch (e) {if (!e.retryable || n === 9) throw e; await new Promise(r => setTimeout(r, Math.max(250, e.retryAfterMs ?? 250)));}
    }
    const serialized = JSON.stringify(history.messages);
    const assistant = history.messages.filter(m => m.role === 'assistant');
    const toolCalls = assistant.flatMap(m => m.content ?? []).filter(c => ['toolCall', 'tool_use'].includes(c.type));
    const final = assistant.flatMap(m => m.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    assert(toolCalls.some(c => c.name === 'exec'), `${label} missing actual exec call`);
    assert(history.messages.some(m => /tool/i.test(m.role) && JSON.stringify(m).includes(marker + '_TOOL')), `${label} missing actual tool result`);
    assert(final.includes(marker + '_FINAL'), `${label} missing final reply`);
    let gateStatus;
    if (verifyGate) {
      assert(toolCalls.some(c => c.name === 'lab_db91_verification_status'));
      const result = history.messages.filter(m => /tool/i.test(m.role)).flatMap(m => m.content ?? []).filter(c => c.type === 'text').map(c => {try {return JSON.parse(c.text);} catch {return null;}}).find(r => r?.marker === 'DB91_VERIFICATION_STATUS');
      assert(result, 'missing actual verification status tool result');
      assert.equal(result.epochPresent, true);
      assert.equal(result.full, 0, 'the native execution process repeated a full scan');
      assert(result.reused >= 1, 'native process did not reuse preflight');
      gateStatus = result;
    }
    const other = label === 'A' ? 'B' : 'A';
    assert(!serialized.includes(`DB91_${mode}_${other}_${stamp}`), 'cross-session transcript leakage');
    return {label, runId: admitted.runId, sessionKey: key, elapsedMs: Math.round(performance.now() - at), runtime: history.sessionInfo?.agentRuntime?.id, toolCalls: toolCalls.length, gateStatus, toolResultAndFinal: true, messages: history.messages.length};
  }));
  const elapsedMs = Math.round(performance.now() - started);
  const workers = mode === 'native' ? null : await call('vlab.workers.status', {});
  if (verifyGate && workers) {
    const pids = workers.workers.map(w => w.pid);
    for (const outcome of outcomes) assert(pids.includes(outcome.gateStatus.pid), 'status tool did not run in the native Worker process');
    if (mode === 'multi') assert.equal(new Set(outcomes.map(o => o.gateStatus.pid)).size, 2, 'multi acceptance must exercise both cold processes');
  }
  poll = false; await health;
  const sorted = samples.filter(s => s.ok).map(s => s.ms).sort((a, b) => a - b);
  const result = {mode, agentId, at: new Date().toISOString(), elapsedMs, outcomes,
    health: {samples: samples.length, failures: samples.filter(s => !s.ok).length, p95Ms: Math.round(sorted[Math.floor(sorted.length * .95)] ?? 0), maxMs: Math.round(sorted.at(-1) ?? 0)},
    workerProcesses: workers?.workers?.map(w => ({slot: w.slot, pid: w.pid, active: w.active})),
    limitation: agentId === 'makaron' ? 'complete VLab snapshot, two-session tool/reply and exact-process verification reuse; not high-concurrency capacity, channel, or production acceptance' : 'two-session tool/reply baseline only; not fault, heavy-database, channel, or production acceptance'};
  fs.writeFileSync(root + '/workspace/worker-evaluation-' + mode + '-' + stamp + '.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {poll = false; await health; client.stop();}
