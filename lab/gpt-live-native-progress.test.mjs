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
  (data) => JSON.parse(data),
  (text) => text.length <= 1800 ? text : `${text.slice(0, 1784)} [truncated]`,
  (text) => [text],
  (items) => items,
);
const runtimeFile = process.env.VLAB_CANDIDATE_RUNTIME && resolve(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw/dist/realtime-quicksilver-delegation-controller-B0yPpiHp.js");
const Controller = runtimeFile ? (await import(pathToFileURL(runtimeFile).href)).t : NativeFixtureController;

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
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
  const texts = () => frames.map((frame) => frame.content[0].text);
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
  assert.deepEqual(run.continuationIdentity, { delegationItemId: "d1", delegationGeneration: 1 });
  run.onProgress({ kind: "commentary", text: "已找到三条" });
  assert.deepEqual(f.texts(), ["已找到三条"]);
  assert.deepEqual(f.frames[0], { type: "delegation.context.append", delegation_item_id: "d1", channel: "speakable", content: [{ type: "input_text", text: "已找到三条" }] });
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

test("diagnostics are off by default without changing the native wire", async () => {
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

test("diagnostics do not claim failed or closed socket appends and ignore late callbacks", async () => {
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
  assert.equal(diagnostics.length, beforeLate);
  assert.equal(diagnostics.filter((event) => event.stage === "context-append-sent").length, 0);
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
