#!/usr/bin/env node
// Real-Feishu acceptance of the background-work line, one harness per run.
//
// Sends as the operator's own Feishu user (lark-cli) into an acceptance group,
// switches the bot to a harness, asks for a subagent plus a background command
// and an immediate answer, then reads the reply cards back every few seconds.
// Passes only if the line was seen at the end of the card above the footer
// while work ran, after the reply had been given, and ended as "已结束".
//
//   node lab/feishu-task-status-acceptance.mjs --chat oc_… --bot ou_… \
//     --model vcc [--native] [--tag TS_…] [--watch-seconds 240]
//
// --native asks a Codex harness for its own spawn_agent subagent instead of
// sessions_spawn. Writes a JSON report to stdout.
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const chat = args.chat;
const bot = args.bot;
const model = args.model;
const native = args.native === true;
const tag = args.tag ?? `TS_${model ?? "default"}_${Date.now().toString(36)}`.toUpperCase().replace(/\W/gu, "_");
const watchMs = Number(args["watch-seconds"] ?? 240) * 1000;
if (!/^oc_/u.test(chat ?? "") || !/^ou_/u.test(bot ?? "") || !model) {
  console.error("usage: --chat oc_… --bot ou_… --model <alias|default> [--native]");
  process.exit(2);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lark = (argv) => JSON.parse(execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
const send = (text) => {
  const r = lark(["im", "+messages-send", "--as", "user", "--chat-id", chat, "--text", `<at user_id="${bot}">V</at> ${text}`]);
  if (!r.ok) throw new Error(`send failed: ${JSON.stringify(r).slice(0, 300)}`);
  return r.data?.message_id;
};
const recent = () => lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", chat, "--page-size", "20", "--no-reactions"]).data?.messages ?? [];
const botCardsAfter = (sinceMs) => recent()
  .filter((m) => m.sender?.sender_type === "app" && m.msg_type === "interactive" && Date.parse(`${m.create_time.replace(" ", "T")}:00+08:00`) >= sinceMs - 60_000)
  .map((m) => ({ id: m.message_id, replyTo: m.reply_to, content: String(m.content ?? "") }));

// Where the line sits: last block of the body, i.e. right before the footer rule.
function inspect(content) {
  const body = content.replace(/^<card>\n?/u, "").replace(/\n?<\/card>$/u, "");
  const lines = body.split("\n");
  const rule = lines.lastIndexOf("---");
  const index = lines.findIndex((l) => /^(⏳ 后台 \d+ 项进行中|☑️ 后台任务已结束)/u.test(l.trim()));
  return {
    line: index === -1 ? null : lines[index].trim(),
    aboveFooter: index !== -1 && rule !== -1 && index < rule && lines.slice(index + 1, rule).every((l) => !l.trim()),
    footer: rule === -1 ? null : lines.slice(rule + 1).join(" ").trim(),
  };
}

const report = { tag, model, native, chat, steps: [] };
const switchAt = Date.now();
const switchId = send(model === "default" ? "/model default" : `/model ${model}`);
let switched = null;
for (let i = 0; i < 24 && !switched; i += 1) {
  await sleep(5_000);
  switched = botCardsAfter(switchAt).find((m) => m.replyTo === switchId) ?? null;
}
report.steps.push({ step: "switch", request: switchId, reply: switched?.id, text: switched?.content.slice(0, 200) });
if (!switched) throw new Error(`no reply to the model switch\n${JSON.stringify(report)}`);

const prompt = native
  ? `这是后台任务验收 ${tag}。请严格照做：第一步，用你自带的 spawn_agent 开一个子 agent，让它运行 \`sleep 60 && echo ${tag}-CHILD\` 并汇报输出；第二步，用 exec 在后台运行 \`sleep 45\`（不要等待）；第三步，两个都启动后立刻只回复 ${tag} STARTED，不要等待任何结果。`
  : `这是后台任务验收 ${tag}。请严格照做：第一步，调用 sessions_spawn 启动一个子 agent，task 写“运行 \`sleep 60 && echo ${tag}-CHILD\` 并汇报输出”；第二步，用 exec 在后台运行 \`sleep 45\`（background=true，不要等待）；第三步，两个都启动后立刻只回复 ${tag} STARTED，不要等待任何结果。`;
const taskAt = Date.now();
const taskId = send(prompt);
report.steps.push({ step: "task", request: taskId });

const seen = new Map();
const timeline = [];
// What the newest card carrying the line shows at each poll.
const samples = [];
let answeredAt = null;
const deadline = Date.now() + watchMs;
while (Date.now() < deadline) {
  await sleep(5_000);
  const t = Math.round((Date.now() - taskAt) / 1000);
  for (const card of botCardsAfter(taskAt)) {
    if (card.id === switched.id) continue;
    const view = inspect(card.content);
    const key = `${card.id}|${view.line}|${view.aboveFooter}`;
    if (!answeredAt && card.replyTo === taskId && card.content.includes(`${tag} STARTED`)) answeredAt = t;
    if (seen.has(key)) continue;
    seen.set(key, true);
    timeline.push({ t, card: card.id, replyTo: card.replyTo === taskId ? "task" : card.replyTo, ...view, text: card.content.replace(/\s+/gu, " ").slice(0, 160) });
  }
  const cards = botCardsAfter(taskAt).filter((card) => card.id !== switched.id).map((card) => ({ id: card.id, ...inspect(card.content) }));
  const carrier = cards.find((card) => card.line);
  samples.push({ t, card: carrier?.id ?? null, line: carrier?.line ?? null });
  const last = timeline.filter((row) => row.line).at(-1);
  if (last?.line?.startsWith("☑️") && answeredAt !== null && t - answeredAt > 20) break;
}
report.answeredAt = answeredAt;
report.timeline = timeline;
report.samples = samples.filter((row, i) => i === 0 || row.line !== samples[i - 1].line || row.card !== samples[i - 1].card);
const running = timeline.filter((row) => row.line?.startsWith("⏳"));
report.verdict = {
  replied: answeredAt !== null,
  sawRunning: running.length > 0,
  sawRunningAfterReply: samples.some((row) => answeredAt !== null && row.t > answeredAt && row.line?.startsWith("⏳")),
  alwaysAboveFooter: timeline.filter((row) => row.line).every((row) => row.aboveFooter),
  ended: timeline.some((row) => row.line?.startsWith("☑️")),
  peak: running.reduce((max, row) => Math.max(max, Number(row.line.match(/后台 (\d+) 项/u)?.[1] ?? 0)), 0),
};
report.ok = Object.entries(report.verdict).every(([key, value]) => key === "peak" || value === true);
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
