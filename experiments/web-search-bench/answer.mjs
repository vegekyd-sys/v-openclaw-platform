#!/usr/bin/env node
// End-to-end stage: hand each candidate's web_search output to V's own default model
// (deepseek-v4-flash, as configured in openclaw.json) and let it answer. Measures the
// extra time and prompt tokens a given tool output costs V, and produces answers for
// judge.mjs --mode answer.
//
//   node answer.mjs --in results.jsonl --out answers.jsonl [--config ~/.openclaw/openclaw.json]
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const IN = (args.in ?? 'results.jsonl').split(',');
const OUT = args.out ?? 'answers.jsonl';
const CONCURRENCY = Number(args.concurrency ?? 6);
const cfg = JSON.parse(readFileSync(args.config ?? `${process.env.HOME}/.openclaw/openclaw.json`, 'utf8'));
const ds = cfg.models.providers.deepseek;
const MODEL = args.model ?? 'deepseek-v4-flash';
const bench = JSON.parse(readFileSync(args.queries ?? new URL('./queries.json', import.meta.url)));

const rows = IN.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l))).filter((r) => (r.rep ?? 0) === 0);
const latest = new Map();
for (const r of rows) latest.set(`${r.id}\t${r.candidate}`, r);
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}\t${r.candidate}`; }) : []);

const SYSTEM = `You are V, a helpful assistant. Today is ${bench.asOf} (Asia/Shanghai). You called web_search for the user's request and got the tool result below. Answer the user in the user's language, concisely, using only facts supported by the tool result; name the source for key facts. If the result does not contain the answer, say what is missing instead of guessing.`;

function toolResult(r) {
  if (!r.ok) return JSON.stringify({ error: r.error ?? 'empty result' });
  return JSON.stringify({ provider: r.candidate, content: r.content, citations: (r.citations ?? []).slice(0, 10).map((c) => ({ url: c.url, title: c.title })) });
}

async function answer(r) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${ds.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ds.apiKey}` },
      body: JSON.stringify({
        model: MODEL, max_tokens: 2000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: r.query },
          { role: 'assistant', content: null, reasoning_content: 'The user needs current facts; search the web first.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: r.query }) } }] },
          { role: 'tool', tool_call_id: 'call_1', content: toolResult(r) },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
    const msg = data.choices?.[0]?.message ?? {};
    const out = { id: r.id, cat: r.cat, query: r.query, candidate: r.candidate, ok: Boolean(msg.content), content: msg.content ?? '', citations: [],
      answerMs: Date.now() - t0, searchMs: r.ms, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens };
    appendFileSync(OUT, JSON.stringify(out) + '\n');
    console.error(`${r.id}\t${r.candidate}\t${out.answerMs}ms\t${out.promptTokens} in`);
  } catch (e) {
    console.error(`${r.id}\t${r.candidate}\tFAIL ${String(e).slice(0, 200)}`);
  }
}

const todo = [...latest.entries()].filter(([k]) => !done.has(k)).map(([, r]) => r);
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < todo.length) await answer(todo[next++]);
}));
