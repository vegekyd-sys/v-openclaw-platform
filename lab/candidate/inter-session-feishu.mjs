// Feishu end-to-end scenarios for cross-session work (docs/inter-session/design.md §10.3, §13).
//
//   node lab/candidate/inter-session-feishu.mjs run        inside a candidate (the plans' command)
//   node lab/candidate/inter-session-feishu.mjs verify <receipt.json> [--watch <watch.jsonl>] [--out <file>]
//                                                          on the Mac: the owner's readback of every chat a
//                                                          scenario touched (lark-cli, user identity, read
//                                                          only), judged by server timestamps + the run's
//                                                          ledger / transcript evidence
//   node lab/candidate/inter-session-feishu.mjs watch --out <file> [--interval 15] [--minutes 90]
//                                                          on the Mac while a run is going: snapshots of the
//                                                          five chats, for states that a final readback cannot
//                                                          show (the ⏳ line before its edit, the background row)
//   node lab/candidate/inter-session-feishu.mjs plans      (re)writes lab/candidate/inter-session-*.plan.json
//
// Inside the candidate (env):
//   ISC_VARIANT    full (R1 core + Feishu bridge + plugin 2.0) | stock (V's bytes, V's workspace, no plugin:
//                  C-stock) | fallback (R1 patched, plugin configured enabled:false: C-fallback)
//   ISC_ENV        v (VLAB_FEISHU_STEER_*, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) | vlab (without them)
//   RELAY_HARNESS  worker | vds | vcc (claude-cli with the shared user's login; vcodex never runs in a candidate)
//   ISC_SCENARIOS  comma list, run in order (see SCENARIOS below); ISC_REPEAT repeats F2 for S-tail
//   RUN_TAG        unique tag carried by every message this run causes (default IS + 6 hex)
//
// Who types what: Tianyi's DM messages and human group messages are signed im.message.receive_v1 events
// injected into this candidate's loopback webhook (sender = Tianyi's VLab open_id, or a made-up
// non-owner for F4b). A human turn in a group replies to a real, bot-posted seed message clearly marked
// as a test; nothing is ever posted as Tianyi. Everything the candidate's V says goes out through the real
// VLab app ("V - Lab") into the owner DM, 「VLab 发布验收 B」 and 「VLab 测试｜房间 1/2/3」.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as S from "./inter-session-support.mjs";

const { OWNER, DM_CHAT, GROUP_B, ROOMS, CHAT_NAMES, SECOND_USER, dmKey, groupKey, sleep, iso, redact } = S;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const TERMINAL = ["handed_back", "delivered_inline", "skipped", "cancelled"];
const B_KEY = groupKey(GROUP_B);
const ROOM_KEYS = ROOMS.map(groupKey);
const MAIN_KEY = `agent:${S.AGENT}:main`;
const label = (chatId) => CHAT_NAMES[chatId];


// =====================================================================================================
// inside the candidate
// =====================================================================================================
async function runInCandidate() {
  const env = process.env;
  const VARIANT = env.ISC_VARIANT ?? "full";
  const HARNESS = env.RELAY_HARNESS ?? "worker";
  const ENV_MODE = env.ISC_ENV ?? "v";
  const RUN_TAG = env.RUN_TAG ?? S.newRunTag("IS");
  const ORDER = (env.ISC_SCENARIOS ?? "F2").split(",").map((s) => s.trim()).filter(Boolean);
  const T0 = Date.now();
  const since = () => `${((Date.now() - T0) / 1000).toFixed(0)}s`;
  const summary = {
    kind: "inter-session-feishu", v: 1, runTag: RUN_TAG, variant: VARIANT, harness: HARNESS, envMode: ENV_MODE, scenarios: ORDER,
    candidateId: env.VLAB_CANDIDATE_ID ?? null, startedAt: iso(T0), notes: [], results: [], chats: {},
  };
  const step = (msg, extra) => {
    const line = `[${since()}] ${msg}${extra ? ` ${redact(JSON.stringify(extra)).slice(0, 600)}` : ""}`;
    console.error(line);
    fs.appendFileSync(path.join(env.VLAB_CANDIDATE_DATA, "inter-session-progress.log"), line + "\n");
  };
  assert(["full", "stock", "fallback"].includes(VARIANT), `ISC_VARIANT must be full|stock|fallback, got ${VARIANT}`);

  // ---- bytes: the plan's `files` put them there; check they are what this variant claims
  const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "tests/fixtures/inter-session-v-bytes.json"), "utf8"));
  const runtime = env.VLAB_CANDIDATE_RUNTIME;
  const dist = path.join(runtime, "openclaw", "dist");
  const cfg0 = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
  const feishuDir = cfg0.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
  const R1 = {
    "sessions-spawn-tool-1FQMTkIo.js": { file: path.join(dist, "sessions-spawn-tool-1FQMTkIo.js"), marker: "v-sessions-send-relay-v3" },
    "openclaw-tools-BODVdJQD.js": { file: path.join(dist, "openclaw-tools-BODVdJQD.js"), marker: "v-sessions-send-relay-tools-v1" },
    "get-reply-CqW1y05D.js": { file: path.join(dist, "get-reply-CqW1y05D.js"), marker: "v-inter-session-exclusive-v1" },
    "agent-runner.runtime-CAdsMsQt.js": { file: path.join(dist, "agent-runner.runtime-CAdsMsQt.js"), marker: "v-inter-session-exclusive-v1" },
    "dispatch-from-config-DOJq_7CI.js": { file: path.join(dist, "dispatch-from-config-DOJq_7CI.js"), marker: "v-inter-session-exclusive-v1" },
    "task-registry-activity-DSlVVJwD.js": { file: path.join(dist, "task-registry-activity-DSlVVJwD.js"), marker: "v-task-bridge-extra-sources-v1" },
    "monitor.account-WFdlCDhR.js": { file: path.join(feishuDir, "dist", "monitor.account-WFdlCDhR.js"), marker: "v-feishu-inter-session-bridge-v1" },
  };
  const vSha = Object.fromEntries(fixture.files.map((f) => [f.file, f.sha256]));
  summary.bytes = Object.fromEntries(Object.entries(R1).map(([name, { file, marker }]) => {
    const bytes = fs.readFileSync(file);
    return [name, { sha256: S.sha256(bytes), isV: S.sha256(bytes) === vSha[name], marker: bytes.includes(marker) }];
  }));
  const pluginIndex = path.join(runtime, "extensions", "v-session-relay", "index.js");
  summary.bytes.plugin = fs.existsSync(pluginIndex) ? { indexSha256: S.sha256(fs.readFileSync(pluginIndex)) } : null;
  for (const [name, b] of Object.entries(summary.bytes)) {
    if (name === "plugin") continue;
    if (VARIANT === "stock") assert(b.isV && !b.marker, `stock variant needs V's bytes for ${name}`);
    else assert(!b.isV && b.marker, `${VARIANT} variant needs the R1 patch in ${name}`);
  }
  if (VARIANT !== "stock") assert(summary.bytes.plugin, "plugin 2.0 must be mapped into the runtime");

  // ---- prepare + start
  const cand = await S.prepareCandidate({
    harness: HARNESS, envMode: ENV_MODE, plugin: VARIANT === "full" ? "on" : VARIANT === "fallback" ? "off" : "absent",
    workerGuard: env.ISC_WORKER_GUARD === "1",
  });
  cand.patchedBridge = VARIANT !== "stock";
  summary.allowance = cand.allowance;
  summary.workspace = cand.workspace ? { files: cand.workspace.files.map((f) => `${f.path}${f.drafted ? " (drafted)" : ""}`), drafts: cand.workspace.drafts.map((d) => d.name) } : null;
  summary.notes.push(...cand.notes);
  const ready = await cand.start();
  step("gateway ready", ready);
  summary.gatewayReadyMs = ready.readyMs;
  for (const chat of [GROUP_B, ...ROOMS]) summary.chats[chat] = { label: label(chat), info: await cand.chatInfo(chat) };
  summary.botOpenId = await cand.botInfo().catch((e) => `unavailable: ${e.message}`);
  for (const [key, lbl] of [[dmKey(), null], [B_KEY, label(GROUP_B)], ...ROOMS.map((c) => [groupKey(c), label(c)])]) {
    const r = await cand.ensureSession(key, { label: lbl });
    if (!r.ok) summary.notes.push(`sessions.patch ${key}: ${r.error}`);
  }

  const ctx = { cand, summary, step, RUN_TAG, VARIANT, HARNESS, ENV_MODE, T0 };
  const repeat = Math.max(1, Number(env.ISC_REPEAT ?? 1));
  try {
    for (const id of ORDER) {
      const def = SCENARIOS[id];
      if (!def) { summary.results.push({ id, verdict: "skipped", reason: "unknown scenario" }); continue; }
      const times = id === "F2" ? repeat : 1;
      for (let i = 0; i < times; i++) {
        const seenBefore = summary.results.filter((x) => x.id === id).length;
        const tag = `${RUN_TAG}-${id}${times > 1 || seenBefore ? `-${seenBefore + 1}` : ""}`;
        const r = { id, tag, harness: HARNESS, envMode: ENV_MODE, variant: VARIANT, startedAt: iso(Date.now()), checks: [], readback: { windows: {}, checks: [] }, evidence: {} };
        summary.results.push(r);
        const mark = cand.mark();
        const t0 = Date.now();
        step(`scenario ${tag} starts`);
        try {
          if (cand.gateway.exitCode !== null || cand.gateway.signalCode) { await cand.start(); step("gateway restarted before scenario"); }
          if (def.env) { await cand.stop(); r.evidence.gatewayEnv = def.env; await cand.start({ extraEnv: def.env }); step(`gateway restarted with ${JSON.stringify(def.env)}`); }
          await def.run({ ...ctx, r, tag, t0 });
        } catch (e) {
          r.error = redact(e?.stack ?? e).slice(0, 2500);
          step(`scenario ${tag} error`, { error: r.error.slice(0, 400) });
        }
        r.endedAt = iso(Date.now());
        r.durationMs = Date.now() - t0;
        r.log = cand.logSince(mark, /inter-session|v-session-relay|vrelay|sessions_send|restart recovery|BUSY|busy|Error:|warn/u, 120);
        r.taskStatus = cand.logSince(mark, /task-status card=/u, 60);
        r.inCandidate = r.checks.every((c) => c.ok) && !r.error ? "pass" : "fail";
        if (def.env) { try { await cand.stop(); await cand.start(); step("gateway restarted without scenario env"); } catch (e) { r.restoreError = redact(e?.message ?? e).slice(0, 300); } }
        step(`scenario ${tag} ${r.inCandidate}`, { failed: r.checks.filter((c) => !c.ok).map((c) => c.id) });
        await settleBetween(cand);
      }
    }
    const tails = summary.results.filter((r) => Number.isFinite(r.requesterTailMs)).map((r) => r.requesterTailMs);
    summary.requesterTail = S.tailStats(tails);
    summary.ok = summary.results.every((r) => r.inCandidate === "pass");
  } catch (e) {
    summary.ok = false;
    summary.error = redact(e?.stack ?? e).slice(0, 3000);
  } finally {
    if (cand.fake) {
      const watchIndex = new Map();
      for (const snap of cand.fake.snapshots) {
        const m = S.normalizeMessage(snap.message);
        if (!watchIndex.has(snap.message.chat_id)) watchIndex.set(snap.message.chat_id, []);
        watchIndex.get(snap.message.chat_id).push({...m, seenAt: snap.at});
      }
      for (const r of summary.results) {
        r.platformChecks = (r.readback?.checks ?? []).map(spec => ({id: spec.id, optional: Boolean(spec.optional), ...S.evalReadbackCheck(spec, cand.fake.list(spec.chat).map(S.normalizeMessage), watchIndex, {readReactions: id => cand.fake.reactions.get(id)?.size ?? 0})}));
        r.verdict = r.error ? "error" : r.inCandidate === "pass" && r.platformChecks.every(c => c.optional || c.ok === true) ? "pass" : "fail";
      }
      summary.ok = summary.results.every(r => r.verdict === "pass");
      const blockedFile = path.join(cand.data, 'blocked-platform.jsonl');
      const blocked = fs.existsSync(blockedFile) ? fs.readFileSync(blockedFile, 'utf8').trim().split('\n').filter(Boolean).length : 0;
      summary.platform = {mode: "mock", realFeishuSends: 0, credentials: "synthetic", outboundDomain: 'loopback', networkGuard: "feishu-no-live.cjs", blockedLiveRequests: blocked, apiRequests: cand.fake.requests.length, messages: cand.fake.messages.size, unimplemented: [...new Set(cand.fake.unimplemented)]};
      if (blocked) summary.ok = false;
    } else summary.platform = {mode: "live"};
    summary.endedAt = iso(Date.now());
    summary.totalMs = Date.now() - T0;
    summary.ledgerTotals = (() => { const L = cand.ledger(); return { sends: L.sends.length, batches: L.batches.length, chains: L.chains.length }; })();
    summary.gatewayTail = cand.lines.slice(-60).map((l) => `${iso(l.at).slice(11, 23)} ${redact(l.line).slice(0, 300)}`);
    console.log(JSON.stringify(summary));
    await cand.stop();
    await cand.cleanup();
    if (!summary.ok) process.exitCode = 1;
  }
}

/** Lets the last cards finalize and the session settle before the next scenario. */
async function settleBetween(cand) {
  await sleep(8_000);
  await S.maybeUntil(() => !cand.ledger().sends.some((s) => !TERMINAL.includes(s.phase)), { timeoutMs: 120_000, intervalMs: 3_000, label: "no send in flight" });
}

