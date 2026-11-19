// One meeting. Polls the meeting's events (subtitles, chat, join/leave), hands new lines to the
// full V in the bound session as one turn, and posts a non-silent answer to the meeting chat and
// the bound chat. Polling never waits for V: lines that arrive during a turn queue up and go out
// together in the next one.
//
// While a turn runs and V has not said anything yet, the bridge shows that V is on it: a reaction
// after `progressReactMs`, a short line after `stillWorkingMs`. V can speak earlier itself through
// meeting_say (see prompts.js).

import crypto from "node:crypto";
import path from "node:path";

import { LarkCliError } from "./lark.js";
import { COPY, briefPrompt, isSilent, turnPrompt } from "./prompts.js";
import { appendLines, writeFileEnsured } from "./store.js";

export const DEFAULT_TIMING = Object.freeze({
  pollMs: 2_000,
  joinRetryMs: 10_000,
  progressReactMs: 12_000,
  stillWorkingMs: 60_000,
  maxMinutes: 180,
  maxPollFailures: 60,
});

const KEEP_SEEN = 3_000;
const KEEP_SENT = 200;
const KEEP_STATS = 300;
const BOT_USER_TYPE = 10;

const hhmmss = (iso, fallbackMs) => {
  const ms = Date.parse(iso);
  const d = new Date(Number.isFinite(ms) ? ms : fallbackMs);
  return d.toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
};
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const push = (arr, v, keep) => { arr.push(v); if (arr.length > keep) arr.splice(0, arr.length - keep); };

const dateTag = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

/** Where a meeting's transcript lives: next to the agent's memory, found by memory_search. */
export const transcriptDirFor = (workspaceDir, meetingId, ms) => path.join(workspaceDir, "memory/projects/meetings/sessions", `${dateTag(ms)}_${meetingId}`);

export function newRecord({ meetingNumber, meetingId, sessionKey, agentId, delivery, workspaceDir, transcriptDir, now = Date.now(), joinWaitMinutes = 0, maxMinutes = DEFAULT_TIMING.maxMinutes }) {
  return {
    id: meetingId ?? `pending-${meetingNumber}-${now}`,
    meetingId: meetingId ?? null,
    meetingNumber: String(meetingNumber ?? ""),
    status: meetingId ? "listening" : "joining",
    sessionKey, agentId: agentId ?? null,
    delivery: delivery ?? null,
    workspaceDir: workspaceDir ?? null,
    transcriptDir: transcriptDir ?? (meetingId && workspaceDir ? transcriptDirFor(workspaceDir, meetingId, now) : null),
    pageToken: null, seen: [], pending: [], sentIds: [], sentTexts: [], selfId: null,
    createdAt: now, joinedAt: meetingId ? now : null,
    joinDeadlineAt: now + joinWaitMinutes * 60_000,
    deadlineAt: now + maxMinutes * 60_000,
    endedAt: null, endReason: null, brief: null,
    stats: { turns: 0, replies: 0, silent: 0, errors: 0, says: 0, reacts: 0, turnMs: [], lagMs: [] },
  };
}

export class MeetingBridge {
  /**
   * deps: { lark, runTurn({sessionKey, message, idempotencyKey}) → {text, status, ms},
   *         postGroup(delivery, text), store, logger, timing, now, progressEmoji, onEnd(record) }
   */
  constructor(record, deps) {
    this.r = record;
    this.d = deps;
    this.t = { ...DEFAULT_TIMING, ...(deps.timing ?? {}) };
    this.now = deps.now ?? Date.now;
    this.turn = null;
    this.stopping = null;
    this.loopDone = null;
    this.pollFailures = 0;
    this.sleeper = null;
  }

  get id() { return this.r.id; }
  get active() { return this.r.status === "joining" || this.r.status === "listening"; }
  log(level, msg) { this.d.logger?.[level]?.(`v-meeting-bridge ${this.r.meetingId ?? this.r.meetingNumber}: ${msg}`); }
  save() { return this.d.store.save(this.r).catch((err) => this.log("warn", `save failed: ${err?.message ?? err}`)); }
  transcriptFile(name) { return this.r.transcriptDir ? path.join(this.r.transcriptDir, name) : null; }

