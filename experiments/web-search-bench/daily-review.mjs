#!/usr/bin/env node
// Production web_search review for V. Read-only: scans recent transcript events in every
// agent database and summarizes web_search calls in a time window.
//
//   sudo -u openclaw node daily-review.mjs [--hours 24] [--until ISO] [--samples 8] [--json]
//
// Per provider: calls, failures, p50/p90 of the tool's own tookMs, result size, and a few
// sample queries with the first result titles (for a quality spot check). Also counts turns
// with several searches and the share of searches whose turn still produced a reply.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]);
  return acc;
}, []));
const HOURS = Number(args.hours ?? 24);
const until = args.until ? Date.parse(args.until) : Date.now();
const since = until - HOURS * 3600e3;
const SAMPLES = Number(args.samples ?? 8);
const root = args.state ?? '/home/openclaw/.openclaw';
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('');
  return JSON.stringify(content ?? '');
}
function parsePayload(text) {
  try { return JSON.parse(text); } catch {}
  const i = text.indexOf('{');
  try { return JSON.parse(text.slice(i)); } catch { return null; }
}
const strip = (s) => String(s ?? '').replace(/<<<[^>]*>>>/g, '').replace(/Source: Web Search\s*---/g, '').replace(/\s+/g, ' ').trim();

const searches = [];
const fetches = [];
for (const agent of fs.readdirSync(path.join(root, 'agents'))) {
  const file = path.join(root, 'agents', agent, 'agent', 'openclaw-agent.sqlite');
  if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < since) continue;
  const db = new DatabaseSync(`file:${file}?mode=ro`, { readOnly: true });
  try {
    const max = db.prepare('SELECT max(rowid) m FROM transcript_events').get().m ?? 0;
    // Scan back in chunks until a chunk starts before the window.
    const rows = [];
    for (let hi = max, step = 50000; hi > 0; hi -= step) {
      const chunk = db.prepare(`SELECT rowid, session_id, created_at, event_json FROM transcript_events
        WHERE rowid > ? AND rowid <= ? AND created_at >= ? AND created_at < ?
          AND (instr(event_json, '"web_search"') > 0 OR instr(event_json, '"web_fetch"') > 0 OR instr(event_json, '"role":"assistant"') > 0)`).all(hi - step, hi, since, until);
      rows.push(...chunk);
      const first = db.prepare('SELECT created_at FROM transcript_events WHERE rowid > ? ORDER BY rowid LIMIT 1').get(hi - step);
      if (!first || first.created_at < since) break;
    }
    rows.sort((a, b) => a.created_at - b.created_at || a.rowid - b.rowid);
    const calls = new Map();
    const bySession = new Map();
    for (const r of rows) {
      let j; try { j = JSON.parse(r.event_json); } catch { continue; }
      const m = j.type === 'message' ? j.message : null;
      if (!m) continue;
      if (m.role === 'assistant') {
        const parts = Array.isArray(m.content) ? m.content : [];
        for (const c of parts) if (c.type === 'toolCall' && (c.name === 'web_search' || c.name === 'web_fetch')) calls.set(c.id, { name: c.name, args: c.arguments, at: r.created_at });
        const hasText = parts.some((c) => c.type === 'text' && String(c.text ?? '').trim().length > 0);
        if (hasText) for (const s of bySession.get(r.session_id) ?? []) if (s.replyAt === null && r.created_at >= s.at) s.replyAt = r.created_at;
      } else if (m.role === 'toolResult' && (m.toolName ?? calls.get(m.toolCallId)?.name) === 'web_fetch') {
        const call = calls.get(m.toolCallId) ?? {};
        const text = textOf(m.content);
        const failed = m.isError === true || /Web fetch (failed|extraction failed)|"error"\s*:/u.test(text.slice(0, 600));
        fetches.push({ agent, at: r.created_at, url: call.args?.url ?? '', wallMs: call.at ? r.created_at - call.at : null, chars: text.length,
          extractor: text.match(/"extractor"\s*:\s*"([a-z-]+)"/u)?.[1] ?? (failed ? 'failed' : 'unknown'),
          error: failed ? strip(text).replace(/SECURITY NOTICE:[\s\S]*?---/u, '').slice(0, 140) : null });
      } else if (m.role === 'toolResult' && (m.toolName === 'web_search' || calls.get(m.toolCallId)?.name === 'web_search')) {
        const call = calls.get(m.toolCallId) ?? {};
        const text = textOf(m.content);
        const p = parsePayload(text) ?? {};
        const results = Array.isArray(p.results) ? p.results : [];
        const citations = Array.isArray(p.citations) ? p.citations : [];
        const s = {
          agent, session: r.session_id, at: r.created_at,
          provider: p.provider ?? (p.error ? 'error' : 'unknown'),
          tookMs: typeof p.tookMs === 'number' ? p.tookMs : null,
          wallMs: call.at ? r.created_at - call.at : null,
          chars: text.length,
          results: results.length || citations.length,
          error: m.isError === true || Boolean(p.error) ? strip(p.message ?? p.error ?? text).slice(0, 160) : null,
          query: call.args?.query ?? call.args?.objective ?? (call.args?.search_queries ?? []).join(' | '),
          queries: call.args?.search_queries?.length ?? (call.args?.query ? 1 : 0),
          top: results.slice(0, 3).map((x) => strip(x.title).slice(0, 60)).concat(citations.slice(0, 3).map((c) => strip(c.title ?? c.url ?? c).slice(0, 60))).slice(0, 3),
          replyAt: null,
        };
        searches.push(s);
        if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
        bySession.get(r.session_id).push(s);
      }
    }
  } finally { db.close(); }
}