// ---------------------------------------------------------------- shared scenario helpers
function check(r, id, ok, detail) { r.checks.push({ id, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); return Boolean(ok); }
function window(r, chat, from, to) {
  const w = r.readback.windows[chat];
  r.readback.windows[chat] = { from: Math.min(w?.from ?? from, from), to: Math.max(w?.to ?? to, to) };
}
function rb(r, spec) { r.readback.checks.push(spec); }
function alive(cand) {
  if (cand.gateway.exitCode !== null || cand.gateway.signalCode) throw new Error(`Gateway died (${cand.gateway.exitCode ?? cand.gateway.signalCode})\n${redact(cand.lines.slice(-30).map((l) => l.line).join("\n"))}`);
}

function reduceSend(s) {
  if (!s) return null;
  return {
    sendId: s.sendId, code: s.code, edge: s.edge, kind: s.kind, mode: s.mode, phase: s.phase, depth: s.depth, chainId: s.chainId, batchId: s.batchId, parentSendId: s.parentSendId,
    createdAt: iso(s.createdAt), createdAtMs: s.createdAt, attempt: s.attempt,
    requester: { sessionKey: s.requester?.sessionKey, runId: s.requester?.runId, runRole: s.requester?.runRole, label: s.requester?.label, transport: s.requester?.transport },
    target: { sessionKey: s.target?.sessionKey, label: s.target?.label, transport: s.target?.transport, humans: s.target?.route?.humans ?? null, leaf: s.target?.leaf },
    principal: s.principal ? { id: s.principal.id, isOwner: s.principal.isOwner } : null,
    message: { chars: s.message?.chars, trimmed: s.message?.trimmed, redactions: s.message?.redactions, visibleText: redact(s.message?.visibleText ?? "").slice(0, 400) },
    request: { messageId: s.request?.messageId, postedAt: iso(s.request?.postedAt), postAttempts: s.request?.postAttempts, queuedLine: s.request?.queuedLine, queueNoteEditedAt: iso(s.request?.queueNoteEditedAt), text: redact(s.request?.text ?? "").slice(0, 400) },
    targetRun: s.targetRun ? { ...s.targetRun, startedAtIso: iso(s.targetRun.startedAt), endedAtIso: iso(s.targetRun.endedAt) } : null,
    inline: s.inline, result: s.result ? { noReply: s.result.noReply, source: s.result.source, fromRunId: s.result.fromRunId ?? null, media: s.result.media?.length ?? 0, text: redact(s.result.text ?? "").slice(0, 4000) } : null,
    failure: s.failure, wakeRounds: s.wakeRounds,
    history: (s.history ?? []).map((h) => `${iso(h.at)?.slice(11, 23)} ${h.phase}${h.note ? ` (${redact(h.note).slice(0, 120)})` : ""}`),
  };
}
const reduceBatch = (b) => (b ? { batchId: b.batchId, phase: b.phase, members: b.members, servesSendId: b.servesSendId, requester: { sessionKey: b.requester?.sessionKey, runId: b.requester?.runId }, sealedAt: iso(b.sealedAt), sealedAtMs: b.sealedAt, wake: { ...b.wake, startedAtIso: iso(b.wake?.startedAt), endedAtIso: iso(b.wake?.endedAt) } } : null);

/** Sends from `requesterKey` accepted since `since`, at least `n` of them. */
async function waitSends(cand, { since, requesterKey = dmKey(), n = 1, targets, labelText, timeoutMs = 300_000, extra }) {
  return S.until(() => {
    alive(cand);
    const s = cand.sendsWhere((x) => x.createdAt >= since - 1_000 && x.requester?.sessionKey === requesterKey && (!targets || targets.includes(x.target?.sessionKey)) && (!extra || extra(x)));
    return s.length >= n ? s : null;
  }, { timeoutMs, intervalMs: 1_000, label: labelText ?? `${n} send(s) from ${requesterKey}` });
}

/** Every send terminal and every batch woken with its wake run ended (or skipped). */
async function waitSettled(cand, sendIds, { timeoutMs = 600_000, labelText = "sends settled" } = {}) {
  return S.until(() => {
    alive(cand);
    const L = cand.ledger();
    const sends = sendIds.map((id) => L.sends.find((s) => s.sendId === id));
    if (sends.some((s) => !s || !TERMINAL.includes(s.phase))) return null;
    const batches = [...new Set(sends.map((s) => s.batchId).filter(Boolean))].map((b) => L.batches.find((x) => x.batchId === b));
    if (batches.some((b) => !b || (b.phase !== "skipped" && !(b.phase === "woken" && b.wake?.endedAt)))) return null;
    return { sends, batches };
  }, { timeoutMs, intervalMs: 2_000, labelText, label: labelText });
}

async function transcript(cand, key, sinceMs) {
  const h = await cand.history(key, 120);
  return Array.isArray(h) ? h.filter((m) => !Number.isFinite(m.atMs) || m.atMs >= sinceMs - 3_000) : h;
}

/** Tool calls of the requester between `fromMs` and `toMs` (its own turn, before any wake turn). */
function requesterTools(hist, fromMs, toMs) {
  return S.requesterToolCalls(Array.isArray(hist) ? hist : [], fromMs, toMs);
}

/** The DM side of an async hand-back: exactly one ↩️ for this batch, then exactly one wake card. */
function expectHandback(r, { batch, sends, from, to, chat = DM_CHAT, single = true }) {
  const codes = sends.map((s) => s.code);
  window(r, chat, from, to);
  rb(r, { id: "handback-anchor-posted", chat, kind: "message", messageId: batch?.wake?.handbackMessageId, includesAny: ["↩️", "⚠️", "⏹"], includesAll: single && codes.length === 1 ? [`#${codes[0]}`] : [] });
  rb(r, { id: "exactly-one-handback", chat, kind: "count", from, to, textRe: codes.length === 1 ? `^(↩️|⚠️|⏹).*#${codes[0]}` : "^↩️ \\d+ 件都有结果了", equals: 1 });
  rb(r, { id: "exactly-one-wake-card-after-handback", chat, kind: "after", afterId: batch?.wake?.handbackMessageId, senderType: "app", types: ["interactive", "post", "text"], excludeTextRe: "^(↩️|⚠️|⏹|❓|📨)", min: 1, max: 1, to });
}

/** The target side: the 📨/❓ anchor with this code and a reply card under it (groups reply to the anchor). */
function expectTargetSide(r, { send, chat, from, to, icon = "📨", tagIncludes = [], anchors = 1 }) {
  window(r, chat, from, to);
  rb(r, { id: `anchor-${label(chat) ?? chat}`, chat, kind: "message", messageId: send.request?.messageId, includesAll: [icon, `#${send.code}`, ...tagIncludes] });
  if (chat !== DM_CHAT) rb(r, { id: `card-under-anchor-${label(chat) ?? chat}`, chat, kind: "replies", parentId: send.request?.messageId, senderType: "app", min: 1 });
  rb(r, { id: `one-anchor-${label(chat) ?? chat}`, chat, kind: "count", from, to, textRe: `#${send.code}(\\D|$)`, startsWithAny: ["📨", "❓"], equals: anchors });
}

/** A transcript message of the synthetic turn tagged `:<kind>:<id>` (role-agnostic: chat.history shows it as the requester V speaking). */
const isInter = (m, frag) => m?.provenance?.kind === "inter_session" && String(m.provenance.originSessionId ?? "").includes(frag);

function preset(kind, s) { return `v-a2a-${{ request: "req", ask: "ask", collect: "col" }[kind]}-${s.sendId}-${s.attempt}`; }

const dmPrompt = (tag, body) => `【跨会话测试 ${tag}】${body}（这是 V 的自动化测试，内容不重要；回复里带上 ${tag}。）`;
const keyLine = (chat) => `「${label(chat)}」（sessionKey: ${groupKey(chat)}）`;

// ---------------------------------------------------------------- the generic async F2 flow
async function asyncSingle(ctx, { target = GROUP_B, work, settleMs = 600_000, extraChecks, anchors = 1 } = {}) {
  const { cand, r, tag, t0 } = ctx;
  // A hand-off in Tianyi's words: "交给…" (no instruction about waiting or ending the turn; the tool
  // description, the result note and AGENTS decide that). Asking "做完告诉我" instead makes models
  // pick an inline wait (run 7d319a1e: timeoutSeconds=120, tail 81 s), which is allowed but is not F2.
  const text = dmPrompt(tag, `把这件事交给${keyLine(target)}里的 V：${work ?? `用 exec 执行 \`sleep 75 && date\`，然后把输出的时间连同 ${tag} 回复出来`}。`);
  const ev = await cand.dm(text);
  r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
  const [send] = await waitSends(cand, { since: t0, targets: [groupKey(target)] });
  ctx.step(`${tag}: accepted`, { sendId: send.sendId, code: send.code, mode: send.mode });
  const settled = await waitSettled(cand, [send.sendId], { timeoutMs: settleMs, labelText: `${tag} handed back` });
  await sleep(6_000);
  const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
  const b = s.batchId ? cand.batch(s.batchId) : null;
  r.evidence.sends = [reduceSend(s)];
  r.evidence.batches = [reduceBatch(b)];
  const end = Date.now();
  const dmHist = await transcript(cand, dmKey(), t0);
  const tgtHist = await transcript(cand, groupKey(target), t0);
  r.evidence.transcripts = { dm: dmHist, target: tgtHist };
  r.requesterTailMs = S.requesterTailMs(s, b);
  const reqTools = requesterTools(dmHist, t0, b?.sealedAt ?? (s.createdAt + 120_000));
  r.evidence.requesterTools = reqTools;
  check(r, "accepted-then-handed-back", s.phase === "handed_back", s.phase);
  check(r, "target-ran-with-preset-runId", s.targetRun?.runId === preset("request", s), { runId: s.targetRun?.runId, attempt: s.attempt });
  check(r, "target-run-ok", s.targetRun?.status === "ok", s.targetRun?.status);
  check(r, "result-carries-tag", (s.result?.text ?? "").includes(tag), (s.result?.text ?? "").slice(0, 200));
  check(r, "batch-woken-once", b?.phase === "woken" && b.wake?.attempt === 0 && Boolean(b.wake?.startedAt), b?.wake);
  check(r, "requester-tail-under-60s", Number.isFinite(r.requesterTailMs) && r.requesterTailMs < 60_000, r.requesterTailMs);
  check(r, "requester-no-sleep-or-poll", !reqTools.some((t) => (t.command && S.SLEEP_RE.test(t.command)) || /sessions_history|session_status/u.test(t.name)), reqTools.map((t) => t.name + (t.command ? `:${t.command.slice(0, 60)}` : "")));
  const wakeUser = Array.isArray(dmHist) ? dmHist.filter((m) => isInter(m, `:wake:${b?.batchId}`)) : [];
  check(r, "one-wake-turn-in-requester-transcript", wakeUser.length === 1, wakeUser.length);
  const tgtUser = Array.isArray(tgtHist) ? tgtHist.filter((m) => isInter(m, `:req:${s.sendId}`)) : [];
  check(r, "one-request-turn-in-target-transcript", tgtUser.length === 1, tgtUser.length);
  expectTargetSide(r, { send: s, chat: target, from: t0, to: end, tagIncludes: [tag], anchors });
  expectHandback(r, { batch: b, sends: [s], from: s.createdAt, to: end });
  if (extraChecks) await extraChecks({ s, b, dmHist, tgtHist, end });
  return { s, b, dmHist, tgtHist, end };
}

// ---------------------------------------------------------------- scenarios
const SCENARIOS = {
  // ---- F1i: a direct inline question DM → group B (a delegate edge, so the anchor is 📨, not ❓)
  F1i: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `用 sessions_send 当场问${keyLine(GROUP_B)}里的 V（timeoutSeconds=120，等它回答）：给「v2.3 上线通知」起一个 10 字以内的标题，回答开头写上 ${tag}。拿到回答后把标题告诉我`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [send] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    await waitSettled(cand, [send.sendId], { timeoutMs: 420_000 });
    await S.maybeUntil(async () => { const h = await transcript(cand, dmKey(), t0); return Array.isArray(h) && h.some((m) => m.role === "assistant" && m.atMs > send.createdAt && m.text.includes(tag)); }, { timeoutMs: 120_000, intervalMs: 3_000 });
    await sleep(5_000);
    const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
    const end = Date.now();
    const dmHist = await transcript(cand, dmKey(), t0);
    r.evidence.sends = [reduceSend(s)];
    r.evidence.transcripts = { dm: dmHist, target: await transcript(cand, B_KEY, t0) };
    const toolRes = dmHist.filter((m) => m.role === "toolResult" && /sessions_send/u.test(m.toolName ?? ""));
    check(r, "inline-mode", s.mode === "inline", s.mode);
    check(r, "delivered-inline", s.phase === "delivered_inline", s.phase);
    check(r, "tool-result-has-answer", toolRes.some((m) => m.text.includes(tag)), toolRes.map((m) => m.text.slice(0, 200)));
    check(r, "no-batch-no-wake", !s.batchId, s.batchId);
    expectTargetSide(r, { send: s, chat: GROUP_B, from: t0, to: end });
    window(r, DM_CHAT, t0, end);
    rb(r, { id: "no-handback-in-dm", chat: DM_CHAT, kind: "count", from: s.createdAt, to: end, textRe: `^(↩️|💬).*#${s.code}`, equals: 0 });
  } },

  // ---- F1: an ask edge: group B (working for the DM) asks its requester inline → ❓ in the DM
  F1: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `把这件事交给${keyLine(GROUP_B)}里的 V（timeoutSeconds=0，不用等）：「请先用 sessions_send（sessionKey: ${dmKey()}，timeoutSeconds=120，当场等回答）问 Tianyi 私聊：上线通知用中文还是英文？拿到回答后，按回答写一句带 ${tag} 的 v2.3 上线通知，作为你的最终回复。」`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [del] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    const [ask] = await waitSends(cand, { since: t0, requesterKey: B_KEY, targets: [dmKey()], timeoutMs: 360_000, labelText: "group B asks the DM" });
    await waitSettled(cand, [del.sendId, ask.sendId], { timeoutMs: 600_000 });
    await sleep(6_000);
    const L = cand.ledger();
    const d = L.sends.find((x) => x.sendId === del.sendId);
    const a = L.sends.find((x) => x.sendId === ask.sendId);
    const b = d.batchId ? cand.batch(d.batchId) : null;
    const end = Date.now();
    const bHist = await transcript(cand, B_KEY, t0);
    const dmHist = await transcript(cand, dmKey(), t0);
    r.evidence.sends = [reduceSend(d), reduceSend(a)];
    r.evidence.batches = [reduceBatch(b)];
    r.evidence.transcripts = { dm: dmHist, groupB: bHist };
    r.requesterTailMs = S.requesterTailMs(d, b);
    check(r, "ask-edge-leaf-inline", a.edge === "ask" && a.kind === "ask" && a.mode === "inline" && a.target?.leaf === true, { edge: a.edge, kind: a.kind, mode: a.mode, leaf: a.target?.leaf });
    check(r, "ask-delivered-inline", a.phase === "delivered_inline", a.phase);
    check(r, "ask-run-preset", a.targetRun?.runId === preset("ask", a), a.targetRun?.runId);
    const askRes = bHist.filter((m) => m.role === "toolResult" && /sessions_send/u.test(m.toolName ?? ""));
    check(r, "ask-tool-result-ok", askRes.some((m) => /中文|英文|Chinese|English/u.test(m.text)), askRes.map((m) => m.text.slice(0, 200)));
    check(r, "delegate-handed-back-once", d.phase === "handed_back" && b?.phase === "woken", { phase: d.phase, batch: b?.phase });
    expectTargetSide(r, { send: a, chat: DM_CHAT, from: t0, to: end, icon: "❓" });
    rb(r, { id: "ask-answer-card-after-question", chat: DM_CHAT, kind: "after", afterId: a.request?.messageId, senderType: "app", types: ["interactive", "post", "text"], excludeTextRe: "^(↩️|⚠️|⏹|❓|📨)", min: 1, to: d.result ? (b?.wake?.startedAt ?? end) : end });
    rb(r, { id: "no-answer-handback", chat: DM_CHAT, kind: "count", from: t0, to: end, textRe: `^💬.*#${a.code}`, equals: 0 });
    expectTargetSide(r, { send: d, chat: GROUP_B, from: t0, to: end });
    expectHandback(r, { batch: b, sends: [d], from: d.createdAt, to: end });
  } },

  // ---- F2: async single, target works 75 s; requester_tail_ms (S-tail repeats this)
  F2: { async run(ctx) { await asyncSingle(ctx, { target: process.env.ISC_F2_TARGET ?? GROUP_B }); } },

  // ---- F3: the target is busy with a human turn when the request arrives
  F3: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const human = await cand.humanInGroup(GROUP_B, { text: `【测试 ${tag}-H】请用 exec 执行 \`sleep 60 && date\`，然后回复「${tag}-H 完成」和时间。` });
    r.evidence.injected = [{ chat: GROUP_B, messageId: human.messageId, seed: human.seed, at: iso(human.at) }];
    window(r, GROUP_B, t0, t0);
    await S.until(async () => { const h = await transcript(cand, B_KEY, t0); return Array.isArray(h) && h.some((m) => m.role === "user" && m.text.includes(`${tag}-H`)); }, { timeoutMs: 120_000, intervalMs: 1_000, label: "human turn started in group B" });
    await sleep(5_000);
    const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 回复一句「${tag} 收到」（不用等它，交出去就行）`));
    r.evidence.injected.push({ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) });
    const [send] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    const atAccept = cand.ledger().sends.find((x) => x.sendId === send.sendId);
    r.evidence.atAccept = reduceSend(atAccept);
    await waitSettled(cand, [send.sendId], { timeoutMs: 600_000 });
    await sleep(6_000);
    const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
    const b = s.batchId ? cand.batch(s.batchId) : null;
    const end = Date.now();
    const bHist = await transcript(cand, B_KEY, t0);
    const dmHist = await transcript(cand, dmKey(), t0);
    r.evidence.sends = [reduceSend(s)];
    r.evidence.batches = [reduceBatch(b)];
    r.evidence.transcripts = { dm: dmHist, groupB: bHist };
    r.requesterTailMs = S.requesterTailMs(s, b);
    const humanIdx = bHist.findIndex((m) => m.role === "user" && m.text.includes(`${tag}-H`));
    const reqIdx = bHist.findIndex((m) => isInter(m, `:req:${s.sendId}`));
    const humanTurn = bHist.slice(humanIdx, reqIdx > humanIdx ? reqIdx : undefined);
    const humanEnd = Math.max(...humanTurn.filter((m) => m.role === "assistant").map((m) => m.atMs).filter(Number.isFinite));
    r.evidence.humanTurnEndedAt = iso(humanEnd);
    check(r, "anchor-had-busy-line-at-accept", atAccept.request?.queuedLine === true && /⏳/u.test(atAccept.request?.text ?? ""), atAccept.request);
    check(r, "collab-started-after-human-turn", s.targetRun?.startedAt > humanEnd, { started: iso(s.targetRun?.startedAt), humanEnd: iso(humanEnd) });
    check(r, "runId-is-preset", s.targetRun?.runId === preset("request", s), { runId: s.targetRun?.runId, attempt: s.attempt });
    check(r, "human-turn-transcript-without-request", humanIdx >= 0 && reqIdx > humanIdx && !humanTurn.some((m) => m.text.includes(`${tag} 收到`) && m.role === "user"), { humanIdx, reqIdx });
    const reqUsers = bHist.filter((m) => isInter(m, `:req:${s.sendId}`));
    check(r, "no-extra-user-messages", reqUsers.length === 1, reqUsers.length);
    check(r, "handed-back", s.phase === "handed_back", s.phase);
    expectTargetSide(r, { send: s, chat: GROUP_B, from: t0, to: end });
    window(r, GROUP_B, t0, end);
    rb(r, { id: "anchor-edited-without-busy-line", chat: GROUP_B, kind: "message", messageId: s.request?.messageId, excludesAll: ["⏳"] });
    rb(r, { id: "anchor-showed-busy-line (watch)", chat: GROUP_B, kind: "everText", messageId: s.request?.messageId, includesAll: ["⏳"], optional: true });
    rb(r, { id: "zero-new-messages-while-busy", chat: GROUP_B, kind: "count", from: (s.request?.postedAt ?? s.createdAt) + 1, to: (s.targetRun?.startedAt ?? end) - 1, senderType: "app", equals: 0 });
    rb(r, { id: "collab-card-after-human-turn", chat: GROUP_B, kind: "replies", parentId: s.request?.messageId, senderType: "app", min: 1, createdAfter: humanEnd });
    expectHandback(r, { batch: b, sends: [s], from: s.createdAt, to: end });
  } },

  // ---- F3b: the race window: the engine waits VSR_TEST_START_DELAY_MS before start; a human writes then
  F3b: { env: { VSR_TEST_START_DELAY_MS: "3000" }, async run(ctx) { await raceScenario(ctx, "human"); } },
  // ---- F3b-rpc: same window, but the competing turn is an agent RPC turn (the G guard must answer BUSY)
  "F3b-rpc": { env: { VSR_TEST_START_DELAY_MS: "3000", ISC_FORCE_ADMISSION_BUSY: "1" }, async run(ctx) { await raceScenario(ctx, "rpc"); } },
  F3c: { async run(ctx) { await admissionGapScenario(ctx); } },
  TR1: { async run(ctx) { await taskRoomScenario(ctx, false); } },
  TR2: { async run(ctx) { await taskRoomScenario(ctx, true); } },

  // ---- F4a / F4b: someone writes in the target chat while the collaboration turn runs (env=v)
  F4a: { async run(ctx) { await interjectScenario(ctx, OWNER); } },
  F4b: { async run(ctx) { await interjectScenario(ctx, SECOND_USER); } },

  // ---- F5: kill -9 the Gateway while the target turn runs, then start it again
  F5: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 用 exec 执行 \`sleep 90 && date\`，然后把时间连同 ${tag} 回复出来（不用等它）`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [send] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    await S.until(() => { alive(cand); const x = cand.ledger().sends.find((y) => y.sendId === send.sendId); return x?.targetRun?.startedAt && Date.now() - x.targetRun.startedAt > 15_000 ? x : null; }, { timeoutMs: 300_000, intervalMs: 1_000, label: "target running 15 s" });
    r.evidence.beforeKill = reduceSend(cand.ledger().sends.find((y) => y.sendId === send.sendId));
    r.evidence.kill = await cand.kill9();
    ctx.step(`${tag}: killed`, r.evidence.kill);
    await sleep(3_000);
    const bootMark = cand.mark();
    r.evidence.restart = await cand.start();
    r.evidence.restartLog = restartLog(cand, bootMark);
    ctx.step(`${tag}: restarted`, r.evidence.restart);
    await waitSettled(cand, [send.sendId], { timeoutMs: 720_000, labelText: "recovered send settled" });
    await sleep(6_000);
    const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
    const b = s.batchId ? cand.batch(s.batchId) : null;
    // the room must take a human message after the restart (wedge detection)
    const post = await cand.humanInGroup(GROUP_B, { text: `【测试 ${tag}-P】重启后的检查：请只回复「房间正常 ${tag}-P」。` });
    r.evidence.injected.push({ chat: GROUP_B, messageId: post.messageId, seed: post.seed, at: iso(post.at) });
    const answered = await S.maybeUntil(async () => { const h = await transcript(cand, B_KEY, post.at); return Array.isArray(h) && h.some((m) => m.role === "assistant" && m.atMs > post.at && m.text.includes(`${tag}-P`)) ? h : null; }, { timeoutMs: 240_000, intervalMs: 3_000 });
    await sleep(6_000);
    const end = Date.now();
    r.evidence.sends = [reduceSend(s)];
    r.evidence.batches = [reduceBatch(b)];
    r.evidence.transcripts = { dm: await transcript(cand, dmKey(), t0), groupB: await transcript(cand, B_KEY, t0) };
    r.evidence.recoveryLog = cand.logSince(0, /recover|restart recovery|interrupted|wedge|v-session-relay/u, 60);
    check(r, "send-closed-after-restart", TERMINAL.includes(s.phase), s.phase);
    check(r, "one-outcome-for-requester", b?.phase === "woken" && b.wake?.attempt <= 1, b?.wake);
    check(r, "outcome-is-result-or-interrupted", s.result || s.failure?.class === "interrupted", { result: Boolean(s.result), failure: s.failure });
    check(r, "room-answers-after-restart", Boolean(answered), Boolean(answered));
    window(r, GROUP_B, t0, end);
    rb(r, { id: "one-anchor", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: `^📨.*#${s.code}`, equals: 1 });
    rb(r, { id: "restart-note-or-recovery-run", chat: GROUP_B, kind: "count", from: r.evidence.kill.killedAt, to: post.seed.createMs, senderType: "app", min: 1 });
    rb(r, { id: "post-restart-reply-to-human", chat: GROUP_B, kind: "replies", parentId: post.messageId, senderType: "app", min: 1 });
    expectHandback(r, { batch: b, sends: [s], from: s.createdAt, to: end });
  } },

  // ---- F6: VSR_CRASH_AT=<phase> on the real machine (posting, running, waking)
  "F6-posting": { async run(ctx) { await crashScenario(ctx, "posting"); } },
  "F6-running": { async run(ctx) { await crashScenario(ctx, "running"); } },
  "F6-waking": { async run(ctx) { await crashScenario(ctx, "waking"); } },

  // ---- F7: fan-out 3 + fan-in
  F7: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const mark0 = cand.mark();
    const ev = await cand.dm(dmPrompt(tag, `把下面三件事分别交给三个测试房间（都不用等，同一轮交出去）：${keyLine(ROOMS[0])}：先用 exec 执行 \`sleep 20 && date\`，再用一句话解释什么是 CRDT，开头写 ${tag}-a；${keyLine(ROOMS[1])}：先用 exec 执行 \`sleep 25 && date\`，再列出三种排序算法的名字，开头写 ${tag}-b；${keyLine(ROOMS[2])}：用 exec 执行 \`sleep 40 && date\` 后回复时间，开头写 ${tag}-c。三个都回来后汇总告诉我`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const sends = await waitSends(cand, { since: t0, targets: ROOM_KEYS, n: 3 });
    await waitSettled(cand, sends.map((s) => s.sendId), { timeoutMs: 600_000 });
    await sleep(6_000);
    const L = cand.ledger();
    const ss = sends.map((x) => L.sends.find((y) => y.sendId === x.sendId));
    const batchIds = [...new Set(ss.map((s) => s.batchId))];
    const b = cand.batch(batchIds[0]);
    const end = Date.now();
    r.evidence.sends = ss.map(reduceSend);
    r.evidence.batches = batchIds.map((id) => reduceBatch(cand.batch(id)));
    const dmHist = await transcript(cand, dmKey(), t0);
    r.evidence.transcripts = { dm: dmHist };
    r.requesterTailMs = S.requesterTailMs(ss[0], b);
    check(r, "three-sends-one-batch", ss.length === 3 && batchIds.length === 1 && b?.members?.length === 3, { batchIds, members: b?.members });
    check(r, "all-handed-back", ss.every((s) => s.phase === "handed_back"), ss.map((s) => s.phase));
    check(r, "one-wake", b?.phase === "woken" && b.wake?.attempt === 0, b?.wake);
    const wakeUsers = dmHist.filter((m) => isInter(m, ":wake:"));
    check(r, "one-wake-turn", wakeUsers.length === 1, wakeUsers.length);
    check(r, "wake-prompt-lists-three", wakeUsers.length === 1 && ["-a", "-b", "-c"].every((x) => wakeUsers[0].text.includes(`${tag}${x}`)), wakeUsers[0]?.text?.slice(0, 400));
    ss.forEach((s, i) => expectTargetSide(r, { send: s, chat: ROOMS[ROOM_KEYS.indexOf(s.target.sessionKey)] ?? ROOMS[i], from: t0, to: end }));
    expectHandback(r, { batch: b, sends: ss, from: Math.min(...ss.map((s) => s.createdAt)), to: end, single: false });
    // the requester card's background row, as the Feishu plugin logs every line it writes (card text is
    // not readable through the user API: "请升级至最新版本客户端")
    const rows = cand.logSince(mark0, /task-status card=/u, 80);
    r.evidence.taskStatus = rows;
    // The row counts sends in flight. A harness that calls tools one after another (codex) may see a
    // fast room finish before the third send is accepted, so the expected peak comes from the ledger.
    const settledAt = (raw) => (raw.history ?? []).find((h) => ["result_ready", "failure_ready", "skipped", "cancelled"].includes(h.phase))?.at ?? Infinity;
    const raws = ss.map((x) => L.sends.find((y) => y.sendId === x.sendId));
    const peak = Math.max(...raws.map((a) => raws.filter((b) => b.createdAt <= a.createdAt && settledAt(b) > a.createdAt).length));
    const overlapMs = Math.min(...raws.map(settledAt)) - Math.max(...raws.map(a => a.createdAt));
    check(r, "three-requests-overlapped-over-refresh-window", peak === 3 && overlapMs >= 5000, {peak, overlapMs});
    r.evidence.expectedPeakInFlight = peak;
    const counts = rows.map((l) => Number(l.match(/后台 (\d+) 项进行中 · 会话请求/u)?.[1] ?? NaN)).filter(Number.isFinite);
    check(r, "background-row-counted-peak-session-requests", peak >= 1 && counts.includes(peak) && Math.max(...counts) === peak, { peak, counts, rows: rows.slice(0, 6) });
    check(r, "background-row-ended", rows.some((l) => /后台任务已结束/u.test(l)), rows.slice(-3));
  } },

  // ---- F8: induced loop: group B and room 1 "confirm each other 10 times"
  F8: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `请把这件事交给${keyLine(GROUP_B)}里的 V（不用等）：「你和${keyLine(ROOMS[0])}互相确认 10 次：你每次用 sessions_send（timeoutSeconds=0）给房间1 发一句『确认 n ${tag}』，并请房间1 收到后也用 sessions_send（timeoutSeconds=0）给你发回『确认 n』，直到 10 次。被拦就停下，把情况写进你的回复。」`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [first] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    await S.until(() => { alive(cand); const L = cand.ledger(); const chain = L.chains.find((c) => c.chainId === first.chainId); const open = L.sends.filter((s) => s.chainId === first.chainId && !TERMINAL.includes(s.phase)); return chain && open.length === 0 && Date.now() - t0 > 60_000 ? chain : null; }, { timeoutMs: 900_000, intervalMs: 3_000, label: "loop chain quiet" });
    await sleep(8_000);
    const L = cand.ledger();
    const chain = L.chains.find((c) => c.chainId === first.chainId);
    const all = L.sends.filter((s) => s.chainId === first.chainId).sort((a, b) => a.createdAt - b.createdAt);
    const end = Date.now();
    const hists = { dm: await transcript(cand, dmKey(), t0), groupB: await transcript(cand, B_KEY, t0), room1: await transcript(cand, ROOM_KEYS[0], t0) };
    r.evidence.sends = all.map(reduceSend);
    r.evidence.chain = { counters: chain?.counters, members: chain?.members ? Object.keys(chain.members) : [] };
    r.evidence.transcripts = hists;
    const forbidden = [...hists.groupB, ...hists.room1].filter((m) => m.role === "toolResult" && /forbidden|不能再|不用发|互相卡住|已来回|停止|发得太快|已经交出/u.test(m.text));
    r.evidence.forbidden = forbidden.map((m) => m.text.slice(0, 240));
    check(r, "a-loop-send-was-refused", forbidden.length >= 1, forbidden.length);
    check(r, "chain-within-budget", (chain?.counters?.sends ?? 0) <= 24 && Object.values(chain?.counters?.pairs ?? {}).every((n) => n <= 6), chain?.counters);
    check(r, "chain-count-matches-ledger", (chain?.counters?.sends ?? -1) === all.length, { counter: chain?.counters?.sends, ledger: all.length });
    window(r, DM_CHAT, t0, end); window(r, GROUP_B, t0, end); window(r, ROOMS[0], t0, end);
  } },

  // ---- F9: the target answers NO_REPLY
  F9: { async run(ctx) {
    await asyncSingle(ctx, { target: ROOMS[1], work: `这一轮只输出 NO_REPLY 这一个词，不要输出任何别的文字（这是在测试"没有文字结果"的交回）`, settleMs: 420_000, extraChecks: async ({ s }) => {
      const r = ctx.r;
      for (const id of ["result-carries-tag", "target-run-ok"]) r.checks = r.checks.filter((c) => c.id !== id);
      check(r, "result-is-noReply", s.result?.noReply === true, s.result);
      // NO_REPLY is deliberately silent: it may never open an answer card. The request
      // anchor and the requester's explicit no-text hand-back are the visible contract.
      r.readback.checks = r.readback.checks.filter(c => !c.id.startsWith('card-under-anchor-'));
      rb(r, { id: "handback-says-no-text", chat: DM_CHAT, kind: "message", messageId: ctx.r.evidence.batches?.[0]?.wake?.handbackMessageId, includesAll: ["没有文字结果"] });
    } });
  } },

  // ---- F10: the target's model is broken
  F10: { async run(ctx) {
    const { cand, r } = ctx;
    const key = ROOM_KEYS[2];
    r.evidence.patch = await cand.ensureSession(key, { model: S.BROKEN_MODEL });
    try {
      await asyncSingle(ctx, { target: ROOMS[2], work: `回复一句「${ctx.tag} 收到」`, settleMs: 420_000, extraChecks: async ({ s }) => {
        r.checks = r.checks.filter((c) => !["result-carries-tag", "target-run-ok", "accepted-then-handed-back"].includes(c.id));
        check(r, "failure-started_failed", s.failure?.class === "started_failed" && s.phase === "handed_back", { phase: s.phase, failure: s.failure });
        rb(r, { id: "handback-is-failure", chat: DM_CHAT, kind: "message", messageId: r.evidence.batches?.[0]?.wake?.handbackMessageId, includesAll: ["⚠️", "没能完成"] });
      } });
    } finally {
      r.evidence.restore = await cand.ensureSession(key, { model: cand.model });
    }
  } },

  // ---- F11: visible text: owner_only rooms show the full text; secrets are hidden; the model has it all
  F11: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const fake = `sk-isctest${"0123456789abcdef".repeat(2)}ZZ`;
    const filler = "这是一段用来测试可见正文长度的说明文字，内容本身没有意义，只是为了让正文超过两百个字。".repeat(4);
    const expectedHash = S.sha256(fake);
    const ev = await cand.dm(dmPrompt(tag, `把下面整段原样交给${keyLine(ROOMS[0])}里的 V（不用等）：请用 exec 计算下面假的测试串（仅 sk- 开头的串，不含标点）的 UTF-8 SHA256，然后只回复 ${tag}、哈希值和段尾验收码，不要回显测试串。这段话是：「${filler} 结尾附一个假的测试串 ${fake}，它不是真的密钥。段尾验收码 ${tag}-END。」`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [send] = await waitSends(cand, { since: t0, targets: [ROOM_KEYS[0]] });
    await waitSettled(cand, [send.sendId], { timeoutMs: 420_000 });
    await sleep(6_000);
    const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
    const end = Date.now();
    const tHist = await transcript(cand, ROOM_KEYS[0], t0);
    r.evidence.sends = [reduceSend(s)];
    r.evidence.chatInfo = ctx.summary.chats[ROOMS[0]];
    check(r, "room-is-owner_only", s.target?.route?.humans === "owner_only", s.target?.route?.humans);
    check(r, "full-text-not-trimmed", s.message?.trimmed === false && (s.message?.chars ?? 0) > 200, { chars: s.message?.chars, trimmed: s.message?.trimmed });
    const fakeSent = (s.message?.text ?? "").includes("sk-isctest");
    check(r, "requester-passed-the-fake-key", fakeSent, fakeSent);
    check(r, "fake-key-hidden-in-visible-text", !fakeSent || ((s.message?.redactions ?? 0) >= 1 && !s.message?.visibleText?.includes("sk-isctest") && s.message?.visibleText?.includes("‹已隐去›")), { redactions: s.message?.redactions });
    const req = tHist.find((m) => isInter(m, `:req:${s.sendId}`));
    // chat.history deliberately masks key-shaped text; its masked projection cannot
    // prove the model's original input. Computing the original string's hash can.
    check(r, "model-got-full-text", (s.result?.text ?? '').includes(expectedHash) && s.result.text.includes(`${tag}-END`), {expectedHash,result:s.result?.text,historyMasksKey:!req?.text?.includes(fake)});
    expectTargetSide(r, { send: s, chat: ROOMS[0], from: t0, to: end });
    rb(r, { id: "anchor-hides-fake-key", chat: ROOMS[0], kind: "message", messageId: s.request?.messageId, excludesAll: ["sk-isctest"], includesAll: fakeSent ? ["‹已隐去›"] : [] });
    rb(r, { id: "anchor-not-truncated", chat: ROOMS[0], kind: "message", messageId: s.request?.messageId, excludesAll: ["全文", "已交给 V"] });
  } },

  "F11-shared": { async run(ctx) {
    const {cand, r, tag, t0} = ctx;
    assert(cand.fake, "shared-members fixture must never change a real chat");
    cand.fake.members.set(ROOMS[0], 3);
    await cand.stop(); await cand.start(); // discard the bridge's chat-info cache
    try {
      const body = '共享群的裁剪测试内容。'.repeat(50) + `${tag}-END`;
      await cand.dm(dmPrompt(tag, `把以下整段原样交给${keyLine(ROOMS[0])}里的 V（不用等），请它回复这段文字最末尾的验收码：${body}`));
      const [send] = await waitSends(cand, {since:t0, targets:[ROOM_KEYS[0]]});
      await waitSettled(cand, [send.sendId]);
      const s = cand.ledger().sends.find(x => x.sendId === send.sendId);
      const h = await transcript(cand, ROOM_KEYS[0], t0);
      const req = h.find(m => isInter(m, `:req:${s.sendId}`));
      r.evidence = {sends:[reduceSend(s)],transcripts:{room:h}};
      check(r, 'shared-group-detected', s.target?.route?.humans === 'shared', s.target?.route?.humans);
      check(r, 'visible-request-trimmed', s.message?.trimmed === true && s.message.visibleText.length <= 260 && !s.request.text.includes(`${tag}-END`), {chars:s.message?.chars,visible:s.message?.visibleText});
      check(r, 'model-kept-full-request', Boolean(req?.text.includes(`${tag}-END`)) && s.result?.text.includes(`${tag}-END`), {tail:req?.text.slice(-100),result:s.result?.text});
      expectTargetSide(r, {send:s,chat:ROOMS[0],from:t0,to:Date.now()});
    } finally { cand.fake.members.delete(ROOMS[0]); await cand.stop(); await cand.start(); }
  } },

  // ---- F12: a room that only ever had sessions.patch (no inbound) gets its route from the key
  F12: { async run(ctx) {
    const { cand, r, tag } = ctx;
    const key = ROOM_KEYS[2];
    r.evidence.entryBefore = await cand.sessionEntry(key);
    await asyncSingle(ctx, { target: ROOMS[2], work: `回复一句「${tag} 收到」`, settleMs: 420_000, extraChecks: async ({ s }) => {
      const after = await cand.sessionEntry(key);
      r.evidence.entryAfter = after;
      const pick = (e) => JSON.stringify(e ?? {}).match(/"(deliveryContext|delivery|lastChannel|lastTo|origin)":/gu) ?? [];
      check(r, "route-derived-from-key", s.target?.transport === "bridge" && Boolean(s.request?.messageId), { transport: s.target?.transport });
      check(r, "entry-learned-external-delivery", /"kind":"external"|"lastChannel":"feishu"|"channel":"feishu"/u.test(JSON.stringify(after ?? {})) && !/"lastChannel":"feishu"/u.test(JSON.stringify(r.evidence.entryBefore ?? {})), { before: pick(r.evidence.entryBefore), after: pick(after) });
    } });
  } },

  // ---- F13: continuation A → X → three rooms; A gets X's summary, not its "started" line
  F13: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `请把这件事交给${keyLine(GROUP_B)}里的 V（不用等）：「请你把三件小事分别交给三个测试房间（同一轮交出去，都不用等）：${keyLine(ROOMS[0])}：计算 17*19，回复格式必须为 ${tag}-a=计算结果；${keyLine(ROOMS[1])}：计算 23*29，回复格式必须为 ${tag}-b=计算结果；${keyLine(ROOMS[2])}：用 exec 执行 \`sleep 30 && date -u +%s\` 后回复时间戳，回复格式必须为 ${tag}-c=时间戳。三个都回来后，你写一份汇总，逐字保留每个房间的验收码和数值（不要改写或省略），这份汇总就是你交回的最终结果。」`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const [top] = await waitSends(cand, { since: t0, targets: [B_KEY] });
    const rooms = await waitSends(cand, { since: t0, requesterKey: B_KEY, targets: ROOM_KEYS, n: 3, timeoutMs: 420_000, labelText: "group B fans out to three rooms" });
    await waitSettled(cand, [top.sendId, ...rooms.map((x) => x.sendId)], { timeoutMs: 900_000 });
    await sleep(6_000);
    const L = cand.ledger();
    const S0 = L.sends.find((x) => x.sendId === top.sendId);
    const RS = rooms.map((x) => L.sends.find((y) => y.sendId === x.sendId));
    const bTop = cand.batch(S0.batchId);
    const bRooms = [...new Set(RS.map((x) => x.batchId))].map((id) => cand.batch(id));
    const end = Date.now();
    r.evidence.sends = [reduceSend(S0), ...RS.map(reduceSend)];
    r.evidence.batches = [reduceBatch(bTop), ...bRooms.map(reduceBatch)];
    const dmHist = await transcript(cand, dmKey(), t0);
    const bHist = await transcript(cand, B_KEY, t0);
    r.evidence.transcripts = { dm: dmHist, groupB: bHist };
    r.requesterTailMs = S.requesterTailMs(S0, bTop);
    check(r, "rooms-are-depth-2-children", RS.every((x) => x.depth === 2 && x.parentSendId === S0.sendId && x.edge === "delegate"), RS.map((x) => ({ depth: x.depth, parent: x.parentSendId, edge: x.edge })));
    check(r, "x-woken-once-by-one-batch", bRooms.length === 1 && bRooms[0]?.phase === "woken" && bRooms[0]?.servesSendId === S0.sendId && bRooms[0]?.wake?.attempt === 0, bRooms.map(reduceBatch));
    check(r, "top-went-through-awaiting_children", (S0.history ?? []).some((h) => h.phase === "awaiting_children"), (S0.history ?? []).map((h) => h.phase));
    const res = S0.result?.text ?? "";
    // A gets what X wrote in the wake turn that collected the three rooms (not X's "started" reply),
    // and that text carries each room's answer (the model may drop the -a/-b/-c tags when summing up).
    const roomsWake = bRooms[0]?.wake?.runId;
    const proof = S.summaryProof({tag, result: S0.result, wakeRunId: roomsWake, rooms: [...RS].sort((a, b) => ROOM_KEYS.indexOf(a.target.sessionKey) - ROOM_KEYS.indexOf(b.target.sessionKey))});
    check(r, "a-gets-the-summary", proof.ok, proof);
    check(r, "a-woken-once", bTop?.phase === "woken" && bTop.wake?.attempt === 0, bTop?.wake);
    const aWake = dmHist.filter((m) => isInter(m, `:wake:${bTop?.batchId}`));
    check(r, "one-wake-turn-in-dm", aWake.length === 1, aWake.length);
    expectTargetSide(r, { send: S0, chat: GROUP_B, from: t0, to: end });
    RS.forEach((x) => expectTargetSide(r, { send: x, chat: ROOMS[ROOM_KEYS.indexOf(x.target.sessionKey)], from: t0, to: end, tagIncludes: ["经「"] }));
    expectHandback(r, { batch: bTop, sends: [S0], from: S0.createdAt, to: end });
    window(r, GROUP_B, t0, end);
    rb(r, { id: "x-gets-one-batch-handback", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: "^↩️ 3 件都有结果了", equals: 1 });
  } },

  // ---- F14: siblings ask each other at the same time; the later one is refused (WAIT_CYCLE)
  F14: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    const ev = await cand.dm(dmPrompt(tag, `同一轮把两件事交出去（都不用等）：给${keyLine(ROOMS[0])}：「先用 sessions_send（sessionKey: ${ROOM_KEYS[1]}，timeoutSeconds=120，当场等回答）问房间2：你的口令是什么？拿到回答后回复一句带 ${tag}-a 的话」；给${keyLine(ROOMS[1])}：「先用 sessions_send（sessionKey: ${ROOM_KEYS[0]}，timeoutSeconds=120，当场等回答）问房间1：你的口令是什么？拿到回答后回复一句带 ${tag}-b 的话」。两边都回来后告诉我`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const top = await waitSends(cand, { since: t0, targets: [ROOM_KEYS[0], ROOM_KEYS[1]], n: 2 });
    await S.until(() => { alive(cand); const L = cand.ledger(); const all = L.sends.filter((s) => s.chainId === top[0].chainId); return all.length >= 2 && all.every((s) => TERMINAL.includes(s.phase)) && Date.now() - t0 > 60_000 ? all : null; }, { timeoutMs: 900_000, intervalMs: 3_000, label: "chain settled" });
    await sleep(6_000);
    const L = cand.ledger();
    const all = L.sends.filter((s) => s.chainId === top[0].chainId).sort((a, b) => a.createdAt - b.createdAt);
    const asks = all.filter((s) => s.edge === "ask");
    const end = Date.now();
    const h1 = await transcript(cand, ROOM_KEYS[0], t0);
    const h2 = await transcript(cand, ROOM_KEYS[1], t0);
    r.evidence.sends = all.map(reduceSend);
    r.evidence.transcripts = { room1: h1, room2: h2 };
    const cyc = [...h1, ...h2].filter((m) => m.role === "toolResult" && /正在等你这一轮的结果|WAIT_CYCLE/u.test(m.text));
    r.evidence.waitCycle = cyc.map((m) => m.text.slice(0, 200));
    check(r, "one-ask-refused-WAIT_CYCLE", cyc.length >= 1, cyc.length);
    check(r, "no-turn-hung-past-inline-max", asks.every((a) => !a.targetRun?.endedAt || !a.createdAt || a.targetRun.endedAt - a.createdAt < 330_000) && all.every((s) => TERMINAL.includes(s.phase)), asks.map((a) => ({ phase: a.phase, ms: a.targetRun?.endedAt ? a.targetRun.endedAt - a.createdAt : null })));
    for (const c of [DM_CHAT, ROOMS[0], ROOMS[1]]) window(r, c, t0, end);
  } },

  // ---- F15: background work: the room starts a 90 s background exec and ends its turn
  F15: { async run(ctx) {
    const { cand, r, tag } = ctx;
    await asyncSingle(ctx, { target: ROOMS[1], anchors: 2, work: `用 exec 在后台启动 \`sleep 90 && echo ${tag}-done\`（background 方式，不要等它结束），启动后马上结束本轮，说明已在后台运行`, settleMs: 720_000, extraChecks: async ({ s, end }) => {
      r.checks = r.checks.filter((c) => c.id !== "result-carries-tag");
      const phases = (s.history ?? []).map((h) => h.phase);
      check(r, "went-awaiting_background", phases.includes("awaiting_background"), phases);
      check(r, "collect-turn-ran", (cand.ledger().runs ?? []).some((x) => String(x.runId).startsWith(`v-a2a-col-${s.sendId}`)) || r.log?.some?.((l) => l.includes(`v-a2a-col-${s.sendId}`)), null);
      check(r, "result-from-collect", (s.result?.text ?? "").includes(`${tag}-done`) || /done|完成|结束/u.test(s.result?.text ?? ""), (s.result?.text ?? "").slice(0, 200));
      window(r, ROOMS[1], s.createdAt, end);
      rb(r, { id: "collect-anchor", chat: ROOMS[1], kind: "count", from: s.createdAt, to: end, textRe: `^📨 #${s.code} 的后台工作都结束了`, equals: 1 });
    } });
  } },

  // ---- F16: DISABLED file: sessions_send goes the v2 way (no anchor)
  F16: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    cand.setDisabled(true);
    await sleep(2_500);
    try {
      const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(ROOMS[0])}里的 V 回复一句「${tag} 收到」（不用等它）`));
      r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
      await S.until(async () => { const h = await transcript(cand, dmKey(), t0); return Array.isArray(h) && h.some((m) => m.role === "toolResult" && /sessions_send/u.test(m.toolName ?? "")) ? h : null; }, { timeoutMs: 300_000, intervalMs: 3_000, label: "sessions_send called" });
      await sleep(90_000);
      const end = Date.now();
      const sends = cand.sendsWhere((x) => x.createdAt >= t0);
      r.evidence.transcripts = { dm: await transcript(cand, dmKey(), t0), room1: await transcript(cand, ROOM_KEYS[0], t0) };
      r.evidence.fallbackLog = cand.logSince(0, /vrelay|v2|fallback/u, 20);
      check(r, "no-ledger-record", sends.length === 0, sends.map((s) => s.sendId));
      check(r, "room-turn-ran-v2", r.evidence.transcripts.room1.some((m) => m.role === "assistant" && m.text.includes(tag)) || r.evidence.transcripts.room1.some((m) => m.role === "user"), null);
      window(r, ROOMS[0], t0, end);
      rb(r, { id: "no-anchor", chat: ROOMS[0], kind: "count", from: t0, to: end, textRe: "^(📨|❓)", equals: 0 });
    } finally {
      cand.setDisabled(false);
      await sleep(2_500);
    }
  } },

  // ---- F17: fan-out 5 against the global cap of 4 request turns
  F17: { async run(ctx) {
    const { cand, r, tag, t0 } = ctx;
    await cand.ensureSession(MAIN_KEY, {});
    const targets = [[GROUP_B, "a"], [null, "b"], [ROOMS[0], "c"], [ROOMS[1], "d"], [ROOMS[2], "e"]];
    const list = targets.map(([chat, x]) => `${chat ? keyLine(chat) : `「V 主会话」（sessionKey: ${MAIN_KEY}）`}：用 exec 执行 \`sleep 45 && date\` 后回复时间，开头写 ${tag}-${x}`).join("；");
    const ev = await cand.dm(dmPrompt(tag, `同一轮按顺序把下面五件事分别交出去（都不用等，timeoutSeconds=0）：${list}。都回来后汇总告诉我`));
    r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
    const sends = await waitSends(cand, { since: t0, targets: [B_KEY, MAIN_KEY, ...ROOM_KEYS], n: 5, timeoutMs: 360_000 });
    const atAccept = sends.map((s) => cand.ledger().sends.find((y) => y.sendId === s.sendId));
    await waitSettled(cand, sends.map((s) => s.sendId), { timeoutMs: 900_000 });
    await sleep(6_000);
    const L = cand.ledger();
    const ss = sends.map((x) => L.sends.find((y) => y.sendId === x.sendId)).sort((a, b) => a.createdAt - b.createdAt);
    const end = Date.now();
    r.evidence.sends = ss.map(reduceSend);
    r.evidence.atAccept = atAccept.map((s) => ({ sendId: s.sendId, queuedLine: s.request?.queuedLine, text: s.request?.text?.slice(-60) }));
    const starts = ss.map((s) => s.targetRun?.startedAt).filter(Boolean).sort((a, b) => a - b);
    const ends = ss.map((s) => s.targetRun?.endedAt).filter(Boolean).sort((a, b) => a - b);
    const fifth = ss.at(-1);
    check(r, "five-accepted", ss.length === 5, ss.length);
    check(r, "fifth-queued-visibly", atAccept.find((s) => s.sendId === fifth.sendId)?.request?.queuedLine === true, atAccept.map((s) => s.request?.queuedLine));
    check(r, "fifth-started-after-a-slot-freed", fifth.targetRun?.startedAt >= ends[0] - 1_500, { fifth: iso(fifth.targetRun?.startedAt), firstEnd: iso(ends[0]) });
    check(r, "never-more-than-4-running", (() => { let max = 0; for (const t of starts) { const n = ss.filter((s) => s.targetRun?.startedAt <= t && (s.targetRun?.endedAt ?? Infinity) > t).length; max = Math.max(max, n); } return max <= 4; })(), null);
    for (const s of ss) { const chat = s.target.sessionKey === B_KEY ? GROUP_B : ROOMS[ROOM_KEYS.indexOf(s.target.sessionKey)]; if (chat) window(r, chat, t0, end); }
    if (fifth.request?.messageId) {
      const chat = fifth.target.sessionKey === B_KEY ? GROUP_B : ROOMS[ROOM_KEYS.indexOf(fifth.target.sessionKey)];
      rb(r, { id: "fifth-anchor-showed-queue-line (watch)", chat, kind: "everText", messageId: fifth.request.messageId, includesAll: ["⏳"], optional: true });
      rb(r, { id: "fifth-anchor-edited", chat, kind: "message", messageId: fifth.request.messageId, excludesAll: ["⏳"] });
    }
    window(r, DM_CHAT, t0, end);
  } },
};

