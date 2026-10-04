// Patches OpenClaw 2026.9.1's bundled Telegram channel (core dist chunks) so
// Telegram gets the rest of V's experience on top of what it has natively
// (streamed answer, progress draft with the plan, /model picker):
//
//   questions   ask_user from any runtime as a message with option buttons;
//               typed answers count; neither waits behind the asking turn
//   credentials a clear notice instead of a request that hangs, and the
//               request is cancelled so V carries on
//   background  "⏳ 后台 … 进行中" as a quiet message after the reply, edited
//               until "☑️ 后台任务已结束"; a newer reply removes the old one
//   working     in progress mode the stock "Working" draft is replaced by V's
//               Feishu layout: commentary, the current tool ("🛠️ Exec"), a
//               rule and the plan (☑️ / ▶️ / ◻️); it moves below a question
//               and goes away when the answer is sent, as on Feishu
//
//   patchTelegram(distDir, { experienceSource })
//
// distDir is openclaw/dist. Writes `v-experience.js` there and rewrites the
// dispatch chunk (runTelegramDispatchTurn) and the ingress chunk (bot core).
// Every anchor must match exactly once; patched chunks are left unchanged.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-experience-telegram-v1";
export const EXPERIENCE_FILE = "v-experience.js";

/** `import { a as formatChannelProgressDraftLineForEntry } from "./streaming-….js"` for this build. */
export function progressLineImport(distDir) {
  for (const f of fs.readdirSync(distDir).filter((n) => /^streaming-[\w-]+\.js$/u.test(n))) {
    const m = /export \{[^}]*\bformatChannelProgressDraftLineForEntry as (\w+)\b[^}]*\};?\s*$/u.exec(fs.readFileSync(path.join(distDir, f), "utf8"));
    if (m) return `import { ${m[1]} as vFormatProgressLine } from "./${f}";`;
  }
  throw new Error("formatChannelProgressDraftLineForEntry export not found");
}

/** `import { o as callGateway } from "./call-….js"` for this build. */
export function callGatewayImport(distDir) {
  for (const f of fs.readdirSync(distDir).filter((n) => /^call-[\w-]+\.js$/u.test(n))) {
    const m = /export \{[^}]*\bcallGateway as (\w+)\b[^}]*\};?\s*$/u.exec(fs.readFileSync(path.join(distDir, f), "utf8"));
    if (m) return `import { ${m[1]} as vCallGateway } from "./${f}";`;
  }
  throw new Error("callGateway export not found");
}

const header = (callImport) => `// ${MARKER}
import * as vExperience from "./${EXPERIENCE_FILE}";
${callImport}
const vTelegramFor = (cfg) => vExperience.telegramExperience({
\tcall: (method, params) => vCallGateway({ config: cfg, method, params, scopes: ["operator.questions"], clientDisplayName: "Telegram question" }),
\tlog: (message) => console.log(message)
});
`;

// The dispatch chunk also renders the working message.
const dispatchHeader = (callImport, lineImport) => `${header(callImport)}${lineImport}
const vRenderWork = async (turn) => {
\tconst work = turn.vWork;
\tif (!work || turn.vQuestionPause || !canPushToolProgress(turn) || !work.hasContent()) return;
\tconst markdown = work.compose("");
\tif (!markdown.trim()) return;
\tconst html = renderTelegramHtmlText(markdown);
\tawait prepareAnswerLaneForToolProgress(turn);
\tturn.answerLane.lastPartialText = html;
\tturn.answerLane.hasStreamedMessage = true;
\tturn.answerLane.finalized = false;
\tturn.answerLane.stream?.updatePreview({ text: html, parseMode: "HTML" });
};
// A question goes below the working message: drop that message; the next one starts after the answer.
const vMakeRoomForQuestion = (turn) => enqueueDraftEvent(turn, async () => {
\tif (!turn.vWork) return;
\tturn.vQuestionPause = true;
\tturn.vWork.clearWorking();
\tif (turn.activeAnswerDraftIsToolProgressOnly) repositionLaneForNewMessage(turn, turn.answerLane);
});
const vResume = (turn) => { if (turn.vQuestionPause) turn.vQuestionPause = false; };
`;

