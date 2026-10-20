// Literal text for inter-session turns, and dispatch-level BUSY (lab/release-files/inter-session-admission,
// marker v-inter-session-exclusive-v1; Telegram review of WP6, core-guard review of WP1).
//
// An inter-session turn (replyOptions.vInterSession / ctx.VInterSession) or any turn with
// ctx.CommandInterpretationSuppressed === true carries text that must be taken literally. V configures
// commands.allowFrom with "*" for its channels, so such a turn's sender is command-authorized whatever
// CommandAuthorized says, and before this change several paths interpreted the text anyway, most of them
// before get-reply's admission guard:
//   dispatch: fast abort ("停止" aborted the target's run and posted "⚙️ Agent was aborted."), fast approve
//     ("/approve <id> ..." resolved a pending approval), the dispatch reset admission ("/new" for a
//     suppressed turn without provenance), the explicit-command classification;
//   get-reply: "/new" / "/reset" / "/reset soft" (initSessionState), the native and authorized text slash
//     fast path, the explicit "/steer" retarget, skill slash commands (a tool-dispatch skill ran its tool),
//     explicit skill references, inline simple commands (cut out of the body), the abort-word exemption
//     from the abort cutoff, and, for a vInterSession turn without the suppression flag, directives, the
//     command handlers and the unauthorized whole-message command exit.
// Separately, dispatch's own busy exits before get-reply did not call onBusy, so the bridge reported GATED.
//
// Every case runs the real code cut out of V's captured bytes ("V", the behaviour before the change) and
// out of the generated file ("GEN") against fakes, in strict mode, resolving free names only through the
// names the test provides. A normal turn must behave identically in V and GEN; a literal turn must not
// trigger anything in GEN. The V assertions document what each gate fixes.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { FILES, MARKER } from "../lab/release-files/inter-session-admission/patch.mjs";
import * as contracts from "../apps/v-session-relay/plugin/core/contracts.js";

const CAPTURE = "release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist";
const GENERATED = "lab/release-files/inter-session-admission/generated";
const root = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), "utf8");

const SOURCES = {
  V: { G: read(`${CAPTURE}/${FILES.getReply}`), D: read(`${CAPTURE}/${FILES.dispatchFromConfig}`) },
  GEN: { G: read(`${GENERATED}/${FILES.getReply}`), D: read(`${GENERATED}/${FILES.dispatchFromConfig}`) },
};

const count = (source, needle) => source.split(needle).length - 1;

/** Source of a top-level function: from its header to the first closing brace at column 0. */
function topLevelFunction(source, header) {
  assert.equal(count(source, header), 1, header);
  const start = source.indexOf(header);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start);
  return source.slice(start, end + 2);
}

/** Text of a `//#region <name>` up to its `//#endregion`. */
function region(source, name) {
  const header = `//#region ${name}\n`;
  assert.equal(count(source, header), 1, header);
  const start = source.indexOf(header);
  return source.slice(start, source.indexOf("//#endregion", start));
}

/** Lines of `fn` from the line holding `first` up to (not including) the line holding `stop`. */
function statements(fn, first, stop) {
  assert.equal(count(fn, first), 1, first);
  const start = fn.lastIndexOf("\n", fn.indexOf(first)) + 1;
  const end = fn.lastIndexOf("\n", fn.indexOf(stop, start)) + 1;
  assert.ok(end > start, stop);
  return fn.slice(start, end);
}

/** The package's helper functions in a file (empty for V's bytes): from the marker comment to `header`. */
function helpers(source, header) {
  if (!source.includes(MARKER)) return "";
  const start = source.indexOf(`// ${MARKER}:`);
  return source.slice(start, source.indexOf(header, start));
}
const G_HELPERS_END = "async function prepareReplyRunAdmission(context) {\n";
const D_HELPERS_END = "async function prepareDispatchOperation(state) {\n";

/** Compile declarations, resolving every free name through `scope` only; strict mode, as in the chunk. */
function compile(declarations, exportExpr, scope) {
  const env = new Proxy(scope, {
    has: (target, key) => typeof key === "string" && Object.hasOwn(target, key),
    get: (target, key) => (key === Symbol.unscopables ? undefined : target[key]),
  });
  // eslint-disable-next-line no-new-func
  const factory = new Function("__env", `with (__env) { return (function () { "use strict";\n${declarations}\nreturn ${exportExpr};\n})(); }`);
  return factory(env);
}

/** Run a statement slice of a function body with `scope` as its free names; `resultExpr` after a fall-through. */
async function runSlice(helperSource, slice, resultExpr, scope) {
  const fn = compile(`${helperSource}\nasync function __slice() {\n${slice}\nreturn ${resultExpr};\n}`, "__slice", scope);
  return await fn();
}

const SESSION_KEY = "agent:makaron:feishu:group:oc_0123456789abcdef";
const normalizeOptionalString = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
/** 9.1 src/sessions/session-state-events.ts classifySessionStateActor. */
const classifySessionStateActor = ({ inputProvenance }) => (inputProvenance?.kind === "inter_session"
  ? { actorType: "agent" }
  : inputProvenance?.kind === "internal_system" ? { actorType: "system" } : { actorType: "human" });

/** A subset of 9.1 abort-primitives.ts ABORT_TRIGGERS (isAbortRequestText). */
const ABORT_TRIGGERS = new Set(["stop", "/stop", "esc", "abort", "停止", "停下来", "暂停", "please stop"]);
const isAbortRequestText = (text) => ABORT_TRIGGERS.has(String(text ?? "").trim().toLowerCase());

/**
 * 9.1 session-reset-command.ts resolveAuthorizedSessionResetCommand, for V's configuration
 * (commands.allowFrom "*": reset is authorized for the channel sender) and the default triggers.
 */
function resolveAuthorizedSessionResetCommand({ ctx }) {
  const body = String(ctx.commandText ?? "").trim();
  const softResetMatched = /^\/reset\s+soft(?:\s|$)/iu.test(body);
  const match = softResetMatched ? null : body.match(/^\/(new|reset)(?:\s+([\s\S]*))?$/iu);
  return {
    resetAuthorized: true,
    resetCommand: {
      normalizedResetBody: body,
      softResetMatched,
      triggerBodyNormalized: body,
      ...(match ? { matchedResetTriggerLower: `/${match[1].toLowerCase()}`, payload: match[2] ?? "" } : {}),
    },
  };
}

