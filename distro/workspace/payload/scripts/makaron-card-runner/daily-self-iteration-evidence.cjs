#!/usr/bin/env node
'use strict';

/**
 * Deterministic evidence preflight for Makaron daily self-iteration review.
 *
 * Purpose:
 * - Keep the cron fail-soft by avoiding ad-hoc LLM shell/cat/jq loops.
 * - Run the existing read-only collector.
 * - Produce a compact digest the review agent can read safely.
 * - Never fail the process for optional evidence gaps; write warnings instead.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const COLLECTOR = path.join(ROOT, 'scripts/makaron-card-runner/collect-daily-evidence.cjs');

function pad(n) { return String(n).padStart(2, '0'); }
function shanghaiParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    hh: Number(parts.hour), mm: Number(parts.minute), ss: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    stamp: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`,
  };
}
function ymdOffset(dateStr, days) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`;
}
function parseArgs(argv) {
  const out = { date: '', out: '', json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') out.date = argv[++i] || '';
    else if (a === '--out') out.out = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node daily-self-iteration-evidence.cjs [--date YYYY-MM-DD] [--out DIR] [--json]');
      process.exit(0);
    }
  }
  return out;
}
function readJsonSafe(file, warnings) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { warnings.push(`read_json_failed ${path.relative(ROOT, file)}: ${e.message}`); return null; }
}
function readTextSafe(file, warnings, max = 12000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, max); }
  catch (e) { warnings.push(`read_text_failed ${path.relative(ROOT, file)}: ${e.message}`); return ''; }
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p) || '.'; }
function statusLine(s = {}) {
  return `accepted ${s.accepted || 0}, revision ${s.revision || 0}, delivered ${s.delivered || 0}, autoCompleted ${s.autoCompleted || 0}, blocked ${s.blocked || 0}, failed ${s.failed || 0}, stale ${s.stale || 0}, inProgress ${s.inProgress || 0}`;
}
function pickDailyTasks(evidence) {
  const tasks = Array.isArray(evidence?.tasks) ? evidence.tasks : [];
  return tasks.filter(t => {
    const sig = t.dateSignals || {};
    return Boolean(sig.registryInDay || sig.jobInDay || sig.workerLogInDay || sig.sidecarInDay || sig.feedbackInDay);
  }).slice(0, 20).map(t => ({
    title: t.title || '(untitled)',
    status: t.status || '',
    statusRaw: t.statusRaw || '',
    cardId: t.cardId || '',
    chatId: t.chatId || '',
    project: t.projectUrl || '',
    brief: String(t.brief || '').slice(0, 220),
    sentAssets: t.sentAssets || [],
    jobPaths: t.jobPaths || [],
    logPaths: t.logPaths || [],
    warnings: t.reconciliation?.warnings || [],
    feedback: t.feedback || {},
  }));
}
function latestFiles(dir, limit = 8) {
  try {
    return fs.readdirSync(dir).map(name => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      return { name, path: rel(p), mtimeMs: st.mtimeMs, size: st.size, isDir: st.isDirectory() };
    }).sort((a,b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
  } catch { return []; }
}

(function main() {
  const args = parseArgs(process.argv);
  const now = shanghaiParts();
  // The review cron runs at midnight, but Gateway restart/recovery can delay it
  // into the early hours. Until 05:59 Shanghai time, default to the just-ended
  // operating date; callers that truly need an intraday review pass --date.
  const reportDate = args.date || (now.hh < 6 ? ymdOffset(now.date, -1) : now.date);
  const outDir = path.resolve(ROOT, args.out || `work/makaron-daily-evidence/${reportDate}-self-iteration`);
  ensureDir(outDir);

  const warnings = [];
  const collectorJson = path.join(outDir, 'collector.stdout.json');
  let collectorOk = false;
  let collectorStdout = '';
  let collectorStderr = '';

  if (!fs.existsSync(COLLECTOR)) {
    warnings.push(`collector_missing ${rel(COLLECTOR)}`);
  } else {
    const res = spawnSync(process.execPath, [COLLECTOR, '--date', reportDate, '--out', outDir, '--json'], {
      cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    });
    collectorStdout = res.stdout || '';
    collectorStderr = res.stderr || '';
    try { fs.writeFileSync(collectorJson, collectorStdout); } catch {}
    if (res.error) warnings.push(`collector_spawn_error ${res.error.message}`);
    if (res.status !== 0) warnings.push(`collector_exit_${res.status}: ${collectorStderr.slice(0, 500)}`);
    collectorOk = res.status === 0;
  }

  const evidenceFile = path.join(outDir, 'evidence.json');
  const summaryFile = path.join(outDir, 'summary.md');
  const evidence = readJsonSafe(evidenceFile, warnings) || {};
  const summaryHead = readTextSafe(summaryFile, warnings, 8000);
  const s = evidence.summary || evidence || {};
  const dailyTasks = pickDailyTasks(evidence);
  const rec = s.reconciliationWarnings || s.reconciliation || {};
  const digest = {
    ok: true,
    generatedAt: now.stamp,
    reportDate,
    outDir: rel(outDir),
    collectorOk,
    warnings,
    summary: {
      totalTasks: s.totalTasks || 0,
      dailyEvidenceTasks: s.dailyEvidenceTasks || dailyTasks.length || 0,
      dailyWorkerCards: s.dailyWorkerCards || 0,
      dailyWorkerJobs: s.dailyWorkerJobs || 0,
      dailyWorkerLogs: s.dailyWorkerLogs || 0,
      dailyFeedbackRecords: s.dailyFeedbackRecords || 0,
      dailyExecutionStatus: s.dailyExecutionStatus || {},
      currentStatusSnapshot: s.currentStatusSnapshot || {},
      reconciliationWarnings: rec,
    },
    dailyTasks,
    latestFiles: {
      jobs: latestFiles(path.join(ROOT, 'tmp/makaron-jobs'), 8),
      workerLogs: latestFiles(path.join(ROOT, 'tmp/makaron-worker-logs'), 8),
      feedback: latestFiles(path.join(ROOT, `memory/projects/makaron/feedback`), 8),
    },
    files: {
      evidence: fs.existsSync(evidenceFile) ? rel(evidenceFile) : null,
      summary: fs.existsSync(summaryFile) ? rel(summaryFile) : null,
      digest: rel(path.join(outDir, 'digest.json')),
      digestMarkdown: rel(path.join(outDir, 'digest.md')),
    },
  };

  const md = [];
  md.push(`# Makaron Self-Iteration Evidence Digest — ${reportDate}`);
  md.push('');
  md.push(`Generated: ${now.stamp}`);
  md.push(`Collector: ${collectorOk ? 'ok' : 'partial/failed'}`);
  md.push(`Output: \`${rel(outDir)}\``);
  if (warnings.length) {
    md.push(''); md.push('## Warnings');
    warnings.forEach(w => md.push(`- ${w}`));
  }
  md.push(''); md.push('## Counts');
  md.push(`- Total registry/tasks: ${digest.summary.totalTasks}`);
  md.push(`- Daily evidence tasks: ${digest.summary.dailyEvidenceTasks}; worker cards ${digest.summary.dailyWorkerCards}; jobs ${digest.summary.dailyWorkerJobs}; logs ${digest.summary.dailyWorkerLogs}; feedback ${digest.summary.dailyFeedbackRecords}`);
  md.push(`- Daily status: ${statusLine(digest.summary.dailyExecutionStatus)}`);
  md.push(`- Current snapshot: ${statusLine(digest.summary.currentStatusSnapshot)}`);
  md.push(`- Reconciliation: delivered/evidence mismatch ${rec.deliveredEvidenceMismatch || 0}, stale lock ${rec.staleWorkerLock || 0}, sidecar failure ${rec.sidecarDecisionFailure || 0}, unresolved sidecar ${rec.unresolvedSidecarDecision || 0}, orphan in-progress ${rec.orphanInProgress || 0}`);
  md.push(''); md.push('## Daily Tasks');
  if (!dailyTasks.length) md.push('- No daily Makaron task evidence found.');
  for (const t of dailyTasks) {
    md.push(`- **${t.title}** — ${t.status}${t.statusRaw ? ` (${t.statusRaw})` : ''}`);
    if (t.brief) md.push(`  - Brief: ${t.brief}`);
    if (t.sentAssets?.length) md.push(`  - Assets: ${t.sentAssets.join(', ')}`);
    if (t.warnings?.length) md.push(`  - Warnings: ${t.warnings.join(', ')}`);
    if (t.project) md.push(`  - Project: ${t.project}`);
  }
  md.push(''); md.push('## Safe Source Files');
  Object.entries(digest.files).forEach(([k,v]) => { if (v) md.push(`- ${k}: \`${v}\``); });
  md.push(''); md.push('## Collector Summary Head');
  md.push('```markdown');
  md.push(summaryHead.slice(0, 5000));
  md.push('```');

  fs.writeFileSync(path.join(outDir, 'digest.json'), JSON.stringify(digest, null, 2));
  fs.writeFileSync(path.join(outDir, 'digest.md'), md.join('\n'));

  if (args.json) console.log(JSON.stringify(digest, null, 2));
  else console.log(md.join('\n'));
  // Always exit 0: optional evidence issues are report warnings, not cron failures.
  process.exit(0);
})();