const dispatchReplacements = (callImport, lineImport) => [
  {
    name: "imports",
    anchor: /^(import[^\n]*\n)+/u,
    after: dispatchHeader(callImport, lineImport),
  },
  {
    // The stock compositor still tracks state; what it would draw is drawn by V's work view.
    name: "compositor-update",
    anchor: "\t\tupdate: async (streamText, options) => {\n\t\t\tawait prepareAnswerLaneForToolProgress();\n",
    replace: `\t\tupdate: async (streamText, options) => {
\t\t\tif (draftState.answerLane.vRender) return await draftState.answerLane.vRender();
\t\t\tawait prepareAnswerLaneForToolProgress();
`,
  },
  {
    name: "tool-start",
    anchor: "async function handleToolStart(turn, payload) {\n",
    replace: "async function handleToolStart(turn, payload) {\n\tif (turn.vWork) { vResume(turn); turn.vWork.toolStart(payload); }\n",
  },
  {
    name: "item-event",
    anchor: "async function handleItemEvent(turn, payload) {\n",
    replace: "async function handleItemEvent(turn, payload) {\n\tif (turn.vWork && payload?.kind === \"preamble\") { vResume(turn); turn.vWork.itemEvent(payload); }\n",
  },
  {
    name: "plan-update",
    anchor: "async function handlePlanUpdate(turn, payload) {\n",
    replace: "async function handlePlanUpdate(turn, payload) {\n\tif (turn.vWork) { vResume(turn); turn.vWork.planUpdate(payload); }\n",
  },
  {
    // Commentary reaches the work view in progress mode whatever the account's narration setting.
    name: "commentary",
    anchor: "\t\t\t\t\t\tcommentaryProgressEnabled: turn.streamMode === \"progress\" ? turn.commentaryProgressEnabled : void 0,\n",
    replace: "\t\t\t\t\t\tcommentaryProgressEnabled: turn.streamMode === \"progress\" ? (turn.vWork ? true : turn.commentaryProgressEnabled) : void 0,\n",
  },
  {
    // Questions of this turn's session are shown here; the turn's end starts the background line.
    name: "turn",
    anchor: "\tconst endDeliveryCorrelation = beginDeliveryCorrelation();\n\ttry {\n\t\tconst { onModelSelected, ...replyPipeline }",
    replace: `\tconst endDeliveryCorrelation = beginDeliveryCorrelation();
\t// ${MARKER}
\tconst vTelegram = vTelegramFor(turn.cfg);
\tconst vExtra = buildTelegramThreadParams(context.threadSpec) ?? {};
\tif (turn.streamMode === "progress" && turn.answerLane.stream) {
\t\tturn.vWork = vExperience.createWorkView({
\t\t\tsessionKey: context.route.sessionKey,
\t\t\tformatTool: (name, phase) => vFormatProgressLine(turn.telegramCfg, { event: "tool", name, phase }, { detailMode: "status", commandText: "status" }),
\t\t\tonChange: () => { void enqueueDraftEvent(turn, () => vRenderWork(turn)); },
\t\t\tlog: (message) => console.log(message)
\t\t});
\t\tturn.answerLane.vRender = () => vRenderWork(turn);
\t}
\tconst vUnrouteQuestions = vExperience.onQuestionRequested(context.route.sessionKey, (record) => vTelegram.deliverQuestion({ api: turn.bot.api, chatId: context.chatId, extra: vExtra, senderId: context.ctxPayload.SenderId, record, beforeSend: () => vMakeRoomForQuestion(turn) }));
\ttry {
\t\tconst { onModelSelected, ...replyPipeline }`,
  },
  {
    name: "turn-end",
    anchor: "\t} finally {\n\t\tendDeliveryCorrelation();\n\t}\n}\n",
    replace: `\t} finally {
\t\tendDeliveryCorrelation();
\t\tvUnrouteQuestions();
\t\tturn.vWork?.dispose();
\t\tif (turn.answerLane.vRender) delete turn.answerLane.vRender;
\t\tlet vLineMessageId;
\t\tvExperience.watchBackground({
\t\t\tchannel: \`telegram:\${context.route.accountId ?? "default"}:\${context.chatId}\`,
\t\t\tsessionKey: context.route.sessionKey,
\t\t\tshow: async (line) => {
\t\t\t\tif (vLineMessageId == null) vLineMessageId = (await turn.bot.api.sendMessage(context.chatId, line, { ...vExtra, disable_notification: true }))?.message_id;
\t\t\t\telse await turn.bot.api.editMessageText(context.chatId, vLineMessageId, line).catch(() => {});
\t\t\t},
\t\t\tretire: async () => { if (vLineMessageId != null) await turn.bot.api.deleteMessage(context.chatId, vLineMessageId).catch(() => {}); },
\t\t\tlog: (message) => console.log(message)
\t\t});
\t}
}
`,
  },
  {
    // A question payload (non-Worker runtimes) is shown once, the V way.
    name: "deliver-question",
    anchor: "async function deliverReply(turn, payload, info) {\n\tif (turn.isSuperseded()) return await settleTerminalNoVisibleDelivery(turn, info, { abandonBufferedFinal: true });\n",
    replace: `async function deliverReply(turn, payload, info) {
\tif (turn.isSuperseded()) return await settleTerminalNoVisibleDelivery(turn, info, { abandonBufferedFinal: true });
\tconst vAskId = payload?.channelData?.askUser?.questionId;
\tif (vAskId) try {
\t\tconst { question } = await vCallGateway({ config: turn.cfg, method: "question.get", params: { id: vAskId }, scopes: ["operator.questions"], clientDisplayName: "Telegram question" });
\t\tif (question?.status && question.status !== "pending") return await settleTerminalNoVisibleDelivery(turn, info);
\t\tif (await vTelegramFor(turn.cfg).deliverQuestion({ api: turn.bot.api, chatId: turn.context.chatId, extra: buildTelegramThreadParams(turn.context.threadSpec) ?? {}, senderId: turn.context.ctxPayload.SenderId, record: question, beforeSend: () => vMakeRoomForQuestion(turn) })) return await settleTerminalNoVisibleDelivery(turn, info);
\t} catch (error) {
\t\tconsole.log(\`v-experience: telegram question payload \${vAskId} fell back to stock: \${String(error?.message ?? error)}\`);
\t}
`,
  },
];

