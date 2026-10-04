import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { patchGptLiveContinuationTalk } from "./patch-gpt-live-consult-continuation.mjs";
import { GPT_LIVE_CALL_INSTRUCTIONS } from "./gpt-live-h5/instructions.mjs";
import {
  patchGptLiveConsultProgressHarness,
  patchGptLiveConsultProgressTalk,
} from "./gpt-live-consult-progress.mjs";

const root = new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/", import.meta.url);
const harnessSource = readFileSync(new URL("realtime-session-harness-CEO5kVAJ.js", root), "utf8");
const talkSource = readFileSync(new URL("talk-DkFuKRod.js", root), "utf8");
const builtinSource = readFileSync(new URL("builtin-openclaw-zQV8Wwjr.js", root), "utf8");
const nativeProjectionSource = readFileSync(new URL("./release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js", import.meta.url), "utf8");
const patchedHarness = patchGptLiveConsultProgressHarness(harnessSource);
const patchedTalk = patchGptLiveConsultProgressTalk(talkSource);
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

function executeFunction(source, startAnchor, endAnchor, dependencies) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start);
  assert(start >= 0 && end > start, `${startAnchor} was not found`);
  const functionSource = source.slice(start, end);
  const name = startAnchor.match(/function (\w+)/)[1];
  return new Function("dependencies", `with (dependencies) { ${functionSource}; return ${name}; }`)(dependencies);
}

const patchedObserver = executeFunction(patchedHarness, "function createGptLiveConsultProgressObserver", "async function consultRealtimeVoiceAgent", {});
const readConsultStringArg = executeFunction(harnessSource, "function readConsultStringArg", "//#endregion", {
  normalizeOptionalString: (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
});
const parseConsultArgs = executeFunction(harnessSource, "function parseRealtimeVoiceAgentConsultArgs", "/** Build the plain chat message", { readConsultStringArg });
const actualConsultPrompt = executeFunction(patchedHarness, "function buildRealtimeVoiceAgentConsultPrompt", "/** Collect only visible answer text", {
  parseRealtimeVoiceAgentConsultArgs: parseConsultArgs,
});

function createNativeProjection(emit) {
  const start = nativeProjectionSource.indexOf("var CodexAssistantProjection = class {");
  const end = nativeProjectionSource.indexOf("\n//#endregion", start);
  assert(start > 0 && end > start, "captured Codex assistant projector is missing");
  const readString = (value, key) => typeof value?.[key] === "string" ? value[key] : undefined;
  const NativeProjection = new Function(
    "readStringField", "readItemString", "shouldClearTerminalPresentationForNativeItem",
    `${nativeProjectionSource.slice(start, end)}; return CodexAssistantProjection;`,
  )(readString, readString, () => false);
  return new NativeProjection({ onAssistantMessageStart() {} }, emit, () => false, () => 0, () => {});
}

function createBuiltinDelivery(emit, state = { assistantTexts: [], assistantMessageIndex: 0, assistantMessageStartIndex: 0 }) {
  const createDelivery = executeFunction(builtinSource, "function createReplyDelivery", "//#endregion", {
    randomUUID: () => "builtin-stream",
    emitAgentEvent: emit,
    runBestEffortCallback: (options) => { options.callback(); options.onSuccess?.(); },
    isStreamAppend: ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length,
    mergeStreamAppend: (previous, next) => ({ ...next, delta: previous.delta + next.delta }),
  });
  return createDelivery({ params: { runId: "same-consult" }, state, log: {} });
}

function createHarnessRuntime({ onProgress, runEmbeddedAgent, signal = new AbortController().signal,
  args = { question: "Consult question" }, transcript = [] }) {
  // Replace only dynamic import boundaries. All patched consult and observer logic executes unchanged.
  const source = patchedHarness.replace(
    'const [{ beginSessionWorkAdmission }, { resolveSessionWorkStartError }] = await Promise.all([import("./session-lifecycle-admission-DCnoxd2o.js"), import("./lifecycle-7GS52a1a.js")]);',
    "const importedAdmission = beginSessionWorkAdmission; const importedStartError = resolveSessionWorkStartError;",
  );
  assert.notEqual(source, patchedHarness, "consult import boundary drifted");
  const observations = { cleanup: 0, releases: 0, warnings: [] };
  const dependencies = {
    createGptLiveConsultProgressObserver: patchedObserver,
    beginSessionWorkAdmission: async () => ({ run: (callback) => callback(), release: () => observations.releases++ }),
    resolveSessionWorkStartError: () => undefined,
    resolveSessionAgentId: () => "agent",
    assertRealtimeVoiceAgentConsultModelSelectionUnlocked: () => {},
    resolveRealtimeVoiceAgentDeliveryContext: () => undefined,
    resolveRealtimeVoiceAgentConsultSessionEntry: async () => ({ sessionId: "session" }),
    deliveryContextFromSession: () => undefined,
    resolveRealtimeVoiceAgentSandboxSessionKey: () => "sandbox",
    buildRealtimeVoiceAgentConsultPrompt: actualConsultPrompt,
    collectRealtimeVoiceAgentConsultVisibleText: (payloads) => payloads.map((payload) => payload.text ?? "").join(""),
    randomUUID: () => "uuid",
  };
  const consult = executeFunction(source, "async function consultRealtimeVoiceAgent", "//#endregion", dependencies);
  return {
    observations,
    run: () => consult({
      cfg: {},
      args,
      transcript,
      surface: "a browser Talk session",
      userLabel: "User",
      sessionKey: "voice:test",
      runIdPrefix: "test",
      abortSignal: signal,
      onProgress,
      logger: { warn: (message) => observations.warnings.push(message) },
      onRunStarted: () => ({ cleanup: () => observations.cleanup++ }),
      agentRuntime: {
        resolveAgentDir: () => "/tmp/agent",
        resolveAgentWorkspaceDir: () => "/tmp/workspace",
        ensureAgentWorkspace: async () => {},
        resolveAgentTimeoutMs: () => 1000,
        session: { resolveStorePath: () => "/tmp/store", getSessionEntry: () => undefined },
        runEmbeddedAgent,
      },
    }),
  };
}

test("patch applies to current captured runtime, is idempotent, and rejects partial drift", () => {
  assert.equal(patchGptLiveConsultProgressHarness(patchedHarness), patchedHarness);
  assert.equal(patchGptLiveConsultProgressTalk(patchedTalk), patchedTalk);
  assert.throws(() => patchGptLiveConsultProgressHarness(harnessSource.replace("\t\t\t\tagentDir,", "\t\t\t\tagentDir: changed,")), /anchor drifted/);
  assert.throws(() => patchGptLiveConsultProgressTalk(patchedTalk.replace("runArgs({ question: prompt }, signal, onProgress)", "runArgs({ question: prompt }, signal)")), /partial/);
});

test("captured consult owns both authorized steps; public stage delivery does not settle before the next tool and final", async () => {
  const question = "请比较 2026-10-08 去程与 2026-10-10 回程；两名成人、一名儿童；逐步查完后给含税合计，不预订。";
  const context = "完整目标：去程 + 回程 + 合计。已验证：去程 590 CNY/人。剩余：回程含税实价及全家合计；不能把单程作为整体完成。";
  const events = [];
  let releaseSecondTool;
  const secondTool = new Promise((resolve) => { releaseSecondTool = resolve; });
  let settled = false;
  const runtime = createHarnessRuntime({
    args: { question, context, responseStyle: "简短中文，保留 CNY 数字" },
    transcript: [{ role: "user", text: "查完整去回程，不要付款。" }, { role: "assistant", text: "先查去程。" }],
    onProgress: (value) => {
      events.push(["public-stage", value.text]);
      return true;
    },
    runEmbeddedAgent: async (options) => {
      assert(options.prompt.includes(`User request:\n${question}`));
      assert(options.prompt.includes(`Additional realtime context:\n${context}`));
      assert(options.prompt.includes("User: 查完整去回程，不要付款。"));
      assert.match(options.prompt, /Own the complete currently authorized user goal/);
      assert.match(options.prompt, /actually call the next required tool.*same run/);
      assert.match(options.prompt, /final-answer output only when all requested outputs have been verified/);
      assert.equal(options.runId.startsWith("test:"), true);
      options.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "end", itemId: "outbound-fact", progressText: "去程含税 590 CNY/人已核对。" } });
      events.push(["next-tool-started", options.runId]);
      const returnPrice = await secondTool;
      events.push(["next-tool-result", returnPrice]);
      return { payloads: [{ text: `去程 590 CNY/人，回程 ${returnPrice} CNY/人；三人含税合计 4140 CNY。` }] };
    },
  });
  const pending = runtime.run().then((value) => { settled = true; return value; });
  await nextTick();
  assert.equal(settled, false, "a delivered stage sentence must not complete the consult");
  assert.equal(runtime.observations.cleanup, 0);
  assert.equal(runtime.observations.releases, 0);
  assert.deepEqual(events.map(([name]) => name), ["public-stage", "next-tool-started"]);
  releaseSecondTool(790);
  assert.deepEqual(await pending, { text: "去程 590 CNY/人，回程 790 CNY/人；三人含税合计 4140 CNY。" });
  assert.deepEqual(events.map(([name]) => name), ["public-stage", "next-tool-started", "next-tool-result"]);
  assert.equal(runtime.observations.cleanup, 1);
  assert.equal(runtime.observations.releases, 1);
});

