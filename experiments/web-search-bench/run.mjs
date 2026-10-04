#!/usr/bin/env node
// Runs web_search candidates over queries.json and writes one JSON line per (query, candidate).
// Gemini "dist" candidates call the production provider module itself (read-only import);
// everything else calls the provider API directly with the same request shape OpenClaw uses.
//
//   node run.mjs --candidates gemini-35-lite,grok-43 --out results.jsonl [--ids k01,f03] [--repeat 1]
//
// Keys come from the environment: GOOGLE_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY.
import { readFileSync, appendFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]);
  return acc;
}, []));
const DIST = args.dist ?? process.env.OPENCLAW_DIST ?? '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist';
const OUT = args.out ?? 'results.jsonl';
const REPEAT = Number(args.repeat ?? 1);
const TIMEOUT_MS = Number(args.timeout ?? 60000);
const bench = JSON.parse(readFileSync(args.queries ?? new URL('./queries.json', import.meta.url)));
const ids = args.ids ? new Set(args.ids.split(',')) : null;
const queries = bench.queries.filter((q) => !ids || ids.has(q.id));

// Route the provider's own console.error timing line to the call that produced it.
const callLog = new AsyncLocalStorage();
const origError = console.error;
console.error = (...parts) => {
  const sink = callLog.getStore();
  const line = parts.map(String).join(' ');
  if (sink && line.includes('[web-search-preparation]')) {
    try { sink.prep = JSON.parse(line.slice(line.indexOf('{'))); } catch {}
    return;
  }
  origError(...parts);
};

let geminiDist;
async function loadGeminiDist() {
  if (!geminiDist) {
    const { readdirSync } = await import('node:fs');
    const file = readdirSync(DIST).find((f) => /^gemini-web-search-provider\.runtime-.+\.js$/.test(f));
    geminiDist = await import(pathToFileURL(`${DIST}/${file}`).href);
  }
  return geminiDist;
}

const unwrap = (s) => typeof s === 'string'
  ? s.replace(/<<<EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>|<<<END_EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>/g, '').replace(/^\s*Source: Web Search\s*---\s*/m, '').trim()
  : s;

