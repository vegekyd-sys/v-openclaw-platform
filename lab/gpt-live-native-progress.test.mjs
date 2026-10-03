import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { patchGptLiveNativeProgress } from "./patch-gpt-live-native-progress.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const baseline = readFileSync(resolve(here, "fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js"), "utf8");
const patched = patchGptLiveNativeProgress(baseline);

// Evaluate the actual patched runtime class, including runDelegation,
// startDelegation, launchDelegation, stop, detach and sendAppend. Only imported
// provider utilities and the socket/backend boundaries are supplied as fakes.
const NativeFixtureController = new Function(
  "createHash", "randomUUID",
  "toErrorObject", "formatErrorMessage", "rawDataToString",
  "buildOpenAIQuicksilverDelegationPrompt", "parseOpenAIQuicksilverEvent",
  "boundOpenAIQuicksilverDelegationResult", "chunkOpenAIQuicksilverAppendText",
  "boundOpenAIQuicksilverContextItems",
  `${patched.replace(/^import[^\n]*\n/gmu, "").replace(/export \{ OpenAIQuicksilverDelegationController as t \};\s*$/u, "")}\nreturn OpenAIQuicksilverDelegationController;`,
)(
  createHash, randomUUID,
  (error) => error instanceof Error ? error : new Error(String(error)),
  (error) => error instanceof Error ? error.message : String(error),
  (data) => String(data),
  ({ input }) => input,
  (data) => {
    const event = JSON.parse(data);
    if (event.type === "delegation.created") return { kind: "delegation", id: event.item.id, prompt: event.item.content[0].text };
    if (event.type === "turn.done") return { kind: "transcript-done", role: event.turn.role, text: event.turn.transcript };
    if (event.type === "turn.created" || event.type === "turn.delta") return { kind: "ignored", eventType: event.type };
    if (event.type === "input_transcript.added") return { kind: "transcript-delta", role: "user", text: event.item.text };
    return event;
  },
  (text) => text.length <= 1800 ? text : `${text.slice(0, 1784)} [truncated]`,
  (text) => [text],
  (items) => items,
);
const runtimeFile = process.env.VLAB_CANDIDATE_RUNTIME && resolve(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw/dist/realtime-quicksilver-delegation-controller-B0yPpiHp.js");
const Controller = runtimeFile ? (await import(pathToFileURL(runtimeFile).href)).t : NativeFixtureController;

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const nativeFrame = (f, raw) => f.controller.handleFrame(JSON.stringify(raw), false);
const beginUserTurn = (f, id, text) => nativeFrame(f, { type: "turn.created", turn: { id, role: "user", transcript: text } });
const appendUserTurn = (f, id, delta) => nativeFrame(f, { type: "turn.delta", turn_id: id, delta });
const finishUserTurn = (f, id, text) => nativeFrame(f, { type: "turn.done", turn: { id, role: "user", transcript: text } });
function fixture(options = {}) {
  const frames = [], calls = [], warnings = [], fatal = [], logs = [];
  const sessionAbort = new AbortController();
  const socket = { readyState: 1, failNextSend: false, send(payload) {
    if (this.failNextSend) { this.failNextSend = false; throw new Error("temporary socket failure"); }
    frames.push(JSON.parse(payload));
  } };
  const controller = new Controller({
    signal: sessionAbort.signal,
    getSocket: () => socket,
    logger: { warn: (value) => warnings.push(value), info: (value) => logs.push(value) },
    onFatalError: (error) => fatal.push(error),
    isCanceledError: (error) => error?.name === "AbortError",
    runAgentConsult(params) {
      let resolveRun, rejectRun;
      const promise = new Promise((resolve, reject) => { resolveRun = resolve; rejectRun = reject; });
      calls.push({ ...params, resolve: resolveRun, reject: rejectRun });
      return promise;
    },
    ...options,
  });
  const texts = () => frames.map((frame) => frame.content[0].text.replace(/^\[BACKEND_(?:PROGRESS_PENDING|CONTEXT_ONLY|FINAL_PART|FINAL_COMPLETE|FAILURE) \d+\/\d+\]\n[^\n]+\n\n/u, ""));
  return { controller, socket, sessionAbort, calls, frames, texts, warnings, fatal, logs };
}

test("baseline patch rejects source drift and a second application", () => {
  assert.throws(() => patchGptLiveNativeProgress(baseline.replace("\t\tthis.stopped = false;", "\t\tthis.stopped = true;")), /exactly once/u);
  assert.throws(() => patchGptLiveNativeProgress(patched), /exactly once/u);
});

test("generated artifact and candidate overlay exactly match the tested patch", () => {
  const artifact = runtimeFile ?? resolve(here, "release-files/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js");
  assert.equal(readFileSync(artifact, "utf8"), patched);
});

test("public incomplete progress arrives before final through the native protocol", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "查一下");
  const run = f.calls[0];
  assert.equal(typeof run.onProgress, "function");
  assert.equal(typeof run.onCanceled, "function");
  assert.deepEqual(run.continuationIdentity, { delegationItemId: "d1", delegationGeneration: 1 });
  run.onProgress({ kind: "commentary", text: "已找到三条" });
  assert.deepEqual(f.texts(), ["已找到三条"]);
  assert.deepEqual(f.frames[0], { type: "delegation.context.append", delegation_item_id: "d1", channel: "speakable", content: [{ type: "input_text", text: "[BACKEND_PROGRESS_PENDING 1/1]\nParent task remains pending. One short fact when idle; stop for caller. Never guess values or claim completion.\n\n已找到三条" }] });
  run.resolve({ text: "最终确认是两条。" }); await settle();
  assert.deepEqual(f.texts(), ["已找到三条", "最终确认是两条。"]);
  assert.equal(f.fatal.length, 0);
});

test("final-only consult remains one terminal result", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.calls[0].resolve({ text: "完成" }); await settle();
  assert.deepEqual(f.texts(), ["完成"]);
  assert.equal(f.controller.activeDelegationId, undefined);
});