  start() {
    this.loopDone ??= this.#loop().catch((err) => this.log("error", `loop crashed: ${err?.stack ?? err}`));
    return this.loopDone;
  }

  async #sleep(ms) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      this.sleeper = () => { clearTimeout(timer); resolve(); };
    });
    this.sleeper = null;
  }

  async #loop() {
    while (this.r.status === "joining" && !this.stopping) {
      let joined;
      try { joined = await this.#tryJoin(); } catch { return this.#fail("join_failed"); }
      if (joined) break;
      if (this.now() >= this.r.joinDeadlineAt) return this.#fail("join_timeout");
      await this.#sleep(this.t.joinRetryMs);
    }
    while (this.r.status === "listening" && !this.stopping) {
      if (this.now() >= this.r.deadlineAt) { void this.end("max_duration", { leave: true }); break; }
      await this.poll();
      this.#maybeStartTurn();
      if (this.r.status !== "listening" || this.stopping) break;
      await this.#sleep(this.t.pollMs);
    }
  }

  async #tryJoin() {
    try {
      const { meetingId } = await this.d.lark.join(this.r.meetingNumber);
      const old = this.r.id;
      Object.assign(this.r, { meetingId, id: meetingId, status: "listening", joinedAt: this.now() });
      if (!this.r.transcriptDir && this.r.workspaceDir) this.r.transcriptDir = transcriptDirFor(this.r.workspaceDir, meetingId, this.r.joinedAt);
      this.d.onRekey?.(old, this);
      await this.#writeHeader();
      await this.save();
      // Otherwise the provisional record would rejoin the meeting after the next Gateway restart.
      if (old !== this.r.id) await this.d.store.remove?.(old).catch(() => {});
      this.log("info", `joined meeting ${this.r.meetingNumber} → ${meetingId}, bound to ${this.r.sessionKey}`);
      return true;
    } catch (err) {
      if (err instanceof LarkCliError && err.code === "NOT_READY") {
        this.r.lastJoinError = String(err.message).slice(0, 300);
        return false;
      }
      this.r.lastJoinError = String(err?.message ?? err).slice(0, 300);
      if (this.now() < this.r.joinDeadlineAt) return false;
      throw err;
    }
  }

  async #writeHeader() {
    const file = this.transcriptFile("transcript.md");
    if (!file) return;
    await writeFileEnsured(file, `# 会议逐字（V meeting bridge）\n\nmeeting_id: ${this.r.meetingId}\n会议号: ${this.r.meetingNumber}\n来源会话: ${this.r.sessionKey}\n来源聊天: ${this.r.delivery?.channel ?? "?"} ${this.r.delivery?.to ?? ""}\n\n`)
      .catch((err) => this.log("warn", `transcript header: ${err?.message ?? err}`));
  }

  async poll() {
    const fetchedAt = this.now();
    let res;
    try {
      res = await this.d.lark.events(this.r.meetingId, this.r.pageToken);
      this.pollFailures = 0;
    } catch (err) {
      if (err instanceof LarkCliError && err.code === "MEETING_ENDED") { void this.end("meeting_ended"); return; }
      this.pollFailures += 1;
      if (this.pollFailures === 1 || this.pollFailures % 10 === 0) this.log("warn", `poll failed (${this.pollFailures}): ${err?.message ?? err}`);
      if (this.pollFailures >= this.t.maxPollFailures) void this.end("poll_failures");
      return;
    }
    if (res.pageToken) this.r.pageToken = res.pageToken;
    const fresh = await this.ingest(res.events, fetchedAt);
    if (fresh || res.pageToken) await this.save();
  }

  /** Returns how many new events were taken. Self echoes never reach V or the transcript twice. */
  async ingest(events, fetchedAt = this.now()) {
    const seen = new Set(this.r.seen);
    const rawLines = [];
    const textLines = [];
    let fresh = 0;
    for (const e of events ?? []) {
      const eid = e?.event_id;
      if (!eid || seen.has(eid)) continue;
      seen.add(eid);
      push(this.r.seen, eid, KEEP_SEEN);
      fresh += 1;
      rawLines.push(JSON.stringify({ ...e, _fetchedAt: new Date(fetchedAt).toISOString() }));
      const type = e.event_type;
      const p = e.payload ?? {};
      if (type === "transcript_received") {
        for (const it of p.transcript_received_items ?? []) {
          const sp = it.speaker ?? {};
          if (this.r.selfId && sp.id === this.r.selfId) continue;
          const endMs = Date.parse(it.end_time_ms ?? it.start_time_ms ?? e.event_time);
          const lagMs = Number.isFinite(endMs) ? Math.max(0, fetchedAt - endMs) : null;
          if (lagMs != null) push(this.r.stats.lagMs, lagMs, KEEP_STATS);
          const row = { t: hhmmss(it.start_time_ms ?? e.event_time, fetchedAt), who: sp.user_name ?? "?", text: it.text ?? "", kind: "speech", lagMs };
          this.r.pending.push(row);
          textLines.push(`- ${row.t} ${row.who}：${row.text}`);
        }
      } else if (type === "chat_received") {
        for (const it of p.chat_received_items ?? []) {
          const op = it.operator ?? {};
          const mine = (it.message_id && this.r.sentIds.includes(String(it.message_id)))
            || (op.user_type === BOT_USER_TYPE && this.r.sentTexts.includes(it.content));
          if (mine) { this.r.selfId ??= op.id ?? null; continue; }
          if (this.r.selfId && op.id === this.r.selfId) continue;
          const row = { t: hhmmss(it.send_time ?? e.event_time, fetchedAt), who: op.user_name ?? "?", text: it.content ?? "", kind: "chat" };
          textLines.push(`- ${row.t} ${row.who}：[聊天] ${row.text}`);
          if (op.user_type !== BOT_USER_TYPE) this.r.pending.push(row);
        }
      } else if (type === "participant_left") {
        if (this.r.selfId && (e.actors ?? []).some((a) => a?.id === this.r.selfId)) void this.end("removed");
      } else if (type === "participant_joined") {
        const bot = (e.actors ?? []).find((a) => a?.participant_type === "bot");
        const at = Date.parse(e.event_time);
        if (bot && !this.r.selfId && this.r.joinedAt && Number.isFinite(at) && at >= this.r.joinedAt - 15_000) this.r.selfId = bot.id ?? null;
      } else if (/meeting_end/u.test(String(type))) {
        void this.end("meeting_ended");
      }
    }
    await appendLines(this.transcriptFile("events.jsonl"), rawLines).catch(() => {});
    await appendLines(this.transcriptFile("transcript.md"), textLines).catch(() => {});
    return fresh;
  }

  #maybeStartTurn() {
    if (this.turn || !this.r.pending.length || this.r.status !== "listening") return;
    const batch = this.r.pending.splice(0);
    const turn = { id: crypto.randomUUID(), startedAt: this.now(), spoke: false, timers: [], batch };
    this.turn = turn;
    turn.promise = this.#runTurn(turn).finally(() => {
      for (const t of turn.timers) clearTimeout(t);
      if (this.turn === turn) this.turn = null;
      if (!this.stopping) this.#maybeStartTurn();
    });
  }

  #arm(turn, ms, fn) {
    if (!(ms > 0)) return;
    const timer = setTimeout(() => { if (this.turn === turn && !turn.spoke) void fn().catch(() => {}); }, ms);
    timer.unref?.();
    turn.timers.push(timer);
  }

  async #runTurn(turn) {
    const lines = turn.batch.map((r) => `${r.t} ${r.who}：${r.kind === "chat" ? "[聊天] " : ""}${r.text}`).join("\n");
    this.#arm(turn, this.t.progressReactMs, async () => {
      await this.d.lark.react(this.r.meetingId, this.d.progressEmoji ?? "OnIt");
      this.r.stats.reacts += 1;
    });
    this.#arm(turn, this.t.stillWorkingMs, () => this.say(COPY.stillWorking, { mirror: false }));
    const maxLag = Math.max(...turn.batch.map((r) => r.lagMs ?? 0));
    let res;
    try {
      res = await this.d.runTurn({ sessionKey: this.r.sessionKey, agentId: this.r.agentId, message: turnPrompt({ meetingId: this.r.meetingId, lines }), idempotencyKey: `vmb-${this.r.meetingId}-${turn.id}` });
    } catch (err) {
      res = { status: "error", error: String(err?.message ?? err) };
    }
    const ms = this.now() - turn.startedAt;
    this.r.stats.turns += 1;
    push(this.r.stats.turnMs, ms, KEEP_STATS);
    const record = { at: new Date().toISOString(), lines: turn.batch.length, turnMs: ms, maxSubtitleLagMs: maxLag, spokeEarly: turn.spoke };
    if (res?.status === "error" || res?.text == null) {
      this.r.stats.errors += 1;
      record.result = "error";
      record.error = String(res?.error ?? "no reply").slice(0, 300);
      this.log("warn", `V turn failed: ${record.error}`);
    } else if (isSilent(res.text)) {
      this.r.stats.silent += 1;
      record.result = "silent";
    } else {
      this.r.stats.replies += 1;
      record.result = "reply";
      await this.say(res.text.trim(), { mirror: true, fromTurn: true });
    }
    await appendLines(this.transcriptFile("v_turns.jsonl"), [JSON.stringify(record)]).catch(() => {});
    await this.save();
  }

  /** Post into the meeting chat (and the bound chat unless mirror is false). */
  async say(text, { mirror = true, fromTurn = false } = {}) {
    const body = String(text ?? "").trim();
    if (!body || !this.r.meetingId) return { sent: false };
    if (this.turn && !fromTurn) this.turn.spoke = true;
    push(this.r.sentTexts, body, KEEP_SENT);
    let messageId = null;
    let meetingError = null;
    // After meeting_leave (or the meeting ending) the last words only go to the chat: the meeting
    // answers 121011 "bot is not in the meeting".
    if (this.r.status !== "listening") meetingError = "not in the meeting";
    else try {
      ({ messageId } = await this.d.lark.sendText(this.r.meetingId, body, crypto.randomUUID()));
      if (messageId) push(this.r.sentIds, messageId, KEEP_SENT);
    } catch (err) {
      meetingError = String(err?.message ?? err);
      this.log("warn", `meeting send failed: ${meetingError}`);
    }
    if (!fromTurn) this.r.stats.says += 1;
    await appendLines(this.transcriptFile("transcript.md"), [`- ${hhmmss(null, this.now())} V：[聊天] ${body}`]).catch(() => {});
    let groupError = null;
    if (mirror && this.r.delivery?.to) {
      try { await this.d.postGroup(this.r.delivery, `${COPY.groupPrefix}${body}`); } catch (err) {
        groupError = String(err?.message ?? err);
        this.log("warn", `group mirror failed: ${groupError}`);
      }
    }
    return { sent: !meetingError, messageId, meetingError, groupError };
  }

  async screenshot() {
    if (!this.r.meetingId || !this.r.transcriptDir) throw new Error("no meeting or transcript dir");
    const name = `screenshots/${new Date(this.now()).toISOString().replace(/[:.]/gu, "-")}.jpg`;
    const res = await this.d.lark.screenshot(this.r.meetingId, { cwd: this.r.transcriptDir, output: name });
    return { path: res.path ?? path.join(this.r.transcriptDir, name) };
  }

  summary() {
    const s = this.r.stats;
    return {
      meetingId: this.r.meetingId, meetingNumber: this.r.meetingNumber, status: this.r.status, sessionKey: this.r.sessionKey,
      chat: this.r.delivery?.to ?? null, transcriptDir: this.r.transcriptDir, endReason: this.r.endReason, lastJoinError: this.r.lastJoinError ?? null,
      turns: s.turns, replies: s.replies, silent: s.silent, errors: s.errors, says: s.says, reacts: s.reacts,
      turnMsP50: pct(s.turnMs, 50), turnMsP95: pct(s.turnMs, 95),
      subtitleLagMsP50: pct(s.lagMs, 50), subtitleLagMsP95: pct(s.lagMs, 95),
      turnRunning: Boolean(this.turn), pendingLines: this.r.pending.length,
    };
  }

  async #fail(reason) {
    this.r.status = "failed";
    this.r.endReason = reason;
    this.r.endedAt = this.now();
    await this.save();
    this.log("warn", `gave up: ${reason} (${this.r.lastJoinError ?? ""})`);
    if (this.r.delivery?.to) await this.d.postGroup(this.r.delivery, `V 没能进入会议 ${this.r.meetingNumber}：${reason === "join_timeout" ? "等到超时，会议没开始，或主持人没打开「允许智能体入会」" : `入会失败（${String(this.r.lastJoinError ?? "").slice(0, 120)}）`}。`).catch(() => {});
    this.d.onEnd?.(this);
  }

  /** Stop listening, let the running turn finish, write the brief. Safe to call more than once. */
  end(reason, { leave = false } = {}) {
    this.stopping ??= this.#end(reason, leave);
    return this.stopping;
  }

  async #end(reason, leave) {
    const wasJoining = this.r.status === "joining";
    this.r.endReason = reason;
    this.r.status = "ending";
    this.sleeper?.();
    await this.save();
    if (wasJoining) {
      this.r.status = "ended";
      this.r.endedAt = this.now();
      await this.save();
      this.d.onEnd?.(this);
      return this.summary();
    }
    if (leave && this.r.meetingId) await this.d.lark.leave(this.r.meetingId).catch((err) => this.log("warn", `leave failed: ${err?.message ?? err}`));
    await this.turn?.promise?.catch(() => {});
    if (this.r.pending.length && reason !== "removed") {
      // Last words said before the end: let V see them once more (it may answer in the group).
      this.r.status = "listening";
      this.#maybeStartTurn();
      await this.turn?.promise?.catch(() => {});
      this.r.status = "ending";
    }
    await this.#brief();
    this.r.status = "ended";
    this.r.endedAt = this.now();
    await this.save();
    this.log("info", `ended (${reason}): ${JSON.stringify(this.summary())}`);
    this.d.onEnd?.(this);
    return this.summary();
  }

  async #brief() {
    const transcriptPath = this.transcriptFile("transcript.md");
    if (!transcriptPath || this.r.stats.turns === 0 || this.r.brief) return;
    let res;
    try {
      res = await this.d.runTurn({ sessionKey: this.r.sessionKey, agentId: this.r.agentId, message: briefPrompt({ meetingId: this.r.meetingId, transcriptPath }), idempotencyKey: `vmb-${this.r.meetingId}-brief` });
    } catch (err) {
      res = { status: "error", error: String(err?.message ?? err) };
    }
    if (!res?.text || isSilent(res.text)) { this.r.brief = "failed"; return; }
    await writeFileEnsured(this.transcriptFile("brief.md"), `# 会后纪要（meeting_id ${this.r.meetingId}）\n\n${res.text.trim()}\n\n逐字：transcript.md\n`).catch(() => {});
    if (this.r.delivery?.to) {
      try { await this.d.postGroup(this.r.delivery, COPY.briefHeader + res.text.trim()); this.r.brief = "sent"; } catch { this.r.brief = "written"; }
    } else this.r.brief = "written";
  }
}
