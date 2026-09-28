// Combine one level's receipts: fs-load (Feishu side), collector (Gateway first text),
// loadmon (CPU / event loop / journal) and the external health prober window.
//   node fs-analyze.mjs <dir> <label> <health.jsonl>
import fs from "node:fs";
const [dir, label, healthFile] = process.argv.slice(2);
const load = JSON.parse(fs.readFileSync(`${dir}/fs-load-${label}.json`, "utf8"));
const col = JSON.parse(fs.readFileSync(`${dir}/collector-${label}.json`, "utf8"));
const mon = JSON.parse(fs.readFileSync(`${dir}/loadmon-${label}.json`, "utf8"));
const pct = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const stats = (a) => ({ n: a.filter(Number.isFinite).length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: pct(a, 1) });
const rows = load.rows;
const gwFirstText = rows.map((r) => {
  const s = col.per[`agent:makaron:feishu:group:${r.chat}`];
  const recv = (col.received[r.chat] ?? []).find((t) => t >= r.sentMs - 5000);
  return s?.firstText && recv ? s.firstText - recv : NaN;
});
const sendToGwFirstText = rows.map((r) => { const s = col.per[`agent:makaron:feishu:group:${r.chat}`]; return s?.firstText ? s.firstText - r.sentMs : NaN; });
const t0 = load.summary.t0, t1 = Math.max(...rows.map((r) => Math.max(r.completedMs ?? 0, r.imageMs ?? 0)), t0 + 60_000);
const health = fs.readFileSync(healthFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((h) => h.at && Date.parse(h.at) >= t0 && Date.parse(h.at) <= t1);
const out = {
  label, N: load.summary.N, completed: `${load.summary.completed}/${load.summary.sent}`,
  visibleWithMarker: rows.filter((r) => r.completedMs).length,
  images: `${load.summary.imagesDelivered}/${load.summary.imagesRequested}`,
  feishuFirstVisibleMs: stats(rows.map((r) => r.firstVisibleMs - r.sentMs)),
  completionMs: stats(rows.map((r) => r.completedMs - r.sentMs)),
  firstTextGatewayMs: stats(gwFirstText),
  firstTextFromSendMs: stats(sendToGwFirstText),
  cpu: mon.cpu, eventLoopDelayMs: mon.eventLoopDelayMs, rssMB: mon.rssMB,
  healthRttMs: { n: health.length, failed: health.filter((h) => !h.ok).length, ...stats(health.map((h) => h.totalMs)) },
  journal: mon.journal,
  failures: load.summary.failed, errors: Object.values(col.per).flatMap((s) => s.errors).slice(0, 10),
  byKind: Object.fromEntries([...new Set(rows.map((r) => r.kind))].map((k) => [k, `${rows.filter((r) => r.kind === k && r.completedMs).length}/${rows.filter((r) => r.kind === k).length}`])),
};
fs.writeFileSync(`${dir}/level-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