async function postJson(url, headers, body, signal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const CANDIDATES = {
  // Production path today.
  'gemini-35-lite': (q, signal) => geminiDistCall(q, 'gemini-3.5-flash-lite', signal),
  'gemini-38-flash': (q, signal) => geminiDistCall(q, 'gemini-3.8-flash', signal),
  'gemini-37-flash': (q, signal) => geminiDistCall(q, 'gemini-3.7-flash', signal),
  'gemini-31-lite': (q, signal) => geminiDistCall(q, 'gemini-3.1-flash-lite', signal),
  // Same API without citation redirect resolution, with an explicit thinking level.
  'gemini-38-flash-low': (q, signal) => geminiDirect(q, 'gemini-3.8-flash', { thinkingConfig: { thinkingLevel: 'low' } }, signal),
  'gemini-35-lite-min': (q, signal) => geminiDirect(q, 'gemini-3.5-flash-lite', { thinkingConfig: { thinkingLevel: 'minimal' } }, signal),
  // xAI web_search exactly as extensions/xai builds it (grok-4.3 gets reasoning low).
  'grok-43': (q, signal) => grok(q, 'grok-4.3', 'low', signal),
  'grok-420-nr': (q, signal) => grok(q, 'grok-4.20-0309-non-reasoning', undefined, signal),
  // Perplexity Sonar through OpenRouter (what the perplexity plugin does with an sk-or- key).
  'sonar': (q, signal) => openrouter(q, { model: 'perplexity/sonar' }, signal),
  'sonar-pro': (q, signal) => openrouter(q, { model: 'perplexity/sonar-pro' }, signal),
  // Exa retrieval + a small model, via OpenRouter's web plugin.
  'exa-lite': (q, signal) => openrouter(q, { model: 'google/gemini-3.5-flash-lite', plugins: [{ id: 'web', engine: 'exa', max_results: 6 }] }, signal),
  // Installed web_search plugins, executed through their own provider code (see setup-plugins.sh).
  'duckduckgo': (q, signal) => pluginCall(q, '@openclaw/duckduckgo-plugin', 'duckduckgo', 'duckduckgo', {}, signal),
  'parallel-free': (q, signal) => pluginCall(q, '@openclaw/parallel-plugin', 'parallel-free', 'parallel', {}, signal),
  'firecrawl-free': (q, signal) => pluginCall(q, '@openclaw/firecrawl-plugin', 'firecrawl-free', 'firecrawl', {}, signal),
  'keenable': (q, signal) => pluginCall(q, '@keenable/openclaw-search', 'keenable', 'keenable', {}, signal),
  'searxng': (q, signal) => pluginCall(q, '@openclaw/searxng-plugin', 'searxng', 'searxng', { baseUrl: process.env.SEARXNG_BASE_URL }, signal),
  'tavily': (q, signal) => pluginCall(q, '@openclaw/tavily-plugin', 'tavily', 'tavily', { apiKey: process.env.TAVILY_API_KEY }, signal),
  'exa': (q, signal) => pluginCall(q, '@openclaw/exa-plugin', 'exa', 'exa', { apiKey: process.env.EXA_API_KEY }, signal),
  'brave': (q, signal) => pluginCall(q, '@openclaw/brave-plugin', 'brave', 'brave', { apiKey: process.env.BRAVE_API_KEY }, signal),
  'bocha': (q, signal) => pluginCall(q, '@chaojihao/openclaw-plugin-bocha', 'bocha', 'bocha', { apiKey: process.env.BOCHA_API_KEY }, signal),
  // Community plugins whose packages do not load on 9.1 as web_search providers: same request
  // their source sends (see README for the file each one mirrors).
  'baidu-crawler': (q, signal) => pluginToolCall(q, '@z-imagine/openclaw-baidu-search', { mode: 'crawler' }, signal),
  'baidu-qianfan': (q, signal) => directResults(q, 'https://qianfan.baidubce.com/v2/ai_search/web_search', process.env.BAIDU_API_KEY,
    { messages: [{ content: q.query, role: 'user' }], search_source: 'baidu_search_v2', resource_type_filter: [{ type: 'web', top_k: 8 }] },
    (d) => d.references ?? [], signal),
  'zhipu': (q, signal) => directResults(q, 'https://open.bigmodel.cn/api/paas/v4/web_search', process.env.ZHIPU_API_KEY,
    { search_query: q.query, search_engine: process.env.ZHIPU_ENGINE ?? 'search_pro', count: 8, content_size: 'medium', ...(q.freshness === 'day' ? { search_recency_filter: 'oneDay' } : {}) },
    (d) => (d.search_result ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.content, date: r.publish_date })), signal),
  'metaso': (q, signal) => directResults(q, 'https://metaso.cn/api/v1/search', process.env.METASO_API_KEY,
    { q: q.query, scope: 'webpage', includeSummary: false, size: '8', includeRawContent: false, conciseSnippet: false },
    (d) => (d.webpages ?? d.data?.webpages ?? []).map((r) => ({ title: r.title, url: r.link ?? r.url, snippet: r.snippet ?? r.summary, date: r.date })), signal),
  'perplexity-or': (q, signal) => pluginCall(q, '@openclaw/perplexity-plugin', 'perplexity', 'perplexity', { apiKey: process.env.OPENROUTER_API_KEY }, signal),
};

const PLUGIN_ROOT = args.plugins ?? new URL('./plugins/node_modules/', import.meta.url).pathname;
const pluginProviders = new Map();
async function loadPluginProviders(pkg) {
  if (pluginProviders.has(pkg)) return pluginProviders.get(pkg);
  const dir = `${PLUGIN_ROOT}${pkg}`;
  const meta = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  const entry = meta.openclaw?.runtimeExtensions?.[0] ?? meta.main ?? './dist/index.js';
  const mod = await import(pathToFileURL(`${dir}/${entry}`).href);
  const plugin = mod.default ?? mod;
  const providers = new Map();
  const noop = () => {};
  const api = new Proxy({
    registerWebSearchProvider: (p) => providers.set(p.id, p),
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    config: {}, pluginConfig: {},
  }, { get: (t, k) => (k in t ? t[k] : noop) });
  await (plugin.register ?? plugin.activate ?? plugin)(api);
  pluginProviders.set(pkg, providers);
  return providers;
}