test("actual backend prompt retains the ordered single-child request and its latest correction; an unmet execution chain remains a partial result", async () => {
  const question = "先完成记忆检索，拿到真实结果后再查官方网页；随后仅派一个子代理按顺序运行 pwd、生成随机校验值并公开真实值、sleep 17 后运行 date '+%Y-%m-%d %H:%M:%S %z'；这几项都由同一子任务执行，父任务用 sessions_yield 等待后自动汇总，不写文件、不外发。";
  const context = "最新用户修正：把子任务等待改为 11 秒，其他顺序和执行者保持不变；没有授权改由父任务执行。";
  const partialResult = "部分完成：子任务仅验证了目录和校验值；等待及日期读取由父任务执行，未满足同一子任务完成的约束。";
  let capturedPrompt;
  const runtime = createHarnessRuntime({
    args: { question, context, responseStyle: "中文，未满足的约束必须明示" },
    runEmbeddedAgent: async (options) => {
      capturedPrompt = options.prompt;
      return { payloads: [{ text: partialResult }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: partialResult }, "the real consult return path must not upgrade a partial chain to success");
  assert(capturedPrompt.includes(`User request:\n${question}`));
  assert(capturedPrompt.includes(`Additional realtime context:\n${context}`));
  assert.match(capturedPrompt, /执行前核对：以完整 User request 和最新明确修正为准/);
  assert.match(capturedPrompt, /用户原句步骤→指定执行者→前置完成证据/);
  assert.match(capturedPrompt, /前一步真实完成后才开始下一步，不并行替代/);
  assert.match(capturedPrompt, /一个完整任务交给单次 sessions_spawn：spawn\.task 原样保留当前有效步骤的用户原句、精确命令、等待和后续动作/);
  assert.match(capturedPrompt, /不得截成首步或把后续步骤留给父任务或另一子任务/);
  assert.match(capturedPrompt, /已受理则沿原任务继续，不重复创建/);
  assert.match(capturedPrompt, /不符或缺证据时只报告已证实部分和未满足约束/);
  assert.match(capturedPrompt, /不得把父任务补做的结果改称子任务结果/);
  // These are prompt/transport checks; the callback is not a model adherence test.
  assert.equal(runtime.observations.cleanup, 1);
});

test("actual backend prompt preserves named source subjects and the exact final text without reassigning responsibilities", async () => {
  const question = "查询张岚与赵青的职责以及双方项目关系，并分别说明职责来自哪项证据。";
  const context = "已验证来源：张岚负责产品验收；赵青是项目 sponsor；两人都是协作主体，不把张岚的验收职责移给赵青。";
  const resultText = "张岚：负责产品验收；与赵青的关系是项目协作。赵青：项目 sponsor。其他关系未核实。";
  let capturedPrompt;
  const runtime = createHarnessRuntime({
    args: { question, context },
    runEmbeddedAgent: async (options) => {
      capturedPrompt = options.prompt;
      return { payloads: [{ text: resultText }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: resultText });
  assert(capturedPrompt.includes(`User request:\n${question}`));
  assert(capturedPrompt.includes(`Additional realtime context:\n${context}`));
  assert.match(capturedPrompt, /实名归属：涉及多个人的职责和关系时/);
  assert.match(capturedPrompt, /每项对应源结果中的实际主体/);
  assert.match(capturedPrompt, /不要用‘你\/他们’替代已知姓名或角色/);
  assert.match(capturedPrompt, /不要把一个主体的职责或关系移给另一个主体/);
  assert.match(capturedPrompt, /主体或关系无法确认就标为未核实/);
  assert.match(capturedPrompt, /源卡只说明一个人的组织或职责，不代表已证实其与提问者或另一个人的关系/);
  assert.match(capturedPrompt, /按授权范围扩展检索，仍无证据则标为未核实，推断必须明示为推断/);
});

test("execution and subject checks remain conditional and preserve authorization, exact-value, and primary-source boundaries", () => {
  const question = "Read the official API page and return its documented parameter, without starting a child task or publishing anything.";
  const prompt = actualConsultPrompt({ args: { question }, transcript: [], surface: "a browser Talk session", userLabel: "User" });
  assert(prompt.includes(`User request:\n${question}`));
  assert.match(prompt, /用户要求同一个子任务执行的有序步骤/);
  assert.match(prompt, /涉及多个人的职责和关系时/);
  assert.match(prompt, /An assistant promise is not user authorization; do not broaden the task or infer permission to book, pay, publish, or send/);
  assert.match(prompt, /Latest explicit corrections|latest explicit corrections/);
  assert.match(prompt, /that command's exact returned value, not a nearby verification command or a separate time sample/);
  assert.match(prompt, /actually fetch and read the relevant primary pages/);
  assert.match(prompt, /GPT Live and Realtime are distinct interfaces/);
  assert.match(prompt, /Preserve the source's product and model applicability, only\/except conditions, exact versions and units/);
  assert.match(prompt, /a scoped claim is not evidence for every model or mode/);
  assert.match(prompt, /at most one short fact per 15 seconds/);
  assert.match(prompt, /Use final-answer output only when all requested outputs have been verified/);
  assert.match(prompt, /If work is still running in accepted child tasks, use the actual supported yield\/continuation mechanism/);
});

test("the actual consult contract distinguishes source examples and conditional advice from verified deployment state, and preserves their returned text", async () => {
  const question = "只读所给接口文档，说明示例模型和有条件的迁移建议；不要检查部署，也不要执行迁移。";
  const context = '来源片段：示例代码 model: "example-model-v3"；If still on the preview interface, migrate to the stable interface. 未提供当前接入配置或迁移记录。';
  const stage = "文档建议：如果仍使用 preview 接口，应迁移到 stable 接口；本次接入状态尚未核实。";
  const final = "文档示例模型为 example-model-v3，不代表当前通话模型；如果仍使用 preview 接口，应迁移到 stable 接口，本次接入是否已迁移尚未核实。";
  const progress = [];
  let capturedPrompt;
  const runtime = createHarnessRuntime({
    args: { question, context },
    onProgress: value => progress.push(value),
    runEmbeddedAgent: async options => {
      capturedPrompt = options.prompt;
      options.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "end", itemId: "conditional-document-fact", progressText: stage } });
      return { payloads: [{ text: final }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: final });
  assert.deepEqual(progress.map(value => value.text), [stage]);
  assert(capturedPrompt.includes(`User request:\n${question}`));
  assert(capturedPrompt.includes(`Additional realtime context:\n${context}`));
  assert.match(capturedPrompt, /Distinguish a documentation example, a documented capability, a recommendation, a conditional requirement, and a verified current deployment state/);
  assert.match(capturedPrompt, /example code is only that example, not this call's actual model or configuration/);
  assert.match(capturedPrompt, /Preserve if\/when\/unless conditions and should\/must\/can wording/);
  assert.match(capturedPrompt, /a migration recommendation does not mean migration has already occurred/);
  assert.match(capturedPrompt, /only with actual runtime\/configuration or completed-action evidence from the authorized task/);
  assert.match(capturedPrompt, /Do not inspect unrelated runtime state or execute a migration merely to strengthen a documentation answer/);
  assert.match(capturedPrompt, /Keep the subject, source type, and any necessary condition together/);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /示例里的模型或设置只属于该示例，不能说成当前通话配置/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /必须保留条件和建议语气，不能说成已经完成迁移/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /缺少这种证据就说明本次接入状态未核实/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /每条阶段事实都应在同一句保留必要条件/u);
  // This executes the captured consult/observer with a stubbed model boundary.
  // It verifies contract and lossless transport, not real model adherence.
});

test("captured consult carries the complete Memory/Web request through the required official read before a concise final", async () => {
  // The complete USER wording is from the failed a85 lifecycle sample. The
  // model/source-read boundary below is a fixture, not new native acceptance.
  const question = "请先用 memory search 查家庭相关记录,再用 web search 查 OpenAI 官方 realtime API 文档,查到后用一句中文说两个结果,不要写入。也不要发消息";
  const stage = "已找到官方文档入口，尚未读取原文。";
  const final = "家庭记录已找到；所读官方文档示例使用 example-model-v3，如果仍使用 preview 接口应迁移到 stable 接口，本次接入状态未核实。";
  let capturedPrompt;
  let finishRead;
  const sourceRead = new Promise(resolve => { finishRead = resolve; });
  const progress = [];
  let settled = false;
  const runtime = createHarnessRuntime({
    args: { question, responseStyle: "只用一句中文说两个结果" },
    onProgress: value => progress.push(value),
    runEmbeddedAgent: async options => {
      capturedPrompt = options.prompt;
      options.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "end", itemId: "source-discovery", progressText: stage } });
      await sourceRead;
      return { payloads: [{ text: final }] };
    },
  });
  const pending = runtime.run().then(value => { settled = true; return value; });
  await nextTick();
  assert(capturedPrompt.includes(`User request:\n${question}`));
  assert(capturedPrompt.includes("Spoken style: 只用一句中文说两个结果"));
  assert.match(capturedPrompt, /web_search only locates sources; use available web_fetch\/read tools in this same run to read the relevant official content before final/);
  assert.match(capturedPrompt, /necessary read-only retrieval is already part of that goal: do not stop after search to ask whether to fetch/);
  assert.match(capturedPrompt, /one concise sentence limits presentation, not the necessary source checks/);
  assert.equal(settled, false, "the discovery stage must not settle the pending source-read fixture");
  assert.deepEqual(progress.map(value => value.text), [stage]);
  finishRead();
  assert.deepEqual(await pending, { text: final }, "source conditions and unverified deployment status remain unchanged");
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /仅取得搜索摘要而尚未执行必要原文读取，是原目标内已授权的剩余只读步骤/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /后台已结束后实际委托该读取，不再问是否抓取，一句话只限制呈现/u);
  // This proves instructions reach the captured backend entry and the source
  // result is carried losslessly; only a real run can prove tools are chosen.
});

test("source-read continuation preserves explicit scope and genuine blockers without expanding deployment work", async t => {
  const cases = [
    { name: "search only", question: "只用 web search 找 OpenAI 官方 Realtime 文档链接，不抓取页面。", context: "用户明确只需来源入口，不要求文档事实。", final: "已找到官方文档入口，只有搜索结果，未读取或核实页面内容。" },
    { name: "actual retrieval failure", question: "读取官方 Realtime 文档后简短说明连接方式。", context: "实际 web_fetch 返回读取失败，相关原文没有得到。", final: "官方页面读取失败，连接方式尚未从原文核实。" },
    { name: "actual denial", question: "查官方 Realtime 文档。", context: "实际读取工具返回拒绝，原文未读取。", final: "官方页面读取被拒绝，相关内容尚未核实。" },
    { name: "core confirmation", question: "读取官方 Realtime 文档。", context: "实际 core 返回 VOICE_CONFIRMATION_REQUIRED，动作未执行，当前没有用户确认。", final: "读取动作尚未执行，需要确认这一具体动作。" },
    { name: "latest cancellation", question: "查官方 Realtime 文档。", context: "最新用户完整修正：不用继续读了，取消这次查询。", final: "本次查询已取消，原文未读取。" },
    { name: "deployment state outside docs goal", question: "只解释已读取文档的有条件迁移建议，不检查接入配置。", context: "原文说如果仍使用 preview 接口应迁移；未提供当前部署证据。", final: "如果仍使用 preview 接口，应迁移；当前接入状态尚未核实。" },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    let capturedPrompt;
    let runs = 0;
    const runtime = createHarnessRuntime({
      args: { question: scenario.question, context: scenario.context },
      runEmbeddedAgent: async options => {
        runs++;
        capturedPrompt = options.prompt;
        return { payloads: [{ text: scenario.final }] };
      },
    });
    assert.deepEqual(await runtime.run(), { text: scenario.final });
    assert.equal(runs, 1, "the captured return transport must not invent an additional backend attempt");
    assert(capturedPrompt.includes(`User request:\n${scenario.question}`));
    assert(capturedPrompt.includes(`Additional realtime context:\n${scenario.context}`));
    assert.match(capturedPrompt, /Respect an explicit search-only or no-fetch scope: return discovery results as such/);
    assert.match(capturedPrompt, /actual retrieval failure, denial, confirmation requirement, explicit cancellation, or user-imposed limit/);
    assert.match(capturedPrompt, /do not repeat the same blocked attempt without new authorization or evidence/);
    assert.match(capturedPrompt, /Unverified deployment state outside the requested documentation task does not authorize runtime inspection or migration/);
    assert.match(capturedPrompt, /VOICE_CONFIRMATION_REQUIRED, the action was not executed/);
  });
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /尊重用户只搜索或不抓取的范围/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /不自动重复委托同一受理中或已阻塞的读取/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /同一剩余读取已经补委托一次，若再次结束仍未读取，就说明实际未完成/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /没有新用户要求或新来源证据，不循环重委托/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /仅有本次接入部署状态未核实，不产生额外 runtime 检查或迁移授权/u);
  // These fixtures verify policy delivery and unchanged blockers. They do
  // not claim the native Live model has obeyed the continuation policy.
});

test("voice consult carries child stage values and read-before-claim obligations without substituting tool text for progress", async () => {
  const question = "先检索合同来源，再读取官方文档相关段落；同一子任务依次测量延迟并公开带单位的实际值，再检查文件版本后汇总；保持只读，只公开测量值和版本。";
  const stage = "已测得延迟为 2.75 ms。";
  const progress = [];
  let capturedPrompt;
  const runtime = createHarnessRuntime({
    args: { question },
    onProgress: value => progress.push(value),
    runEmbeddedAgent: async options => {
      capturedPrompt = options.prompt;
      options.onAgentEvent({ stream: "tool", data: { phase: "result", result: { text: "2.75 ms" } } });
      assert.equal(progress.length, 0, "a tool result cannot manufacture an assistant stage fact");
      options.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "end", itemId: "measured-stage", progressText: stage } });
      return { payloads: [{ text: "部分完成：已测得延迟；文档返回被截断，相关控制未核实。" }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: "部分完成：已测得延迟；文档返回被截断，相关控制未核实。" });
  assert(capturedPrompt.includes(`User request:\n${question}`));
  assert.match(capturedPrompt, /spawn\.task 必须继承本次有效的完整目标、指定执行者、步骤依赖、公开范围/);
  assert.match(capturedPrompt, /若用户要求阶段播报，明确交给子任务/);
  assert.match(capturedPrompt, /给出实际值及其主体、单位或时区，再调用后续工具继续同一任务/);
  assert.match(capturedPrompt, /不要以 Step done、正在等待或轮询计划替代实际事实/);
  assert.match(capturedPrompt, /未取得或不允许公开的值不要猜测或披露/);
  assert.match(capturedPrompt, /不为补播创建替代任务/);
  assert.match(capturedPrompt, /前一步真实完成后才开始下一步，不并行替代/);
  assert.match(capturedPrompt, /returned page is truncated or lacks the supporting section/);
  assert.match(capturedPrompt, /locate and read that primary section within the authorized task/);
  assert.match(capturedPrompt, /otherwise report it as unverified/);
  assert.deepEqual(progress.map(value => value.text), [stage]);
  // Actual prompt/callback transport is verified; model adherence needs a real voice case.
});

test("consult forwards complete public facts before final and leaves unfinished text for final delivery", async () => {
  const progress = [];
  let finish;
  let partial;
  let agentEvent;
  const runtime = createHarnessRuntime({
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      partial = options.onPartialReply;
      agentEvent = options.onAgentEvent;
      assert.equal(options.onReasoningStream, undefined);
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  partial({ phase: "commentary", text: "  正在查看今天的安排  " });
  partial({ phase: "commentary", text: "正在查看今天的安排" });
  partial({ phase: "commentary", text: "" });
  partial({ phase: "commentary", text: "  " });
  partial({ phase: "commentary", text: "我已经找到了" });
  partial({ phase: "commentary", text: "我已经找到了三个相关文件。后面还有" });
  partial({ phase: "commentary", text: "内部推理。", isReasoning: true });
  partial({ delta: "不是完整公开 payload" });
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [
    { text: "我已经找到了三个相关文件。", kind: "commentary" },
  ]);
  assert.match(progress[0].provenance.runId, /^test:/);
  assert.equal(progress[0].provenance.source, "reply");
  assert.equal(progress[0].provenance.sequence, 1);
  assert.equal(typeof progress[0].provenance.emittedAt, "number");
  finish({ payloads: [{ text: "最后的结果。" }] });
  assert.deepEqual(await pending, { text: "最后的结果。" });
  partial({ phase: "commentary", text: "完成后的迟到输出。" });
  agentEvent({ stream: "item", data: { kind: "preamble", phase: "update", progressText: "完成后的迟到播报。" } });
  assert.equal(progress.length, 1);
  assert.equal(runtime.observations.cleanup, 1);
  assert.equal(runtime.observations.releases, 1);
});

test("unknown and final assistant sentences wait for canonical completion while classified progress continues", async () => {
  const progress = [];
  let finish;
  const runtime = createHarnessRuntime({
    onProgress: value => progress.push(value),
    runEmbeddedAgent: options => {
      for (const phase of [undefined, "final", "final_answer", "unrecognized"]) {
        options.onPartialReply({ text: "全部完成。", ...(phase ? { phase } : {}) });
        options.onAgentEvent({ stream: "assistant", data: { text: "全部完成。", ...(phase ? { phase } : {}) } });
      }
      options.onPartialReply({ phase: "commentary", text: "第一项事实已核对。后续尚未结束" });
      return new Promise(resolve => { finish = resolve; });
    },
  });
  let settled = false;
  const pending = runtime.run().then(result => { settled = true; return result; });
  await nextTick();
  assert.equal(settled, false);
  assert.deepEqual(progress.map(value => value.text), ["第一项事实已核对。"]);
  finish({ payloads: [{ text: "全部完成。\n\n完整的核验结果保留在最终正文。" }] });
  assert.deepEqual(await pending, { text: "全部完成。\n\n完整的核验结果保留在最终正文。" });
  assert.equal(progress.length, 1, "canonical final is returned without a second progress claim");
});

test("a reasoning flag cannot masquerade as a public preamble even with a visible sentence boundary", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: value => progress.push(value) });
  observer.onAgentEvent({stream:"item",data:{kind:"preamble",phase:"end",isReasoning:true,progressText:"PRIVATE_REASONING。"}});
  observer.onPartialReply({isReasoning:true,text:"PRIVATE_THOUGHT。"});
  observer.onAgentEvent({stream:"tool",data:{kind:"preamble",phase:"end",progressText:"PRIVATE_TOOL_LOG。"}});
  assert.deepEqual(progress, []);
  observer.onAgentEvent({stream:"item",data:{kind:"preamble",phase:"end",progressText:"公开核验已完成。"}});
  assert.deepEqual(progress.map(value => value.text), ["公开核验已完成。"]);
});