// ---------------------------------------------------------------- F3b, F4, F6 bodies
async function admissionGapScenario(ctx) {
  const {cand, r, tag, t0} = ctx;
  assert(cand.allowance.admissionRace, "F3c requires the recorded candidate-only barrier");
  const gate = path.join(cand.data, "guard-gap");
  await cand.stop(); await cand.start({extraEnv: {ISC_GUARD_GAP_FILE: gate}});
  try {
    await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}回复「${tag} 收到」（不用等）`));
    const [send] = await waitSends(cand, {since: t0, targets: [B_KEY]});
    await S.until(() => fs.existsSync(gate), {timeoutMs: 180000, intervalMs: 50, label: "post-admission barrier"});
    const competitor = await cand.rpc("agent", {sessionKey: B_KEY, agentId: S.AGENT, message: `请用 exec 执行 \`sleep 20 && date\`，然后只回复「${tag}-R 完成」。`, deliver: false, idempotencyKey: `gap-${tag}`});
    await S.until(async () => {
      const h = await transcript(cand, B_KEY, t0);
      return S.toolCalls(h).some(x => /sleep 20/u.test(x.command ?? ''));
    }, {timeoutMs: 45000, intervalMs: 250, label: "competing RPC actually executing"});
    fs.writeFileSync(gate + ".release", "release");
    await waitSettled(cand, [send.sendId]);
    const s = cand.ledger().sends.find(x => x.sendId === send.sendId);
    const h = await transcript(cand, B_KEY, t0);
    const observed = JSON.parse(fs.readFileSync(gate + ".observed", "utf8"));
    const priorReply = h.find(m => m.role === "assistant" && m.text.includes(`${tag}-R 完成`));
    const request = h.find(m => isInter(m, `:req:${s.sendId}`));
    r.evidence = {barrier: observed, competitor, sends: [reduceSend(s)], transcripts: {groupB: h}};
    check(r, "competing-run-present-after-admission", observed.active, observed);
    // A queued turn may already have a persisted inbound timestamp. Its actual execution
    // start must follow the competing run's final reply; timestamps of input are not starts.
    check(r, "RPC-finishes-before-request-start", Boolean(priorReply && request && priorReply.atMs <= s.targetRun?.startedAt), {prior: priorReply?.at, requestInput: request?.at, requestStart:S.iso(s.targetRun?.startedAt)});
    check(r, "request-not-steered-into-RPC", !h.filter(m => m.atMs < (priorReply?.atMs ?? 0) && m.role === 'user').some(m => isInter(m, `:req:${s.sendId}`)), null);
    check(r, "request-returned-after-RPC", s.phase === 'handed_back' && s.result?.text?.includes(tag), s.phase);
    expectTargetSide(r, {send: s, chat: GROUP_B, from: t0, to: Date.now()});
  } finally { fs.writeFileSync(gate + ".release", "release"); await cand.stop(); await cand.start(); }
}

