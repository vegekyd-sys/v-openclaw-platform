// WP1 (docs/inter-session/design.md §3.3, §3.4): the exclusive admission guard for inter-session turns.
//
// Static part: the committed files are exactly the patch of the bytes V runs, the anchors are unique,
// the marker is there once, only the intended lines change, the literals agree with contracts.js and
// the guard sits after the queue admission state and before steer/followup and the system-event drain.
// (The literal-text gates and the dispatch-level BUSY of the same package are exercised functionally in
// tests/inter-session-literal-text.test.mjs.)
//
// Functional part: the real prepareReplyRunAdmission and runReplyAgent bodies are cut out of the
// captured and generated files and run against fakes of everything they reach outside themselves
// (an object environment that only answers names the test provides, so a guard variable that were not
// in scope at the anchor would fail with a ReferenceError). Non-inter-session turns must behave exactly
// like the unpatched code; an exclusive turn must end BUSY (onBusy once, silent, typing cleaned,
// { kind: "reply", reply: undefined }, nothing drained) or run on its own, never steered or queued.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  ANCHORS,
  BUSY_REASONS,
  DEFERRED_MEMORY_FLUSH_KEY,
  FILES,
  MARKER,
  PATCHERS,
  patchAgentRunnerRuntime,
  patchDispatchFromConfig,
  patchGetReply,
} from "../lab/release-files/inter-session-admission/patch.mjs";
import * as contracts from "../apps/v-session-relay/plugin/core/contracts.js";

const CAPTURE = "release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist";
const root = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), "utf8");
const capturedPath = (file) => `${CAPTURE}/${file}`;
const generatedPath = (file) => `lab/release-files/inter-session-admission/generated/${file}`;

const V_G = read(capturedPath(FILES.getReply));
const V_R = read(capturedPath(FILES.agentRunnerRuntime));
const GEN_G = read(generatedPath(FILES.getReply));
const GEN_R = read(generatedPath(FILES.agentRunnerRuntime));
const V_D = read(capturedPath(FILES.dispatchFromConfig));
const GEN_D = read(generatedPath(FILES.dispatchFromConfig));

const count = (source, needle) => source.split(needle).length - 1;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// ------------------------------------------------------------------ static

test("both inputs are V's live bytes from the inter-session fixture", () => {
  const fixture = JSON.parse(read("tests/fixtures/inter-session-v-bytes.json"));
  for (const file of Object.values(FILES)) {
    const entry = fixture.files.find((f) => f.file === file);
    assert.ok(entry, `${file} is in tests/fixtures/inter-session-v-bytes.json`);
    assert.deepEqual(entry.workPackages, ["WP1"]);
    assert.equal(entry.captured, capturedPath(file));
    assert.equal(sha256(fs.readFileSync(new URL(capturedPath(file), root))), entry.sha256, `${file} is the capture V runs`);
  }
});

test("the committed files are exactly the patch of the bytes V runs, and parse", () => {
  for (const [file, patch] of Object.entries(PATCHERS)) {
    const generated = read(generatedPath(file));
    assert.equal(patch(read(capturedPath(file))), generated, `${file} regenerates byte for byte`);
    execFileSync(process.execPath, ["--check", new URL(generatedPath(file), root).pathname]);
  }
});

test("every anchor occurs exactly once in V's bytes; the marker is absent before and present once after", () => {
  for (const anchor of ANCHORS.getReply) assert.equal(count(V_G, anchor), 1, JSON.stringify(anchor.slice(0, 80)));
  for (const anchor of ANCHORS.agentRunnerRuntime) assert.equal(count(V_R, anchor), 1, JSON.stringify(anchor.slice(0, 80)));
  for (const anchor of ANCHORS.dispatchFromConfig) assert.equal(count(V_D, anchor), 1, JSON.stringify(anchor.slice(0, 80)));
  assert.deepEqual(Object.keys(ANCHORS).sort(), Object.keys(FILES).sort(), "every patched file has its anchors listed");
  for (const source of [V_G, V_R, V_D]) assert.equal(count(source, MARKER), 0);
  for (const source of [GEN_G, GEN_R, GEN_D]) assert.equal(count(source, MARKER), 1);
});

test("patching twice or a changed file is refused", () => {
  assert.throws(() => patchGetReply(GEN_G), /already patched/u);
  assert.throws(() => patchAgentRunnerRuntime(GEN_R), /already patched/u);
  assert.throws(() => patchDispatchFromConfig(GEN_D), /already patched/u);
  assert.throws(() => patchGetReply("async function other() {}"), /expected exactly one anchor, found 0/u);
  assert.throws(() => patchAgentRunnerRuntime("async function other() {}"), /expected exactly one anchor, found 0/u);
  assert.throws(() => patchDispatchFromConfig("async function other() {}"), /expected exactly one anchor, found 0/u);
  const queueAnchor = ANCHORS.getReply.find((anchor) => anchor.includes("const queueAdmissionState ="));
  const doubled = V_G.replace(queueAnchor, `${queueAnchor}${queueAnchor}`);
  assert.throws(() => patchGetReply(doubled), /queue admission state: expected exactly one anchor, found 2/u);
  const doubledD = V_D.replace(ANCHORS.dispatchFromConfig[3], `${ANCHORS.dispatchFromConfig[3]}${ANCHORS.dispatchFromConfig[3]}`);
  assert.throws(() => patchDispatchFromConfig(doubledD), /fast abort: expected exactly one anchor, found 2/u);
});

/**
 * Line hunks between two mostly equal sources: walk both, and where they differ resync on the nearest
 * three equal lines. [{ at (line in `before`), removed: [...], added: [...] }]
 */
function lineHunks(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  const same = (x, y, n) => {
    if (x + n > a.length || y + n > b.length) return false;
    for (let k = 0; k < n; k += 1) if (a[x + k] !== b[y + k]) return false;
    return true;
  };
  const hunks = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    let found;
    search: for (let d = 1; d <= 200; d += 1) {
      for (let k = 0; k <= d; k += 1) {
        if (same(i + k, j + d - k, 3)) {
          found = [k, d - k];
          break search;
        }
      }
    }
    found ??= [a.length - i, b.length - j];
    hunks.push({ at: i, removed: a.slice(i, i + found[0]), added: b.slice(j, j + found[1]) });
    i += found[0];
    j += found[1];
  }
  return hunks;
}

