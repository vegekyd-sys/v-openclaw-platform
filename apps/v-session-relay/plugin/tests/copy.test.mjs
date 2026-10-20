// §7 / §8 texts, length limits, escaping and privacy trimming.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CHANNEL_CAPS, POLICY_CODES } from "../core/contracts.js";
import * as copy from "../core/copy.js";
import { sessionLabel } from "../core/labels.js";
import {
  REDACTED, audienceFor, byteLength, charLength, escapeMarkdown, foldMediaLines, formatForChannel, redactSecrets, visibleRequestBody,
} from "../core/visible.js";

test("copy: every PolicyCode has the exact §7.5 text", () => {
  assert.deepEqual([...copy.FORBIDDEN_CODES].sort(), [...POLICY_CODES].sort());
  const v = { asker: "任务群 a", to: "任务群 b", d: 2, path: "Tianyi 私聊 → X → 任务群 a", n: 6, h: 25 };
  assert.equal(copy.forbiddenText("LEAF", v), "这一轮是在回答「任务群 a」的问题，不能再用 sessions_send；直接在回复里回答，回答会自动送回。");
  assert.equal(copy.forbiddenText("WAIT_CYCLE", v), "「任务群 b」正在等你这一轮的结果，再发过去会互相卡住；直接把需要的内容写进你的回复。");
  assert.equal(copy.forbiddenText("REPLY_TO_REQUESTER", v), "你在做「任务群 b」交来的事，最终回复会自动交回给它，不用发；要问它问题，用 timeoutSeconds=120 当场等回答。");
  assert.equal(copy.forbiddenText("DEPTH", v), "已经是第 2 层转派（Tianyi 私聊 → X → 任务群 a），不能再往下派；自己做完，或在最终回复里说明需要谁来做。");
  assert.equal(copy.forbiddenText("FANOUT", v), "这一轮已经交出 6 件事，不能再派；结果会一起回来。");
  assert.equal(copy.forbiddenText("MEMBERS", v), "这项任务已经牵涉 6 个会话，不能再拉新的会话进来。");
  assert.equal(copy.forbiddenText("CHAIN_BUDGET", v), "这条协作链已来回 6 次，为防止打转已停止。把现有结果告诉这里的人。");
  assert.equal(copy.forbiddenText("PAIR_BUDGET", v), "你和「任务群 b」在这项任务里已来回 6 次，先停下，把分歧或现状写进回复。");
  assert.equal(copy.forbiddenText("RATE", v), "发得太快（1 分钟 6 次），稍等再发。");
  assert.equal(copy.forbiddenText("CHAIN_EXPIRED", v), "这项任务的协作已超过 25 小时，请直接向人汇报。");
  assert.equal(copy.forbiddenText("QUEUE_FULL", v), "「任务群 b」排队已满（6 件），稍后再发或换个会话。");
  assert.throws(() => copy.forbiddenText("NOPE", v));
});

test("copy: §7.6 notes and the §6.2 route error", () => {
  const tail = "结果会作为新的一轮自动回到这里；这一轮交出的几件会等齐后一起回来，只叫醒你一次。现在用一句话告诉这里的人交给了谁、做什么，然后结束本轮。不要 sleep，不要轮询 sessions_history / session_status。";
  assert.equal(copy.acceptedNote({ to: "任务群 a", code: "7F3A" }), `已交给「任务群 a」(#7F3A)，对方聊天里能看到这条请求，正在处理。${tail}`);
  assert.equal(copy.acceptedNote({ to: "任务群 a", code: "7F3A", ahead: 2 }), `已交给「任务群 a」(#7F3A)，它正在忙（前面还有 2 件），轮到后自动开始。${tail}`);
  assert.equal(copy.dedupeNote({ code: "7F3A" }), "同样的请求 #7F3A 已在进行，结果会自动回来；不要重复发送。");
  assert.equal(copy.inlineOkNote({ to: "X" }), "这是「X」的回答（它的聊天里也看得到），不会再单独送回。接着做你的事，不要重复问同样的问题。");
  assert.equal(copy.inlineNoReplyNote({ to: "X" }), "「X」这一轮没有给出文字结果，可以到它的聊天里看，或换个问法再问一次。");
  assert.equal(copy.inlineExpiredNote({ to: "X", seconds: 300 }), "「X」还在处理（已等 300 秒）。结果会作为新的一轮自动回到这里；现在先做别的或结束本轮，不要等待或轮询。");
  assert.equal(copy.inlineInterruptedNote({ to: "X", code: "Q2AB" }), "和「X」之间的等待中断了，但请求 #Q2AB 已受理，结果会作为新的一轮回来；现在结束本轮，不要重发。");
  assert.equal(copy.unknownStateText({ err: "timeout" }), "会话转交的状态未知（timeout）。先不要重发：一分钟后对方聊天里还没有出现这条请求再发一次，相同内容会被识别为同一件事。");
  assert.equal(copy.inlineFailedNote({ to: "X", code: "Q2AB", reason: "在对方聊天里被中止", failureClass: "aborted" }),
    "「X」没能完成 #Q2AB：在对方聊天里被中止。对方聊天里可能已经发过部分内容，不要重复发；把情况告诉这里的人。");
  assert.equal(copy.routeErrorText({ to: "任务群 a", reason: copy.reasonText("NOT_MEMBER") }), "发不到「任务群 a」的聊天：机器人不在这个聊天里");
});

