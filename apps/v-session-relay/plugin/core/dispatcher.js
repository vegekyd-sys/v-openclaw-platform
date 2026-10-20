// Gateway-only follower of the native sessions_send. The tool itself starts the target
// run; with the core patch v-sessions-send-reply-once-v1 the core then waits for it and
// wakes the requester once with the reply (run id `sessions-send-result:<target run>`).
// This dispatcher adds what the core does not do:
//   - a thread (all sends sharing a chainId) is shown in every chat taking part as ONE
//     collapsed card, 「A ⇄ B · 已完成 · N 条」, patched as it goes;
//   - when the woken requester does not send again, its text is posted to its chat as
//     the closing message (the core runs that turn with deliver: false);
//   - durability: records are files, so after a Gateway restart (which drops the core's
//     in-process wait), or for a send that was steered into an already running turn
//     (which the core does not follow), the reply is still collected and the requester
//     still woken, under the same run id so it never runs twice.
import { resultRunId } from "./native.js";
import { feishuReceiverForSession } from "./sessions.js";
import { RESULT_EXTRA_SYSTEM_PROMPT, failureTurn, finalMessageCard, lastAssistantText, threadCard } from "./text.js";

const ACTIVE = new Set(["running", "replying"]);

export class RelayDispatcher {
  constructor({ store, runtime, feishuFor, getConfig, describe, logger, waitSliceMs = 10 * 60_000, maxWaitMs = 6 * 3600_000, wakeGraceMs = 90_000, now = Date.now, sleep }) {
    this.store = store;
    this.runtime = runtime; // api.runtime.subagent
    this.feishuFor = feishuFor; // (cfg, accountId) => FeishuApi | null
    this.getConfig = getConfig;
    this.describe = describe ?? (async (sessionKey) => ({ label: sessionKey, name: "V" }));
    this.logger = logger ?? console;
    this.waitSliceMs = waitSliceMs;
    this.maxWaitMs = maxWaitMs;
    this.wakeGraceMs = wakeGraceMs;
    this.now = now;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.inflight = new Map(); // record id -> promise
    this.cardLocks = new Map(); // chain id -> promise (serialises card sends/patches)
    this.started = false;
  }

  /** One pass over the ledger; starts work for records nobody in this process is following. */
  tick() {
    const recovering = !this.started;
    this.started = true;
    for (const record of this.store.list({ prune: recovering, now: this.now() })) {
      if (this.inflight.has(record.id) || record.followedBy === this.processId()) {
        continue;
      }
      if (!ACTIVE.has(record.status) && !((record.status === "done" || record.status === "failed") && !record.painted)) {
        continue;
      }
      const job = this.follow(record.id, { recovering })
        .catch((error) => this.logger.warn?.(`session relay ${record.id}: ${error.message}`))
        .finally(() => this.inflight.delete(record.id));
      this.inflight.set(record.id, job);
    }
  }

  processId() {
    return `${process.pid}`;
  }

  async idle() {
    while (this.inflight.size || this.cardLocks.size) {
      await Promise.all([...this.inflight.values(), ...this.cardLocks.values()]);
    }
  }

  async follow(id, { recovering }) {
    let record = this.store.update(id, { followedBy: this.processId() }, this.now());
    record = await this.label(record);
    await this.refreshCard(record.chainId);
    if (record.status === "running") {
      record = await this.collectResult(record, { recovering });
    }
    if (record.status === "replying") {
      await this.followWake(record, { recovering });
    }
    this.store.update(id, { painted: true }, this.now());
  }

  /** Fills in chat names and speaker names (in the Gateway, where the Feishu credentials are). */
  async label(record) {
    const patch = {};
    for (const side of ["from", "to"]) {
      if (!record[side]?.label) {
        patch[side] = { ...record[side], ...(await this.describe(record[side].sessionKey)) };
      }
    }
    return Object.keys(patch).length ? this.store.update(record.id, patch, this.now()) : record;
  }

