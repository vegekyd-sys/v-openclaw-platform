// What happens to a turn when the provider answers with a server error.
const twoModels = {
  models: {
    providers: {
      fake: {
        models: [
          { id: "m1", name: "m1", contextWindow: 200000, maxTokens: 8192, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
          { id: "m2", name: "m2", contextWindow: 200000, maxTokens: 8192, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        ],
      },
    },
  },
  agents: { defaults: { model: { primary: "fake/m1", fallbacks: ["fake/m2"] } } },
};

export default [
  {
    id: "UPSTREAM-5XX/one-retry-then-fallback",
    ledger: ["#375", "upstream-5xx"],
    boot: {
      config: twoModels,
      modelScript: (body) => (body.model === "m1" ? { httpStatus: 503, errorMessage: "down" } : { text: "备用回答" }),
    },
    timeoutMs: 240_000,
    async run({ gw, assert }) {
      const started = Date.now();
      const r = await gw.turn("你好", { timeoutMs: 220_000 });
      const primary = gw.model.requests.filter((q) => q.body.model === "m1").length;
      assert(r.text.includes("备用回答"), `the fallback model never answered: ${r.text}`);
      assert(primary <= 2, `the primary was tried ${primary} times with a fallback waiting, one retry is the budget`);
      return `primary ${primary} calls, fallback answered in ${Date.now() - started} ms`;
    },
  },
  {
    id: "5XX-AFTER-TOOLS/continues-from-transcript",
    ledger: ["5xx-after-settled-tools"],
    boot: {
      modelScript: (body, i) => {
        // A write has side effects, so the turn is not replay-safe and plain retry may not run.
        if (i === 0) return { toolCalls: [{ name: "write", args: { path: "contract.txt", content: "x" } }] };
        if (i === 1) return { httpStatus: 503, errorMessage: "blip" };
        return { text: "接着做完了" };
      },
    },
    timeoutMs: 240_000,
    async run({ gw, assert }) {
      const r = await gw.turn("查状态", { timeoutMs: 220_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      assert(r.text.includes("接着做完了"), `the turn did not continue after the blip: ${r.text}`);
      return `${gw.model.requests.length} model calls`;
    },
  },
  {
    id: "E3/length-with-no-text-stops",
    ledger: ["E3"],
    boot: { modelScript: () => ({ text: "", finishReason: "length" }) },
    timeoutMs: 240_000,
    async run({ gw, assert }) {
      const r = await gw.turn("写", { timeoutMs: 220_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      assert(gw.model.requests.length === 1, `a length stop with no text was retried: ${gw.model.requests.length} calls`);
      assert(/已停止自动续写/.test(r.text), `not V's stop notice: ${r.text}`);
      return `1 call, ${JSON.stringify(r.text).slice(0, 120)}`;
    },
  },
];