test("copy: reason words stay within 30 characters", () => {
  const long = "x".repeat(200);
  for (const k of ["NO_ROUTE", "NOT_MEMBER", "CHAT_GONE", "CHANNEL_DOWN", "queue_timeout", "error", "aborted", "timeout", "restart", "cancelled", "ARCHIVED", "WHATEVER"]) {
    assert(charLength(copy.reasonText(k, { channel: "wecom", err: long, h: 6 })) <= 30, k);
  }
  assert.equal(copy.reasonText("CHANNEL_DOWN", { channel: "feishu" }), "飞书暂时发不出消息");
  assert.equal(copy.reasonText("queue_timeout", { h: 6 }), "这里一直在忙，等了 6 小时");
  assert.equal(copy.reasonText("error", { err: "model   overloaded\nretry" }), "处理时出错：model overloaded retry");
});

test("copy: §7.2 anchors, §7.3 hand-backs and §7.4 notes", () => {
  assert.deepEqual(copy.anchorHeadLines({ edge: "delegate", from: "X", code: "7F3A", depth: 1 }), ["📨 来自「X」的请求 #7F3A", "—"]);
  assert.deepEqual(copy.anchorHeadLines({ edge: "delegate", from: "X", code: "7F3A", depth: 2, maxDepth: 2, via: "X", root: "Tianyi 私聊" }),
    ["📨 来自「X」的请求 #7F3A", "经「X」转来 · 源头「Tianyi 私聊」", "—"]);
  assert.deepEqual(copy.anchorHeadLines({ edge: "followup", from: "X", code: "7F3A" }), ["📨「X」追加了一件事 #7F3A", "—"]);
  assert.deepEqual(copy.anchorHeadLines({ edge: "ask", from: "任务群 a", code: "Q2AB" }), ["❓「任务群 a」问 #Q2AB", "—"]);
  assert.equal(copy.collectAnchorText({ code: "7F3A", from: "X" }), "📨 #7F3A 的后台工作都结束了：请给出最终结果，会交回「X」");
  assert.equal(copy.busyLine({ n: 2 }), "⏳ 这里正在处理别的事，处理完就开始这条（前面还有 2 件）");
  assert.equal(copy.queuedLine({ m: 31 }), "⏳ 已排队 31 分钟：这里一直在忙，处理完就开始");
  assert.equal(copy.truncatedLine({ n: 820 }), "…（全文 820 字已交给 V）");
  assert.equal(copy.WECOM_LINE, "（企业微信里看不到处理过程，做完会发结果）");

  const ok = { to: "任务群 a", code: "7F3A", outcome: "result", kind: "request" };
  assert.equal(copy.handbackText([ok]), "↩️「任务群 a」交回了 #7F3A 的结果");
  assert.equal(copy.handbackText([{ ...ok, noReply: true }]), "↩️「任务群 a」交回了 #7F3A（没有文字结果，请到「任务群 a」查看）");
  assert.equal(copy.handbackText([{ ...ok, outcome: "failure", reason: "V 重启打断了处理" }]), "⚠️「任务群 a」没能完成 #7F3A：V 重启打断了处理");
  assert.equal(copy.handbackText([{ ...ok, outcome: "aborted" }]), "⏹「任务群 a」那边中止了 #7F3A");
  assert.equal(copy.handbackText([{ ...ok, kind: "ask" }]), "💬「任务群 a」回答了 #7F3A");
  const three = [ok, { ...ok, to: "b" }, { ...ok, to: "c", outcome: "failure" }];
  assert.equal(copy.handbackText(three), "↩️ 3 件都有结果了：「任务群 a」✅ ·「b」✅ ·「c」⚠️");
  const seven = Array.from({ length: 7 }, (_, i) => ({ ...ok, to: `房间${i}` }));
  const line = copy.handbackText(seven);
  assert.match(line, /^↩️ 7 件都有结果了：「房间0」✅ ·「房间1」✅ ·「房间2」✅ ·「房间3」✅ ·「房间4」✅ 等 7 件$/u);
  const longOnes = Array.from({ length: 5 }, (_, i) => ({ ...ok, to: `${"很长的群名".repeat(5)}${i}` }));
  assert(charLength(copy.handbackText(longOnes)) <= 200);

  assert.equal(copy.targetNotStartedNote({ code: "7F3A", reason: "这里一直在忙，等了 6 小时", from: "X" }), "⚠️ #7F3A 没有开始：这里一直在忙，等了 6 小时。已告诉「X」。");
  assert.equal(copy.targetInterruptedNote({ code: "7F3A", from: "X" }), "⚠️ #7F3A 做到一半 V 重启了，没做完。已告诉「X」。");
  assert.equal(copy.targetWedgedNote({ code: "7F3A", from: "X" }), "⚠️ #7F3A 做到一半 V 重启了，这个聊天可能要人工恢复后才能继续。已告诉「X」。");
  assert.equal(copy.targetCancelledNote({ code: "7F3A", reason: "运维撤回" }), "⏹ #7F3A 已撤回（运维撤回）。");
  assert.equal(copy.summaryInterruptedNote({ code: "7F3A" }), "⚠️ V 重启打断了 #7F3A 的汇总。结果已在本对话的上下文里，发一句「继续」就能接着汇报。");
});

