#!/usr/bin/env node
// web_fetch benchmark: V's built-in web_fetch (production dist code via a shadow copy that only
// adds an export) vs DeepSeek's Fetch API, on URLs V's agent really fetched. Then a blind judge
// says, per URL, which result holds the page's main content.
//
//   node fetch-bench.mjs run   --urls urls.json --out fetch.jsonl
//   node fetch-bench.mjs judge --in fetch.jsonl --out fetch-judged.jsonl
//
// Shadow dist (once): see makeShadow() — symlinks every production dist file and re-exports
// createWebFetchTool from a copy of openclaw-tools-*.js. Production files are never written.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const [mode = 'run', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((acc, a, i, all) => { if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]); return acc; }, []));
const CORE = args.core ?? '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHADOW = path.join(HERE, 'shadow-core');
const cfgPath = process.env.OPENCLAW_CONFIG_PATH ?? `${process.env.HOME}/.openclaw/openclaw.json`;
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

function makeShadow() {
  const dist = path.join(SHADOW, 'dist');
  const toolsFile = fs.readdirSync(path.join(CORE, 'dist')).find((f) => /^openclaw-tools-.+\.js$/.test(f) && fs.readFileSync(path.join(CORE, 'dist', f), 'utf8').includes('function createWebFetchTool('));
  const marker = path.join(SHADOW, `.${toolsFile}`);
  if (fs.existsSync(marker)) return path.join(dist, toolsFile);
  fs.rmSync(SHADOW, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  for (const f of fs.readdirSync(path.join(CORE, 'dist'))) if (f !== toolsFile) fs.symlinkSync(path.join(CORE, 'dist', f), path.join(dist, f));
  for (const f of ['package.json', 'node_modules']) fs.symlinkSync(path.join(CORE, f), path.join(SHADOW, f));
  fs.writeFileSync(path.join(dist, toolsFile), fs.readFileSync(path.join(CORE, 'dist', toolsFile), 'utf8') + '\nexport { createWebFetchTool as __benchCreateWebFetchTool };\n');
  fs.writeFileSync(marker, '');
  return path.join(dist, toolsFile);
}

const BLOCK = /captcha|验证码|安全验证|访问验证|人机验证|请完成验证|robot check|are you a robot|access denied|403 forbidden|enable javascript|请开启javascript|cloudflare|just a moment|unusual traffic|异常流量|登录后查看|请登录/i;
const textOf = (x) => typeof x === 'string' ? x : JSON.stringify(x ?? '');

async function builtinFetch(url, signal) {
  const mod = await import(pathToFileURL(makeShadow()).href);
  const tool = mod.__benchCreateWebFetchTool({ config: cfg });
  const out = await tool.execute('bench', { url, extractMode: 'markdown' }, signal);
  const d = out?.details ?? out;
  const text = Array.isArray(out?.content) ? out.content.map((c) => c.text ?? '').join('\n') : textOf(d?.text ?? d);
  const body = typeof d?.text === 'string' ? d.text : text;
  return { title: d?.title, status: d?.status, content: body, raw: text.length };
}

async function deepseekFetch(url, signal) {
  const ds = cfg.models.providers.deepseek;
  const base = ds.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
  const res = await fetch(`${base}/v1/tools/fetch`, { method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ds.apiKey}` }, body: JSON.stringify({ url }) });
  const t = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  const d = JSON.parse(t);
  return { title: d.title, status: 200, content: d.content ?? '', raw: t.length };
}

const strip = (s) => String(s ?? '').replace(/<<<[^>]*>>>/g, '').replace(/SECURITY NOTICE:[\s\S]*?---/, '').trim();

if (mode === 'run') {
  const urls = JSON.parse(fs.readFileSync(args.urls, 'utf8'));
  const out = args.out ?? 'fetch.jsonl';
  for (const [i, url] of urls.entries()) {
    const row = { i, url };
    await Promise.all([['builtin', builtinFetch], ['deepseek', deepseekFetch]].map(async ([name, fn]) => {
      const t0 = Date.now();
      try {
        const r = await fn(url, AbortSignal.timeout(45000));
        const content = strip(r.content);
        row[name] = { ok: content.length > 200, ms: Date.now() - t0, chars: content.length, status: r.status, title: String(r.title ?? '').slice(0, 120),
          blocked: content.length < 3000 && BLOCK.test(content), head: content.slice(0, 6000) };
      } catch (e) {
        row[name] = { ok: false, ms: Date.now() - t0, chars: 0, error: String(e?.message ?? e).slice(0, 200) };
      }
    }));
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
    console.error(`${i}\tbuiltin ${row.builtin.ok ? 'ok' : 'FAIL'} ${row.builtin.ms}ms ${row.builtin.chars}\tdeepseek ${row.deepseek.ok ? 'ok' : 'FAIL'} ${row.deepseek.ms}ms ${row.deepseek.chars}\t${url.slice(0, 70)}`);
  }
} else if (mode === 'judge') {
  const rows = fs.readFileSync(args.in, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const out = args.out ?? 'fetch-judged.jsonl';
  const SYSTEM = 'You compare two fetches of the same web page made for an AI agent. For each result decide: "full" (the page\'s main content is there and readable), "partial" (some real content but key parts missing, or mostly navigation/boilerplate), or "failed" (empty, error, login wall, captcha, anti-bot or wrong page). Then pick which result serves the agent better: "A", "B" or "tie". Reply JSON only: {"A":"full|partial|failed","B":"...","better":"A|B|tie","note":"<= 20 words"}';
  for (const r of rows) {
    const flip = createHash('sha256').update(r.url).digest()[0] % 2 === 1;
    const [a, b] = flip ? ['deepseek', 'builtin'] : ['builtin', 'deepseek'];
    const show = (x) => x.ok || x.chars ? `title: ${x.title ?? ''}\n${x.head}` : `(error: ${x.error ?? 'empty'})`;
    const user = `URL: ${r.url}\n\n=== Result A ===\n${show(r[a])}\n\n=== Result B ===\n${show(r[b])}`;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: args.model ?? 'anthropic/claude-opus-5.5', temperature: 0, max_tokens: 300, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }), signal: AbortSignal.timeout(120000) });
      const d = await res.json();
      const t = d.choices?.[0]?.message?.content ?? '';
      const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      const verdict = { [a]: j.A, [b]: j.B, better: j.better === 'tie' ? 'tie' : (j.better === 'A' ? a : b), note: j.note };
      fs.appendFileSync(out, JSON.stringify({ i: r.i, url: r.url, ...verdict }) + '\n');
      console.error(`${r.i}\t${verdict.builtin}\t${verdict.deepseek}\t${verdict.better}`);
    } catch (e) { console.error(`${r.i}\tjudge failed ${String(e).slice(0, 120)}`); }
  }
}