function renderPayload(out) {
  if (typeof out.content === 'string' && out.content) return unwrap(out.content);
  const results = out.results ?? out.data ?? out.items ?? [];
  return results.map((r, i) => `${i + 1}. ${unwrap(r.title) ?? ''} — ${r.url ?? r.link ?? ''}\n${unwrap(r.description ?? r.snippet ?? r.content ?? r.summary ?? '') ?? ''}`).join('\n\n');
}

async function directResults(q, url, key, body, pick, signal) {
  if (!key) throw new Error('missing api key');
  const data = await postJson(url, { authorization: `Bearer ${key}` }, body, signal);
  if (data.error_code || data.code && data.code !== 0 && data.code !== 200 && data.code !== '0') throw new Error(JSON.stringify(data).slice(0, 300));
  const results = pick(data).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet ?? r.content ?? '', date: r.date }));
  const out = { results };
  return { model: url, content: renderPayload(out), citations: results.map((r) => ({ url: r.url, title: r.title })), payloadChars: JSON.stringify(out).length };
}

const pluginTools = new Map();
async function pluginToolCall(q, pkg, pluginConfig, signal) {
  const key = `${pkg}\t${JSON.stringify(pluginConfig)}`;
  if (!pluginTools.has(key)) {
    const dir = `${PLUGIN_ROOT}${pkg}`;
    const meta = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
    const mod = await import(pathToFileURL(`${dir}/${meta.openclaw?.runtimeExtensions?.[0] ?? meta.main}`).href);
    const plugin = mod.default ?? mod;
    const tools = [];
    const noop = () => {};
    const api = new Proxy({
      registerTool: (t) => tools.push(typeof t === 'function' ? t({}) : t),
      logger: { info: noop, warn: noop, error: noop, debug: noop },
      config: {}, pluginConfig,
    }, { get: (t, k) => (k in t ? t[k] : noop) });
    await (plugin.register ?? plugin.activate ?? plugin)(api);
    pluginTools.set(key, tools.flat()[0]);
  }
  const tool = pluginTools.get(key);
  const out = await tool.execute('bench', { query: q.query, count: 8 }, signal);
  const details = out?.data ?? out?.details ?? out;
  if (out?.success === false || details?.error) throw new Error(String(out?.error ?? details.error).slice(0, 300));
  const results = details?.results ?? [];
  const text = Array.isArray(out?.content) ? out.content.map((c) => c.text).join('\n') : renderPayload({ results });
  return { model: pkg, content: text, citations: results.map((r) => ({ url: r.url, title: r.title })), payloadChars: text.length };
}

async function pluginCall(q, pkg, providerId, pluginId, pluginWebSearch, signal) {
  const provider = (await loadPluginProviders(pkg)).get(providerId);
  if (!provider) throw new Error(`provider ${providerId} not registered by ${pkg}`);
  const searchConfig = { provider: providerId, cacheTtlMinutes: 0, timeoutSeconds: 30 };
  const config = { tools: { web: { search: searchConfig } }, plugins: { entries: { [pluginId]: { enabled: true, config: { webSearch: pluginWebSearch } } } } };
  const tool = provider.createTool({ config, searchConfig });
  const searchArgs = { query: q.query, count: 8, ...(q.freshness ? { freshness: q.freshness } : {}) };
  const out = await tool.execute(searchArgs, { signal });
  if (out?.error) throw new Error(`${out.error}: ${out.message ?? ''}`);
  const results = out.results ?? out.data ?? out.items ?? [];
  const citations = (out.citations ?? results).map((c) => typeof c === 'string' ? { url: c } : { url: c.url ?? c.link, title: unwrap(c.title) });
  return { model: providerId, content: renderPayload(out), citations, payloadChars: JSON.stringify(out).length };
}