async function taskRoomScenario(ctx, restart) {
  const {cand, r, tag, t0} = ctx;
  assert(cand.fake, "Task Room acceptance currently requires the no-network creation shim");
  const coordinator = restart ? B_KEY : dmKey();
  const helper = '.agents/skills/feishu-task-room-router/scripts/create_task_room.py';
  const token = `${tag}-answer-739`;
  const mixed = process.env.ISC_TASKROOM_MIXED === '1';
  const other = cand.harness === 'worker' ? S.HARNESS_MODELS.vds : S.HARNESS_MODELS.worker;
  const roomModels = [mixed ? other : cand.model, cand.model, mixed ? other : cand.model];
  for (let i=0;i<3;i++) assert((await cand.ensureSession(ROOM_KEYS[i], {model:roomModels[i]})).ok, 'pin Task Room model');
  const commands = ['a', 'b', 'c'].map((x,i) => `python3 ${helper} --name '${tag}-${x}' --model '${roomModels[i]}' --no-pin --bot-app-id cli_0000000000000000 --user-open-id ${OWNER}`).join(' ; ');
  const tasks = `先用 exec 执行以下三个创建房间的命令（测试 shim 只返回房间，不联网）：${commands}。然后同一轮用 sessions_send(timeoutSeconds=0) 给返回的三个房间分别派活：房间1 ${ROOM_KEYS[0]} 先当场问房间2 ${ROOM_KEYS[1]}（timeoutSeconds=120）：你从协调者拿到的口令是什么？最终回复包含 ${tag}-a 和口令；房间2 ${ROOM_KEYS[1]} 先当场问协调者 ${coordinator}（timeoutSeconds=120）口令是什么，口令为 ${token}，拿到后用 exec 执行 sleep 15，再回复 ${tag}-b 和口令；房间3 ${ROOM_KEYS[2]} 用 exec 执行 sleep ${restart ? 180 : 90}，然后回复 ${tag}-c 完成。三件结果回来后汇总一次，逐项报告成功或中断，必须包含三个验收码和已拿到的口令；不要重新派失败项。`;
  const prompt = restart ? `请把下面整件事交给${keyLine(GROUP_B)}（不用等）：${tasks}。协调者完成后的汇总交回我。` : tasks;
  await cand.dm(dmPrompt(tag, prompt));
  const [top] = restart ? await waitSends(cand, {since: t0, targets: [B_KEY]}) : [];
  const rooms = await waitSends(cand, {since: t0, requesterKey: coordinator, targets: ROOM_KEYS, n: 3, timeoutMs: 300000});
  const asks = await S.until(() => {
    const a = cand.sendsWhere(s => s.createdAt >= t0 && s.edge === 'ask');
    return a.length >= 2 && a.every(s => s.phase === 'delivered_inline') ? a : null;
  }, {timeoutMs: 300000, intervalMs: 500, label: 'both Task Room inline questions answered'});
  if (restart) {
    r.evidence.beforeKill = rooms.map(s => reduceSend(cand.ledger().sends.find(x => x.sendId === s.sendId)));
    check(r, 'restart-interrupted-an-active-room', r.evidence.beforeKill.some(s => s.phase === 'running'), r.evidence.beforeKill.map(s => s.phase));
    r.evidence.kill = await cand.kill9(); await sleep(2000); r.evidence.restart = await cand.start();
  }
  await waitSettled(cand, [...(top ? [top.sendId] : []), ...rooms.map(s => s.sendId)], {timeoutMs: 720000});
  await sleep(6000);
  const L = cand.ledger();
  const records = rooms.map(s => L.sends.find(x => x.sendId === s.sendId));
  const batchIds = [...new Set(records.map(s => s.batchId))];
  const batch = cand.batch(batchIds[0]);
  const log = fs.readFileSync(path.join(cand.data, 'lark-shim.log'), 'utf8').trim().split('\n').map(JSON.parse).filter(x => Date.parse(x.at) >= t0);
  r.evidence.shim = log;
  r.evidence.sends = [...(top ? [reduceSend(L.sends.find(s => s.sendId === top.sendId))] : []), ...records.map(reduceSend), ...asks.map(reduceSend)];
  r.evidence.batches = [reduceBatch(batch)];
  r.evidence.roomModels = roomModels;
  r.evidence.roomEntries = await Promise.all(ROOM_KEYS.map(key => cand.sessionEntry(key)));
  if (mixed) check(r, 'both-harnesses-executed', r.evidence.roomEntries.some(e => e?.agentHarnessId === 'codex') && r.evidence.roomEntries.some(e => e?.agentHarnessId === 'vlab-worker'), r.evidence.roomEntries.map(e => ({model:e?.model,harness:e?.agentHarnessId})));
  const h = await transcript(cand, dmKey(), t0);
  r.evidence.transcripts = {dm: h, coordinator: await transcript(cand, coordinator, t0)};
  const outcome = top ? L.sends.find(s => s.sendId === top.sendId).result?.text ?? '' : h.filter(m => m.role === 'assistant').at(-1)?.text ?? '';
  check(r, 'created-three-distinct-rooms-through-shim', log.filter(x => x.result === 'created').length === 3 && new Set(log.filter(x => x.result === 'created').map(x => x.chatId)).size === 3, log.map(x => ({result:x.result, chat:x.chatId})));
  check(r, 'room-creation-never-used-network', log.length >= 3 && log.every(x => x.network === 'none'), log.map(x => x.network));
  check(r, 'a-asked-b-and-b-asked-coordinator', asks.some(s => s.requester.sessionKey === ROOM_KEYS[0] && s.target.sessionKey === ROOM_KEYS[1]) && asks.some(s => s.requester.sessionKey === ROOM_KEYS[1] && s.target.sessionKey === coordinator), asks.map(s => ({from:s.requester.sessionKey,to:s.target.sessionKey})));
  check(r, 'questions-returned-the-actual-token', asks.every(s => s.result?.text?.includes(token)), asks.map(s => s.result?.text));
  check(r, 'three-rooms-one-batch-one-wake', batchIds.length === 1 && batch?.phase === 'woken' && batch.wake?.attempt <= (restart ? 1 : 0), batch?.wake);
  if (top) {
    const parent = L.sends.find(s => s.sendId === top.sendId);
    check(r, 'parent-result-from-collecting-wake', parent.result?.fromRunId === batch?.wake?.runId && (parent.history??[]).some(h=>h.phase==='awaiting_children'), {from:parent.result?.fromRunId,wake:batch?.wake?.runId});
  }
  check(r, 'final-summary-includes-every-room', ['-a','-b','-c'].every(s => outcome.includes(tag+s)) && outcome.includes(token), outcome);
  check(r, 'rooms-all-terminal', records.every(s => TERMINAL.includes(s.phase)), records.map(s => s.phase));
  const end = Date.now();
  records.forEach(s => expectTargetSide(r, {send:s, chat:ROOMS[ROOM_KEYS.indexOf(s.target.sessionKey)],from:t0,to:end}));
  asks.forEach(s => expectTargetSide(r, {send:s, chat:s.target.sessionKey === coordinator ? (restart ? GROUP_B : DM_CHAT) : ROOMS[1], icon:'❓',from:t0,to:end}));
  const root = top ? L.sends.find(s => s.sendId === top.sendId) : null;
  expectHandback(r, {batch: root ? cand.batch(root.batchId) : batch, sends:root ? [root] : records, from:t0,to:end,single:Boolean(root)});
}

