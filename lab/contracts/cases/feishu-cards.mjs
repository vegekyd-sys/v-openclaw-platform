// What a Feishu user sees, read from the calls the fake open platform received.
const PROGRESS = { plan: [{ step: "第一步检查", status: "in_progress" }, { step: "第二步修复", status: "pending" }] };

const waitForReply = (gw, text) =>
  gw.until(() => gw.feishu.outboundText().includes(text), { what: `"${text}" in a Feishu call` });

const settled = (gw) => gw.until(() => /dispatch complete/.test(gw.logs()), { what: "dispatch to complete" });

const cardJson = (gw) => {
  const call = gw.feishu.outbound().find((c) => c.path === "/open-apis/cardkit/v1/cards");
  return call ? JSON.parse(call.body.data) : null;
};

export default [
  {
    id: "F6/nameless-sender-looked-up-once",
    ledger: ["FEISHU-sender-empty-cache"],
    boot: {
      feishu: true,
      feishuApi: (call) => (call.path.startsWith("/open-apis/contact/v3/users/") ? { user: { open_id: "ou_nameless" } } : undefined),
      modelScript: () => ({ text: "回答" }),
    },
    timeoutMs: 90_000,
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "一", sender: "ou_nameless", chatId: "oc_n" });
      await gw.until(() => gw.model.requests.length === 1, { what: "first turn" });
      await settled(gw);
      await new Promise((r) => setTimeout(r, 500));
      await gw.feishuSend({ text: "二", sender: "ou_nameless", chatId: "oc_n" });
      await gw.until(() => gw.model.requests.length === 2, { what: "second turn" });
      const lookups = gw.feishu.calls.filter((c) => c.path.endsWith("/users/ou_nameless")).length;
      assert(lookups === 1, `${lookups} contact lookups for a sender with no name`);
      return "one lookup";
    },
  },
  {
    id: "F7/progress-card-streams-into-reply-card",
    ledger: ["FEISHU-progress-stream"],
    boot: {
      feishu: true,
      modelScript: (body) => {
        if (JSON.stringify(body.messages).includes('"role":"tool"')) return { text: "做完了" };
        return { toolCalls: [{ name: "progress_card", args: PROGRESS } ] };
      },
    },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "开工" });
      await waitForReply(gw, "做完了");
      await settled(gw);
      assert(gw.feishu.outboundText().includes("第一步检查"), `the checklist never reached the card: ${gw.feishu.outboundText().slice(-400)}`);
      return "checklist in the card";
    },
  },
  {
    id: "F5/card-footer-names-runtime",
    ledger: ["FEISHU-runtime-footer", "B5"],
    boot: { feishu: true, modelScript: () => ({ text: "正文一" }) },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "你好" });
      await waitForReply(gw, "正文一");
      await settled(gw);
      assert(/Runtime: openclaw/.test(gw.feishu.outboundText()), "no Runtime in the card footer");
      return "footer names the runtime";
    },
  },
  {
    id: "F4/hidden-theme-drops-card-header",
    ledger: ["FEISHU-card-header-hidden"],
    boot: {
      feishu: true,
      config: { agents: { list: [{ id: "main", default: true, identity: { name: "V", theme: "hidden" } }] } },
      modelScript: () => ({ text: "正文二" }),
    },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "你好" });
      await waitForReply(gw, "正文二");
      const card = cardJson(gw);
      assert(card, "no card was created");
      assert(!card.header, `the card still has a header: ${JSON.stringify(card.header)}`);
      return "no header";
    },
  },
  {
    id: "FEISHU-card-precreate/before-model-answers",
    ledger: ["FEISHU-card-precreate"],
    boot: { feishu: true },
    async run({ gw, assert }) {
      let release;
      const held = new Promise((r) => (release = r));
      gw.script.current = async () => {
        await held;
        return { text: "正文三" };
      };
      await gw.feishuSend({ text: "你好" });
      await gw.until(() => gw.model.requests.length === 1, { what: "the model call" });
      await new Promise((r) => setTimeout(r, 2500));
      const early = cardJson(gw);
      release();
      assert(early, "no card entity while the model was still thinking");
      await waitForReply(gw, "正文三");
      return "card entity exists before the first token";
    },
  },
  {
    id: "FEISHU-empty-card-discard/no-reply-leaves-no-card",
    ledger: ["FEISHU-empty-card-discard"],
    boot: { feishu: true, modelScript: () => ({ text: "NO_REPLY" }) },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "不用回" });
      await settled(gw);
      await new Promise((r) => setTimeout(r, 1500));
      const sent = gw.feishu.outbound().filter((c) => c.path === "/open-apis/im/v1/messages" && c.method === "POST");
      const taken = gw.feishu.outbound().filter((c) => c.method === "DELETE");
      assert(sent.length === taken.length, `${sent.length} card messages sent, ${taken.length} taken back`);
      return `${sent.length} sent, ${taken.length} taken back`;
    },
  },
  {
    id: "MSR/non-owner-may-only-run-model",
    ledger: ["MSR", "FEISHU-model-switch-roles"],
    boot: {
      feishu: true,
      config: { commands: { ownerAllowFrom: ["feishu:ou_owner"], allowFrom: { feishu: ["*"] } } },
      modelScript: () => ({ text: "模型回答" }),
    },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "/model", sender: "ou_guest", chatId: "oc_guest" });
      await gw.until(() => gw.feishu.outbound().some((c) => /fake\/m1|Current|当前|model/i.test(JSON.stringify(c.body))), { what: "the /model answer" });
      const before = gw.feishu.outbound().length;
      await gw.feishuSend({ text: "/status", sender: "ou_guest", chatId: "oc_guest" });
      await new Promise((r) => setTimeout(r, 3000));
      const after = gw.feishu.outbound().slice(before).map((c) => JSON.stringify(c.body)).join("");
      assert(!/Runtime:|Context:|Session:/.test(after), `/status answered a non-owner: ${after.slice(0, 200)}`);
      return "/model answered, /status not";
    },
  },
  {
    id: "FEISHU-steer-lane/second-message-joins-active-run",
    ledger: ["FEISHU-steer-lane"],
    boot: { feishu: true, env: { VLAB_FEISHU_STEER_ENABLED: "1", VLAB_FEISHU_STEER_CHAT_IDS: "*" } },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      let release;
      const held = new Promise((r) => (release = r));
      gw.script.current = async (body, i) => {
        if (i === 0) {
          await held;
          return { toolCalls: [{ name: "session_status", args: {} }] };
        }
        return { text: "合并回答" };
      };
      await gw.feishuSend({ text: "第一句" });
      await gw.until(() => gw.model.requests.length === 1, { what: "the first model call" });
      await new Promise((r) => setTimeout(r, 1000));
      await gw.feishuSend({ text: "第二句插话" });
      await new Promise((r) => setTimeout(r, 2500));
      release();
      await waitForReply(gw, "合并回答");
      const second = JSON.stringify(gw.model.requests[1].body.messages);
      assert(second.includes("第二句插话"), "the second message did not reach the running turn");
      const cards = gw.feishu.outbound().filter((c) => c.path === "/open-apis/cardkit/v1/cards").length;
      return `steered into the run, ${cards} card(s)`;
    },
  },
];
