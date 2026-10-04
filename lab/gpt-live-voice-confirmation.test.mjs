import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveClientVoiceConfirmationAuthorizer } from "./gpt-live-voice-confirmation.mjs";
import { patchGptLiveClientVoiceConfirmation } from "./patch-gpt-live-voice-confirmation.mjs";

const fixtureDir = new URL("./fixtures/gpt-live-voice-confirmation/", import.meta.url);
const captured = readFileSync(new URL("agent-tools.before-tool-call-g2OT63u5.js", fixtureDir), "utf8");
const mutationSource = readFileSync(new URL("tool-mutation-7Z6dWuA8.js", fixtureDir), "utf8");
assert.equal(createHash("sha256").update(captured).digest("hex"), "e61b81d47b1dfb30ae42c6ee49607e5a2ba8935d8ad2389b8eec11f950079bfc");
assert.equal(createHash("sha256").update(mutationSource).digest("hex"), "352e34e9df0cf1eafeb4d2dbed1f6b7aa91a62b21063b3be80cca195fbb1465e");
const patched = patchGptLiveClientVoiceConfirmation(captured);
const mutation = new Function("deps", `with(deps) { ${mutationSource.replace(/^import .*;$/gm, "").replace(/^export .*;$/gm, "")}; return {buildToolMutationState}; }`)({
  asOptionalObjectRecord: value => value && typeof value === "object" && !Array.isArray(value) ? value : undefined,
  normalizeOptionalLowercaseString: value => typeof value === "string" ? value.trim().toLowerCase() || undefined : undefined,
  normalizeLowercaseStringOrEmpty: value => typeof value === "string" ? value.trim().toLowerCase() : "",
  isAutomationsToolName: name => name === "automations", isComputerObservationAction: action => action === "observe",
});
const slice = (source, from, until) => {
  const start = source.indexOf(from), end = source.indexOf(until, start);
  assert(start >= 0 && end > start, `actual source boundary ${from}`);
  return source.slice(start, end);
};
const commandArgs = { command: "sleep 60 && date '+%Y-%m-%d %H:%M:%S %Z'", background: true, yieldMs: 1000 };
const hash = text => createHash("sha256").update(text).digest("hex");
const confirmationEvents = f => f.traceLines.map(line => {
  assert.match(line, /^GPT_LIVE_VOICE_CONFIRMATION \{.*\}\n$/);
  return JSON.parse(line.slice("GPT_LIVE_VOICE_CONFIRMATION ".length));
});

function fixture(t, { traceEnabled = false, traceFailure = false } = {}) {
  let clock = 1000, entrySequence = 0, appendFailure, appendBarrier;
  const scope = { agentId: "actor", voiceSessionId: "voice", sessionKey: "agent:actor:canonical" };
  const records = new Map();
  const key = (agentId, voiceSessionId) => `${agentId}\0${voiceSessionId}`;
  const record = { ...scope, status: "open", origin: "client", transcriptCapable: true, transcriptFailureKeys: [], consultRunIds: [] };
  records.set(key(scope.agentId, scope.voiceSessionId), record);
  const durableEntries = [];
  const traceLines = [];
  // Run the captured policy and transcript append. Only SQLite, its queue and
  // durable transcript I/O are boundaries; grant creation/consumption is core.
  const body = slice(patched, "//#region src/talk/client-voice-confirmation.ts", "//#endregion") +
    slice(captured, "function assertVoiceSessionOwnership(record, params)", "//#endregion") +
    slice(captured, "function buildPersistedVoiceMessage(params)", "const mutationDigestDeliveryOwner =");
  const core = new Function("deps", `with(deps) { ${body}; return {
    checkClientVoiceToolConfirmationPolicy, consumeClientVoiceToolConfirmationPolicy,
    authorizeClientVoiceConfirmation, bindAuthorizedClientVoiceConfirmation,
    authorizeGptLiveClientVoicePendingConfirmation, isExplicitAffirmation,
    appendClientVoiceTranscript, resetClientVoiceConfirmationStateForTest,
    snapshotClientVoiceConfirmationStateForTest
  }; }`)({
    createHash, randomUUID, buildToolMutationState: mutation.buildToolMutationState,
    process: { env: traceEnabled ? { OPENCLAW_GPT_LIVE_PROGRESS_TRACE: "1" } : {},
      stderr: { write(line) { if (traceFailure) throw new Error("metadata trace failed"); traceLines.push(line); } } },
    Date: { now: () => clock },
    readVoiceSessionRecord: (agentId, voiceSessionId) => records.get(key(agentId, voiceSessionId)),
    normalizeVoiceTranscriptText: text => text.trim().slice(0, 8000),
    runVoiceSessionOperation: (_agent, _voice, fn) => fn(),
    loadSessionEntryReadOnly: () => ({ sessionId: "canonical-session-id" }),
    runOpenClawAgentWriteTransaction: (fn, { agentId }) => fn({ agentId }),
    readVoiceSessionRecordInTransaction: (database, voiceSessionId) => records.get(key(database.agentId, voiceSessionId)),
    writeVoiceSessionRecordInTransaction: (database, next) => records.set(key(database.agentId, next.voiceSessionId), next),
    appendTranscriptMessage: async (target, value) => {
      if (appendBarrier) await appendBarrier;
      if (appendFailure) throw appendFailure;
      durableEntries.push({ target, ...value });
    },
  });
  t.after(() => core.resetClientVoiceConfirmationStateForTest());
  return { core, scope, record, durableEntries, traceLines,
    advance: ms => { clock += ms; },
    acceptedAt: () => clock,
    blockAppend: promise => { appendBarrier = promise; },
    failAppend: error => { appendFailure = error; },
    challenge: (args = commandArgs, runId = "old-run") => core.checkClientVoiceToolConfirmationPolicy({ ...scope, runId, toolName: "exec", toolParams: args, isConfirmable: () => true }),
    grant: params => core.authorizeGptLiveClientVoicePendingConfirmation({ ...scope, callerInputAcceptedAt: clock, ...params }),
    append: (text, role = "user", extra = {}) => core.appendClientVoiceTranscript({ ...scope, role, text, entryId: `entry-${++entrySequence}`,
      sessionTarget: { sessionKey: scope.sessionKey }, ...extra }),
    consume: (args = commandArgs, runId = "new-run") => core.consumeClientVoiceToolConfirmationPolicy({ ...scope, runId, toolName: "exec", toolParams: args }),
  };
}