function vInter(extra = {}) {
  const calls = [];
  return { calls, value: { exclusive: true, id: "s_x", kind: "request", onBusy: (info) => calls.push(info), ...extra } };
}

/**
 * The ways a turn can be literal, applied to a fresh ctx / reply options. "bridge" is what every channel
 * bridge sends (both flags and the object on both sides); the others prove each signal alone suffices.
 */
const LITERAL = {
  bridge: (ctx, opts, v) => {
    ctx.CommandInterpretationSuppressed = true;
    ctx.CommandAuthorized = false;
    ctx.InputProvenance = { kind: "inter_session", sourceSessionKey: "agent:makaron:feishu:direct:ou_a", sourceTool: "sessions_send" };
    ctx.VInterSession = v;
    opts.vInterSession = v;
  },
  suppressedOnly: (ctx) => {
    ctx.CommandInterpretationSuppressed = true;
  },
  ctxVInterSessionOnly: (ctx, _opts, v) => {
    ctx.VInterSession = v;
  },
  optsVInterSessionOnly: (_ctx, opts, v) => {
    opts.vInterSession = v;
  },
};

// ================================================================== dispatch-from-config

const PREPARE_OPERATION = "async function prepareDispatchOperation(state) {\n";
const REPLY_ADMISSION_TICKET = Symbol("replyAdmissionTicket");

/** prepareDispatchOperation with fakes, up to "ready" (plugin-owned binding absent). */
function prepareOperationHarness(source, { text, literal, preDispatch = "ready", vInterValue }) {
  const log = [];
  const finals = [];
  const ctx = { SessionKey: SESSION_KEY, commandText: text, ChatType: "group" };
  const replyOptions = { onModelSelected: () => log.push("onModelSelected") };
  const v = vInterValue ?? vInter({ onBusy: (info) => log.push(`onBusy:${JSON.stringify(info)}`) }).value;
  if (literal) LITERAL[literal](ctx, replyOptions, v);
  const scope = {
    REPLY_ADMISSION_TICKET,
    normalizeOptionalString,
    logVerbose: (m) => log.push(`logVerbose:${m}`),
    resolveSessionModelRef: () => ({ provider: "deepseek", model: "deepseek-v4-flash" }),
    resolveAgentIdentity: () => ({ name: "V" }),
    extractShortModelName: (m) => m,
    // V's abort runtime: an abort word from an authorized sender (V: commands.allowFrom "*") aborts the
    // running turn of the target session and is answered with formatAbortReplyText.
    loadAbortRuntime: async () => ({
      tryFastAbortFromMessage: async ({ ctx: c }) => {
        log.push(`tryFastAbort:${c.commandText}`);
        if (!isAbortRequestText(c.commandText)) return { handled: false, aborted: false };
        log.push(`abortSessionRunTarget:${c.SessionKey}`);
        return { handled: true, aborted: true, stoppedSubagents: 0 };
      },
      formatAbortReplyText: () => "⚙️ Agent was aborted.",
    }),
    loadFastApproveRuntime: async () => ({
      tryFastApproveFromMessage: async ({ ctx: c }) => {
        log.push(`tryFastApprove:${c.commandText}`);
        log.push("approvalResolved");
        return { handled: true, reply: { text: "✅ Approval allow-once submitted for abc." } };
      },
    }),
  };
  const state = {
    attachSourceReplyDeliveryMode: (r) => r,
    cfg: {},
    chatType: "group",
    commitInboundDedupeIfClaimed: () => log.push("commitInboundDedupe"),
    completeDispatchReplyOperation: () => log.push("completeDispatchReplyOperation"),
    ctx,
    deliverySuppressionReason: undefined,
    dispatcher: {
      sendFinalReply: (p) => {
        log.push(`sendFinalReply:${p.text}`);
        finals.push(p);
        return true;
      },
      getQueuedCounts: () => ({ tool: 0, block: 0, final: finals.length }),
    },
    emitMessageReceivedHooks: () => log.push("messageReceivedHooks"),
    finishReplyOperationAbortedDispatch: () => ({ aborted: true }),
    hookRunner: undefined,
    isPreDispatchOperationAborted: () => false,
    markIdle: (r) => log.push(`markIdle:${r}`),
    params: { replyOptions },
    persistPluginBindingUserTurn: async () => undefined,
    pluginOwnedBinding: null,
    recordProcessed: (outcome, o) => log.push(`recordProcessed:${outcome}:${o?.reason}`),
    sendBindingNotice: async () => false,
    sessionAgentId: "makaron",
    sessionKey: SESSION_KEY,
    sessionStoreEntry: { entry: { thinkingLevel: "off" } },
    suppressDelivery: false,
    turnLedger: {},
    routeReplyToOriginating: async () => undefined,
    isRoutedReplyDelivered: () => false,
    markInboundDedupeReplayUnsafe: () => log.push("replayUnsafe"),
    ensureDispatchReplyOperation: async (phase) => {
      log.push(`ensureDispatchReplyOperation:${phase}`);
      return { status: preDispatch };
    },
    finishReplyOperationBusyDispatch: (o) => {
      log.push(`finishReplyOperationBusyDispatch:${o?.dedupeDisposition}`);
      return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } };
    },
  };
  const prepare = compile(`${helpers(source, D_HELPERS_END)}${topLevelFunction(source, PREPARE_OPERATION)}`, "prepareDispatchOperation", scope);
  return { log, finals, run: () => prepare(state) };
}

const project = (r) => (r.status === "ready" ? { status: "ready" } : r);

