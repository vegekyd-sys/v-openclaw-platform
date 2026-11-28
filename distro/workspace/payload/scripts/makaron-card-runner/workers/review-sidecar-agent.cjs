#!/usr/bin/env node
'use strict';

/**
 * Makaron v1.4 staged review sidecar (disabled by default).
 *
 * A generic-task-worker can launch this sidecar at task start. The sidecar stays
 * alive beside the fast Node worker, waits for review requests, asks an OpenClaw
 * agent to read Makaron's script/plan output, then writes a JSON decision back.
 *
 * This keeps the fast worker deterministic while making the review decision
 * agent-native instead of regex/state-machine based.
 */

const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const ROOT = require('../workspace-root.cjs');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name) { return process.argv.includes(name); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'review-sidecar'; }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function appendJsonl(file, obj) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.appendFileSync(file, JSON.stringify(obj) + '\n'); }
function trim(s, n = 4000) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, {cwd: ROOT, env: process.env, stdio:['ignore','pipe','pipe'], ...opts});
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', (code, signal) => resolve({code, signal, stdout, stderr}));
  });
}

function parseJsonCandidate(value) {
  let s = String(value || '').trim().replace(/^\uFEFF/, '').trim();
  if (!s) return null;
  // Robust against model replies like ```json ... ```, ``` JSON ... ```,
  // or a fence payload where only a leading `json` line remains.
  s = s.replace(/^```\s*[a-z0-9_-]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  s = s.replace(/^json\s*\n/i, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
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
  const parsed = extractJsonObject(stdout);
  if (!parsed) return stdout;
  const payloadText = parsed.result?.payloads?.find?.(p => typeof p?.text === 'string' && p.text.trim())?.text;
  if (payloadText) return payloadText;
  return parsed.reply || parsed.message || parsed.output || parsed.text || parsed.result?.reply || JSON.stringify(parsed);
}

function buildReviewPrompt({request, job, taskMode}) {
  const expected = (request.expectedAssets || job.expectedAssets || []).join(', ') || 'media';
  const last = trim(request.makaronSay || request.text || '', 5000);
  return `你是 Makaron v1.4 的独立 Review Subagent。你不是状态机，也不要用关键词正则做最终判断。请像审片/创意总监一样读取 Makaron 的输出，判断下一步应该确认、要求修改、停止，或关闭。

任务背景：
- Feishu chatId: ${job.chatId || ''}
- cardId: ${job.cardId || ''}
- projectId: ${request.projectId || job.projectId || ''}
- expected assets: ${expected}
- review gate index: ${request.gateIndex || 0}
- sidecar mode: ${taskMode || 'required'}

原始 brief：
${trim(job.prompt || '', 1800)}

Makaron 当前输出（脚本/方案/说明）：
${last}

你的职责：
1. 如果 Makaron 已经给出脚本/方案但没有媒体，判断它是否满足用户目标、安全边界、风格方向、时长/资产要求。
2. 如果合格，decision="confirm"，并给出一段 prompt，让 Makaron 继续同一项目生成最终 ${expected}，不要再等人类确认。
3. 如果不合格，decision="revise"，给出具体修改 prompt。修改 prompt 应要求 Makaron 先返回修正版脚本/方案，除非问题很小且可直接修正生成。
4. 如果任务已不需要 review 或没有 gate，decision="close"。
5. 如果风险太大或信息不足，decision="stop" 并说明原因。

只输出 JSON，不要 markdown：
{
  "decision": "confirm" | "revise" | "stop" | "close",
  "passed": true | false,
  "reason": "你的自然语言审核理由，简洁但具体",
  "prompt": "发给 Makaron 的下一轮 prompt；close 时可为空",
  "confidence": 0.0-1.0
}`;
}

async function askReviewAgent({request, job, sidecarDir}) {
  const sessionKey = request.sessionKey || job.reviewSidecar?.sessionKey || `agent:@@AGENT_ID@@:review-sidecar-${safeName(job.cardId || job.chatId || 'task')}`;
  const model = request.model || job.reviewSidecar?.model || process.env.MAKARON_REVIEW_AGENT_MODEL || '';
  const timeout = String(request.timeoutSeconds || job.reviewSidecar?.timeoutSeconds || 300);
  const prompt = buildReviewPrompt({request, job, taskMode: job.reviewSidecar?.mode});
  const promptFile = path.join(sidecarDir, `prompt-${safeName(request.id)}.txt`);
  fs.writeFileSync(promptFile, prompt);

  const args = ['agent', '--agent', job.reviewSidecar?.agentId || 'makaron', '--session-key', sessionKey, '--message', prompt, '--thinking', job.reviewSidecar?.thinking || 'high', '--timeout', timeout, '--json'];
  if (model) args.push('--model', model);
  const res = await run('openclaw', args);
  fs.writeFileSync(path.join(sidecarDir, `agent-${safeName(request.id)}.stdout.log`), res.stdout || '');
  fs.writeFileSync(path.join(sidecarDir, `agent-${safeName(request.id)}.stderr.log`), res.stderr || '');
  if (res.code !== 0) throw new Error(`openclaw agent failed code=${res.code}: ${trim(res.stderr || res.stdout, 1200)}`);

  const reply = parseOpenClawAgentReply(res.stdout);
  const decision = extractJsonObject(reply) || extractJsonObject(res.stdout);
  if (!decision || !decision.decision) throw new Error(`review agent did not return decision JSON: ${trim(reply || res.stdout, 1200)}`);
  return {
    version: 'makaron-review-sidecar-v1.4-staged',
    id: request.id,
    at: new Date().toISOString(),
    sessionKey,
    decision: String(decision.decision || '').toLowerCase(),
    passed: Boolean(decision.passed),
    reason: String(decision.reason || ''),
    prompt: String(decision.prompt || ''),
    confidence: Number(decision.confidence ?? 0),
    raw: decision,
  };
}

async function main() {
  const sidecarDir = path.resolve(arg('--dir'));
  const jobPath = path.resolve(arg('--job'));
  if (!sidecarDir || !jobPath) throw new Error('Usage: review-sidecar-agent.cjs --dir <sidecarDir> --job <job.json>');
  const eventsFile = path.join(sidecarDir, 'events.jsonl');
  const decisionsDir = path.join(sidecarDir, 'decisions');
  const doneFile = path.join(sidecarDir, 'done.json');
  const logFile = path.join(sidecarDir, 'sidecar.log.jsonl');
  const job = readJson(jobPath, {});
  fs.mkdirSync(decisionsDir, {recursive:true});
  appendJsonl(logFile, {event:'started', at:new Date().toISOString(), jobPath, sidecarDir, pid:process.pid});

  const seen = new Set();
  const started = Date.now();
  const maxIdleMs = Number(job.reviewSidecar?.maxIdleMs || process.env.MAKARON_REVIEW_SIDECAR_MAX_IDLE_MS || 6 * 60 * 60 * 1000);

  while (true) {
    const done = readJson(doneFile, null);
    const raw = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8') : '';
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let req;
      try { req = JSON.parse(line); } catch { continue; }
      if (!req.id || seen.has(req.id)) continue;
      seen.add(req.id);
      appendJsonl(logFile, {event:'review_request', at:new Date().toISOString(), id:req.id, gateIndex:req.gateIndex});
      try {
        const decision = await askReviewAgent({request:req, job, sidecarDir});
        writeJson(path.join(decisionsDir, `${safeName(req.id)}.json`), decision);
        appendJsonl(logFile, {event:'decision_written', at:new Date().toISOString(), id:req.id, decision:decision.decision, confidence:decision.confidence});
      } catch (e) {
        const decision = {
          version: 'makaron-review-sidecar-v1.4-staged',
          id: req.id,
          at: new Date().toISOString(),
          decision: job.reviewSidecar?.fallbackDecision || 'stop',
          passed: false,
          reason: `review sidecar failed: ${e.message || e}`,
          prompt: '',
          confidence: 0,
          error: String(e.stack || e),
        };
        writeJson(path.join(decisionsDir, `${safeName(req.id)}.json`), decision);
        appendJsonl(logFile, {event:'decision_error', at:new Date().toISOString(), id:req.id, error:String(e.stack || e)});
      }
    }
    if (done && raw.trim().split('\n').filter(Boolean).every(line => {
      try { const req = JSON.parse(line); return seen.has(req.id); } catch { return true; }
    })) {
      appendJsonl(logFile, {event:'done', at:new Date().toISOString(), done});
      return;
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
