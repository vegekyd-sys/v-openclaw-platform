// Feishu end-to-end load for the shared VLab (runs on the Mac, drives lark-cli as Tianyi).
// Only VLab-only groups (Tianyi + the "V - Lab" bot cli_aae2c999c7789bd9) are accepted.
//   node fs-load.mjs <label> <N> <outDir> [scenarios=mix|plain|exec|image|vcc-handoff|progress]
// Sends N messages at once (one per group, each @V - Lab, unique marker), then polls every
// group through the message API (ms timestamps) until each has a bot reply containing its
// marker (image scenarios: plus a delivered image) or 15 min pass. Links are never printed.
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const BOT_APP = "cli_aae2c999c7789bd9";
const BOT_AT = "ou_b4c17dbac69b0aff77bac433448dc0f6";
const TIANYI = "ou_8c7aa8fd7ab017c71a44a8e32b8d9766";
const GROUPS = [
  "oc_abfb8965c3dd0f8d089c7346a98b4ce5", "oc_8a26f79c82cae92bf11ca117ee7e6ad3", "oc_6307020423c4c30f82d4aa5eee331add",
  "oc_3f76e4ae6207ee05e1137ed360feeb94", "oc_d30a9235b1a3acad4e01dc856ad5152c", "oc_482e9f40871004c4b24fcb542509de5e",
  "oc_b206250697fef4e0a8edbdbe1ada5cf2", "oc_223bf5209f183e157f368c5dc70b729e", "oc_5a467a0cab47dd7063b4a2d4df2c03c7",
  "oc_9e2b7d4b9e4034007fe0506493a80274", "oc_a2bcb2867168dfb668cf893db25fca38", "oc_5600e1c44241aca4a943c62b78b003a3",
  "oc_b2752fc3886efe08c578f44484bdaf23", "oc_f49782f49ce7113cb43fe1ef530c0241", "oc_29eb6bc7e97e8c32395019084005a78c",
  "oc_346d0dd2c7fe532be069460d9ba49525", "oc_5afced473a29eb6f5fed3ba9966aa9ff", "oc_8d5950febfa650e02b5463499491f45a",
  "oc_b97eb6438421ab8d0a29b80b4ca02a4d", "oc_4a5c4fd8fe1d5c9a787ab5769cd409b1",
];
const [label, nArg, outDir, scenArg] = process.argv.slice(2);
const N = Number(nArg);
if (!/^[a-z0-9-]+$/.test(label ?? "") || !(N >= 1 && N <= GROUPS.length)) throw new Error("usage");
fs.mkdirSync(outDir, { recursive: true });
const lark = async (args) => {
  const { stdout } = await pexec("lark-cli", args, { maxBuffer: 64 << 20, timeout: 60_000 });
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
};
const members = async (chat) => {
  const j = await lark(["im", "+chat-members-list", "--as", "user", "--chat-id", chat, "--format", "json"]);
  return { users: (j.data.users ?? []).map((u) => u.member_id), bots: (j.data.bots ?? []).map((b) => b.app_id) };
};
// FS_GROUPS=oc_a,oc_b picks specific groups from the allow-list (functional tests).
const picked = process.env.FS_GROUPS ? process.env.FS_GROUPS.split(",") : null;
if (picked && picked.some((g) => !GROUPS.includes(g))) throw new Error("FS_GROUPS outside the VLab allow-list");
const groups = (picked ?? GROUPS).slice(0, N);
for (const g of groups) {
  const m = await members(g);
  if (m.users.length !== 1 || m.users[0] !== TIANYI || m.bots.length !== 1 || m.bots[0] !== BOT_APP) throw new Error(`group ${g} is not VLab-only; stopping`);
}
const stamp = Date.now().toString(36).toUpperCase();
const SC = {
  plain: (m) => `不要调用任何工具，只回复精确文本 ${m}。`,
  exec: (m) => `必须调用 exec 工具运行命令 echo ${m}，然后只回复命令输出的那一行文本。`,
  memory: (m) => `必须先调用 memory_search 工具搜索“测试”，不管结果如何，最后只回复 ${m}。`,
  browser: (m) => `必须调用 browser 工具打开 https://example.com 读取页面标题（h1），不要用其他工具。最后只回复 ${m} 和标题文字。`,
  spawn: (m) => `必须调用 sessions_spawn 工具启动一个子代理，任务是“只回复 ${m}”。等子代理完成后，只回复子代理返回的文本。`,
  image: (m) => `必须调用 image_generate 工具（不要用 makaron CLI、exec 或其他工具）生成一张很小的图：白底上一个蓝色方块。调用后本回合只回复 ${m}，等图片生成好发给我。`,
  progress: (m) => `请分三步完成，并且每一步前先用 progress_card 或工作清单更新进度：1) 调用 exec 运行 date；2) 调用 memory_search 搜索“测试”；3) 调用 exec 运行 echo ${m}。最后只回复 ${m}。`,
  "vcc-handoff": (m) => `/model vcc`,
};
const mix = ["exec", "memory", "browser", "spawn", "exec", "image", "memory", "browser", "spawn", "exec"];
const scenarios = scenArg && scenArg !== "mix" ? scenArg.split(",") : null;
const rows = groups.map((chat, i) => {
  const kind = scenarios ? scenarios[i % scenarios.length] : mix[i % mix.length];
  const marker = `FS${label.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 6)}_${i}_${stamp}`;
  return { chat, kind, marker, prompt: SC[kind](marker) };
});
const sendOne = async (r) => {
  const t = Date.now();
  const j = await lark(["im", "+messages-send", "--as", "user", "--chat-id", r.chat, "--text", `<at user_id="${BOT_AT}">V - Lab</at> ${r.prompt}`, "--format", "json"]);
  r.sentMs = t; r.messageId = j.data?.message_id; r.sendOk = j.ok === true;
};
const t0 = Date.now();
await Promise.all(rows.map((r) => sendOne(r).catch((e) => { r.sendOk = false; r.sendError = String(e.message).slice(0, 200); })));
const listSince = async (chat, sinceSec) => {
  const j = await lark(["api", "GET", "/open-apis/im/v1/messages", "--as", "user", "--params",
    JSON.stringify({ container_id_type: "chat", container_id: chat, start_time: String(sinceSec), sort_type: "ByCreateTimeAsc", page_size: "50", card_msg_content_type: "user_card_content" })]);
  return j.data?.items ?? [];
};
const deadline = t0 + 15 * 60_000;
const sinceSec = Math.floor(t0 / 1000) - 5;
const done = (r) => r.completedMs && (r.kind !== "image" || r.imageMs);
while (Date.now() < deadline && !rows.every((r) => !r.sendOk || done(r))) {
  await Promise.all(rows.filter((r) => r.sendOk && !done(r)).map(async (r) => {
    let items; try { items = await listSince(r.chat, sinceSec); } catch { return; }
    const bot = items.filter((m) => m.sender?.sender_type === "app" && Number(m.create_time) >= r.sentMs - 2000);
    r.botMessages = bot.length;
    if (bot.length && !r.firstVisibleMs) r.firstVisibleMs = Number(bot[0].create_time);
    const withMarker = bot.find((m) => String(m.body?.content ?? "").includes(r.marker));
    if (withMarker && !r.completedMs) { r.completedMs = Number(withMarker.update_time ?? withMarker.create_time); r.replyType = withMarker.msg_type;
      r.footer = (String(withMarker.body?.content ?? "").match(/Runtime: [a-z-]+/) ?? [])[0]; }
    // F7: any bot card whose content carries a work/progress list
    if (bot.some((m) => m.msg_type === "interactive" && /进度|工作清单|progress|✅|☑|⏳/i.test(String(m.body?.content ?? "")))) r.progressCardSeen = true;
    const img = bot.find((m) => m.msg_type === "image" || /"tag":"img"/.test(String(m.body?.content ?? "")) && Number(m.create_time) > r.sentMs && /image_key/.test(String(m.body?.content ?? "")) && !/请升级/.test(String(m.body?.content ?? "")));
    if (img && !r.imageMs) { r.imageMs = Number(img.create_time); r.imageType = img.msg_type; }
    if (r.kind === "vcc-handoff" && bot.some((m) => /https?:\/\//.test(String(m.body?.content ?? "")))) r.linkSeen = true;
  }));
  await new Promise((res) => setTimeout(res, 4000));
}
const pct = (arr, p) => { const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const lat = (k) => rows.map((r) => (r[k] ? r[k] - r.sentMs : NaN));
const summary = {
  label, N, t0, sent: rows.filter((r) => r.sendOk).length,
  completed: rows.filter((r) => r.completedMs).length, imagesDelivered: rows.filter((r) => r.kind === "image" && r.imageMs).length,
  imagesRequested: rows.filter((r) => r.kind === "image").length,
  firstVisibleMs: { p50: pct(lat("firstVisibleMs"), 0.5), p95: pct(lat("firstVisibleMs"), 0.95), p99: pct(lat("firstVisibleMs"), 0.99), max: pct(lat("firstVisibleMs"), 1) },
  completionMs: { p50: pct(lat("completedMs"), 0.5), p95: pct(lat("completedMs"), 0.95), p99: pct(lat("completedMs"), 0.99), max: pct(lat("completedMs"), 1) },
  failed: rows.filter((r) => !r.completedMs).map((r) => ({ chat: r.chat.slice(-6), kind: r.kind, sendOk: r.sendOk, botMessages: r.botMessages ?? 0 })),
};
fs.writeFileSync(`${outDir}/fs-load-${label}.json`, JSON.stringify({ summary, rows: rows.map(({ prompt, ...r }) => r) }, null, 1));
console.log(JSON.stringify(summary));