test("actual builtin public preamble contract reaches the observer without exposing thoughts or tools", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => { progress.push(payload); return true; } });
  const agentEvents = [];
  let partialCalls = 0;
  const dependencies = {
    randomUUID: () => "stream-id",
    isStreamAppend: ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length,
    mergeStreamAppend: (previous, next) => ({ ...next, delta: previous.delta + next.delta }),
    emitAgentEvent: (event) => agentEvents.push(event),
    runBestEffortCallback: (options) => { options.callback(); options.onSuccess?.(); },
  };
  const createDelivery = executeFunction(builtinSource, "function createReplyDelivery", "//#endregion", dependencies);
  const delivery = createDelivery({
    params: {
      runId: "consult-run",
      onAgentEvent: observer.onAgentEvent,
      onPartialReply: (payload) => { partialCalls++; return observer.onPartialReply(payload); },
    },
    state: { assistantTexts: [], shouldEmitPartialReplies: true, assistantMessageIndex: 0, assistantMessageStartIndex: 0 },
    log: {},
  });
  delivery.emitAssistantStreamData({ text: "正在查找", delta: "", replace: true, phase: "commentary", itemId: "item-1" });
  delivery.emitAssistantStreamData({ text: "正在查找你今天的日程。", delta: "", replace: true, phase: "commentary", itemId: "item-1" });
  delivery.emitAssistantStreamData({ text: "正在查找你今天的日程。", delta: "", replace: true, phase: "commentary", itemId: "item-1" }, { finalMessage: true });
  assert.equal(partialCalls, 0, "public commentary uses Agent preambles, not partial replies");
  assert.deepEqual(agentEvents.map(({ stream, data }) => ({ stream, kind: data.kind, phase: data.phase, progressText: data.progressText })), [
    { stream: "item", kind: "preamble", phase: "update", progressText: "正在查找" },
    { stream: "item", kind: "preamble", phase: "update", progressText: "正在查找你今天的日程。" },
    { stream: "item", kind: "preamble", phase: "end", progressText: "正在查找你今天的日程。" },
  ]);
  assert.deepEqual(progress, [{ text: "正在查找你今天的日程。", kind: "commentary" }]);
  for (const event of [
    { stream: "reasoning", data: { kind: "preamble", phase: "update", progressText: "hidden reasoning." } },
    { stream: "item", data: { kind: "thought", phase: "update", progressText: "hidden thought." } },
    { stream: "tool", data: { kind: "preamble", phase: "update", progressText: "raw tool output." } },
    { stream: "item", data: { kind: "preamble", phase: "start", progressText: "unsupported phase." } },
    { stream: "item", data: { kind: "preamble", phase: "update", text: "wrong field." } },
  ]) assert.equal(observer.onAgentEvent(event), false);
  assert.equal(progress.length, 1);
  assert.equal(observer.onPartialReply({ phase: "commentary", text: "公开答案。" }), false, "the observer does not claim final delivery even if downstream returns true");
});

