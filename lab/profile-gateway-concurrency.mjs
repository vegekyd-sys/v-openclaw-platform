// Owned, bounded VLab diagnostics. No runtime patch/config change or outward delivery.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const [owner, countArg = '5', label = 'baseline'] = process.argv.slice(2);
const count = Number(countArg);
assert(owner && /^[\w-]+$/.test(owner));
assert(Number.isInteger(count) && count >= 1 && count <= 15);
assert(/^[a-z0-9-]+$/.test(label));
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const run = (bin, args) => execFileSync(bin, args, {encoding: 'utf8', timeout: 10000}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function guard() {
  assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, owner);
  const disk = fs.statfsSync(base);
  assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3, 'Data-disk reserve below 3 GiB');
}
guard();
const pid = Number(run('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value']));
assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(v => v.includes('=')).map(v => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]));
Object.assign(process.env, env);
const cfg = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH));
assert.equal(cfg.gateway.port, 24993);
const model = 'deepseek/deepseek-v4-pro';
for (const c of [cfg, JSON.parse(fs.readFileSync(cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath))]) {
  assert.equal(c.agents.defaults.model.primary, model);
  assert.deepEqual(c.agents.defaults.model.fallbacks, []);
  const a = c.agents.entries.makaron.model;
  assert.equal(typeof a === 'string' ? a : a.primary, model);
  if (typeof a === 'object') assert.deepEqual(a.fallbacks, []);
}
const cg = '/sys/fs/cgroup' + fs.readFileSync('/proc/' + pid + '/cgroup', 'utf8').trim().split('::')[1];
const resources = () => ({memory: Number(fs.readFileSync(cg + '/memory.current')), memoryEvents: fs.readFileSync(cg + '/memory.events', 'utf8'), cpu: fs.readFileSync(cg + '/cpu.stat', 'utf8')});
const {GatewayClient} = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const rows = [], byId = new Map();
let client, inspector, profileStarted = false, inspectorOwned = false, nextId = 0;
const pending = new Map();
function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {pending.delete(id); reject(new Error('Inspector timeout: ' + method));}, 15000);
    pending.set(id, {resolve: x => {clearTimeout(timer); resolve(x);}, reject: x => {clearTimeout(timer); reject(x);}});
    inspector.send(JSON.stringify({id, method, params}));
  });
}
function summarize(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map();
  for (const n of nodes.values()) for (const child of n.children ?? []) parents.set(child, n.id);
  const self = new Map(), inclusive = new Map();
  const frame = n => `${n.callFrame.functionName || '(anonymous)'} @ ${n.callFrame.url.split('/').at(-1)}:${n.callFrame.lineNumber + 1}`;
  for (let i = 0; i < (profile.samples ?? []).length; i++) {
    const id = profile.samples[i], dt = profile.timeDeltas[i];
    const name = frame(nodes.get(id)); self.set(name, (self.get(name) ?? 0) + dt);
    let current = id; const seen = new Set();
    while (current) {const f = frame(nodes.get(current)); if (!seen.has(f)) {inclusive.set(f, (inclusive.get(f) ?? 0) + dt); seen.add(f);} current = parents.get(current);}
  }
  const top = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([frame, us]) => ({frame, ms: us / 1000}));
  return {durationMs: (profile.endTime - profile.startTime) / 1000, topSelf: top(self), topInclusive: top(inclusive)};
}
async function idle() {
  const status = await client.request('vlab.workers.status', {});
  assert(!status.pending && status.workers.every(w => !w.activeCount && !w.queued && !w.detachedTaskCount), 'Shared Gateway is busy');
}
let summary;
try {
  await new Promise((resolve, reject) => {
    client = new GatewayClient({url: 'ws://127.0.0.1:24993', token: cfg.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]), deviceIdentity: null, clientName: 'cli', mode: 'cli', caps: ['tool-events'], scopes: ['operator.read', 'operator.write', 'operator.admin'], onHelloOk: resolve, onConnectError: reject,
      onEvent(e) {
        const r = byId.get(e.payload?.runId); if (!r?.start) return;
        if (e.event === 'agent' && e.payload?.stream === 'assistant' && String(e.payload.data?.text ?? e.payload.data?.delta ?? '').trim() && !r.firstBody) r.firstBody = Date.now() - r.start;
        if (e.event === 'chat' && ['final', 'error', 'aborted'].includes(e.payload?.state)) {r.terminal = e.payload.state; r.total = Date.now() - r.start;}
      }}); client.start();
  });
  await idle();
  for (let i = 0; i < count; i++) {
    const r = {id: randomUUID(), key: 'agent:makaron:explicit:concurrency-fix-' + label + '-' + Date.now() + '-' + i};
    await client.request('sessions.patch', {key: r.key, agentId: 'makaron', model});
    await client.request('sessions.messages.subscribe', {agentId: 'makaron', key: r.key});
    rows.push(r); byId.set(r.id, r);
  }
  // SIGUSR1 starts the Node inspector on its default loopback port only. Refuse
  // custom inspector flags/options or an existing listener; never attach to another owner.
  assert(!fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').includes('--inspect'));
  assert(!String(env.NODE_OPTIONS ?? '').includes('--inspect'));
  assert.equal(run('ss', ['-H', '-ltn', 'sport = :9229']), '');
  guard(); process.kill(pid, 'SIGUSR1'); inspectorOwned = true;
  let endpoint;
  for (let i = 0; i < 50 && !endpoint; i++) {try {const list = await (await fetch('http://127.0.0.1:9229/json/list')).json(); endpoint = list[0]?.webSocketDebuggerUrl;} catch {} if (!endpoint) await sleep(100);}
  assert(endpoint?.startsWith('ws://127.0.0.1:9229/'));
  inspector = new WebSocket(endpoint);
  inspector.onmessage = e => {const m = JSON.parse(e.data), p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);};
  await new Promise((resolve, reject) => {inspector.onopen = resolve; inspector.onerror = reject;});
  const identity = await request('Runtime.evaluate', {expression: '({pid:process.pid, closeAvailable:typeof process.getBuiltinModule("node:inspector").close})', returnByValue: true});
  assert.deepEqual(identity.result.value, {pid, closeAvailable: 'function'});
  await request('Profiler.enable'); await request('Profiler.setSamplingInterval', {interval: 1000}); await request('Profiler.start'); profileStarted = true;
  const before = resources();
  await Promise.all(rows.map(async r => {
    r.start = Date.now();
    await client.request('chat.send', {agentId: 'makaron', sessionKey: r.key, message: '这是 VLab 并发验收，请只回复“收到，可以开始。”，不调用工具、不执行其他任务。编号 ' + r.id, deliver: false, idempotencyKey: r.id, timeoutMs: 120000});
    r.ackMs = Date.now() - r.start;
  }));
  const deadline = Date.now() + 130000;
  while (rows.some(r => !r.terminal) && Date.now() < deadline) {guard(); assert(resources().memory < 12.5 * 1024 ** 3, 'Memory safety limit'); await sleep(250);}
  const {profile} = await request('Profiler.stop'); profileStarted = false;
  for (const r of rows) {
    assert.equal(r.terminal, 'final');
    const h = await client.request('chat.history', {agentId: 'makaron', sessionKey: r.key, limit: 3});
    const a = h.messages?.filter(m => m.role === 'assistant').at(-1);
    const body = a?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') ?? '';
    assert.equal(a?.provider, 'deepseek'); assert.equal(a?.model, 'deepseek-v4-pro');
    assert(body.includes('收到，可以开始。')); assert.equal(a?.stopReason, 'stop');
    r.model = a.model; r.thinking = h.sessionInfo?.thinkingLevel; r.expectedBody = true;
  }
  summary = {label, count, pid, before, after: resources(), rows, profile: summarize(profile)};
  const output = base + '/../../control/concurrency-profile-' + label + '-' + Date.now() + '.json';
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({output, ...summary}));
} finally {
  if (profileStarted) await request('Profiler.stop').catch(() => {});
  if (inspector?.readyState === WebSocket.OPEN && inspectorOwned) {
    await request('Runtime.evaluate', {expression: 'setTimeout(()=>process.getBuiltinModule("node:inspector").close(),250).unref();true', returnByValue: true}).catch(() => {});
    inspector.close(); await sleep(500);
    assert.equal(run('ss', ['-H', '-ltn', 'sport = :9229']), '', 'Inspector did not close');
    console.log(JSON.stringify({inspectorClosed: true, pidUnchanged: Number(run('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'])) === pid}));
  }
  for (const r of rows) if (r.start && !r.terminal) await client?.request('chat.abort', {sessionKey: r.key, runId: r.id}).catch(() => {});
  client?.stop();
}