test("completed same-turn replay cannot restart work while changed conditions and new caller turns remain valid", async () => {
  const f = fixture();
  const frame = (id, text, turn = "turn-original") => JSON.stringify({ type: "delegation.created", item: {
    id, type: "delegation", content: [{ type: "input_text", text }], user_bidi_turn_id: turn,
  } });
  beginUserTurn(f, "turn-original", "请查记忆，再执行完整长任务");
  f.controller.handleFrame(frame("early", "请查记忆，再执行完整长任务"), false);
  const early = f.calls[0];
  appendUserTurn(f, "turn-original", "，最终原样报告数字和时间，不要写记忆或发消息");
  f.controller.handleFrame(frame("tail", "最终原样报告数字和时间，不要写记忆或发消息"), false);
  assert.equal(early.signal.aborted, true, "Changed conditions from the same spoken turn still supersede its prefix");
  early.resolve({ text: "stale" }); await settle();
  const current = f.calls[1];
  f.controller.handleFrame(JSON.stringify({ type: "turn.done", turn: {
    id: "turn-original", role: "user", transcript: "请查记忆，再执行完整长任务，最终原样报告数字和时间，不要写记忆或发消息",
  } }), false);
  f.controller.appendTranscript({ kind: "transcript-done", role: "assistant", text: "当前上下文" });
  current.resolve({ text: "完整结果 3396 / 14:05:12 CST +0800" }); await settle();
  const remaining = structuredClone(f.controller.transcript);
  f.controller.handleFrame(frame("after-final-replay", "最终原样报告数字和时间，不要写记忆或发消息"), false);
  assert.equal(f.calls.length, 2);
  assert.equal(f.controller.delegationGeneration, 2);
  assert.deepEqual(f.controller.transcript, remaining, "Ignoring replay does not consume remaining conversation context");
  assert.deepEqual(f.texts(), ["完整结果 3396 / 14:05:12 CST +0800"]);
  f.controller.handleFrame(frame("changed", "补查明天的安排"), false);
  assert.equal(f.calls.length, 3, "Changed conditions on the same turn do not match the completed input version");
  f.calls[2].resolve({ text: "补查完成" }); await settle();
  f.controller.handleFrame(frame("genuine-repeat", "最终原样报告数字和时间，不要写记忆或发消息", "turn-new"), false);
  assert.equal(f.calls.length, 4, "A new caller turn may genuinely repeat the same instruction");
  f.calls[3].resolve({ text: "new task" }); await settle();
});

test("missing provider turn identity preserves delegation behavior and stop clears replay state", async () => {
  const f = fixture();
  f.controller.startDelegation("one", "request"); f.calls[0].resolve({ text: "first" }); await settle();
  f.controller.startDelegation("two", "request"); f.calls[1].resolve({ text: "second" }); await settle();
  assert.equal(f.calls.length, 2);
  for (let index = 0; index < 270; index += 1) {
    beginUserTurn(f, `turn-${index}`, "request");
    finishUserTurn(f, `turn-${index}`, "request");
    f.controller.startDelegation(`d-${index}`, "request", `turn-${index}`);
    f.calls.at(-1).resolve({ text: "done" }); await settle();
  }
  assert.equal(f.controller.delegationInputsByUserTurn.size, 256);
  assert.equal(f.controller.completedUserTurns.size, 256);
  assert.equal(f.controller.nativeUserTurnText.size, 256);
  f.controller.detach();
  assert.equal(f.controller.delegationInputsByUserTurn.size, 0);
  assert.equal(f.controller.completedUserTurns.size, 0);
  assert.equal(f.controller.nativeUserTurnText.size, 0);
});

test("replay protection does not swallow pending, failed, cancelled, incomplete or changed-transcript requests", async t => {
  for (const scenario of ["pending", "failure", "cancel", "partial-send", "no-user-done", "new-transcript"]) await t.test(scenario, async () => {
    const f = fixture();
    beginUserTurn(f, "turn-one", "request");
    if (scenario !== "no-user-done") finishUserTurn(f, "turn-one", "request");
    f.controller.startDelegation("one", "request", "turn-one");
    const first = f.calls[0];
    if (scenario === "failure") first.reject(new Error("provider failed"));
    else if (scenario === "cancel") { first.onCanceled({ runId: "host-run" }); first.resolve({ text: "stale" }); }
    else if (scenario !== "pending") {
      if (scenario === "partial-send") f.socket.failNextSend = true;
      first.resolve({ text: "completed" });
    }
    await settle();
    if (scenario === "new-transcript") f.controller.appendTranscript({ kind: "transcript-delta", role: "user", text: "另外加个条件" });
    f.controller.startDelegation("two", "request", "turn-one");
    if (scenario === "pending") { first.resolve({ text: "stale" }); await settle(); }
    assert.equal(f.calls.length, 2, scenario);
    f.calls[1].resolve({ text: "second result" }); await settle();
  });
});

test("exact native closing done preserves the accepted v7c-shaped full input version", async () => {
  const f = fixture(), turn = "turn-v7c", tail = "数和等待后的,不要写记忆或发消息";
  // Same raw 218-character projection shape; the private person's name is replaced.
  const full = "请完成一个后台只读长任务,先用记忆搜索检索“联系人是谁,与我有什么关系”,再用网络搜索查 OpenAI 官方 Realtime 打断机制,再让一个子代理先执行工作目录查询,确认在候选私有目录里,然后用系统命令产生一个四位随机校验数,播报这个数,然后等待四十五秒,再读取完整的日期、时间和时区,每步有真实结果时简短播报,并自行继续,最终给我记忆事实、官方网页结论 同一 子代理 的 校 验 数 和 等待 后的,不要 写 记忆 或 发 消息";
  assert.equal(full.length, 218);
  beginUserTurn(f, turn, "请");
  nativeFrame(f, { type: "input_transcript.added", item: { text: "旧的另一路输入投影" } });
  appendUserTurn(f, turn, full.slice(1));
  f.controller.startDelegation("gen2", tail, turn);
  const acceptedRevision = f.controller.userTranscriptRevision;
  finishUserTurn(f, turn, full);
  assert.equal(f.controller.userTranscriptRevision, acceptedRevision, "Exact closing done adds no new content");
  f.calls[0].resolve({ text: "原样结果 3396 / 14:05:12 CST +0800" }); await settle();
  f.controller.startDelegation("gen3-replay", tail, turn);
  assert.equal(f.calls.length, 1, "Full-string proof permits the observed post-final replay to be suppressed");
});