test("actual Codex final deltas and builtin final completion stay silent until canonical delivery", async () => {
  const progress = [];
  const assistantSnapshots = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  // The worker globally bridges assistant Agent events to onPartialReply(event.data).
  // Keep that transport boundary simple; both event producers below execute captured code.
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") {
      assistantSnapshots.push({ ...event.data });
      observer.onPartialReply(event.data);
    }
  };
  const projection = createNativeProjection(bridge);
  const builtinState = { assistantTexts: [], assistantMessageIndex: 0, assistantMessageStartIndex: 0 };
  const delivery = createBuiltinDelivery(bridge, builtinState);
  const first = ["I", "'ll", " start", " waiting", " eight", " seconds", "."];
  projection.recordItemStarted({ id: "native-first", type: "agentMessage", phase: "final_answer" }, "native-first");
  for (const delta of first) await projection.handleAssistantDelta({ itemId: "native-first", delta });
  const english = "I'll start waiting eight seconds.";
  assert.equal(assistantSnapshots[0].itemId, undefined);
  assert.equal(assistantSnapshots.at(-1).text, english);
  delivery.emitAssistantStreamData({ text: english, delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(assistantSnapshots.at(-1).itemId, "builtin-stream:0");
  assert.equal(assistantSnapshots.at(-1).text, english);
  assert.deepEqual(progress, [], "a full sentence in a native or builtin final answer is not public progress");

  // A later distinct assistant message must still stream and suppress only its own mirror.
  const second = ["八", "秒", "等待", "完成", "。"];
  projection.recordItemStarted({ id: "native-second", type: "agentMessage", phase: "final_answer" }, "native-second");
  for (const delta of second) await projection.handleAssistantDelta({ itemId: "native-second", delta });
  builtinState.assistantMessageIndex = builtinState.assistantMessageStartIndex = 1;
  delivery.emitAssistantStreamData({ text: "八秒等待完成。", delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(assistantSnapshots.at(-1).itemId, "builtin-stream:1");
  assert.deepEqual(progress, [], "a later distinct final message must also remain with its canonical owner");
  assert(progress.every(({ kind }) => kind === "commentary"));
});

test("actual late native commentary phase and builtin commentary mirrors do not resend a public reply across hooks", async () => {
  const progress = [];
  const events = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    events.push(event);
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-late-commentary";
  const deltas = ["I", "'ll", " run", " the", " sleep", " test", " now", "."];
  const text = "I'll run the sleep test now.";
  // The streaming item can lack a phase until item/completed identifies it as commentary.
  projection.recordItemStarted({ id: itemId, type: "agentMessage" }, itemId);
  for (const delta of deltas) await projection.handleAssistantDelta({ itemId, delta });
  assert.deepEqual(progress, [], "unphased native deltas stay silent until a real public phase is known");
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text }, itemId, new Set());
  delivery.emitAssistantStreamData({ text: "I'll  run the sleep test now.\n", delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" }, { finalMessage: true });
  assert(events.some(({ stream, data }) => stream === "assistant" && data.text === text));
  assert(events.some(({ stream, data }) => stream === "item" && data.kind === "preamble" && data.itemId === itemId && data.phase === "end"));
  assert(events.some(({ stream, data }) => stream === "item" && data.kind === "preamble" && data.itemId === "builtin-commentary" && data.phase === "end"));
  assert.deepEqual(progress.map(({ text }) => text), [text], "both public completion hooks must suppress the complete streamed fact");

  // The mirrored source must advance its own cursor even when global equality suppresses it.
  delivery.emitAssistantStreamData({ text: `${text} More details.`, delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" });
  assert.equal(progress.at(-1).text, "More details.");
  delivery.emitAssistantStreamData({ text: "I'll stop the sleep test now.", delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" });
  assert.equal(progress.at(-1).text, "I'll stop the sleep test now.", "a different public correction must still reach Live");

  // Execute the builtin event contract with an explicitly marked reasoning payload.
  delivery.emitAssistantStreamData({ text: "PRIVATE_REASONING.", delta: "PRIVATE_REASONING.", isReasoning: true }, { emitPartialReply: true });
  observer.onAgentEvent({ stream: "item", data: { kind: "thought", phase: "update", progressText: "PRIVATE_THOUGHT。" } });
  observer.onAgentEvent({ stream: "reasoning", data: { kind: "preamble", phase: "update", progressText: "PRIVATE_STREAM。" } });
  assert(progress.every(({ text }) => !text.includes("PRIVATE_")));
});

test("actual native commentary updates and builtin completion/reply hooks share normalized public snapshots", async () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-known-commentary";
  projection.recordItemStarted({ id: itemId, type: "agentMessage", phase: "commentary" }, itemId);
  for (const delta of ["正在", " 检查", " 结果。"] ) await projection.handleAssistantDelta({ itemId, delta });
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text: "正在 检查 结果。" }, itemId, new Set());
  delivery.emitAssistantStreamData({ text: "正在\n检查  结果。", delta: "", replace: true, phase: "commentary", itemId: "builtin-different-commentary" }, { finalMessage: true });
  delivery.emitAssistantStreamData({ text: "正在 检查 结果。", delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.deepEqual(progress.map(({ text }) => text), ["正在 检查 结果。"]);
  // A subsequent true extension of the suppressed reply source must append only its suffix.
  observer.onPartialReply({ phase: "commentary", text: "正在 检查 结果。 已完成。" });
  assert.equal(progress.at(-1).text, "已完成。");
});

test("actual Codex date and time fragments reach Live as one complete fact before the backend finishes", async () => {
  const progress = [];
  let finish;
  let projection;
  const runtime = createHarnessRuntime({
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      projection = createNativeProjection((event) => {
        options.onAgentEvent(event);
        if (event.stream === "assistant") options.onPartialReply(event.data);
      });
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  const itemId = "native-exact-time";
  projection.recordItemStarted({ id: itemId, type: "agentMessage", phase: "commentary" }, itemId);
  const fragments = ["当前时间是 ", "202", "6", "-", "10", "-", "02", " ", "14", ":", "22", ":", "15", "，时区 ", "UTC", "+", "08", ":", "00"];
  for (const delta of fragments) {
    await projection.handleAssistantDelta({ itemId, delta });
    assert.deepEqual(progress, [], `unfinished timestamp must not be spoken after ${JSON.stringify(delta)}`);
  }
  await projection.handleAssistantDelta({ itemId, delta: "。" });
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [{ text: "当前时间是 2026-10-02 14:22:15，时区 UTC+08:00。", kind: "commentary" }]);
  // The public fact is delivered while the consult promise is still pending.
  finish({ payloads: [{ text: "后台已经完成全部检查。" }] });
  assert.deepEqual(await pending, { text: "后台已经完成全部检查。" });
});

test("actual native and builtin completion hooks confirm an English numeric sentence without guessing decimal fragments", async () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-numeric-commentary";
  projection.recordItemStarted({ id: itemId, type: "agentMessage", phase: "commentary" }, itemId);
  for (const delta of ["The value is ", "1", ".", "2", "5", "."]) {
    await projection.handleAssistantDelta({ itemId, delta });
    assert.deepEqual(progress, [], "a decimal or a numeric final dot needs completion evidence");
  }
  const text = "The value is 1.25.";
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text }, itemId, new Set());
  assert.deepEqual(progress, [{ text, kind: "commentary" }]);
  delivery.emitAssistantStreamData({ text, delta: "", replace: true, phase: "commentary", itemId: "builtin-number-mirror" }, { finalMessage: true });
  delivery.emitAssistantStreamData({ text, delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(progress.length, 1, "completion and reply mirrors must share the delivered numeric fact");

  // End is not permission to speak an unfinished factual tail without a boundary.
  delivery.emitAssistantStreamData({ text: "Current time is 2026-10-02 14:22:15", delta: "", replace: true, phase: "commentary", itemId: "no-sentence-boundary" }, { finalMessage: true });
  observer.close();
  assert.equal(progress.length, 1);
});

test("sentence and blank-paragraph boundaries coalesce facts while single newlines and final tails remain buffered", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  observer.onPartialReply({ phase: "commentary", text: "The scale is 3." });
  observer.onPartialReply({ phase: "commentary", text: "The scale is 3.14" });
  assert.deepEqual(progress, []);
  observer.onPartialReply({ phase: "commentary", text: "The scale is 3.14. Next fact" });
  assert.deepEqual(progress.map(({ text }) => text), ["The scale is 3.14."]);
  observer.onPartialReply({ phase: "commentary", text: "The scale is 3.14. Next fact! Still checking" });
  assert.deepEqual(progress.map(({ text }) => text), ["The scale is 3.14.", "Next fact!"]);

  observer.onPartialReply({ phase: "commentary", text: "当前时间是\n2026-10-02 14:22:15" });
  assert.equal(progress.length, 2, "a title and single newline are not a complete public fact");
  observer.onPartialReply({ phase: "commentary", text: "当前时间是\n2026-10-02 14:22:15\n \n下一段未完成" });
  assert.equal(progress.at(-1).text, "当前时间是 2026-10-02 14:22:15");
  observer.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "update", itemId: "paragraph-mirror", progressText: "当前时间是\n2026-10-02 14:22:15\n\n下一段未完成" } });
  assert.equal(progress.length, 3, "paragraph whitespace variants must not mirror a delivered fact");
  observer.onPartialReply({ phase: "commentary", text: "完整中文问题？接着完整回答！剩余未结束" });
  assert.equal(progress.at(-1).text, "完整中文问题？接着完整回答！");
  observer.close();
  assert.equal(progress.length, 4, "close must not flush the unfinished final tail or schedule a timer");
});

test("aborted consult ignores late public partials even when its agent finishes later", async () => {
  const controller = new AbortController();
  const progress = [];
  let partial;
  let agentEvent;
  let finish;
  const runtime = createHarnessRuntime({
    signal: controller.signal,
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      partial = options.onPartialReply;
      agentEvent = options.onAgentEvent;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  partial({ phase: "commentary", text: "已经开始。" });
  controller.abort(new Error("user changed their request"));
  partial({ phase: "commentary", text: "旧请求迟到进度。" });
  agentEvent({ stream: "item", data: { kind: "preamble", phase: "update", progressText: "旧请求迟到播报。" } });
  finish({ payloads: [{ text: "旧请求最后结果" }] });
  await pending;
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [{ text: "已经开始。", kind: "commentary" }]);
});

test("throwing, rejecting, or pending progress observers cannot delay or fail the final result", async () => {
  for (const onProgress of [
    () => { throw new Error("observer threw"); },
    () => Promise.reject(new Error("observer rejected")),
    () => new Promise(() => {}),
  ]) {
    let progressCalls = 0;
    const runtime = createHarnessRuntime({
      onProgress: (payload) => { progressCalls++; return onProgress(payload); },
      runEmbeddedAgent: async (options) => {
        options.onPartialReply({ phase: "commentary", text: "正在核对。" });
        return { payloads: [{ text: "核对完成" }] };
      },
    });
    const timer = new AbortController();
    const timeout = new Promise((_, reject) => {
      const id = setTimeout(() => reject(new Error("final reply waited for observer")), 1000);
      timer.signal.addEventListener("abort", () => clearTimeout(id), { once: true });
    });
    try { assert.deepEqual(await Promise.race([runtime.run(), timeout]), { text: "核对完成" }); }
    finally { timer.abort(); }
    await nextTick();
    assert.equal(progressCalls, 1, "the complete fact must exercise the failing or pending callback");
    assert.equal(runtime.observations.cleanup, 1);
    assert.equal(runtime.observations.releases, 1);
  }
});

function createRunner(consult, source = patchedTalk) {
  const dependencies = {
    resolveTalkAgentConsultAuthority: () => ({}),
    parseRealtimeVoiceAgentConsultArgs: (args) => args,
    assertClientVoiceSessionOpen: () => {},
    authorizeClientVoiceConfirmation: () => undefined,
    createTalkClientAgentRuntime: () => ({}),
    normalizeTalkSection: () => ({}),
    runOutsideGatewayRootWorkAdmission: () => ({ run: (callback) => callback(), release: () => {} }),
    tryBeginGatewayRootWorkAdmission: () => {},
    GatewayDrainingError: class extends Error {},
    consultRealtimeVoiceAgent: consult,
    registerClientVoiceConsultRun: () => {},
    bindAuthorizedClientVoiceConfirmation: () => {},
    registerChatAbortController: () => ({ controller: new AbortController(), cleanup: () => {} }),
    REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME: "openclaw_agent_consult",
  };
  return executeFunction(source, "function createTalkClientAgentConsultRunner", "function createTalkClientGatewayControlOwner", dependencies)({
    config: {},
    context: { logGateway: {} },
    sessionTarget: { agentId: "agent", sessionKey: "voice", canonicalKey: "agent:voice", storePath: "/tmp/store" },
    getVoiceSessionId: () => "voice-id",
    initialItems: [],
  });
}

test("actual patched Talk host callbacks bind initial and resumed backend identities without depending on progress", async () => {
  const starts = [], progress = [];
  const runner = createRunner(async options => {
    options.onRunStarted({ runId: "talk-realtime-consult:initial", sessionId: "session", timeoutMs: 60000 });
    options.onResumeRunStarted({ runId: "talk-realtime-consult:resumed", sessionId: "session", timeoutMs: 60000 });
    return { text: "final" };
  }, patchGptLiveContinuationTalk(patchedTalk));
  const context = { onRunStarted: event => starts.push(event) };
  assert.deepEqual(await runner.runArgs({ question: "后台等待任务" }, new AbortController().signal, event => progress.push(event), context), { text: "final" });
  assert.deepEqual(starts, [{ runId: "talk-realtime-consult:initial" }, { runId: "talk-realtime-consult:resumed" }]);
  assert.deepEqual(progress, [], "A silent sleeping task still has its real owner binding");
  assert.deepEqual(await runner.runArgs({ question: "repeat" }, new AbortController().signal, undefined,
    { onRunStarted: () => { throw new Error("observer failed"); } }), { text: "final" });
});

test("Talk runArgs and runPrompt preserve the progress callback and abort signal", async () => {
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); options.onProgress({ text: "public", kind: "commentary" }); return { text: "final" }; });
  const signal = new AbortController().signal;
  const progress = [];
  const onProgress = (payload) => progress.push(payload);
  assert.deepEqual(await runner.runArgs({ question: "first" }, signal, onProgress), { text: "final" });
  assert.deepEqual(await runner.runPrompt({ prompt: "second", signal, onProgress }), { text: "final" });
  assert.deepEqual(calls.map((call) => call.args.question), ["first", "second"]);
  assert(calls.every((call) => call.abortSignal === signal && call.onProgress === onProgress));
  assert.equal(progress.length, 2);
});

