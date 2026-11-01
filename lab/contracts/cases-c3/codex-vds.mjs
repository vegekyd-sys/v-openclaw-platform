// /vds on a real Codex app-server, the fake model standing in for DeepSeek. These compare
// V and the fork, and each one asserts the behavior itself: stock has no DeepSeek route, so
// it cannot serve as the reverse control here.
import { vdsBoot } from "../lib/codex-boot.mjs";
import { lastFunctionOutput } from "../lib/fake-model.mjs";

const toolNames = (body) => (body.tools ?? []).map((t) => t.name ?? t.type).sort();
const text = JSON.stringify;
const TURN = { timeoutMs: 150_000 };
const BIG = { input_tokens: 2_000_000, output_tokens: 2, total_tokens: 2_000_002, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
const lastText = (q) => text(q.input).slice(-400);
const userTail = (q) => {
  const last = q.input?.at(-1);
  return last?.role === "user" ? last.content?.map((c) => c.text).join("").split("\n").at(-1) : undefined;
};
const isCompaction = (q) => lastText(q).includes("seamlessly continue");
const isFlush = (q) => lastText(q).includes("NO_REPLY");
const oversizedScript = (body) => {
  if (isCompaction(body)) return { text: "HANDOFF-MARK summary for the next LLM", usage: BIG };
  if (isFlush(body)) return { text: "NO_REPLY" };
  return { text: "ANSWER-MARK", usage: BIG };
};

export default [
  {
    id: "C3-CX-G1/vds-runs-on-codex-without-code-mode",
    ledger: "CX-G1-vds-deepseek",
    parity: true,
    boot: () => vdsBoot({ modelScript: () => ({ text: "from codex" }) }),
    async run({ gw, assert }) {
      const r = await gw.turn("hello", TURN);
      const meta = r.result.meta.agentMeta;
      assert(r.text.includes("from codex"), `reply: ${r.text}`);
      assert(meta.agentHarnessId === "codex" && meta.provider === "deepseek" && meta.codeModeEngaged === false, `meta: ${text(meta).slice(0, 300)}`);
      const q = gw.model.requests[0].body;
      assert(q.model === "deepseek-flash", `model on the wire: ${q.model}`);
      return { harness: meta.agentHarnessId, provider: meta.provider, codeMode: meta.codeModeEngaged, wire: q.model, tools: toolNames(q) };
    },
  },
  {
    id: "C3-CX-B/vds-reuses-one-thread",
    ledger: "CX-B-persistent-vds-thread",
    parity: true,
    boot: () => vdsBoot({ modelScript: (_b, i) => ({ text: `answer ${i}` }) }),
    async run({ gw, assert }) {
      await gw.turn("FIRST-MARK", TURN);
      await gw.turn("SECOND-MARK", TURN);
      const [a, b] = gw.model.requests.map((q) => q.body);
      assert(a.prompt_cache_key && a.prompt_cache_key === b.prompt_cache_key, `threads: ${a.prompt_cache_key} ${b.prompt_cache_key}`);
      const firstInSecond = text(b.input).split("FIRST-MARK").length - 1;
      assert(firstInSecond === 1, `first turn appears ${firstInSecond} times in the second request`);
      return { sameThread: true, firstInSecond };
    },
  },
  {
    id: "C3-CX-C/oversized-thread-is-kept-and-compacted",
    ledger: ["CX-C-vds-oversized", "CX-E-memory-flush-transient"],
    parity: true,
    boot: () => vdsBoot({ modelScript: oversizedScript }),
    async run({ gw, assert }) {
      const r1 = await gw.turn("FIRST-MARK", TURN);
      const r2 = await gw.turn("SECOND-MARK", TURN);
      const reqs = gw.model.requests.map((q) => q.body);
      const main = reqs[0].prompt_cache_key;
      assert(gw.logs().includes("keeping oversized DeepSeek thread"), "the oversized path was never taken");
      // CX-C: the next user turn stays on the thread instead of replaying the transcript into a new one.
      const second = reqs.filter((q) => userTail(q) === "SECOND-MARK");
      assert(second.length === 1 && second[0].prompt_cache_key === main, `second turn on ${second.map((q) => q.prompt_cache_key)} vs ${main}`);
      assert(reqs.some((q) => isCompaction(q) && q.prompt_cache_key === main), "Codex never compacted the thread");
      assert(r2.text.includes("ANSWER-MARK"), `reply: ${r2.text.slice(0, 200)}`);
      // CX-E: a memory flush happens on its own thread and leaves the binding alone.
      const flushes = reqs.filter(isFlush);
      assert(flushes.length > 0 && flushes.every((q) => q.prompt_cache_key !== main), `flush threads: ${flushes.map((q) => q.prompt_cache_key)}`);
      return { sameThread: true, compacted: true, flushOnOwnThread: true, replyIsAnswer: r1.text.includes("ANSWER-MARK") };
    },
  },
  {
    // The model says nothing after compacting, so the summary is the only text the turn has seen.
    id: "C3-CX-292/compaction-summary-is-not-the-reply",
    ledger: "CX-292-compaction-handoff",
    parity: true,
    boot: () =>
      vdsBoot({
        modelScript: (body) => {
          if (isCompaction(body)) return { text: "HANDOFF-MARK summary for the next LLM", usage: BIG };
          if (isFlush(body)) return { text: "NO_REPLY" };
          return userTail(body) === "SECOND-MARK" ? {} : { text: "ANSWER-MARK", usage: BIG };
        },
      }),
    async run({ gw, assert }) {
      await gw.turn("FIRST-MARK", TURN);
      const r = await gw.turn("SECOND-MARK", TURN).then((x) => x.text, (e) => `error ${e.message}`);
      assert(gw.model.requests.some((q) => isCompaction(q.body)), "Codex never compacted the thread");
      assert(!r.includes("HANDOFF-MARK"), `the summary went out as the reply: ${r.slice(0, 200)}`);
      return { summaryAsReply: false };
    },
  },
  {
    id: "C3-CX-322/view-image-and-413",
    ledger: "CX-322-vds-view-image",
    parity: true,
    boot: () =>
      vdsBoot({
        modelScript: (body) => (text(body.input).includes("TOO-BIG") && !text(body.input).includes("AFTER-MARK") ? { httpStatus: 413, errorMessage: "Payload Too Large" } : { text: "ok" }),
      }),
    async run({ gw, assert }) {
      await gw.turn("FIRST-MARK", TURN);
      const before = gw.model.requests[0].body;
      assert(text(before.tools).includes('"view_image"'), `OpenClaw's view_image is not offered: ${toolNames(before)}`);
      const failed = await gw.turn("TOO-BIG", { ...TURN, sessionKey: "agent:main:contract" }).then((r) => r.text, (e) => `error ${e.message}`);
      await gw.turn("AFTER-MARK", TURN);
      const after = gw.model.requests.at(-1).body;
      assert(after.prompt_cache_key !== before.prompt_cache_key, "the thread that hit 413 was kept");
      return { failedTurnSaid413: /413|too large/i.test(failed), newThread: true };
    },
  },
  {
    id: "C3-CX-A/long-stream-is-not-replayed",
    ledger: "CX-A-prebind",
    parity: true,
    boot: () => vdsBoot({ modelScript: () => ({ chunks: Array.from({ length: 400 }, (_, i) => `d${i} `) }) }),
    async run({ gw, assert }) {
      const r = await gw.turn("stream", TURN);
      assert(r.text.includes("d399"), `reply tail: ${r.text.slice(-60)}`);
      assert(gw.model.requests.length === 1, `${gw.model.requests.length} model calls for one turn`);
      return { calls: gw.model.requests.length };
    },
  },
  {
    id: "C3-CX-tools/openclaw-tool-result-returns-to-model",
    ledger: "CX-G1-vds-deepseek",
    parity: true,
    boot: () =>
      vdsBoot({
        modelScript: (body) => (lastFunctionOutput(body) ? { text: `tool said ${String(lastFunctionOutput(body).output).slice(0, 200)}` } : { toolCalls: [{ name: "session_status", args: {} }] }),
      }),
    async run({ gw, assert }) {
      const r = await gw.turn("use a tool", TURN);
      assert(r.text.startsWith("tool said"), `reply: ${r.text.slice(0, 200)}`);
      assert(!/unsupported call|unknown tool/i.test(r.text), `reply: ${r.text.slice(0, 200)}`);
      return { calls: gw.model.requests.length };
    },
  },
  {
    id: "C3-FEISHU/commentary-shows-as-progress-then-answer",
    ledger: ["FEISHU-codex-commentary", "FEISHU-visible-progress"],
    parity: true,
    boot: () =>
      vdsBoot({
        feishu: { streaming: { mode: "partial", block: { enabled: false } }, renderMode: "card" },
        config: { messages: { visibleReplies: "automatic", groupChat: { visibleReplies: "automatic" } } },
        modelScript: (body) => (lastFunctionOutput(body) ? { text: "ANSWER-MARK" } : { commentary: "COMMENTARY-MARK 先看一下", toolCalls: [{ name: "session_status", args: {} }] }),
      }),
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "看看" });
      await gw.until(() => gw.feishu.outboundText().includes("ANSWER-MARK"), { what: "the answer", timeoutMs: 120_000 });
      assert(gw.feishu.outboundText().includes("COMMENTARY-MARK"), "commentary never reached the card");
      return { commentary: true };
    },
  },
];
