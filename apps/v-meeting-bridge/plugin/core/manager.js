// All meetings of one Gateway: start (join + bind to the calling session), say, screenshot, stop,
// list, and recovery of every unfinished meeting after a Gateway restart. One active meeting per
// session; a second meeting_join from the same session is refused until the first one ends.

import { MeetingBridge, newRecord } from "./bridge.js";

const MEETING_NUMBER_RE = /^\d{9}$/u;
const WAIT_SLICE_MS = 30_000;

/** runtime.subagent run + wait → { status, text }. deliver:false: the bridge posts the reply itself. */
export function createTurnRunner(subagent, { runTimeoutMs = 15 * 60_000, now = Date.now } = {}) {
  return async ({ sessionKey, message, idempotencyKey }) => {
    const { runId } = await subagent.run({ sessionKey, message, deliver: false, idempotencyKey });
    const deadline = now() + runTimeoutMs;
    for (;;) {
      const w = await subagent.waitForRun({ runId, timeoutMs: Math.max(1_000, Math.min(WAIT_SLICE_MS, deadline - now())) });
      if (w?.status === "ok") {
        const r = w.terminalReply;
        return { status: "ok", runId, text: r?.disposition === "visible" ? r.text : "" };
      }
      if (w?.status === "error") return { status: "error", runId, error: w.error ?? "error" };
      if (now() >= deadline) return { status: "error", runId, error: "timeout" };
    }
  };
}

export class Manager {
  /** deps: { store, lark, runTurn, postGroup, logger, timing, progressEmoji, now, defaultWorkspaceDir(agentId) } */
  constructor(deps) {
    this.d = deps;
    this.now = deps.now ?? Date.now;
    this.byId = new Map();
  }

  #bridge(record) {
    const b = new MeetingBridge(record, {
      ...this.d,
      onRekey: (old, br) => { this.byId.delete(old); this.byId.set(br.id, br); },
      onEnd: (br) => { if (this.byId.get(br.id) === br) this.byId.delete(br.id); },
    });
    this.byId.set(b.id, b);
    return b;
  }

  forSession(sessionKey) {
    const key = String(sessionKey ?? "").toLowerCase();
    for (const b of this.byId.values()) if (b.active && b.r.sessionKey.toLowerCase() === key) return b;
    return null;
  }

  find({ meetingId, sessionKey } = {}) {
    if (meetingId) return this.byId.get(String(meetingId)) ?? null;
    return this.forSession(sessionKey);
  }

  async recover() {
    const records = await this.d.store.list();
    let resumed = 0;
    for (const r of records) {
      if (!["joining", "listening", "ending"].includes(r.status) || this.byId.has(r.id)) continue;
      const b = this.#bridge(r);
      if (r.status === "ending") void b.end(r.endReason ?? "recovered");
      else void b.start();
      resumed += 1;
    }
    return resumed;
  }

  /**
   * Join `meetingNumber` and bind the meeting to `sessionKey` (its chat gets the mirrored replies).
   * Returns once joined, or right away with status "joining" when the meeting is not ready and
   * waitMinutes > 0 (the bridge keeps trying in the background and posts in the chat on failure).
   */
  async start({ meetingNumber, sessionKey, agentId, delivery, workspaceDir, waitMinutes = 15 }) {
    const number = String(meetingNumber ?? "").replace(/\D/gu, "");
    if (!MEETING_NUMBER_RE.test(number)) throw new Error("meetingNumber must be the 9-digit Feishu meeting number");
    if (!sessionKey) throw new Error("no session to bind the meeting to");
    const existing = this.forSession(sessionKey);
    if (existing) {
      if (existing.r.meetingNumber === number) return { ...existing.summary(), alreadyActive: true };
      throw new Error(`this conversation is already in meeting ${existing.r.meetingNumber}; call meeting_leave first`);
    }
    const record = newRecord({
      meetingNumber: number, sessionKey, agentId, delivery, now: this.now(),
      workspaceDir: workspaceDir ?? this.d.defaultWorkspaceDir?.(agentId) ?? null,
      joinWaitMinutes: Math.max(0, Number(waitMinutes) || 0), maxMinutes: this.d.timing?.maxMinutes,
    });
    const b = this.#bridge(record);
    await this.d.store.save(b.r);
    // The first join attempt runs inline, so the common case answers "joined" in one tool call.
    void b.start();
    const deadline = this.now() + 25_000;
    while (b.r.status === "joining" && this.now() < deadline && !b.r.lastJoinError) await new Promise((r) => setTimeout(r, 250));
    return b.summary();
  }

  async say({ meetingId, sessionKey, text }) {
    const b = this.find({ meetingId, sessionKey });
    if (!b || b.r.status !== "listening") throw new Error("this conversation has no active meeting");
    return b.say(text, { mirror: true });
  }

  async screenshot({ meetingId, sessionKey }) {
    const b = this.find({ meetingId, sessionKey });
    if (!b || b.r.status !== "listening") throw new Error("this conversation has no active meeting");
    return b.screenshot();
  }

  /**
   * Never awaits the end: meeting_leave usually runs inside a turn of the bound session, and the
   * end waits for the running bridge turn and then runs the brief turn in that same session.
   */
  stop({ meetingId, sessionKey, leave = true }) {
    const b = this.find({ meetingId, sessionKey });
    if (!b) throw new Error("no active meeting found");
    void b.end("stopped", { leave });
    return { ...b.summary(), status: "ending" };
  }

  list() {
    return [...this.byId.values()].map((b) => b.summary());
  }

  async shutdown() {
    // Gateway stop/restart: keep records as they are (listening/joining) so recover() resumes them.
    for (const b of this.byId.values()) { b.stopping ??= Promise.resolve(); b.sleeper?.(); }
    this.byId.clear();
  }
}