async function raceScenario(ctx, competitor) {
  const { cand, r, tag, t0 } = ctx;
  const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 回复一句「${tag} 收到」（不用等它，交出去就行）`));
  r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
  const [send] = await waitSends(cand, { since: t0, targets: [B_KEY] });
  const starting = await S.until(() => { const x = cand.ledger().sends.find((y) => y.sendId === send.sendId); return x?.phase === "starting" ? x : x && TERMINAL.includes(x.phase) ? "late" : null; }, { timeoutMs: 300_000, intervalMs: 100, label: "engine starting (delay window)" });
  assert(starting !== "late", "the send finished before the start window was seen");
  r.evidence.windowSeenAt = iso(Date.now());
  if (competitor === "human") {
    const human = await cand.humanInGroup(GROUP_B, { text: `【测试 ${tag}-H】请用 exec 执行 \`sleep 20 && date\`，然后回复「${tag}-H 完成」。` });
    r.evidence.injected.push({ chat: GROUP_B, messageId: human.messageId, seed: human.seed, at: iso(human.at) });
  } else {
    assert(cand.allowance.admissionBusy, 'F3b-rpc requires the recorded candidate-only admission barrier');
    const gate = path.join(cand.data, 'admission-busy-barrier');
    await S.until(() => fs.existsSync(gate), {timeoutMs:15000,intervalMs:25,label:'admission entered before RPC competitor'});
    const res = await cand.rpc("agent", { sessionKey: B_KEY, agentId: S.AGENT, message: `【测试 ${tag}-R】（后台 RPC 回合）请用 exec 执行 \`sleep 20 && date\`，然后回复「${tag}-R 完成」。`, deliver: false, idempotencyKey: `isc-${tag}-rpc` }, 60_000).catch((e) => ({ error: e.message }));
    r.evidence.rpc = JSON.parse(redact(JSON.stringify(res ?? null)));
    try {
      await S.until(async () => {
        const h = await transcript(cand, B_KEY, t0);
        return S.toolCalls(h).some(t => /sleep 20/u.test(t.command ?? ''));
      }, {timeoutMs:45000,intervalMs:250,label:'RPC actually active before bridge admission'});
      r.evidence.preStartBarrierTriggered = true;
    } finally { fs.writeFileSync(gate + '.release', 'release'); }
  }
  await waitSettled(cand, [send.sendId], { timeoutMs: 600_000 });
  await sleep(6_000);
  const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
  const b = s.batchId ? cand.batch(s.batchId) : null;
  // the next human message: its prompt must not carry the request as group history (A7)
  const next = await cand.humanInGroup(GROUP_B, { text: `【测试 ${tag}-N】只回复「${tag}-N 好」。` });
  r.evidence.injected.push({ chat: GROUP_B, messageId: next.messageId, seed: next.seed, at: iso(next.at) });
  await S.maybeUntil(async () => { const h = await transcript(cand, B_KEY, next.at); return Array.isArray(h) && h.some((m) => m.role === "assistant" && m.atMs > next.at) ? h : null; }, { timeoutMs: 240_000, intervalMs: 3_000 });
  await sleep(5_000);
  const end = Date.now();
  const bHist = await transcript(cand, B_KEY, t0);
  r.evidence.sends = [reduceSend(s)];
  r.evidence.batches = [reduceBatch(b)];
  r.evidence.transcripts = { groupB: bHist, dm: await transcript(cand, dmKey(), t0) };
  const busyLog = cand.logSince(0, new RegExp(`inter-session request ${s.sendId} attempt \\d+: .* is busy`, "u"), 10);
  r.evidence.busyLog = busyLog;
  const busyAttempts = (s.history ?? []).filter((h) => /busy/iu.test(h.note ?? "")).length;
  r.evidence.busy = { attempts: s.attempt, busyAttempts, busyLog: busyLog.length };
  if (competitor === "rpc") check(r, "BUSY-happened (G guard)", s.attempt >= 1 && busyLog.length >= 1, r.evidence.busy);
  else r.evidence.observation = s.attempt >= 1 ? "BUSY then retry (as the design expects)" : "no BUSY: the Feishu per-chat FIFO ran the human turn first and the start waited behind it";
  check(r, "retry-ran-with-its-own-runId", s.targetRun?.runId === preset("request", s), { runId: s.targetRun?.runId, attempt: s.attempt });
  check(r, "handed-back", s.phase === "handed_back", s.phase);
  const reqUsers = bHist.filter((m) => isInter(m, `:req:${s.sendId}`));
  check(r, "one-request-user-message", reqUsers.length === 1, reqUsers.length);
  const nextUser = bHist.find((m) => m.role === "user" && m.text.includes(`${tag}-N`));
  check(r, "next-human-prompt-without-request", Boolean(nextUser) && !nextUser.text.includes(`${tag} 收到`), nextUser?.text?.slice(0, 300));
  expectTargetSide(r, { send: s, chat: GROUP_B, from: t0, to: end });
  window(r, GROUP_B, t0, end);
  rb(r, { id: "no-fallback-text", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: "Something went wrong|出错了|处理失败|No response|没有生成回复", equals: 0 });
  rb(r, { id: "no-orphan-cards", chat: GROUP_B, kind: "orphans", from: t0, to: end, allowedParents: [s.request?.messageId, ...r.evidence.injected.filter((i) => i.chat === GROUP_B).map((i) => i.messageId)] });
  rb(r, { id: "no-typing-reaction-left-on-anchor", chat: GROUP_B, kind: "reactions", messageId: s.request?.messageId, equals: 0 });
  expectHandback(r, { batch: b, sends: [s], from: s.createdAt, to: end });
}