test("final cannot cache unconsumed caller conditions or infer closing equality from a suffix", async t => {
  for (const scenario of ["input-and-native-delta", "native-delta-only", "done-correction", "whitespace-correction", "missing-created", "another-turn"]) await t.test(scenario, async () => {
    const f = fixture(), turn = "turn-one", initial = "查机票，等待后给日期", input = "最终给日期";
    if (scenario !== "missing-created") beginUserTurn(f, turn, initial);
    f.controller.startDelegation("accepted", input, turn);
    let closing = initial;
    if (scenario === "input-and-native-delta" || scenario === "native-delta-only") {
      if (scenario === "input-and-native-delta") nativeFrame(f, { type: "input_transcript.added", item: { text: "，另外查酒店" } });
      appendUserTurn(f, turn, "，另外查酒店"); closing += "，另外查酒店";
    } else if (scenario === "done-correction") closing = "还要查酒店，" + initial;
    else if (scenario === "whitespace-correction") closing = "查 机票，等待后给日期";
    else if (scenario === "another-turn") beginUserTurn(f, "turn-new", "另外查酒店");
    finishUserTurn(f, turn, closing);
    f.calls[0].resolve({ text: "旧任务完成" }); await settle();
    assert.equal(f.controller.delegationInputsByUserTurn.size, 0, "No proof that the original consult consumed the new conditions");
    f.controller.startDelegation("repeat-with-context", input, turn);
    assert.equal(f.calls.length, 2, scenario);
    f.calls[1].resolve({ text: "条件已更新" }); await settle();
  });
});

test("raw caller proof is bounded and late raw changes invalidate a completed replay", async () => {
  const f = fixture(); beginUserTurn(f, "one", "request"); finishUserTurn(f, "one", "request");
  f.controller.startDelegation("first", "request", "one"); f.calls[0].resolve({ text: "done" }); await settle();
  appendUserTurn(f, "one", " new condition");
  f.controller.startDelegation("new-condition", "request", "one");
  assert.equal(f.calls.length, 2); f.calls[1].resolve({ text: "next" }); await settle();
  beginUserTurn(f, "large", "x".repeat(16 * 1024)); appendUserTurn(f, "large", "x");
  assert.equal(f.controller.nativeUserTurnText.has("large"), false);
  finishUserTurn(f, "large", "x".repeat(16 * 1024 + 1));
  f.controller.startDelegation("large-input", "request", "large"); f.calls[2].resolve({ text: "done" }); await settle();
  assert.equal(f.controller.delegationInputsByUserTurn.has("large:" + createHash("sha256").update("request").digest("hex")), false);
});

test("actual host run start and accepted cancellation are fingerprinted under their native owner", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: event => diagnostics.push(event) });
  f.controller.startDelegation("provider-item", "request");
  const run = f.calls[0];
  run.onRunStarted({ runId: "talk-realtime-consult:host-run" });
  run.onCanceled({ runId: "talk-realtime-consult:host-run", source: "owned_run_signal" });
  assert.equal(run.signal.aborted, true);
  assert.deepEqual(diagnostics.map(event => event.stage), ["backend-run-started", "backend-cancel-accepted"]);
  for (const event of diagnostics) {
    assert.equal(event.delegationId, "provider-item");
    assert.equal(event.generation, 1);
    assert.equal(event.sourceRunIdSha256, createHash("sha256").update("talk-realtime-consult:host-run").digest("hex"));
  }
  run.onRunStarted({ runId: "late-run" }); run.resolve({ text: "late final" }); await settle();
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(f.frames, []);
});

test("parent waiting chatter cannot occupy the speech slot before a real child stage", async () => {
  const f = fixture(); f.controller.startDelegation("one", "request");
  for (const text of ["我这边也在查官方文档和子代理那部分。", "子代理那边还在跑，我等它出结果再同步。", "后台仍在等待，请稍等。"])
    f.calls[0].onProgress({ kind: "commentary", text });
  assert.deepEqual(f.frames, []);
  f.calls[0].onProgress({ kind: "commentary", text: "四位随机校验数是3396。接下来等待45秒。" });
  assert.deepEqual(f.texts(), ["四位随机校验数是3396。接下来等待45秒。"]);
  f.calls[0].resolve({ text: "完整任务结果。" }); await settle();
});

test("resumed cancellation keeps the actual source distinct from its initial voice owner", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: event => diagnostics.push(event) });
  f.controller.startDelegation("native-item", "request");
  f.calls[0].onCanceled({ runId: "resumed-run", ownerRunId: "initial-run", source: "owned_run_signal" });
  assert.equal(diagnostics[0].sourceRunIdSha256, createHash("sha256").update("resumed-run").digest("hex"));
  assert.equal(diagnostics[0].ownerRunIdSha256, createHash("sha256").update("initial-run").digest("hex"));
  assert.notEqual(diagnostics[0].sourceRunIdSha256, diagnostics[0].ownerRunIdSha256);
  f.calls[0].resolve({ text: "late" }); await settle();
  assert.deepEqual(f.frames, []);
});

test("successive delegations share the speech interval while finals remain intact", async () => {
  const f = fixture();
  f.controller.startDelegation("first", "request");
  f.calls[0].onProgress({ kind: "commentary", text: "已找到第一条" });
  f.calls[0].resolve({ text: "第一项完成" }); await settle();
  f.controller.startDelegation("second", "request");
  f.calls[1].onProgress({ kind: "commentary", text: "已找到第二条" });
  f.calls[1].resolve({ text: "第二项完成" }); await settle();
  assert.deepEqual(f.frames.map(frame => frame.channel), ["speakable", "speakable", "speakable"]);
  assert.deepEqual(f.texts(), ["已找到第一条", "第一项完成", "第二项完成"], "A complete final discards pending progress for that task");
});

test("only explicit public commentary with nonempty text enters voice", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  for (const value of [undefined, {}, { text: "no kind" }, { kind: "reasoning", text: "hidden" }, { kind: "commentary", isReasoning: true, text: "hidden" }, { kind: "commentary", text: "   " }, { kind: "commentary", text: 7 }]) f.calls[0].onProgress(value);
  assert.deepEqual(f.frames, []);
  f.calls[0].onProgress({ kind: "commentary", text: "  公开进展  " });
  f.calls[0].resolve({ text: "完成" }); await settle();
  assert.deepEqual(f.texts(), ["公开进展", "完成"]);
});