test("dispatch: a person's abort word and /approve keep their native fast paths", async () => {
  for (const text of ["停止", "stop", "/stop", "please stop", "/approve abc allow-once", "hello"]) {
    const before = prepareOperationHarness(SOURCES.V.D, { text });
    const after = prepareOperationHarness(SOURCES.GEN.D, { text });
    const [a, b] = [await before.run(), await after.run()];
    assert.deepEqual(project(b), project(a), text);
    assert.deepEqual(after.log, before.log, `${text}: same side effects`);
    assert.deepEqual(after.finals, before.finals);
  }
  const abort = prepareOperationHarness(SOURCES.GEN.D, { text: "停止" });
  const result = await abort.run();
  assert.equal(result.status, "complete");
  assert.ok(abort.log.includes(`abortSessionRunTarget:${SESSION_KEY}`));
  assert.deepEqual(abort.finals, [{ text: "⚙️ Agent was aborted." }]);
  const approve = prepareOperationHarness(SOURCES.GEN.D, { text: "/approve abc allow-once" });
  await approve.run();
  assert.ok(approve.log.includes("approvalResolved"));
});

test("dispatch: an abort word in literal text aborts nothing and posts nothing; the turn goes on to admission", async () => {
  for (const text of ["停止", "stop", "/stop", "please stop"]) {
    for (const literal of Object.keys(LITERAL)) {
      // V: the target's running turn is aborted and "⚙️ Agent was aborted." posted, before any admission.
      const before = prepareOperationHarness(SOURCES.V.D, { text, literal });
      assert.equal((await before.run()).status, "complete", `V ${literal} ${text}`);
      assert.ok(before.log.includes(`abortSessionRunTarget:${SESSION_KEY}`), `V aborts for ${literal}`);
      assert.deepEqual(before.finals, [{ text: "⚙️ Agent was aborted." }]);
      const after = prepareOperationHarness(SOURCES.GEN.D, { text, literal });
      assert.deepEqual(project(await after.run()), { status: "ready" }, `${literal} ${text}`);
      assert.deepEqual(after.finals, [], "nothing posted");
      assert.ok(!after.log.some((e) => e.startsWith("tryFastAbort") || e.startsWith("abortSessionRunTarget")), `${literal}: abort runtime not consulted`);
      assert.deepEqual(after.log, [`ensureDispatchReplyOperation:pre_dispatch`, "messageReceivedHooks"], `${literal}: on to the reply-operation admission`);
    }
  }
});

test("dispatch: \"/approve <id>\" in literal text resolves no approval", async () => {
  for (const literal of Object.keys(LITERAL)) {
    const before = prepareOperationHarness(SOURCES.V.D, { text: "/approve abc allow-once", literal });
    await before.run();
    assert.ok(before.log.includes("approvalResolved"), `V resolves the approval for ${literal}`);
    const after = prepareOperationHarness(SOURCES.GEN.D, { text: "/approve abc allow-once", literal });
    assert.deepEqual(project(await after.run()), { status: "ready" });
    assert.ok(!after.log.some((e) => e.startsWith("tryFastApprove") || e === "approvalResolved"), literal);
    assert.deepEqual(after.finals, []);
  }
});

test("dispatch: busy before get-reply reports BUSY active_run to an exclusive turn, once and silently", async () => {
  for (const literal of ["bridge", "ctxVInterSessionOnly", "optsVInterSessionOnly"]) {
    const busy = vInter();
    // V: no onBusy, so the bridge sees neither onAgentRunStart nor onBusy and reports GATED.
    const before = prepareOperationHarness(SOURCES.V.D, { text: "please look at this", literal, preDispatch: "busy", vInterValue: busy.value });
    await before.run();
    assert.equal(busy.calls.length, 0, `V ${literal}`);
    const after = prepareOperationHarness(SOURCES.GEN.D, { text: "please look at this", literal, preDispatch: "busy", vInterValue: busy.value });
    const result = await after.run();
    assert.deepEqual(result, { status: "complete", result: { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } } }, literal);
    assert.deepEqual(busy.calls, [{ reason: "active_run" }], `${literal}: onBusy once`);
    assert.ok(contracts.BUSY_REASONS.includes(busy.calls[0].reason));
    assert.deepEqual(after.finals, [], "nothing posted");
    assert.ok(!("noVisibleReplyFallbackEligible" in result.result), "no channel fallback");
    assert.deepEqual(after.log, ["ensureDispatchReplyOperation:pre_dispatch", "finishReplyOperationBusyDispatch:release"], "the native busy exit, nothing else");
  }
  // Not exclusive, or a person's message: the native busy exit only.
  for (const vInterValue of [{ exclusive: false, onBusy: () => assert.fail("not exclusive") }, { onBusy: () => assert.fail("not exclusive") }]) {
    const h = prepareOperationHarness(SOURCES.GEN.D, { text: "x", literal: "optsVInterSessionOnly", preDispatch: "busy", vInterValue });
    await h.run();
  }
  const before = prepareOperationHarness(SOURCES.V.D, { text: "x", preDispatch: "busy" });
  const after = prepareOperationHarness(SOURCES.GEN.D, { text: "x", preDispatch: "busy" });
  assert.deepEqual(await after.run(), await before.run());
  assert.deepEqual(after.log, before.log);
  // A throwing onBusy does not break the busy exit.
  const throwing = prepareOperationHarness(SOURCES.GEN.D, { text: "x", literal: "bridge", preDispatch: "busy", vInterValue: { exclusive: true, onBusy: () => { throw new Error("bridge bug"); } } });
  assert.equal((await throwing.run()).status, "complete");
});