test("actual core patch has unique strict anchors and is idempotent; classifier bytes remain separate and unchanged", () => {
  assert.equal(patchGptLiveClientVoiceConfirmation(patched), patched);
  assert.throws(() => patchGptLiveClientVoiceConfirmation("drifted"), /anchor drifted/);
  const anchor = 'const REFUSAL_PATTERN = /\\b(no|don\'t|do not|cancel|stop|never mind)\\b/;';
  assert.throws(() => patchGptLiveClientVoiceConfirmation(captured.replace(anchor, "// drift")), /anchor drifted/);
  assert.throws(() => patchGptLiveClientVoiceConfirmation(`${captured}\n${anchor}`), /anchor drifted/);
  const traceAnchor = "const CONFIRMATION_TTL_MS = 12e4;";
  assert.throws(() => patchGptLiveClientVoiceConfirmation(captured.replace(traceAnchor, "// drift")), /anchor drifted/);
  assert.throws(() => patchGptLiveClientVoiceConfirmation(`${captured}\n${traceAnchor}`), /anchor drifted/);
  assert.match(patched, /export \{ authorizeGptLiveClientVoicePendingConfirmation \}/);
});

test("actual classifier keeps simple read-only commands and conservatively rejects pipelines, sleep/date and shell expansion", () => {
  for (const command of ["pwd", "grep -n 'interrupt' /tmp/page.log", "head -200 /tmp/page.log", "sed -n '1,200p' /tmp/page.log"]) {
    assert.equal(mutation.buildToolMutationState("exec", { command }).mutatingAction, false, command);
  }
  for (const command of ["grep -n 'interrupt' /tmp/page.log | head -200", commandArgs.command, "sleep 60", "date '+%Y-%m-%d'", "rg --pre 'anything' /tmp/page.log", "cat /tmp/a > /tmp/b"]) {
    assert.equal(mutation.buildToolMutationState("exec", { command }).mutatingAction, true, command);
  }
});

test("only a completed durable USER append after the actual challenge can mint the existing core grant", async t => {
  const f = fixture(t);
  assert.equal(f.challenge().allowed, false);
  assert.equal(f.grant({ prompt: "确认执行", confirmationId: "model-supplied", runId: "new-run" }), undefined);
  f.advance(1);
  let release;
  f.blockAppend(new Promise(resolve => { release = resolve; }));
  const pending = f.append("确认执行");
  await Promise.resolve();
  assert.equal(f.grant(), undefined);
  assert.equal(f.durableEntries.length, 0);
  release(); await pending;
  const grant = f.grant();
  assert.equal(grant.agentId, f.scope.agentId);
  assert.equal(grant.voiceSessionId, f.scope.voiceSessionId);
  assert.equal(typeof grant.confirmationId, "string");
  assert.equal(typeof grant.fingerprint, "string");
  assert.equal(f.durableEntries.length, 1);
  assert.equal(f.core.snapshotClientVoiceConfirmationStateForTest().pendingChallenges, 1, "authorization does not consume the pending challenge");
});

