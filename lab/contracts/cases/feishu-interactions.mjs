// Feishu flows where the bot asks and the human answers on a card.
import { lastToolResult } from "../lib/fake-model.mjs";

const askUser = {
  questions: [{ id: "drink", header: "饮料", question: "喝什么", options: [{ label: "茶", description: "绿茶" }, { label: "咖啡", description: "美式" }] }],
};

const feishuOwner = { commands: { ownerAllowFrom: ["feishu:ou_owner"] } };

export default [
  {
    id: "FEISHU-ask-user/card-click-answers-the-tool",
    ledger: ["FEISHU-ask-user"],
    boot: {
      feishu: true,
      config: feishuOwner,
      modelScript: (body) => {
        const last = lastToolResult(body);
        if (last) return { text: `选了 ${JSON.stringify(last.content).includes("茶") ? "茶" : "别的"}` };
        return { toolCalls: [{ name: "ask_user", args: askUser }] };
      },
    },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "问我喝什么" });
      const value = await gw.until(() => {
        const m = gw.feishu.outboundText().match(/\{\\*"a\\*":\\*"v\.ask_user\.submit\\*",\\*"q\\*":\\*"([^"\\]+)\\*",\\*"qi\\*":0,\\*"oi\\*":0\}/);
        return m?.[1];
      }, { timeoutMs: 20_000, what: "a native ask_user card" }).catch((e) => {
        assert(false, `no native question card: ${gw.feishu.outboundText().slice(0, 200)} (${e.message})`);
      });
      await gw.feishuEvent(
        {
          operator: { open_id: "ou_owner", user_id: "ou_owner", union_id: "ou_owner" },
          token: "t",
          action: { tag: "button", value: { a: "v.ask_user.submit", q: value, qi: 0, oi: 0 } },
          context: { open_message_id: gw.feishu.calls.findLast((c) => c.messageId).messageId, open_chat_id: "oc_contract" },
        },
        "card.action.trigger",
      );
      await gw.until(() => gw.feishu.outboundText().includes("选了 茶"), { timeoutMs: 40_000, what: "the answer to reach the model" });
      return "click resolved the question";
    },
  },
  {
    id: "SEC/feishu-masked-secret-card",
    ledger: ["SEC", "FEISHU-secret-entry"],
    boot: {
      feishu: true,
      config: feishuOwner,
      modelScript: (body) => {
        if (lastToolResult(body)) return { text: "好了" };
        return { toolCalls: [{ name: "secrets", args: { action: "request", name: "CONTRACT_API_KEY", kind: "secret", reason: "contract" } }] };
      },
    },
    timeoutMs: 90_000,
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "要 key" });
      await gw.until(() => /CONTRACT_API_KEY/.test(gw.feishu.outboundText()), { timeoutMs: 30_000, what: "the secret card" }).catch(() => {
        assert(false, `no secret entry card (model calls ${gw.model.requests.length}): ${gw.feishu.outboundText().slice(0, 240)}`);
      });
      assert(/input_type\\*":\\*"password|"password"|\\"password\\"/.test(gw.feishu.outboundText()), `the entry is not masked: ${gw.feishu.outboundText().slice(0, 400)}`);
      return "masked entry card";
    },
  },
  {
    id: "FEISHU-dm-approvals/exec-approval-card-in-owner-dm",
    ledger: ["FEISHU-dm-approvals"],
    boot: {
      feishu: true,
      config: { ...feishuOwner, tools: { exec: { security: "allowlist", ask: "always", host: "gateway" } }, channels: { feishu: { allowFrom: ["ou_owner"] } } },
      modelScript: (body) => {
        if (lastToolResult(body)) return { text: "审批后结束" };
        return { toolCalls: [{ name: "exec", args: { command: "echo contract-approval", host: "gateway" } }] };
      },
    },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "跑个命令" });
      await gw.until(() => /contract-approval/.test(gw.feishu.outboundText()), { timeoutMs: 40_000, what: "an approval prompt" }).catch(() => {
        assert(false, `no approval prompt reached Feishu (model calls ${gw.model.requests.length}): ${gw.feishu.outboundText().slice(0, 300)}`);
      });
      const toOwner = gw.feishu.outbound().find((c) => /contract-approval/.test(JSON.stringify(c.body)) && c.query.receive_id_type === "open_id" && c.body.receive_id === "ou_owner");
      assert(toOwner, `the approval did not go to the owner's DM: ${JSON.stringify(gw.feishu.outbound().filter((c) => /contract-approval/.test(JSON.stringify(c.body))).map((c) => [c.path, c.query, c.body.receive_id])).slice(0, 300)}`);
      return "approval card in the owner's DM";
    },
  },
];
