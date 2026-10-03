// Patches the WeCom plugin (@wecom/wecom-openclaw-plugin 2026.8.17-vlab.2, the
// build V runs) so its replies carry V's experience. See ../README.md.
//
//   patchWeComPlugin(srcDir, { experienceSource })
//
// srcDir is the plugin's dist/src. Writes `v-experience.mjs` next to monitor.js
// and rewrites monitor.js. Every anchor must match exactly once; an already
// patched file is left unchanged.
//
// WeCom limits: a reply is one stream message that can be rewritten for six
// minutes after the user's message; after it is finished it cannot change.
// So the work shows inside the stream while the turn runs, the background
// line is part of the finished reply, and "后台任务已结束" is a new message.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-experience-wecom-v1";
export const EXPERIENCE_FILE = "v-experience.mjs";

const replacements = [
  {
    name: "imports",
    anchor: 'import { enqueueWeComChatTask } from "./chat-queue.js";\n',
    insert: "after",
    code: `// ${MARKER}
import * as vExperience from "./${EXPERIENCE_FILE}";
import { callGatewayFromCli as vCallGateway } from "openclaw/plugin-sdk/gateway-runtime";
`,
  },
  {
    name: "work-view",
    anchor: "    let isShowThink = !(account.sendThinkingMessage ?? true);\n    try {\n        // 记录 inbound session 元数据（session 追踪）\n",
    replace: `    let isShowThink = !(account.sendThinkingMessage ?? true);
    // ${MARKER}: stream the answer as it is written, with the work under it.
    const vSessionKey = ctxPayload.SessionKey ?? route.sessionKey;
    const vSender = frame.body?.from?.userid;
    let vPartial = "";
    let vLastFrame = 0;
    let vTimer = null;
    let vSending = Promise.resolve();
    const vFlush = () => {
        vTimer = null;
        if (state.vFinished || state.streamExpired || !state.streamId) return;
        const answer = maskTemplateCardBlocks(state.accumulatedText || vPartial, () => { });
        const text = vWork.compose(answer);
        if (!text.trim() || text === state.vLastSent) return;
        vLastFrame = Date.now();
        state.vLastSent = text;
        vSending = vSending.then(() => sendWeComReply({ wsClient, frame, text, runtime, finish: false, streamId: state.streamId })).catch((err) => {
            if (err instanceof StreamExpiredError) state.streamExpired = true;
            else runtime.error?.(\`[wecom][v-experience] stream update failed: \${String(err)}\`);
        });
    };
    const vSchedule = () => {
        if (vTimer || state.vFinished) return;
        vTimer = setTimeout(vFlush, Math.max(50, 1000 - (Date.now() - vLastFrame)));
        vTimer.unref?.();
    };
    const vWork = vExperience.createWorkView({ sessionKey: vSessionKey, onChange: vSchedule });
    const vStop = async () => {
        state.vFinished = true;
        if (vTimer) clearTimeout(vTimer);
        vTimer = null;
        vWork.dispose();
        await vSending;
        const line = vExperience.currentBackgroundLine(vSessionKey);
        if (line && state.accumulatedText) {
            state.accumulatedText += \`\\n\\n---\\n\\n\${line}\`;
            vExperience.watchBackground({
                channel: \`wecom:\${account.accountId}\`, sessionKey: vSessionKey,
                show: async (next) => {
                    if (!/已结束/u.test(next)) return;
                    await wsClient.sendMessage(chatId, { msgtype: "markdown", markdown: { content: next } });
                },
                log: (message) => runtime.log?.(message),
            });
        }
    };
    // ${MARKER}: questions come as tool or block payloads. Show them as their own
    // message, in Chinese, and remember them so the next message answers them.
    const vDeliverQuestion = async (payload) => {
        const questionId = payload?.channelData?.askUser?.questionId;
        const secretRequest = payload?.channelData?.vSecretEntry || /^\\s*🔑/u.test(String(payload?.text ?? ""));
        if (!questionId && !secretRequest) return false;
        let markdown;
        let question;
        if (questionId) {
            try {
                ({ question } = await vCallGateway("question.get", { config }, { id: questionId }, { scopes: ["operator.questions"], progress: false, timeoutMs: 3000 }));
                if (question?.status && question.status !== "pending") return true;
                if (vExperience.isRenderableAsk(question)) markdown = vExperience.askPromptMarkdown(question);
            }
            catch (err) {
                runtime.error?.(\`[wecom][v-experience] question.get failed: \${String(err)}\`);
            }
            vWork.questionPending(true);
        }
        markdown ??= payload.text;
        if (!String(markdown ?? "").trim()) return true;
        try {
            await wsClient.sendMessage(chatId, { msgtype: "markdown", markdown: { content: markdown } });
            if (question) vExperience.trackChatQuestion({ channel: "wecom", chatKey: \`\${account.accountId}:\${chatId}\`, senderId: vSender, record: question });
            runtime.log?.(\`[wecom][v-experience] delivered \${questionId ? "question " + questionId : "credential request"}\`);
        }
        catch (err) {
            runtime.error?.(\`[wecom][v-experience] question delivery failed: \${String(err)}\`);
            return false;
        }
        return true;
    };
    try {
        // 记录 inbound session 元数据（session 追踪）
`,
  },
  {
    name: "reply-options",
    anchor: "            replyOptions: {\n",
    insert: "after",
    code: `                onPartialReply: (payload) => {
                    if (!payload?.text) return;
                    vPartial = payload.text;
                    vSchedule();
                },
                onToolStart: (payload) => { vWork.toolStart(payload); },
                onItemEvent: (payload) => { vWork.itemEvent(payload); },
                onPlanUpdate: (payload) => { vWork.planUpdate(payload); },
                onCompactionStart: () => { vWork.compaction(true); },
                onCompactionEnd: () => { vWork.compaction(false); },
`,
  },
  {
    name: "deliver-question",
    anchor: "                deliver: async (payload, info) => {\n",
    insert: "after",
    code: `                    if ((info.kind === "tool" || payload?.channelData?.askUser) && await vDeliverQuestion(payload)) return;
`,
  },
  {
    name: "finish",
    anchor: "        // 关闭 thinking 流\n        await finishThinkingStream(ctx);\n        safeCleanup();\n",
    insert: "before",
    code: "        await vStop();\n",
  },
  {
    name: "finish-on-error",
    anchor: "            await finishThinkingStream(ctx);\n        }\n        catch (finishErr) {\n",
    replace: "            await vStop().catch(() => { });\n            await finishThinkingStream(ctx);\n        }\n        catch (finishErr) {\n",
  },
  {
    // An answer to a waiting question must not queue behind the turn that asked it.
    name: "chat-answer",
    anchor: "                if (!entry)\n                    return;\n                // 按 accountId:chatId 串行排队",
    replace: `                if (!entry)
                    return;
                // ${MARKER}
                const vChatKey = \`\${entry.account.accountId}:\${entry.chatId}\`;
                const vSender = frame.body?.from?.userid;
                if (vExperience.hasTrackedQuestion({ channel: "wecom", chatKey: vChatKey, senderId: vSender })) {
                    const vAnswer = await vExperience.answerTrackedQuestion({
                        channel: "wecom", chatKey: vChatKey, senderId: vSender, text: entry.text,
                        resolvedBy: \`wecom:chat:\${vSender}:\${entry.messageId}\`,
                        resolve: (id, answers, resolvedBy) => vCallGateway("question.resolve", { config: entry.config }, { id, answers, resolvedBy }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
                        log: (message) => runtime.log?.(message),
                    });
                    if (vAnswer.handled) {
                        await sendWeComReply({ wsClient, frame, text: vAnswer.notice ?? "✓ 已收到", runtime, finish: true }).catch(() => { });
                        return;
                    }
                }
                // 按 accountId:chatId 串行排队`,
  },
];

export function patchMonitor(source) {
  if (source.includes(MARKER)) return source;
  let out = source;
  for (const r of replacements) {
    const count = out.split(r.anchor).length - 1;
    assert.equal(count, 1, `wecom anchor "${r.name}" matched ${count} times`);
    const next = r.replace ?? (r.insert === "after" ? r.anchor + r.code : r.code + r.anchor);
    out = out.replace(r.anchor, () => next);
  }
  return out;
}

export function patchWeComPlugin(srcDir, { experienceSource }) {
  const file = path.join(srcDir, "monitor.js");
  const before = fs.readFileSync(file, "utf8");
  const after = patchMonitor(before);
  fs.writeFileSync(file, after);
  fs.copyFileSync(experienceSource, path.join(srcDir, EXPERIENCE_FILE));
  return { file: "monitor.js", changed: before !== after, experience: EXPERIENCE_FILE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [srcDir] = process.argv.slice(2);
  assert(srcDir, "usage: node patch.mjs <plugin dist/src dir>");
  const experienceSource = new URL("../v-experience.mjs", import.meta.url).pathname;
  console.log(JSON.stringify(patchWeComPlugin(srcDir, { experienceSource })));
}
