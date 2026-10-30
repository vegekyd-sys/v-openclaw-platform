// A Feishu open platform on localhost: records every outbound API call and can
// push signed webhook events into the Gateway's Feishu channel.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import os from "node:os";
import path from "node:path";

export const FEISHU_SECRETS = { verificationToken: "contract-verify", encryptKey: "contract-encrypt" };

// The plugin's config only accepts an https domain, so the fake gets a throwaway
// self-signed certificate and the test Gateway runs with verification off.
function throwawayCert() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "c2-tls-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const out = { key: readFileSync(key), cert: readFileSync(cert) };
  rmSync(dir, { recursive: true, force: true });
  return out;
}

export async function startFakeFeishu(overrides = () => undefined) {
  const calls = [];
  let seq = 0;
  const server = createServer(throwawayCert(), async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {}
    const url = new URL(req.url, "http://x");
    const call = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, at: Date.now() };
    calls.push(call);
    const reply = (data, extra = {}) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, msg: "ok", data, ...extra }));
    };
    const custom = await overrides(call);
    if (custom) return reply(custom);
    if (url.pathname.endsWith("/tenant_access_token/internal")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, msg: "ok", tenant_access_token: "t-contract", expire: 7200 }));
      return;
    }
    if (url.pathname === "/open-apis/bot/v3/info") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, msg: "ok", bot: { open_id: "ou_bot", app_name: "V", activate_status: 2 } }));
      return;
    }
    if (url.pathname.startsWith("/open-apis/im/v1/messages") && req.method === "POST") {
      return reply({ message_id: `om_out_${++seq}`, chat_id: "oc_contract", create_time: String(Date.now()) });
    }
    if (url.pathname === "/open-apis/cardkit/v1/cards" && req.method === "POST") {
      return reply({ card_id: `card_${++seq}` });
    }
    return reply({});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: server.address().port,
    calls,
    /** Every string the bot put in front of the user, in order. */
    outboundText() {
      return calls
        .filter((c) => /\/im\/v1\/messages|\/cardkit\/v1\//.test(c.path) && c.method !== "GET")
        .map((c) => JSON.stringify(c.body))
        .join("\n");
    },
    outbound() {
      return calls.filter((c) => /\/im\/v1\/messages|\/cardkit\/v1\//.test(c.path) && c.method !== "GET");
    },
    stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

export async function sendFeishuEvent(webhookPort, event, type = "im.message.receive_v1") {
  const raw = JSON.stringify({
    schema: "2.0",
    header: { event_id: crypto.randomUUID(), event_type: type, create_time: String(Date.now()), token: FEISHU_SECRETS.verificationToken, app_id: "cli_contract", tenant_key: "t" },
    event,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = crypto.createHash("sha256").update(timestamp + nonce + FEISHU_SECRETS.encryptKey + raw).digest("hex");
  // The channel starts its webhook listener a moment after the Gateway is ready.
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${webhookPort}/feishu/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-lark-request-timestamp": timestamp, "x-lark-request-nonce": nonce, "x-lark-signature": signature },
        body: raw,
      });
      return res.status;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

let messageSeq = 0;
export function textEvent({ text, chatType = "p2p", chatId = "oc_contract", sender = "ou_owner", messageId }) {
  return {
    sender: { sender_id: { open_id: sender, user_id: sender, union_id: sender }, sender_type: "user", tenant_key: "t" },
    message: {
      message_id: messageId ?? `om_in_${++messageSeq}_${Date.now()}`,
      chat_id: chatId,
      chat_type: chatType,
      message_type: "text",
      content: JSON.stringify({ text }),
      create_time: String(Date.now()),
      mentions: [],
    },
  };
}