test("copy: §8.3 contexts, §8.4 wake prompt with limits and category hints", () => {
  const ctx1 = copy.requestContext({ code: "7F3A", from: "Tianyi 私聊", fromKey: "agent:makaron:feishu:direct:ou_1", rootName: "Tianyi", depth: 1, maxDepth: 2, via: "Tianyi 私聊" });
  assert.match(ctx1, /^\[会话协作 #7F3A\] 这条请求来自「Tianyi 私聊」里的 V，代表 Tianyi。这是请求，不是 Tianyi 本人在这里说的话；/u);
  assert.match(ctx1, /sessions_send\(sessionKey="agent:makaron:feishu:direct:ou_1", timeoutSeconds=120\)/u);
  assert.match(ctx1, /需要时可以把子任务交给别的会话（timeoutSeconds=0）/u);
  assert.doesNotMatch(ctx1, /转来/u);
  const ctx2 = copy.requestContext({ code: "7F3A", from: "X", fromKey: "k", rootName: "Tianyi", depth: 2, maxDepth: 2, via: "X" });
  assert.match(ctx2, /代表 Tianyi（经「X」转来）/u);
  assert.match(ctx2, /不能再把活转给新的会话；可以用 timeoutSeconds=120 问本任务里的其他会话。/u);
  assert.equal(copy.askContext({ code: "Q2AB", from: "任务群 a" }), "[会话协作·提问 #Q2AB] 「任务群 a」的 V 在等你回答（它看不到本聊天的其他内容）。直接在回复里回答，回答会自动送回；本轮不能用 sessions_send。");
  assert.equal(copy.collectContext({ code: "7F3A", from: "X" }), "[会话协作 #7F3A] 你为「X」这条请求启动的后台工作都结束了。请给出最终结果（附上生成的文件），它会自动交回「X」。不要 NO_REPLY。");

  const at = Date.UTC(2026, 9, 20, 2, 5); // 10:05 in Shanghai
  const big = "长".repeat(5000);
  const prompt = copy.wakePrompt({ at, items: [
    { to: "a", code: "AAAA", outcome: "result", request: "r".repeat(400), text: big, media: ["https://x/1.png"] },
    { to: "b", code: "BBBB", outcome: "failure", request: "do b", reason: "V 重启打断了处理", failureClass: "interrupted" },
    { to: "c", code: "CCCC", outcome: "result", request: "do c", text: "", noReply: true },
  ] });
  assert.match(prompt, /^\[会话协作结果\] 你 10:05 交出的 3 件事都有了结果：\n1\.「a」#AAAA ✅\n   原请求（摘要）：r{300}\n   最终回复：/u);
  assert.match(prompt, /（已截断，全文在「a」聊天里）/u);
  assert.match(prompt, /   附件：\n   MEDIA: https:\/\/x\/1\.png/u);
  assert.match(prompt, /2\.「b」#BBBB ⚠️ V 重启打断了处理。V 重启打断了处理。对方保留了自己的上下文，可以对「b」再发一句「接着把 #BBBB 做完」。/u);
  assert.match(prompt, /3\.「c」#CCCC ✅[\s\S]*最终回复：（这一轮没有文字结果，可以到「c」聊天里看）/u);
  assert(charLength(prompt) < 4000 + 2000);
  // Total budget: five 4000-char replies stop at 16000 characters of reply text.
  const five = copy.wakePrompt({ at, items: Array.from({ length: 5 }, (_, i) => ({ to: `r${i}`, code: `C00${i}`, outcome: "result", request: "x", text: "字".repeat(4000) })) });
  assert(([...five].filter((c) => c === "字").length) <= 16000);

  assert.equal(copy.wakeContext({ rootName: "Tianyi" }), "[会话协作结果] 这是回程，不是 Tianyi 的新消息。对照最初的需求核对是否真的完成，在本聊天汇报一次；不要把结果再发回这些会话。没做完可以再交一次。");
  assert.match(copy.wakeContext({ rootName: "Tianyi", continuation: { parent: "Tianyi 私聊", code: "7F3A" } }), /\n你在为「Tianyi 私聊」的请求 #7F3A 做这件事，本轮最终回复会作为结果交回它：写完整，绝不能 NO_REPLY。$/u);
  assert.doesNotMatch(copy.wakeContext({ rootName: "Tianyi" }), /只回 NO_REPLY/u);

  assert.equal(copy.categoryHint("not_started"), "对方没有开始处理，可以重发一次或换个做法，不要假设对方收到了。");
  assert.equal(copy.categoryHint("interrupted", { wedge: true }), "对方聊天可能要人工恢复，先告诉这里的人。");
  assert.equal(copy.categoryHint("timeout", { to: "a" }), "超过 12 小时还没结束，不再等；需要的话直接去「a」看。");
  assert.equal(copy.pollGuardText({ code: "7F3A", to: "任务群 a" }), "你已把 #7F3A 交给「任务群 a」，结果会作为新的一轮自动回来。现在结束本轮（说清交给了谁、做什么），不要等待或轮询。");
  assert.match(copy.TOOL_GUIDANCE, /END YOUR TURN/u);
});

test("visible: MEDIA lines fold, secrets are hidden, audience and channel caps apply", () => {
  assert.deepEqual(foldMediaLines("看图\nMEDIA: https://a/1.png\nMEDIA:https://a/2.png"), { text: "看图\n附 2 个文件", files: 2 });
  const secrets = [
    "sk-proj-abcdefghijklmnopqrstuv", "ghp_abcdefghijklmnopqrstuvwxyz0123", "xoxb-1234567890-abcdef", "AKIAABCDEFGHIJKLMNOP",
    `${"-----BEGIN"} RSA PRIVATE KEY-----\nMIIabc\n${"-----END"} RSA PRIVATE KEY-----`, // split: scan-secrets.sh must not see a PEM header
    "0123456789abcdef0123456789abcdef01234567", "QmFzZTY0VG9rZW5XaXRoTWl4ZWRDYXNlMTIzNDU2Nzg5MA",
  ];
  for (const s of secrets) {
    const { text, redactions } = redactSecrets(`key: ${s} end`);
    assert.equal(redactions, 1, s);
    assert.equal(text, `key: ${REDACTED} end`, s);
  }
  // Long lowercase paths and Feishu ids stay readable.
  const keep = "/home/openclaw/.openclaw/v-session-relay/v2/sends and oc_0123456789abcdef0123456789abcdef";
  assert.equal(redactSecrets(keep).text, keep);

  const owner = { channel: "feishu", id: "ou_1", isOwner: true };
  assert.equal(audienceFor({ channel: "feishu", humans: "owner_only" }, owner), "full");
  assert.equal(audienceFor({ channel: "feishu", humans: "single_peer", peerId: "ou_1" }, owner), "full");
  assert.equal(audienceFor({ channel: "feishu", humans: "single_peer", peerId: "ou_2" }, owner), "shared");
  assert.equal(audienceFor({ channel: "feishu", humans: "shared" }, owner), "shared");
  assert.equal(audienceFor({ channel: "feishu", humans: "unknown" }, owner), "shared");

  const msg = "简".repeat(800);
  const full = visibleRequestBody(msg, { audience: "full", channel: "feishu" });
  assert.equal(full.trimmed, false);
  assert.equal(full.chars, 800);
  const shared = visibleRequestBody(msg, { audience: "shared", sharedChars: 200, channel: "feishu" });
  assert.equal(charLength(shared.visibleText), 200);
  assert.equal(shared.trimmed, true);
  const tooLong = visibleRequestBody("字".repeat(2000), { audience: "full", channel: "feishu" });
  assert.equal(charLength(tooLong.visibleText), CHANNEL_CAPS.feishu.maxVisibleChars);
  const tg = visibleRequestBody("t".repeat(5000), { audience: "full", channel: "telegram" });
  assert.equal(charLength(tg.visibleText), 3500);
  const wecom = visibleRequestBody("企".repeat(1000), { audience: "full", channel: "wecom" });
  assert(byteLength(wecom.visibleText) <= 3800);
});

test("visible: markdown channels bold the first line, escape, and keep WeCom under 3800 bytes", () => {
  assert.equal(escapeMarkdown("a*b_c`d[e]<f>#g|h~i\\"), "a\\*b\\_c\\`d\\[e\\]\\<f\\>\\#g\\|h\\~i\\\\");
  assert.equal(formatForChannel("feishu", ["📨 来自「X」的请求 #7F3A", "—", "*body*"]), "📨 来自「X」的请求 #7F3A\n—\n*body*");
  assert.equal(formatForChannel("telegram", ["a", null, "b"]), "a\nb");
  assert.equal(formatForChannel("dingtalk", ["📨 来自「X」的请求 #7F3A", "—", "*body*"]), "**📨 来自「X」的请求 #7F3A**\n\n—\n\n\\*body\\*");
  const out = formatForChannel("wecom", ["📨 head", "—", "企".repeat(1500), "（企业微信里看不到处理过程，做完会发结果）"]);
  assert(byteLength(out) <= 3800, String(byteLength(out)));
  assert.match(out, /^\*\*📨 head\*\*/u);
});

test("labels: §7.1 order, privacy of other people's chats, cross-agent prefix, 24 chars", () => {
  const ownerIds = ["ou_owner"];
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:feishu:group:oc_1", route: { chatType: "group", label: "任务群 a" } }), "任务群 a");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:feishu:group:oc_1", entry: { subject: "发布验收" } }), "发布验收");
  // e2e-r2 WeCom: a group with no name must not be called by 9.1's id-like displayName.
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:wecom:group:wrgrprooma0isr2", entry: { displayName: "wecom:g-wrgrprooma0isr2" } }), "一个群聊");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:wecom:group:wrgrprooma0isr2", entry: { displayName: "wecom:g-wrgrprooma0isr2", label: "运营群" } }), "运营群");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:feishu:direct:ou_owner", ownerIds }), "Tianyi 私聊");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:feishu:direct:ou_other", ownerIds }), "一个私聊");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:main" }), "V 主会话");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:cron:daily" }), "定时任务");
  assert.equal(sessionLabel({ sessionKey: "agent:makaron:webchat:abc" }), "V App");
  assert.equal(sessionLabel({ sessionKey: "agent:codex:feishu:group:oc_1", route: { chatType: "group", label: "群" }, viewerAgentId: "makaron", agentNames: { codex: "Codex" } }), "Codex · 群");
  const long = sessionLabel({ sessionKey: "agent:makaron:feishu:group:oc_1", route: { chatType: "group", label: "一个非常非常非常非常非常非常非常非常长的群名字啊啊啊" } });
  assert.equal(charLength(long), 24);
  assert.match(long, /…$/u);
});