async function interjectScenario(ctx, who) {
  const { cand, r, tag, t0 } = ctx;
  const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 用 exec 执行 \`sleep 60 && date\`，然后把时间连同 ${tag} 回复出来（不用等它）`));
  r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
  const [send] = await waitSends(cand, { since: t0, targets: [B_KEY] });
  await S.until(() => { const x = cand.ledger().sends.find((y) => y.sendId === send.sendId); return x?.targetRun?.startedAt && Date.now() - x.targetRun.startedAt > 12_000 ? x : null; }, { timeoutMs: 300_000, intervalMs: 1_000, label: "collab turn running 12 s" });
  const inter = await cand.humanInGroup(GROUP_B, { sender: who, text: `【测试 ${tag}-I】插一句：结果开头请加上「插话已收到」。` });
  r.evidence.injected.push({ chat: GROUP_B, messageId: inter.messageId, seed: inter.seed, at: iso(inter.at), sender: who === OWNER ? "owner" : "non-owner" });
  await waitSettled(cand, [send.sendId], { timeoutMs: 600_000 });
  await S.maybeUntil(async () => {
    const h = await transcript(cand, B_KEY, inter.at);
    const result = cand.ledger().sends.find(s => s.sendId === send.sendId)?.result?.text ?? '';
    return (Array.isArray(h) && h.some(m => m.role === 'user' && m.text.includes(`${tag}-I`))) || (who === OWNER && result.includes('插话已收到'));
  }, { timeoutMs: 240_000, intervalMs: 3_000 });
  await sleep(20_000);
  const s = cand.ledger().sends.find((x) => x.sendId === send.sendId);
  const b = s.batchId ? cand.batch(s.batchId) : null;
  const end = Date.now();
  const bHist = await transcript(cand, B_KEY, t0);
  r.evidence.sends = [reduceSend(s)];
  r.evidence.batches = [reduceBatch(b)];
  r.evidence.transcripts = { groupB: bHist, dm: await transcript(cand, dmKey(), t0) };
  const interUser = bHist.find((m) => m.role === "user" && m.text.includes(`${tag}-I`));
  // Input timestamps are stamped on receive, even for a queued turn. Inspect committed
  // transcript order and the handed-back result to distinguish queueing from steering.
  const interIndex = bHist.indexOf(interUser);
  const resultIndex = bHist.findIndex(m => m.role === 'assistant' && s.result?.text && m.text.trim() === s.result.text.trim());
  const userAfterResult = interIndex >= 0 && resultIndex >= 0 ? interIndex > resultIndex : undefined;
  const proof = S.interjectionProof({owner:who === OWNER,user:interUser,userAfterResult,resultText:s.result?.text});
  const {absorbedInResult,steered} = proof;
  r.evidence.behaviour = { steeredIntoCollabTurn: steered, interjectionAt: interUser?.at, interIndex, resultIndex, userAfterResult, collabEnded: iso(s.targetRun?.endedAt), resultMentionsIt: (s.result?.text ?? "").includes("插话已收到") };
  check(r, "result-handed-back-once", s.phase === "handed_back" && b?.phase === "woken" && b.wake?.attempt === 0, { phase: s.phase, wake: b?.wake });
  if (who !== OWNER) check(r, "non-owner-not-steered", proof.nonOwnerIsolated, r.evidence.behaviour);
  check(r, "interjection-handled", proof.handled, {transcriptUser:Boolean(interUser),absorbedInResult});
  expectTargetSide(r, { send: s, chat: GROUP_B, from: t0, to: end });
  window(r, GROUP_B, t0, end);
  rb(r, { id: "interjection-answer-visible", chat: GROUP_B, kind: "count", from: inter.seed.createMs, to: end, senderType: "app", min: 1 });
  expectHandback(r, { batch: b, sends: [s], from: s.createdAt, to: end });
}

