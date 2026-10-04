#!/usr/bin/env node
// Aggregates run/judge/answer output into one table per candidate.
//   node report.mjs --results r1.jsonl,r2.jsonl --judged judged.jsonl [--answers answers.jsonl --answers-judged ajudged.jsonl] [--json out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const load = (list) => (list ?? '').split(',').filter((f) => f && existsSync(f))
  .flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const results = load(args.results);
const judged = load(args.judged);
const answers = load(args.answers);
const ajudged = load(args['answers-judged']);
const bench = JSON.parse(readFileSync(args.queries ?? new URL('./queries.json', import.meta.url)));
const keyed = new Set(bench.queries.filter((q) => q.answer).map((q) => q.id));

const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const r1 = (x) => x == null ? '' : Math.round(x * 10) / 10;

const cands = [...new Set(results.map((r) => r.candidate))];
const table = cands.map((c) => {
  const rs = results.filter((r) => r.candidate === c);
  const ok = rs.filter((r) => r.ok);
  const scores = judged.map((j) => j.scores?.[c]).filter(Boolean);
  const keyScores = judged.filter((j) => keyed.has(j.id)).map((j) => j.scores?.[c]?.key_match).filter(Boolean);
  const as = answers.filter((a) => a.candidate === c);
  const aScores = ajudged.map((j) => j.scores?.[c]).filter(Boolean);
  const aKey = ajudged.filter((j) => keyed.has(j.id)).map((j) => j.scores?.[c]?.key_match).filter(Boolean);
  const e2e = as.map((a) => (a.searchMs ?? 0) + a.answerMs);
  return {
    candidate: c, n: rs.length, failRate: 1 - ok.length / rs.length,
    p50: q(ok.map((r) => r.ms), 0.5), p90: q(ok.map((r) => r.ms), 0.9),
    chars: q(ok.map((r) => r.payloadChars ?? r.contentChars), 0.5), cites: q(ok.map((r) => r.citations?.length ?? 0), 0.5),
    overall: mean(scores.map((s) => s.overall)), accuracy: mean(scores.map((s) => s.accuracy)),
    completeness: mean(scores.map((s) => s.completeness)), sources: mean(scores.map((s) => s.sources)),
    keyCorrect: keyScores.filter((k) => k === 'correct').length, keyPartial: keyScores.filter((k) => k === 'partial').length, keyN: keyScores.length,
    answerOverall: mean(aScores.map((s) => s.overall)), answerKeyCorrect: aKey.filter((k) => k === 'correct').length, answerKeyN: aKey.length,
    answerP50: q(as.map((a) => a.answerMs), 0.5), promptTok: q(as.map((a) => a.promptTokens ?? 0), 0.5), e2eP50: q(e2e, 0.5), e2eP90: q(e2e, 0.9),
  };
}).sort((a, b) => (b.answerOverall ?? b.overall ?? 0) - (a.answerOverall ?? a.overall ?? 0));

const cols = [['candidate', 'candidate'], ['fail', (t) => `${Math.round(t.failRate * 100)}%`], ['p50 ms', 'p50'], ['p90 ms', 'p90'], ['chars', 'chars'], ['cites', 'cites'],
  ['overall', (t) => r1(t.overall)], ['acc', (t) => r1(t.accuracy)], ['compl', (t) => r1(t.completeness)], ['src', (t) => r1(t.sources)], ['key ✓/~/n', (t) => `${t.keyCorrect}/${t.keyPartial}/${t.keyN}`],
  ['ans overall', (t) => r1(t.answerOverall)], ['ans key ✓', (t) => t.answerKeyN ? `${t.answerKeyCorrect}/${t.answerKeyN}` : ''], ['ans ms', 'answerP50'], ['prompt tok', 'promptTok'], ['e2e p50', 'e2eP50'], ['e2e p90', 'e2eP90']];
const cell = (t, [, f]) => String(typeof f === 'function' ? f(t) : t[f] ?? '');
console.log('| ' + cols.map(([h]) => h).join(' | ') + ' |');
console.log('|' + cols.map(() => '---').join('|') + '|');
for (const t of table) console.log('| ' + cols.map((c) => cell(t, c)).join(' | ') + ' |');

// Per-category overall (search-level judge).
const cats = [...new Set(bench.queries.map((x) => x.cat))];
const catOf = new Map(bench.queries.map((x) => [x.id, x.cat]));
console.log('\n| candidate | ' + cats.join(' | ') + ' |');
console.log('|---|' + cats.map(() => '---').join('|') + '|');
for (const t of table) {
  const src = ajudged.length ? ajudged : judged;
  console.log(`| ${t.candidate} | ` + cats.map((cat) => r1(mean(src.filter((j) => catOf.get(j.id) === cat).map((j) => j.scores?.[t.candidate]?.overall).filter((x) => x != null)))).join(' | ') + ' |');
}
if (args.json) writeFileSync(args.json, JSON.stringify(table, null, 2));