test("actual Talk consult transport preserves the full authorized goal and context rather than extracting the first step", async () => {
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); return { text: "真实已结束结果，原样保留" }; });
  const signal = new AbortController().signal;
  const question = "比较 2026-10-08 上海到台北去程 + 2026-10-10 回程 + 十月八至十日酒店，2 成人 / 1 儿童。";
  const context = "已授权整体目标：机票和酒店的具体实价；去程已验证 590 CNY；剩余回程与酒店，不付款或预订。";
  const args = { question, context, responseStyle: "中文，保留精确数字、日期和币种", confirmationId: "server-issued" };
  assert.deepEqual(await runner.runArgs(args, signal), { text: "真实已结束结果，原样保留" });
  assert.deepEqual(calls[0].args, args);
  const nativePrompt = `${question}\n\nContext:\n${context}\n\n剩余步骤：核对回程、核对酒店、合并结果。`;
  await runner.runPrompt({ prompt: nativePrompt, signal });
  assert.equal(calls[1].args.question, nativePrompt, "the native provider's complete delegation input must remain intact");
  assert(calls.every((call) => call.abortSignal === signal));
});

test("Gateway owner forwards the same native-delegation observer through the actual Talk runner", async () => {
  const progress = [];
  const onProgress = (payload) => progress.push(payload);
  const signal = new AbortController().signal;
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); options.onProgress({ text: "native progress", kind: "commentary" }); return { text: "native final" }; });
  const owners = new Map();
  const dependencies = {
    createRealtimeControlQueue: () => ({ seal: () => {}, flush: async () => {} }),
    randomUUID: () => "uuid",
    createRealtimeVoiceSessionHarness: () => ({ close: () => {} }),
    createTalkRealtimeRunControlOwner: () => ({ close: async () => {} }),
    pendingOwners: new Set(),
    owners,
    registerTalkConnectionCleanup: () => {},
  };
  const createOwner = executeFunction(patchedTalk, "function createTalkClientGatewayControlOwner", "async function closeTalkClientGatewayControlSession", dependencies);
  const owner = createOwner({
    context: { logGateway: { warn: () => {} } },
    voiceSessionId: "voice-id",
    connId: "conn",
    runAgentConsult: runner.runArgs,
    flushTranscript: async () => {},
    closeLogicalSession: async () => {},
  });
  owner.activate();
  assert.deepEqual(await owner.runAgentConsult({ prompt: "native question", signal, onProgress }), { text: "native final" });
  assert.equal(calls[0].onProgress, onProgress);
  assert.equal(calls[0].abortSignal, signal);
  assert.deepEqual(progress, [{ text: "native progress", kind: "commentary" }]);
  await owner.close();
  await assert.rejects(owner.runAgentConsult({ prompt: "after close", signal, onProgress }), /Realtime voice session closed/);
  assert.equal(calls.length, 1);
});

