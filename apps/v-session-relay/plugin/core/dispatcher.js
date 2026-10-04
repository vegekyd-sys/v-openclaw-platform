// Gateway-only dispatcher. For each queued relay:
//   1. post 「消息来自 <from>」 in the target chat, then run the target session with
//      the request (deliver: true, so its reply and progress card show in that chat);
//   2. wait for that run to finish, however long it takes;
//   3. post 「消息来自 <to>」 in the origin chat, then run the origin session with the
//      result (deliver: true), and wait for that run so the origin may keep relaying
//      within the same chain while it continues.
// Every step is recorded in the ledger before and after it happens, so after a
// Gateway restart a relay resumes where it was instead of being lost.
import { feishuReceiverForSession } from "./sessions.js";
import { attributionCard, failureTurn, lastAssistantText, requestTurn, resultTurn } from "./text.js";

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
        // Claimed by this process earlier and already finished its promise: nothing to do.
        continue;
      }
      const job = this.process(record.id, { recovering: record.status !== "queued" })
        .catch((error) => this.logger.warn?.(`session relay ${record.id}: ${error.message}`))
        .finally(() => this.inflight.delete(record.id));
      this.inflight.set(record.id, job);
    }
  }

  async idle() {
    await Promise.all([...this.inflight.values()]);
  }

  async process(id, { recovering = false } = {}) {
    let record = this.store.read(id);
    if (!record) {
      return;
    }
    if (record.status === "queued") {
      record = this.store.update(id, { status: "delivering" }, this.now());
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
    if (!record.requestCardAt) {
      const cardId = await this.postCard(record.to.sessionKey, attributionCard({ label: record.from.label, folded: record.message, foldedTitle: "查看消息" }));
      record = this.store.update(record.id, { requestCardAt: this.now(), requestCardId: cardId }, this.now());
    }
    const turn = requestTurn(record);
    try {
      const res = await this.runtime.run({
        sessionKey: record.to.sessionKey,
        message: turn.message,
        extraSystemPrompt: turn.extraSystemPrompt,
        deliver: true,
        idempotencyKey: `v-session-relay-${record.id}`,
      });
      this.logger.info?.(`session relay ${record.id}: ${record.from.sessionKey} -> ${record.to.sessionKey} run ${res.runId}`);
      return this.store.update(record.id, { status: "running", runId: res.runId, startedAt: this.now() }, this.now());
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
    if (reply) {
      return this.store.update(record.id, { status: "replying", reply, runStatus: wait.status, finishedAt: this.now() }, this.now());
    }
    if (wait.status === "ok") {
      return this.store.update(record.id, { status: "replying", reply: "（做完了，但没有留下文字回复）", runStatus: "ok", finishedAt: this.now() }, this.now());
    }
    const reason =
      wait.status === "timeout" ? `等了 ${Math.round(this.maxWaitMs / 3600_000)} 小时还没做完` : recovering ? "V 重启打断了那边的工作" : `出错了：${wait.error ?? wait.status}`;
    return this.fail(record, reason);
  }

  async deliverResult(record, { recovering }) {
    if (!record.resultCardAt) {
      const cardId = await this.postCard(record.from.sessionKey, attributionCard({ label: record.to.label, folded: record.reply, foldedTitle: "查看回复" }));
      record = this.store.update(record.id, { resultCardAt: this.now(), resultCardId: cardId }, this.now());
    }
    let runId = record.replyRunId;
    if (!runId) {
      const turn = resultTurn(record);
      try {
        const res = await this.runtime.run({
          sessionKey: record.from.sessionKey,
          message: turn.message,
          extraSystemPrompt: turn.extraSystemPrompt,
          deliver: true,
          idempotencyKey: `v-session-relay-${record.id}-result`,
        });
        runId = res.runId;
        record = this.store.update(record.id, { replyRunId: runId, replyStartedAt: this.now() }, this.now());
      } catch (error) {
        this.store.update(record.id, { status: "failed", error: `结果送不回去：${error.message}` }, this.now());
        return;
      }
    }
    // Keep status "replying" while the origin runs, so it may relay again in this chain.
    const wait = await this.waitRun(runId, record.replyStartedAt ?? this.now(), { maxWaitMs: recovering ? this.waitSliceMs : this.maxWaitMs });
    this.store.update(record.id, { status: "done", replyRunStatus: wait.status, doneAt: this.now() }, this.now());
  }

  async fail(record, reason) {
    record = this.store.update(record.id, { status: "failed", error: reason }, this.now());
    try {
      await this.postCard(record.from.sessionKey, attributionCard({ label: record.to.label, folded: reason, foldedTitle: "没能完成" }));
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

  async postCard(sessionKey, card) {
    const receiver = feishuReceiverForSession(sessionKey);
    const feishu = receiver ? this.feishuFor(this.getConfig(), undefined) : null;
    if (!receiver || !feishu) {
      return null;
    }
    try {
      return await feishu.sendCard(receiver, card);
    } catch (error) {
      this.logger.warn?.(`session relay: card to ${sessionKey} failed: ${error.message}`);
      return null;
    }
  }
}
