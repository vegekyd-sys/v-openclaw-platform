// A Telegram Bot API on localhost: long polling hands out queued updates and every
// other method is recorded and answered with a plausible result.
import { createServer } from "node:http";

export async function startFakeTelegram() {
  const calls = [];
  const updates = [];
  let updateId = 1000;
  let messageId = 5000;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {}
    const method = req.url.split("/").pop().split("?")[0];
    const ok = (result) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    };
    if (method === "getMe") return ok({ id: 123456, is_bot: true, first_name: "V", username: "v_contract_bot", can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false });
    if (method === "getUpdates") {
      const deadline = Date.now() + 1500;
      while (!updates.length && Date.now() < deadline && !res.destroyed) await new Promise((r) => setTimeout(r, 50));
      return ok(updates.splice(0));
    }
    calls.push({ method, body, at: Date.now() });
    if (/^(sendMessage|sendPhoto|sendDocument|editMessageText|sendChatAction)$/.test(method) && method !== "sendChatAction") {
      const sentId = body.message_id ?? ++messageId;
      calls.at(-1).messageId = sentId;
      return ok({ message_id: sentId, date: Math.floor(Date.now() / 1000), chat: { id: Number(body.chat_id) || 1, type: "private" }, text: body.text ?? "" });
    }
    return ok(true);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: server.address().port,
    calls,
    text: () => calls.filter((c) => /^(sendMessage|editMessageText)$/.test(c.method)).map((c) => JSON.stringify(c.body)).join("\n"),
    send(text, { from = 777, chat = 777 } = {}) {
      updates.push({ update_id: ++updateId, message: { message_id: ++messageId, date: Math.floor(Date.now() / 1000), text, from: { id: from, is_bot: false, first_name: "T" }, chat: { id: chat, type: "private", first_name: "T" } } });
    },
    click(data, { from = 777, chat = 777, messageId: mid } = {}) {
      updates.push({ update_id: ++updateId, callback_query: { id: String(++updateId), from: { id: from, is_bot: false, first_name: "T" }, chat_instance: "1", data, message: { message_id: mid ?? messageId, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, text: "q" } } });
    },
    stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}
