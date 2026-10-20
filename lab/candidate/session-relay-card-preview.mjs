// Sends the session-relay thread card, as the plugin paints it, to the VLab test group so a
// person can check how Feishu renders it. No Gateway, no model.
import assert from "node:assert/strict";
import fs from "node:fs";
import { threadCard } from "../../apps/v-session-relay/plugin/core/text.js";

const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const feishu = cfg.channels?.feishu;
assert(typeof feishu?.appId === "string" && typeof feishu?.appSecret === "string");
const GROUP = process.env.RELAY_TARGET_CHAT ?? "oc_5afced473a29eb6f5fed3ba9966aa9ff";
const host = "https://open.feishu.cn";
const auth = await fetch(`${host}/open-apis/auth/v3/tenant_access_token/internal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret }) }).then((r) => r.json());
assert.equal(auth.code, 0);

const side = (label) => ({ label, name: "V", sessionKey: "x" });
const records = [
  { id: "r_p1", chainId: "r_p1", status: "done", createdAt: Date.now() - 60_000, finishedAt: Date.now() - 40_000, from: side("Tianyi 的私聊"), to: side("VLab 发布验收 B"), message: "按群规起草 v2.3 上线通知。", reply: "灰度比例定多少？" },
  { id: "r_p2", chainId: "r_p1", status: "done", createdAt: Date.now() - 30_000, finishedAt: Date.now() - 10_000, from: side("Tianyi 的私聊"), to: side("VLab 发布验收 B"), message: "20%", reply: "定稿：……" },
];
// The card exactly as the plugin paints it, finished and in progress.
const out = [];
for (const [name, card] of [["已完成", threadCard(records)], ["进行中", threadCard([{ ...records[0] }, { ...records[1], status: "running", reply: undefined }])]]) {
  const res = await fetch(`${host}/open-apis/im/v1/messages?receive_id_type=chat_id`, { method: "POST", headers: { Authorization: `Bearer ${auth.tenant_access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ receive_id: GROUP, msg_type: "interactive", content: JSON.stringify(card) }) }).then((r) => r.json());
  out.push({ name, code: res.code, msg: res.msg, id: res.data?.message_id });
}
console.log(JSON.stringify(out, null, 2));