test("late callbacks after terminal resolution cannot produce duplicate speech", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  const run = f.calls[0]; run.resolve({ text: "完成" }); await settle();
  run.onProgress({ kind: "commentary", text: "迟到进展" });
  assert.deepEqual(f.texts(), ["完成"]);
});

test("progress delivery exception does not fail or cancel backend completion", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.socket.failNextSend = true;
  assert.doesNotThrow(() => f.calls[0].onProgress({ kind: "commentary", text: "进展" }));
  assert.equal(f.calls[0].signal.aborted, false);
  f.calls[0].resolve({ text: "完成" }); await settle();
  assert.deepEqual(f.texts(), ["完成"]);
  assert.match(f.warnings[0], /progress delivery failed/u);
  assert.equal(f.fatal.length, 0);
});

test("superseded delegation drops both old progress and old final", async () => {
  const f = fixture(); f.controller.startDelegation("old", "旧任务");
  const old = f.calls[0];
  f.controller.startDelegation("new", "新任务");
  assert.equal(old.signal.aborted, true);
  old.onProgress({ kind: "commentary", text: "旧进展" });
  old.resolve({ text: "旧结果" }); await settle();
  assert.equal(f.calls.length, 2);
  f.calls[1].onProgress({ kind: "commentary", text: "新进展" });
  f.calls[1].resolve({ text: "新结果" }); await settle();
  assert.deepEqual(f.texts(), ["新进展", "新结果"]);
  assert(f.frames.every((frame) => frame.delegation_item_id === "new"));
});

test("generation guard invalidates callbacks even when delegation id is reused", async () => {
  const f = fixture(); f.controller.startDelegation("same", "旧任务");
  const old = f.calls[0]; f.controller.startDelegation("same", "新任务");
  old.onProgress({ kind: "commentary", text: "旧进展" });
  old.resolve({ text: "旧结果" }); await settle();
  f.calls[1].resolve({ text: "新结果" }); await settle();
  assert.deepEqual(f.texts(), ["新结果"]);
  assert.equal(f.controller.delegationGeneration, 2);
});

test("rapid superseding runs starts only the latest pending delegation", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "one");
  f.controller.startDelegation("d2", "two"); f.controller.startDelegation("d3", "three");
  f.calls[0].reject(new Error("stale backend failure")); await settle();
  assert.equal(f.calls.length, 2); assert.match(f.calls[1].prompt, /three/u);
  assert.doesNotMatch(f.calls[1].prompt, /two/u);
  f.calls[1].resolve({ text: "three complete" }); await settle();
  assert.deepEqual(f.texts(), ["three complete"]);
  assert.equal(f.warnings.length, 0);
});

test("session abort drops progress and final and aborts the accepted run", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.sessionAbort.abort(new Error("call ended"));
  assert.equal(f.calls[0].signal.aborted, true);
  f.calls[0].onProgress({ kind: "commentary", text: "late" });
  f.calls[0].resolve({ text: "late final" }); await settle();
  assert.deepEqual(f.frames, []);
});

test("detach preserves accepted backend work but prevents progress and final delivery", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.controller.detach(); assert.equal(f.calls[0].signal.aborted, false);
  f.calls[0].onProgress({ kind: "commentary", text: "late" });
  f.calls[0].resolve({ text: "late final" }); await settle();
  assert.deepEqual(f.frames, []);
});

test("current backend failure remains one honest failure result after prior progress", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.calls[0].onProgress({ kind: "commentary", text: "已找到入口" });
  f.calls[0].reject(new Error("backend unavailable")); await settle();
  assert.equal(f.frames.length, 2);
  assert.match(f.texts()[1], /task failed/u);
  assert.equal(f.fatal.length, 0);
});

test("recognized cancellation does not claim failure or completion", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  const error = new Error("cancelled"); error.name = "AbortError";
  f.calls[0].reject(error); await settle();
  assert.deepEqual(f.frames, []);
  assert.equal(f.warnings.length, 0);
});

test("closed socket silently discards progress and final without changing accepted work", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.socket.readyState = 3;
  f.calls[0].onProgress({ kind: "commentary", text: "progress" });
  f.calls[0].resolve({ text: "final" }); await settle();
  assert.deepEqual(f.frames, []);
  assert.equal(f.fatal.length, 0);
});

test("progress feature preserves original transcript context and decoded event entry point", async () => {
  const f = fixture();
  f.controller.handleEvent({ kind: "transcript-delta", role: "user", text: "first" });
  f.controller.handleEvent({ kind: "transcript-done", role: "user", text: "complete" });
  assert.deepEqual(f.controller.transcript, [{ role: "user", text: "complete" }]);
  f.controller.handleEvent({ kind: "delegation", id: "wire", prompt: "request" });
  f.calls[0].onProgress({ kind: "commentary", text: "progress" });
  f.calls[0].resolve({ text: "final" }); await settle();
  assert.deepEqual(f.texts(), ["progress", "final"]);
});

test("diagnostics are off by default while public append roles remain active", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  assert.equal(f.controller.publicProgressTraceEnabled, false);
  f.calls[0].onProgress({ kind: "commentary", text: "公开进度。" });
  f.calls[0].resolve({ text: "完成。" }); await settle();
  assert.deepEqual(f.logs, []);
  assert.deepEqual(f.texts(), ["公开进度。", "完成。"]);
});

