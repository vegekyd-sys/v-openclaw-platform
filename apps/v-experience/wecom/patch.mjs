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
// The WeCom desktop client shows nothing of a stream until it is finished, so
// a question finishes the stream (text so far + the question); the rest of the
// reply goes out as a new message through the plugin's expired-stream path.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-experience-wecom-v2";
export const EXPERIENCE_FILE = "v-experience.mjs";

const replacements = [
  {
    name: "imports",
    anchor: 'import { enqueueWeComChatTask } from "./chat-queue.js";\n',
    insert: "after",
    code: `// ${MARKER}
import * as vExperience from "./${EXPERIENCE_FILE}";
import { callGatewayFromCli as vCallGateway } from "openclaw/plugin-sdk/gateway-runtime";
import { formatChannelProgressDraftLineForEntry as vFormatProgressLine } from "openclaw/plugin-sdk/channel-outbound";
import { resolveWecomCommandAuthorization as vResolveCommandAuthorization } from "./shared/command-auth.js";
`,
  },
  {
    // The bot (websocket) path marked every message as an authorized command.
    // Use the plugin's own helper, as its agent path does: only command-like
    // text, from a sender the DM policy admits. The helper defaults dmPolicy to
    // "pairing" where this path's gate defaults to "open"; follow the gate.
    // Which commands that sender may run is then the core's decision
    // (commands.allowFrom, commands.ownerAllowFrom).
    name: "command-auth",
    anchor: "        CommandAuthorized: true,\n        ResponseUrl: body.response_url,\n",
    replace: `        // ${MARKER}: CommandAuthorized from the core's helpers instead of always true.
        CommandAuthorized: (await vResolveCommandAuthorization({
            core,
            cfg: config,
            accountConfig: { ...account.config, dmPolicy: account.config.dmPolicy ?? "open" },
            rawBody: messageBody,
            senderUserId: body.from.userid,
        })).commandAuthorized === true,
        ResponseUrl: body.response_url,
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
        vTimer = setTimeout(vFlush, Math.max(50, 400 - (Date.now() - vLastFrame)));
        vTimer.unref?.();
    };
    // Same tool line as Feishu ("🛠️ Exec"). WeCom has no send-message links,
    // so question options are numbered for typing.
    const vWork = vExperience.createWorkView({
        sessionKey: vSessionKey, onChange: vSchedule, log: (message) => runtime.log?.(message),
        formatTool: (name, phase) => vFormatProgressLine(account, { event: "tool", name, phase }, { detailMode: "status", commandText: "status" }),
    });
    const vStop = async () => {
        state.vFinished = true;
        if (vTimer) clearTimeout(vTimer);
        vTimer = null;
        vWork.dispose();
        vUnrouteQuestions();
        await vSending;
        state.accumulatedText = vWork.finalText(state.accumulatedText);
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
    // ${MARKER}: show a question as its own message, in Chinese, and remember it
    // so the next message answers it. Worker runs announce questions on the
    // Gateway question listener; other runtimes send a payload. Shown once.
    const vSend = (markdown) => wsClient.sendMessage(chatId, { msgtype: "markdown", markdown: { content: markdown } });
    const vDeliverQuestionRecord = async (question) => {
        if (!question?.id) return false;
        const secret = question.questions?.some((q) => q.isSecret || q.secretStore);
        if (!secret && !vExperience.isRenderableAsk(question)) return false;
        if (!vExperience.claimQuestionDelivery(question.id)) return true;
        try {
            let vSecretHow = "";
            if (secret) {
                // A one-time entry link, only in the asker's direct chat (a
                // direct chat's id is the user id). Else notice + cancel.
                vSecretHow = await vExperience.deliverSecretQuestion({
                    record: question, channel: "wecom", askerId: vSender, direct: chatType !== "group", markdown: true,
                    sendHere: (text) => vSend(text),
                    sendPrivate: vSender ? (text) => wsClient.sendMessage(vSender, { msgtype: "markdown", markdown: { content: text } }) : undefined,
                    cancel: () => vCallGateway("question.resolve", { config }, { id: question.id, cancel: true, resolvedBy: "wecom:credential-unsupported" }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
                    log: (message) => runtime.log?.(message),
                });
            }
            else if (state.streamId && !state.streamExpired && !state.vFinished) {
                // The reply so far and the question close the stream, so every
                // client shows the question; the answer follows as a new message.
                vWork.showQuestion(question, { prefix: maskTemplateCardBlocks(state.accumulatedText || vPartial, () => { }) });
                state.accumulatedText = "";
                vPartial = "";
                if (vTimer) clearTimeout(vTimer);
                vTimer = null;
                const closing = vWork.compose("");
                state.streamExpired = true;
                await vSending;
                await sendWeComReply({ wsClient, frame, text: closing, runtime, finish: true, streamId: state.streamId }).catch(async (err) => {
                    runtime.error?.(\`[wecom][v-experience] closing stream at question failed: \${String(err)}\`);
                    await vSend(closing);
                });
                vWork.closedAtQuestion();
                vExperience.trackChatQuestion({
                    channel: "wecom", chatKey: \`\${account.accountId}:\${chatId}\`, senderId: vSender, record: question, inline: true,
                    onStaged: (staged) => vWork.stageQuestion(staged),
                    onAnswered: (answers) => vWork.questionAnswered(answers),
                });
            }
            else {
                await vSend(vExperience.askPromptMarkdown(question));
                vExperience.trackChatQuestion({ channel: "wecom", chatKey: \`\${account.accountId}:\${chatId}\`, senderId: vSender, record: question });
            }
            runtime.log?.(\`[wecom][v-experience] delivered question \${question.id}\${secret ? \` (credential, \${vSecretHow})\` : ""}\`);
        }
        catch (err) {
            runtime.error?.(\`[wecom][v-experience] question delivery failed: \${String(err)}\`);
        }
        return true;
    };
    const vDeliverQuestion = async (payload) => {
        const questionId = payload?.channelData?.askUser?.questionId;
        if (questionId) {
            try {
                const { question } = await vCallGateway("question.get", { config }, { id: questionId }, { scopes: ["operator.questions"], progress: false, timeoutMs: 3000 });
                if (question?.status && question.status !== "pending") return true;
                if (await vDeliverQuestionRecord(question)) return true;
            }
            catch (err) {
                runtime.error?.(\`[wecom][v-experience] question.get failed: \${String(err)}\`);
            }
            if (!vExperience.claimQuestionDelivery(questionId)) return true;
        }
        else if (!payload?.channelData?.vSecretEntry && !/^\\s*🔑/u.test(String(payload?.text ?? ""))) return false;
        if (String(payload?.text ?? "").trim()) await vSend(payload.text).catch((err) => runtime.error?.(\`[wecom][v-experience] question delivery failed: \${String(err)}\`));
        return true;
    };
    const vUnrouteQuestions = vExperience.onQuestionRequested(vSessionKey, (record) => vDeliverQuestionRecord(record));
    try {
        // 记录 inbound session 元数据（session 追踪）
`,
  },
  {
    name: "reply-options",
    anchor: "            replyOptions: {\n",
    insert: "after",
    code: `                allowToolLifecycleWhenProgressHidden: true,
                commentaryProgressEnabled: true,
                suppressDefaultToolProgressMessages: true,
                onPartialReply: (payload) => {
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
    name: "queue-imports",
    anchor: 'import { enqueueWeComChatTask } from "./chat-queue.js";\n',
    replace: 'import { enqueueWeComChatTask, hasActiveTask as vHasActiveTask, buildQueueKey as vBuildQueueKey } from "./chat-queue.js";\n',
  },
  {
    // Same entry as the DingTalk connector: the low-level channel dispatch lets
    // OpenClaw's queue policy steer a message into the running turn instead of
    // waiting for that turn to finish.
    name: "dispatch-active-queue",
    anchor: "        await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({\n            ctx: ctxPayload,\n            cfg: config,\n",
    insert: "after",
    code: "            dispatchReplyFromConfig: core.channel.reply.dispatchReplyFromConfig,\n",
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
                        if (vExperience.shouldSendAnswerNotice(vAnswer)) await sendWeComReply({ wsClient, frame, text: vAnswer.notice, runtime, finish: true }).catch(() => { });
                        return;
                    }
                }
                // A message sent while V is replying goes to the running turn
                // (OpenClaw steers it) instead of waiting behind it, like V's
                // Feishu active-run lane.
                if (vHasActiveTask(vBuildQueueKey(entry.account.accountId, entry.chatId))) {
                    enqueueWeComChatTask({ accountId: entry.account.accountId, chatId: \`\${entry.chatId}:active-run\`, task: () => processWeComMessageNow(entry) });
                    runtime.log?.(\`[wecom][v-experience] message during a running reply sent to the active run, chat=\${entry.chatId}\`);
                    return;
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