const providers = [...new Set(searches.map((s) => s.provider))];
const summary = providers.map((provider) => {
  const s = searches.filter((x) => x.provider === provider);
  const ok = s.filter((x) => !x.error);
  const took = ok.map((x) => x.tookMs ?? x.wallMs).filter((x) => x != null);
  return {
    provider, calls: s.length, failures: s.length - ok.length,
    tookP50: q(took, 0.5), tookP90: q(took, 0.9), tookMax: took.length ? Math.max(...took) : null,
    charsP50: q(ok.map((x) => x.chars), 0.5), charsP90: q(ok.map((x) => x.chars), 0.9),
    zeroResults: ok.filter((x) => x.results === 0).length,
    multiQueryCalls: s.filter((x) => x.queries > 1).length,
    replied: s.filter((x) => x.replyAt !== null).length,
    errors: [...new Set(s.filter((x) => x.error).map((x) => x.error))].slice(0, 5),
  };
});
const turns = new Map();
for (const s of searches) turns.set(s.session + ':' + (s.replyAt ?? 'open'), (turns.get(s.session + ':' + (s.replyAt ?? 'open')) ?? 0) + 1);
const step = Math.max(1, Math.floor(searches.length / SAMPLES));
const samples = searches.filter((_, i) => i % step === 0).slice(0, SAMPLES).map((s) => ({
  at: new Date(s.at).toISOString(), provider: s.provider, ms: s.tookMs ?? s.wallMs, chars: s.chars, query: String(s.query).slice(0, 120), top: s.top, error: s.error,
}));
const fetchSummary = [...new Set(fetches.map((f) => f.extractor))].map((extractor) => {
  const f = fetches.filter((x) => x.extractor === extractor);
  const ms = f.map((x) => x.wallMs).filter((x) => x != null);
  return { extractor, calls: f.length, failed: f.filter((x) => x.error).length, msP50: q(ms, 0.5), msP90: q(ms, 0.9), charsP50: q(f.map((x) => x.chars), 0.5),
    hosts: [...new Set(f.map((x) => { try { return new URL(x.url).hostname.replace(/^www\./u, ''); } catch { return ''; } }))].slice(0, 8),
    errors: [...new Set(f.filter((x) => x.error).map((x) => x.error))].slice(0, 3) };
});
const out = {
  window: { since: new Date(since).toISOString(), until: new Date(until).toISOString(), hours: HOURS },
  searches: searches.length, turnsWithSearch: turns.size, maxSearchesInOneTurn: Math.max(0, ...turns.values()),
  summary, samples,
  fetches: fetches.length, fetchSummary,
};
if (args.json === 'true') console.log(JSON.stringify(out, null, 1));
else {
  console.log(`web_search ${out.window.since} .. ${out.window.until}: ${out.searches} searches in ${out.turnsWithSearch} turns (max ${out.maxSearchesInOneTurn} in one turn)`);
  for (const p of summary) console.log(`  ${p.provider}: ${p.calls} calls, ${p.failures} failed, took p50 ${p.tookP50} ms p90 ${p.tookP90} ms max ${p.tookMax} ms, result ${p.charsP50}/${p.charsP90} chars (p50/p90), zero-result ${p.zeroResults}, multi-query ${p.multiQueryCalls}, turn replied ${p.replied}/${p.calls}${p.errors.length ? `\n    errors: ${p.errors.join(' || ')}` : ''}`);
  console.log(`web_fetch: ${fetches.length} calls (extractor deepseek = fallback used)`);
  for (const f of fetchSummary) console.log(`  ${f.extractor}: ${f.calls} calls, ${f.failed} failed, p50 ${f.msP50} ms p90 ${f.msP90} ms, ${f.charsP50} chars p50, hosts ${f.hosts.join(', ')}${f.errors.length ? `\n    errors: ${f.errors.join(' || ')}` : ''}`);
  for (const s of samples) console.log(`  - [${s.provider} ${s.ms} ms ${s.chars} ch] ${s.query}${s.error ? `  ERROR ${s.error}` : `  → ${s.top.join(' / ')}`}`);
}
