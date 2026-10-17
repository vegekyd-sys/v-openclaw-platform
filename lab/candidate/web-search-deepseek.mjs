// Candidate test: V's web_search on DeepSeek Search and DeepSeek Fetch as the web_fetch fallback
// (apps/v-deepseek-web/plugin, lab/release-files/web-search-deepseek).
//
// Loads the plugin from this candidate's checkout through plugins.load.paths the way V will
// (/opt/v-deepseek-web/plugin), applies config.mjs to the Gateway and Worker configs, boots a
// private Gateway with one Worker and runs real agent turns on V's model setup (deepseek-flash:
// vlab-worker on the Gateway, openclaw in the Worker).
// PROMPT_SET=smoke|zh  search turns: every web_search ran in the Worker on provider deepseek,
//                      returned results and the turn replied.
// PROMPT_SET=fetch     web_fetch turns: a page the direct fetch is refused (Baidu Baike 403) comes
//                      back through the deepseek fallback; a page it can read does not use it.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {useDeepSeekWeb} from '../release-files/web-search-deepseek/config.mjs';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, 'candidate runtime environment is required');
const provider = 'deepseek';
const pluginPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/v-deepseek-web/plugin');
assert(fs.existsSync(path.join(pluginPath, 'openclaw.plugin.json')), `plugin missing at ${pluginPath}`);
const MODEL = 'deepseek/deepseek-flash';
const dist = path.join(runtime, 'openclaw', 'dist');
const cli = path.join(dist, 'index.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, '$1$2[redacted]');
for (const [key, dir] of Object.entries({TMPDIR: 'tmp', XDG_CACHE_HOME: 'cache', npm_config_cache: 'npm-cache'})) {
  process.env[key] = path.join(process.env.VLAB_CANDIDATE_DATA, dir);
  fs.mkdirSync(process.env[key], {recursive: true, mode: 0o700});
}

const install = null;

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
  config.tools.web.fetch = {...(config.tools.web.fetch ?? {}), cacheTtlMinutes: 0};
  const {config: switched} = useDeepSeekWeb(config, pluginPath);
  return switched;
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
  const calls = new Map(); const searches = []; const fetches = [];
  for (const e of events) {
    const j = JSON.parse(e.event_json);
    const m = j.type === 'message' ? j.message : null;
    if (m?.role === 'assistant') {
      for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === 'toolCall') calls.set(c.id, {name: c.name, args: c.arguments, at: e.created_at});
    } else if (m?.role === 'toolResult') {
      const call = calls.get(m.toolCallId) ?? {};
      if ((m.toolName ?? call.name) === 'web_fetch') {
        const text = JSON.stringify(m.content ?? '');
        fetches.push({url: call.args?.url, ms: call.at ? e.created_at - call.at : null, chars: text.length,
          extractor: text.match(/\\?"extractor\\?":\s*\\?"([a-z-]+)/u)?.[1] ?? null, error: m.isError === true || /\\?"error\\?":|fetch failed/u.test(text)});
        continue;
      }
      if ((m.toolName ?? call.name) !== 'web_search') continue;
      const text = JSON.stringify(m.content ?? '');
      // What the model reads: the result text itself, not this row's JSON encoding.
      const seen = Array.isArray(m.content) ? m.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('') : String(m.content ?? '');
      searches.push({args: call.args, ms: call.at ? e.created_at - call.at : null, chars: seen.length,
        provider: text.match(/\\?"provider\\?":\s*\\?"([a-z-]+)/u)?.[1] ?? null,
        results: Number(text.match(/\\?"count\\?":\s*(\d+)/u)?.[1] ?? NaN), error: m.isError === true || /\\?"error\\?":/u.test(text)});
    }
  }
  return {toolCalls: [...calls.values()].map((c) => c.name), searches, fetches};
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
PROMPT_SETS.fetch = [
  '（自动化测试）不要搜索。请直接用 web_fetch 读取 https://baike.baidu.com/item/%E4%B8%8A%E6%B5%B7%E8%BF%AA%E5%A3%AB%E5%B0%BC%E4%B9%90%E5%9B%AD ，告诉我上海迪士尼乐园的开园日期。',
  '（自动化测试）不要搜索。请直接用 web_fetch 读取 https://api-docs.deepseek.com/guides/search/ ，告诉我 Search API 的请求地址和计费价格。',
];
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
  const errors = lines.filter((l) => /deepseek-web|v-deepseek|web_search|web_fetch|web-search/iu.test(l.line) && /error|fail|denied|not allowed|blocked/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-20);
  console.log(JSON.stringify({provider, install, workers: status.error ?? {count: status.workers?.length}, results, errors}, null, 1));
  const fetchSet = (process.env.PROMPT_SET ?? 'smoke') === 'fetch';
  for (const r of results) {
    assert.equal(r.exit, 0, `turn failed: ${r.stderr}`);
    assert(r.replyChars > 20, `no visible reply in ${r.sessionKey}`);
    if (fetchSet) continue;
    assert(r.searches.length > 0, `no web_search call in ${r.sessionKey}: tools ${r.toolCalls}`);
    assert(r.searches.every((s) => s.provider === provider), `wrong provider: ${JSON.stringify(r.searches.map((s) => s.provider))}`);
    assert(r.searches.some((s) => !s.error && s.chars > 200), `searches returned nothing usable: ${JSON.stringify(r.searches)}`);
    assert(r.searches.every((s) => s.chars < 10000), `search result over Codex's 10,000-character cap: ${r.searches.map((s) => s.chars)}`);
  }
  if (fetchSet) {
    const [blocked, readable] = results;
    assert(blocked.fetches.some((f) => f.extractor === 'deepseek' && !f.error), `Baike fetch did not come back through the deepseek fallback: ${JSON.stringify(blocked.fetches)}`);
    assert(/2016/u.test(blocked.reply), `Baike answer lacks the opening year: ${blocked.reply}`);
    assert(readable.fetches.length > 0 && readable.fetches.every((f) => f.extractor !== 'deepseek' && !f.error), `readable page used the fallback or failed: ${JSON.stringify(readable.fetches)}`);
    console.log(`PASS fetch fallback=${blocked.fetches.map((f) => `${f.extractor}:${f.ms}ms`)} direct=${readable.fetches.map((f) => `${f.extractor}:${f.ms}ms`)}`);
  }
  if (!fetchSet) {
  const all = results.flatMap((r) => r.searches);
  console.log(`PASS provider=${provider} turns=${results.length} searches=${all.length} turnSecs=${results.map((r) => r.secs)} searchMs=${all.map((s) => s.ms)} resultChars=${all.map((s) => s.chars)}`);
  }
} finally {
  client?.stop();
  gateway.kill('SIGTERM');
  await sleep(3000);
  if (gateway.exitCode === null) gateway.kill('SIGKILL');
}