test("dispatch: the dispatch-phase busy exit (chooseDispatchRoute) reports BUSY too", async () => {
  const CHOOSE = "async function chooseDispatchRoute(state) {\n";
  const run = async (source, { literal, status, vInterValue }) => {
    const slice = statements(topLevelFunction(source, CHOOSE), "const dispatchAcquisition = await state.ensureDispatchReplyOperation(", "\treturn {\n\t\tstatus: \"ready\",\n\t\tstate: extendPreparedDispatchState(state, {\n\t\t\tshouldSuppressDefaultToolProgressMessages,");
    const log = [];
    const ctx = { SessionKey: SESSION_KEY };
    const params = { replyOptions: {} };
    if (literal) LITERAL[literal](ctx, params.replyOptions, vInterValue);
    const state = {
      activeRunSafeCommandTurn: false,
      ensureDispatchReplyOperation: async (phase) => {
        log.push(`ensure:${phase}`);
        return { status };
      },
      finishReplyOperationAbortedDispatch: () => ({ aborted: true }),
      finishReplyOperationBusyDispatch: (o) => {
        log.push(`busy:${o.dedupeDisposition}`);
        return { queuedFinal: false, counts: { final: 0 } };
      },
    };
    const result = await runSlice(helpers(source, D_HELPERS_END), slice, "{ status: \"ready\" }", { state, ctx, params });
    return { result, log };
  };
  for (const literal of ["bridge", "ctxVInterSessionOnly", "optsVInterSessionOnly"]) {
    const busy = vInter();
    const v = await run(SOURCES.V.D, { literal, status: "busy", vInterValue: busy.value });
    assert.equal(busy.calls.length, 0, "V never told the bridge");
    const g = await run(SOURCES.GEN.D, { literal, status: "busy", vInterValue: busy.value });
    assert.deepEqual(g.result, v.result);
    assert.deepEqual(g.log, ["ensure:dispatch", "busy:release"]);
    assert.deepEqual(busy.calls, [{ reason: "active_run" }], literal);
  }
  for (const status of ["ready", "aborted"]) {
    const busy = vInter();
    const g = await run(SOURCES.GEN.D, { literal: "bridge", status, vInterValue: busy.value });
    assert.equal(busy.calls.length, 0, `${status}: no BUSY`);
    assert.deepEqual(g.result, (await run(SOURCES.V.D, { literal: "bridge", status, vInterValue: busy.value })).result);
  }
  const person = await run(SOURCES.GEN.D, { status: "busy" });
  assert.deepEqual(person, await run(SOURCES.V.D, { status: "busy" }));
});

test("dispatch: \"/new\" in literal text is never a reset in the reply-operation admission", () => {
  const RESET = "function resolveDispatchResetAdmission(params) {\n";
  const run = (source, { text, literal, provenance }) => {
    const scope = {
      normalizeOptionalString,
      resolveCommandTurnTargetSessionKey: () => undefined,
      isNativeCommandTurn: () => false,
      classifySessionStateActor,
      canReplaceRestartTombstoneFromParent: () => false,
      loadSessionStoreEntry: () => undefined,
      normalizeChatType: (t) => t,
      resolveGroupSessionKey: () => undefined,
      resolveAuthorizedSessionResetCommand,
      isRestartRecoveryTombstone: () => false,
    };
    const fn = compile(`${helpers(source, D_HELPERS_END)}${topLevelFunction(source, RESET)}`, "resolveDispatchResetAdmission", scope);
    const ctx = { SessionKey: SESSION_KEY, commandText: text, InboundAccessAuthorized: true, InboundEventKind: "message", ChatType: "direct" };
    const opts = {};
    if (literal) LITERAL[literal](ctx, opts, vInter().value);
    if (provenance === false) delete ctx.InputProvenance;
    return fn({ agentId: "makaron", cfg: {}, ctx, entry: { sessionId: "s1" }, hasPluginOwnedBinding: false, sessionKey: SESSION_KEY, storePath: "/store" }).resetTriggered;
  };
  assert.equal(run(SOURCES.V.D, { text: "/new hello" }), true);
  assert.equal(run(SOURCES.GEN.D, { text: "/new hello" }), true, "a person's /new is unchanged");
  assert.equal(run(SOURCES.GEN.D, { text: "hello" }), false);
  // A bridge turn carries inter_session provenance, which already classified it as an agent actor.
  assert.equal(run(SOURCES.V.D, { text: "/new hello", literal: "bridge" }), false);
  assert.equal(run(SOURCES.GEN.D, { text: "/new hello", literal: "bridge" }), false);
  // A literal turn without that provenance (a suppressed chat.send, or a bridge that lost it) was a reset in V.
  for (const literal of ["suppressedOnly", "ctxVInterSessionOnly"]) {
    assert.equal(run(SOURCES.V.D, { text: "/new hello", literal }), true, `V ${literal}`);
    assert.equal(run(SOURCES.GEN.D, { text: "/new hello", literal }), false, literal);
    assert.equal(run(SOURCES.GEN.D, { text: "/new hello", literal: "bridge", provenance: false }), false);
  }
});

test("dispatch: a literal turn is never an explicit command turn (no active-run-safe command resolution)", async () => {
  const CONTEXT = "async function prepareDispatchOperationContext(state) {\n";
  const run = async (source, literal) => {
    const slice = statements(topLevelFunction(source, CONTEXT), "const explicitCommandTurnCtx = ", "const activeRunSafeCommandTurn = ");
    const ctx = { SessionKey: SESSION_KEY };
    const params = { replyOptions: {} };
    if (literal) LITERAL[literal](ctx, params.replyOptions, vInter().value);
    // A command turn a channel classified as an authorized text slash command (the Telegram bridge did,
    // before its own fix, through CommandTurn.authorized).
    return await runSlice(helpers(source, D_HELPERS_END), slice, "explicitCommandTurnCtx", { ctx, params, cfg: {}, isExplicitSourceReplyCommand: () => true });
  };
  assert.equal(await run(SOURCES.V.D), true);
  assert.equal(await run(SOURCES.GEN.D), true);
  for (const literal of Object.keys(LITERAL)) {
    assert.equal(await run(SOURCES.V.D, literal), true, `V ${literal}`);
    assert.equal(await run(SOURCES.GEN.D, literal), false, literal);
  }
});

// ================================================================== get-reply: session reset

