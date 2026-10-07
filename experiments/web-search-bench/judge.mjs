#!/usr/bin/env node
// Blind comparative judging of run.mjs output. For each query, all candidates' results
// (first repetition) are shuffled, labelled A, B, C… and scored together by one judge call.
//
//   node judge.mjs --in results.jsonl --out judged.jsonl [--model anthropic/claude-opus-5.5]
//
// Needs OPENROUTER_API_KEY. The judge model must not be from a candidate's family.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const IN = (args.in ?? 'results.jsonl').split(',');
const MODE = args.mode ?? 'search';
const OUT = args.out ?? 'judged.jsonl';
const MODEL = args.model ?? 'anthropic/claude-opus-5.5';
const CONCURRENCY = Number(args.concurrency ?? 4);
const bench = JSON.parse(readFileSync(args.queries ?? new URL('./queries.json', import.meta.url)));
const byId = new Map(bench.queries.map((q) => [q.id, q]));

const rows = IN.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l))).filter((r) => (r.rep ?? 0) === 0);
const groups = new Map();
for (const r of rows) {
  if (!groups.has(r.id)) groups.set(r.id, new Map());
  groups.get(r.id).set(r.candidate, r); // last write wins on reruns
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);

// Deterministic shuffle per query so reruns see the same labels.
function shuffle(list, seed) {
  return list.map((x) => [createHash('sha256').update(seed + x).digest('hex'), x]).sort().map(([, x]) => x);
}

const SEARCH_INTRO = `You grade web search results for an AI agent named V. V's agent issued the query below to its web_search tool and must then answer its user from the result. Some tools return a synthesized answer with citations; others return a ranked list of pages with snippets for V to read itself. Judge whether the facts V needs are present, correct and well sourced, not the prose; a result list counts as complete if the snippets contain the facts.`;
const ANSWER_INTRO = `You grade final answers written by an AI assistant named V. For each labelled answer, V searched the web with a different search tool and then answered the user's message below from that tool's output. Grade the answer the user receives.`;
const SYSTEM = `${MODE === 'answer' ? ANSWER_INTRO : SEARCH_INTRO} Today is ${bench.asOf}. Your own knowledge may end before today, so for recent events do not mark a claim wrong just because you have not heard of it; judge by specificity, internal consistency, source quality, and agreement with the better-sourced results.

Score every labelled result independently on these 1-10 integer scales:
- relevance: does it address what the query is after (including implied intent, e.g. an address query wants address + hours + price)?
- accuracy: are the claims correct? If an answer key is provided, compare against it; otherwise penalize claims contradicted by better-sourced results, invented specifics, or confident answers about things that do not exist.
- completeness: does it contain the specific facts V would need without another search?
- sources: ${MODE === 'answer' ? 'does the answer name or link credible sources for its key facts?' : 'are citations real, relevant, authoritative/primary (official docs, the company, major outlets), and usable as URLs? Opaque redirect URLs with only a domain title are less useful than direct links.'}
- overall: usefulness to V for answering the user, all things considered. Length is not a virtue by itself.
If an answer key is provided also set key_match to one of "correct", "partial", "wrong", "missing". Otherwise set key_match to null.
Add a one-sentence note (max 25 words) naming the biggest strength or flaw.

Reply with JSON only: {"results": {"A": {"relevance": n, "accuracy": n, "completeness": n, "sources": n, "overall": n, "key_match": ..., "note": "..."}, "B": {...}}}`;

function render(r) {
  if (!r.ok) return `(tool error: ${r.error ?? 'empty answer'})`;
  const content = r.content.length > 5000 ? r.content.slice(0, 5000) + '\n[truncated]' : r.content;
  const cites = (r.citations ?? []).slice(0, 10).map((c, i) => `  [${i + 1}] ${c.title ?? ''} <${c.url}>`).join('\n');
  return `${content}\n\nCitations:\n${cites || '  (none)'}`;
}

async function judge(id) {
  const q = byId.get(id);
  const cands = shuffle([...groups.get(id).keys()], id);
  const labels = cands.map((_, i) => String.fromCharCode(65 + i));
  const user = [`${MODE === 'answer' ? 'User message' : 'Query'}: ${q.query}`, q.answer ? `Answer key: ${q.answer}` : 'Answer key: (none)', '',
    ...cands.map((c, i) => `=== Result ${labels[i]} ===\n${render(groups.get(id).get(c))}\n`)].join('\n');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const out = {};
      cands.forEach((c, i) => { out[c] = parsed.results[labels[i]]; });
      appendFileSync(OUT, JSON.stringify({ id, judge: MODEL, mode: MODE, scores: out }) + '\n');
      console.error(`${id}\tjudged ${cands.length}`);
      return;
    } catch (e) {
      console.error(`${id}\tattempt ${attempt + 1} failed: ${String(e).slice(0, 200)}`);
    }
  }
}

const todo = [...groups.keys()].filter((id) => !done.has(id));
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < todo.length) await judge(todo[next++]);
}));
