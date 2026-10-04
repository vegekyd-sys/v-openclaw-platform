// Candidate test: V's web_search on Parallel's free Search MCP (lab/release-files/web-search-parallel).
//
// Installs @openclaw/parallel-plugin@2026.9.1 into the private state the way V will
// (`openclaw plugins install … --pin`), applies config.mjs to the Gateway and Worker configs,
// boots a private Gateway with one Worker and runs real agent turns that need the web, on V's
// model setup (deepseek-flash: vlab-worker on the Gateway, openclaw in the Worker).
// PROVIDER=parallel-free  the change; PROVIDER=gemini  control on today's provider.
// Passes when every turn called web_search in the Worker on the expected provider, got results,
// and ended with a visible reply. Reports per-turn time, search time and tool result size.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {useParallelWebSearch} from '../release-files/web-search-parallel/config.mjs';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, 'candidate runtime environment is required');
const provider = process.env.PROVIDER ?? 'parallel-free';
assert(['parallel-free', 'gemini'].includes(provider), `bad PROVIDER ${provider}`);
const MODEL = 'deepseek/deepseek-flash';
const dist = path.join(runtime, 'openclaw', 'dist');
const cli = path.join(dist, 'index.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, '$1$2[redacted]');
for (const [key, dir] of Object.entries({TMPDIR: 'tmp', XDG_CACHE_HOME: 'cache', npm_config_cache: 'npm-cache'})) {
  process.env[key] = path.join(process.env.VLAB_CANDIDATE_DATA, dir);
  fs.mkdirSync(process.env[key], {recursive: true, mode: 0o700});
}

// ---- install the plugin exactly as production will, and see what it touches ----
const configBeforeInstall = fs.readFileSync(configPath, 'utf8');
let install = null;
if (provider === 'parallel-free') {
  const r = spawnSync(process.execPath, [cli, 'plugins', 'install', '@openclaw/parallel-plugin@2026.9.1', '--pin', '--force',
    '--accept-capabilities', '--acknowledge-install-policy-warning'], {env: process.env, encoding: 'utf8', timeout: 300000, maxBuffer: 16 << 20});
  assert.equal(r.status, 0, redact(`${r.stdout}\n${r.stderr}`).slice(-4000));
  const projects = fs.readdirSync(path.join(stateDir, 'npm/projects')).filter((p) => p.includes('parallel'));
  assert.equal(projects.length, 1, `parallel npm project not found: ${projects}`);
  const after = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const before = JSON.parse(configBeforeInstall);
  install = {project: projects[0], configChanged: fs.readFileSync(configPath, 'utf8') !== configBeforeInstall,
    pluginsBefore: {allow: before.plugins?.allow?.includes?.('parallel') ?? null, entry: before.plugins?.entries?.parallel ?? null},
    pluginsAfter: {allow: after.plugins?.allow?.includes?.('parallel') ?? null, entry: after.plugins?.entries?.parallel ?? null, installs: after.plugins?.installs?.parallel ?? null}};
}

// ---- V's model routing, one Worker, no channels, then the change on both config copies ----
function asProduction(config, runtimeId) {
  const model = {primary: MODEL, fallbacks: []};
  const perAgent = {alias: 'deepseek', agentRuntime: {id: runtimeId}, params: {thinking: 'high'}};
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) {
    config.agents.entries.makaron.model = model;
    (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent;
  }
  // The candidate runtime does not carry the external codex plugin (see midturn-precheck.mjs).
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  config.tools.web.search.cacheTtlMinutes = 0;
  if (provider === 'parallel-free') {
    const {config: switched, changed} = useParallelWebSearch(config);
    assert(changed || config.tools.web.search.provider === 'parallel-free');
    return switched;
  }
  assert.equal(config.tools.web.search.provider, 'gemini', 'control expects shared VLab on gemini');
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, 'utf8')), 'vlab-worker');
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, 'candidate Gateway port is missing');
config.channels = {};
config.cron = {...(config.cron ?? {}), enabled: false};
const workerPlugin = config.plugins.entries?.['vlab-agent-worker-isolation']?.config;
assert(workerPlugin, 'worker isolation plugin is not configured; production runs turns in Workers');
Object.assign(workerPlugin, {minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0});
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith('..'), 'candidate Worker config escaped state');
const workerConfig = asProduction(JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), 'utf8')
  .replaceAll(sharedState, stateDir)
  .replaceAll('/srv/vlab-production-mirror/labs/instances/db91-parity/runtime', runtime)), 'openclaw');
workerConfig.channels = {};
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), {recursive: true});
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, {mode: 0o600});
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});

// ---- private Gateway ----
const env = {...process.env, OPENCLAW_GATEWAY_PORT: String(port)};
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ['--max-old-space-size=8192', cli, 'gateway', '--port', String(port)], {env, stdio: ['ignore', 'pipe', 'pipe']});
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding('utf8');
    s.on('data', (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({at: Date.now(), line});
      if (lines.length > 40000) lines.splice(0, lines.length - 40000);
    });
  }
}
let client;
async function connectGateway() {
  const {GatewayClient} = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join('\n'))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error('hello timeout')); }, 5000);
        client = new GatewayClient({url: `ws://127.0.0.1:${port}`, token: config.gateway?.auth?.token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
          onHelloOk: () => { clearTimeout(timeout); resolve(); }, onConnectError: (e) => { clearTimeout(timeout); reject(e); }});
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1000); }
  }
  throw lastError ?? new Error('candidate Gateway did not become ready');
}

