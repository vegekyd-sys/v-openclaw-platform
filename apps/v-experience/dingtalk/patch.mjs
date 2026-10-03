// Patches the DingTalk connector (@dingtalk-real-ai/dingtalk-connector 0.8.26,
// the build V runs) so its replies carry V's experience. See README.md.
//
//   patchDingtalkConnector(distDir, { experienceSource })
//
// writes `v-experience.mjs` next to the connector's chunks and rewrites the
// chunk that holds the reply dispatcher. Every anchor must match exactly once;
// an already patched chunk is left unchanged.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-experience-dingtalk-v1";
export const EXPERIENCE_FILE = "v-experience.mjs";

const replacements = [
  {
    name: "imports",
    anchor: 'import { createReplyPrefixOptions } from "openclaw/plugin-sdk/channel-outbound";\n',
    insert: "after",
    code: `// ${MARKER}
import * as vExperience from "./${EXPERIENCE_FILE}";
import { callGatewayFromCli as vCallGateway } from "openclaw/plugin-sdk/gateway-runtime";
`,
  },
  {
    // The dispatcher learns which session it answers, for progress and background work.
    name: "dispatcher-call",
    anchor: "\t\t\tsessionWebhook: data.sessionWebhook,\n\t\t\tasyncMode\n\t\t});",
    replace: "\t\t\tsessionWebhook: data.sessionWebhook,\n\t\t\tasyncMode,\n\t\t\tvSessionKey: sessionKey\n\t\t});",
  },
  {
    name: "work-view",
    anchor: "\tconst log = createLoggerFromConfig(account.config, `DingTalk:${accountId}`);\n\tlet currentCardTarget = null;\n",
    insert: "after",
    code: `\t// ${MARKER}: what the agent is doing, shown under the streaming answer.
\tlet vAnswerText = "";
\tlet vRefreshTimer = null;
\tconst vScheduleRefresh = () => {
\t\tif (vRefreshTimer) return;
\t\tvRefreshTimer = setTimeout(() => {
\t\t\tvRefreshTimer = null;
\t\t\tvoid vRefreshCard();
\t\t}, Math.max(50, 800 - (Date.now() - lastUpdateTime)));
\t\tvRefreshTimer.unref?.();
\t};
\tconst vWork = vExperience.createWorkView({ sessionKey: params.vSessionKey, onChange: () => vScheduleRefresh(), log: (message) => log.info(message) });
`,
  },
  {
    name: "helpers",
    anchor: "\tconst delayDefaults = cfg.agents?.defaults?.humanDelay;\n\tconst delayOverrides = resolveAgentConfig(cfg, agentId)?.humanDelay;\n\treturn {\n",
    insert: "before",
    code: `\t// ${MARKER}: rewrite the card with the answer so far and the work under it.
\tconst vRefreshCard = async () => {
\t\tif (streamingSealed || asyncMode || !streamingEnabled || !vWork.hasContent()) return;
\t\tawait startStreaming();
\t\tif (!currentCardTarget || streamingSealed) return;
\t\tif (Date.now() - lastUpdateTime < 800) {
\t\t\tvScheduleRefresh();
\t\t\treturn;
\t\t}
\t\tlastUpdateTime = Date.now();
\t\ttry {
\t\t\tawait streamAICard(currentCardTarget, vWork.compose(vAnswerText), false, account.config, log);
\t\t\toutboundUserVisibleThisTurn = true;
\t\t\tif (watchdogCard) armCardWatchdog();
\t\t} catch (err) {
\t\t\tlog.warn(\`[DingTalk][v-experience] work refresh failed: \${err?.message || err}\`);
\t\t}
\t};
\t// ${MARKER}: show a question as its own message. Worker runs announce it on the
\t// Gateway question listener; other runtimes also send it as a payload, which
\t// the connector used to drop. Either way it is shown once.
\tconst vSend = async (markdown) => {
\t\tawait sendMessage(account.config, sessionWebhook, markdown, { useMarkdown: true, log: params.runtime.log, cfg });
\t\toutboundUserVisibleThisTurn = true;
\t};
\tconst vDeliverQuestionRecord = async (question) => {
\t\tif (!question?.id) return false;
\t\tconst secret = question.questions?.some((q) => q.isSecret || q.secretStore);
\t\tif (!secret && !vExperience.isRenderableAsk(question)) return false;
\t\tif (!vExperience.claimQuestionDelivery(question.id)) return true;
\t\ttry {
\t\t\tif (secret) {
\t\t\t\tawait vSend(vExperience.secretQuestionNotice(question));
\t\t\t\tawait vCallGateway("question.resolve", { config: cfg }, { id: question.id, cancel: true, resolvedBy: "dingtalk:credential-unsupported" }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }).catch(() => {});
\t\t\t} else {
\t\t\t\tawait vSend(vExperience.askPromptMarkdown(question));
\t\t\t\tvExperience.trackChatQuestion({ channel: "dingtalk", chatKey: \`\${accountId ?? "default"}:\${conversationId}\`, senderId, record: question });
\t\t\t\tvWork.questionPending(true);
\t\t\t}
\t\t\tlog.info(\`[DingTalk][v-experience] delivered question \${question.id}\${secret ? " (credential, cancelled)" : ""}\`);
\t\t} catch (err) {
\t\t\tlog.error(\`[DingTalk][v-experience] question delivery failed: \${err?.message || err}\`);
\t\t}
\t\treturn true;
\t};
\tconst vDeliverToolPayload = async (payload) => {
\t\tconst questionId = payload?.channelData?.askUser?.questionId;
\t\tif (questionId) {
\t\t\ttry {
\t\t\t\tconst { question } = await vCallGateway("question.get", { config: cfg }, { id: questionId }, { scopes: ["operator.questions"], progress: false, timeoutMs: 3000 });
\t\t\t\tif (question?.status && question.status !== "pending") return true;
\t\t\t\tif (await vDeliverQuestionRecord(question)) return true;
\t\t\t} catch (err) {
\t\t\t\tlog.warn(\`[DingTalk][v-experience] question.get failed: \${err?.message || err}\`);
\t\t\t}
\t\t\tif (!vExperience.claimQuestionDelivery(questionId)) return true;
\t\t} else if (!payload?.channelData?.vSecretEntry && !/^\\s*🔑/u.test(String(payload?.text ?? ""))) return false;
\t\tif (String(payload?.text ?? "").trim()) await vSend(payload.text).catch((err) => log.error(\`[DingTalk][v-experience] tool payload delivery failed: \${err?.message || err}\`));
\t\treturn true;
\t};
\tconst vUnrouteQuestions = vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));
\t// ${MARKER}: after the answer, one line for the session's background work.
\tconst vStartBackground = (card, finalText) => {
\t\tvWork.dispose();
\t\tif (!params.vSessionKey || !card?.cardInstanceId) return;
\t\tconst put = async (text) => {
\t\t\tconst token = await getAccessToken(account.config);
\t\t\tawait dingtalkHttp.put(\`\${DINGTALK_API}/v1.0/card/instances\`, {
\t\t\t\toutTrackId: card.cardInstanceId,
\t\t\t\tcardData: { cardParamMap: { msgContent: text } },
\t\t\t\tcardUpdateOptions: { updateCardDataByKey: true }
\t\t\t}, { headers: { "x-acs-dingtalk-access-token": token, "Content-Type": "application/json" } });
\t\t};
\t\tvExperience.watchBackground({
\t\t\tchannel: \`dingtalk:\${accountId ?? "default"}\`,
\t\t\tsessionKey: params.vSessionKey,
\t\t\tshow: (line) => put(\`\${finalText}\\n\\n---\\n\\n\${line}\`),
\t\t\tretire: () => put(finalText),
\t\t\tlog: (message) => log.warn(message)
\t\t});
\t};
`,
  },
  {
    name: "finish-card",
    anchor: "\t\t\tawait finishCardOnce(cardSnapshot, finalText);\n",
    insert: "after",
    code: "\t\t\tvStartBackground(cardSnapshot, finalText);\n",
  },
  {
    name: "deliver-tool",
    anchor: "\t\t\tdeliver: async (payload, info) => {\n\t\t\t\tlet text = payload.text ?? \"\";\n",
    replace: "\t\t\tdeliver: async (payload, info) => {\n\t\t\t\tif (info?.kind === \"tool\" || payload?.channelData?.askUser) {\n\t\t\t\t\tif (await vDeliverToolPayload(payload) || info?.kind === \"tool\") return;\n\t\t\t\t}\n\t\t\t\tlet text = payload.text ?? \"\";\n",
  },
  {
    // A reply to a waiting question answers it directly instead of starting a
    // turn that may wait behind the one that asked.
    name: "chat-answer",
    anchor: "async function handleDingTalkMessage(params) {\n\tconst prepared = await prepareDingTalkMessage(params);\n\tif (!prepared) return;\n",
    insert: "after",
    code: `\t// ${MARKER}
\tconst vData = params.data ?? {};
\tconst vChatKey = \`\${params.accountId ?? "default"}:\${vData.conversationId}\`;
\tconst vSender = vData.senderStaffId || vData.senderId;
\tif (vExperience.hasTrackedQuestion({ channel: "dingtalk", chatKey: vChatKey, senderId: vSender })) {
\t\tconst vAnswer = await vExperience.answerTrackedQuestion({
\t\t\tchannel: "dingtalk",
\t\t\tchatKey: vChatKey,
\t\t\tsenderId: vSender,
\t\t\ttext: prepared.content?.text,
\t\t\tresolvedBy: \`dingtalk:chat:\${vSender}:\${vData.msgId}\`,
\t\t\tresolve: (id, answers, resolvedBy) => vCallGateway("question.resolve", { config: params.cfg }, { id, answers, resolvedBy }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
\t\t\tlog: (message) => params.runtime?.log?.(message)
\t\t});
\t\tif (vAnswer.handled) {
\t\t\tif (vAnswer.notice) await sendMessage(params.config, vData.sessionWebhook, vAnswer.notice, { useMarkdown: false }).catch(() => {});
\t\t\tawait recallEmotionReply(params.config, vData).catch(() => {});
\t\t\treturn;
\t\t}
\t}
`,
  },
  {
    name: "cleanup",
    anchor: "\t\t\t\tlog.info(`[DingTalk][onCleanup] 清理回调`);\n",
    insert: "after",
    code: "\t\t\t\tvWork.dispose();\n\t\t\t\tvUnrouteQuestions();\n",
  },
  {
    name: "partial-text",
    anchor: "\t\t\t\tif (currentCardTarget) {\n\t\t\t\t\taccumulatedText = payload.text;\n",
    insert: "after",
    code: "\t\t\t\t\tvAnswerText = payload.text;\n",
  },
  {
    name: "partial-compose",
    anchor: "\t\t\t\t\t\t\tawait streamAICard(currentCardTarget, displayContent, false, account.config, log);\n",
    replace: "\t\t\t\t\t\t\tvAnswerText = displayContent;\n\t\t\t\t\t\t\tawait streamAICard(currentCardTarget, vWork.compose(displayContent), false, account.config, log);\n",
  },
  {
    name: "partial-throttled",
    anchor: "\t\t\t\t\t} else log.debug(`[DingTalk][onPartialReply] 节流控制，跳过本次更新（距离上次更新 ${now - lastUpdateTime}ms）`);\n",
    replace: "\t\t\t\t\t} else {\n\t\t\t\t\t\tlog.debug(`[DingTalk][onPartialReply] 节流控制，跳过本次更新（距离上次更新 ${now - lastUpdateTime}ms）`);\n\t\t\t\t\t\tif (vWork.hasContent()) vScheduleRefresh();\n\t\t\t\t\t}\n",
  },
  {
    name: "progress-callbacks",
    anchor: "\t\t\tonCommandOutput: (payload) => {\n\t\t\t\tif (watchdogCard) armCardWatchdog();\n",
    insert: "before",
    code: `\t\t\tallowToolLifecycleWhenProgressHidden: true,
\t\t\tcommentaryProgressEnabled: true,
\t\t\tsuppressDefaultToolProgressMessages: true,
\t\t\tonToolStart: (payload) => {
\t\t\t\tif (watchdogCard) armCardWatchdog();
\t\t\t\tvWork.toolStart(payload);
\t\t\t},
\t\t\tonItemEvent: (payload) => {
\t\t\t\tvWork.itemEvent(payload);
\t\t\t},
\t\t\tonPlanUpdate: (payload) => {
\t\t\t\tvWork.planUpdate(payload);
\t\t\t},
\t\t\tonCompactionStart: () => {
\t\t\t\tvWork.compaction(true);
\t\t\t},
\t\t\tonCompactionEnd: () => {
\t\t\t\tvWork.compaction(false);
\t\t\t},
`,
  },
];