test("opt-in diagnostics join emitted metadata with successful append fingerprints", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("d1", "secret prompt must stay out");
  const emittedAt = Date.now();
  f.calls[0].onProgress({ kind: "commentary", text: "后台标记 7231。", provenance: {
    emittedAt, sequence: 7, runId: "run-1", source: "preamble:item-2", itemId: "item-2",
    text: "must not leak", refresh: "must not leak", access: "must not leak",
  } });
  f.calls[0].resolve({ text: "完成。" }); await settle();
  assert.deepEqual(diagnostics.map((event) => event.stage), ["public-progress-received", "context-append-sent", "backend-final-received", "context-append-sent"]);
  assert.deepEqual(diagnostics.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(new Set(diagnostics.map((event) => event.traceId)).size, 1);
  assert(diagnostics.every((event) => event.delegationId === "d1" && event.generation === 1));
  assert.equal(diagnostics[0].textSha256, createHash("sha256").update("后台标记 7231。").digest("hex"));
  assert.equal(diagnostics[1].textSha256, diagnostics[0].textSha256);
  assert.equal(diagnostics[0].sourceRunIdSha256, createHash("sha256").update("run-1").digest("hex"));
  assert.deepEqual(diagnostics[0].provenance, { emittedAt, sequence: 7, runId: "run-1", source: "preamble:item-2", itemId: "item-2" });
  assert.equal(diagnostics[1].appendId, 1);
  assert.equal(diagnostics[3].appendId, 2);
  assert.equal(diagnostics[1].chunkIndex, 0);
  assert.equal(diagnostics[1].chunkCount, 1);
  assert(diagnostics[0].at >= emittedAt);
  assert(diagnostics[1].at >= diagnostics[0].at);
  assert.doesNotMatch(JSON.stringify(diagnostics), /后台标记|must not leak|secret prompt/u);
  assert.deepEqual(f.logs, []);
});

test("diagnostics do not claim failed appends and separately witness an actual late public callback", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("d1", "request");
  f.socket.failNextSend = true;
  f.calls[0].onProgress({ kind: "commentary", text: "first." });
  assert.deepEqual(diagnostics.map((event) => event.stage), ["public-progress-received"]);
  f.socket.readyState = 3;
  f.calls[0].onProgress({ kind: "commentary", text: "second." });
  f.calls[0].resolve({ text: "final." }); await settle();
  const beforeLate = diagnostics.length;
  f.calls[0].onProgress({ kind: "commentary", text: "late." });
  assert.equal(diagnostics.length, beforeLate + 1);
  assert.equal(diagnostics.at(-1).stage, "stale-public-progress-dropped");
  assert.equal(diagnostics.at(-1).textSha256, createHash("sha256").update("late.").digest("hex"));
  assert.equal(diagnostics.filter((event) => event.stage === "context-append-sent").length, 0);
});

test("real stale public callback keeps its original generation and never becomes a new owner's speech", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: event => diagnostics.push(event) });
  f.controller.startDelegation("reused", "first"); const first = f.calls[0];
  f.controller.startDelegation("reused", "second");
  first.onProgress({ kind: "commentary", text: "旧公开事实", provenance: { runId: "original-host-run" } });
  assert.equal(diagnostics.at(-1).stage, "stale-public-progress-dropped");
  assert.equal(diagnostics.at(-1).generation, 1);
  assert.equal(diagnostics.at(-1).sourceRunIdSha256, createHash("sha256").update("original-host-run").digest("hex"));
  assert.deepEqual(f.frames, []);
  first.resolve({ text: "old" }); await settle();
  f.calls[1].resolve({ text: "new" }); await settle();
  assert.equal(diagnostics.at(-1).generation, 2);
  assert.deepEqual(f.texts(), ["new"]);
});

test("host steering context preserves its native channel without public-output diagnostics", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("d1", "request");
  f.controller.sendToActiveDelegation("private host context", "commentary");
  assert.equal(f.frames[0].channel, "commentary");
  assert.equal(f.frames[0].content[0].text, "private host context");
  assert.deepEqual(diagnostics, []);
  f.calls[0].resolve({ text: "final." }); await settle();
  assert.deepEqual(diagnostics.map((event) => event.kind), ["final", "final"]);
});

test("sync and asynchronous diagnostic failures cannot affect accepted work", async () => {
  for (const onPublicProgressDiagnostic of [() => { throw new Error("observer failed"); }, async () => { throw new Error("observer failed"); }]) {
    const f = fixture({ onPublicProgressDiagnostic });
    f.controller.startDelegation("d1", "request");
    f.calls[0].onProgress({ kind: "commentary", text: "progress." });
    f.calls[0].resolve({ text: "final." }); await settle();
    assert.deepEqual(f.texts(), ["progress.", "final."]);
    assert.equal(f.calls[0].signal.aborted, false);
  }
});

test("explicit experiment environment logs only structured metadata", async () => {
  const previous = process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE;
  try {
    process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE = "1";
    const f = fixture(); f.controller.startDelegation("d1", "request");
    f.calls[0].onProgress({ kind: "commentary", text: "公开内容。", provenance: { source: "invalid source text", runId: "valid-run", emittedAt: -1, sequence: "unsafe", access: "never" } });
    f.calls[0].resolve({ text: "结果。" }); await settle();
    assert.equal(f.logs.length, 4);
    const first = JSON.parse(f.logs[0].replace(/^GPT_LIVE_PUBLIC_PROGRESS /u, ""));
    assert.deepEqual(first.provenance, { runId: "valid-run" });
    assert.doesNotMatch(f.logs.join("\n"), /公开内容|结果|invalid source text|unsafe|never/u);
  } finally {
    if (previous === undefined) delete process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE;
    else process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE = previous;
  }
});


test("actual native wire distinguishes child progress from parent final completion", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("d1", "request");
  const childText = "Task complete. 测试码等于 2773。子任务日期是2026年10月2日20时58分48秒。";
  f.calls[0].onProgress({ kind: "commentary", text: childText });
  assert.match(f.frames[0].content[0].text, /^\[BACKEND_PROGRESS_PENDING 1\/1\]\nParent task remains pending\./u);
  assert.match(f.frames[0].content[0].text, /Never guess values or claim completion/u);
  assert.equal(f.texts()[0], childText, "Child wording is preserved as a body fact, not promoted to parent completion");
  const final = "父任务最终结果：测试码等于 2773。" + "核验日期2026年10月2日20时58分48秒；值应精确复述。".repeat(12);
  f.calls[0].resolve({ text: final }); await settle();
  const finalFrames = f.frames.slice(1);
  assert(finalFrames.length > 1);
  assert.equal(f.texts().slice(1).join(""), final);
  for (const [index, frame] of finalFrames.entries()) {
    const label = index + 1 === finalFrames.length ? "FINAL_COMPLETE" : "FINAL_PART";
    assert(frame.content[0].text.startsWith(`[BACKEND_${label} ${index + 1}/${finalFrames.length}]\n`));
    if (label === "FINAL_PART") assert.match(frame.content[0].text, /Wait for BACKEND_FINAL_COMPLETE before answering/u);
  }
  const sent = diagnostics.filter((event) => event.stage === "context-append-sent");
  assert.equal(new Set(sent.slice(1).map((event) => event.appendId)).size, 1, "Chunked final is one logical append");
  assert.deepEqual(sent.map((event) => event.role), ["progress_pending", ...finalFrames.slice(0, -1).map(() => "final_part"), "final_complete"]);
  assert.equal(sent.filter((event) => event.role === "final_complete").length, 1);
});

