// Same full shared Agent database. Dedicated sessions; DeepSeek only; no outward delivery.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const [owner, countArg = '5', label = 'profile-baseline'] = process.argv.slice(2), count = Number(countArg);
assert(owner && /^[\w-]+$/.test(owner)); assert(Number.isInteger(count) && count >= 1 && count <= 15); assert(/^[a-z0-9-]+$/.test(label));
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const run = (bin, args) => execFileSync(bin, args, {encoding: 'utf8', timeout: 10000}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function guard() {assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, owner); const d = fs.statfsSync(base); assert(d.bavail * d.bsize >= 3 * 1024 ** 3, 'Data-disk reserve below 3 GiB');}
guard();
const pid = Number(run('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'])); assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(v => v.includes('=')).map(v => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)])); Object.assign(process.env, env);
const cfg = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)), model = 'deepseek/deepseek-v4-pro'; assert.equal(cfg.gateway.port, 24993);
for (const c of [cfg, JSON.parse(fs.readFileSync(cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath))]) {
  assert.equal(c.agents.defaults.model.primary, model); assert.deepEqual(c.agents.defaults.model.fallbacks, []);
  const a = c.agents.entries.makaron.model; assert.equal(typeof a === 'string' ? a : a.primary, model); if (typeof a === 'object') assert.deepEqual(a.fallbacks, []);
}
const cg = '/sys/fs/cgroup' + fs.readFileSync('/proc/' + pid + '/cgroup', 'utf8').trim().split('::')[1];
const resources = () => ({memory: Number(fs.readFileSync(cg + '/memory.current')), memoryEvents: fs.readFileSync(cg + '/memory.events', 'utf8'), cpu: fs.readFileSync(cg + '/cpu.stat', 'utf8')});
const {GatewayClient} = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const rows = [], byId = new Map(); let client, before, saved = false;
function save(failure) {
  const summary = {label, count, pid, before, after: resources(), rows, ...(failure ? {failure} : {})};
  const output = '/srv/vlab-production-mirror/labs/control/concurrency-profile-' + label + '-' + Date.now() + '.json';
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', {flag: 'wx', mode: 0o600}); saved = true;
  console.log(JSON.stringify({output, ...summary}));
}
async function idle() {const s = await client.request('vlab.workers.status', {}); assert(!s.pending && s.workers.every(w => !w.activeCount && !w.queued && !w.detachedTaskCount), 'Shared Gateway is busy');}
try {
  await new Promise((resolve, reject) => {
    client = new GatewayClient({url: 'ws://127.0.0.1:24993', token: cfg.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]), deviceIdentity: null, clientName: 'cli', mode: 'cli', caps: ['tool-events'], scopes: ['operator.read', 'operator.write', 'operator.admin'], onHelloOk: resolve, onConnectError: reject,
      onEvent(e) {const r = byId.get(e.payload?.runId); if (!r?.start) return;
        if (e.event === 'agent' && e.payload?.stream === 'assistant' && String(e.payload.data?.text ?? e.payload.data?.delta ?? '').trim() && !r.firstBody) r.firstBody = Date.now() - r.start;
        if (e.event === 'chat' && ['final', 'error', 'aborted'].includes(e.payload?.state)) {
          r.terminal = e.payload.state; r.total = Date.now() - r.start;
          if (r.terminal === 'error') r.errorClass = /database is locked/i.test(String(e.payload?.errorMessage ?? '')) ? 'database-locked' : 'terminal-error';
        }
      }}); client.start();
  });
  await idle(); const stamp = Date.now();
  for (let i = 0; i < count; i++) {
    const r = {id: randomUUID(), key: 'agent:makaron:explicit:concurrency-fix-' + label + '-' + stamp + '-' + i};
    await client.request('sessions.patch', {key: r.key, agentId: 'makaron', model});
    await client.request('sessions.messages.subscribe', {agentId: 'makaron', key: r.key}); rows.push(r); byId.set(r.id, r);
  }
  guard(); before = resources();
  console.log(JSON.stringify({event: 'start', label, count, pid, at: Date.now()}));
  await Promise.all(rows.map(async r => {r.start = Date.now(); await client.request('chat.send', {agentId: 'makaron', sessionKey: r.key, message: '这是 VLab 并发验收，请只回复“收到，可以开始。”，不调用工具、不执行其他任务。编号 ' + r.id, deliver: false, idempotencyKey: r.id, timeoutMs: 120000}); r.ackMs = Date.now() - r.start;}));
  const deadline = Date.now() + 130000;
  while (rows.some(r => !r.terminal) && Date.now() < deadline) {guard(); assert(resources().memory < 12.5 * 1024 ** 3, 'Memory safety limit'); await sleep(250);}
  // Keep verification history reads outside the timed CPU profile window.
  if (label.startsWith('profile-')) await sleep(Math.max(0, rows[0].start + 28000 - Date.now()));
  for (const r of rows) {
    if (r.terminal !== 'final') {r.expectedBody = false; continue;}
    const h = await client.request('chat.history', {agentId: 'makaron', sessionKey: r.key, limit: 3});
    const a = h.messages?.filter(m => m.role === 'assistant').at(-1), body = a?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') ?? '';
    assert.equal(a?.provider, 'deepseek'); assert.equal(a?.model, 'deepseek-v4-pro'); assert(body.includes('收到，可以开始。')); assert.equal(a?.stopReason, 'stop');
    r.model = a.model; r.thinking = h.sessionInfo?.thinkingLevel; r.expectedBody = true;
  }
  save();
  await idle();
  assert(rows.every(r => r.terminal === 'final' && r.expectedBody), 'Batch failed; evidence saved, no escalation');
} catch (error) {
  if (!saved && rows.some(r => r.start)) save({name: error.name, message: String(error.message).slice(0, 300)});
  throw error;
} finally {for (const r of rows) if (r.start && !r.terminal) await client?.request('chat.abort', {sessionKey: r.key, runId: r.id}).catch(() => {}); client?.stop();}