test("get-reply: \"/new\", \"/reset\" and \"/reset soft\" in literal text do not reset the session", async () => {
  const INIT = "async function initSessionStateAttemptLocked(params, attemptContext, staleSnapshotRetried, lifecycleMutationIdentity) {\n";
  class ModelSelectionLockedError extends Error {}
  class Stop extends Error {}
  /** "reset" when the attempt treats the turn as a reset; "soft" when it checks a soft reset; else "none". */
  const run = async (source, { text, literal }) => {
    const seen = [];
    const outcome = async (locked) => {
      const scope = {
        resolveMaintenanceConfigFromInput: () => ({}),
        normalizeMainKey: (k) => k ?? "main",
        resolveGroupSessionKey: () => undefined,
        isDiagnosticFlagEnabled: () => false,
        normalizeChatType: (t) => t,
        resolveAuthorizedSessionResetCommand,
        canonicalizeMainSessionAlias: ({ sessionKey }) => sessionKey,
        resolveSessionKey: () => SESSION_KEY,
        buildAgentMainSessionKey: ({ agentId, mainKey }) => `agent:${agentId}:${mainKey}`,
        resolveSessionParentSessionKey: () => undefined,
        loadReplySessionInitializationSnapshot: () => ({ readEntry: () => undefined, currentEntry: { sessionId: "s1", updatedAt: 1 } }),
        maybeRetireLegacyMainDeliveryRoute: () => undefined,
        normalizeOptionalString,
        isRestartRecoveryTombstone: () => false,
        classifySessionStateActor,
        canReplaceRestartTombstoneFromParent: () => false,
        resolveCommandTurnTargetSessionKey: () => undefined,
        resolveSessionWorkStartError: () => undefined,
        ModelSelectionLockedError,
        MODEL_SELECTION_LOCKED_RESET_MESSAGE: "locked",
        // With the model selection locked, a reset throws right away: the observable for resetTriggered.
        isModelSelectionLocked: () => locked,
        resolveThreadFlag: () => false,
        resolveSessionResetType: () => "direct",
        resolveChannelResetConfig: () => undefined,
        resolveSessionResetPolicy: () => ({ configured: false }),
        hasProviderOwnedSession: () => false,
        resolveSessionLifecycleTimestamps: () => ({}),
        evaluateSessionFreshness: () => ({ fresh: false, staleReason: "idle" }),
        isAcpSessionKey: () => false,
        // Evaluated only when softResetMatched && resetAuthorized.
        resolveEffectiveResetTargetSessionKey: () => {
          seen.push("soft");
          return SESSION_KEY;
        },
        hasTerminalMainSessionTranscriptNewerThanRegistry: async () => {
          throw new Stop();
        },
        log: { info: () => {} },
      };
      const fn = compile(`${helpers(source, G_HELPERS_END)}${topLevelFunction(source, INIT)}`, "initSessionStateAttemptLocked", scope);
      const ctx = { SessionKey: SESSION_KEY, commandText: text, ChatType: "direct" };
      if (literal) LITERAL[literal](ctx, {}, vInter().value);
      try {
        await fn({ ctx, cfg: { session: {} }, commandAuthorized: false }, { agentId: "makaron", isSystemEvent: false, retargetedSession: false, sessionCtxForState: ctx, storePath: "/store" }, false, undefined);
      } catch (error) {
        if (error instanceof ModelSelectionLockedError) return "reset";
        if (error instanceof Stop) return seen.includes("soft") ? "soft" : "none";
        throw error;
      }
      assert.fail("the attempt ran past the stop");
    };
    const locked = await outcome(true);
    return locked === "reset" ? "reset" : await outcome(false);
  };
  const cases = [["/new hello", "reset"], ["/reset", "reset"], ["/reset soft", "soft"], ["hello /new", "none"]];
  for (const [text, native] of cases) {
    assert.equal(await run(SOURCES.V.G, { text }), native, `V person: ${text}`);
    assert.equal(await run(SOURCES.GEN.G, { text }), native, `person: ${text}`);
    for (const literal of ["bridge", "suppressedOnly", "ctxVInterSessionOnly"]) {
      // V reset the target session for an inter-session "/new …" (candidate probe of the Telegram review).
      assert.equal(await run(SOURCES.V.G, { text, literal }), native, `V ${literal}: ${text}`);
      assert.equal(await run(SOURCES.GEN.G, { text, literal }), "none", `${literal}: ${text}`);
    }
  }
});

// ================================================================== get-reply: fast paths before session init

test("get-reply: the native / authorized text slash fast path does not run for a literal turn", async () => {
  const FAST = "async function maybeResolveNativeSlashCommandFastReply(params) {\n";
  class Entered extends Error {}
  const run = async (source, { commandTurn, text, literal, provider = "feishu" }) => {
    const fast = region(source, "src/auto-reply/reply/get-reply-native-slash-fast-path.ts");
    const declarations = ["function resolveNativeSlashCommandName(ctx) {\n", "function shouldRunNativeSlashCommandFastPath(ctx) {\n", "function shouldRunInternalTextSlashCommandFastPath(ctx, commandTurn, commandName) {\n", FAST]
      .map((header) => topLevelFunction(fast, header)).join("");
    const scope = {
      resolveCommandTurnContext: (c) => c.CommandTurn ?? { kind: "normal", authorized: false },
      isNativeCommandTurn: (t) => t?.kind === "native",
      isAuthorizedTextSlashCommandTurn: (t) => t?.kind === "text-slash" && t.authorized === true,
      stripStructuralPrefixes: (t) => t,
      normalizeOptionalString,
      isInternalMessageChannel: (channel) => channel === "webchat",
      initFastReplySessionState: () => {
        throw new Entered();
      },
    };
    const fn = compile(`${helpers(source, G_HELPERS_END)}${declarations}`, "maybeResolveNativeSlashCommandFastReply", scope);
    const ctx = { SessionKey: SESSION_KEY, commandText: text, CommandTurn: commandTurn, Provider: provider, ChatType: "direct" };
    const opts = {};
    if (literal) LITERAL[literal](ctx, opts, vInter().value);
    try {
      return await fn({ ctx, opts, commandAuthorized: false, typing: { cleanup() {} } });
    } catch (error) {
      if (error instanceof Entered) return "fast-path";
      throw error;
    }
  };
  // A native command turn, and the one authorized text slash command 9.1 fast-paths (internal channels).
  const turns = [
    [{ kind: "native", source: "native", authorized: true, commandName: "model" }, "/model deepseek", "feishu"],
    [{ kind: "text-slash", source: "text", authorized: true, commandName: "trajectory" }, "/trajectory", "webchat"],
  ];
  for (const [commandTurn, text, provider] of turns) {
    assert.equal(await run(SOURCES.V.G, { commandTurn, text, provider }), "fast-path");
    assert.equal(await run(SOURCES.GEN.G, { commandTurn, text, provider }), "fast-path", "unchanged for a command turn");
    for (const literal of Object.keys(LITERAL)) {
      assert.equal(await run(SOURCES.V.G, { commandTurn, text, provider, literal }), "fast-path", `V ${literal}`);
      assert.deepEqual(await run(SOURCES.GEN.G, { commandTurn, text, provider, literal }), { handled: false }, literal);
    }
  }
  assert.deepEqual(await run(SOURCES.GEN.G, { text: "/status" }), { handled: false }, "a plain message never took it");
});