/** Every changed line lies inside one of the anchors, and every anchor changes. Returns the hunks. */
function assertOnlyAnchorsChange(captured, generated, anchors, file) {
  const ranges = anchors.map((anchor) => {
    const start = captured.slice(0, captured.indexOf(anchor)).split("\n").length - 1;
    return { anchor, start, end: start + anchor.split("\n").length - 1 };
  });
  const hunks = lineHunks(captured, generated);
  const touched = new Set();
  for (const hunk of hunks) {
    const range = ranges.find((r) => hunk.at >= r.start && hunk.at + hunk.removed.length <= r.end);
    assert.ok(range, `${file}: change at line ${hunk.at + 1} is outside every anchor: ${JSON.stringify(hunk).slice(0, 300)}`);
    touched.add(range.anchor);
  }
  assert.equal(touched.size, anchors.length, `${file}: every anchor is patched`);
  return hunks;
}

test("only the intended lines change; everything V already runs (its own markers included) stays", () => {
  const hunksG = assertOnlyAnchorsChange(V_G, GEN_G, ANCHORS.getReply, FILES.getReply);
  const removedG = hunksG.flatMap((h) => h.removed);
  assert.equal(removedG.length, 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1, "only the queued-placeholder, interrupt-clear and literal-text conditions are rewritten");
  assert.ok(removedG.every((l) => !/^\s*(?:\/\/|\/?\*)/u.test(l)), "no comment of V's is removed");
  assert.equal(count(GEN_G, "vInterSessionExclusive(opts, ctx)"), 6, "declaration, heartbeat exit, interrupt clear, queued placeholder, guard, run-now exit");
  assert.equal(count(GEN_G, "vInterSessionLiteralText("), 9, "declaration + directives, native directive, inline actions, native slash, run context, think-level word, session reset, explicit steer");

  const hunksR = assertOnlyAnchorsChange(V_R, GEN_R, ANCHORS.agentRunnerRuntime, FILES.agentRunnerRuntime);
  assert.equal(hunksR.flatMap((h) => h.added).length - hunksR.flatMap((h) => h.removed).length, 11 + 2, "flush seam and the exclusive steer/followup decision");
  assert.equal(count(GEN_R, "//#endregion memory-flush-defer-v1"), 1, "V's memory-flush-defer region is intact");

  const hunksD = assertOnlyAnchorsChange(V_D, GEN_D, ANCHORS.dispatchFromConfig, FILES.dispatchFromConfig);
  assert.equal(hunksD.flatMap((h) => h.removed).length, 1 + 1 + 1 + 1 + 4 + 4, "reset admission, explicit command, fast abort, fast approve, two busy exits");
  assert.equal(count(GEN_D, "vInterSessionLiteralText("), 4, "declaration + reset admission, explicit command, fast abort/approve");
  assert.equal(count(GEN_D, "vInterSessionDispatchBusy(ctx, params.replyOptions);"), 2, "both dispatch busy exits before get-reply");
  assert.equal(count(GEN_D, "finishReplyOperationBusyDispatch("), count(V_D, "finishReplyOperationBusyDispatch("), "no busy exit added or lost");
});

test("the inlined literals agree with apps/v-session-relay/plugin/core/contracts.js", () => {
  assert.equal(MARKER, contracts.MARKERS.interSessionExclusive);
  assert.equal(DEFERRED_MEMORY_FLUSH_KEY, contracts.SYMBOL_KEYS.deferredMemoryFlush);
  assert.equal(Symbol.for(DEFERRED_MEMORY_FLUSH_KEY), contracts.DEFERRED_MEMORY_FLUSH);
  assert.deepEqual([...BUSY_REASONS].sort(), [...contracts.BUSY_REASONS].sort());
  const symbolLiteral = `globalThis[Symbol.for("${contracts.SYMBOL_KEYS.deferredMemoryFlush}")]`;
  assert.equal(count(GEN_G, symbolLiteral), 1, "get-reply reads the seam under the contract key");
  assert.equal(count(GEN_R, `${symbolLiteral} = {`), 1, "agent-runner publishes the seam under the contract key");
  for (const reason of contracts.BUSY_REASONS) assert.ok(GEN_G.includes(`"${reason}"`), `get-reply can report BUSY ${reason}`);
  const reasonsInGuard = [...GEN_G.slice(GEN_G.indexOf("const vBusy = "), GEN_G.indexOf("\n", GEN_G.indexOf("const vBusy = "))).matchAll(/"([a-z_]+)"/gu)]
    .map((m) => m[1]).filter((r) => r !== "empty");
  assert.deepEqual(reasonsInGuard.sort(), [...contracts.BUSY_REASONS].sort(), "the guard's BUSY reasons are exactly the contract's");
  assert.ok(GEN_G.includes("opts?.vInterSession ?? ctx?.VInterSession"), "reads replyOptions.vInterSession, then ctx.VInterSession (A1 fallback)");
  assert.ok(GEN_R.includes("opts?.vInterSession ?? sessionCtx?.VInterSession"));
  assert.ok(GEN_G.includes("vInter?.exclusive === true"));
  assert.ok(GEN_R.includes(")?.exclusive === true;"));
});

const ADMISSION_START = "async function prepareReplyRunAdmission(context) {\n";
const RUNNER_START = "async function runReplyAgent(params) {\n";

/** Source of a top-level function: from its header to the first closing brace at column 0. */
function topLevelFunction(source, header) {
  assert.equal(count(source, header), 1, header);
  const start = source.indexOf(header);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start);
  return source.slice(start, end + 2);
}