test("public append chunk budgets include role headers and preserve Unicode and whitespace", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("utf8", "request");
  const text = ("😀中文A e\u0301\n字段：2773，20:58:48； ").repeat(35).trim();
  f.controller.sendAppend("utf8", text, "commentary", {kind: "progress"});
  assert(f.frames.length > 2);
  assert.equal(f.texts().join(""), text);
  const sends = diagnostics.filter((event) => event.stage === "context-append-sent");
  for (const [index, frame] of f.frames.entries()) {
    assert.equal(frame.content.length, 1);
    assert.equal(frame.content[0].type, "input_text");
    const wire = frame.content[0].text;
    const body = f.texts()[index];
    assert(Buffer.byteLength(wire, "utf8") <= 500);
    assert(Buffer.byteLength(body, "utf8") <= 320);
    assert(Buffer.byteLength(wire.slice(0, wire.length - body.length), "utf8") <= 180);
    assert.equal(Buffer.from(body, "utf8").toString("utf8"), body, "No split surrogate or malformed UTF-8");
    assert.equal(sends[index].textSha256, createHash("sha256").update(body).digest("hex"));
    assert.equal(sends[index].wireTextSha256, createHash("sha256").update(wire).digest("hex"));
    assert.equal(sends[index].wireTextChars, wire.length);
    assert.equal(sends[index].chunkIndex, index);
    assert.equal(sends[index].chunkCount, f.frames.length);
    assert.notEqual(sends[index].textSha256, sends[index].wireTextSha256);
  }
  for (const kind of ["progress", "final", "failure"]) {
    const maximum = Number.MAX_SAFE_INTEGER;
    for (const index of [maximum - 2, maximum - 1]) {
      for (const channel of ["speakable", "commentary"]) {
        const { wireText } = f.controller.formatPublicAppendChunk("", kind, index, maximum, channel);
        assert(Buffer.byteLength(wireText, "utf8") <= 180, "Header budget holds even for maximal safe chunk positions");
      }
    }
  }
  f.calls[0].resolve({ text: "完成。" }); await settle();
});

test("wire diagnostic hash comes only from successful sends and includes the fixed role", async () => {
  const diagnostics = [];
  const f = fixture({ onPublicProgressDiagnostic: (event) => diagnostics.push(event) });
  f.controller.startDelegation("d1", "request");
  f.socket.failNextSend = true;
  f.calls[0].onProgress({ kind: "commentary", text: "未发出。" });
  assert.equal(diagnostics.filter((event) => event.wireTextSha256).length, 0);
  f.calls[0].onProgress({ kind: "commentary", text: "已发出。" });
  const sent = diagnostics.find((event) => event.stage === "context-append-sent");
  assert.equal(sent.wireTextSha256, createHash("sha256").update(f.frames[0].content[0].text).digest("hex"));
  assert.equal(sent.role, "progress_pending");
  assert.equal(sent.textSha256, createHash("sha256").update("已发出。").digest("hex"));
  assert.doesNotMatch(JSON.stringify(sent), /BACKEND_PROGRESS_PENDING|已发出/u);
  f.calls[0].resolve({ text: "完成。" }); await settle();
});


test("trusted exact cancellation revokes current delivery before generic continuation failure", async () => {
  const diagnostics = [];
  const f = fixture({onPublicProgressDiagnostic: event => diagnostics.push(event)});
  f.controller.startDelegation("owner", "request");
  const run = f.calls[0];
  run.onProgress({kind: "commentary", text: "测试码等于4323。"});
  const cancellation = new Error("Authorized run cancelled");
  run.onCanceled(cancellation);
  assert.equal(run.signal.aborted, true);
  assert.equal(run.signal.reason, cancellation);
  assert.equal(f.controller.stopped, false, "Whole RTC/session remains open");
  assert.equal(f.sessionAbort.signal.aborted, false);
  await Promise.resolve().then(() => run.onProgress({kind: "commentary", text: "queued old progress"}));
  run.reject(new Error("Voice requester continuation ended without a successful final result"));
  await settle();
  run.onProgress({kind: "commentary", text: "late old progress"});
  assert.deepEqual(f.texts(), ["测试码等于4323。"]);
  assert.equal(f.warnings.length, 0);
  assert.equal(diagnostics.filter(event => event.kind === "final").length, 0);
  assert.equal(f.fatal.length, 0);
});

test("late or duplicate old cancellation cannot revoke a reused-id new delegation", async () => {
  const f = fixture(); f.controller.startDelegation("same", "first request");
  const old = f.calls[0], reason = new Error("first exact cancellation");
  old.onCanceled(reason); old.onCanceled(new Error("duplicate"));
  assert.equal(old.signal.reason, reason);
  f.controller.startDelegation("same", "new request");
  old.onCanceled(new Error("late old cancellation while new task is queued"));
  old.reject(new Error("generic old wrapper failure")); await settle();
  assert.equal(f.calls.length, 2);
  const current = f.calls[1];
  assert.equal(current.signal.aborted, false);
  old.onCanceled(new Error("late old cancellation after new task starts"));
  assert.equal(current.signal.aborted, false);
  current.onProgress({kind:"commentary",text:"new task progress"});
  current.resolve({text:"new task final"}); await settle();
  assert.deepEqual(f.texts(), ["new task progress", "new task final"]);
  assert.equal(f.controller.stopped, false);
  assert.equal(f.warnings.length, 0);
});

test("trusted cancellation also blocks a successful old result and allows a subsequent new call", async () => {
  const f = fixture(); f.controller.startDelegation("old", "request");
  const old = f.calls[0]; old.onCanceled();
  old.resolve({text:"stale success"}); await settle();
  assert.deepEqual(f.frames, []);
  f.controller.startDelegation("new", "fresh request");
  assert.equal(f.calls.length, 2);
  old.onCanceled(new Error("too late"));
  assert.equal(f.calls[1].signal.aborted, false);
  f.calls[1].resolve({text:"fresh final"}); await settle();
  assert.deepEqual(f.texts(), ["fresh final"]);
});