// ---- what one turn did, from the private agent database ----
const dbPath = path.join(stateDir, 'agents', 'makaron', 'agent', 'openclaw-agent.sqlite');
function observe(sessionKey, sinceMs) {
  const db = new DatabaseSync(dbPath, {readOnly: true});
  const windows = db.prepare('SELECT session_id FROM session_windows WHERE session_key = ?').all(sessionKey).map((r) => r.session_id);
  const events = windows.length ? db.prepare(`SELECT event_json, created_at FROM transcript_events
    WHERE session_id IN (${windows.map(() => '?').join(',')}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs) : [];
  db.close();
  const calls = new Map(); const searches = [];
  for (const e of events) {
    const j = JSON.parse(e.event_json);
    const m = j.type === 'message' ? j.message : null;
    if (m?.role === 'assistant') {
      for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === 'toolCall') calls.set(c.id, {name: c.name, args: c.arguments, at: e.created_at});
    } else if (m?.role === 'toolResult') {
      const call = calls.get(m.toolCallId) ?? {};
      if ((m.toolName ?? call.name) !== 'web_search') continue;
      const text = JSON.stringify(m.content ?? '');
      searches.push({args: call.args, ms: call.at ? e.created_at - call.at : null, chars: text.length,
        provider: text.match(/\\?"provider\\?":\s*\\?"([a-z-]+)/u)?.[1] ?? null,
        results: Number(text.match(/\\?"count\\?":\s*(\d+)/u)?.[1] ?? NaN), error: m.isError === true || /\\?"error\\?":/u.test(text)});
    }
  }
  return {toolCalls: [...calls.values()].map((c) => c.name), searches};
}

const PROMPT_SETS = {
  smoke: [
    '（自动化测试）帮我查一下扬州小盘谷的地址、开放时间和门票价格。',
    '（自动化测试）Feishu 开放平台发送消息接口的 HTTP 路径和必填的查询参数是什么？请搜索官方文档后回答。',
    '（自动化测试）OpenAI DevDay 2026 是哪天举办的？发布了什么？请联网搜索后回答。',
  ],
  // Chinese local / company / procedure questions, the categories where Parallel's ranking looked noisy.
  zh: [
    '（自动化测试）上海百联ZX创趣场在哪里？营业时间是几点到几点？',
    '（自动化测试）从上海虹桥坐高铁到千岛湖站有直达车吗？大概要多久？',
    '（自动化测试）广东热立方科技股份有限公司主要做什么产品？成立于哪一年？',
    '（自动化测试）森马服饰 2026 年半年报的营收和净利润是多少？',
    '（自动化测试）大陆居民第一次办往来台湾通行证要准备什么材料？一般几个工作日能拿到？',
    '（自动化测试）上海迪士尼现在的门票价格大概多少？分哪几档？',
    '（自动化测试）杭州灵隐寺的开放时间和门票价格是多少？',
    '（自动化测试）钛动科技是做什么的？最近有没有上市的消息？',
  ],
};
const PROMPTS = PROMPT_SETS[process.env.PROMPT_SET ?? 'smoke'];
assert(PROMPTS, `bad PROMPT_SET ${process.env.PROMPT_SET}`);
async function runTurn(prompt, index) {
  const sessionKey = `agent:makaron:web-search-${provider}-${Date.now()}-${index}`;
  const started = Date.now();
  const child = spawn(process.execPath, [cli, 'agent', '--agent', 'makaron', '--session-key', sessionKey, '--model', MODEL,
    '--message', prompt, '--json', '--timeout', '600'], {env, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on('close', resolve));
  let meta; try { meta = JSON.parse(stdout.slice(stdout.indexOf('{'))); } catch {}
  const reply = String((meta?.result?.payloads ?? meta?.payloads ?? []).map((p) => p.text ?? '').join('\n'));
  const workerSearchLogs = lines.filter((l) => l.at >= started && /\[vlab-worker:\d+\].*(web.search|parallel|web-search-preparation)/iu.test(l.line)).length;
  return {sessionKey, exit, secs: Math.round((Date.now() - started) / 100) / 10, reply: reply.slice(0, 400), replyChars: reply.length,
    ...observe(sessionKey, started), workerSearchLogs, stderr: exit === 0 ? undefined : redact(stderr).slice(-800)};
}

startGateway();
const results = [];
try {
  await connectGateway();
  const status = await client.request('vlab.workers.status', {}).catch((e) => ({error: String(e.message ?? e)}));
  for (const [i, p] of PROMPTS.entries()) results.push(await runTurn(p, i));
  const errors = lines.filter((l) => /parallel|web_search|web-search/iu.test(l.line) && /error|fail|denied|not allowed|blocked/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-20);
  console.log(JSON.stringify({provider, install, workers: status.error ?? {count: status.workers?.length}, results, errors}, null, 1));
  for (const r of results) {
    assert.equal(r.exit, 0, `turn failed: ${r.stderr}`);
    assert(r.searches.length > 0, `no web_search call in ${r.sessionKey}: tools ${r.toolCalls}`);
    assert(r.searches.every((s) => s.provider === provider), `wrong provider: ${JSON.stringify(r.searches.map((s) => s.provider))}`);
    assert(r.searches.some((s) => !s.error && s.chars > 200), `searches returned nothing usable: ${JSON.stringify(r.searches)}`);
    assert(r.replyChars > 20, `no visible reply in ${r.sessionKey}`);
  }
  const all = results.flatMap((r) => r.searches);
  console.log(`PASS provider=${provider} turns=${results.length} searches=${all.length} turnSecs=${results.map((r) => r.secs)} searchMs=${all.map((s) => s.ms)} resultChars=${all.map((s) => s.chars)}`);
} finally {
  client?.stop();
  gateway.kill('SIGTERM');
  await sleep(3000);
  if (gateway.exitCode === null) gateway.kill('SIGKILL');
}