test("failed durable append, assistant speech and affirmation before the challenge cannot authorize", async t => {
  const before = fixture(t); await before.append("确认执行"); before.advance(1); before.challenge();
  assert.equal(before.grant(), undefined);
  const assistant = fixture(t); assistant.challenge(); assistant.advance(1); await assistant.append("确认执行", "assistant");
  assert.equal(assistant.grant(), undefined);
  const failed = fixture(t); failed.challenge(); failed.advance(1); failed.failAppend(new Error("actual durable append failure"));
  await assert.rejects(failed.append("确认执行"), /durable append failure/);
  assert.equal(failed.grant(), undefined);
});

test("server observed USER receipt time controls confirmation, not a supplied future transcript timestamp", async t => {
  const f = fixture(t); f.challenge();
  await f.append("确认执行", "user", { timestamp: 999999 });
  assert.equal(f.grant(), undefined, "observedAt equals challenge creation even though supplied message timestamp is later");
  f.advance(1); await f.append("确认执行");
  assert(f.grant());
});

test("actual core rejects an old queued delegation accepted before the later challenge and USER affirmation", async t => {
  const f = fixture(t), queuedAcceptedAt = f.acceptedAt();
  f.advance(1); assert.equal(f.challenge().allowed, false);
  f.advance(1); await f.append("确认执行");
  assert.equal(f.grant({ callerInputAcceptedAt: queuedAcceptedAt }), undefined,
    "even an identical canonical action cannot borrow a confirmation issued after delegation acceptance");
  assert.equal(f.core.snapshotClientVoiceConfirmationStateForTest().pendingChallenges, 1);
  const grant = f.grant();
  assert(grant, "the delegation accepted after the real affirmation can still obtain the core grant");
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "confirmed-run", now: f.acceptedAt() }), true);
  assert.equal(f.consume(commandArgs, "queued-run").allowed, false);
  assert.equal(f.consume(commandArgs, "confirmed-run").allowed, true);
});

test("actual core rejects a queued delegation accepted after challenge but before the finalized USER affirmation", async t => {
  const f = fixture(t); assert.equal(f.challenge().allowed, false);
  f.advance(1); const queuedAcceptedAt = f.acceptedAt();
  f.advance(1); await f.append("确认执行");
  assert.equal(f.grant({ callerInputAcceptedAt: queuedAcceptedAt }), undefined);
  assert.equal(f.core.snapshotClientVoiceConfirmationStateForTest().pendingChallenges, 1,
    "rejecting the old queue entry does not steal or consume the pending challenge");
  const confirmedAcceptedAt = f.acceptedAt();
  f.advance(1);
  const grant = f.grant({ callerInputAcceptedAt: confirmedAcceptedAt });
  assert(grant);
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "confirmed-run", now: f.acceptedAt() }), true);
  assert.equal(f.consume(commandArgs, "queued-run").allowed, false);
  assert.equal(f.consume(commandArgs, "confirmed-run").allowed, true);
});

test("missing, malformed, future or clock-regressed acceptance checkpoint cannot authorize", async t => {
  const f = fixture(t); f.challenge(); f.advance(1); await f.append("确认执行");
  for (const callerInputAcceptedAt of [undefined, null, "1001", NaN, Infinity, -Infinity, 1002]) {
    assert.equal(f.grant({ callerInputAcceptedAt }), undefined, String(callerInputAcceptedAt));
  }
  const acceptedAt = f.acceptedAt();
  assert(f.grant({ callerInputAcceptedAt: acceptedAt }));
  f.advance(-1);
  assert.equal(f.grant({ callerInputAcceptedAt: acceptedAt }), undefined,
    "a receipt or acceptance later than the current server clock fails closed");
  f.advance(1);
  assert(f.grant({ callerInputAcceptedAt: acceptedAt }), "rejected checkpoints did not consume the real challenge");
});

test("finite independent Chinese and existing English affirmations work; short acknowledgements and quoted/compound intents do not", t => {
  const f = fixture(t);
  for (const text of ["确认", "确认执行。", "同意", "同意执行", "允许执行", "请执行", "执行吧！", "继续执行", "yes", "confirm", "go ahead"]) {
    assert.equal(f.core.isExplicitAffirmation(text), true, text);
  }
  for (const text of ["好的", "知道了", "继续", "可以", "用户说确认", "‘确认’", "确认，但不要执行", "不，确认执行", "yes but do not send", "稍后再执行"]) {
    assert.equal(f.core.isExplicitAffirmation(text), false, text);
  }
});