test("get-reply: an explicit /steer in literal text does not retarget the turn", async () => {
  const GET_REPLY = "async function getReplyFromConfig(ctx, opts, configOverride) {\n";
  const run = async (source, literal) => {
    const slice = statements(topLevelFunction(source, GET_REPLY), "\tif (explicitSteerTargetSessionKey", "const initialAgentScope = ");
    const finalized = { SessionKey: SESSION_KEY };
    const opts = {};
    if (literal) LITERAL[literal](finalized, opts, vInter().value);
    // resolveActiveExplicitSteerSessionKey found an active session for "/steer …" (native or authorized text slash).
    return await runSlice(helpers(source, G_HELPERS_END), slice, "finalized.CommandTargetSessionKey", { finalized, opts, explicitSteerTargetSessionKey: "agent:makaron:main" });
  };
  assert.equal(await run(SOURCES.V.G), "agent:makaron:main");
  assert.equal(await run(SOURCES.GEN.G), "agent:makaron:main");
  for (const literal of Object.keys(LITERAL)) {
    assert.equal(await run(SOURCES.V.G, literal), "agent:makaron:main", `V ${literal}`);
    assert.equal(await run(SOURCES.GEN.G, literal), undefined, literal);
  }
});

// ================================================================== get-reply: directives and run context

test("get-reply: directives are not interpreted for any literal turn (the native gate now also covers vInterSession)", async () => {
  const DIRECTIVES = "async function resolveReplyDirectives(params) {\n";
  class Stop extends Error {}
  const run = async (source, literal) => {
    const seen = [];
    const scope = {
      listAgentEntries: () => [],
      normalizeAgentId: (x) => x,
      buildCommandContext: () => ({ isAuthorizedSender: true, senderIsOwner: true, surface: "feishu", channel: "feishu", commandBodyNormalized: "/think high do X" }),
      shouldHandleTextCommands: () => true,
      hasSkillReferenceCandidate: () => false,
      normalizeOptionalString,
      normalizeLowercaseStringOrEmpty: (v) => String(v ?? "").toLowerCase(),
      reserveSkillCommandNames: () => {},
      resolveCommandTurnContext: () => ({ kind: "normal", authorized: false }),
      isNativeCommandTurn: () => false,
      resolveReplyDirectiveRouting: (p) => {
        seen.push(p.canInterpretTextDirectives);
        throw new Stop();
      },
    };
    const fn = compile(`${helpers(source, G_HELPERS_END)}${topLevelFunction(source, DIRECTIVES)}`, "resolveReplyDirectives", scope);
    const ctx = { SessionKey: SESSION_KEY };
    const opts = {};
    if (literal) LITERAL[literal](ctx, opts, vInter().value);
    try {
      await fn({ ctx, cfg: { agents: { defaults: {} } }, agentId: "makaron", sessionCtx: { commandText: "/think high do X", agentText: "/think high do X" }, sessionEntry: {}, sessionStore: {}, sessionKey: SESSION_KEY, opts, typing: { cleanup() {} }, commandAuthorized: false });
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
    }
    return seen[0];
  };
  assert.equal(await run(SOURCES.V.G), true);
  assert.equal(await run(SOURCES.GEN.G), true, "a person's directives are unchanged");
  for (const literal of ["bridge", "suppressedOnly"]) {
    assert.equal(await run(SOURCES.V.G, literal), false, `V already ${literal}`);
    assert.equal(await run(SOURCES.GEN.G, literal), false, literal);
  }
  for (const literal of ["ctxVInterSessionOnly", "optsVInterSessionOnly"]) {
    assert.equal(await run(SOURCES.V.G, literal), true, `V ${literal}`);
    assert.equal(await run(SOURCES.GEN.G, literal), false, literal);
  }
});

test("get-reply: the unauthorized whole-message command exit does not swallow a literal turn", async () => {
  const CONTEXT = "async function prepareReplyRunContext(params) {\n";
  const run = async (source, literal) => {
    const slice = statements(topLevelFunction(source, CONTEXT), "const canInterpretCommands = ", "const isBareNewOrReset = ");
    const log = [];
    const ctx = { SessionKey: SESSION_KEY };
    const opts = { onDeliberateSilentTerminalReply: () => log.push("silent") };
    if (literal) LITERAL[literal](ctx, opts, vInter().value);
    const result = await runSlice(helpers(source, G_HELPERS_END), slice, "{ continued: true, canInterpretCommands }", {
      ctx,
      opts,
      cfg: {},
      commandTurn: { kind: "normal", authorized: false },
      isNativeCommandTurn: () => false,
      isTextSlashCommandTurn: () => false,
      allowTextCommands: true,
      isWholeMessageCommand: true,
      hasControlCommand: () => true,
      rawBodyTrimmed: "/new",
      isResetOrNewCommand: true,
      commandAuthorized: false,
      command: { isAuthorizedSender: true },
      typing: { cleanup: () => log.push("typing.cleanup") },
    });
    return { result, log };
  };
  const person = await run(SOURCES.GEN.G);
  assert.deepEqual(person, await run(SOURCES.V.G));
  assert.deepEqual(person.result, { kind: "reply", reply: undefined }, "an unauthorized person's /new is dropped silently, as before");
  for (const literal of Object.keys(LITERAL)) {
    const after = await run(SOURCES.GEN.G, literal);
    assert.deepEqual(after.result, { continued: true, canInterpretCommands: false }, literal);
    assert.deepEqual(after.log, []);
  }
  assert.deepEqual((await run(SOURCES.V.G, "ctxVInterSessionOnly")).result, { kind: "reply", reply: undefined }, "V dropped a vInterSession turn without the flag");
});

