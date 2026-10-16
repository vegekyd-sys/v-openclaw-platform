#!/usr/bin/env node
// Real-Feishu acceptance of no-reply-after-tool: the operator (lark-cli, own user) @-mentions
// the bot in an acceptance group and asks only for a THUMBSUP reaction with no text. The bot
// must add the reaction and post nothing; the runtime must not ask the model for a summary.
//
//   node lab/no-reply-acceptance.mjs --target vlab|v --expect silent|fallback
//
// --expect fallback is the unpatched baseline: the reaction lands and the English
// "no final summary was produced" text is posted (what V did on 2026-10-10 15:03).
// Writes a JSON report to stdout; exits non-zero when the expectation is not met.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const TARGETS = {
  vlab: {
    chat: "oc_5afced473a29eb6f5fed3ba9966aa9ff", // VLab 发布验收 B (Tianyi + V - Lab)
    bot: "ou_b4c17dbac69b0aff77bac433448dc0f6", // V - Lab
    ssh: ["-F", "/Users/tianyicai/v-upgrade-private/20260904/ssh-config", "vlab91"],
    unit: "openclaw-vlab-production-mirror-v8.service",
  },
  v: {
    chat: "oc_104de99774aea6a55f5ae46863e99ef3", // V 生产发布验收 0910 (Tianyi + V - Makaron)
    bot: "ou_b1cdeccdefbd26f53e51835b3cc7554a", // V - Makaron
    ssh: ["v"],
    unit: "openclaw-gateway.service",
  },
};
const target = TARGETS[args.target];
assert(target, "--target vlab|v");
const expect = String(args.expect ?? "silent");
assert(["silent", "fallback"].includes(expect), "--expect silent|fallback");
const waitMs = Number(args.waitSeconds ?? 90) * 1000;
const FALLBACK = "no final summary was produced";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lark = (argv) => {
  const out = execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("{")));
};
const remote = (cmd) => execFileSync("ssh", [...target.ssh, cmd], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

const sentAt = Date.now();
const sent = lark(["im", "+messages-send", "--as", "user", "--chat-id", target.chat, "--text",
  `<at user_id="${target.bot}">V</at> 感谢大家支持！这条不需要你回复任何文字：用 message 工具给这条消息点个赞（THUMBSUP），然后这一轮保持 NO_REPLY。`]);
const messageId = sent.data?.message_id;
assert(messageId, `send failed: ${JSON.stringify(sent).slice(0, 300)}`);

// Wait for the reaction, then keep watching for any bot text until the window closes.
let reaction = null;
const deadline = sentAt + waitMs;
while (Date.now() < deadline) {
  const m = lark(["im", "+messages-mget", "--as", "user", "--message-ids", messageId]).data?.messages?.[0];
  reaction = (m?.reactions?.details ?? []).find((d) => d.operator?.operator_type === "app") ?? reaction;
  await sleep(5_000);
}
const botMessages = (lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", target.chat, "--page-size", "20", "--no-reactions"]).data?.messages ?? [])
  .filter((m) => m.sender?.sender_type === "app" && Date.parse(`${m.create_time.replace(" ", "T")}:00+08:00`) >= sentAt - 60_000)
  .map((m) => ({ id: m.message_id, at: m.create_time, replyTo: m.reply_to, text: String(m.content ?? "").slice(0, 200) }));
// A streaming card the bot took back (feishu-empty-card-discard) is still listed, as "[nonsupport]";
// mget says whether it was deleted.
const deletedIds = new Set(botMessages.length === 0 ? [] : (lark(["im", "+messages-mget", "--as", "user", "--message-ids", botMessages.map((m) => m.id).join(",")]).data?.messages ?? [])
  .filter((m) => m.deleted === true).map((m) => m.message_id));
const recalled = botMessages.filter((m) => deletedIds.has(m.id));
const visibleBotMessages = botMessages.filter((m) => !deletedIds.has(m.id));
const settledLog = remote(`sudo journalctl -u ${target.unit} --since @${Math.floor(sentAt / 1000) - 2} --no-pager -o cat | grep -E 'lacked a final answer|settled-turn finalization|using terminal fallback' || true`)
  .split("\n").filter(Boolean).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 240));

const report = {
  target: args.target,
  expect,
  messageId,
  sentAt: new Date(sentAt).toISOString(),
  reaction: reaction ? { emoji: reaction.emoji_type, at: new Date(Number(reaction.action_time) * 1000).toISOString() } : null,
  botMessages: visibleBotMessages,
  recalled,
  settledLog,
};
console.log(JSON.stringify(report, null, 1));

assert.equal(report.reaction?.emoji, "THUMBSUP", "the bot did not add the reaction; the scenario exercised nothing");
const fallbackPosted = visibleBotMessages.some((m) => m.text.includes(FALLBACK));
if (expect === "silent") {
  assert.deepEqual(visibleBotMessages, [], "the bot posted a message after the reaction");
  assert.equal(settledLog.some((l) => /lacked a final answer/u.test(l)), false, "the runtime still asked for a summary");
} else {
  assert(fallbackPosted, "baseline did not reproduce the fallback text");
}