test("gateway relay wrapper preserves its native observer and rejects a closed relay", async () => {
  const start = patchedTalk.indexOf("\tconst runAgentConsult = async ({ prompt, signal, onProgress }) => {");
  const end = patchedTalk.indexOf("\tconst runControl = createTalkRealtimeRunControlOwner", start);
  assert(start > 0 && end > start);
  const calls = [];
  let active = true;
  const wrapper = new Function("getActiveRelay", "consultRunner", `${patchedTalk.slice(start, end)}; return runAgentConsult;`)(
    () => active,
    { runPrompt: async (args) => { calls.push(args); return { text: "relay final" }; } },
  );
  const signal = new AbortController().signal;
  const onProgress = () => {};
  assert.deepEqual(await wrapper({ prompt: "relay question", signal, onProgress }), { text: "relay final" });
  assert.deepEqual(calls, [{ prompt: "relay question", signal, onProgress }]);
  active = false;
  await assert.rejects(wrapper({ prompt: "closed", signal, onProgress }), /gateway-relay session is closed/);
  assert.equal(calls.length, 1);
});

test("older callers without a progress observer retain their final reply", async () => {
  const runtime = createHarnessRuntime({
    runEmbeddedAgent: async (options) => {
      options.onPartialReply({ phase: "commentary", text: "public partial" });
      return { payloads: [{ text: "old caller final" }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: "old caller final" });
  const runner = createRunner(async (options) => {
    assert.equal(options.onProgress, undefined);
    return { text: "old prompt caller final" };
  });
  assert.deepEqual(await runner.runPrompt({ prompt: "question", signal: new AbortController().signal }), { text: "old prompt caller final" });
});