test("cancellation-like worker strings remain honest failures without a trusted cancellation callback", async () => {
  const f = fixture(); f.controller.startDelegation("owner", "request");
  f.calls[0].reject(new Error("worker request request-1 was cancelled")); await settle();
  assert.equal(f.texts().length, 1);
  assert.equal(f.texts()[0], "The agent task failed. Tell the user it did not complete and offer to try again.");
  assert.equal(f.warnings.length, 1);
});

test("trusted cancellation after terminal resolution or stopped session cannot affect another owner", async () => {
  const f = fixture(); f.controller.startDelegation("old", "request");
  const old = f.calls[0]; old.resolve({text:"done"}); await settle();
  f.controller.startDelegation("new", "request");
  old.onCanceled(new Error("cancel terminal old task"));
  assert.equal(f.calls[1].signal.aborted, false);
  f.controller.detach();
  f.calls[1].onCanceled(new Error("cancel detached owner"));
  assert.equal(f.calls[1].signal.aborted, false, "Detached accepted backend work stays independent");
  f.calls[1].resolve({text:"late"}); await settle();
  assert.deepEqual(f.texts(), ["done"]);
});


test("burst facts retain one latest stage for a timed update and final discards the backlog", async t => {
  t.mock.timers.enable({apis: ["Date", "setTimeout"], now: 100000});
  const f = fixture(); f.controller.startDelegation("d1", "request");
  for (const text of ["已找到三个文件。", "已核对来源。", "正在查看下一段。"])
    f.calls[0].onProgress({kind: "commentary", text});
  assert.deepEqual(f.frames.map(frame => frame.channel), ["speakable"]);
  assert.deepEqual(f.texts(), ["已找到三个文件。"]);
  f.calls[0].onProgress({kind: "commentary", text: "已核对来源。"});
  assert.equal(f.frames.length, 1, "An exact queued repeat is neither appended nor queued twice");
  f.calls[0].resolve({text: "最终值2773。"}); await settle();
  t.mock.timers.tick(30000);
  assert.deepEqual(f.texts(), ["已找到三个文件。", "最终值2773。"]);
  assert.equal(f.frames.at(-1).channel, "speakable");
});

test("cooldown emits the latest fact automatically even without another backend callback", async t => {
  t.mock.timers.enable({apis: ["Date", "setTimeout"], now: 100000});
  const diagnostics = [];
  const f = fixture({onPublicProgressDiagnostic: value => diagnostics.push(value)}); f.controller.startDelegation("d1", "request");
  f.calls[0].onProgress({kind: "commentary", text: "第一阶段已完成。"});
  t.mock.timers.tick(2000);
  f.calls[0].onProgress({kind: "commentary", text: "第二阶段已核对。"});
  t.mock.timers.tick(2000);
  f.calls[0].onProgress({kind: "commentary", text: "第三阶段已确认。"});
  t.mock.timers.tick(10999);
  assert.deepEqual(f.texts(), ["第一阶段已完成。"]);
  t.mock.timers.tick(1);
  assert.deepEqual(f.texts(), ["第一阶段已完成。", "第三阶段已确认。"]);
  assert(f.frames.every(frame => frame.channel === "speakable"));
  const sent = diagnostics.filter(value => value.stage === "context-append-sent");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].at - sent[0].at, 15000);
  f.calls[0].resolve({text: "全部完成。"}); await settle();
});

test("queued facts do not outlive cancellation, session detach or a superseding generation", async t => {
  t.mock.timers.enable({apis: ["Date", "setTimeout"], now: 100000});
  for (const action of ["cancel", "stop", "detach", "supersede"]) {
    const f = fixture(); f.controller.startDelegation("old", "request");
    const old = f.calls[0];
    old.onProgress({kind: "commentary", text: "已核对第一项。"});
    old.onProgress({kind: "commentary", text: "已核对第二项。"});
    assert.equal(f.frames.length, 1);
    if (action === "cancel") old.onCanceled(new Error("explicit caller cancellation"));
    if (action === "stop") f.sessionAbort.abort(new Error("caller left"));
    if (action === "detach") f.controller.detach();
    if (action === "supersede") f.controller.startDelegation("new", "new request");
    t.mock.timers.tick(30000);
    assert.deepEqual(f.texts(), ["已核对第一项。"], action);
    if (action === "detach") assert.equal(old.signal.aborted, false);
    old.resolve({text: "old final"}); await settle();
    if (action === "supersede") { f.calls[1].resolve({text:"new final"}); await settle(); }
  }
});

test("setup metadata and waiting language cannot spend the first result speech slot", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  for (const text of ["Read-only, no files written and nothing sent externally.", "Sub-task spawned; awaiting its completion.", "Let me check the records."])
    f.calls[0].onProgress({kind: "commentary", text});
  const fact = "The weather check completed: rain is expected this afternoon.";
  f.calls[0].onProgress({kind: "commentary", text: fact});
  assert.deepEqual(f.frames.map(frame => frame.channel), ["speakable"]);
  assert.equal(f.texts().at(-1), fact);
  f.calls[0].resolve({text: "完整结果。"}); await settle();
});

test("short natural public facts need no result keyword in either language", async () => {
  for (const fact of ["林夏是你的同事，负责产品设计。", "OpenAI 文档建议保持麦克风输入连续。", "The library opens at nine on weekdays.", "Your colleague handles product design."]) {
    const f = fixture(); f.controller.startDelegation("d1", "lookup");
    f.calls[0].onProgress({kind:"commentary",text:"我先检查一下，稍等。"});
    f.calls[0].onProgress({kind:"commentary",text:fact});
    assert.deepEqual(f.frames.map(frame => frame.channel), ["speakable"], fact);
    assert.equal(f.texts().at(-1), fact);
    f.calls[0].resolve({text:"完整结果。"}); await settle();
  }
});

