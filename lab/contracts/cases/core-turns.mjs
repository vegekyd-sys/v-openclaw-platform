// What a reply turn says when the model misbehaves. The fake model scripts the
// failure; the contract reads the reply the user would get.
const silentAfterTool = (body) => {
  const last = body.messages.at(-1);
  if (last.role === "tool") return { text: "NO_REPLY" };
  return { toolCalls: [{ name: "session_status", args: {} }] };
};

export default [
  {
    id: "E6/truncation-notice-chinese",
    ledger: ["E6"],
    boot: { modelScript: () => ({ text: "部分正文", finishReason: "length" }) },
    async run({ gw, assert }) {
      const r = await gw.turn("写长文");
      assert(r.text.includes("部分正文"), `partial text missing: ${r.text}`);
      assert(r.text.includes("回答达到输出限制"), `no Chinese truncation notice: ${r.text}`);
      return r.text;
    },
  },
  {
    id: "NO-REPLY-AFTER-TOOL/silence",
    ledger: ["NO-REPLY-AFTER-TOOL"],
    boot: { modelScript: silentAfterTool },
    async run({ gw, assert }) {
      const r = await gw.turn("加个表情就好");
      assert(gw.model.requests.length === 2, `model called ${gw.model.requests.length} times, an authored NO_REPLY must end the turn at 2`);
      assert(!/final summary|couldn't generate|没能/i.test(r.text), `a fallback sentence reached the user: ${r.text}`);
      return `model calls 2, reply ${JSON.stringify(r.text)}`;
    },
  },
  {
    id: "FAILURE-COPY/5xx-chinese",
    ledger: ["upstream-5xx-copy"],
    boot: { modelScript: () => ({ httpStatus: 503, errorMessage: "upstream down" }) },
    timeoutMs: 300_000,
    async run({ gw, assert }) {
      const r = await gw.turn("你好", { timeoutMs: 280_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      assert(/模型服务暂时不可用/.test(r.text), `not V's Chinese failure copy: ${r.text}`);
      return r.text;
    },
  },
  {
    id: "A21/health-event-loop-median",
    ledger: ["A21"],
    async run({ gw, assert }) {
      await new Promise((r) => setTimeout(r, 1500));
      const h = await gw.rpc.call("status", {}).catch(() => ({}));
      const health = await gw.rpc.call("health", { probe: false });
      const found = JSON.stringify({ h, health }).match(/"delayP50Ms":([\d.]+)/);
      assert(found, "no delayP50Ms in status or health");
      return `delayP50Ms=${found[1]}`;
    },
  },
];