// ================================================================== get-reply: inline actions

const INLINE_REGION = "src/auto-reply/reply/get-reply-inline-actions.ts";
const SKILLS = [{ name: "makaron", skillName: "makaron", skillFile: "/skills/makaron/SKILL.md", dispatch: { kind: "tool", toolName: "makaron_tool" } }];
const BUILTIN = new Set(["btw", "think", "verbose", "reasoning", "elevated", "exec", "model", "status", "queue", "help", "new", "reset", "stop", "approve", "skill"]);

/** handleInlineActions with fakes for V's skills, commands and abort cutoff. */
function inlineHarness(source, { text, literal, entry = {}, timestamp = 200 }) {
  const log = [];
  const ctx = { SessionKey: SESSION_KEY, Surface: "feishu", Provider: "feishu", MessageSid: "m2", Timestamp: timestamp };
  const opts = { onBlockReply: async (r) => log.push(`blockReply:${r.text}`) };
  if (literal) LITERAL[literal](ctx, opts, vInter().value);
  const sessionCtx = { ...ctx, Body: text, agentText: text, BodyForAgent: text, BodyStripped: text };
  const modules = [
    ["chat-commands.runtime.js", { listSkillCommandsForWorkspace: () => (log.push("listSkillCommands"), SKILLS) }],
    ["tool-dispatch-", { resolveSkillDispatchTools: () => [{ name: "makaron_tool", execute: async () => (log.push("skillTool.execute"), { content: "drew a cat" }) }] }],
    ["abort-cutoff.runtime.js", { clearAbortCutoffInSessionRuntime: async () => log.push("clearAbortCutoff") }],
    ["commands.runtime-", {
      // 9.1 commands-core.ts handleCommands: literal Gateway input bypasses the handlers.
      handleCommands: async (p) => {
        log.push(`handleCommands:${p.command.commandBodyNormalized}`);
        if (p.ctx.CommandInterpretationSuppressed === true) return { shouldContinue: true };
        if (p.command.commandBodyNormalized.startsWith("/help")) return { shouldContinue: false, reply: { text: "help text" } };
        return { shouldContinue: true };
      },
      buildStatusReply: async () => ({ text: "status" }),
    }],
  ];
  const scope = {
    createLazyImportLoader: (fn) => ({ load: async () => modules.find(([key]) => fn.toString().includes(key))[1], clear() {} }),
    listReservedChatSlashCommandNames: () => BUILTIN,
    normalizeOptionalLowercaseString: (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined),
    collectTextContentBlocks: (c) => c.filter((b) => b.type === "text").map((b) => b.text),
    takeCommandSessionMetadataChangesFromTargets: () => undefined,
    isAbortRequestText,
    readAbortCutoffFromSessionEntry: (e) => e.abortCutoff,
    resolveAbortCutoffFromContext: (c) => ({ messageSid: c.MessageSid, timestamp: c.Timestamp }),
    shouldSkipMessageByAbortCutoff: ({ cutoffTimestamp, timestamp: t }) => t <= cutoffTimestamp,
    getChannelPlugin: () => undefined,
    getStandaloneSlashCommandName: (body) => body.trim().match(/^\/([^\s:]+)/u)?.[1]?.toLowerCase() ?? null,
    hasSkillReferenceCandidate: (body) => /\$[a-z]/u.test(body),
    resolveSkillCommandInvocation: ({ commandBodyNormalized, skillCommands }) => {
      const m = commandBodyNormalized.trim().match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/u);
      const command = m && skillCommands.find((s) => s.name === m[1]);
      return command ? { command, args: m[2] ?? "" } : null;
    },
    expandExplicitSkillReferences: ({ text: t, skillCommands }) => {
      const skills = skillCommands.filter((s) => t.includes(`$${s.name}`));
      return { skills, body: skills.reduce((b, s) => b.replace(`$${s.name} `, ""), t) };
    },
    generateSecureToken: () => "tok",
    formatErrorMessage: String,
    markCommandReplyForDelivery: (r) => ({ ...r, command: true }),
    expandBundleCommandPromptTemplate: (t, a) => `${t} ${a}`,
    markReplyPayloadForSourceSuppressionDelivery: (r) => r,
    copyReplyPayloadMetadata: (_r, n) => n,
    // Inline simple commands ("/help" inside a message) are cut out of the body and run.
    extractInlineSimpleCommand: (body) => {
      const m = body.match(/(^|\s)(\/help)(?=\s|$)/u);
      return m ? { command: "/help", cleaned: body.replace(m[2], "").replace(/\s+/gu, " ").trim() } : null;
    },
    isDirectiveOnly: () => false,
    getAbortMemory: () => undefined,
    stripStructuralPrefixes: (t) => t,
    stripMentions: (t) => t,
    logVerbose: (m) => log.push(`logVerbose:${m}`),
    extractExplicitGroupId: () => undefined,
  };
  const fn = compile(`${helpers(source, G_HELPERS_END)}${region(source, INLINE_REGION)}`, "handleInlineActions", scope);
  const command = { isAuthorizedSender: true, senderIsOwner: true, senderId: "ou_owner", channelId: "feishu", rawBodyNormalized: text, commandBodyNormalized: text };
  const params = {
    ctx, sessionCtx, cfg: { agents: {} }, agentId: "makaron", agentDir: "/agents/makaron", sessionEntry: entry, sessionStore: { [SESSION_KEY]: entry },
    sessionKey: SESSION_KEY, storePath: "/store", sessionScope: "per-sender", workspaceDir: "/work", isGroup: false, opts, typing: { cleanup: () => log.push("typing.cleanup") },
    allowTextCommands: true, inlineStatusRequested: false, command, directives: { cleaned: text }, cleanedBody: text, elevatedEnabled: false, elevatedAllowed: false,
    defaultActivation: () => "always", provider: "deepseek", model: "deepseek-v4-flash", contextTokens: 1000, directiveAck: undefined, abortedLastRun: false,
    skillFilter: undefined, skillToolDispatchDependencies: {},
  };
  return { log, run: () => fn(params) };
}