/** What the Gateway logged while it came back (to see what a slow start waited for). */
function restartLog(cand, mark) {
  return cand.logSince(mark, /^(?!.*firsttext-(metrics|worker-phases)).*(feishu|gateway|plugins|restart|recovery|ingress|dedup|integrity|lease|bot open_id|Webhook|bridge|channel|warn|error|Error)/iu, 300);
}

async function crashScenario(ctx, phase) {
  const { cand, r, tag, t0 } = ctx;
  await cand.stop();
  r.evidence.crashStart = await cand.start({ extraEnv: { VSR_CRASH_AT: phase } });
  const ev = await cand.dm(dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 用 exec 执行 \`sleep 20 && date\`，然后把时间连同 ${tag} 回复出来（不用等它）`));
  r.evidence.injected = [{ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) }];
  r.evidence.crash = await cand.waitExit(600_000);
  ctx.step(`${tag}: Gateway exited`, r.evidence.crash);
  r.evidence.crashLog = cand.logSince(0, /VSR_CRASH_AT/u, 5);
  check(r, "crashed-at-phase", r.evidence.crashLog.some((l) => l.includes(`VSR_CRASH_AT=${phase}`)), r.evidence.crashLog);
  const bootMark = cand.mark();
  r.evidence.restart = await cand.start({ extraEnv: { VSR_CRASH_AT: null } });
  r.evidence.restartLog = restartLog(cand, bootMark);
  // The original request only: a wake turn may legitimately send again after an "interrupted" result
  // (the wake prompt suggests 「接着把 #code 做完」), which is a new request, not a duplicate.
  const sends = cand.sendsWhere((x) => x.createdAt >= t0 && x.target?.sessionKey === B_KEY && x.requester?.runRole !== "wake");
  check(r, "one-record", sends.length === 1, sends.map((s) => s.sendId));
  if (!sends.length) return;
  await waitSettled(cand, [sends[0].sendId], { timeoutMs: 720_000, labelText: "recovered send settled" });
  await sleep(8_000);
  const s = cand.ledger().sends.find((x) => x.sendId === sends[0].sendId);
  const b = s.batchId ? cand.batch(s.batchId) : null;
  const end = Date.now();
  const dmHist = await transcript(cand, dmKey(), t0);
  r.evidence.sends = [reduceSend(s)];
  r.evidence.batches = [reduceBatch(b)];
  r.evidence.transcripts = { dm: dmHist, groupB: await transcript(cand, B_KEY, t0) };
  const wakes = dmHist.filter((m) => isInter(m, `:wake:${b?.batchId}`));
  check(r, "wake-at-most-once", wakes.length <= 1 && (b?.phase === "woken" || b?.phase === "skipped"), { wakes: wakes.length, batch: b?.phase });
  check(r, "send-closed", TERMINAL.includes(s.phase), s.phase);
  window(r, GROUP_B, t0, end);
  rb(r, { id: "anchor-not-duplicated", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: `^📨.*#${s.code}`, max: 1 });
  window(r, DM_CHAT, t0, end);
  rb(r, { id: "handback-at-most-once", chat: DM_CHAT, kind: "count", from: t0, to: end, textRe: `^(↩️|⚠️|⏹).*#${s.code}`, max: 1 });
}

// =====================================================================================================
// on the Mac: verify (owner readback) and watch
// =====================================================================================================
function argOf(args, name, dflt) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; }

function loadSummary(receiptPath) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const out = String(receipt.outcome?.stdout ?? "");
  const line = out.split("\n").reverse().find((l) => l.startsWith("{\"kind\":\"inter-session-feishu\""));
  assert(line, `no inter-session summary in ${receiptPath} (exit ${receipt.outcome?.code})`);
  return { receipt, summary: JSON.parse(line) };
}

