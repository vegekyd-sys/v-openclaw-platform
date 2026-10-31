// How work in progress shows on the Feishu card, and how a chat's turns stay ordered.
const settled = (gw) => gw.until(() => /dispatch complete/.test(gw.logs()), { what: "dispatch" });

export default [
  {
    id: "FEISHU-stream-coalesce/slow-feishu-gets-newest-snapshot",
    ledger: ["FEISHU-stream-coalesce"],
    boot: {
      feishu: true,
      feishuApi: async (call) => {
        if (/elements\/content(\/content)?$/.test(call.path)) await new Promise((r) => setTimeout(r, 500));
        return undefined;
      },
      modelScript: () => ({ chunks: Array.from({ length: 40 }, (_, i) => `段${i} `), chunkDelayMs: 100 }),
    },
    timeoutMs: 90_000,
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "写" });
      await gw.until(() => gw.feishu.outboundText().includes("段39"), { what: "the last chunk" });
      await settled(gw);
      const writes = gw.feishu.calls.filter((c) => /elements\/content(\/content)?$/.test(c.path)).length;
      // 4 s of stream against a 500 ms API: chained writes would pile up behind it.
      assert(writes <= 10, `${writes} content writes behind a 500 ms API, each should carry the newest snapshot`);
      return `${writes} writes`;
    },
  },
  {
    id: "FEISHU-queue-10min/turn-keeps-its-place-past-five-minutes",
    ledger: ["FEISHU-queue-10min"],
    slow: true,
    timeoutMs: 420_000,
    boot: { feishu: true },
    async run({ gw, assert }) {
      let release;
      const held = new Promise((r) => (release = r));
      gw.script.current = async (body, i) => {
        if (i === 0) await held;
        return { text: `回答${i}` };
      };
      await gw.feishuSend({ text: "第一句很久" });
      await gw.until(() => gw.model.requests.length === 1, { what: "first model call" });
      await new Promise((r) => setTimeout(r, 330_000));
      await gw.feishuSend({ text: "第二句" });
      await new Promise((r) => setTimeout(r, 6000));
      const concurrent = gw.model.requests.length;
      release();
      assert(concurrent === 1, "the second message started a concurrent turn after five minutes");
      await gw.until(() => gw.model.requests.length === 2, { what: "second turn after the first" });
      return "second message waited";
    },
  },
];