const inlineProject = (r) => (r.kind === "reply" ? { kind: "reply", reply: r.reply } : { kind: r.kind, cleanedBody: r.cleanedBody, explicitSkillSelections: r.explicitSkillSelections });
const INTERPRETATION = ["listSkillCommands", "skillTool.execute", "handleCommands", "blockReply"];

test("get-reply inline actions: a person's skill commands, skill references and inline commands are unchanged", async () => {
  const expected = {
    "/makaron draw a cat": { kind: "reply", reply: { text: "drew a cat", command: true } },
    "draw it with $makaron please": { kind: "continue", cleanedBody: "draw it with please", explicitSkillSelections: [{ name: "makaron", path: "/skills/makaron/SKILL.md" }] },
    "please /help me": { kind: "continue", cleanedBody: "please me", explicitSkillSelections: undefined },
    "/help": { kind: "reply", reply: { text: "help text", command: true } },
    "hello": { kind: "continue", cleanedBody: "hello", explicitSkillSelections: undefined },
  };
  for (const [text, result] of Object.entries(expected)) {
    const before = inlineHarness(SOURCES.V.G, { text });
    const after = inlineHarness(SOURCES.GEN.G, { text });
    const [a, b] = [await before.run(), await after.run()];
    assert.deepEqual(inlineProject(a), result, `V: ${text}`);
    assert.deepEqual(inlineProject(b), inlineProject(a), text);
    assert.deepEqual(after.log, before.log, `${text}: same side effects`);
  }
});

test("get-reply inline actions: literal text runs no skill tool, selects no skill and is not cut or handled as a command", async () => {
  for (const text of ["/makaron draw a cat", "draw it with $makaron please", "please /help me", "/help"]) {
    for (const literal of Object.keys(LITERAL)) {
      const after = inlineHarness(SOURCES.GEN.G, { text, literal });
      assert.deepEqual(inlineProject(await after.run()), { kind: "continue", cleanedBody: text, explicitSkillSelections: undefined }, `${literal}: ${text}`);
      assert.ok(!after.log.some((e) => INTERPRETATION.some((i) => e.startsWith(i))), `${literal}: ${text}: ${after.log.join(", ")}`);
    }
  }
  // What V did with the same literal text (the bridge sends the suppression flag, and V still ran these):
  const tool = inlineHarness(SOURCES.V.G, { text: "/makaron draw a cat", literal: "bridge" });
  assert.deepEqual(inlineProject(await tool.run()), { kind: "reply", reply: { text: "drew a cat", command: true } });
  assert.ok(tool.log.includes("skillTool.execute"), "V ran the skill's tool before admission");
  const reference = inlineHarness(SOURCES.V.G, { text: "draw it with $makaron please", literal: "bridge" });
  assert.deepEqual((await reference.run()).explicitSkillSelections, [{ name: "makaron", path: "/skills/makaron/SKILL.md" }]);
  const inline = inlineHarness(SOURCES.V.G, { text: "please /help me", literal: "bridge" });
  assert.equal((await inline.run()).cleanedBody, "please me", "V cut the inline command out of the request");
  const handled = inlineHarness(SOURCES.V.G, { text: "/help", literal: "ctxVInterSessionOnly" });
  assert.deepEqual(inlineProject(await handled.run()), { kind: "reply", reply: { text: "help text", command: true } }, "V answered a vInterSession turn without the flag as a command");
});

test("get-reply inline actions: an abort word in literal text gets the abort-cutoff bookkeeping of any message", async () => {
  const entry = () => ({ sessionId: "s1", abortCutoff: { messageSid: "m1", timestamp: 100 } });
  // A person's abort word is exempt (it is the abort); a plain message clears the cutoff.
  for (const source of [SOURCES.V.G, SOURCES.GEN.G]) {
    const word = inlineHarness(source, { text: "停止", entry: entry() });
    await word.run();
    assert.ok(!word.log.includes("clearAbortCutoff"));
    const plain = inlineHarness(source, { text: "hello", entry: entry() });
    await plain.run();
    assert.ok(plain.log.includes("clearAbortCutoff"));
  }
  for (const literal of Object.keys(LITERAL)) {
    const before = inlineHarness(SOURCES.V.G, { text: "停止", entry: entry(), literal });
    await before.run();
    assert.ok(!before.log.includes("clearAbortCutoff"), `V treated literal "停止" as the abort (${literal})`);
    const after = inlineHarness(SOURCES.GEN.G, { text: "停止", entry: entry(), literal });
    assert.deepEqual(inlineProject(await after.run()), { kind: "continue", cleanedBody: "停止", explicitSkillSelections: undefined });
    assert.ok(after.log.includes("clearAbortCutoff"), literal);
    // A literal message older than the cutoff is skipped like any other message.
    const stale = inlineHarness(SOURCES.GEN.G, { text: "停止", entry: entry(), literal, timestamp: 50 });
    assert.deepEqual(await stale.run(), { kind: "reply", reply: undefined });
  }
});

// ================================================================== the gates stay where they are

test("every literal-text gate is in the generated files and reads the same predicate", () => {
  const G = SOURCES.GEN.G;
  const D = SOURCES.GEN.D;
  for (const source of [G, D]) {
    assert.match(source, /return ctx\?\.CommandInterpretationSuppressed === true \|\| ctx\?\.VInterSession != null \|\| (opts|replyOptions)\?\.vInterSession != null;/u);
  }
  // No CommandInterpretationSuppressed check of its own is left in get-reply: all go through the predicate.
  assert.equal(count(G, "CommandInterpretationSuppressed"), 1);
  assert.equal(count(SOURCES.V.G, "ctx.CommandInterpretationSuppressed !== true"), 2);
  assert.equal(count(D, "CommandInterpretationSuppressed"), 1);
  // The dispatch BUSY uses the contract's reason and the exclusive flag, like the get-reply guard.
  assert.ok(D.includes(`vInter.onBusy?.({ reason: "${contracts.BUSY_REASONS[0]}" });`));
  assert.ok(D.includes("if (vInter?.exclusive !== true) return;"));
  assert.ok(D.includes("const vInter = replyOptions?.vInterSession ?? ctx?.VInterSession;"), "opts first, then ctx (A1), as in get-reply");
});