async function verify(args) {
  const receiptPath = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  assert(receiptPath, "usage: verify <receipt.json> [--watch file.jsonl] [--out file.json]");
  const { receipt, summary } = loadSummary(receiptPath);
  if (summary.platform?.mode === "mock") {
    for (const r of summary.results) console.log(`${r.verdict.toUpperCase()} ${r.tag}`);
    assert(summary.ok, "mock candidate failed; inspect its internal and platform checks");
    return;
  }
  const watchFile = argOf(args, "--watch");
  const watchIndex = new Map();
  if (watchFile && fs.existsSync(watchFile)) {
    for (const line of fs.readFileSync(watchFile, "utf8").split("\n").filter(Boolean)) {
      const snap = JSON.parse(line);
      for (const m of snap.messages) { if (!watchIndex.has(snap.chat)) watchIndex.set(snap.chat, []); watchIndex.get(snap.chat).push({ ...m, seenAt: snap.at }); }
    }
  }
  const windows = {};
  for (const r of summary.results) for (const [chat, w] of Object.entries(r.readback?.windows ?? {})) windows[chat] = { from: Math.min(windows[chat]?.from ?? w.from, w.from) - 60_000, to: Math.max(windows[chat]?.to ?? w.to, w.to) + 120_000 };
  const chats = {};
  for (const [chat, w] of Object.entries(windows)) chats[chat] = S.readChat(chat, w.from, w.to);
  const out = { candidateId: receipt.id, runTag: summary.runTag, variant: summary.variant, harness: summary.harness, envMode: summary.envMode, files: receipt.files, sharedUnchanged: receipt.sharedUnchanged, exit: receipt.outcome?.code, requesterTail: summary.requesterTail, scenarios: [] };
  for (const r of summary.results) {
    const rbResults = (r.readback?.checks ?? []).map((spec) => {
      const res = S.evalReadbackCheck(spec, chats[spec.chat] ?? [], watchIndex);
      return { id: spec.id, chat: CHAT_NAMES[spec.chat] ?? spec.chat, ok: res.ok, optional: Boolean(spec.optional), detail: res.detail };
    });
    const hard = [...r.checks.map((c) => c.ok), ...rbResults.filter((x) => !x.optional).map((x) => x.ok)];
    const verdict = r.error ? "error" : hard.every((x) => x === true) ? "pass" : "fail";
    out.scenarios.push({ id: r.id, tag: r.tag, verdict, requesterTailMs: r.requesterTailMs ?? null, inCandidate: r.checks, readback: rbResults, error: r.error ?? null, observation: r.evidence?.observation ?? r.evidence?.behaviour ?? null });
  }
  out.readbackCounts = Object.fromEntries(Object.entries(chats).map(([c, ms]) => [CHAT_NAMES[c] ?? c, ms.length]));
  out.messages = Object.fromEntries(Object.entries(chats).map(([c, ms]) => [CHAT_NAMES[c] ?? c, ms.map((m) => ({ id: m.id, at: iso(m.createMs), upd: m.updated ? iso(m.updateMs) : undefined, type: m.type, parent: m.parentId, sender: m.senderType, text: m.text.slice(0, 160) }))]));
  const outFile = argOf(args, "--out") ?? path.join(REPO, "tmp", "inter-session-e2e", `${receipt.id}.verify.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  for (const s of out.scenarios) {
    console.log(`${s.verdict.toUpperCase().padEnd(5)} ${s.tag}${s.requesterTailMs != null ? `  tail=${s.requesterTailMs}ms` : ""}`);
    for (const c of [...s.inCandidate, ...s.readback]) if (c.ok !== true) console.log(`   ${c.ok === null ? "?" : "x"} ${c.id}${c.chat ? ` [${c.chat}]` : ""}${c.optional ? " (optional)" : ""}: ${JSON.stringify(c.detail ?? null).slice(0, 300)}`);
    if (s.error) console.log(`   error: ${s.error.split("\n")[0]}`);
  }
  console.log(`tail: ${JSON.stringify(out.requesterTail)}`);
  console.log(`written ${outFile}`);
}

async function watch(args) {
  const outFile = argOf(args, "--out");
  assert(outFile, "usage: watch --out <file.jsonl> [--interval 15] [--minutes 90]");
  const interval = Number(argOf(args, "--interval", 15)) * 1000;
  const until = Date.now() + Number(argOf(args, "--minutes", 90)) * 60_000;
  const start = Date.now() - 120_000;
  const last = new Map();
  while (Date.now() < until) {
    for (const chat of [DM_CHAT, GROUP_B, ...ROOMS]) {
      try {
        const msgs = S.readChat(chat, start).map((m) => ({ id: m.id, createMs: m.createMs, updateMs: m.updateMs, type: m.type, parentId: m.parentId, text: m.text.slice(0, 600) }));
        const sig = JSON.stringify(msgs.map((m) => [m.id, m.updateMs, m.text.length]));
        if (last.get(chat) !== sig) { last.set(chat, sig); fs.appendFileSync(outFile, `${JSON.stringify({ at: Date.now(), chat, messages: msgs })}\n`); }
      } catch (e) { fs.appendFileSync(outFile, `${JSON.stringify({ at: Date.now(), chat, error: String(e.message).slice(0, 200), messages: [] })}\n`); }
    }
    await sleep(interval);
  }
}

// =====================================================================================================
// plans
// =====================================================================================================
function writePlans() {
  const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "tests/fixtures/inter-session-v-bytes.json"), "utf8"));
  const before = (file) => fixture.files.find((f) => f.file === file).sha256;
  const FEISHU = "npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js";
  const core = [
    ["lab/release-files/sessions-send-relay/generated/sessions-spawn-tool-1FQMTkIo.js", "openclaw/dist/sessions-spawn-tool-1FQMTkIo.js"],
    ["lab/release-files/sessions-send-relay/generated/openclaw-tools-BODVdJQD.js", "openclaw/dist/openclaw-tools-BODVdJQD.js"],
    ["lab/release-files/inter-session-admission/generated/get-reply-CqW1y05D.js", "openclaw/dist/get-reply-CqW1y05D.js"],
    ["lab/release-files/inter-session-admission/generated/agent-runner.runtime-CAdsMsQt.js", "openclaw/dist/agent-runner.runtime-CAdsMsQt.js"],
    ["lab/release-files/inter-session-admission/generated/dispatch-from-config-DOJq_7CI.js", "openclaw/dist/dispatch-from-config-DOJq_7CI.js"],
    ["lab/release-files/task-bridge-extra-sources/generated/task-registry-activity-DSlVVJwD.js", "openclaw/dist/task-registry-activity-DSlVVJwD.js"],
    ["lab/release-files/feishu-inter-session-bridge/generated/monitor.account-WFdlCDhR.js", FEISHU],
  ].map(([source, target]) => ({ source, target, before: before(path.basename(target)) }));
  const pluginRoot = "apps/v-session-relay/plugin";
  const pluginFiles = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "tests") walk(p); } else pluginFiles.push(p);
    }
  };
  walk(pluginRoot);
  const plugin = pluginFiles.map((source) => ({ source, target: `extensions/v-session-relay/${source.slice(pluginRoot.length + 1)}`, before: null }));
  const drafts = JSON.parse(fs.readFileSync("/Users/tianyicai/v-openclaw-platform/.claude/worktrees/isc-wp9-private/plan-support.json", "utf8")).support;
  const stockWs = "/Users/tianyicai/v-openclaw-platform/.claude/worktrees/isc-e2e-feishu-private";
  const stockSupport = drafts.filter((p) => !p.endsWith(".diff")).map((p) => p.replace("/isc-wp9-private/", "/isc-e2e-feishu-private/"));
  assert(fs.existsSync(path.join(stockWs, "inter-session-workspace.manifest.json")), "stock workspace manifest missing (node lab/candidate/inter-session-workspace.mjs manifest --private-dir <private> --drafts none)");
  const base = ["lab/candidate/inter-session-feishu.mjs", "lab/candidate/inter-session-support.mjs", "lab/candidate/feishu-fake-open-api.mjs", "lab/candidate/feishu-no-live.cjs", "tests/fixtures/inter-session-v-bytes.json"];
  const NODE = "/opt/vlab/node-v22.23.1-linux-x64/bin/node";
  const plan = ({ env, files, support, timeoutSeconds = 7200 }) => ({ support: [...base, ...support], files, command: [NODE, "lab/candidate/inter-session-feishu.mjs", "run"], env: {ISC_FEISHU_MODE: 'mock', ...env}, timeoutSeconds, user: "lab-db91-parity" });
  const plans = {
    "inter-session-feishu-v-env.plan.json": plan({ env: { ISC_VARIANT: "full", ISC_ENV: "v", RELAY_HARNESS: "worker", ISC_SCENARIOS: "F1i,F1,F2,F3,F7,F13" }, files: [...core, ...plugin], support: drafts }),
    "inter-session-feishu-vlab-env.plan.json": plan({ env: { ISC_VARIANT: "full", ISC_ENV: "vlab", RELAY_HARNESS: "worker", ISC_SCENARIOS: "F1i,F2,F3" }, files: [...core, ...plugin], support: drafts }),
    "inter-session-control-stock.plan.json": plan({ env: { ISC_VARIANT: "stock", ISC_ENV: "v", RELAY_HARNESS: "worker", ISC_SCENARIOS: "C1,C2,C3" }, files: [], support: stockSupport, timeoutSeconds: 3600 }),
    "inter-session-control-fallback.plan.json": plan({ env: { ISC_VARIANT: "fallback", ISC_ENV: "v", RELAY_HARNESS: "worker", ISC_SCENARIOS: "CF2" }, files: [...core, ...plugin], support: drafts, timeoutSeconds: 3600 }),
    "inter-session-crash.plan.json": plan({ env: { ISC_VARIANT: "full", ISC_ENV: "v", RELAY_HARNESS: "worker", ISC_SCENARIOS: "F5,F6-posting,F6-running,F6-waking" }, files: [...core, ...plugin], support: drafts }),
    "inter-session-tail.plan.json": plan({ env: { ISC_VARIANT: "full", ISC_ENV: "v", RELAY_HARNESS: "worker", ISC_SCENARIOS: "F2", ISC_REPEAT: "5" }, files: [...core, ...plugin], support: drafts }),
  };
  for (const [name, p] of Object.entries(plans)) fs.writeFileSync(path.join(HERE, name), `${JSON.stringify(p, null, 2)}\n`);
  console.log(`wrote ${Object.keys(plans).join(", ")} (${core.length} core/Feishu files, ${plugin.length} plugin files)`);
}

// ---------------------------------------------------------------- control groups (V's bytes / plugin off)
// C1–C3 = F1i, F2, F3 run on V's unpatched bytes with V's own workspace (C-stock); CF2 = F2 with the
// R1 patches but the plugin disabled (C-fallback). They assert the OLD behaviour: no visible request,
// no visible reply from the target, and how long the requester waited / whether it polled.
Object.assign(SCENARIOS, {
  C1: { async run(ctx) { await controlScenario(ctx, "inline"); } },
  C2: { async run(ctx) { await controlScenario(ctx, "async"); } },
  C3: { async run(ctx) { await controlScenario(ctx, "busy"); } },
  CF2: { async run(ctx) { await controlScenario(ctx, "async", { fallback: true }); } },
});

async function controlScenario(ctx, kind, { fallback = false } = {}) {
  const { cand, r, tag, t0 } = ctx;
  let human = null;
  if (kind === "busy") {
    human = await cand.humanInGroup(GROUP_B, { text: `【测试 ${tag}-H】请用 exec 执行 \`sleep 60 && date\`，然后回复「${tag}-H 完成」和时间。` });
    r.evidence.injected = [{ chat: GROUP_B, messageId: human.messageId, seed: human.seed, at: iso(human.at) }];
    await S.until(async () => { const h = await transcript(cand, B_KEY, t0); return Array.isArray(h) && h.some((m) => m.role === "user" && m.text.includes(`${tag}-H`)); }, { timeoutMs: 120_000, intervalMs: 1_000, label: "human turn started" });
    await sleep(5_000);
  }
  const text = kind === "inline"
    ? dmPrompt(tag, `用 sessions_send 当场问${keyLine(GROUP_B)}里的 V（timeoutSeconds=120，等它回答）：给「v2.3 上线通知」起一个 10 字以内的标题，回答开头写上 ${tag}。拿到回答后把标题告诉我`)
    : kind === "busy"
      ? dmPrompt(tag, `请让${keyLine(GROUP_B)}里的 V 回复一句「${tag} 收到」（不用等它，交出去就行）`)
      : dmPrompt(tag, `把这件事交给${keyLine(GROUP_B)}里的 V：用 exec 执行 \`sleep 75 && date\`，然后把输出的时间连同 ${tag} 回复出来。`);
  const ev = await cand.dm(text);
  (r.evidence.injected ??= []).push({ chat: DM_CHAT, messageId: ev.messageId, at: iso(ev.at) });
  // the requester's turn: wait until the DM transcript shows a sessions_send result and the turn is quiet
  const toolSeen = await S.maybeUntil(async () => { const h = await transcript(cand, dmKey(), t0); return Array.isArray(h) && h.some((m) => m.role === "toolResult" && /sessions_send/u.test(m.toolName ?? "")) ? h : null; }, { timeoutMs: 360_000, intervalMs: 3_000 });
  check(r, "requester-called-sessions_send", Boolean(toolSeen), Boolean(toolSeen));
  // let the old path run out: the target turn, the old in-process wait, any wake turn
  await S.maybeUntil(async () => {
    const h = await transcript(cand, B_KEY, t0);
    return Array.isArray(h) && h.some((m) => m.role === "assistant" && m.text.includes(tag)) ? h : null;
  }, { timeoutMs: kind === "inline" ? 240_000 : 360_000, intervalMs: 5_000 });
  await sleep(kind === "async" ? 150_000 : 60_000);
  const end = Date.now();
  const dmHist = await transcript(cand, dmKey(), t0);
  const bHist = await transcript(cand, B_KEY, t0);
  r.evidence.transcripts = { dm: dmHist, groupB: bHist };
  const sendCall = dmHist.find((m) => (m.tools ?? []).some((t) => t.name === "sessions_send"));
  const turnEnd = (() => { const after = dmHist.filter((m) => m.atMs >= (sendCall?.atMs ?? t0)); const firstInter = after.findIndex((m) => m.role === "user"); const own = firstInter >= 0 ? after.slice(0, firstInter) : after; return Math.max(...own.map((m) => m.atMs).filter(Number.isFinite)); })();
  r.evidence.requesterWaitMs = sendCall ? turnEnd - sendCall.atMs : null;
  r.evidence.requesterTools = requesterTools(dmHist, t0, turnEnd);
  r.evidence.polling = r.evidence.requesterTools.filter((t) => (t.command && S.SLEEP_RE.test(t.command)) || /sessions_history|session_status/u.test(t.name)).length;
  const sessionsSendCalls = r.evidence.requesterTools.filter((t) => t.name === "sessions_send");
  r.evidence.timeoutSeconds = sessionsSendCalls.map((t) => t.timeoutSeconds ?? "default(30)");
  if (fallback) {
    // The console line drops the log call's meta; the JSON file log carries the error text the
    // core matched against RELAY_FALLBACK_RE (A4).
    const fb = cand.logSince(0, /vrelay absent; sessions_send uses v2/u, 5);
    const fbFile = cand.fileLogGrep(/vrelay absent; sessions_send uses v2/u, 5);
    r.evidence.fallbackLog = fb;
    r.evidence.fallbackFileLog = fbFile;
    check(r, "fallback-logged", fb.length >= 1, fb);
    check(r, "fallback-error-text-matches-regex", fbFile.length >= 1 && /missing scope: operator\.admin|unknown method: vrelay\.send/u.test(fbFile.join("\n")), fbFile);
    check(r, "no-ledger", cand.ledger().sends.length === 0, cand.ledger().sends.length);
  }
  const targetAnswered = bHist.some((m) => m.role === "assistant" && m.text.includes(tag));
  r.evidence.targetAnsweredInTranscript = targetAnswered;
  r.evidence.legacy = {
    "(1) request-invisible": "readback: no 📨 in the target chat",
    "(2) reply-invisible-or-not-streamed": "readback: the target's answer is in its transcript, not in its chat (or only as a final post)",
    "(3) requester-waits-or-polls": { waitMs: r.evidence.requesterWaitMs, polling: r.evidence.polling, timeoutSeconds: r.evidence.timeoutSeconds },
  };
  window(r, GROUP_B, t0, end);
  window(r, DM_CHAT, t0, end);
  rb(r, { id: "legacy-1-no-visible-request", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: "^(📨|❓)", equals: 0 });
  rb(r, { id: "legacy-2-target-answer-not-in-chat", chat: GROUP_B, kind: "count", from: t0, to: end, textRe: `^(?!【测试).*${tag}(?!-H)`, senderType: "app", equals: 0, optional: kind === "busy" });
  rb(r, { id: "info-dm-messages", chat: DM_CHAT, kind: "count", from: t0, to: end, senderType: "app", min: 0, optional: true });
}

// ---------------------------------------------------------------- entry (last: SCENARIOS must be initialized)
const mode = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "run";
if (mode === "run") await runInCandidate();
else if (mode === "verify") await verify(process.argv.slice(3));
else if (mode === "watch") await watch(process.argv.slice(3));
else if (mode === "plans") writePlans();
else throw new Error(`unknown mode ${mode}`);
