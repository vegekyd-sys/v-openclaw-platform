#!/usr/bin/env node
// Render one day's V 首字 report (Markdown) from the JSON summaries run.sh keeps.
//
//   node format.mjs --dir ~/.cache/v-firsttext/daily --day 2026-10-06 [--days 14]
//
// <dir>/<YYYY-MM-DD>.json is the --json output of firsttext-e2e-report.mjs for that
// CST day. The report shows the day itself, the change against the previous day
// with data, and a trend table over the last --days days.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dir = opt('dir');
const day = opt('day');
const span = Number(opt('days', '14'));

const s = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(1) : '-');
const load = (d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${d}.json`), 'utf8')); } catch { return undefined; } };
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const head1 = (d) => d?.firstText ?? d?.firstAnswer;

export function render(day, today, history) {
  const L = [];
  const row = (label, x) => L.push(`| ${label} | ${x?.n ?? 0} | ${s(x?.p50)} | ${s(x?.p95)} | ${s(x?.p99)} | ${s(x?.max)} |`);
  const head = () => { L.push('| 指标 | n | P50 | P95 | P99 | Max |'); L.push('|---|---|---|---|---|---|'); };
  L.push(`# V 首字日报 ${day}（北京时间全天）`, '');
  if (!today) { L.push('这一天没有拿到数据。'); return L.join('\n'); }
  // 首字 counts a status line pushed before the answer (Tianyi, 2026-10-06); older summaries only
  // have firstAnswer
  const fa = head1(today);
  L.push(`${today.n} 条飞书消息，${fa.n} 条有首字${Number.isFinite(today.statusFirst) ? `，其中 ${today.statusFirst} 条先出的是状态行` : ''}。目标：P50 ≈ 1s，P99 和 Max < 10s。`);
  const prev = history.filter((h) => h.day < day && head1(h.data)?.n).at(-1);
  if (prev && fa.n) {
    const d = (k) => { const a = fa[k], b = head1(prev.data)[k]; if (!Number.isFinite(a) || !Number.isFinite(b)) return `${k === "max" ? "Max" : k.toUpperCase()} -`; const x = (a - b) / 1000; return `${k === "max" ? "Max" : k.toUpperCase()} ${x > 0 ? '+' : ''}${x.toFixed(1)}s`; };
    L.push(`比 ${prev.day}：${['p50', 'p95', 'p99', 'max'].map(d).join('，')}。`);
  }
  L.push('', '单位秒。', '');
  head();
  row('首字（回答文字或状态行）', fa);
  if (today.firstText) row('首段回答文字', today.firstAnswer);
  row('first visible（任何推送）', today.firstVisible);
  row('系统开销（首字 − 模型）', today.overhead);
  row('　系统开销，无工具调用', today.overheadNoTools);
  const m = today.model ?? {};
  row('发出 → 第一次调模型', m.toModelMs);
  row('模型首个事件', m.modelFirstEventMs);
  row('模型到首个文本', m.modelToTextMs);
  const g = today.segments ?? {};
  row('inbound（飞书投递）', g.inboundMs);
  row('排队 收到 → 开始运行', g.queueMs);
  row('　飞书预处理', g.preDispatchMs);
  row('　Gateway → 开始运行', g.dispatchToRunMs);
  row('文字 → 卡片', g.deliveryMs);
  L.push('');
  const hs = Object.entries(today.byHarness ?? {}).filter(([, x]) => x.n).sort((a, b) => b[1].n - a[1].n);
  if (hs.length) {
    L.push('按 harness/模型的首字：', '');
    head();
    for (const [k, x] of hs) row(k, x);
    L.push('');
  }
  if (today.slowest?.length) {
    L.push('最慢 5 条（北京时间，首字 / 首段回答 / 系统开销 / 排队 / harness）：', '');
    for (const r of today.slowest) {
      const t = new Date(r.at + 8 * 3600e3).toISOString().slice(11, 19);
      L.push(`- ${t}　${s(r.firstTextMs ?? r.firstAnswerMs)} / ${s(r.firstAnswerMs)} / ${s(r.overheadMs)} / ${s(r.queueMs)}　${r.harness}/${r.model}`);
    }
    L.push('');
  }
  const rows = history.filter((h) => h.data);
  if (rows.length > 1) {
    L.push(`趋势（最近 ${span} 天有数据的日子）：`, '');
    L.push('| 日期 | n | 首字 P50 | P95 | P99 | Max | 开销 P50 | 开销 P95 |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const h of rows) {
      const a = head1(h.data), o = h.data.overhead ?? {};
      L.push(`| ${h.day} | ${a.n} | ${s(a.p50)} | ${s(a.p95)} | ${s(a.p99)} | ${s(a.max)} | ${s(o.p50)} | ${s(o.p95)} |`);
    }
    L.push('');
  }
  L.push('口径：首字 = 飞书消息发出 → 卡片里第一段回答文字或状态行（工具、压缩状态算），不含 thinking。系统开销 = 首字 − 模型从发请求到吐出首段回答文字（含 thinking）。只统计飞书。');
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const history = [];
  for (let i = span - 1; i >= 0; i--) { const d = shift(day, -i); history.push({ day: d, data: load(d) }); }
  console.log(render(day, load(day), history));
}
