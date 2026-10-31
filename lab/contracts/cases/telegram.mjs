// V Experience on Telegram, through a fake Bot API.
import { lastToolResult } from "../lib/fake-model.mjs";

const ask = { questions: [{ id: "drink", header: "饮料", question: "喝什么", options: [{ label: "茶", description: "绿茶" }, { label: "咖啡", description: "美式" }] }] };

const textOf = (gw) => gw.telegram.calls.filter((c) => c.method === "sendMessage").map((c) => JSON.stringify(c.body)).join("\n");

export default [
  {
    id: "V-EXPERIENCE/telegram-question-with-buttons",
    ledger: ["V-EXPERIENCE/command-text-and-secret-entry", "V-EXPERIENCE/telegram-background-line"],
    boot: {
      telegram: true,
      config: { commands: { ownerAllowFrom: ["telegram:777"] } },
      modelScript: (body) => (lastToolResult(body) ? { text: "结束" } : { toolCalls: [{ name: "ask_user", args: ask }] }),
    },
    timeoutMs: 90_000,
    async run({ gw, assert }) {
      await new Promise((r) => setTimeout(r, 1500));
      gw.telegram.send("问我喝什么");
      const question = await gw
        .until(() => gw.telegram.calls.find((c) => c.method === "sendMessage" && JSON.stringify(c.body.reply_markup ?? "").includes("tgv1:")), { timeoutMs: 20_000, what: "question buttons" })
        .catch(() => null);
      assert(question, `no V question buttons: ${textOf(gw).slice(0, 240)}`);
      assert(question.body.text.includes("点一个选项"), `no Chinese hint: ${question.body.text}`);
      return "buttons with V's envelope";
    },
  },
  {
    id: "V-EXPERIENCE/telegram-secret-notice",
    ledger: ["V-EXPERIENCE/command-text-and-secret-entry"],
    boot: {
      telegram: true,
      config: { commands: { ownerAllowFrom: ["telegram:777"] } },
      modelScript: (body) => (lastToolResult(body) ? { text: "好了" } : { toolCalls: [{ name: "secrets", args: { action: "request", name: "CONTRACT_API_KEY", kind: "secret", reason: "contract" } }] }),
    },
    timeoutMs: 90_000,
    async run({ gw, assert }) {
      await new Promise((r) => setTimeout(r, 1500));
      gw.telegram.send("要 key");
      await gw.until(() => gw.model.requests.length >= 2, { timeoutMs: 40_000, what: "the secrets tool" });
      await gw.until(() => /V 需要一个凭据（CONTRACT_API_KEY）/.test(textOf(gw)), { timeoutMs: 15_000, what: "the credential notice" }).catch(() => {
        assert(false, `no credential notice: ${textOf(gw).slice(0, 300)}`);
      });
      return "notice sent";
    },
  },
];