/** The rewritten chunk source; throws when an anchor is missing or ambiguous. */
export function patchReplyChunk(source) {
  if (source.includes(MARKER)) return source;
  let out = source;
  for (const r of replacements) {
    const count = out.split(r.anchor).length - 1;
    assert.equal(count, 1, `dingtalk anchor "${r.name}" matched ${count} times`);
    const next = r.replace ?? (r.insert === "after" ? r.anchor + r.code : r.code + r.anchor);
    out = out.replace(r.anchor, () => next);
  }
  return out;
}

/** The connector chunk that defines the reply dispatcher. */
export function findReplyChunk(distDir) {
  const matches = fs.readdirSync(distDir)
    .filter((f) => /^message-handler-[\w-]+\.mjs$/u.test(f))
    .filter((f) => fs.readFileSync(path.join(distDir, f), "utf8").includes("function createDingtalkReplyDispatcher(params)"));
  assert.equal(matches.length, 1, `expected one reply dispatcher chunk, found ${matches.length}`);
  return matches[0];
}

export function patchDingtalkConnector(distDir, { experienceSource }) {
  const chunk = findReplyChunk(distDir);
  const file = path.join(distDir, chunk);
  const before = fs.readFileSync(file, "utf8");
  const after = patchReplyChunk(before);
  fs.writeFileSync(file, after);
  fs.copyFileSync(experienceSource, path.join(distDir, EXPERIENCE_FILE));
  return { chunk, changed: before !== after, experience: EXPERIENCE_FILE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir] = process.argv.slice(2);
  assert(distDir, "usage: node patch.mjs <connector dist dir>");
  const experienceSource = new URL("../v-experience.mjs", import.meta.url).pathname;
  console.log(JSON.stringify(patchDingtalkConnector(distDir, { experienceSource })));
}
