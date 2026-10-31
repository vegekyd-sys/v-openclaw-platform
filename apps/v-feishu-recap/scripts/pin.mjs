// Puts the recap entry in a group: a one-line post whose link is clickable right on the
// pinned banner. A group has one banner, so this replaces whatever is pinned there.
//   node scripts/pin.mjs put|remove <chat_id>
import { readFileSync } from "node:fs";
import { Feishu } from "../lib/feishu.mjs";

export const sidebarLink = (url) => `https://applink.feishu.cn/client/web_url/open?mode=sidebar-semi&url=${encodeURIComponent(url)}`;

export function entryPost(pageUrl) {
  return { zh_cn: { title: "", content: [[{ tag: "text", text: "📋 V 回顾 · " }, { tag: "a", text: "点开看这个群聊到哪了", href: sidebarLink(pageUrl) }]] } };
}

async function main([action, chat]) {
  const config = JSON.parse(readFileSync(process.env.RECAP_OPENCLAW_CONFIG, "utf8"));
  const feishu = new Feishu(config.channels.feishu);
  if (!/^oc_[A-Za-z0-9]+$/u.test(chat ?? "")) throw new Error("usage: pin.mjs put|remove <chat_id>");
  const notice = `/im/v1/chats/${chat}/top_notice`;
  if (action === "remove") {
    await feishu.call("unpin", "POST", `${notice}/delete_top_notice`, {});
    console.log(JSON.stringify({ ok: true, removed: true }));
    return;
  }
  if (action !== "put") throw new Error("usage: pin.mjs put|remove <chat_id>");
  const page = `${new URL(process.env.RECAP_ORIGIN).origin}/recap?c=${chat}`;
  const sent = await feishu.call("send", "POST", "/im/v1/messages?receive_id_type=chat_id", {
    receive_id: chat,
    msg_type: "post",
    content: JSON.stringify(entryPost(page)),
  });
  const messageId = sent.data.message_id;
  await feishu.call("pin", "POST", `${notice}/put_top_notice`, { chat_top_notice: [{ action_type: "1", message_id: messageId }] });
  console.log(JSON.stringify({ ok: true, messageId, page }));
}

if (process.argv[1]?.endsWith("pin.mjs")) await main(process.argv.slice(2));
