// Patches the DingTalk connector (@dingtalk-real-ai/dingtalk-connector 0.8.26,
// the build V runs) so its replies carry V's experience. See README.md.
//
//   patchDingtalkConnector(distDir, { experienceSource })
//
// writes `v-experience.mjs` next to the connector's chunks and rewrites the
// chunk that holds the reply dispatcher, the Stream connection chunk (question
// card callbacks) and the channel chunk (link cards as actionCards). Every
// anchor must match exactly once; an already patched chunk is left unchanged.
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
import { formatChannelProgressDraftLineForEntry as vFormatProgressLine } from "openclaw/plugin-sdk/channel-outbound";
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
\t\t}, Math.max(50, updateInterval - (Date.now() - lastUpdateTime)));
\t\tvRefreshTimer.unref?.();
\t};
\t// Same tool line as Feishu ("🛠️ Exec"); options are links that send the
\t// choice as the person's message.
\tconst vWork = vExperience.createWorkView({
\t\tsessionKey: params.vSessionKey,
\t\tonChange: () => vScheduleRefresh(),
\t\tlog: (message) => log.info(message),
\t\tformatTool: (name, phase) => vFormatProgressLine(account.config, { event: "tool", name, phase }, { detailMode: "status", commandText: "status" }),
\t\toptionLink: (text) => \`dtmd://dingtalkclient/sendMessage?content=\${encodeURIComponent(text)}\`
\t});
`,
  },
  {
    name: "helpers",
    anchor: "\tconst delayDefaults = cfg.agents?.defaults?.humanDelay;\n\tconst delayOverrides = resolveAgentConfig(cfg, agentId)?.humanDelay;\n\treturn {\n",
    insert: "before",
    code: `\t// ${MARKER}: rewrite the card with the answer so far and the work under it.
\tconst vRefreshCard = async () => {
\t\tif (streamingSealed || asyncMode || !streamingEnabled || (!vWork.hasContent() && !vAnswerText)) return;
\t\tawait startStreaming();
\t\tif (!currentCardTarget || streamingSealed) return;
\t\tif (Date.now() - lastUpdateTime < updateInterval) {
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
\t// ${MARKER}: the question card template (real buttons); without it options
\t// are links inside the reply card.
\tconst vQuestionTemplate = process.env.V_DINGTALK_QUESTION_CARD_TEMPLATE?.trim() || "";
\t// ${MARKER}: finish the current card with what it shows now; the next update
\t// (after the answer) opens a new one below the question.
\tconst vSplitCard = async () => {
\t\tif (cardCreationPromise) await cardCreationPromise.catch(() => {});
\t\tconst card = currentCardTarget;
\t\tif (!card) return;
\t\tcurrentCardTarget = null;
\t\tclearCardWatchdog();
\t\tconst shown = vWork.compose(vAnswerText);
\t\tvAnswerText = "";
\t\taccumulatedText = "";
\t\ttry {
\t\t\tawait finishCardOnce(card, shown || "…");
\t\t} catch (err) {
\t\t\tlog.warn(\`[DingTalk][v-experience] card split failed: \${err?.message || err}\`);
\t\t}
\t};
\t// ${MARKER}: questions go into the reply card, as in Feishu. Worker runs
\t// announce them on the Gateway question listener; other runtimes also send
\t// a payload, which the connector used to drop. Either way: shown once.
\tconst vSend = async (markdown) => {
\t\tawait sendMessage(account.config, sessionWebhook, markdown, { useMarkdown: true, log: params.runtime.log, cfg });
\t\toutboundUserVisibleThisTurn = true;
\t};
\t// ${MARKER}: a link card (credential link) as an actionCard with one button.
\tconst vSendCard = async (card) => {
\t\tconst resp = await dingtalkHttp.post(sessionWebhook, { msgtype: "actionCard", actionCard: vExperience.dingtalkActionCard(card) }, { headers: { "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" } });
\t\tif (resp?.data?.errcode) throw new Error(\`actionCard not sent: \${JSON.stringify(resp.data).slice(0, 200)}\`);
\t\toutboundUserVisibleThisTurn = true;
\t};
\tconst vDeliverQuestionRecord = async (question) => {
\t\tif (!question?.id) return false;
\t\tconst secret = question.questions?.some((q) => q.isSecret || q.secretStore);
\t\tif (!secret && !vExperience.isRenderableAsk(question)) return false;
\t\tif (!vExperience.claimQuestionDelivery(question.id)) return true;
\t\ttry {
\t\t\tlet vSecretHow = "";
\t\t\tif (secret) {
\t\t\t\t// A one-time entry link, only in the asker's direct chat; a group
\t\t\t\t// gets it through the robot's 1:1 message. Else notice + cancel.
\t\t\t\tvSecretHow = await vExperience.deliverSecretQuestion({
\t\t\t\t\trecord: question, channel: "dingtalk", askerId: senderId, direct: isDirect, markdown: true,
\t\t\t\t\tsendHere: (text, card) => vExperience.sendCardOrText({ card, text, sendCard: vSendCard, sendText: vSend, log: (message) => log.warn(message) }),
\t\t\t\t\tsendPrivate: senderId ? async (text, card) => {
\t\t\t\t\t\tconst batchSend = async (msgKey, msgParam) => {
\t\t\t\t\t\t\tconst resp = await dingtalkHttp.post(\`\${DINGTALK_API}/v1.0/robot/oToMessages/batchSend\`, {
\t\t\t\t\t\t\t\trobotCode: String(account.config.clientId ?? ""), userIds: [String(senderId)],
\t\t\t\t\t\t\t\tmsgKey, msgParam: JSON.stringify(msgParam)
\t\t\t\t\t\t\t}, { headers: { "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" } });
\t\t\t\t\t\t\tconst data = resp?.data ?? {};
\t\t\t\t\t\t\tif (!data.processQueryKey || data.invalidStaffIdList?.length || data.flowControlledStaffIdList?.length) throw new Error(\`private message not sent: \${JSON.stringify(data).slice(0, 200)}\`);
\t\t\t\t\t\t};
\t\t\t\t\t\tawait vExperience.sendCardOrText({
\t\t\t\t\t\t\tcard, text, log: (message) => log.warn(message),
\t\t\t\t\t\t\tsendCard: (c) => batchSend("sampleActionCard", vExperience.dingtalkActionCard(c)),
\t\t\t\t\t\t\tsendText: (t) => batchSend("sampleMarkdown", { title: "V 需要凭据", text: t })
\t\t\t\t\t\t});
\t\t\t\t\t} : void 0,
\t\t\t\t\tcancel: () => vCallGateway("question.resolve", { config: cfg }, { id: question.id, cancel: true, resolvedBy: "dingtalk:credential-unsupported" }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
\t\t\t\t\tlog: (message) => log.info(message)
\t\t\t\t});
\t\t\t} else if (vQuestionTemplate && streamingEnabled && !asyncMode && !streamingSealed) {
\t\t\t\t// Real buttons: the question gets its own interactive card below this
\t\t\t\t// reply; the reply closes here and the answer opens a new one below.
\t\t\t\tvWork.questionElsewhere();
\t\t\t\tawait vSplitCard();
\t\t\t\tconst outTrackId = \`vq_\${Date.now()}_\${Math.random().toString(36).slice(2, 10)}\`;
\t\t\t\tconst robotCode = String(account.config.clientId ?? "");
\t\t\t\tconst space = isDirect
\t\t\t\t\t? { openSpaceId: \`dtv1.card//IM_ROBOT.\${senderId}\`, imRobotOpenDeliverModel: { spaceType: "IM_ROBOT", robotCode } }
\t\t\t\t\t: { openSpaceId: \`dtv1.card//IM_GROUP.\${conversationId}\`, imGroupOpenDeliverModel: { robotCode } };
\t\t\t\tconst headers = async () => ({ "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" });
\t\t\t\tconst resp = await dingtalkHttp.post(\`\${DINGTALK_API}/v1.0/card/instances/createAndDeliver\`, {
\t\t\t\t\tcardTemplateId: vQuestionTemplate, outTrackId, callbackType: "STREAM", userIdType: 1,
\t\t\t\t\tcardData: { cardParamMap: vExperience.dingtalkQuestionCardData(question) },
\t\t\t\t\timGroupOpenSpaceModel: { supportForward: false }, imRobotOpenSpaceModel: { supportForward: false },
\t\t\t\t\t...space
\t\t\t\t}, { headers: await headers() });
\t\t\t\tif (resp?.data?.success === false) throw new Error(\`question card not delivered: \${JSON.stringify(resp.data).slice(0, 300)}\`);
\t\t\t\toutboundUserVisibleThisTurn = true;
\t\t\t\tconst resolve = (answers, resolvedBy) => vCallGateway("question.resolve", { config: cfg }, { id: question.id, answers, resolvedBy }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 });
\t\t\t\tvExperience.trackDingtalkQuestionCard({
\t\t\t\t\toutTrackId, record: question, asker: senderId, resolve,
\t\t\t\t\tonAnswered: (answers) => { vExperience.untrackChatQuestion(question.id); vWork.questionAnswered(answers); },
\t\t\t\t\tlog: (message) => log.info(message)
\t\t\t\t});
\t\t\t\t// A typed answer works too; the card then shows it.
\t\t\t\tvExperience.trackChatQuestion({
\t\t\t\t\tchannel: "dingtalk", chatKey: \`\${accountId ?? "default"}:\${conversationId}\`, senderId, record: question, inline: true,
\t\t\t\t\tonAnswered: (answers) => {
\t\t\t\t\t\tvWork.questionAnswered(answers);
\t\t\t\t\t\tconst data = vExperience.closeDingtalkQuestionCard(outTrackId, "answered", answers);
\t\t\t\t\t\tif (data) headers().then((h) => dingtalkHttp.put(\`\${DINGTALK_API}/v1.0/card/instances\`, { outTrackId, cardData: { cardParamMap: data }, cardUpdateOptions: { updateCardDataByKey: true } }, { headers: h })).catch((err) => log.warn(\`[DingTalk][v-experience] question card update failed: \${err?.message || err}\`));
\t\t\t\t\t}
\t\t\t\t});
\t\t\t} else if (streamingEnabled && !asyncMode && !streamingSealed) {
\t\t\t\t// Inside the card: what was written so far stays above the question,
\t\t\t\t// the answer continues below it.
\t\t\t\tvWork.showQuestion(question, { prefix: vAnswerText });
\t\t\t\tvAnswerText = "";
\t\t\t\taccumulatedText = "";
\t\t\t\tvExperience.trackChatQuestion({
\t\t\t\t\tchannel: "dingtalk", chatKey: \`\${accountId ?? "default"}:\${conversationId}\`, senderId, record: question, inline: true,
\t\t\t\t\tonStaged: (staged) => vWork.stageQuestion(staged),
\t\t\t\t\tonAnswered: (answers) => vWork.questionAnswered(answers)
\t\t\t\t});
\t\t\t\tawait vRefreshCard();
\t\t\t} else {
\t\t\t\tawait vSend(vExperience.askPromptMarkdown(question));
\t\t\t\tvExperience.trackChatQuestion({ channel: "dingtalk", chatKey: \`\${accountId ?? "default"}:\${conversationId}\`, senderId, record: question });
\t\t\t}
\t\t\tlog.info(\`[DingTalk][v-experience] delivered question \${question.id}\${secret ? \` (credential, \${vSecretHow})\` : ""}\`);
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
\t\t// A finished AI card shows what its last finalize wrote, so the line is
\t\t// written the same way the connector finishes a card.
\t\tconst put = async (text) => {
\t\t\tawait finishAICard({ ...card, tokenExpireTime: 0 }, text, account.config, log);
\t\t\tlog.info(\`[DingTalk][v-experience] background line written to \${card.cardInstanceId}\`);
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
    // No new card while a question card waits: it would land above the answer.
    name: "start-guard",
    anchor: "\tconst startStreaming = () => {\n\t\tif (streamingSealed) {\n",
    replace: "\tconst startStreaming = () => {\n\t\tif (!currentCardTarget && !cardCreationPromise && vWork.waitingForAnswer()) return Promise.resolve();\n\t\tif (streamingSealed) {\n",
  },
  {
    // Button clicks on question cards come back over Stream (before connect()).
    file: "connection",
    name: "card-callback",
    anchor: "\t\tclient.registerCallbackListener(TOPIC_ROBOT, async (res) => {\n",
    insert: "before",
    code: `\t\t// ${MARKER}: question card buttons.
\t\tclient.registerCallbackListener("/v1.0/card/instances/callback", async (res) => {
\t\t\tlet reply;
\t\t\ttry {
\t\t\t\treply = await vExperience.handleDingtalkCardCallback(JSON.parse(res.data ?? "{}"));
\t\t\t} catch (err) {
\t\t\t\tlogger.warn(\`[DingTalk][v-experience] card callback failed: \${err?.message || err}\`);
\t\t\t}
\t\t\tclient.socketCallBackResponse(res.headers?.messageId, reply ?? {});
\t\t});
`,
  },
  {
    file: "runtime",
    name: "runtime-imports",
    anchor: /^import \{ n as sendMediaToDingTalk, o as sendTextToDingTalk \} from "(\.\/messaging-[\w-]+\.mjs)";\n/mu,
    after: (m) => `// ${MARKER}
import { i as vSendProactive } from "${m[1]}";
import * as vExperience from "./${EXPERIENCE_FILE}";
import { sendPayloadWithChunkedTextAndMedia as vSendTextAndMedia } from "openclaw/plugin-sdk/reply-payload";
`,
  },
  {
    // The connector's token helpers and hosts (0.8.26 exports:
    // getOapiAccessToken as i, DINGTALK_OAPI as n, getAccessToken as r, DINGTALK_API as t).
    file: "runtime",
    name: "runtime-token-import",
    anchor: /^import "(\.\/token-[\w-]+\.mjs)";\n/mu,
    after: (m) => `import { i as vGetOapiAccessToken, n as vDingtalkOapi, r as vGetAccessToken, t as vDingtalkApi } from "${m[1]}"; // ${MARKER}\n`,
  },
  {
    // \`openclaw message send --presentation\` (V's desktop handoff card) used
    // to arrive as flattened text. A presentation with link buttons now goes
    // out as an actionCard; anything else is sent as before.
    file: "runtime",
    name: "outbound-card",
    anchor: "\toutbound: {\n\t\tdeliveryMode: \"direct\",\n",
    insert: "after",
    code: `\t\t// ${MARKER}: buttons as a DingTalk actionCard: links, and slash commands as send-message links.
\t\trenderPresentation: ({ payload, presentation }) => {
\t\t\tconst card = vExperience.linkCardFromPresentation(presentation, payload.text, { commands: true });
\t\t\treturn card ? { ...payload, text: vExperience.linkCardText(card), channelData: { ...payload.channelData, vLinkCard: card } } : null;
\t\t},
\t\tsendPayload: async (ctx) => {
\t\t\tconst card = ctx.payload?.channelData?.vLinkCard;
\t\t\tconst out = dingtalkPlugin.outbound;
\t\t\tif (!card) return vSendTextAndMedia({ ctx, textChunkLimit: out.textChunkLimit, chunker: out.chunker, sendText: out.sendText, sendMedia: out.sendMedia, emptyResult: { channel: CHANNEL_ID, messageId: "" } });
\t\t\tconst account = resolveDingtalkAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
\t\t\tconst config = {
\t\t\t\t...account.config,
\t\t\t\t...account.clientId != null ? { clientId: account.clientId } : {},
\t\t\t\t...account.clientSecret != null ? { clientSecret: account.clientSecret } : {}
\t\t\t};
\t\t\tconst to = String(ctx.to ?? "");
\t\t\tconst target = to.startsWith("group:") ? { openConversationId: to.slice(6) } : to.startsWith("user:") ? { userId: to.slice(5) } : to.startsWith("cid") ? { openConversationId: to } : { userId: to };
\t\t\tif (!card.image && !card.buttons.some((b) => b.command)) {
\t\t\t\tconst result = await vSendProactive(config, target, JSON.stringify(vExperience.dingtalkActionCard(card)), { msgType: "actionCard", useAICard: false });
\t\t\t\tif (!result.ok) throw new Error(result.error || "DingTalk actionCard delivery failed");
\t\t\t\tvExperience.noteChannelSend(CHANNEL_ID, to);
\t\t\t\treturn { channel: CHANNEL_ID, messageId: result.processQueryKey ?? "unknown", target: { kind: "conversation", id: to } };
\t\t\t}
\t\t\t// ${MARKER}: V's 「电脑」 card — the desktop picture (uploaded as robot media; a
\t\t\t// local file the handoff plugin left here) and every button, 接管 as a link,
\t\t\t// 我完成了 / 跳过 as send-message links that post the command as the tapper.
\t\t\tconst shown = { ...card };
\t\t\tconst picture = vExperience.localCardImage(card.image?.ref);
\t\t\tif (picture) {
\t\t\t\tdelete shown.image;
\t\t\t\ttry {
\t\t\t\t\tconst oapiToken = await vGetOapiAccessToken(config);
\t\t\t\t\tif (!oapiToken) throw new Error("no oapi access token");
\t\t\t\t\tconst form = new FormData();
\t\t\t\t\tform.append("media", new Blob([picture.bytes], { type: picture.type }), picture.filename);
\t\t\t\t\tconst uploaded = await (await fetch(\`\${vDingtalkOapi}/media/upload?access_token=\${encodeURIComponent(oapiToken)}&type=image\`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) })).json();
\t\t\t\t\tif (!uploaded?.media_id) throw new Error(\`media upload: \${JSON.stringify(uploaded).slice(0, 200)}\`);
\t\t\t\t\tshown.image = { alt: card.image.alt, ref: uploaded.media_id };
\t\t\t\t} catch (err) {
\t\t\t\t\tconsole.warn(\`[DingTalk][v-experience] card picture not uploaded, sending the card without it: \${err?.message || err}\`);
\t\t\t\t}
\t\t\t} else if (card.image && !String(card.image.ref).startsWith("https://")) delete shown.image;
\t\t\tconst { msgKey, msgParam } = vExperience.dingtalkRobotActionCard(shown);
\t\t\tconst isUser = !target.openConversationId;
\t\t\tconst resp = await dingtalkHttp.post(\`\${vDingtalkApi}/v1.0/robot/\${isUser ? "oToMessages/batchSend" : "groupMessages/send"}\`, {
\t\t\t\trobotCode: String(config.clientId ?? ""), msgKey, msgParam: JSON.stringify(msgParam),
\t\t\t\t...isUser ? { userIds: [String(target.userId)] } : { openConversationId: target.openConversationId }
\t\t\t}, { headers: { "x-acs-dingtalk-access-token": await vGetAccessToken(config), "Content-Type": "application/json" } });
\t\t\tconst data = resp?.data ?? {};
\t\t\tif (!data.processQueryKey || data.invalidStaffIdList?.length || data.flowControlledStaffIdList?.length) throw new Error(\`DingTalk \${msgKey} not sent: \${JSON.stringify(data).slice(0, 200)}\`);
\t\t\tvExperience.noteChannelSend(CHANNEL_ID, to);
\t\t\treturn { channel: CHANNEL_ID, messageId: data.processQueryKey, target: { kind: "conversation", id: to } };
\t\t},
`,
  },
  {
    file: "connection",
    name: "connection-imports",
    anchor: /^(import[^\n]*\n)+/u,
    after: `// ${MARKER}\nimport * as vExperience from "./${EXPERIENCE_FILE}";\n`,
  },
  {
    // The finished card keeps what came before a question and its record.
    name: "finish-card",
    anchor: "\t\t\tawait finishCardOnce(cardSnapshot, finalText);\n",
    replace: "\t\t\tfinalText = vWork.finalText(finalText);\n\t\t\tawait finishCardOnce(cardSnapshot, finalText);\n\t\t\tvStartBackground(cardSnapshot, finalText);\n",
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
\t\t\tif (vExperience.shouldSendAnswerNotice(vAnswer)) await sendMessage(params.config, vData.sessionWebhook, vAnswer.notice, { useMarkdown: false }).catch(() => {});
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
    // Feishu shows new text at once every 160 ms; 800 ms made DingTalk look slow.
    name: "update-interval",
    anchor: "\tconst updateInterval = 800;\n",
    replace: "\tconst updateInterval = 300;\n",
  },
  {
    name: "partial-throttled",
    anchor: "\t\t\t\t\t} else log.debug(`[DingTalk][onPartialReply] 节流控制，跳过本次更新（距离上次更新 ${now - lastUpdateTime}ms）`);\n",
    replace: "\t\t\t\t\t} else {\n\t\t\t\t\t\tlog.debug(`[DingTalk][onPartialReply] 节流控制，跳过本次更新（距离上次更新 ${now - lastUpdateTime}ms）`);\n\t\t\t\t\t\tvScheduleRefresh();\n\t\t\t\t\t}\n",
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
  {
    // The connector marked every message as an authorized command. Compute it
    // the way the core expects (as Feishu and Telegram do): only command-like
    // text, from a sender the DM allowlist admits (the connector treats
    // "pairing" as "open"). Which commands that sender may run is then the
    // core's decision: commands.allowFrom and commands.ownerAllowFrom.
    name: "command-auth-helper",
    anchor: "async function prepareDingTalkMessage(params) {\n",
    insert: "before",
    code: `// ${MARKER}: CommandAuthorized from the core's helpers instead of always true.
function vCommandAuthorized({ core, cfg, config, senderId, text }) {
\tif (!core.channel.commands.shouldComputeCommandAuthorized(text, cfg)) return false;
\tconst allowFrom = config.dmPolicy === "allowlist" ? (config.allowFrom || []).map(String) : ["*"];
\treturn core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
\t\tuseAccessGroups: cfg.commands?.useAccessGroups !== false,
\t\tauthorizers: [{ configured: allowFrom.length > 0, allowed: allowFrom.includes("*") || allowFrom.includes(String(senderId)) }]
\t});
}
`,
  },
  {
    name: "command-auth",
    anchor: "\t\t\tCommandAuthorized: true,\n\t\t\tOriginatingChannel: \"dingtalk-connector\",\n",
    replace: "\t\t\tCommandAuthorized: vCommandAuthorized({ core, cfg, config, senderId, text: userContent }),\n\t\t\tOriginatingChannel: \"dingtalk-connector\",\n",
  },
  {
    // The message tool, a file or the 「电脑」 card reached the chat: the reply
    // dispatcher of that chat learns it (see noteChannelSend).
    file: "runtime",
    name: "outbound-note-text",
    anchor: "\t\t\tif (!result.ok) throw new Error(result.error || \"DingTalk text delivery failed\");\n",
    insert: "after",
    code: `\t\t\tvExperience.noteChannelSend(CHANNEL_ID, to); // ${MARKER}\n`,
  },
  {
    file: "runtime",
    name: "outbound-note-media",
    anchor: "\t\t\tif (!result.ok) throw new Error(result.error || \"DingTalk media delivery failed\");\n",
    insert: "after",
    code: `\t\t\tvExperience.noteChannelSend(CHANNEL_ID, to); // ${MARKER}\n`,
  },
  {
    // A turn whose content went out with the message tool (final empty) closes
    // its pre-created card with 「✅ 已发送」 instead of the connector's
    // placeholder, and the visibleReplies hint only shows when that setting is
    // really missing. DingTalk has no API to recall an AI card.
    name: "empty-reply-helpers",
    anchor: "\tlet outboundUserVisibleThisTurn = false;\n",
    insert: "after",
    code: `\t// ${MARKER}: what an empty reply shows.
\tconst vTurnStartedAt = Date.now();
\tconst vSentSeparately = () => vExperience.channelSentSince(CHANNEL_ID, [conversationId, senderId], vTurnStartedAt);
\tconst vLacksVisibleReplies = () => !isDirect && groupChatLacksVisibleRepliesAutomatic(cfg);
\tconst vEmptyReplyText = (isGroup) => vSentSeparately() ? vExperience.SENT_SEPARATELY_TEXT : pickEmptyReplyFallbackText(isGroup && vLacksVisibleReplies());
`,
  },
  {
    name: "empty-reply-card",
    anchor: "\t\t\t\tfinalText = pickEmptyReplyFallbackText(isGroup);\n\t\t\t\tlog.info(`[DingTalk][closeStreaming] 累积文本为空，使用默认提示文案 (isGroup=${isGroup})`);\n\t\t\t\tif (isGroup) log.warn?.(`[DingTalk][closeStreaming] ${emptyGroupReplyLogHint()}`);\n",
    replace: "\t\t\t\tfinalText = vEmptyReplyText(isGroup);\n\t\t\t\tlog.info(`[DingTalk][closeStreaming] 累积文本为空，${vSentSeparately() ? \"本轮内容已单独发出，卡片只标已发送\" : \"使用默认提示文案\"} (isGroup=${isGroup})`);\n\t\t\t\tif (!vSentSeparately() && vLacksVisibleReplies()) log.warn?.(`[DingTalk][closeStreaming] ${emptyGroupReplyLogHint()}`);\n",
  },
  {
    name: "empty-reply-final",
    anchor: "\t\t\t\t\ttext = pickEmptyReplyFallbackText(isGroup);\n\t\t\t\t\tlog.info(`[DingTalk][deliver] final 响应无文本，使用默认提示文案 (isGroup=${isGroup})`);\n\t\t\t\t\tif (isGroup) log.warn?.(`[DingTalk][deliver] ${emptyGroupReplyLogHint()}`);\n",
    replace: "\t\t\t\t\tif (vSentSeparately()) {\n\t\t\t\t\t\tlog.info(`[DingTalk][deliver] final 响应无文本，本轮内容已单独发出，不再发提示文案 (isGroup=${isGroup})`);\n\t\t\t\t\t\tawait closeStreaming();\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t\ttext = vEmptyReplyText(isGroup);\n\t\t\t\t\tlog.info(`[DingTalk][deliver] final 响应无文本，使用默认提示文案 (isGroup=${isGroup})`);\n\t\t\t\t\tif (vLacksVisibleReplies()) log.warn?.(`[DingTalk][deliver] ${emptyGroupReplyLogHint()}`);\n",
  },
  {
    name: "empty-reply-watchdog",
    anchor: "\t\tconst timeoutText = accumulatedText.trim() || pickEmptyReplyFallbackText(!isDirect);\n",
    replace: "\t\tconst timeoutText = accumulatedText.trim() || vEmptyReplyText(!isDirect);\n",
  },
];

/** The rewritten chunk source; throws when an anchor is missing or ambiguous. */
function applyAll(source, list, label) {
  if (source.includes(MARKER)) return source;
  let out = source;
  for (const r of list) {
    if (r.anchor instanceof RegExp) {
      const m = r.anchor.exec(out);
      assert(m, `dingtalk ${label} anchor "${r.name}" not found`);
      const added = typeof r.after === "function" ? r.after(m) : r.after;
      out = out.slice(0, m.index + m[0].length) + added + out.slice(m.index + m[0].length);
      continue;
    }
    const count = out.split(r.anchor).length - 1;
    assert.equal(count, 1, `dingtalk ${label} anchor "${r.name}" matched ${count} times`);
    const next = r.replace ?? (r.insert === "after" ? r.anchor + r.code : r.code + r.anchor);
    out = out.replace(r.anchor, () => next);
  }
  return out;
}

/** The reply-dispatcher chunk, patched. */
export const patchReplyChunk = (source) => applyAll(source, replacements.filter((r) => !r.file), "reply");
/** The Stream connection chunk, patched (question card callbacks). */
export const patchConnectionChunk = (source) => applyAll(source, replacements.filter((r) => r.file === "connection"), "connection");
/** The channel plugin chunk, patched (outbound link cards). */
export const patchRuntimeChunk = (source) => applyAll(source, replacements.filter((r) => r.file === "runtime"), "runtime");

const findChunk = (distDir, re, needle) => {
  const matches = fs.readdirSync(distDir).filter((f) => re.test(f) && fs.readFileSync(path.join(distDir, f), "utf8").includes(needle));
  assert.equal(matches.length, 1, `expected one chunk with ${needle}, found ${matches.length}`);
  return matches[0];
};

/** The connector chunk that defines the reply dispatcher. */
export const findReplyChunk = (distDir) => findChunk(distDir, /^message-handler-[\w-]+\.mjs$/u, "function createDingtalkReplyDispatcher(params)");
export const findConnectionChunk = (distDir) => findChunk(distDir, /^connection-[\w-]+\.mjs$/u, "client.registerCallbackListener(TOPIC_ROBOT");
export const findRuntimeChunk = (distDir) => findChunk(distDir, /^runtime-[\w-]+\.mjs$/u, "\toutbound: {\n\t\tdeliveryMode: \"direct\",\n");

export function patchDingtalkConnector(distDir, { experienceSource }) {
  const changed = {};
  const chunk = findReplyChunk(distDir);
  // The runtime patch imports the token chunk's helpers by their minified names.
  const tokenChunk = /^import "\.\/(token-[\w-]+\.mjs)";$/mu.exec(fs.readFileSync(path.join(distDir, findRuntimeChunk(distDir)), "utf8"))?.[1];
  assert(tokenChunk, "runtime chunk does not import the token chunk");
  assert.match(fs.readFileSync(path.join(distDir, tokenChunk), "utf8"), /export \{ getOapiAccessToken as i, DINGTALK_OAPI as n, getAccessToken as r, DINGTALK_API as t \};/u, "token chunk exports changed");
  for (const [file, fn] of [[chunk, patchReplyChunk], [findConnectionChunk(distDir), patchConnectionChunk], [findRuntimeChunk(distDir), patchRuntimeChunk]]) {
    const p = path.join(distDir, file);
    const before = fs.readFileSync(p, "utf8");
    const after = fn(before);
    fs.writeFileSync(p, after);
    changed[file] = before !== after;
  }
  fs.copyFileSync(experienceSource, path.join(distDir, EXPERIENCE_FILE));
  return { chunk, changed: Object.values(changed).some(Boolean), files: changed, experience: EXPERIENCE_FILE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir] = process.argv.slice(2);
  assert(distDir, "usage: node patch.mjs <connector dist dir>");
  const experienceSource = new URL("../v-experience.mjs", import.meta.url).pathname;
  console.log(JSON.stringify(patchDingtalkConnector(distDir, { experienceSource })));
}
