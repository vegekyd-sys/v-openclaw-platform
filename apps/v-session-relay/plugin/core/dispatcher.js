// Gateway-only dispatcher. A thread (all relays sharing a chainId) is shown in every
// chat taking part as ONE collapsed card, 「A ⇄ B · 进行中」, patched as it goes;
// opening it shows the two V's talking. The agent-to-agent turns themselves are not
// posted (deliver: false), so the chats are not flooded with the same words twice.
// For each queued relay:
//   1. run the target session with the request and wait for it, however long it takes;
//   2. run the origin session with the reply and wait for it. If that run answered with
//      another relay the thread goes on; otherwise its text is what the origin says to
//      the people there, and it is posted in the origin chat.
// Every step is recorded in the ledger before and after it happens, so after a
// Gateway restart a relay resumes where it was instead of being lost.
import { feishuReceiverForSession } from "./sessions.js";
import { failureTurn, finalMessageCard, lastAssistantText, requestTurn, resultTurn, threadCard } from "./text.js";

const ACTIVE = new Set(["queued", "delivering", "running", "replying"]);

export class RelayDispatcher {
  constructor({ store, runtime, feishuFor, getConfig, logger, waitSliceMs = 10 * 60_000, maxWaitMs = 6 * 3600_000, now = Date.now }) {
    this.store = store;
    this.runtime = runtime; // api.runtime.subagent
    this.feishuFor = feishuFor; // (cfg, accountId) => FeishuApi | null
    this.getConfig = getConfig;
    this.logger = logger ?? console;
    this.waitSliceMs = waitSliceMs;
    this.maxWaitMs = maxWaitMs;
    this.now = now;
    this.inflight = new Map(); // relay id -> promise
    this.cardLocks = new Map(); // chain id -> promise (serialises card sends/patches)
    this.recovered = false;
  }

  /** One pass over the ledger; starts work for records nobody in this process is handling. */
  tick() {
    const records = this.store.list({ prune: !this.recovered, now: this.now() });
    const recovering = !this.recovered;
    this.recovered = true;
    for (const record of records) {
      if (!ACTIVE.has(record.status) || this.inflight.has(record.id)) {
        continue;
      }
      if (record.status !== "queued" && !recovering) {
        continue;
      }
      const job = this.process(record.id, { recovering: record.status !== "queued" })
        .catch((error) => this.logger.warn?.(`session relay ${record.id}: ${error.message}`))
        .finally(() => this.inflight.delete(record.id));
      this.inflight.set(record.id, job);
    }
  }

  async idle() {
    while (this.inflight.size || this.cardLocks.size) {
      await Promise.all([...this.inflight.values(), ...this.cardLocks.values()]);
    }
  }

  async process(id, { recovering = false } = {}) {
    let record = this.store.read(id);
    if (!record) {
      return;
    }
    if (record.status === "queued") {
      record = this.store.update(id, { status: "delivering" }, this.now());
      await this.refreshCard(record.chainId);
    }
    if (record.status === "delivering") {
      record = await this.deliverRequest(record);
    }
    if (record.status === "running") {
      record = await this.collectResult(record, { recovering });
    }
    if (record.status === "replying") {
      await this.deliverResult(record, { recovering });
    }
  }

  async deliverRequest(record) {
    const turn = requestTurn(record);
    try {
      const res = await this.runtime.run({
        sessionKey: record.to.sessionKey,
        message: turn.message,
        extraSystemPrompt: turn.extraSystemPrompt,
        deliver: false,
        idempotencyKey: `v-session-relay-${record.id}`,
      });
      this.logger.info?.(`session relay ${record.id}: ${record.from.sessionKey} -> ${record.to.sessionKey} run ${res.runId}`);
      record = this.store.update(record.id, { status: "running", runId: res.runId, startedAt: this.now() }, this.now());
      await this.refreshCard(record.chainId);
      return record;
    } catch (error) {
      return this.fail(record, `没送到：${error.message}`);
    }
  }

  async collectResult(record, { recovering }) {
    const wait = await this.waitRun(record.runId, record.startedAt);
    let reply = wait.status === "ok" && wait.terminalReply?.disposition === "visible" ? wait.terminalReply.text : null;
    if (!reply && (wait.status === "ok" || recovering)) {
      // Silent terminal snapshot, or a run from before a restart that agent.wait no longer knows.
      reply = await this.transcriptReply(record.to.sessionKey, record.startedAt);
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

  async deliverResult(record, { recovering }) {
    let runId = record.replyRunId;
    if (!runId) {
      const turn = resultTurn(record);
      try {
        const res = await this.runtime.run({
          sessionKey: record.from.sessionKey,
          message: turn.message,
          extraSystemPrompt: turn.extraSystemPrompt,
          deliver: false,
          idempotencyKey: `v-session-relay-${record.id}-result`,
        });
        runId = res.runId;
        record = this.store.update(record.id, { replyRunId: runId, replyStartedAt: this.now() }, this.now());
      } catch (error) {
        this.store.update(record.id, { status: "failed", error: `结果送不回去：${error.message}` }, this.now());
        await this.refreshCard(record.chainId);
        return;
      }
    }
    // Keep status "replying" while the origin runs, so it may relay again in this chain.
    const wait = await this.waitRun(runId, record.replyStartedAt ?? this.now(), { maxWaitMs: recovering ? this.waitSliceMs : this.maxWaitMs });
    const answeredAgain = this.store.list().some((r) => r.chainId === record.chainId && r.id !== record.id && r.createdAt >= (record.replyStartedAt ?? Infinity));
    let finalMessageId = null;
    if (!answeredAgain) {
      // The origin is done with the thread: what it said is meant for the people there.
      const text = wait.status === "ok" && wait.terminalReply?.disposition === "visible" ? wait.terminalReply.text : await this.transcriptReply(record.from.sessionKey, record.replyStartedAt);
      if (text) {
        finalMessageId = await this.send(record.from.sessionKey, finalMessageCard(text));
      }
    }
    this.store.update(record.id, { status: "done", replyRunStatus: wait.status, doneAt: this.now(), ...(finalMessageId ? { finalMessageId } : {}) }, this.now());
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
        idempotencyKey: `v-session-relay-${record.id}-failed`,
      });
    } catch (error) {
      this.logger.warn?.(`session relay ${record.id}: could not report failure: ${error.message}`);
    }
    return record;
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
    const thread = this.store.list().filter((r) => r.chainId === chainId);
    const root = thread.find((r) => r.id === chainId) ?? thread[0];
    const feishu = this.feishuFor(this.getConfig(), undefined);
    if (!root || !feishu) {
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