const ingressReplacements = (callImport) => [
  { name: "imports", anchor: /^(import[^\n]*\n)+/u, after: header(callImport) },
  {
    // Answers and option taps run before the per-chat sequencer.
    name: "middleware",
    anchor: "\tbot.use(botRuntime.sequentialize(getTelegramSequentialConstraints));\n",
    replace: `\tbot.use(vTelegramFor(telegramDeps.getRuntimeConfig?.() ?? cfg).middleware); // ${MARKER}
\tbot.use(botRuntime.sequentialize(getTelegramSequentialConstraints));
`,
  },
];

function apply(source, replacements, label) {
  if (source.includes(MARKER)) return source;
  let out = source;
  for (const r of replacements) {
    if (r.anchor instanceof RegExp) {
      const m = r.anchor.exec(out);
      assert(m, `telegram ${label} anchor "${r.name}" not found`);
      out = out.slice(0, m.index + m[0].length) + r.after + out.slice(m.index + m[0].length);
      continue;
    }
    const count = out.split(r.anchor).length - 1;
    assert.equal(count, 1, `telegram ${label} anchor "${r.name}" matched ${count} times`);
    out = out.replace(r.anchor, () => r.replace);
  }
  return out;
}

export const patchDispatchChunk = (source, callImport, lineImport) => apply(source, dispatchReplacements(callImport, lineImport), "dispatch");
export const patchIngressChunk = (source, callImport) => apply(source, ingressReplacements(callImport), "ingress");

const findChunk = (distDir, re, needle) => {
  const matches = fs.readdirSync(distDir).filter((f) => re.test(f) && fs.readFileSync(path.join(distDir, f), "utf8").includes(needle));
  assert.equal(matches.length, 1, `expected one chunk with ${needle}, found ${matches.length}`);
  return matches[0];
};

export function patchTelegram(distDir, { experienceSource }) {
  const callImport = callGatewayImport(distDir);
  const lineImport = progressLineImport(distDir);
  const dispatch = findChunk(distDir, /^bot-message-[\w-]+\.js$/u, "async function runTelegramDispatchTurn(turn)");
  const ingress = findChunk(distDir, /^telegram-ingress-drain-factory-[\w-]+\.js$/u, "bot.use(botRuntime.sequentialize(getTelegramSequentialConstraints));");
  const changed = {};
  for (const [file, fn] of [[dispatch, patchDispatchChunk], [ingress, patchIngressChunk]]) {
    const p = path.join(distDir, file);
    const before = fs.readFileSync(p, "utf8");
    const after = fn(before, callImport, lineImport);
    fs.writeFileSync(p, after);
    changed[file] = before !== after;
  }
  fs.copyFileSync(experienceSource, path.join(distDir, EXPERIENCE_FILE));
  return { changed, experience: EXPERIENCE_FILE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir] = process.argv.slice(2);
  assert(distDir, "usage: node patch.mjs <openclaw/dist>");
  console.log(JSON.stringify(patchTelegram(distDir, { experienceSource: new URL("../v-experience.mjs", import.meta.url).pathname })));
}
