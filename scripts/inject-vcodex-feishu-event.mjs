#!/usr/bin/env node

import crypto from "node:crypto";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

const webhookUrl = requiredEnv("VLAB_VCODEX_WEBHOOK_URL");
const encryptKey = requiredEnv("VLAB_VCODEX_FEISHU_ENCRYPT_KEY");
const chatId = requiredEnv("VLAB_VCODEX_ACCEPTANCE_CHAT_ID");
const senderOpenId = requiredEnv("VLAB_VCODEX_ACCEPTANCE_SENDER_OPEN_ID");
const text = process.argv.slice(2).join(" ").trim();

if (!text) {
  throw new Error("usage: inject-vcodex-feishu-event.mjs <prompt>");
}

const now = Date.now();
const unique = crypto.randomUUID();
const payload = {
  schema: "2.0",
  header: {
    event_id: `vlab-vcodex-${unique}`,
    event_type: "im.message.receive_v1",
    create_time: String(now),
  },
  event: {
    sender: {
      sender_id: {
        open_id: senderOpenId,
      },
      sender_type: "user",
    },
    message: {
      message_id: `om_vlab_vcodex_${unique}`,
      chat_id: chatId,
      chat_type: "p2p",
      message_type: "text",
      content: JSON.stringify({ text }),
      create_time: String(now),
    },
  },
};

const rawBody = JSON.stringify(payload);
const timestamp = String(Math.floor(now / 1000));
const nonce = crypto.randomBytes(12).toString("hex");
const signature = crypto
  .createHash("sha256")
  .update(timestamp + nonce + encryptKey + rawBody)
  .digest("hex");

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-lark-request-timestamp": timestamp,
    "x-lark-request-nonce": nonce,
    "x-lark-signature": signature,
  },
  body: rawBody,
});

const responseText = await response.text();
const accepted = response.headers.get("x-openclaw-delivery-accepted");

console.log(
  JSON.stringify({
    status: response.status,
    accepted,
    body: responseText.slice(0, 200),
  }),
);

// OpenClaw 2026.7.1 acknowledges accepted webhook envelopes with HTTP 200 but
// predates the x-openclaw-delivery-accepted response header. Newer releases add
// that header, so retain it as evidence without requiring it in this baseline.
if (!response.ok) {
  process.exitCode = 1;
}