test("a later unrelated USER acknowledgement replaces the latest affirmation; ordinary new topic returns undefined", async t => {
  const f = fixture(t); f.challenge(); f.advance(1); await f.append("确认执行"); assert(f.grant());
  f.advance(1); await f.append("知道了，我们先讨论其他事情");
  assert.equal(f.grant(), undefined);
});

test("explicit Chinese refusal clears the original pending challenge and a later approval cannot revive it", async t => {
  for (const text of ["不，确认执行", "不要执行", "不同意", "取消", "停止", "别执行"]) {
    const f = fixture(t); f.challenge(); f.advance(1); await f.append(text);
    assert.equal(f.core.snapshotClientVoiceConfirmationStateForTest().pendingChallenges, 0, text);
    f.advance(1); await f.append("确认执行"); assert.equal(f.grant(), undefined, text);
  }
});

test("host exact agent, voice session, canonical session and open record are required", async t => {
  const f = fixture(t); f.challenge(); f.advance(1); await f.append("确认执行");
  for (const mismatch of [{ agentId: "other" }, { voiceSessionId: "other-call" }, { sessionKey: "agent:actor:other" }]) assert.equal(f.grant(mismatch), undefined);
  f.record.status = "closed"; assert.equal(f.grant(), undefined);
  f.record.status = "open"; assert(f.grant());
});

test("expired or superseded challenges cannot bind a detached old grant", async t => {
  const expired = fixture(t); expired.challenge(); expired.advance(1); await expired.append("确认执行"); const stale = expired.grant();
  expired.advance(120001); assert.equal(expired.grant(), undefined);
  assert.equal(expired.core.bindAuthorizedClientVoiceConfirmation({ grant: stale, runId: "new-run", now: 121002 }), false);
  const f = fixture(t); f.challenge(); f.advance(1); await f.append("确认执行"); const old = f.grant();
  f.challenge({ ...commandArgs, command: "sleep 61" });
  assert.equal(f.grant(), undefined);
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant: old, runId: "new-run", now: 1001 }), false);
  f.advance(1); await f.append("确认执行");
  assert.notEqual(f.grant().confirmationId, old.confirmationId);
});

test("grant binds a new canonical run, checks exact canonical params and is consumed once by actual core final policy", async t => {
  const f = fixture(t); f.challenge(); f.advance(1); await f.append("确认执行"); const grant = f.grant();
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "new-run", now: 1001 }), true);
  assert.equal(f.grant(), undefined, "binding consumed the pending challenge");
  assert.equal(f.challenge(commandArgs, "new-run").allowed, true, "nonconsuming precheck");
  assert.equal(f.consume(commandArgs, "old-run").allowed, false, "old run has no grant");
  assert.equal(f.consume(commandArgs).allowed, true);
  assert.equal(f.consume(commandArgs).allowed, false, "one shot consumed");
  const changed = fixture(t); changed.challenge(); changed.advance(1); await changed.append("确认执行");
  changed.core.bindAuthorizedClientVoiceConfirmation({ grant: changed.grant(), runId: "new-run", now: 1001 });
  assert.equal(changed.consume({ ...commandArgs, command: "sleep 61" }).allowed, false);
  assert.equal(changed.consume({ ...commandArgs, yieldMs: 2000 }).allowed, false);
});

test("unknown core state and nonconfirmable legacy record return undefined without inventing authority", () => {
  const base = { readVoiceSessionRecord: () => ({ agentId: "a", voiceSessionId: "v", sessionKey: "s", status: "open", origin: "client", transcriptCapable: true }),
    now: () => 1000, confirmationScopeKey: () => "scope", getPrunedConfirmationScope: () => undefined,
    isExplicitAffirmation() { throw new Error("unknown state must not be read as an utterance"); },
    authorizeClientVoiceConfirmation() { throw new Error("must not invent a grant"); } };
  const params = { agentId: "a", voiceSessionId: "v", sessionKey: "s", callerInputAcceptedAt: 1000 };
  assert.equal(createGptLiveClientVoiceConfirmationAuthorizer(base)(params), undefined);
  assert.equal(createGptLiveClientVoiceConfirmationAuthorizer({ ...base, getPrunedConfirmationScope: () => ({ pending: {}, recentUtterance: {} }) })(params), undefined);
  assert.equal(createGptLiveClientVoiceConfirmationAuthorizer({ ...base, readVoiceSessionRecord: () => ({ ...params, status: "open", origin: "client" }) })(params), undefined);
});