  async collectResult(record, { recovering }) {
    const wait = await this.waitRun(record.runId, record.createdAt);
    let reply = wait.status === "ok" && wait.terminalReply?.disposition === "visible" ? wait.terminalReply.text : null;
    if (!reply && (wait.status === "ok" || recovering)) {
      // Silent terminal snapshot, or a run from before a restart that agent.wait no longer knows.
      reply = await this.transcriptReply(record.to.sessionKey, record.createdAt);
    }
    if (!reply && wait.status === "ok") {
      reply = "（做完了，但没有留下文字回复）";
    }
    if (reply) {
      record = this.store.update(record.id, { status: "replying", reply, runStatus: wait.status, finishedAt: this.now() }, this.now());
      await this.refreshCard(record.chainId);
      return record;
    }
    const reason =
      wait.status === "timeout" ? `等了 ${Math.round(this.maxWaitMs / 3600_000)} 小时还没做完` : recovering ? "V 重启打断了那边的工作" : `出错了：${wait.error ?? wait.status}`;
    return this.fail(record, reason);
  }

  /**
   * The core wakes the requester under resultRunId(target run). Wait for that run; if it
   * never shows up (restart, steered send), issue it ourselves under the same id.
   */
  async followWake(record, { recovering }) {
    const wakeId = resultRunId(record.runId);
    const coreWakes = !recovering && record.targetDisposition !== "steered";
    let wait = coreWakes ? await this.waitKnownRun(wakeId, this.wakeGraceMs) : null;
    if (!wait || wait.status === "unknown") {
      try {
        await this.runtime.run({
          sessionKey: record.from.sessionKey,
          message: record.reply,
          extraSystemPrompt: RESULT_EXTRA_SYSTEM_PROMPT,
          deliver: false,
          idempotencyKey: wakeId,
        });
        this.store.update(record.id, { wokenBy: "plugin" }, this.now());
      } catch (error) {
        this.store.update(record.id, { status: "failed", error: `结果送不回去：${error.message}` }, this.now());
        await this.refreshCard(record.chainId);
        return;
      }
      wait = await this.waitRun(wakeId, this.now());
    }
    const answeredAgain = this.store.list().some((r) => r.chainId === record.chainId && r.id !== record.id && r.fromRunId === wakeId);
    let finalMessageId = null;
    let closingText = null;
    if (!answeredAgain) {
      // The requester is done with the thread: what it said is meant for the people there.
      const text = wait.status === "ok" && wait.terminalReply?.disposition === "visible" ? wait.terminalReply.text : await this.transcriptReply(record.from.sessionKey, record.finishedAt);
      if (text && text.trim()) {
        closingText = text;
        finalMessageId = await this.send(record.from.sessionKey, finalMessageCard(text));
      }
    }
    this.store.update(record.id, { status: "done", wakeStatus: wait.status, doneAt: this.now(), ...(closingText ? { closingText } : {}), ...(finalMessageId ? { finalMessageId } : {}) }, this.now());
    await this.refreshCard(record.chainId);
  }

  async fail(record, reason) {
    record = this.store.update(record.id, { status: "failed", error: reason }, this.now());
    await this.refreshCard(record.chainId);
    try {
      const turn = failureTurn({ ...record, reason });
      await this.runtime.run({
        sessionKey: record.from.sessionKey,
        message: turn.message,
        extraSystemPrompt: turn.extraSystemPrompt,
        deliver: true,
        idempotencyKey: `sessions-send-failed:${record.runId}`,
      });
    } catch (error) {
      this.logger.warn?.(`session relay ${record.id}: could not report failure: ${error.message}`);
    }
    return record;
  }

