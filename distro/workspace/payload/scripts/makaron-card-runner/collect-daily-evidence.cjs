#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REGISTRY = path.join(ROOT, 'tmp', 'makaron-active-tasks.json');
const DEFAULT_FEEDBACK_DIR = path.join(ROOT, 'memory', 'projects', 'makaron', 'feedback');
const DEFAULT_CARD_ACTION_DIR = path.join(ROOT, 'tmp', 'makaron-card-actions');
const DEFAULT_SIDECAR_DIR = path.join(ROOT, 'tmp', 'makaron-sidecar-supervisors-v15');
const DEFAULT_LOCK_DIR = path.join(ROOT, 'tmp', 'makaron-worker-locks');
const TZ = 'Asia/Shanghai';
const OFFICIAL_SCOPE = [
  'Makaron Feishu/Lark task cards',
  'CLI/direct Makaron runs',
  'marketplace skill ops',
];

function parseArgs(argv) {
  const args = { date: null, out: null, chat: null, json: false, strict: false, includeMemory: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--date') args.date = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--chat') args.chat = String(argv[++i] || '').replace(/^chat:/, '');
    else if (a === '--json') args.json = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--include-memory') args.includeMemory = true;
    else if (a === '-h' || a === '--help') usage(0);
    else throw new Error(`Unknown arg: ${a}`);
  }
  args.date ||= todayShanghai();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`Invalid --date: ${args.date}`);
  args.out ||= path.join(ROOT, 'work', 'makaron-daily-evidence', args.date);
  return args;
}

function usage(code) {
  console.log(`Usage: node scripts/makaron-card-runner/collect-daily-evidence.cjs [--date YYYY-MM-DD] [--out DIR] [--chat oc_xxx|ou_xxx] [--json] [--strict]\n\nRead-only collector for Makaron daily evidence.`);
  process.exit(code);
}

function todayShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function dayBoundsMs(date) {
  // Asia/Shanghai has no DST; keep this explicit and simple.
  const start = Date.parse(`${date}T00:00:00+08:00`);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function inDay(ms, bounds) {
  const n = Number(ms || 0);
  return Number.isFinite(n) && n >= bounds.start && n < bounds.end;
}
function isLifecycleHousekeepingUpdate(reg, bounds) {
  if (!reg || inDay(reg.createdAt, bounds)) return false;
  const status = String(reg.status || '').toLowerCase();
  const phase = String(reg.phase || '').toLowerCase();
  const lifecycleStatus = status === 'auto_completed' || status === 'stale_needs_review' || phase === 'stale' || reg.autoCompleted === true || reg.stale === true;
  if (!lifecycleStatus) return false;
  return inDay(reg.updatedAt, bounds) && (inDay(reg.autoCompletedAt, bounds) || inDay(reg.staleAt, bounds));
}

function fmtMs(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(Number(ms))).replace(' ', 'T') + '+08:00';
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) {
    if (fallback !== null) return fallback;
    throw new Error(`Failed to parse JSON ${file}: ${err.message}`);
  }
}

function readJsonl(file, errors) {
  const out = [];
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (err) {
    errors.push({ type: 'jsonl_read_error', path: rel(file), error: err.message });
    return out;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try { out.push({ value: JSON.parse(line), line: i + 1 }); }
    catch (err) { errors.push({ type: 'jsonl_parse_error', path: rel(file), line: i + 1, error: err.message }); }
  }
  return out;
}

function safeReadJson(file, errors) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { errors.push({ type: 'json_parse_error', path: rel(file), error: err.message }); return null; }
}

function listFiles(dir, re) {
  try { return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)).sort(); }
  catch { return []; }
}

function rel(p) { return path.relative(ROOT, p) || p; }
function uniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function short(s, n = 260) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

function dateCompact(date) { return date.replace(/-/g, ''); }


