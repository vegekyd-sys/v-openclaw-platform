#!/usr/bin/env node
'use strict';

/**
 * Makaron v1.5 sidecar supervisor.
 *
 * Event bus contract:
 * - telemetry events: append to sidecar.log.jsonl only; never invoke agent.
 * - decision events: needsDecision=true; build a recent-history prompt and require JSON.
 * - accepted decisions: confirm / retry / revise / stop / close / request_human.
 * - artifact-finality events reuse the same decisions:
 *   close = artifact satisfies the original user intent and card may complete;
 *   confirm/retry/revise = continue same project/card with the returned prompt;
 *   request_human = human judgment is required before continuing.
 */

const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const ROOT = require('../workspace-root.cjs');
const ALLOWED = new Set(['confirm', 'retry', 'revise', 'stop', 'close', 'request_human']);

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'review-sidecar'; }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function appendJsonl(file, obj) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.appendFileSync(file, JSON.stringify(obj) + '\n'); }
function trim(s, n = 4000) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

class SidecarDoneError extends Error {
  constructor(done = null) {
    super(`sidecar worker already stopped: ${done?.reason || 'done'}`);
    this.name = 'SidecarDoneError';
    this.code = 'SIDECAR_DONE';
    this.done = done;
  }
}

function readOwnerCompletion(owner = {}) {
  const ownerPid = Number(owner.ownerPid || 0);
  if (!Number.isInteger(ownerPid) || ownerPid <= 1) return null;
  try {
    process.kill(ownerPid, 0);
  } catch (e) {
    if (e?.code === 'ESRCH') {
      return {reason:'owner_exited', source:'worker_pid', ownerPid, at:new Date().toISOString()};
    }
    return null;
  }

  const jobPath = String(owner.jobPath || '').trim();
  if (!jobPath) return null;
  try {
    const argv = fs.readFileSync(`/proc/${ownerPid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    if (argv.length && !argv.includes(jobPath)) {
      return {reason:'owner_pid_reused', source:'worker_pid', ownerPid, jobPath, at:new Date().toISOString()};
    }
  } catch {}
  return null;
}

function readSidecarCompletion(doneFile, owner = {}) {
  const done = readJson(doneFile, null);
  if (done) return done;
  return readOwnerCompletion(owner);
}

function recordCompletion(doneFile, done) {
  if (done && !readJson(doneFile, null)) writeJson(doneFile, done);
}

function assertSidecarActive(doneFile, owner) {
  const done = readSidecarCompletion(doneFile, owner);
  if (done) throw new SidecarDoneError(done);
}

function signalProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (e) {
    if (e?.code !== 'ESRCH') {
      try { child.kill(signal); } catch {}
    }
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const {
      stopFile = '',
      stopWhen = null,
      stopPollMs = 250,
      stopGraceMs = 2000,
      timeout = 600 * 1000,
      ...spawnOpts
    } = opts;
    const p = spawn(cmd, args, {
      cwd: ROOT,
      env: {...process.env},
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(timeout) || 600 * 1000,
      ...spawnOpts,
      detached: stopFile ? true : Boolean(spawnOpts.detached),
    });
    let stdout = '', stderr = '';
    let settled = false;
    let stopped = false;
    let stopTimer = null;
    let killTimer = null;
    const cleanup = () => {
      if (stopTimer) clearInterval(stopTimer);
      if (killTimer) clearTimeout(killTimer);
    };
    const stopForDone = () => {
      if (settled || stopped) return;
      stopped = true;
      signalProcessGroup(p, 'SIGTERM');
      killTimer = setTimeout(() => signalProcessGroup(p, 'SIGKILL'), stopGraceMs);
      killTimer.unref?.();
    };
    if (stopFile) {
      stopTimer = setInterval(() => {
        if (fs.existsSync(stopFile) || stopWhen?.()) stopForDone();
      }, Math.max(50, Number(stopPollMs) || 250));
      stopTimer.unref?.();
    }
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', e => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(e);
      }
    });
    p.on('close', (code, signal) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({code, signal, stdout, stderr, stopped});
      }
    });
  });
}

function parseJsonCandidate(value) {
  let s = String(value || '').trim().replace(/^\uFEFF/, '').trim();
  if (!s) return null;
  // Some models return a fenced JSON body; others return the fence payload after
  // the transport layer has stripped backticks but left a leading `json` line.
  // Strip all leading/trailing fence markers (may appear multiple times).
  s = s.replace(/^```\s*[a-z0-9_-]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  s = s.replace(/^json\s*\n/i, '').replace(/\n?json\s*$/i, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const inner = s.slice(start, end + 1);
    try { return JSON.parse(inner); } catch {}
    // Still wrapped? Try stripping fences around the inner JSON
    const cleaned = inner.replace(/^```\s*[a-z0-9_-]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    // Model sometimes outputs unescaped quotes inside JSON string values.
    // Fallback: extract core decision fields via regex from broken JSON.
    const fb = extractDecisionFromBrokenJson(inner);
    if (fb) return fb;
  }
  return null;
}

/* Extract core decision fields from broken JSON (model may output unescaped quotes). */
function extractDecisionFromBrokenJson(text) {
  const dec = /"decision"\s*:\s*"(confirm|retry|revise|stop|close|request_human)"/i.exec(text);
  if (!dec) return null;
  const passed = /"passed"\s*:\s*(true|false)/i.exec(text);
  const conf = /"confidence"\s*:\s*([0-9.]+)/i.exec(text);
  const actionM = /"action"\s*:\s*"([^"]*)"/i.exec(text);
  // Preserve actionable text even when a model forgets to escape quotation
  // marks inside a JSON string. Field boundaries are stable because this is a
  // fixed sidecar schema; losing the recovered prompt causes the worker to
  // retry the same failed command instead of applying the sidecar revision.
  const field = (name, next) => {
    const re = new RegExp(`"${name}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${next}"\\s*:`, 'i');
    const match = re.exec(text);
    return match ? match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() : '';
  };
  const reason = field('reason', 'prompt') || '(recovered from broken JSON)';
  const prompt = field('prompt', 'humanMessage');
  const humanMessage = field('humanMessage', 'action');
  return {
    decision: dec[1],
    passed: passed ? passed[1] === 'true' : false,
    reason,
    prompt,
    humanMessage,
    action: actionM ? actionM[1] || '' : '',
    confidence: conf ? parseFloat(conf[1]) : 0.5,
    _recovered: true,
  };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const direct = parseJsonCandidate(raw);
  if (direct) return direct;
  const fences = [...raw.matchAll(/```\s*[a-z0-9_-]*\s*\n?([\s\S]*?)```/gi)];
  for (const m of fences) {
    const parsed = parseJsonCandidate(m[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parseOpenClawAgentReply(stdout) {
  // Preferred: try known agent output paths
  try {
    const obj=JSON.parse(stdout);
    // OpenClaw agent --json format: result.payloads[0].text or result.finalAssistantRawText
    const payloadText = obj.result?.payloads?.find?.(p => typeof p?.text === 'string' && p.text.trim())?.text;
    if (payloadText) return payloadText;
    if (typeof obj.result?.finalAssistantRawText === 'string') return obj.result.finalAssistantRawText;
    if (typeof obj.result?.finalAssistantVisibleText === 'string') return obj.result.finalAssistantVisibleText;
    return obj.reply || obj.message || obj.output || obj.text || stdout;
  }catch{}
  return stdout;
}

function compactEvent(e = {}) {
  const compact = {
    runId: e.runId,
    projectId: e.projectId,
    summary: e.summary,
    text: e.text ? trim(e.text, 600) : undefined,
    asset: e.asset,
    media: Array.isArray(e.media) ? e.media.slice(0, 8) : e.media,
    failedMedia: Array.isArray(e.failedMedia) ? e.failedMedia.slice(0, 8) : e.failedMedia,
    error: e.error,
    code: e.code,
    signal: e.signal,
  };
  return JSON.stringify(compact, (k, v) => v == null || v === '' || (Array.isArray(v) && !v.length) ? undefined : v);
}

function summarizeHistory(request, n = 15) {
  const history = Array.isArray(request.history) ? request.history : [];
  return history.slice(-n).map(e => {
    const at = e.at ? String(e.at).replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '';
    const type = e.eventType || e.type || e.event || 'event';
    const details = compactEvent(e);
    return `- ${at} ${type}${details && details !== '{}' ? ` | ${trim(details, 500)}` : ''}`;
  }).join('\n');
}

function buildReviewPrompt({request, job, taskMode}) {
  const expected = (request.expectedAssets || job.expectedAssets || []).join(', ') || 'media';
  const eventType = request.eventType || 'gate_review';
  const last = trim(request.makaronSay || request.text || '', 2000);
  const historySummary = summarizeHistory(request);
  const failedSummary = trim(request.failedMediaSummary || '', 2500);
  const failedDetails = trim(JSON.stringify(request.failedMedia || [], null, 2), 9000);
  const artifactDetails = trim(JSON.stringify(request.artifactSummary || null, null, 2), 9000);
  const projectMediaDetails = trim(JSON.stringify(request.projectMedia || null, null, 2), 9000);
  const errorSummary = trim(request.summary || request.error?.message || request.error || '', 2500);

  return `你是 V，the owner 的 AI 伙伴，负责在 Makaron 任务中做判断。Worker 负责快速建卡、执行 CLI、收集事实、第一时间发送图片/视频/文件等非文本产物；你基于完整事件历史做 agent 级决策。

必须遵守：
- 只输出 JSON，不要 markdown，不要额外解释。
- 允许 decision：confirm / retry / revise / stop / close / request_human。
- confirm：文本/方案 gate 通过，prompt 要求 Makaron 继续同一项目生成最终 ${expected}。
- retry：不改策略，重试当前目标，适合临时生成失败/超时。
- revise：需要改 prompt/创意/技术路线后继续，prompt 必须具体可执行。
- stop：自动继续不安全/不可行/没有意义，卡片应停止。
- close：已有可用产物或不需要继续。
- request_human：确实需要 the owner/用户补信息、授权、选择或确认。特别注意：如果 Makaron 返回 copyrighted/trademarked/content policy 拒绝，应当 request_human，不要 retry。

账号/key 判断原则：
- 没有群 key：通常选择 action="self_register_same_card"，走群自注册，不用 the owner 个人 key。
- 群 key 存在但余额/积分不足：通常 request_human，要求 top up 或绑定/claim 账号，不要删除 key。
- 群 key 存在但明确 Invalid API key/Unauthorized：你必须判断是 self-register 修复、要求管理员更新 key、还是在 the owner 明确授权时使用 the owner override；不要让 worker 写死。
- 只有当上下文明确 the owner 授权「用我的 key / 用 the owner key / override」时，才允许 action="use_tianyi_override"；否则需要 request_human 取得授权。

artifact/finality 判断原则：
- 不要因为出现 video URL 就默认 close。视频可能是最终片，也可能是 patch / preview / 中间片段 / 下一步合成输入。
- 如果 Makaron 输出或 artifact metadata 里有 completion_actions，尤其是“拼回完整视频 / stitch / replace segment / continue”等动作，优先判断该动作是否是满足原始用户目标所必需。
- 如果用户目标是完整成片，而当前视频只是 patch/segment/preview，应 decision=confirm 或 revise，并在 prompt 里要求继续同一项目执行下一步；不要 close。
- Worker 已经负责第一时间发送中间视频/图片。你的任务是判断任务是否完成，而不是判断是否要发送附件。
- close 只表示原始用户意图已满足、卡片可以最终完成。

任务背景：
- Feishu chatId: ${job.chatId || ''}
- cardId: ${job.cardId || ''}
- projectId: ${request.projectId || job.projectId || ''}
- expected assets: ${expected}
- event type: ${eventType}
- gate/recovery index: ${request.gateIndex || 0}
- sidecar mode: ${taskMode || 'required'}

原始 brief：
${trim(job.prompt || '', 800)}

最近事件历史（worker 上报的 CLI / stream / project media / delivery / error）：
${historySummary || '无历史事件'}

Makaron 当前文本输出：
${last || '无'}

当前判断点摘要：
${errorSummary || '无'}

失败产物摘要：
${failedSummary || '无'}

失败产物/API 详情（来自 Makaron project media/timeline，优先用于判断，不要只依据卡片截断文本）：
${failedDetails && failedDetails !== '[]' ? failedDetails : '无'}

当前 artifact / 已发送产物证据（用于判断是否 final，注意：已发送不等于已完成）：
${artifactDetails && artifactDetails !== 'null' ? artifactDetails : '无'}

当前项目媒体快照（用于判断 patch/segment/final、media refs、duration、completion_actions 等）：
${projectMediaDetails && projectMediaDetails !== 'null' ? projectMediaDetails : '无'}

请输出 JSON：
{
  "decision": "confirm" | "retry" | "revise" | "stop" | "close" | "request_human",
  "passed": true | false,
  "reason": "简洁但具体说明为什么这样判断，面向 worker/card 的语义，不要暴露内部噪音",
  "prompt": "给 Makaron 的下一轮 prompt；stop/close/request_human 可为空，confirm/retry/revise 通常必须有",
  "humanMessage": "如果 request_human，写给 the owner/用户看的补充问题；否则可为空",
  "action": "可选；账号/key事件可填 self_register_same_card | ask_topup | ask_update_key | use_tianyi_override | retry_existing_key",
  "confidence": 0.0-1.0
}`;
}

function normalizeDecision(raw, request) {
  const decision = String(raw?.decision || '').toLowerCase();
  const d = ALLOWED.has(decision) ? decision : 'stop';
  return {
    version: 'makaron-sidecar-supervisor-v1.5-staged',
    id: request.id,
    at: new Date().toISOString(),
    decision: d,
    passed: Boolean(raw?.passed),
    reason: String(raw?.reason || ''),
    prompt: String(raw?.prompt || ''),
    humanMessage: String(raw?.humanMessage || raw?.human_message || ''),
    action: String(raw?.action || raw?.accountAction || raw?.account_action || ''),
    confidence: Number(raw?.confidence ?? 0),
    raw,
  };
}

async function askReviewAgent({request, job, sidecarDir, owner, retryAttempt = 0}) {
  const doneFile = path.join(sidecarDir, 'done.json');
  assertSidecarActive(doneFile, owner);
  const sessionKey = request.sessionKey || job.reviewSidecar?.sessionKey || `agent:@@AGENT_ID@@:sidecar-supervisor-v15-${safeName(job.cardId || job.chatId || 'task')}`;
  const model = request.model || job.reviewSidecar?.model || process.env.MAKARON_REVIEW_AGENT_MODEL || '';
  const timeoutSeconds = Math.max(180, Number(request.timeoutSeconds || job.reviewSidecar?.timeoutSeconds || 300));
  const timeout = String(timeoutSeconds);
  // On retry, use a minimal prompt that demands pure JSON only
  const isRetry = retryAttempt > 0;
  const prompt = isRetry
    ? buildMinimalRetryPrompt({request, job})
    : buildReviewPrompt({request, job, taskMode: job.reviewSidecar?.mode});
  const promptFile = path.join(sidecarDir, `prompt-${safeName(request.id)}${isRetry ? `-retry${retryAttempt}` : ''}.txt`);
  fs.writeFileSync(promptFile, prompt);
  if (process.env.MAKARON_SIDECAR_FAKE_DECISION_JSON) {
    return {...normalizeDecision(JSON.parse(process.env.MAKARON_SIDECAR_FAKE_DECISION_JSON), request), sessionKey, fake:true};
  }

  const args = ['agent', '--agent', job.reviewSidecar?.agentId || 'makaron', '--session-key', sessionKey, '--message', prompt, '--thinking', job.reviewSidecar?.thinking || 'off', '--timeout', timeout, '--json'];
  if (model) args.push('--model', model);
  let res;
  try{
    res = await run(process.env.MAKARON_REVIEW_AGENT_BIN || process.env.OPENCLAW_BIN || 'openclaw', args, {
      stopFile: doneFile,
      stopWhen: () => Boolean(readSidecarCompletion(doneFile, owner)),
    });
  }catch(e){
    if (e?.code === 'SIDECAR_DONE') throw e;
    assertSidecarActive(doneFile, owner);
    fs.writeFileSync(path.join(sidecarDir, `agent-${safeName(request.id)}${isRetry ? `-retry${retryAttempt}` : ''}.spawn-error.log`), String(e.stack||e));
    if (retryAttempt < 1) {
      assertSidecarActive(doneFile, owner);
      appendJsonl(path.join(sidecarDir, 'sidecar.log.jsonl'), {event:'retry_spawn', at:new Date().toISOString(), id:request.id, attempt:retryAttempt+1, error:String(e.message||e)});
      return askReviewAgent({request, job, sidecarDir, owner, retryAttempt: retryAttempt + 1});
    }
    throw new Error(`openclaw agent spawn failed after retry: ${e.message||e}`);
  }
  const completion = readSidecarCompletion(doneFile, owner);
  if (res.stopped || completion) throw new SidecarDoneError(completion);
  fs.writeFileSync(path.join(sidecarDir, `agent-${safeName(request.id)}${isRetry ? `-retry${retryAttempt}` : ''}.stdout.log`), res.stdout || '');
  fs.writeFileSync(path.join(sidecarDir, `agent-${safeName(request.id)}${isRetry ? `-retry${retryAttempt}` : ''}.stderr.log`), res.stderr || '');
  if (res.code !== 0) {
    if (retryAttempt < 1) {
      assertSidecarActive(doneFile, owner);
      appendJsonl(path.join(sidecarDir, 'sidecar.log.jsonl'), {event:'retry_agent_fail', at:new Date().toISOString(), id:request.id, attempt:retryAttempt+1, code:res.code});
      return askReviewAgent({request, job, sidecarDir, owner, retryAttempt: retryAttempt + 1});
    }
    throw new Error(`openclaw agent failed code=${res.code}: ${trim(res.stderr || res.stdout, 1200)}`);
  }

  const reply = parseOpenClawAgentReply(res.stdout);
  const decision = extractJsonObject(reply) || extractJsonObject(res.stdout);
  if (!decision || !decision.decision) {
    if (retryAttempt < 1) {
      assertSidecarActive(doneFile, owner);
      appendJsonl(path.join(sidecarDir, 'sidecar.log.jsonl'), {event:'retry_json', at:new Date().toISOString(), id:request.id, attempt:retryAttempt+1});
      return askReviewAgent({request, job, sidecarDir, owner, retryAttempt: retryAttempt + 1});
    }
    throw new Error(`review agent did not return decision JSON after retry: ${trim(reply || res.stdout, 600)}`);
  }
  return {...normalizeDecision(decision, request), sessionKey, retried: retryAttempt > 0};
}

/* Minimal retry prompt — demands pure JSON only, no context bloat. */
function buildMinimalRetryPrompt({request, job}) {
  const expected = (request.expectedAssets || job.expectedAssets || []).join(', ') || 'media';
  const last = trim(request.makaronSay || request.text || '', 800);
  const backtick = '\u0060\u0060\u0060';
  return '\u4f60\u662f Makaron \u4efb\u52a1\u51b3\u7b56\u5668\u3002\u524d\u4e00\u6b21\u8c03\u7528\u683c\u5f0f\u89e3\u6790\u5931\u8d25\uff0c\u8fd9\u6b21\u5fc5\u987b\u4e25\u683c\u8f93\u51fa\u7eaf JSON\uff0c\u4e0d\u8981 markdown\uff0c\u4e0d\u8981\u89e3\u91ca\u3002\n\n\u4efb\u52a1 context\uff1aexpected: ' + expected + ' | \u6700\u8fd1\u52a8\u5411: ' + last + '\n\n\u53ea\u9700\u8f93\u51fa\u8fd9\u4e2a JSON\uff08\u4e0d\u8981 ' + backtick + ' \u5305\u88f9\uff09\uff1a\n{"decision":"confirm|retry|revise|stop|close|request_human","passed":true|false,"reason":"\u4e00\u53e5\u8bdd","prompt":"\u7ee7\u7eed\u7684 prompt \u6216\u7a7a","humanMessage":"","action":"","confidence":0.5}';
}

/* Smart fallback decision when review agent fails completely.
   Uses artifact evidence to decide: confirm (has progress) vs stop (no progress) vs request_human (auth/account). */
function inferFallbackDecision(req, error) {
  const errMsg = String(error?.message || error || '').toLowerCase();
  const hasAccountIssue = /key|auth|credit|insufficient|balance|topup|register/i.test(errMsg);
  const hasArtifacts = Array.isArray(req.deliveredAssets) && req.deliveredAssets.length > 0;
  const isFinalityGate = req.eventType === 'artifact_finality' || (req.gateIndex && req.gateIndex >= 3);

  if (hasAccountIssue) {
    return {
      decision: 'request_human', passed: false,
      reason: `审核代理失败（${errMsg.slice(0,80)}），疑似账号/积分问题，保留用户决策权`,
      prompt: '', humanMessage: `审核代理遇到错误：${errMsg.slice(0,200)}，疑似账号或积分问题。请检查 Makaron 账号状态。`,
      action: 'ask_topup', confidence: 0.4,
    };
  }
  if (hasArtifacts) {
    return {
      decision: isFinalityGate ? 'close' : 'confirm', passed: !isFinalityGate,
      reason: `审核代理失败但已有 ${req.deliveredAssets.length} 个产物。非致命错误，智能降级：${isFinalityGate ? '关闭卡片' : '继续生成'}`,
      prompt: isFinalityGate ? '' : '上一步因审核代理故障中断，请继续在同一项目内推进当前任务。',
      humanMessage: '', action: '', confidence: 0.4,
    };
  }
  // No artifacts, no account issue — safest is stop, but note the reason
  return {
    decision: 'stop', passed: false,
    reason: `审核代理彻底失败且无产物：${errMsg.slice(0,120)}`,
    prompt: '', humanMessage: '', action: '', confidence: 0,
  };
}

async function main() {
  const sidecarDir = path.resolve(arg('--dir'));
  const jobPath = path.resolve(arg('--job'));
  const ownerPid = Number(arg('--owner-pid', '0'));
  if (!sidecarDir || !jobPath) throw new Error('Usage: review-sidecar-supervisor-v15.cjs --dir <sidecarDir> --job <job.json>');
  const eventsFile = path.join(sidecarDir, 'events.jsonl');
  const decisionsDir = path.join(sidecarDir, 'decisions');
  const doneFile = path.join(sidecarDir, 'done.json');
  const logFile = path.join(sidecarDir, 'sidecar.log.jsonl');
  const job = readJson(jobPath, {});
  const owner = {ownerPid, jobPath};
  fs.mkdirSync(decisionsDir, {recursive:true});
  appendJsonl(logFile, {event:'started', at:new Date().toISOString(), version:'v1.18.4-owner-bound', jobPath, sidecarDir, pid:process.pid, ownerPid:ownerPid || null});

  const seen = new Set();
  const started = Date.now();
  const maxIdleMs = Number(job.reviewSidecar?.maxIdleMs || process.env.MAKARON_REVIEW_SIDECAR_MAX_IDLE_MS || 6 * 60 * 60 * 1000);

  while (true) {
    const done = readSidecarCompletion(doneFile, owner);
    if (done) {
      recordCompletion(doneFile, done);
      appendJsonl(logFile, {event:'done', at:new Date().toISOString(), done});
      return;
    }
    const raw = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8') : '';
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let req;
      try { req = JSON.parse(line); } catch { continue; }
      if (!req.id || seen.has(req.id)) continue;
      seen.add(req.id);

      if (!req.needsDecision) {
        appendJsonl(logFile, {event:'telemetry_event', at:new Date().toISOString(), id:req.id, eventType:req.eventType, summary:trim(req.summary || req.text || '', 500)});
        continue;
      }

      appendJsonl(logFile, {event:'decision_request', at:new Date().toISOString(), id:req.id, eventType:req.eventType, gateIndex:req.gateIndex});
      try {
        const decision = await askReviewAgent({request:req, job, sidecarDir, owner});
        const doneAfterReview = readSidecarCompletion(doneFile, owner);
        if (doneAfterReview) {
          recordCompletion(doneFile, doneAfterReview);
          appendJsonl(logFile, {event:'decision_discarded_done', at:new Date().toISOString(), id:req.id, done:doneAfterReview});
          return;
        }
        writeJson(path.join(decisionsDir, `${safeName(req.id)}.json`), decision);
        appendJsonl(logFile, {event:'decision_written', at:new Date().toISOString(), id:req.id, decision:decision.decision, confidence:decision.confidence});
      } catch (e) {
        if (e?.code === 'SIDECAR_DONE') {
          const stopped = e.done || readSidecarCompletion(doneFile, owner);
          recordCompletion(doneFile, stopped);
          appendJsonl(logFile, {event:'decision_cancelled_done', at:new Date().toISOString(), id:req.id, done:stopped});
          return;
        }
        // Smart fallback: if review agent fails even after retries, infer decision
        // from context instead of blindly stopping.
        const fallback = inferFallbackDecision(req, e);
        const decision = normalizeDecision(fallback, req);
        writeJson(path.join(decisionsDir, `${safeName(req.id)}.json`), decision);
        appendJsonl(logFile, {event:'decision_error', at:new Date().toISOString(), id:req.id, decision:decision.decision, error:String(e.stack || e)});
      }
    }
    if (Date.now() - started > maxIdleMs) {
      appendJsonl(logFile, {event:'max_idle_exit', at:new Date().toISOString(), maxIdleMs});
      return;
    }
    await sleep(1000);
  }
}

main().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});