test("a deferred send failure does not abort the running backend or change its final", async t => {
  t.mock.timers.enable({apis: ["Date", "setTimeout"], now: 100000});
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.calls[0].onProgress({kind: "commentary", text: "已核对第一项。"});
  f.calls[0].onProgress({kind: "commentary", text: "已核对第二项。"});
  f.socket.failNextSend = true;
  t.mock.timers.tick(15000);
  assert.equal(f.calls[0].signal.aborted, false);
  assert.equal(f.fatal.length, 0);
  assert.match(f.warnings[0], /progress delivery failed/u);
  f.calls[0].resolve({text: "第二项准确结果：来源甲为 1.25 EUR，来源乙为 9.50 EUR。"}); await settle();
  assert.equal(f.texts().at(-1), "第二项准确结果：来源甲为 1.25 EUR，来源乙为 9.50 EUR。");
});

test("different source values retain their labels and bytes throughout the final wire parts", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "compare specified sources");
  f.calls[0].onProgress({kind: "commentary", text: "第一次采样已核对：来源甲为 02:10:30 CST。"});
  const final = "用户指定 sleep 后的来源乙：2026-10-03 02:10:38 CST。独立校验来源甲：2026-10-03 02:10:30 CST。两次采样不同，不可以互换。";
  f.calls[0].resolve({text:final}); await settle();
  const complete = f.frames.filter(frame => frame.content[0].text.startsWith("[BACKEND_FINAL"));
  const body = complete.map(frame => frame.content[0].text.split("\n\n").slice(1).join("\n\n")).join("");
  assert.equal(body, final, "The controller does not choose, recalculate or substitute either value");
});

test("a long public final retains Unicode and the requested result after the old 1800-character cutoff", async () => {
  const diagnostics = [];
  const f = fixture({onPublicProgressDiagnostic:value => diagnostics.push(value)}); f.controller.startDelegation("d1", "long comparison");
  const final = "已核对的比较依据：😀𠮷，费用单位 CNY。\n".repeat(90) + "最后请求的关键结果：回程含税 790 CNY/人，全家总计 4140 CNY。";
  assert(final.length > 1800);
  assert(Buffer.byteLength(final, "utf8") < 16 * 1024);
  f.calls[0].resolve({text:final}); await settle();
  assert.equal(f.texts().join(""), final);
  assert(f.frames.every(frame => Buffer.byteLength(frame.content[0].text, "utf8") <= 500));
  assert(f.frames.at(-1).content[0].text.startsWith("[BACKEND_FINAL_COMPLETE "));
  assert.equal(diagnostics.find(value => value.stage === "backend-final-received").textSha256, createHash("sha256").update(final).digest("hex"));
  assert.equal(diagnostics.filter(value => value.role === "final_complete").length, 1);
});

test("the final delivery limit uses UTF-8 bytes and never marks a truncated oversized result complete", async () => {
  for (const final of ["x".repeat(16 * 1024 + 1), "中".repeat(5500) + "末尾关键结果不得被截断。", "x".repeat(16 * 1024 - 3) + "😀"]) {
    const diagnostics = [];
    const f = fixture({onPublicProgressDiagnostic:value => diagnostics.push(value)}); f.controller.startDelegation("d1", "long request");
    assert(Buffer.byteLength(final, "utf8") > 16 * 1024);
    f.calls[0].resolve({text:final}); await settle();
    assert.equal(diagnostics.find(value => value.stage === "backend-final-received").textSha256, createHash("sha256").update(final).digest("hex"));
    assert.equal(diagnostics.filter(value => value.role === "final_complete").length, 0);
    assert(f.frames.every(frame => frame.content[0].text.startsWith("[BACKEND_FAILURE ")));
    assert.match(f.texts().join(""), /too long to deliver completely/u);
    assert.doesNotMatch(f.texts().join(""), /\[truncated\]/u);
  }
  const f = fixture(); f.controller.startDelegation("limit", "exact limit");
  const exactLimit = "x".repeat(16 * 1024 - 4) + "😀";
  f.calls[0].resolve({text:exactLimit}); await settle();
  assert.equal(f.texts().join(""), exactLimit);
  assert(f.frames.at(-1).content[0].text.startsWith("[BACKEND_FINAL_COMPLETE "));
});

test("long streamed articles stay silent and final facts remain byte-exact", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  const text = "完整数字2773、日期2026-10-03、时间00:00:00 CST。".repeat(8);
  f.calls[0].onProgress({kind: "commentary", text});
  assert.equal(f.frames.length, 0, "An ineligible article is not sent on a channel that can still cause speech");
  const count = f.frames.length;
  f.calls[0].resolve({text}); await settle();
  assert(f.frames.slice(count).every(frame => frame.channel === "speakable"));
  assert.equal(f.texts().slice(count).join(""), text);
});


test("waiting plans are quiet and do not delay the first verified fact", async () => {
  const f = fixture(); f.controller.startDelegation("d1", "request");
  for (const text of ["我在看相关文件，马上就好。", "我先核对一下，稍等。", "Let me check the records.", "已找到三个相关文件。"])
    f.calls[0].onProgress({kind: "commentary", text});
  assert.deepEqual(f.frames.map(frame => frame.channel), ["speakable"]);
  f.calls[0].resolve({text: "完成。"}); await settle();
});

test("actual child markdown fragments and next-step plans cannot enter or replace the fact queue", async t => {
  t.mock.timers.enable({apis: ["Date", "setTimeout"], now: 100000});
  const f = fixture(); f.controller.startDelegation("d1", "request");
  f.calls[0].onProgress({kind: "commentary", text: "目录已确认。"});
  f.calls[0].onProgress({kind: "commentary", text: "校验数为3968。"});
  for (const text of ["— YES**", "**Raw results:**", "```\n3968\n```", "1. Working directory", "现在开始等四十五秒，然后读取完整的日期、时间和时区。", "下一步去查返回日期。", "Now wait forty-five seconds, then read the date."])
    f.calls[0].onProgress({kind: "commentary", text});
  assert.deepEqual(f.texts(), ["目录已确认。"]);
  t.mock.timers.tick(15000);
  assert.deepEqual(f.texts(), ["目录已确认。", "校验数为3968。"]);
  assert(f.frames.every(frame => frame.channel === "speakable"));
  f.calls[0].resolve({text: "校验数3968，完整结果已交付。"}); await settle();
});
