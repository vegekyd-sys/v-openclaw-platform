// Sends a few layouts of the session-relay thread card to the VLab test group so a
// person can see which one Feishu actually centres. No Gateway, no model.
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
const base = threadCard(records);
const panel = base.body.elements[0];
const lines = panel.header.title.content;
const variants = {
  "A 折叠时按内容宽度": (p) => ({ ...p, header: { ...p.header, width: "auto_when_fold" } }),
  "B 居中列 + 折叠时按内容宽度": (p) => null,
  "C 文字在面板外居中": (p) => null,
};
const out = [];
for (const name of Object.keys(variants)) {
  let elements;
  const tagLine = { tag: "markdown", content: `<font color='grey'>样式 ${name}</font>`, text_size: "notation" };
  if (name.startsWith("A")) {
    elements = [tagLine, variants[name](structuredClone(panel))];
  } else if (name.startsWith("B")) {
    const p = structuredClone(panel);
    p.header.width = "auto_when_fold";
    elements = [tagLine, { tag: "column_set", horizontal_align: "center", columns: [{ tag: "column", width: "auto", elements: [p] }] }];
  } else {
    const p = structuredClone(panel);
    p.header.title = { tag: "markdown", content: "<font color='grey'>展开对话</font>", text_align: "center", text_size: "notation" };
    elements = [tagLine, { tag: "markdown", content: lines.replace(/^<font color='grey'>|<\/font>$/gu, "").split("\n").map((l) => `<font color='grey'>${l}</font>`).join("\n"), text_align: "center", text_size: "notation" }, p];
  }
  const card = { schema: "2.0", config: { update_multi: true }, body: { elements } };
  const res = await fetch(`${host}/open-apis/im/v1/messages?receive_id_type=chat_id`, { method: "POST", headers: { Authorization: `Bearer ${auth.tenant_access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ receive_id: GROUP, msg_type: "interactive", content: JSON.stringify(card) }) }).then((r) => r.json());
  out.push({ name, code: res.code, msg: res.msg, id: res.data?.message_id });
}
console.log(JSON.stringify(out, null, 2));