async function geminiDistCall(q, model, signal) {
  const { executeGeminiSearch } = await loadGeminiDist();
  const sink = {};
  const searchArgs = { query: q.query, count: 8, ...(q.freshness ? { freshness: q.freshness } : {}) };
  const out = await callLog.run(sink, () => executeGeminiSearch(searchArgs,
    { gemini: { model, apiKey: process.env.GOOGLE_API_KEY }, cacheTtlMinutes: 0, timeoutSeconds: 30 }, { signal }));
  if (out.error) throw new Error(`${out.error}: ${out.message}`);
  return {
    model,
    content: unwrap(out.content),
    citations: (out.citations ?? []).map((c) => ({ url: c.url, title: c.title, resolved: c.resolution === 'resolved' })),
    redirectMs: sink.prep?.ms,
    apiMs: sink.prep ? sink.prep.searchMs - sink.prep.ms : undefined,
  };
}

async function geminiDirect(q, model, generationConfig, signal) {
  const t0 = Date.now();
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': process.env.GOOGLE_API_KEY },
    { contents: [{ parts: [{ text: q.query }] }], tools: [{ google_search: {} }], generationConfig }, signal);
  const cand = data.candidates?.[0];
  return {
    model,
    content: (cand?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join('\n'),
    citations: (cand?.groundingMetadata?.groundingChunks ?? []).filter((c) => c.web?.uri).map((c) => ({ url: c.web.uri, title: c.web.title, resolved: false })),
    apiMs: Date.now() - t0,
    usage: data.usageMetadata,
  };
}

async function grok(q, model, effort, signal) {
  const data = await postJson('https://api.x.ai/v1/responses', { authorization: `Bearer ${process.env.XAI_API_KEY}` },
    { model, input: [{ role: 'user', content: q.query }], tools: [{ type: 'web_search' }], store: false, ...(effort ? { reasoning: { effort } } : {}) }, signal);
  const texts = []; const cites = new Map();
  for (const o of data.output ?? []) {
    for (const b of o.type === 'message' ? o.content ?? [] : []) {
      if (b.type !== 'output_text') continue;
      texts.push(b.text);
      for (const a of b.annotations ?? []) if (a.url) cites.set(a.url, a.title);
    }
  }
  for (const u of data.citations ?? []) if (!cites.has(u)) cites.set(u, undefined);
  return { model, content: texts.join('\n'), citations: [...cites].map(([url, title]) => ({ url, title, resolved: true })), usage: data.usage };
}

async function openrouter(q, body, signal) {
  const data = await postJson('https://openrouter.ai/api/v1/chat/completions', { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    { ...body, messages: [{ role: 'user', content: q.query }], usage: { include: true } }, signal);
  const msg = data.choices?.[0]?.message ?? {};
  const cites = new Map();
  for (const a of msg.annotations ?? []) if (a.url_citation?.url) cites.set(a.url_citation.url, a.url_citation.title);
  for (const u of data.citations ?? []) if (!cites.has(u)) cites.set(u, undefined);
  return { model: body.model, content: msg.content ?? '', citations: [...cites].map(([url, title]) => ({ url, title, resolved: true })), usage: data.usage };
}

const names = (args.candidates ?? 'gemini-35-lite').split(',');
for (const n of names) if (!CANDIDATES[n]) throw new Error(`unknown candidate ${n}; known: ${Object.keys(CANDIDATES).join(', ')}`);
const concurrency = Number(args.concurrency ?? 1);

async function runOne(q, name, rep) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const t0 = Date.now();
  let row;
  try {
    const r = await CANDIDATES[name](q, signal);
    row = { ...r, ok: Boolean(r.content), ms: Date.now() - t0 };
  } catch (e) {
    row = { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 400) };
  }
  row = { id: q.id, cat: q.cat, query: q.query, candidate: name, rep, at: new Date().toISOString(), ...row, contentChars: row.content?.length ?? 0 };
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  origError(`${q.id}\t${name}\t${row.ok ? 'ok' : 'FAIL'}\t${row.ms}ms\t${row.citations?.length ?? 0} cites${row.error ? '\t' + row.error.slice(0, 120) : ''}`);
}

// Candidates for one query run side by side so they see the same moment of the web;
// queries run `concurrency` at a time.
const jobs = [];
for (let rep = 0; rep < REPEAT; rep++) for (const q of queries) jobs.push([q, rep]);
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < jobs.length) {
    const [q, rep] = jobs[next++];
    await Promise.all(names.map((n) => runOne(q, n, rep)));
  }
}));