function timestampMsFromCompactUtc(value) {
  const m = String(value || '').match(/(20\d{6})(\d{6})/);
  if (!m) return null;
  const y = m[1].slice(0, 4);
  const mo = m[1].slice(4, 6);
  const d = m[1].slice(6, 8);
  const hh = m[2].slice(0, 2);
  const mm = m[2].slice(2, 4);
  const ss = m[2].slice(4, 6);
  const n = Date.parse(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
  return Number.isFinite(n) ? n : null;
}

function fileTimeMs(file) {
  const fromName = timestampMsFromCompactUtc(path.basename(file));
  if (fromName) return fromName;
  try { return fs.statSync(file).mtimeMs; }
  catch { return null; }
}

function readMakaronBaseline() {
  const versionFile = path.join('/root', '.agents', 'skills', 'makaron', 'VERSION.md');
  try {
    const text = fs.readFileSync(versionFile, 'utf8');
    const m = text.match(/\*\*Accepted baseline:\*\*\s*`?([^`\n]+?)`?\s*[—-]\s*([^\n]+)/);
    if (m) return `Makaron ${m[1].trim()} ${m[2].trim()}`;
  } catch {}
  return 'Makaron accepted baseline (VERSION.md unavailable)';
}

function parseTimeMs(value) {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : null;
}

function mergeFeedback(base = {}, patch = {}) {
  const out = {
    accepted: Boolean(base.accepted),
    acceptedAt: base.acceptedAt || null,
    lastCardAction: base.lastCardAction || null,
    lastCardActionAt: base.lastCardActionAt || null,
    writtenFeedback: Array.isArray(base.writtenFeedback) ? base.writtenFeedback.slice() : [],
    events: Array.isArray(base.events) ? base.events.slice() : [],
    counts: { ...(base.counts || {}) },
  };
  if (patch.accepted) out.accepted = true;
  if (patch.acceptedAt) out.acceptedAt = patch.acceptedAt;
  if (patch.lastCardAction) out.lastCardAction = patch.lastCardAction;
  if (patch.lastCardActionAt) out.lastCardActionAt = patch.lastCardActionAt;
  if (Array.isArray(patch.writtenFeedback)) out.writtenFeedback.push(...patch.writtenFeedback);
  if (Array.isArray(patch.events)) out.events.push(...patch.events);
  for (const [k, v] of Object.entries(patch.counts || {})) out.counts[k] = (out.counts[k] || 0) + Number(v || 0);
  out.writtenFeedback = out.writtenFeedback.slice(-20);
  out.events = out.events.slice(-80);
  return out;
}

function normalizeFeedbackRecord(raw = {}, source = {}) {
  const task = raw.task && typeof raw.task === 'object' ? raw.task : {};
  const atMs = parseTimeMs(raw.at) || parseTimeMs(raw.receivedAt) || task.updatedAt || task.createdAt || null;
  const type = String(raw.type || raw.action || 'unknown_feedback');
  const writtenText = raw.writtenText || raw.feedbackText || raw.userFeedback || '';
  return {
    source,
    version: raw.version || '',
    type,
    action: raw.action || '',
    at: raw.at || (atMs ? new Date(Number(atMs)).toISOString() : ''),
    atMs,
    atText: fmtMs(atMs),
    chatId: String(raw.chatId || task.chatId || '').replace(/^chat:/, ''),
    cardId: raw.cardId || task.messageId || task.cardId || '',
    operatorOpenId: raw.operatorOpenId || '',
    title: task.title || raw.title || '',
    brief: short(task.brief || raw.brief, 500),
    statusRaw: task.status || raw.status || '',
    projectUrl: task.projectUrl || raw.projectUrl || '',
    outputs: Array.isArray(task.outputs) ? task.outputs : [],
    makaronSay: short(task.makaronSay || raw.makaronSay, 1200),
    learning: raw.learning || '',
    writtenText: short(writtenText, 1200),
    reroll: raw.reroll || null,
  };
}

function extractWrittenFeedback(text) {
  const s = String(text || '');
  const m = s.match(/用户反馈[:：]\s*([\s\S]*?)(?:\n\s*(?:保留上一版方向|硬要求|要求[:：]|$))/);
  return short((m ? m[1] : s).replace(/^\s*[-*\d.、]+/gm, '').trim(), 1200);
}

function typedFeedbackRecordsForDate(date, errors) {
  const compact = dateCompact(date);
  const dirs = listFiles(DEFAULT_CARD_ACTION_DIR, new RegExp(`^typed-feedback-${compact}.*$`))
    .filter(p => {
      try { return fs.statSync(p).isDirectory(); } catch { return false; }
    });
  const out = [];
  for (const dir of dirs) {
    const stateFile = path.join(dir, 'state.json');
    const briefFile = path.join(dir, 'brief.md');
    const state = safeReadJson(stateFile, errors) || {};
    let briefText = '';
    try { briefText = fs.readFileSync(briefFile, 'utf8'); }
    catch (err) { errors.push({ type: 'typed_feedback_read_error', path: rel(briefFile), error: err.message }); }
    out.push(normalizeFeedbackRecord({
      version: 'makaron-typed-feedback-v1',
      type: 'written_feedback',
      action: 'typed_feedback',
      at: state.updatedAt ? new Date(Number(state.updatedAt)).toISOString() : '',
      chatId: state.chatId || '',
      cardId: state.messageId || state.cardId || '',
      task: state,
      writtenText: extractWrittenFeedback(briefText || state.makaronSay || ''),
      learning: 'User supplied written revision feedback; review for material binding, brief quality, and artifact finality.',
    }, { type: 'typed_feedback_dir', path: rel(dir) }));
  }
  return out;
}

function parseWorkerLog(file, errors) {
  const text = fs.readFileSync(file, 'utf8');
  const jsons = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('{') && line.endsWith('}')) {
      try { jsons.push(JSON.parse(line)); } catch {}
      continue;
    }
    if (line === '{') {
      const buf = [];
      let depth = 0;
      for (let j = i; j < lines.length; j += 1) {
        const l = lines[j];
        buf.push(l);
        for (const ch of l) {
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
        }
        if (depth === 0) {
          try { jsons.push(JSON.parse(buf.join('\n'))); i = j; } catch {}
          break;
        }
      }
    }
  }
  if (!jsons.length) errors.push({ type: 'worker_log_no_json', path: rel(file) });
  const launch = jsons.find(o => o && o.event === 'launch') || null;
  const summary = [...jsons].reverse().find(o => o && (o.status || o.runId || o.projectId || o.jobPath)) || null;
  return { file, launch, summary, jsonCount: jsons.length };
}

function inferExpected(job, registryTask, workerSummary) {
  const delivered = (workerSummary?.deliveredAssets || []).map(a => a?.type).filter(Boolean);
  const assets = [ ...(job?.expectedAssets || []), ...delivered ].join(' ').toLowerCase();
  if (/video|视频|🎬/.test(assets)) return 'video';
  if (/image|图片|🖼/.test(assets)) return 'image';
  if (/music|audio|音频|音乐/.test(assets)) return 'audio';
  if (/file|文件/.test(assets)) return 'file';
  return 'unknown';
}

function hasRealDeliveryRecord(asset) {
  if (!asset || typeof asset !== 'object') return false;
  return Boolean(asset.url || asset.localPath || asset.filePath || asset.sendRecord || asset.messageId || asset.deliveryMessageId);
}

function deliveredAssetTypes(summary={}) {
  const detailed = Array.isArray(summary.deliveredAssets) ? summary.deliveredAssets : [];
  return uniq(detailed.filter(hasRealDeliveryRecord).map(a => String(a.type || '').toLowerCase()).filter(Boolean));
}

function pidAlive(pid) {
  const n = Number(pid || 0);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; }
  catch { return false; }
}

function readLockInfo(cardId, errors) {
  if (!cardId) return null;
  const file = path.join(DEFAULT_LOCK_DIR, `${cardId}.lock.json`);
  if (!fs.existsSync(file)) return null;
  const lock = safeReadJson(file, errors) || {};
  return { path: rel(file), pid: lock.pid || null, alive: pidAlive(lock.pid), reservedAt: lock.reservedAt || null, activatedAt: lock.activatedAt || null, script: lock.script || '', jobCardId: lock.jobCardId || '' };
}

function parseSidecarJsonl(file, errors) {
  if (!fs.existsSync(file)) return [];
  return readJsonl(file, errors).map(x => x.value);
}

function readSidecarEvidence(cardId, bounds, errors) {
  if (!cardId) return null;
  const root = path.join(DEFAULT_SIDECAR_DIR, cardId);
  let runDirs = [];
  try { runDirs = fs.readdirSync(root).map(f => path.join(root, f)).filter(p => fs.statSync(p).isDirectory()).sort(); }
  catch { return null; }
  const out = { paths: [], deliveredAssets: [], decisions: [], decisionErrors: [], decisionRequests: [], done: [], spawnErrors: [], inDay: false };
  for (const dir of runDirs) {
    const eventsFile = path.join(dir, 'events.jsonl');
    const logFile = path.join(dir, 'sidecar.log.jsonl');
    const doneFile = path.join(dir, 'done.json');
    const spawnErrorFile = path.join(dir, 'spawn-error.json');
    const events = parseSidecarJsonl(eventsFile, errors);
    const logs = parseSidecarJsonl(logFile, errors);
    if (fs.existsSync(eventsFile)) out.paths.push(rel(eventsFile));
    if (fs.existsSync(logFile)) out.paths.push(rel(logFile));
    for (const ev of events) {
      const atMs = parseTimeMs(ev.at);
      if (inDay(atMs, bounds)) out.inDay = true;
      if (ev.eventType === 'delivery_succeeded' && ev.asset?.type) out.deliveredAssets.push(String(ev.asset.type).toLowerCase());
      if (ev.needsDecision) out.decisionRequests.push({ id: ev.id || '', eventType: ev.eventType || '', at: ev.at || '', summary: short(ev.summary, 500) });
    }
    for (const ev of logs) {
      const atMs = parseTimeMs(ev.at);
      if (inDay(atMs, bounds)) out.inDay = true;
      if (ev.event === 'decision_request') out.decisionRequests.push({ id: ev.id || '', eventType: ev.eventType || '', at: ev.at || '', summary: '' });
      if (ev.event === 'decision_error') out.decisionErrors.push({ id: ev.id || '', at: ev.at || '', error: short(ev.error, 1200) });
      if (ev.event === 'decision_written') out.decisions.push({ id: ev.id || '', decision: normalizeDecision(ev.decision), reason: '', source: rel(logFile) });
    }
    const decisionsDir = path.join(dir, 'decisions');
    try {
      for (const file of fs.readdirSync(decisionsDir).filter(f => f.endsWith('.json')).map(f => path.join(decisionsDir, f))) {
        const d = safeReadJson(file, errors);
        if (!d) continue;
        const atMs = parseTimeMs(d.at);
        if (inDay(atMs, bounds)) out.inDay = true;
        out.paths.push(rel(file));
        out.decisions.push({ id: d.id || path.basename(file, '.json'), decision: normalizeDecision(d.decision), reason: short(d.reason, 1200), source: rel(file), confidence: d.confidence });
      }
    } catch {}
    if (fs.existsSync(doneFile)) {
      const d = safeReadJson(doneFile, errors) || {};
      const atMs = parseTimeMs(d.at);
      if (inDay(atMs, bounds)) out.inDay = true;
      out.paths.push(rel(doneFile));
      out.done.push({ reason: d.reason || '', at: d.at || '', code: d.code, signal: d.signal });
    }
    if (fs.existsSync(spawnErrorFile)) {
      const d = safeReadJson(spawnErrorFile, errors) || {};
      const atMs = parseTimeMs(d.at);
      if (inDay(atMs, bounds)) out.inDay = true;
      out.paths.push(rel(spawnErrorFile));
      out.spawnErrors.push({ reason: d.reason || 'sidecar_spawn_error', at: d.at || '', message: short(d.message, 1200) });
    }
  }
  out.paths = uniq(out.paths);
  out.deliveredAssets = uniq(out.deliveredAssets);
  out.decisionRequests = out.decisionRequests.filter((v, i, a) => a.findIndex(x => x.id === v.id && x.eventType === v.eventType) === i);
  return out;
}

// The active-task registry is intentionally a current-state snapshot and may
// prune completed cards. Sidecar directories are therefore an independent
// event source, not merely enrichment for registry entries.
function sidecarCardsWithActivityInDay(bounds, errors) {
  let cardIds = [];
  try {
    cardIds = fs.readdirSync(DEFAULT_SIDECAR_DIR)
      .filter(name => {
        try { return fs.statSync(path.join(DEFAULT_SIDECAR_DIR, name)).isDirectory(); }
        catch { return false; }
      });
  } catch { return []; }
  return cardIds.filter(cardId => readSidecarEvidence(cardId, bounds, errors)?.inDay);
}

function sidecarHasUnresolvedDecision(sidecar) {
  if (!sidecar) return false;
  const resolved = new Set([...(sidecar.decisions || []).map(d => d.id), ...(sidecar.decisionErrors || []).map(d => d.id)]);
  return (sidecar.decisionRequests || []).some(r => r.id && !resolved.has(r.id));
}

function extractCardIdFromLog(log) {
  const lock = log?.launch?.lockPath || '';
  const m = String(lock).match(/(om_[^.\/]+)\.lock\.json$/);
  return m ? m[1] : '';
}

function extractCardIdFromJob(job) { return job?.cardId || job?.initialState?.messageId || ''; }
function extractChatIdFromJob(job) { return String(job?.chatId || job?.initialState?.chatId || '').replace(/^chat:/, ''); }

function parseReviewDecisions(outputs) {
  const out = [];
  for (const [idx, raw] of (outputs || []).entries()) {
    const text = String(raw || '');
    const m = text.match(/决策[:：]\s*([^｜|\s]+)\s*[｜|]\s*(.+)$/);
    if (!m) continue;
    out.push({ decision: normalizeDecision(m[1]), reason: short(m[2], 500), source: `registry.outputs[${idx}]` });
  }
  return out;
}

function normalizeDecision(s) {
  const t = String(s || '').toLowerCase();
  if (/confirm|通过|同意/.test(t)) return 'confirm';
  if (/reject|拒绝|stop|停止/.test(t)) return 'reject';
  if (/revise|revision|修改|调整/.test(t)) return 'revise';
  return short(s, 60) || 'unknown';
}

function riskTags(task) {
  const text = [task.title, task.brief, task.statusRaw, ...(task.outputs || []), ...(task.logs || []).map(l => l.text)].join('\n').toLowerCase();
  const risks = [];
  if (/watermark|logo|文字|text|title|标题|makaron original/.test(text)) risks.push('text_logo_risk');
  if (/iron throne|game of thrones|ip|品牌|商标|版权/.test(text)) risks.push('ip_risk');
  if (/裁切|crop|模糊|blur|看不懂|封面|wrong material|素材|face unclear|脸/.test(text)) risks.push('crop_material_risk');
  if (/很假|fake|动作|motion|抢断|运动|realism|真实性/.test(text)) risks.push('motion_realism_risk');
  if (/doc|table|表格|文档|插入|验证/.test(text)) risks.push('delivery_verification_risk');
  return uniq(risks);
}

function normalizeStatus(reg, workerSummaries, reconciliation = {}) {
  const rawStatus = String(reg?.status || '').toLowerCase();
  const lastAction = reg?.lastCardAction;
  if (reg?.stale === true || rawStatus === 'stale_needs_review' || reg?.phase === 'stale') return 'stale';
  if (reg?.autoCompleted === true || rawStatus === 'auto_completed') return 'auto_completed';
  const summaries = workerSummaries || [];
  if (reg?.accepted === true || lastAction === 'positive_acceptance' || rawStatus === 'accepted') return 'accepted';
  if (lastAction === 'revision_request' || /revision|reroll|重新生成|修改/.test(rawStatus)) return 'revision';
  if (reg?.failed === true || summaries.some(s => /fail|error/.test(String(s?.status || '').toLowerCase()))) return /执行受阻|blocked|key/.test(rawStatus + ' ' + (reg?.makaronSay || '')) ? 'blocked' : 'failed';
  if (/执行受阻|blocked|no makaron key|账号未就绪/.test(rawStatus + ' ' + String(reg?.makaronSay || '').toLowerCase())) return 'blocked';
  if (reg?.done === true || summaries.some(s => s?.status === 'delivered') || reconciliation.deliveredEvidence) return 'delivered';
  if (reconciliation.sidecarDecisionFailure || reconciliation.orphanInProgress) return 'blocked';
  if (reg && reg.done !== true && reg.failed !== true) return 'in_progress';
  if (summaries.some(s => s?.status === 'delivered')) return 'delivered';
  return 'unknown';
}

function buildCollector(args) {
  const bounds = dayBoundsMs(args.date);
  const compact = dateCompact(args.date);
  const errors = [];
  const sources = [];

  const registry = readJson(DEFAULT_REGISTRY, { version: 1, tasks: {} });
  sources.push(rel(DEFAULT_REGISTRY));

  // Registry is a current-state snapshot, not only a daily event log.
  // Include all visible active-registry tasks so daily review can see current accepted/revision/blocked states,
  // then mark which tasks also have in-day registry/job/log evidence.
  const registryEntries = Object.values(registry.tasks || {})
    .filter(t => !args.chat || String(t.chatId || '').replace(/^chat:/, '') === args.chat);

  const jobFiles = listFiles(path.join(ROOT, 'tmp', 'makaron-jobs'), /\.json$/);
  const jobs = jobFiles
    .map(file => ({ file, job: safeReadJson(file, errors) }))
    .filter(x => x.job)
    .filter(x => inDay(x.job.createdAt || x.job.updatedAt || fileTimeMs(x.file), bounds));
  for (const x of jobs) sources.push(rel(x.file));

  const logFiles = listFiles(path.join(ROOT, 'tmp', 'makaron-worker-logs'), /\.log$/);
  const logs = logFiles
    .map(file => parseWorkerLog(file, errors))
    .filter(log => inDay(log.launch?.launchedAt || log.summary?.createdAt || log.summary?.updatedAt || fileTimeMs(log.file), bounds));
  for (const x of logs) sources.push(rel(x.file));

  const feedbackFile = path.join(DEFAULT_FEEDBACK_DIR, `${args.date}.jsonl`);
  const feedbackRecords = [
    ...(fs.existsSync(feedbackFile) ? readJsonl(feedbackFile, errors).map(({ value, line }) => normalizeFeedbackRecord(value, { type: 'feedback_jsonl', path: rel(feedbackFile), line })) : []),
    ...typedFeedbackRecordsForDate(args.date, errors),
  ].filter(r => !args.chat || r.chatId === args.chat);
  if (fs.existsSync(feedbackFile)) sources.push(rel(feedbackFile));
  for (const r of feedbackRecords) {
    if (r.source?.path) sources.push(r.source.path);
  }

  const byCard = new Map();
  const byChat = new Map();

  function ensureTask(id) {
    if (!byCard.has(id)) byCard.set(id, { taskId: id, jobPaths: [], logPaths: [], jobs: [], workerSummaries: [], runIds: [], sentAssets: [], evidence: [] });
    return byCard.get(id);
  }

  for (const reg of registryEntries) {
    const cardId = reg.messageId || '';
    const id = cardId ? `card:${cardId}` : `chat:${reg.chatId}`;
    const t = ensureTask(id);
    t.registry = reg;
    t.chatId = String(reg.chatId || '').replace(/^chat:/, '');
    t.cardId = cardId;
    t.title = reg.title || '';
    t.brief = short(reg.brief, 500);
    t.phase = reg.phase || '';
    t.statusRaw = reg.status || '';
    t.createdAt = reg.createdAt || t.createdAt;
    t.updatedAt = reg.updatedAt || t.updatedAt;
    t.projectUrl = reg.projectUrl || t.projectUrl || '';
    t.logs = reg.logs || [];
    t.outputs = reg.outputs || [];
    t.feedback = {
      accepted: Boolean(reg.accepted),
      acceptedAt: reg.acceptedAt || null,
      lastCardAction: reg.lastCardAction || null,
      lastCardActionAt: reg.lastCardActionAt || null,
      writtenFeedback: [],
      events: [],
      counts: {},
    };
    t.reviewSidecar = { enabled: false, gateContinues: 0, decisions: parseReviewDecisions(reg.outputs || []) };
    const lifecycleHousekeeping = isLifecycleHousekeepingUpdate(reg, bounds);
    t.dateSignals = {
      ...(t.dateSignals || {}),
      registryInDay: !lifecycleHousekeeping && (inDay(reg.createdAt, bounds) || inDay(reg.updatedAt, bounds)),
      lifecycleHousekeepingInDay: lifecycleHousekeeping,
    };
    t.evidence.push({ type: 'registry', path: rel(DEFAULT_REGISTRY), key: t.chatId });
    if (t.chatId) byChat.set(t.chatId, id);
  }

  for (const { file, job } of jobs) {
    if (args.chat && extractChatIdFromJob(job) !== args.chat) continue;
    const cardId = extractCardIdFromJob(job);
    const chatId = extractChatIdFromJob(job);
    const id = cardId ? `card:${cardId}` : (byChat.get(chatId) || `job:${rel(file)}`);
    const t = ensureTask(id);
    t.cardId ||= cardId;
    t.chatId ||= chatId;
    t.createdAt ||= job.createdAt;
    t.updatedAt ||= job.createdAt;
    t.brief ||= short(job.prompt, 500);
    t.title ||= job.initialState?.title || '';
    t.projectId ||= job.projectId || '';
    t.jobPaths.push(rel(file));
    t.jobs.push(job);
    t.dateSignals = { ...(t.dateSignals || {}), jobInDay: true };
    t.evidence.push({ type: 'job', path: rel(file) });
    if (chatId) byChat.set(chatId, id);
  }

  for (const log of logs) {
    const summary = log.summary || {};
    const jobPath = summary.jobPath ? path.resolve(summary.jobPath) : '';
    const matchingJob = jobs.find(j => path.resolve(j.file) === jobPath);
    if (args.chat && matchingJob && extractChatIdFromJob(matchingJob.job) !== args.chat) continue;
    const cardId = extractCardIdFromLog(log) || (matchingJob ? extractCardIdFromJob(matchingJob.job) : '');
    const chatId = matchingJob ? extractChatIdFromJob(matchingJob.job) : '';
    const id = cardId ? `card:${cardId}` : (chatId ? (byChat.get(chatId) || `chat:${chatId}`) : `log:${rel(log.file)}`);
    const t = ensureTask(id);
    t.cardId ||= cardId;
    t.chatId ||= chatId;
    t.projectId ||= summary.projectId || '';
    t.projectUrl ||= summary.projectUrl || '';
    t.runIds = uniq([...(t.runIds || []), ...(summary.runIds || []), summary.runId]);
    // P0 correctness: sentAssets must come from real artifact/delivery evidence
    // (URL/local file/send record), never from natural-language card text.
    t.sentAssets = uniq([...(t.sentAssets || []), ...deliveredAssetTypes(summary)]);
    t.logPaths.push(rel(log.file));
    t.workerSummaries.push(summary);
    if (!t.reviewSidecar) t.reviewSidecar = { enabled: false, gateContinues: 0, decisions: [] };
    t.reviewSidecar.enabled = Boolean(t.reviewSidecar.enabled || summary.reviewSidecar);
    t.reviewSidecar.gateContinues += Number(summary.gateContinues || 0);
    t.dateSignals = { ...(t.dateSignals || {}), workerLogInDay: true };
    t.evidence.push({ type: 'worker_log', path: rel(log.file) });
  }

  for (const fb of feedbackRecords) {
    const id = fb.cardId ? `card:${fb.cardId}` : (byChat.get(fb.chatId) || (fb.chatId ? `chat:${fb.chatId}` : `feedback:${fb.source?.path || 'unknown'}:${fb.source?.line || fb.atMs || ''}`));
    const t = ensureTask(id);
    t.cardId ||= fb.cardId;
    t.chatId ||= fb.chatId;
    t.title ||= fb.title;
    t.brief ||= fb.brief;
    t.statusRaw ||= fb.statusRaw;
    t.projectUrl ||= fb.projectUrl;
    t.outputs = uniq([...(t.outputs || []), ...(fb.outputs || [])]);
    t.feedbackRecords ||= [];
    t.feedbackRecords.push(fb);
    const isAccept = fb.type === 'positive_acceptance';
    const isRevision = fb.type === 'revision_request' || fb.type === 'revision_reroll_launched';
    const isWritten = fb.type === 'written_feedback';
    t.feedback = mergeFeedback(t.feedback, {
      accepted: isAccept,
      acceptedAt: isAccept ? (fb.atMs || fb.at || true) : null,
      lastCardAction: isAccept ? 'positive_acceptance' : (isRevision ? 'revision_request' : (isWritten ? 'written_feedback' : fb.type)),
      lastCardActionAt: fb.atMs || null,
      writtenFeedback: isWritten && fb.writtenText ? [fb.writtenText] : [],
      events: [{
        type: fb.type,
        action: fb.action,
        at: fb.at,
        atText: fb.atText,
        source: fb.source,
        text: fb.writtenText || fb.learning || '',
      }],
      counts: { [fb.type]: 1 },
    });
    if (fb.reroll?.jobPath) t.jobPaths.push(rel(fb.reroll.jobPath));
    t.dateSignals = { ...(t.dateSignals || {}), feedbackInDay: true };
    t.evidence.push({ type: 'feedback', path: fb.source?.path || '', line: fb.source?.line || null });
    if (fb.chatId) byChat.set(fb.chatId, id);
  }

  // Do not lose completed/pruned cards: daily sidecar activity is valid
  // execution evidence even when the card no longer exists in the current
  // registry snapshot, jobs directory, or worker-log directory.
  if (!args.chat) {
    for (const cardId of sidecarCardsWithActivityInDay(bounds, errors)) {
      const t = ensureTask(`card:${cardId}`);
      t.cardId ||= cardId;
      t.title ||= `Sidecar-only card ${cardId}`;
      t.dateSignals = { ...(t.dateSignals || {}), sidecarInDay: true };
      t.evidence.push({ type: 'review_sidecar_index', path: rel(path.join(DEFAULT_SIDECAR_DIR, cardId)) });
    }
  }

  const tasks = [...byCard.values()].map(t => {
    const reg = t.registry || {};
    const summaries = t.workerSummaries || [];
    const expected = inferExpected(t.jobs?.[0], reg, summaries[0]);
    const reviewSidecar = t.reviewSidecar || { enabled: false, gateContinues: 0, decisions: [] };
    const feedback = t.feedback || { accepted: false, lastCardAction: null, writtenFeedback: [], events: [], counts: {} };
    const lock = readLockInfo(t.cardId, errors);
    const sidecar = readSidecarEvidence(t.cardId, bounds, errors);
    if (sidecar?.paths?.length) {
      for (const p of sidecar.paths) t.evidence.push({ type: 'review_sidecar', path: p });
      t.sentAssets = uniq([...(t.sentAssets || []), ...(sidecar.deliveredAssets || [])]);
      reviewSidecar.enabled = true;
      reviewSidecar.decisions = uniq([...(reviewSidecar.decisions || []), ...(sidecar.decisions || [])]);
      if (sidecar.inDay) t.dateSignals = { ...(t.dateSignals || {}), workerLogInDay: true };
    }
    if (lock) t.evidence.push({ type: 'worker_lock', path: lock.path });
    const deliveredEvidence = Boolean((t.sentAssets || []).length || summaries.some(s => s?.status === 'delivered'));
    const staleWorkerLock = Boolean(lock && !lock.alive && !reg.done && !reg.failed);
    const sidecarDecisionFailure = Boolean(sidecar?.decisionErrors?.length || sidecar?.spawnErrors?.length || (staleWorkerLock && sidecarHasUnresolvedDecision(sidecar)));
    const orphanInProgress = Boolean(reg && reg.done !== true && reg.failed !== true && !(t.jobPaths || []).length && !(t.logPaths || []).length && /接续任务中|in_progress|进行中|审核中/i.test(String(reg.status || reg.phase || '')));
    const reconciliation = {
      deliveredEvidence,
      staleWorkerLock,
      sidecarDecisionFailure,
      unresolvedSidecarDecision: sidecarHasUnresolvedDecision(sidecar),
      orphanInProgress,
      warnings: uniq([
        deliveredEvidence && /in_progress|已发送|发送/.test(String(reg.status || '').toLowerCase()) && !reg.done ? 'delivered_evidence_mismatch' : '',
        staleWorkerLock ? 'stale_worker_lock' : '',
        sidecarDecisionFailure ? 'sidecar_decision_failure' : '',
        sidecarHasUnresolvedDecision(sidecar) ? 'unresolved_sidecar_decision' : '',
        orphanInProgress ? 'orphan_in_progress' : '',
      ]),
      lock,
      sidecar: sidecar ? {
        paths: sidecar.paths,
        deliveredAssets: sidecar.deliveredAssets,
        decisionRequests: sidecar.decisionRequests,
        decisionErrors: sidecar.decisionErrors,
        decisions: sidecar.decisions,
        done: sidecar.done,
        spawnErrors: sidecar.spawnErrors,
      } : null,
    };
    let status = normalizeStatus(reg, summaries, reconciliation);
    if (!t.registry && feedback.lastCardAction) {
      if (feedback.accepted || feedback.lastCardAction === 'positive_acceptance') status = 'accepted';
      else if (feedback.lastCardAction === 'revision_request' || feedback.lastCardAction === 'written_feedback') status = 'revision';
    }
    reviewSidecar.enabled = Boolean(reviewSidecar.enabled || (reg.outputs || []).some(o => /Review sidecar|sidecar|审核/.test(String(o))));
    return {
      date: args.date,
      taskId: t.taskId,
      chatId: t.chatId || '',
      cardId: t.cardId || '',
      title: t.title || reg.title || '',
      brief: short(t.brief || reg.brief, 500),
      status,
      statusRaw: reg.status || summaries.map(s => s.status).filter(Boolean).join(','),
      phase: t.phase || reg.phase || '',
      createdAt: t.createdAt || reg.createdAt || null,
      createdAtText: fmtMs(t.createdAt || reg.createdAt),
      updatedAt: t.updatedAt || reg.updatedAt || null,
      updatedAtText: fmtMs(t.updatedAt || reg.updatedAt),
      projectId: t.projectId || '',
      projectUrl: t.projectUrl || reg.projectUrl || '',
      jobPaths: uniq(t.jobPaths),
      logPaths: uniq(t.logPaths),
      runIds: uniq(t.runIds),
      expected,
      sentAssets: uniq(t.sentAssets || []),
      reviewSidecar,
      reconciliation,
      feedback,
      feedbackRecords: t.feedbackRecords || [],
      risks: riskTags({ ...t, ...reg, outputs: reg.outputs || t.outputs || [], logs: reg.logs || t.logs || [] }),
      dateSignals: {
        registryInDay: Boolean(t.dateSignals?.registryInDay),
        jobInDay: Boolean(t.dateSignals?.jobInDay),
        workerLogInDay: Boolean(t.dateSignals?.workerLogInDay),
        sidecarInDay: Boolean(t.dateSignals?.sidecarInDay || sidecar?.inDay),
        feedbackInDay: Boolean(t.dateSignals?.feedbackInDay),
        lifecycleHousekeepingInDay: Boolean(t.dateSignals?.lifecycleHousekeepingInDay),
      },
      evidence: t.evidence || [],
    };
  }).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

  const dailyTasks = tasks.filter(t => t.dateSignals.registryInDay || t.dateSignals.jobInDay || t.dateSignals.workerLogInDay || t.dateSignals.sidecarInDay || t.dateSignals.feedbackInDay);
  const countStatus = (items, status) => items.filter(t => t.status === status).length;
  const statusCounts = (items) => ({
    accepted: countStatus(items, 'accepted'),
    revision: countStatus(items, 'revision'),
    delivered: countStatus(items, 'delivered'),
    autoCompleted: countStatus(items, 'auto_completed'),
    blocked: countStatus(items, 'blocked'),
    failed: countStatus(items, 'failed'),
    stale: countStatus(items, 'stale'),
    inProgress: countStatus(items, 'in_progress'),
  });
  const currentStatusSnapshot = statusCounts(tasks);
  const dailyExecutionStatus = statusCounts(dailyTasks);
  const summary = {
    totalTasks: tasks.length,
    dailyEvidenceTasks: dailyTasks.length,
    dailyWorkerCards: tasks.filter(t => t.dateSignals.jobInDay || t.dateSignals.workerLogInDay || t.dateSignals.sidecarInDay).length,
    dailyWorkerJobs: jobs.length,
    dailyWorkerLogs: logs.length,
    dailyFeedbackRecords: feedbackRecords.length,
    dailyFeedbackCards: tasks.filter(t => t.dateSignals.feedbackInDay).length,
    dailyWrittenFeedback: feedbackRecords.filter(r => r.type === 'written_feedback').length,
    dailyPositiveAcceptances: feedbackRecords.filter(r => r.type === 'positive_acceptance').length,
    dailyRevisionRequests: feedbackRecords.filter(r => r.type === 'revision_request').length,
    currentStatusSnapshot,
    dailyExecutionStatus,
    // Backward-compatible fields. These are current snapshot counts, not daily incidents.
    accepted: currentStatusSnapshot.accepted,
    revision: currentStatusSnapshot.revision,
    failed: currentStatusSnapshot.failed,
    blocked: currentStatusSnapshot.blocked,
    delivered: currentStatusSnapshot.delivered,
    autoCompleted: currentStatusSnapshot.autoCompleted,
    stale: currentStatusSnapshot.stale,
    inProgress: currentStatusSnapshot.inProgress,
    reviewSidecarEnabled: tasks.filter(t => t.reviewSidecar?.enabled).length,
    reconciliation: {
      deliveredEvidenceMismatch: tasks.filter(t => t.reconciliation?.warnings?.includes('delivered_evidence_mismatch')).length,
      staleWorkerLock: tasks.filter(t => t.reconciliation?.warnings?.includes('stale_worker_lock')).length,
      sidecarDecisionFailure: tasks.filter(t => t.reconciliation?.warnings?.includes('sidecar_decision_failure')).length,
      unresolvedSidecarDecision: tasks.filter(t => t.reconciliation?.warnings?.includes('unresolved_sidecar_decision')).length,
      orphanInProgress: tasks.filter(t => t.reconciliation?.warnings?.includes('orphan_in_progress')).length,
    },
    withWorkerLogs: tasks.filter(t => t.logPaths.length).length,
    withJobs: tasks.filter(t => t.jobPaths.length).length,
  };

  const result = {
    date: args.date,
    timezone: TZ,
    officialScope: OFFICIAL_SCOPE,
    baseline: readMakaronBaseline(),
    generatedAt: new Date().toISOString(),
    generatedAtText: fmtMs(Date.now()),
    root: ROOT,
    sources: uniq(sources),
    errors,
    summary,
    feedbackRecords,
    tasks,
  };
  if (args.strict && errors.length) throw new Error(`Strict mode failed with ${errors.length} errors`);
  return result;
}

function markdown(result) {
  const s = result.summary;
  const lines = [];
  lines.push(`# Makaron Daily Evidence — ${result.date}`);
  lines.push('');
  lines.push(`Generated: ${result.generatedAtText}`);
  lines.push(`Baseline: ${result.baseline || readMakaronBaseline()}`);
  lines.push(`Scope: ${(result.officialScope || OFFICIAL_SCOPE).join(' + ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Current registry/task records: ${s.totalTasks}`);
  lines.push(`- Daily evidence tasks: ${s.dailyEvidenceTasks}; worker cards ${s.dailyWorkerCards}; worker jobs ${s.dailyWorkerJobs}; worker logs ${s.dailyWorkerLogs}`);
  lines.push(`- Feedback: records ${s.dailyFeedbackRecords || 0}; cards ${s.dailyFeedbackCards || 0}; accept ${s.dailyPositiveAcceptances || 0}; revision ${s.dailyRevisionRequests || 0}; written ${s.dailyWrittenFeedback || 0}`);
  const d = s.dailyExecutionStatus || {};
  const c = s.currentStatusSnapshot || s;
  lines.push(`- Today execution status: accepted ${d.accepted || 0}, revision ${d.revision || 0}, delivered ${d.delivered || 0}, auto-completed ${d.autoCompleted || 0}, blocked ${d.blocked || 0}, failed ${d.failed || 0}, stale ${d.stale || 0}, in progress ${d.inProgress || 0}`);
  lines.push(`- Historical/current snapshot status: accepted ${c.accepted || 0}, revision ${c.revision || 0}, delivered ${c.delivered || 0}, auto-completed ${c.autoCompleted || 0}, blocked ${c.blocked || 0}, failed ${c.failed || 0}, stale ${c.stale || 0}, in progress ${c.inProgress || 0}`);
  lines.push(`- Evidence coverage: task records with jobs ${s.withJobs}, worker logs ${s.withWorkerLogs}, review-sidecar ${s.reviewSidecarEnabled}`);
  const r = s.reconciliation || {};
  if ((r.deliveredEvidenceMismatch || 0) + (r.staleWorkerLock || 0) + (r.sidecarDecisionFailure || 0) + (r.unresolvedSidecarDecision || 0) + (r.orphanInProgress || 0) > 0) {
    lines.push(`- Reconciliation warnings: delivered/evidence mismatch ${r.deliveredEvidenceMismatch || 0}, stale lock ${r.staleWorkerLock || 0}, sidecar failure ${r.sidecarDecisionFailure || 0}, unresolved sidecar ${r.unresolvedSidecarDecision || 0}, orphan in-progress ${r.orphanInProgress || 0}`);
  }
  if (result.errors.length) lines.push(`- Parse warnings: ${result.errors.length}`);
  lines.push('');
  lines.push('## Tasks');
  lines.push('');
  for (const t of result.tasks) {
    lines.push(`### ${t.title || t.cardId || t.taskId}`);
    lines.push('');
    lines.push(`- Status: ${t.status}${t.statusRaw ? ` (${t.statusRaw})` : ''}`);
    if (t.createdAtText) lines.push(`- Created: ${t.createdAtText}`);
    if (t.chatId) lines.push(`- Chat: ${t.chatId}`);
    if (t.cardId) lines.push(`- Card: ${t.cardId}`);
    lines.push(`- Date signals: registry=${t.dateSignals.registryInDay ? 'today' : (t.dateSignals.lifecycleHousekeepingInDay ? 'snapshot+lifecycle' : 'snapshot')}, job=${t.dateSignals.jobInDay ? 'today' : 'none'}, workerLog=${t.dateSignals.workerLogInDay ? 'today' : 'none'}, sidecar=${t.dateSignals.sidecarInDay ? 'today' : 'none'}, feedback=${t.dateSignals.feedbackInDay ? 'today' : 'none'}`);
    if (t.projectUrl) lines.push(`- Project: ${t.projectUrl}`);
    if (t.brief) lines.push(`- Brief: ${t.brief}`);
    if (t.expected !== 'unknown' || t.sentAssets.length) lines.push(`- Assets: expected ${t.expected}; sent ${t.sentAssets.join(', ') || 'none'}`);
    if (t.reviewSidecar?.enabled) {
      lines.push(`- Review sidecar: enabled; gate continues ${t.reviewSidecar.gateContinues || 0}`);
      for (const d of t.reviewSidecar.decisions || []) lines.push(`  - ${d.decision}: ${d.reason}`);
    }
    if (t.feedback?.lastCardAction || t.feedback?.accepted || t.feedback?.events?.length) {
      lines.push(`- Feedback: accepted=${Boolean(t.feedback.accepted)}; lastAction=${t.feedback.lastCardAction || 'none'}; events=${t.feedback.events?.length || 0}`);
      for (const text of (t.feedback.writtenFeedback || []).slice(-3)) lines.push(`  - Written: ${short(text, 220)}`);
    }
    if (t.risks.length) lines.push(`- Risk tags: ${t.risks.join(', ')}`);
    if (t.reconciliation?.warnings?.length) {
      lines.push(`- Reconciliation: ${t.reconciliation.warnings.join(', ')}`);
      for (const e of (t.reconciliation.sidecar?.decisionErrors || []).slice(-3)) lines.push(`  - Sidecar error: ${short(e.error, 260)}`);
    }
    if (t.jobPaths.length) lines.push(`- Jobs: ${t.jobPaths.join(', ')}`);
    if (t.logPaths.length) lines.push(`- Logs: ${t.logPaths.join(', ')}`);
    lines.push('');
  }
  if (result.errors.length) {
    lines.push('## Warnings');
    for (const e of result.errors) lines.push(`- ${e.type}: ${e.path || ''} ${e.error || ''}`.trim());
    lines.push('');
  }
  return lines.join('\n');
}

function writeOutputs(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outDir, 'evidence.jsonl'), result.tasks.map(t => JSON.stringify(t)).join('\n') + (result.tasks.length ? '\n' : ''));
  fs.writeFileSync(path.join(outDir, 'summary.md'), markdown(result));
}

function main() {
  const args = parseArgs(process.argv);
  const result = buildCollector(args);
  writeOutputs(result, path.resolve(args.out));
  if (args.json) console.log(JSON.stringify({ ok: true, out: path.resolve(args.out), summary: result.summary, errors: result.errors }, null, 2));
  else console.log(`ok: wrote ${path.resolve(args.out)} (${result.summary.totalTasks} tasks, ${result.errors.length} warnings)`);
}

if (require.main === module) {
  try { main(); }
  catch (err) { console.error(`collect-daily-evidence failed: ${err.message}`); process.exit(1); }
}

module.exports = { buildCollector, dayBoundsMs, parseReviewDecisions, normalizeStatus };
