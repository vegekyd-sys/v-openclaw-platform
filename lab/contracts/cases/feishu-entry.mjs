// The phone entry V adds to a private chat when someone of the audience opens it.
import { writeFileSync } from "node:fs";
import path from "node:path";

export default [
  {
    id: "PHONE-TAB/private-chat-gets-call-entry",
    ledger: ["电话入口"],
    boot: {
      feishu: true,
      setup: (dir) => {
        const file = path.join(dir, "phone-tabs.json");
        writeFileSync(file, JSON.stringify({ version: 1, accounts: { default: { enabled: true, appId: "cli_contract", url: "https://voice.example.test/voice/feishu", allowedOpenIds: ["ou_owner"] } } }), { mode: 0o600 });
        return { OPENCLAW_FEISHU_PHONE_TABS_FILE: file };
      },
      feishuApi: (call) => (call.path === "/open-apis/im/v1/chats/oc_p2p" ? { chat_id: "oc_p2p", chat_mode: "p2p", chat_type: "p2p" } : /chat_tabs\/list_tabs$/.test(call.path) ? { chat_tabs: [] } : call.path.endsWith("/chat_tabs") ? { chat_tabs: [{ tab_id: "t1", tab_name: "📞 打给 V", tab_type: "url", tab_content: { url: "https://voice.example.test/voice/feishu" } }] } : undefined),
    },
    async run({ gw, assert }) {
      await gw.feishuEvent(
        { chat_id: "oc_p2p", operator_id: { open_id: "ou_owner", user_id: "ou_owner", union_id: "ou_owner" }, last_message_create_time: String(Date.now()), last_message_id: "om_old" },
        "im.chat.access_event.bot_p2p_chat_entered_v1",
      );
      const tab = await gw
        .until(() => gw.feishu.calls.find((c) => c.method === "POST" && c.path.endsWith("/chat_tabs")), { timeoutMs: 15_000, what: "a chat tab" })
        .catch(() => null);
      assert(tab, `no phone tab: ${gw.feishu.calls.map((c) => c.path).slice(-4).join(" ")}`);
      assert(JSON.stringify(tab.body).includes("打给 V"), "tab has another name");
      return "tab created";
    },
  },
];
