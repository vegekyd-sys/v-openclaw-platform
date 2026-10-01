// Read the Tianyi <-> V - Lab DM since <epochSec>; print type, sender, times and redacted text.
import { execFileSync } from "node:child_process";
const [chat, since, marker] = process.argv.slice(2);
const out = execFileSync("lark-cli", ["api", "GET", "/open-apis/im/v1/messages", "--as", "user", "--params",
  JSON.stringify({ container_id_type: "chat", container_id: chat, start_time: since, sort_type: "ByCreateTimeAsc", page_size: "50", card_msg_content_type: "user_card_content" })], { encoding: "utf8", maxBuffer: 64 << 20 });
const j = JSON.parse(out.slice(out.indexOf("{")));
for (const m of j.data?.items ?? []) {
  const c = String(m.body?.content ?? "");
  const texts = [...c.matchAll(/"(?:text|content)":"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join(" ").replace(/\\n/g, " ");
  console.log(JSON.stringify({ sender: m.sender?.sender_type, type: m.msg_type, ct: Number(m.create_time), ut: Number(m.update_time),
    hasLink: /https?:\/\//.test(c), hasMarker: marker ? c.includes(marker) : undefined, text: texts.replace(/https?:\/\/\S+/g, "<link>").replace(/[A-Za-z0-9_-]{32,}/g, "<opaque>").slice(0, 240) }));
}