test("opt-in metadata joins actual eligible, successful bind and one-shot final consume without exposing USER or params", async t => {
  const f = fixture(t, { traceEnabled: true });
  assert.equal(f.challenge().allowed, false);
  assert.deepEqual(confirmationEvents(f), [], "a blocked challenge is not confirmation eligibility");
  f.advance(1); await f.append("确认执行");
  const grant = f.grant(), scopeSha256 = hash(`${f.scope.agentId}\0${f.scope.voiceSessionId}`);
  const eligible = confirmationEvents(f);
  assert.deepEqual(eligible, [{ stage: "eligible", at: 1001, scopeSha256,
    fingerprint: grant.fingerprint, confirmationId: grant.confirmationId,
    pendingCreatedAt: 1000, durableUserObservedAt: 1001, userTextSha256: hash("确认执行"),
    callerInputAcceptedAt: 1001 }]);
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "actual-new-run", now: 1001 }), true);
  assert.equal(f.challenge(commandArgs, "actual-new-run").allowed, true);
  assert.deepEqual(confirmationEvents(f).map(event => event.stage), ["eligible", "bind"], "nonconsuming precheck is not consume evidence");
  f.advance(1); assert.equal(f.consume(commandArgs, "actual-new-run").allowed, true);
  const events = confirmationEvents(f);
  assert.deepEqual(events[1], { stage: "bind", at: 1001, scopeSha256, fingerprint: grant.fingerprint,
    runId: "actual-new-run", runIdSha256: hash("actual-new-run"), confirmationId: grant.confirmationId });
  assert.deepEqual(events[2], { stage: "consume", at: 1002, scopeSha256, fingerprint: grant.fingerprint,
    runId: "actual-new-run", runIdSha256: hash("actual-new-run") });
  assert.equal(f.consume(commandArgs, "actual-new-run").allowed, false);
  assert.equal(confirmationEvents(f).length, 3, "a second blocked consume is not reported as success");
  const serialized = f.traceLines.join("");
  for (const privateText of ["确认执行", commandArgs.command, f.scope.agentId, f.scope.voiceSessionId, f.scope.sessionKey]) {
    assert.equal(serialized.includes(privateText), false, "raw USER, canonical command and scope identities remain out of trace");
  }
});

test("rejected checkpoint, wrong scope and superseded core bind never emit false confirmation success", async t => {
  const f = fixture(t, { traceEnabled: true }); f.challenge(); f.advance(1); await f.append("确认执行");
  for (const params of [{ callerInputAcceptedAt: undefined }, { callerInputAcceptedAt: 1000 },
    { callerInputAcceptedAt: 1002 }, { agentId: "other" }, { voiceSessionId: "other" }, { sessionKey: "neighbor" }]) {
    assert.equal(f.grant(params), undefined);
  }
  assert.deepEqual(confirmationEvents(f), []);
  const grant = f.grant();
  assert.equal(confirmationEvents(f).length, 1);
  f.challenge({ ...commandArgs, command: "sleep 61" });
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "new-run", now: 1001 }), false);
  assert.equal(f.consume(commandArgs, "new-run").allowed, false);
  assert.deepEqual(confirmationEvents(f).map(event => event.stage), ["eligible"]);
});

test("expired grant removal and cross-scope execution are not successful consumption evidence", async t => {
  const f = fixture(t, { traceEnabled: true }); f.challenge(); f.advance(1); await f.append("确认执行");
  const grant = f.grant();
  assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "new-run", now: 1001 }), true);
  assert.equal(f.core.consumeClientVoiceToolConfirmationPolicy({ ...f.scope, voiceSessionId: "neighbor-call", runId: "new-run", toolName: "exec", toolParams: commandArgs }).allowed, false);
  f.advance(120001);
  assert.equal(f.consume(commandArgs, "new-run").allowed, false);
  assert.deepEqual(confirmationEvents(f).map(event => event.stage), ["eligible", "bind"]);
});

test("confirmation trace is default off and logger exceptions cannot change real core authorization or consumption", async t => {
  for (const options of [{}, { traceEnabled: true, traceFailure: true }]) {
    const f = fixture(t, options); f.challenge(); f.advance(1); await f.append("确认执行");
    const grant = f.grant(); assert(grant);
    assert.equal(f.core.bindAuthorizedClientVoiceConfirmation({ grant, runId: "new-run", now: 1001 }), true);
    assert.equal(f.consume(commandArgs, "new-run").allowed, true);
    assert.equal(f.consume(commandArgs, "new-run").allowed, false);
    assert.deepEqual(f.traceLines, []);
  }
});
