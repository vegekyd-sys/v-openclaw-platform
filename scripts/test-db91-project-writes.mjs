// Gateway-created real projects + concurrent actual tools + durable native writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.env.OPENCLAW_STATE_DIR, root + '/state');
const count = Number(process.argv[2] ?? 2), rounds = Number(process.argv[3] ?? 3);
assert([2, 5].includes(count)); assert(Number.isInteger(rounds) && rounds > 0 && rounds <= 240);
const config = JSON.parse(fs.readFileSync(root + '/state/openclaw.json'));
assert.equal(config.cron.enabled, false); assert.equal(Object.keys(config.channels).length, 0);
assert(config.agents.defaults.maxConcurrent >= count, 'do not count queued requests as active concurrency');
const caseId = 'w' + Date.now(), agentId = 'makaron';
const {GatewayClient} = await import(root + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {client.stop(); reject(Error('connect timeout'));}, 15000);
  client = new GatewayClient({url: 'ws://127.0.0.1:26300', token: config.gateway.auth.token, deviceIdentity: null,
    clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write', 'operator.admin'],
    onHelloOk: () => {clearTimeout(timer); resolve();},
    onConnectError: e => {clearTimeout(timer); client.stop(); reject(e);}});
  client.start();
});
const call = (method, params, timeoutMs = 15000) => client.request(method, params, {timeoutMs});
const runs = [], projects = [], samples = [];
let poll = false, monitor;
try {
  for (let index = 0; index < count; index++) {
    const directory = root + '/workspace/db91-projects/project-' + index;
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {recursive: true, mode: 0o700});
      execFileSync('git', ['init', '-q', directory]);
      execFileSync('git', ['-C', directory, '-c', 'user.name=DB91 Lab', '-c', 'user.email=db91@localhost', 'commit', '--allow-empty', '-qm', 'Isolated native project write acceptance']);
    }
    const project = await call('projects.register', {path: directory, name: 'DB91 Write Project ' + index});
    assert(project.id, 'native project registration did not return an identity');
    const chatSessionKey = `agent:makaron:explicit:db91-project-${caseId}-${index}`;
    const created = await call('sessions.create', {agentId, key: chatSessionKey,
      projectId: project.id, worktree: false, label: 'DB91 ' + caseId + ' ' + index}, 120000);
    projects.push({index, id: project.id, directory, chatSessionKey,
      writeSessionKey: `agent:makaron:explicit:db91-write-${caseId}-${index}`});
    assert(created, 'native project session creation failed');
  }
  const plan = {caseId, agentId, rounds, payloadBytes: 4096, durationMs: rounds > 3 ? 15000 : 500,
    expiresAt: Date.now() + 240000, projects};
  fs.writeFileSync(root + '/tmp/project-write-plan.json', JSON.stringify(plan), {mode: 0o600});
  poll = true;
  monitor = (async () => {
    while (poll) {
      const at = performance.now();
      try {
        const response = await fetch('http://127.0.0.1:26300/healthz', {signal: AbortSignal.timeout(3000)});
        await response.arrayBuffer(); samples.push({at: Date.now(), ms: performance.now() - at, status: response.status});
      } catch {samples.push({at: Date.now(), ms: performance.now() - at, status: null});}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  })();
  const outcomes = await Promise.all(projects.map(async project => {
    const marker = `DB91_FINAL_${caseId}_${project.index}`, startedAt = Date.now();
    const sent = await call('chat.send', {agentId, sessionKey: project.chatSessionKey, deliver: false,
      timeoutMs: 210000, idempotencyKey: marker,
      message: `这是隔离 VLab 的原生多项目写库验收。不要联网、发送消息、委托或修改任何配置。必须且只调用一次 lab_db91_project_write_load 工具，等待工具完成。这是有界测试，工具可能等其他项目抵达同步点。成功后仅回复 ${marker}。失败则如实报告，禁止重试工具。`});
    runs.push({runId: sent.runId, sessionKey: project.chatSessionKey});
    let terminal;
    for (let n = 0; n < 7; n++) {
      terminal = await call('agent.wait', {runId: sent.runId, timeoutMs: 30000}, 40000);
      if (!['timeout', 'running'].includes(terminal.status)) break;
    }
    assert.equal(terminal.status, 'ok', 'actual chat failed');
    const history = await call('chat.history', {agentId, sessionKey: project.chatSessionKey, limit: 30});
    const messages = history.messages, calls = messages.filter(m => m.role === 'assistant').flatMap(m => m.content ?? []).filter(c => ['toolCall', 'tool_use'].includes(c.type));
    assert.equal(calls.filter(c => c.name === 'lab_db91_project_write_load').length, 1);
    assert(messages.some(m => /tool/i.test(m.role) && JSON.stringify(m).includes('DB91_PROJECT_WRITE_OK')));
    assert(messages.some(m => m.role === 'assistant' && (m.content ?? []).some(c => c.type === 'text' && c.text.includes(marker))));
    const evidence = JSON.parse(fs.readFileSync(root + '/workspace/project-write-' + caseId + '-' + project.index + '.json'));
    assert.equal(evidence.verifiedEvents, rounds);
    return {index: project.index, runId: sent.runId, startedAt, endedAt: Date.now(), evidence};
  }));
  const overlapMs = Math.min(...outcomes.map(o => o.evidence.endedAt)) - Math.max(...outcomes.map(o => o.evidence.startedAt));
  assert(overlapMs > 0, 'the actual write workloads never overlapped');
  const result = {caseId, at: new Date().toISOString(), completeDb: true, agentId, projectCount: count,
    roundsPerProject: rounds, workloadOverlapMs: overlapMs, outcomes, samples,
    limitations: 'single screening run; native SDK synthetic workload plus real model/tool/final, not production acceptance'};
  fs.writeFileSync(root + '/workspace/project-write-case-' + caseId + '.json', JSON.stringify(result), {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify({caseId, projectCount: count, verifiedWrites: count * rounds,
    overlapMs, elapsedMs: outcomes.map(o => o.endedAt - o.startedAt), healthFailures: samples.filter(s => s.status !== 200).length}));
} finally {
  poll = false; await monitor;
  for (const run of runs) await call('chat.abort', {...run, agentId}).catch(() => {});
  client.stop();
}
