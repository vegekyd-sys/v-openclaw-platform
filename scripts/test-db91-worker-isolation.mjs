import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.env.OPENCLAW_CONFIG_PATH, root + '/state/openclaw.json');
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
const {mode} = JSON.parse(fs.readFileSync(root + '/tmp/evaluation-mode.json'));
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
const call = (m, p, timeoutMs = 12000) => client.request(m, p, {timeoutMs});
const stamp = Date.now();
const key = `agent:lab:explicit:db91-isolation-${mode}-${stamp}`;
let poll = true;
const samples = [];
const monitor = (async () => {while (poll) {
  const at = Date.now(), start = performance.now();
  try {await call('health', {}, 7000); samples.push({at, ms: performance.now() - start, ok: true});}
  catch {samples.push({at, ms: performance.now() - start, ok: false});}
  await new Promise(r => setTimeout(r, 100));
}})();
try {
  const a = await call('chat.send', {agentId: 'lab', sessionKey: key, deliver: false, idempotencyKey: `isolation-${mode}-${stamp}`, timeoutMs: 120000,
    message: '这是隔离测试。必须且只能调用一次 lab_db91_integrity_probe 工具，参数为空。不要改用 exec，不要重复调用，不操作其他数据，不委托，不发消息。成功后只回复 DB91_ISOLATION_FINAL_OK。'});
  let begin;
  for (let n = 0; n < 900; n++) {
    const file = root + '/tmp/isolation-probe-events.jsonl';
    if (fs.existsSync(file)) begin = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)).find(x => x.sessionKey === key && x.phase === 'begin');
    if (begin) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert(begin, 'model did not reach the requested actual SQLite tool');
  const peerStart = performance.now();
  const b = await call('chat.send', {agentId: 'lab', sessionKey: `agent:lab:explicit:db91-peer-${mode}-${stamp}`, deliver: false,
    idempotencyKey: `peer-${mode}-${stamp}`, timeoutMs: 60000, message: '这是隔离环境响应测试，不要调用工具、不委托，只回复 DB91_PEER_OK。'});
  const peerAdmissionMs = Math.round(performance.now() - peerStart);
  const terminals = await Promise.all([a, b].map(async run => {
    for (let n = 0; n < 4; n++) {
      const result = await call('agent.wait', {runId: run.runId, timeoutMs: 30000}, 40000);
      if (!['running', 'timeout'].includes(result.status)) return result.status;
    }
    return 'timeout';
  }));
  assert.deepEqual(terminals, ['ok', 'ok']);
  const events = fs.readFileSync(root + '/tmp/isolation-probe-events.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(x => x.sessionKey === key);
  const end = events.find(x => x.phase === 'end');
  assert(end && end.checks > 0 && end.elapsedMs >= 2900);
  poll = false; await monitor;
  const relevant = samples.filter(x => x.at + x.ms >= begin.at && x.at <= end.at);
  const result = {mode, at: new Date().toISOString(), probe: {pid: begin.pid, elapsedMs: end.elapsedMs, fullChecks: end.checks}, peerAdmissionMs,
    healthDuringProbe: {samples: relevant.length, failures: relevant.filter(x => !x.ok).length, maxMs: Math.round(Math.max(0, ...relevant.map(x => x.ms)))},
    terminals, limitation: 'bounded synthetic synchronous SQLite load injection; not a reproduction of the entire production incident or data-corruption acceptance'};
  fs.writeFileSync(root + '/workspace/worker-isolation-' + mode + '-' + stamp + '.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {poll = false; await monitor; client.stop();}