  /**
   * Waits for a run that may not have been admitted yet. Returns { status: "unknown" } when
   * nothing with that id ran within `graceMs`; otherwise the terminal wait result.
   */
  async waitKnownRun(runId, graceMs) {
    const until = this.now() + graceMs;
    for (;;) {
      let res;
      try {
        res = await this.runtime.waitForRun({ runId, timeoutMs: 5_000 });
      } catch (error) {
        res = { status: "error", error: error.message };
      }
      if (res.status === "ok" || (res.status === "error" && !/unknown|not found/iu.test(res.error ?? ""))) {
        return res;
      }
      if (res.status === "timeout" && (res.startedAt || res.providerStarted || res.livenessState)) {
        // It exists and is running.
        return this.waitRun(runId, this.now());
      }
      if (this.now() >= until) {
        return { status: "unknown" };
      }
      await this.sleep(2_000);
    }
  }

  /** agent.wait in slices until the run ends; unknown runs (after a restart) come back as error. */
  async waitRun(runId, startedAt, { maxWaitMs = this.maxWaitMs } = {}) {
    const deadline = (startedAt ?? this.now()) + maxWaitMs;
    for (;;) {
      let res;
      try {
        res = await this.runtime.waitForRun({ runId, timeoutMs: Math.max(1_000, Math.min(this.waitSliceMs, deadline - this.now())) });
      } catch (error) {
        return { status: "error", error: error.message };
      }
      if (res.status !== "timeout" && res.status !== "pending") {
        return res;
      }
      if (this.now() >= deadline) {
        return { status: "timeout" };
      }
      if (res.status === "pending") {
        await this.sleep(1_000);
      }
    }
  }

  async transcriptReply(sessionKey, after) {
    try {
      const { messages } = await this.runtime.getSessionMessages({ sessionKey, limit: 30 });
      return lastAssistantText(messages, { after });
    } catch (error) {
      this.logger.warn?.(`session relay: reading ${sessionKey} failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Sends or patches the thread card in every chat of the thread. Card message ids live
   * on the thread's first record (`threadCards: { [sessionKey]: messageId }`).
   */
  refreshCard(chainId) {
    const previous = this.cardLocks.get(chainId) ?? Promise.resolve();
    const settled = previous
      .then(() => this.paintCard(chainId))
      .catch((error) => this.logger.warn?.(`session relay card ${chainId}: ${error.message}`))
      .finally(() => {
        if (this.cardLocks.get(chainId) === settled) {
          this.cardLocks.delete(chainId);
        }
      });
    this.cardLocks.set(chainId, settled);
    return settled;
  }

  async paintCard(chainId) {
    const thread = this.store.list().filter((r) => r.chainId === chainId && r.from?.label && r.to?.label);
    const root = this.store.read(chainId) ?? thread[0];
    const feishu = this.feishuFor(this.getConfig(), undefined);
    if (!root || !thread.length || !feishu) {
      return;
    }
    const card = threadCard(thread);
    const cards = { ...(root.threadCards ?? {}) };
    const chats = [...new Set(thread.flatMap((r) => [r.from.sessionKey, r.to.sessionKey]))];
    for (const sessionKey of chats) {
      const receiver = feishuReceiverForSession(sessionKey);
      if (!receiver) {
        continue;
      }
      try {
        if (cards[sessionKey]) {
          await feishu.patchCard(cards[sessionKey], card);
        } else {
          cards[sessionKey] = await feishu.sendCard(receiver, card);
        }
      } catch (error) {
        this.logger.warn?.(`session relay: thread card in ${sessionKey} failed: ${error.message}`);
      }
    }
    this.store.update(root.id, { threadCards: cards }, this.now());
  }

  async send(sessionKey, card) {
    const receiver = feishuReceiverForSession(sessionKey);
    const feishu = receiver ? this.feishuFor(this.getConfig(), undefined) : null;
    if (!receiver || !feishu) {
      return null;
    }
    try {
      return await feishu.sendCard(receiver, card);
    } catch (error) {
      this.logger.warn?.(`session relay: message to ${sessionKey} failed: ${error.message}`);
      return null;
    }
  }
}