test("the guard sits after the queue admission state, before steer/followup and before the system-event drain", () => {
  const fn = topLevelFunction(GEN_G, ADMISSION_START);
  const at = (needle) => {
    assert.equal(count(fn, needle), 1, needle);
    return fn.indexOf(needle);
  };
  const queueState = at("const queueAdmissionState = ");
  const guard = at("const vInter = vInterSessionExclusive(opts, ctx);");
  const steer = at("const shouldSteer = ");
  const followup = at("const shouldFollowup = ");
  const runNow = at("if (isActive && activeRunQueueAction === \"run-now\") {");
  const drain = at("await traceRunPhase(\"reply.drain_system_events\", () => drainSystemEventBlocks());");
  assert.ok(queueState < guard && guard < steer && steer < followup && followup < runNow && runNow < drain);
  // The only system-event drain in the file is that one, after the guard.
  assert.equal(count(GEN_G, "drainSystemEventBlocks()"), 1);
  assert.equal(count(GEN_G, "drainFormattedSystemEvents({"), 1);
  // The heartbeat-timeout exit (before the guard) is silent for an exclusive turn too.
  const heartbeat = at("const vInterHeartbeat = vInterSessionExclusive(opts, ctx);");
  assert.ok(heartbeat < queueState);
  // So is the "still shutting down" exit of the run-now wait (after the guard, before the drain).
  const runNowExit = at("const vInterQueue = vInterSessionExclusive(opts, ctx);");
  assert.ok(runNow < runNowExit && runNowExit < drain);
  // No exit of the admission returns a visible reply for an exclusive turn: every native
  // REPLY_RUN_STILL_SHUTTING_DOWN_TEXT / queueState.reply exit is preceded by the exclusive check.
  for (const exit of ["reply: { text: REPLY_RUN_STILL_SHUTTING_DOWN_TEXT }", "reply: queueState.reply"]) {
    const exitAt = at(exit);
    const before = fn.slice(Math.max(0, exitAt - 400), exitAt);
    assert.match(before, /vInterSessionExclusive\(opts, ctx\);\n\t+if \(vInter\w+\) return vInterSessionBusy\(/u, exit);
  }
  // A "reply" admission returns before the prepared run, which is where the user turn is built and
  // persisted (9.1 get-reply-run.ts executePreparedReplyContext; get-reply-run-execute.ts).
  assert.equal(count(GEN_G, "\tif (admission.kind === \"reply\") return admission.reply;\n\treturn executePreparedReplyRun(admission);\n"), 1);
  const execute = GEN_G.indexOf("async function executePreparedReplyRun(");
  assert.ok(execute > 0 && GEN_G.indexOf("errorContext: \"reply user turn transcript\"") > execute);
  // The silent exit is the native unauthorized-command exit: deliberate silence, typing cleanup, no reply.
  const busy = topLevelFunction(GEN_G, "function vInterSessionBusy(vInter, info, opts, typing) {\n");
  assert.ok(busy.indexOf("vInter.onBusy?.(info)") < busy.indexOf("opts?.onDeliberateSilentTerminalReply?.();"));
  assert.ok(busy.indexOf("opts?.onDeliberateSilentTerminalReply?.();") < busy.indexOf("typing.cleanup();"));
  assert.match(busy, /return \{\n\t\tkind: "reply",\n\t\treply: void 0\n\t\};/u);
});

test("agent-runner: the seam follows the flush-yield rule and the exclusive decision precedes steer/followup", () => {
  const seam = GEN_R.indexOf(`globalThis[Symbol.for("${DEFERRED_MEMORY_FLUSH_KEY}")] = {`);
  assert.ok(seam > GEN_R.indexOf("function resolveReplyActiveAfterDeferredFlushYield(params) {"));
  assert.ok(seam < GEN_R.indexOf("async function waitForSteerTargetBehindDeferredFlush(params) {"));
  assert.ok(seam < GEN_R.indexOf("//#endregion memory-flush-defer-v1"));
  const fn = topLevelFunction(GEN_R, RUNNER_START);
  const exclusive = fn.indexOf("const vExclusive = ");
  assert.ok(exclusive > 0 && exclusive < fn.indexOf("const effectiveShouldSteer = !vExclusive && "));
  assert.ok(fn.indexOf("const effectiveShouldFollowup = !vExclusive && ") > exclusive);
  // Every steer/followup decision below goes through the two effective flags.
  assert.ok(fn.indexOf("if (effectiveShouldSteer && isActive && !shouldQueueAuthorityMismatch") > exclusive);
  assert.ok(fn.indexOf("shouldFollowup: effectiveShouldFollowup || shouldQueueAuthorityMismatch,") > exclusive);
  assert.equal(count(fn, "shouldQueueAuthorityMismatch = effectiveShouldSteer && "), 1);
});

// ------------------------------------------------------------------ functional harness

/**
 * Compile top-level declarations cut out of a dist chunk, resolving every free name through `scope`
 * only (names the scope does not have fall through to real globals; a module name the test forgot
 * fails with a ReferenceError). The code runs in strict mode, as in the ESM chunk.
 */
function compile(declarations, exportName, scope) {
  const env = new Proxy(scope, {
    has: (target, key) => typeof key === "string" && Object.hasOwn(target, key),
    get: (target, key) => (key === Symbol.unscopables ? undefined : target[key]),
  });
  // eslint-disable-next-line no-new-func
  const factory = new Function("__env", `with (__env) { return (function () { "use strict";\n${declarations}\nreturn ${exportName};\n})(); }`);
  return factory(env);
}

/** 9.1 src/auto-reply/reply/queue-policy.ts resolveActiveRunQueueAction (current-turn-images chunk, not patched). */
function resolveActiveRunQueueAction(p) {
  if (!p.isActive && (!p.queueAdmissionState || p.queueAdmissionState === "empty")) return "run-now";
  if (p.isHeartbeat) return "drop";
  if (p.resetTriggered) return "run-now";
  if (p.queueAdmissionState && p.queueAdmissionState !== "empty") return "enqueue-followup";
  if (p.shouldFollowup) return "enqueue-followup";
  return "run-now";
}

const SESSION_KEY = "agent:makaron:feishu:group:oc_0123456789abcdef";
const SESSION_ID = "sess-target";

/**
 * prepareReplyRunAdmission with fakes. `s` describes the session state:
 *   embeddedActive, replyOpActive, recoveryOwner, pendingQueue, heartbeat ("not-heartbeat" | "timed-out" | "drained"),
 *   queueMode, vInter ({ exclusive, onBusy... }) on "opts" | "ctx", flushSeam (an object put on the fake globalThis).
 */
function admissionHarness(source, s = {}) {
  const log = [];
  const fakeGlobal = {};
  if (s.flushSeam) fakeGlobal[Symbol.for(DEFERRED_MEMORY_FLUSH_KEY)] = s.flushSeam;
  const embeddedRuntime = {
    resolveActiveEmbeddedRunSessionId: () => (s.embeddedActive ? SESSION_ID : undefined),
    resolveActiveEmbeddedRunSessionIdBySessionFile: () => undefined,
    resolveEmbeddedSessionLane: (key) => `session:${key}`,
    preemptAndDrainEmbeddedHeartbeatRun: async () => {
      log.push("heartbeat.preempt");
      return s.heartbeat ?? "not-heartbeat";
    },
    isEmbeddedAgentRunActive: () => s.embeddedActive === true,
    waitForEmbeddedAgentRunEnd: async () => undefined,
  };
  const scope = {
    globalThis: fakeGlobal,
    normalizeOptionalString: (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    normalizeThinkLevel: () => undefined,
    getReplySystemEventSessionKey: () => undefined,
    drainFormattedSystemEvents: async (p) => {
      log.push(`drainFormattedSystemEvents:${p.sessionKey}`);
      return undefined;
    },
    buildReplyPromptEnvelope: () => ({ prefixedCommandBody: "body", queuedBody: "body", transcriptBody: "body", transcriptCommandBody: "body", media: [], currentInboundContext: undefined }),
    isFastTestRuntimeEnv: () => true,
    isThinkingLevelSupported: () => true,
    hasResolvedThinkingCatalogEntry: () => true,
    resolveCommandTurnTargetSessionKey: () => undefined,
    resolveSessionFilePathOptions: () => ({}),
    loadSessionEntry: () => undefined,
    formatSqliteSessionFileMarker: ({ sessionId }) => `sqlite:${sessionId}`,
    resolveSessionFilePathCore: (id) => `/sessions/${id}.jsonl`,
    resolveQueueSettings: () => ({ mode: s.queueMode ?? "steer", debounceMs: 0, cap: 20, dropPolicy: "summarize" }),
    loadEmbeddedAgentRuntime: async () => embeddedRuntime,
    getQueueSize: () => s.laneSize ?? 0,
    clearCommandLane: () => {
      log.push("clearCommandLane");
      return 0;
    },
    logVerbose: (m) => log.push(`logVerbose:${m}`),
    resolveAgentHarnessPolicy: () => undefined,
    resolveSessionAuthSelection: async () => ({ profileId: undefined, source: undefined }),
    loadAgentRunnerRuntime: async () => ({ runReplyAgent: () => log.push("runReplyAgent") }),
    resolveRoutedDeliveryThreadId: () => undefined,
    isSlackDirectRoutedThreadTurn: () => false,
    routeThreadIdsMatch: () => true,
    resolveActiveReplyRunThreadId: () => undefined,
    resolveActiveReplyRunSessionId: () => (s.replyOpActive ? SESSION_ID : undefined),
    getSessionWorkAdmissionOwnerRelease: () => (s.recoveryOwner ? { release() {} } : undefined),
    MAIN_SESSION_RECOVERY_WORK_ADMISSION_OWNER: "main-session-recovery",
    isReplyRunActiveForSessionId: () => s.replyOpActive === true,
    admitReplyTurn: async () => {
      log.push("admitReplyTurn");
      return { status: "owned" };
    },
    replyRunRegistry: { resolveCurrentInterruptTarget: () => undefined },
    getExistingFollowupQueue: () => s.pendingQueue,
    resolveActiveRunQueueAction,
    resolvePreparedReplyQueueState: async (p) => {
      log.push(`resolvePreparedReplyQueueState:${p.activeRunQueueAction}`);
      // queueStateStillActive: the run did not let go within the settle timeout (9.1 get-reply-run-queue.ts).
      return s.queueStateStillActive && p.activeRunQueueAction === "run-now" && p.activeSessionId
        ? { kind: "reply", reply: { text: "still shutting down" } }
        : { kind: "continue", busyState: p.resolveBusyState() };
    },
    interruptReplyRunTarget: async () => ({ settled: true }),
    interruptSessionWorkAdmissions: async () => true,
    waitForReplyRunEndBySessionId: async () => undefined,
    REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS: 15_000,
    REPLY_RUN_STILL_SHUTTING_DOWN_TEXT: "still shutting down",
  };
  const fnSource = topLevelFunction(source, ADMISSION_START);
  const helpers = source.includes(MARKER)
    ? source.slice(source.indexOf(`// ${MARKER}:`), source.indexOf(ADMISSION_START))
    : "";
  const prepare = compile(`${helpers}${fnSource}`, "prepareReplyRunAdmission", scope);

  const replyOperation = { key: SESSION_KEY, sessionId: SESSION_ID, result: null, phase: s.replyPhase ?? "running", updateSessionId() {} };
  const opts = {
    replyOperation,
    onDeliberateSilentTerminalReply: () => log.push("onDeliberateSilentTerminalReply"),
    onSessionPrepared: () => log.push("onSessionPrepared"),
  };
  const ctx = { SessionKey: SESSION_KEY };
  if (s.vInter && (s.vInterOn ?? "opts") === "opts") opts.vInterSession = s.vInter;
  if (s.vInter && (s.vInterOn ?? "opts") === "ctx") ctx.VInterSession = s.vInter;
  const typing = { cleanup: () => log.push("typing.cleanup") };
  const context = {
    params: {
      ctx,
      sessionCtx: { ...ctx, Provider: "feishu" },
      cfg: {},
      agentId: "makaron",
      agentDir: "/agents/makaron",
      directives: { hasThinkDirective: false },
      modelState: { allowedModelCatalog: [], resolveThinkingCatalog: async () => [], resolveDefaultThinkingLevel: async () => "off" },
      provider: "deepseek",
      model: "deepseek-flash",
      perMessageQueueOptions: undefined,
      typing,
      opts,
      isNewSession: false,
      sessionKey: SESSION_KEY,
      sessionId: SESSION_ID,
      storePath: "/store/sessions.sqlite",
      sessionEntryHandle: undefined,
      sessionStore: { [SESSION_KEY]: { sessionId: SESSION_ID } },
      resolvedThinkLevel: "off",
      execOverrides: undefined,
    },
    traceRunPhase: async (name, run) => {
      log.push(`phase:${name}`);
      return await run();
    },
    inboundEventKind: "message",
    sourceReplyDeliveryMode: "automatic",
    useFastReplyRuntime: false,
    thinkingRuntime: undefined,
    isFirstTurnInSession: false,
    baseBodyFinal: "body",
    hasUserBody: true,
    isBareSessionReset: false,
    startupAction: undefined,
    startupContextPrelude: undefined,
    softResetTail: "",
    isMainSession: false,
    inboundUserContextPromptJoiner: "\n\n",
    effectiveQueueMode: undefined,
    effectiveResetTriggered: false,
    explicitThinkingLevelOverride: undefined,
    refreshInboundContextAfterAdmissionWait: async () => {},
    isHeartbeat: false,
    sessionEntry: { sessionId: SESSION_ID },
    prefixedBodyBase: "body",
    workspaceDir: "/work",
    skillsWorkspaceDir: "/work",
    runtimePolicySessionKey: SESSION_KEY,
    getInboundContext: () => ({ activeGoalContext: undefined, inboundUserContext: undefined }),
    getSessionEntry: () => ({ sessionId: SESSION_ID }),
  };
  return { run: () => prepare(context), log, replyOperation, fakeGlobal };
}

const project = (r) => (r.kind === "reply"
  ? { kind: r.kind, reply: r.reply }
  : { kind: r.kind, isActive: r.isActive, queueAdmissionState: r.queueAdmissionState, shouldSteer: r.shouldSteer, shouldFollowup: r.shouldFollowup });

function vInterSession(extra = {}) {
  const calls = [];
  return { calls, value: { exclusive: true, id: "s_x", kind: "request", onBusy: (info) => calls.push(info), ...extra } };
}

const PENDING_READY = { items: [{ steerPending: false }], inFlight: new Set(), droppedCount: 0 };
const PENDING_STEERING = { items: [{ steerPending: true }], inFlight: new Set(), droppedCount: 0 };

const SESSION_STATES = {
  idle: {},
  embeddedActive: { embeddedActive: true },
  ownQueuedWithEmbeddedRPC: { embeddedActive: true, replyPhase: 'queued' },
  ownQueuedIdle: { replyPhase: 'queued' },
  replyOpActive: { replyOpActive: true },
  recoveryOwner: { recoveryOwner: true },
  pendingReady: { pendingQueue: PENDING_READY },
  pendingSteering: { pendingQueue: PENDING_STEERING },
  activeAndPending: { embeddedActive: true, pendingQueue: PENDING_READY },
  heartbeatDrained: { embeddedActive: true, heartbeat: "drained" },
  heartbeatTimedOut: { embeddedActive: true, heartbeat: "timed-out" },
  followupMode: { embeddedActive: true, queueMode: "followup" },
  interruptMode: { embeddedActive: true, queueMode: "interrupt" },
  interruptQueuedIdle: { queueMode: "interrupt", laneSize: 2 },
  interruptStillActive: { embeddedActive: true, queueMode: "interrupt", queueStateStillActive: true },
};

test("functional: turns without an exclusive vInterSession behave exactly as V's code", async () => {
  const variants = [
    {},
    { vInter: { exclusive: false, onBusy: () => assert.fail("not exclusive") } },
    { vInter: { onBusy: () => assert.fail("not exclusive") }, vInterOn: "ctx" },
  ];
  for (const [name, state] of Object.entries(SESSION_STATES)) {
    for (const variant of variants) {
      const before = admissionHarness(V_G, { ...state, ...variant });
      const after = admissionHarness(GEN_G, { ...state, ...variant });
      const [a, b] = [await before.run(), await after.run()];
      assert.deepEqual(project(b), project(a), `${name}: same admission`);
      assert.deepEqual(after.log, before.log, `${name}: same side effects`);
    }
  }
});

test("functional: an exclusive turn on an idle session admits exactly like a person's message", async () => {
  for (const vInterOn of ["opts", "ctx"]) {
    const busy = vInterSession();
    const before = admissionHarness(V_G, SESSION_STATES.idle);
    const after = admissionHarness(GEN_G, { vInter: busy.value, vInterOn });
    const [a, b] = [await before.run(), await after.run()];
    assert.equal(b.kind, "ready");
    assert.deepEqual(project(b), project(a));
    assert.deepEqual(after.log, before.log);
    assert.equal(busy.calls.length, 0, "onBusy is not called");
    assert.ok(after.log.includes(`drainFormattedSystemEvents:${SESSION_KEY}`), "system events are drained into this turn as usual");
  }
});

test('functional: own queued reply operation does not hide a competing embedded RPC from an exclusive turn', async () => {
  const busy = vInterSession();
  const h = admissionHarness(GEN_G, {...SESSION_STATES.ownQueuedWithEmbeddedRPC,vInter:busy.value});
  assert.deepEqual(await h.run(), {kind:'reply',reply:undefined});
  assert.deepEqual(busy.calls, [{reason:'active_run',activeSessionId:SESSION_ID}]);
  assert(!h.log.some(x=>x.startsWith('drainFormattedSystemEvents:')), 'BUSY must happen before transcript and system-event side effects');
  const idle = admissionHarness(GEN_G, {...SESSION_STATES.ownQueuedIdle,vInter:vInterSession().value});
  assert.equal((await idle.run()).kind,'ready','a queued placeholder without another run is still idle');
  const flush = vInterSession();
  const flushOnly = admissionHarness(GEN_G, {
    ...SESSION_STATES.ownQueuedWithEmbeddedRPC,
    vInter: flush.value,
    flushSeam: {v:1,activeAfterYield:()=>false},
  });
  assert.equal((await flushOnly.run()).kind, 'ready', 'a deferred memory flush still yields to a queued exclusive turn');
  assert.equal(flush.calls.length, 0);

});

const BUSY_CASES = [
  ["embeddedActive", "active_run"],
  ["replyOpActive", "active_run"],
  ["recoveryOwner", "recovery_owner"],
  ["pendingReady", "pending_queue"],
  ["pendingSteering", "pending_queue"],
  ["activeAndPending", "pending_queue"],
  ["followupMode", "active_run"],
  ["interruptMode", "active_run"],
  ["heartbeatTimedOut", "active_run"],
];

test("functional: BUSY calls onBusy once, ends silently, cleans typing, returns no reply and drains nothing", async () => {
  for (const [name, reason] of BUSY_CASES) {
    for (const vInterOn of ["opts", "ctx"]) {
      const busy = vInterSession();
      const h = admissionHarness(GEN_G, { ...SESSION_STATES[name], vInter: busy.value, vInterOn });
      const result = await h.run();
      assert.deepEqual(result, { kind: "reply", reply: undefined }, `${name}/${vInterOn}`);
      assert.deepEqual(busy.calls, [{ reason, activeSessionId: SESSION_ID }], `${name}: onBusy once with ${reason}`);
      assert.ok(contracts.BUSY_REASONS.includes(busy.calls[0].reason));
      const tail = h.log.slice(-2);
      assert.deepEqual(tail, ["onDeliberateSilentTerminalReply", "typing.cleanup"], `${name}: silent exit is the last thing it does`);
      assert.equal(h.log.filter((e) => e === "onDeliberateSilentTerminalReply").length, 1);
      assert.equal(h.log.filter((e) => e === "typing.cleanup").length, 1);
      for (const forbidden of ["drainFormattedSystemEvents", "phase:reply.drain_system_events", "resolvePreparedReplyQueueState", "clearCommandLane", "admitReplyTurn", "runReplyAgent"]) {
        assert.ok(!h.log.some((e) => e.startsWith(forbidden)), `${name}: no ${forbidden}`);
      }
    }
  }
});

test("functional: the native exits still differ only where an exclusive turn is concerned", async () => {
  // A person's message behind a heartbeat that will not stop gets the native text; an exclusive turn does not.
  const person = await admissionHarness(GEN_G, SESSION_STATES.heartbeatTimedOut).run();
  assert.deepEqual(person, { kind: "reply", reply: { text: "still shutting down" } });
  // A person's message on an active session is admitted for steering (V runs steer mode); an exclusive turn is BUSY.
  const steer = await admissionHarness(GEN_G, SESSION_STATES.embeddedActive).run();
  assert.equal(steer.kind, "ready");
  assert.equal(steer.shouldSteer, true);
});

test("functional: in interrupt queue mode an exclusive turn leaves the session's queued commands alone", async () => {
  // A person's message clears the lane (native interrupt); an idle exclusive turn is admitted and waits in it.
  const person = admissionHarness(GEN_G, SESSION_STATES.interruptQueuedIdle);
  await person.run();
  assert.ok(person.log.includes("clearCommandLane"));
  const busy = vInterSession();
  const exclusive = admissionHarness(GEN_G, { ...SESSION_STATES.interruptQueuedIdle, vInter: busy.value });
  const result = await exclusive.run();
  assert.equal(result.kind, "ready");
  assert.equal(busy.calls.length, 0);
  assert.ok(!exclusive.log.includes("clearCommandLane"));
});

test("functional: a flush-only admission whose run-now wait times out is BUSY, not \"still shutting down\" text", async () => {
  // Interrupt queue mode does not queue a turn behind an active run: a person's message (and an exclusive
  // turn that the guard let through because only a deferred memory flush was running) goes to the
  // run-now wait, which interrupts the flush. If the session still reads active after the settle
  // timeout, V answers with REPLY_RUN_STILL_SHUTTING_DOWN_TEXT. That would be a visible reply in the
  // target chat for an exclusive turn, with no agent run behind it.
  const flushOnly = { v: 1, activeAfterYield: () => false };
  const person = admissionHarness(GEN_G, { ...SESSION_STATES.interruptStillActive, flushSeam: flushOnly });
  assert.deepEqual(await person.run(), { kind: "reply", reply: { text: "still shutting down" } });
  for (const vInterOn of ["opts", "ctx"]) {
    const busy = vInterSession();
    const h = admissionHarness(GEN_G, { ...SESSION_STATES.interruptStillActive, flushSeam: flushOnly, vInter: busy.value, vInterOn });
    assert.deepEqual(await h.run(), { kind: "reply", reply: undefined }, vInterOn);
    assert.deepEqual(busy.calls, [{ reason: "active_run", activeSessionId: SESSION_ID }]);
    assert.ok(h.log.includes("resolvePreparedReplyQueueState:run-now"), "the guard let it through to the run-now wait");
    assert.deepEqual(h.log.slice(-2), ["onDeliberateSilentTerminalReply", "typing.cleanup"]);
    for (const forbidden of ["drainFormattedSystemEvents", "phase:reply.drain_system_events", "runReplyAgent"]) {
      assert.ok(!h.log.some((e) => e.startsWith(forbidden)), `no ${forbidden}`);
    }
  }
  // When the flush lets go in time, the exclusive turn is admitted and drains system events as usual.
  const busy = vInterSession();
  const settled = admissionHarness(GEN_G, { embeddedActive: true, queueMode: "interrupt", flushSeam: flushOnly, vInter: busy.value });
  assert.equal((await settled.run()).kind, "ready");
  assert.equal(busy.calls.length, 0);
  assert.ok(settled.log.includes(`drainFormattedSystemEvents:${SESSION_KEY}`));
});

test("functional: onBusy throwing does not break the silent exit", async () => {
  const h = admissionHarness(GEN_G, { ...SESSION_STATES.embeddedActive, vInter: { exclusive: true, onBusy: () => { throw new Error("bridge bug"); } } });
  assert.deepEqual(await h.run(), { kind: "reply", reply: undefined });
  assert.deepEqual(h.log.slice(-2), ["onDeliberateSilentTerminalReply", "typing.cleanup"]);
  const noCallback = admissionHarness(GEN_G, { ...SESSION_STATES.embeddedActive, vInter: { exclusive: true } });
  assert.deepEqual(await noCallback.run(), { kind: "reply", reply: undefined });
});

/** The seam exactly as the generated agent-runner publishes it, over fake flush jobs and registry. */
function evaluateSeam({ jobs, registry }) {
  const seamStart = GEN_R.indexOf(`globalThis[Symbol.for("${DEFERRED_MEMORY_FLUSH_KEY}")] = {`);
  const seamSource = GEN_R.slice(seamStart, GEN_R.indexOf("\n};\n", seamStart) + 4);
  const fakeGlobal = {};
  compile(`${seamSource}`, "undefined", { globalThis: fakeGlobal, deferredMemoryFlushJobs: jobs, replyRunRegistry: registry });
  return fakeGlobal[Symbol.for(DEFERRED_MEMORY_FLUSH_KEY)];
}

const OWN_OP = { name: "own" };
const OTHER_OP = { name: "other" };
const FLUSH_STATES = {
  noJob: { job: undefined, op: undefined },
  idleJob: { job: { inFlight: 0 }, op: undefined },
  flushRunningNoReply: { job: { inFlight: 1 }, op: undefined },
  flushRunningOwnReply: { job: { inFlight: 1 }, op: OWN_OP },
  flushRunningOtherReply: { job: { inFlight: 2 }, op: OTHER_OP },
  idleJobOtherReply: { job: { inFlight: 0 }, op: OTHER_OP },
};

test("functional: the seam answers exactly as resolveReplyActiveAfterDeferredFlushYield for an active, non-heartbeat turn", () => {
  const rule = topLevelFunction(GEN_R, "function resolveReplyActiveAfterDeferredFlushYield(params) {\n");
  for (const [name, { job, op }] of Object.entries(FLUSH_STATES)) {
    const jobs = new Map(job ? [[SESSION_KEY, job]] : []);
    const registry = { get: (key) => (key === SESSION_KEY ? op : undefined) };
    const seam = evaluateSeam({ jobs, registry });
    assert.equal(seam.v, 1);
    const logged = [];
    const native = compile(rule, "resolveReplyActiveAfterDeferredFlushYield", {
      deferredMemoryFlushJobs: jobs,
      replyRunRegistry: registry,
      logMemoryFlushDeferral: (e) => logged.push(e),
      hashMemoryFlushSessionKey: () => "hash",
    });
    const expected = native({ isActive: true, isHeartbeat: false, sessionKey: SESSION_KEY, providedReplyOperation: OWN_OP });
    assert.equal(seam.activeAfterYield({ sessionKey: SESSION_KEY, providedReplyOperation: OWN_OP }), expected, name);
  }
});

test("functional: get-reply + the real seam: a flush alone does not make the session busy, a reply does", async () => {
  const cases = [
    ["flushRunningNoReply", "ready"],
    ["flushRunningOwnReply", "ready"],
    ["flushRunningOtherReply", "busy"],
    ["noJob", "busy"],
    ["idleJob", "busy"],
  ];
  for (const [name, expected] of cases) {
    const { job, op } = FLUSH_STATES[name];
    const jobs = new Map(job ? [[SESSION_KEY, job]] : []);
    const seen = [];
    const registry = { get: (key) => (key === SESSION_KEY ? op : undefined) };
    const seam = evaluateSeam({ jobs, registry });
    const recording = { v: 1, activeAfterYield: (p) => { seen.push(p); return seam.activeAfterYield(p); } };
    const busy = vInterSession();
    // The flush's embedded run makes the session read active, as in V.
    const h = admissionHarness(GEN_G, { embeddedActive: true, vInter: busy.value, flushSeam: recording });
    // The registry's "own" operation is the turn's own provided reply operation.
    if (op === OWN_OP) registry.get = (key) => (key === SESSION_KEY ? h.replyOperation : undefined);
    const result = await h.run();
    if (expected === "ready") {
      assert.equal(result.kind, "ready", name);
      assert.equal(result.isActive, true, `${name}: runReplyAgent yields the flush, as for a person's message`);
      assert.equal(busy.calls.length, 0);
      assert.ok(h.log.includes(`drainFormattedSystemEvents:${SESSION_KEY}`));
    } else {
      assert.deepEqual(result, { kind: "reply", reply: undefined }, name);
      assert.deepEqual(busy.calls, [{ reason: "active_run", activeSessionId: SESSION_ID }]);
    }
    assert.equal(seen.length, 1);
    assert.equal(seen[0].sessionKey, SESSION_KEY);
    assert.equal(seen[0].providedReplyOperation, h.replyOperation, "the guard passes the turn's own reply operation");
  }
});

test("functional: without the seam, or with a broken one, an active session is BUSY (bounded delay, never a steer)", async () => {
  for (const flushSeam of [undefined, { v: 1 }, { v: 1, activeAfterYield: () => { throw new Error("x"); } }, { v: 1, activeAfterYield: () => undefined }]) {
    const busy = vInterSession();
    const result = await admissionHarness(GEN_G, { embeddedActive: true, vInter: busy.value, flushSeam }).run();
    assert.deepEqual(result, { kind: "reply", reply: undefined });
    assert.deepEqual(busy.calls.map((c) => c.reason), ["active_run"]);
  }
  // Recovery owner is BUSY even if the seam says only a flush runs.
  const busy = vInterSession();
  const result = await admissionHarness(GEN_G, { recoveryOwner: true, embeddedActive: true, vInter: busy.value, flushSeam: { v: 1, activeAfterYield: () => false } }).run();
  assert.deepEqual(result, { kind: "reply", reply: undefined });
  assert.deepEqual(busy.calls.map((c) => c.reason), ["recovery_owner"]);
});

// ------------------------------------------------------------------ runReplyAgent

class RunNow extends Error {}

/** runReplyAgent up to its admission decision: steer, enqueue-followup, drop or run now (stopped by a sentinel). */
function runnerHarness(source, s) {
  const log = [];
  const scope = {
    REPLY_ADMISSION_TICKET: Symbol("ticket"),
    yieldDeferredMemoryFlush: (key, reason) => log.push(`yieldDeferredMemoryFlush:${reason}`),
    resolveReplyActiveAfterDeferredFlushYield: (p) => p.isActive,
    waitForSteerTargetBehindDeferredFlush: async () => {},
    settleProgressVisibilityCallbackResult: async (v) => ({ visible: false, result: v }),
    hasOutboundReplyContent: () => false,
    resolveReplyOperationRunState: () => ({}),
    measureDiagnosticsTimelineSpan: async (name, run) => run(),
    resolveFollowupRunToolAuthorityFingerprint: () => "fp",
    replyRunRegistry: { get: () => s.activeOperation },
    logVerbose: (m) => log.push(`logVerbose:${m}`),
    createTypingSignaler: () => ({ signalToolStart: async () => {}, shouldStartImmediately: false }),
    readChannelSourceTurnId: () => undefined,
    loadSessionEntry: () => undefined,
    isDuplicateRestartRecoverySource: () => false,
    createShouldEmitToolResult: () => () => false,
    createShouldEmitToolOutput: () => () => false,
    updateSessionEntry: async () => {},
    createFollowupRunner: () => "followup-runner",
    bindQueueDispositionToRunState: () => {},
    runActiveReplySteer: async () => log.push("steer"),
    resolveActiveRunQueueAction,
    enqueueFollowupRun: () => {
      log.push("enqueue-followup");
      return true;
    },
    scheduleFollowupDrainAfterReplyOperationClear: () => {},
    scheduleFollowupDrain: () => {},
    resolveQueuedReplyExecutionConfig: async () => {
      log.push("run-now");
      throw new RunNow();
    },
  };
  const runReplyAgent = compile(topLevelFunction(source, RUNNER_START), "runReplyAgent", scope);
  const sessionCtx = { SessionKey: SESSION_KEY, ...(s.vInterOn === "ctx" ? { VInterSession: s.vInter } : {}) };
  const opts = { ...(s.vInter && s.vInterOn !== "ctx" ? { vInterSession: s.vInter } : {}) };
  const params = {
    commandBody: "body",
    transcriptCommandBody: "body",
    followupRun: { run: { provider: "deepseek", sessionKey: SESSION_KEY, config: {} } },
    queueKey: SESSION_KEY,
    resolvedQueue: { mode: s.queueMode ?? "steer" },
    shouldSteer: s.shouldSteer,
    shouldFollowup: s.shouldFollowup,
    queueAdmissionState: s.queueAdmissionState ?? "empty",
    isActive: s.isActive,
    isRunActive: () => s.isActive,
    opts,
    typing: { cleanup: () => log.push("typing.cleanup") },
    sessionEntry: undefined,
    sessionStore: undefined,
    sessionKey: SESSION_KEY,
    runtimePolicySessionKey: SESSION_KEY,
    storePath: undefined,
    sessionCtx,
    resetTriggered: false,
    replyOperation: undefined,
  };
  return {
    log,
    run: async () => {
      try {
        await runReplyAgent(params);
      } catch (error) {
        if (!(error instanceof RunNow)) throw error;
      }
      return log.filter((e) => ["steer", "enqueue-followup", "run-now"].includes(e));
    },
  };
}

const RUNNER_STATES = {
  activeSteer: { isActive: true, shouldSteer: true, shouldFollowup: true },
  activeFollowup: { isActive: true, shouldSteer: false, shouldFollowup: true },
  activeFollowupMode: { isActive: true, shouldSteer: false, shouldFollowup: true, queueMode: "followup" },
  activeCollect: { isActive: true, shouldSteer: false, shouldFollowup: true, queueMode: "collect" },
  activeAuthorityMismatch: { isActive: true, shouldSteer: true, shouldFollowup: false, activeOperation: { toolAuthorityFingerprint: "other" } },
  idle: { isActive: false, shouldSteer: true, shouldFollowup: true },
};

test("functional: runReplyAgent never steers or queues an exclusive turn; it runs now", async () => {
  for (const [name, state] of Object.entries(RUNNER_STATES)) {
    for (const vInterOn of ["opts", "ctx"]) {
      const h = runnerHarness(GEN_R, { ...state, vInter: { exclusive: true }, vInterOn });
      assert.deepEqual(await h.run(), ["run-now"], `${name}/${vInterOn}`);
      const noted = h.log.filter((e) => e.startsWith("logVerbose:inter-session exclusive turn"));
      assert.equal(noted.length, state.isActive ? 1 : 0, `${name}: logs when it found the session active`);
    }
  }
});

test("functional: runReplyAgent is unchanged for every other turn", async () => {
  const expected = {
    activeSteer: ["steer"],
    activeFollowup: ["enqueue-followup"],
    activeFollowupMode: ["enqueue-followup"],
    activeCollect: ["enqueue-followup"],
    activeAuthorityMismatch: ["enqueue-followup"],
    idle: ["run-now"],
  };
  for (const [name, state] of Object.entries(RUNNER_STATES)) {
    for (const vInter of [undefined, { exclusive: false }, { exclusive: "true" }]) {
      const before = runnerHarness(V_R, { ...state, vInter });
      const after = runnerHarness(GEN_R, { ...state, vInter });
      const [a, b] = [await before.run(), await after.run()];
      assert.deepEqual(a, expected[name], `${name}: V's own behaviour`);
      assert.deepEqual(b, a, `${name}: unchanged`);
      assert.deepEqual(after.log, before.log, `${name}: same side effects`);
    }
  }
});
