import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import * as contracts from "../apps/v-session-relay/plugin/core/contracts.js";
import {
  CAPTURE_DIR,
  FILES,
  GUIDANCE,
  HANDOFF_ANCHOR,
  HANDOFF_BEGIN,
  HELPERS_END,
  MARKER,
  NEW_IDENTIFIERS,
  REPLY_ONCE_MARKER,
  SCHEMA_FIELDS,
  TOOLS_MARKER,
  patchOpenclawTools,
  patchSessionsSendRelay,
} from "../lab/release-files/sessions-send-relay/patch.mjs";
import { patchSessionsSendReplyOnce } from "../lab/release-files/sessions-send-reply-once/patch.mjs";

// The bytes V runs (captured 2026-10-20, re-verified on V 2026-10-20 17:25); the patch is generated
// from these, never from an upstream copy (release-artifact-rebase-trap).
const capture = (file) => new URL(`../${CAPTURE_DIR}/${file}`, import.meta.url);
const generated = (file) => new URL(`../lab/release-files/sessions-send-relay/generated/${file}`, import.meta.url);
const V_TOOL = fs.readFileSync(capture(FILES.sessionsSpawnTool), "utf8");
const V_TOOLS = fs.readFileSync(capture(FILES.openclawTools), "utf8");
const GEN_TOOL = fs.readFileSync(generated(FILES.sessionsSpawnTool), "utf8");
const GEN_TOOLS = fs.readFileSync(generated(FILES.openclawTools), "utf8");
const V_BYTES = JSON.parse(fs.readFileSync(new URL("./fixtures/inter-session-v-bytes.json", import.meta.url), "utf8"));
const DESIGN = fs.readFileSync(new URL("../docs/inter-session/design.md", import.meta.url), "utf8");

const count = (source, needle) => source.split(needle).length - 1;
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function between(source, start, end, { includeEnd = false } = {}) {
  const at = source.indexOf(start);
  assert.ok(at >= 0, `missing ${JSON.stringify(start)}`);
  const stop = source.indexOf(end, at + start.length);
  assert.ok(stop >= 0, `missing ${JSON.stringify(end)} after ${JSON.stringify(start)}`);
  return source.slice(at, includeEnd ? stop + end.length : stop);
}

// ---------------------------------------------------------------- bytes and anchors

test("the inputs are the bytes V runs", () => {
  for (const [file, text] of [[FILES.sessionsSpawnTool, V_TOOL], [FILES.openclawTools, V_TOOLS]]) {
    const entry = V_BYTES.files.find((f) => f.file === file);
    assert.ok(entry, `${file} is in tests/fixtures/inter-session-v-bytes.json`);
    assert.equal(sha256(text), entry.sha256, `${file} equals V's bytes`);
    assert.deepEqual(entry.workPackages, ["WP2"]);
  }
  assert.ok(!V_TOOL.includes(REPLY_ONCE_MARKER), "V does not run v2 yet; v3 stacks v2 itself");
  for (const marker of ["v-sessions-send-owner-v1", "v-worker-sessions-spawn-external-task-bridge-v0", "v-worker-sessions-spawn-external-task-record-v0"]) {
    assert.equal(count(V_TOOL, marker), 1, `V marker ${marker} present in the input`);
    assert.equal(count(GEN_TOOL, marker), 1, `V marker ${marker} kept`);
  }
  for (const marker of ["v-openclaw91-secret-entry-v1", "v-vds-view-image-v1", "v-worker-sessions-yield-external-task-bridge-v0", "v-worker-skill-workshop-subprocess-v0"]) {
    assert.equal(count(GEN_TOOLS, marker), count(V_TOOLS, marker), `V marker ${marker} kept in openclaw-tools`);
  }
});

test("the committed files are exactly the patch of the bytes V runs", () => {
  assert.equal(patchSessionsSendRelay(V_TOOL), GEN_TOOL);
  assert.equal(patchOpenclawTools(V_TOOLS), GEN_TOOLS);
  execFileSync(process.execPath, ["--check", generated(FILES.sessionsSpawnTool).pathname]);
  execFileSync(process.execPath, ["--check", generated(FILES.openclawTools).pathname]);
});

test("markers: v3 once, v2 kept, tools marker once", () => {
  assert.equal(count(GEN_TOOL, MARKER), 1);
  assert.equal(count(GEN_TOOL, REPLY_ONCE_MARKER), 1, "v2 stays as the fallback");
  assert.equal(count(GEN_TOOLS, TOOLS_MARKER), 1);
  assert.equal(MARKER, contracts.MARKERS.sessionsSendRelay);
  assert.equal(TOOLS_MARKER, contracts.MARKERS.sessionsSendRelayTools);
});

test("every anchor occurs exactly once in the input it patches", () => {
  const v2 = patchSessionsSendReplyOnce(V_TOOL);
  for (const anchor of [
    "function createSessionsSendTool(opts) {\n",
    "\t\tdescription: describeSessionsSendTool(),\n",
    "const SessionsSendOutputSchema = Type.Union([\n",
    "]);\nconst SESSIONS_SEND_REPLY_HISTORY_LIMIT = 50;\n",
    HANDOFF_ANCHOR,
  ]) assert.equal(count(v2, anchor), 1, JSON.stringify(anchor));
  for (const [statusLine] of SCHEMA_FIELDS) assert.equal(count(v2, statusLine), 1, statusLine);
  for (const name of NEW_IDENTIFIERS) assert.doesNotMatch(V_TOOL, new RegExp(`\\b${name}\\b`, "u"), `${name} is new`);
  assert.equal(count(V_TOOLS, "\t\t\tcreateSessionsSendTool({\n"), 1);
});

test("patching twice, a changed file or a file without v2 is refused", () => {
  assert.throws(() => patchSessionsSendRelay(GEN_TOOL), /already patched/u);
  assert.throws(() => patchOpenclawTools(GEN_TOOLS), /already patched/u);
  assert.throws(() => patchSessionsSendRelay("async function other() {}"), /expected exactly one anchor/u);
  assert.throws(() => patchOpenclawTools("const x = 1;"), /expected exactly one anchor/u);
  const v2 = patchSessionsSendReplyOnce(V_TOOL);
  assert.throws(() => patchSessionsSendRelay(v2), /already patched/u, "v2 bytes cannot take v2 again");
  const renamed = V_TOOL.replace('const NO_REPLY_MESSAGE = "', 'const NO_REPLY_TEXT = "');
  assert.throws(() => patchSessionsSendRelay(renamed), /module scope changed/u);
});

// ---------------------------------------------------------------- placement and static shape

test("the hand-off sits after the native checks and before the baseline history read", () => {
  const execute = between(GEN_TOOL, "\t\texecute: async (_toolCallId, args) => {\n", "//#endregion\n//#region src/agents/subagents/spawn/subagent-attachments.ts");
  const at = (needle) => {
    const i = execute.indexOf(needle);
    assert.ok(i >= 0, `missing ${needle}`);
    return i;
  };
  const handoff = at(HANDOFF_BEGIN);
  assert.equal(count(execute, HANDOFF_BEGIN), 1);
  assert.ok(at("const access = await resolveSessionToolAccess({") < handoff, "after the allow / visibility check");
  assert.ok(at("if (!access.allowed) return jsonResult({") < handoff);
  assert.ok(at("if (visibleSession.missing) {") < handoff, "after a missing configured-agent main is created");
  assert.ok(at("const registerWatchIfRequested = (targetSessionKey) => {") < handoff);
  assert.ok(handoff < at("const baselineReply = timeoutSeconds !== 0 ? await readLatestAssistantReplySnapshot({"), "before the baseline history read");
  assert.ok(handoff < at("const start = await startAgentRun({"), "before v2 starts the target turn");
  assert.ok(handoff < at(HANDOFF_ANCHOR));
  const helpersAt = GEN_TOOL.indexOf("// v-sessions-send-relay-v3\n");
  assert.ok(helpersAt > GEN_TOOL.indexOf('const log = createSubsystemLogger("agents/sessions-send");'), "helpers come after the logger they use");
  assert.ok(helpersAt < GEN_TOOL.indexOf("function createSessionsSendTool(opts) {\n"));
  assert.ok(GEN_TOOL.indexOf(HELPERS_END) < GEN_TOOL.indexOf("function createSessionsSendTool(opts) {\n"));
});

test("the tool description carries the §8.2 guidance", () => {
  assert.equal(count(GEN_TOOL, "description: describeSessionsSendTool() + V_SESSIONS_SEND_GUIDANCE,"), 1);
  assert.equal(count(GEN_TOOL, "description: describeSessionsSendTool(),"), 0);
  assert.ok(GUIDANCE.startsWith(" "), "the presets join with spaces");
  assert.ok(DESIGN.includes(`> ${GUIDANCE.trim()}`), "the text is design §8.2 verbatim");
  assert.ok(GEN_TOOL.includes(`const V_SESSIONS_SEND_GUIDANCE = ${JSON.stringify(GUIDANCE)};`));
});

test("openclaw-tools passes the requester turn's run, sender and route", () => {
  const call = between(GEN_TOOLS, "createSessionsSendTool({\n\t\t\t\tagentId: sessionAgentId,", "\t\t\t})", { includeEnd: true });
  const build = new Function("createSessionsSendTool", "sessionAgentId", "sessionConfig", "options", `return ${call};`);
  const opts = build((o) => o, "makaron", { cfg: 1 }, {
    agentSessionKey: "agent:makaron:feishu:direct:ou_a", agentChannel: "feishu", sandboxed: false, runId: "run-1",
    requesterSenderId: "ou_a", senderIsOwner: true, agentAccountId: "default", agentTo: "user:ou_a", agentThreadId: 7,
  });
  assert.deepEqual(opts, {
    agentId: "makaron", agentSessionKey: "agent:makaron:feishu:direct:ou_a", agentChannel: "feishu", sandboxed: false, config: { cfg: 1 },
    runId: "run-1", requesterSenderId: "ou_a", senderIsOwner: true, agentAccountId: "default", agentTo: "user:ou_a", agentThreadId: 7,
  });
  const bare = build((o) => o, "makaron", {}, { requesterSenderId: null });
  assert.equal(bare.requesterSenderId, undefined, "null sender id is passed as undefined, like the other tools");
  assert.ok(!/inputProvenance/u.test(call), "no provenance option exists on createOpenClawTools (design §3.2)");
});

// ---------------------------------------------------------------- output schema

const FakeType = {
  Object: (properties, options = {}) => ({ kind: "object", properties, additionalProperties: options.additionalProperties }),
  Union: (anyOf) => ({ kind: "union", anyOf }),
  Literal: (value) => ({ kind: "literal", value }),
  String: () => ({ kind: "string" }),
  Integer: () => ({ kind: "integer" }),
  Boolean: () => ({ kind: "boolean" }),
  Array: (items) => ({ kind: "array", items }),
  Optional: (schema) => ({ ...schema, optional: true }),
};
function loadSchema(source) {
  const text = between(source, "const SessionsSendDeliverySchema = Type.Object({", "const SESSIONS_SEND_REPLY_HISTORY_LIMIT");
  return new Function("Type", `${text}\nreturn SessionsSendOutputSchema;`)(FakeType);
}
function schemaErrors(schema, value, path = "$") {
  switch (schema.kind) {
    case "union": {
      const branches = schema.anyOf.map((s) => schemaErrors(s, value, path));
      return branches.some((e) => e.length === 0) ? [] : [`${path}: no branch matches (${branches.map((e) => e[0]).join(" | ")})`];
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path}: not an object`];
      const errors = [];
      for (const [k, s] of Object.entries(schema.properties)) {
        if (!(k in value)) { if (!s.optional) errors.push(`${path}.${k}: missing`); continue; }
        errors.push(...schemaErrors(s, value[k], `${path}.${k}`));
      }
      if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in schema.properties)) errors.push(`${path}.${k}: not allowed`);
      return errors;
    }
    case "literal": return value === schema.value ? [] : [`${path}: not ${JSON.stringify(schema.value)}`];
    case "string": return typeof value === "string" ? [] : [`${path}: not a string`];
    case "integer": return Number.isSafeInteger(value) ? [] : [`${path}: not an integer`];
    case "boolean": return typeof value === "boolean" ? [] : [`${path}: not a boolean`];
    case "array": return Array.isArray(value) ? value.flatMap((v, i) => schemaErrors(schema.items, v, `${path}[${i}]`)) : [`${path}: not an array`];
    default: throw new Error(`unknown schema kind ${schema.kind}`);
  }
}
const V3_SCHEMA = loadSchema(GEN_TOOL);
const V_SCHEMA = loadSchema(V_TOOL);
const assertSchema = (result) => assert.deepEqual(schemaErrors(V3_SCHEMA, result), [], JSON.stringify(result));

test("every output branch gains its §3.1 (3) fields and stays closed", () => {
  const branch = (status) => V3_SCHEMA.anyOf.find((b) => {
    const s = b.properties.status;
    return s.kind === "literal" ? s.value === status : s.anyOf.some((l) => l.value === status);
  });
  const fields = (status) => Object.keys(branch(status).properties);
  for (const b of V3_SCHEMA.anyOf) assert.equal(b.additionalProperties, false);
  for (const f of ["code", "requestCode"]) assert.ok(fields("error").includes(f) && branch("error").properties[f].optional);
  assert.equal(branch("forbidden"), branch("error"));
  for (const f of ["requestCode", "note", "queuePosition", "waitingBehindActiveRun"]) assert.ok(branch("accepted").properties[f].optional, f);
  assert.equal(branch("accepted").properties.queuePosition.kind, "integer");
  assert.equal(branch("accepted").properties.waitingBehindActiveRun.kind, "boolean");
  for (const f of ["requestCode", "note"]) assert.ok(branch("no_reply").properties[f].optional, f);
  for (const f of ["requestCode", "note", "media"]) assert.ok(branch("ok").properties[f].optional, f);
  assert.deepEqual(branch("ok").properties.media, { kind: "array", items: { kind: "string" }, optional: true });
  assert.deepEqual(fields("timeout"), Object.keys(V_SCHEMA.anyOf.find((b) => b.properties.status.value === "timeout").properties), "the timeout branch is unchanged");
  assert.deepEqual(between(GEN_TOOL, "const SessionsSendDeliverySchema", "const SessionsSendOutputSchema"), between(V_TOOL, "const SessionsSendDeliverySchema", "const SessionsSendOutputSchema"), "delivery schema unchanged (mode stays announce)");
  // V's schema rejects what v3 returns, so the change is needed.
  assert.notDeepEqual(schemaErrors(V_SCHEMA, { runId: "r", status: "accepted", sessionKey: "k", targetDisposition: "queued", delivery: { status: "pending", mode: "announce" }, note: "n" }), []);
});

// ---------------------------------------------------------------- the generated code, run with fakes

const LOCALS = [
  "_toolCallId", "params", "opts", "gatewayCall", "message", "timeoutSeconds", "cfg", "effectiveRequesterKey",
  "requesterAgentId", "requesterSessionKey", "replyRequesterSessionKey", "resolvedKey", "displayKey", "targetAgentId",
  "expectedSessionId", "visibleSession", "requesterChannel", "sameSessionA2A", "isIsolatedCronRequester",
  "registerWatchIfRequested", "promptedAt",
];
const FALLTHROUGH = Symbol("v2 path");
const ACCEPTED_KEY = Symbol.for(contracts.SYMBOL_KEYS.sessionsSendAccepted);
const NO_REPLY_MESSAGE = "No visible reply or pending announcement. Continue or retry if needed.";

/** Evaluates the generated helpers and hand-off exactly as committed, with the module scope faked. */
function loadRelay(env = {}) {
  const helpers = between(GEN_TOOL, `// ${MARKER}\n`, HELPERS_END, { includeEnd: true });
  const handoff = between(GEN_TOOL, HANDOFF_BEGIN, HANDOFF_ANCHOR);
  const nativeParent = between(GEN_TOOL, "function isRequesterParentOfNativeSubagentSession(params) {", "\n}\n", { includeEnd: true });
  const record = { warns: [], facts: [], participants: [], entryLoads: 0 };
  const deps = {
    crypto,
    formatErrorMessage: (err) => (err instanceof Error ? err.message : String(err)),
    log: { warn: (message, meta) => record.warns.push({ message, meta }) },
    NO_REPLY_MESSAGE,
    jsonResult: (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], details: payload }),
    normalizeOptionalString: (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    isSubagentSessionKey: (key) => typeof key === "string" && key.includes(":subagent:"),
    loadSessionEntryByKey: (key) => { record.entryLoads += 1; return env.entry?.(key); },
    readAcpSessionMeta: () => env.acpMeta,
    isRequesterParentOfBackgroundAcpSession: (entry, requester) => Boolean(env.backgroundAcpParent?.(entry, requester)),
    recordSessionToolActionFact: (fact) => record.facts.push(fact),
    recordSessionParticipantBestEffort: (p) => record.participants.push(p),
    resolveSessionStorePathCore: (_store, { agentId }) => `/state/agents/${agentId}/sessions`,
    FALLTHROUGH,
  };
  const factory = new Function(...Object.keys(deps), `${helpers}\n${nativeParent}\nreturn {
    V_RELAY, V_RELAY_FALLBACK_RE, V_SESSIONS_SEND_GUIDANCE, vRelayIdempotencyKey,
    execute: async function execute(ctx) {
      const { ${LOCALS.join(", ")} } = ctx;
${handoff}
      return FALLTHROUGH;
    }
  };`);
  return { ...factory(...Object.values(deps)), record };
}

const REQUESTER = "agent:makaron:feishu:direct:ou_tianyi";
const TARGET = "agent:makaron:feishu:group:oc_room1";
const SEND_ID = "s_mgk3x1a2f9c1a2b3c4d5";

function context(overrides = {}) {
  const calls = [];
  const watches = [];
  const replies = [...(overrides.replies ?? [])];
  const gatewayCall = async (request) => {
    calls.push(structuredClone(request));
    const next = replies.shift();
    assert.ok(next, `unexpected Gateway call ${request.method}`);
    return typeof next === "function" ? next(request) : next;
  };
  const ctx = {
    _toolCallId: "call_1",
    params: {},
    opts: { runId: "run-A", requesterSenderId: "ou_tianyi", senderIsOwner: true, agentAccountId: "default", agentTo: "user:ou_tianyi", agentThreadId: null },
    gatewayCall,
    message: "开三个房间，分别做 a/b/c",
    timeoutSeconds: 0,
    cfg: { session: {} },
    effectiveRequesterKey: REQUESTER,
    requesterAgentId: "makaron",
    requesterSessionKey: REQUESTER,
    replyRequesterSessionKey: REQUESTER,
    resolvedKey: TARGET,
    displayKey: TARGET,
    targetAgentId: "makaron",
    expectedSessionId: undefined,
    visibleSession: { ok: true, key: TARGET, displayKey: TARGET, missing: false },
    requesterChannel: "feishu",
    sameSessionA2A: false,
    isIsolatedCronRequester: false,
    registerWatchIfRequested: (key) => { watches.push(key); return {}; },
    promptedAt: 1,
    ...overrides.ctx,
  };
  return { ctx, calls, watches, replies };
}

const accepted = (extra = {}) => ({
  status: "accepted", sendId: SEND_ID, code: "7F3A", runId: `v-a2a-req-${SEND_ID}-0`, targetDisposition: "queued",
  queuePosition: 0, waitingBehindActiveRun: false, delivery: { status: "pending", mode: "announce" },
  note: "已交给「任务群 a」(#7F3A)，对方聊天里能看到这条请求，正在处理。", label: "任务群 a", ...extra,
});

function fakeClock(t, start = 1_760_000_000_000) {
  const real = Date.now;
  let now = start;
  Date.now = () => now;
  t.after(() => { Date.now = real; });
  return { advance: (ms) => { now += ms; }, get now() { return now; } };
}
const acceptedTable = () => globalThis[ACCEPTED_KEY];
const resetTable = () => { delete globalThis[ACCEPTED_KEY]; };

test("the inlined literals equal contracts.js", () => {
  const { V_RELAY, V_RELAY_FALLBACK_RE } = loadRelay();
  assert.equal(V_RELAY.sendMethod, contracts.METHODS.send);
  assert.equal(V_RELAY.waitMethod, contracts.METHODS.wait);
  assert.deepEqual(V_RELAY.scopes, [...contracts.SEND_CALL_SCOPES]);
  assert.equal(contracts.METHOD_SCOPES[contracts.METHODS.send], V_RELAY.scopes[0]);
  assert.equal(contracts.METHOD_SCOPES[contracts.METHODS.wait], V_RELAY.scopes[0]);
  assert.equal(V_RELAY.sendRpcMs, contracts.TIMEOUTS.sendRpcMs);
  assert.equal(V_RELAY.waitSliceMaxMs, contracts.TIMEOUTS.waitSliceMaxMs);
  assert.equal(V_RELAY.waitRpcGraceMs, contracts.TIMEOUTS.waitRpcGraceMs);
  assert.equal(V_RELAY.inlineMaxMs, contracts.TIMEOUTS.inlineMaxMs);
  assert.equal(V_RELAY.inlineMaxMs, contracts.DEFAULT_LIMITS.inlineMaxMs);
  assert.equal(V_RELAY.absentCacheMs, contracts.TIMEOUTS.absentCacheMs);
  assert.equal(V_RELAY.idempotencyBucketMs, contracts.TIMEOUTS.idempotencyBucketMs);
  assert.equal(V_RELAY.acceptedKey, contracts.SYMBOL_KEYS.sessionsSendAccepted);
  assert.equal(Symbol.for(V_RELAY.acceptedKey), contracts.SESSIONS_SEND_ACCEPTED);
  assert.equal(V_RELAY_FALLBACK_RE.source, contracts.RELAY_FALLBACK_RE.source);
  assert.equal(V_RELAY_FALLBACK_RE.flags, contracts.RELAY_FALLBACK_RE.flags);
  assert.equal(contracts.CONTRACT_VERSION, 1);
  // Every status the contract defines has a branch in the core.
  const helpers = between(GEN_TOOL, `// ${MARKER}\n`, HELPERS_END);
  for (const s of contracts.SEND_STATUSES) assert.ok(helpers.includes(`r?.status === "${s}"`), `vrelay.send ${s}`);
  for (const s of contracts.WAIT_STATUSES) assert.ok(helpers.includes(`w?.status === "${s}"`) || helpers.includes(`w?.status !== "${s}"`), `vrelay.wait ${s}`);
});

test("idempotencyKey: same formula as contracts.sendIdempotencyKey", (t) => {
  const { vRelayIdempotencyKey } = loadRelay();
  const now = 1_760_000_123_456;
  for (const [run, call] of [["run-A", "call_1"], [null, "call_1"], ["v-a2a-req-s_x-0", "toolu_01"]]) {
    assert.equal(
      vRelayIdempotencyKey(REQUESTER, run, call, now),
      contracts.sendIdempotencyKey({ requesterSessionKey: REQUESTER, requesterRunId: run, toolCallId: call, now }),
    );
  }
  fakeClock(t, now);
  assert.equal(vRelayIdempotencyKey(REQUESTER, null, "c"), contracts.sendIdempotencyKey({ requesterSessionKey: REQUESTER, requesterRunId: null, toolCallId: "c", now }));
});

test("plugin present, async: accepted at once with the plugin's note, recorded for the polling guard", async () => {
  resetTable();
  const relay = loadRelay();
  const { ctx, calls, watches } = context({ replies: [accepted({ queuePosition: 2, waitingBehindActiveRun: true })] });
  const result = await relay.execute(ctx);
  assert.notEqual(result, FALLTHROUGH);
  assert.equal(calls.length, 1, "one RPC, no wait");
  const [call] = calls;
  assert.equal(call.method, "vrelay.send");
  assert.deepEqual(call.scopes, ["operator.write"]);
  assert.equal(call.timeoutMs, 20_000);
  assert.deepEqual(contracts.validateSendParams(call.params), { ok: true, errors: [] });
  assert.equal(call.params.idempotencyKey, contracts.sendIdempotencyKey({ requesterSessionKey: REQUESTER, requesterRunId: "run-A", toolCallId: "call_1" }));
  assert.deepEqual(call.params.requester, {
    sessionKey: REQUESTER, replySessionKey: REQUESTER, agentId: "makaron", runId: "run-A", channel: "feishu",
    accountId: "default", to: "user:ou_tianyi", threadId: null, senderId: "ou_tianyi", senderIsOwner: true,
  });
  assert.deepEqual(call.params.target, { sessionKey: TARGET, agentId: "makaron", displayKey: TARGET, created: false });
  assert.equal(call.params.mode, "async");
  assert.equal(call.params.inlineTimeoutMs, 0);
  assert.equal(call.params.message, ctx.message, "the model's message goes as written");
  assert.deepEqual(result.details, {
    runId: `v-a2a-req-${SEND_ID}-0`, status: "accepted", sessionKey: TARGET, targetDisposition: "queued",
    delivery: { status: "pending", mode: "announce" }, requestCode: "7F3A", note: accepted().note,
    queuePosition: 2, waitingBehindActiveRun: true,
  });
  assertSchema(result.details);
  assert.deepEqual(watches, [TARGET], "watch registered once, for the accepted target");
  assert.deepEqual(relay.record.facts, [{ operation: "send", fact: "committed", targetAgentId: "makaron", targetSessionKey: TARGET }]);
  assert.equal(relay.record.participants.length, 1);
  assert.equal(relay.record.participants[0].sessionKey, TARGET);
  const row = acceptedTable().get("run-A");
  assert.ok(row && typeof row.at === "number");
  assert.deepEqual(row.targets.get(TARGET), { code: "7F3A", label: "任务群 a", historyReads: 0, sendId: SEND_ID, displayKey: TARGET });
});

test("async: a second send of the same run keeps the guard's history counter and adds the target", async () => {
  resetTable();
  const relay = loadRelay();
  const first = context({ replies: [accepted()] });
  await relay.execute(first.ctx);
  acceptedTable().get("run-A").targets.get(TARGET).historyReads = 1;
  const OTHER = "agent:makaron:feishu:group:oc_room2";
  const second = context({ replies: [accepted({ code: "9K2M", sendId: "s_mgk3x1a2f9aaaaaaaaaa", label: undefined })], ctx: { resolvedKey: OTHER, displayKey: OTHER, _toolCallId: "call_2" } });
  const result = await relay.execute(second.ctx);
  assert.equal(result.details.requestCode, "9K2M");
  const row = acceptedTable().get("run-A");
  assert.equal(row.targets.get(TARGET).historyReads, 1);
  assert.deepEqual(row.targets.get(OTHER), { code: "9K2M", label: OTHER, historyReads: 0, sendId: "s_mgk3x1a2f9aaaaaaaaaa", displayKey: OTHER });
  assert.notEqual(second.calls[0].params.idempotencyKey, first.calls[0].params.idempotencyKey);
});

test("async without a plugin note: the core's own hand-off note (no sleep, no polling)", async () => {
  resetTable();
  const relay = loadRelay();
  const { ctx } = context({ replies: [accepted({ note: undefined })] });
  const result = await relay.execute(ctx);
  assert.match(result.details.note, /^已交给「任务群 a」\(#7F3A\)/u);
  assert.match(result.details.note, /结束本轮。不要 sleep，不要轮询 sessions_history \/ session_status。$/u);
  assertSchema(result.details);
});

function inlineContext(replies, extra = {}) {
  return context({ replies: [accepted({ note: "inline accepted" }), ...replies], ctx: { timeoutSeconds: 120, ...extra } });
}

test("plugin present, inline: polls vrelay.wait in slices until ok", async (t) => {
  resetTable();
  const clock = fakeClock(t);
  const relay = loadRelay();
  const longPoll = (answer) => (request) => { clock.advance(request.params.timeoutMs); return answer; };
  const { ctx, calls } = inlineContext([
    longPoll({ status: "pending", code: "7F3A", note: "" }),
    longPoll({ status: "pending", code: "7F3A", note: "" }),
    (request) => { clock.advance(3_000); return { status: "ok", code: "7F3A", reply: "b 的答案是 42", media: ["https://cdn/x.png", 7, ""], note: "这是「任务群 b」的回答（它的聊天里也看得到），不会再单独送回。" }; },
  ]);
  const result = await relay.execute(ctx);
  assert.equal(calls[0].params.mode, "inline");
  assert.equal(calls[0].params.inlineTimeoutMs, contracts.inlineTimeoutMsFor(120));
  const waits = calls.slice(1);
  assert.equal(waits.length, 3);
  for (const w of waits) {
    assert.equal(w.method, "vrelay.wait");
    assert.deepEqual(w.scopes, ["operator.write"]);
    assert.equal(w.params.v, 1);
    assert.equal(w.params.sendId, SEND_ID);
    assert.equal(w.timeoutMs, w.params.timeoutMs + contracts.TIMEOUTS.waitRpcGraceMs);
  }
  assert.deepEqual(waits.map((w) => w.params.timeoutMs), [55_000, 55_000, 10_000], "≤55 s slices, never past the inline window");
  assert.deepEqual(result.details, {
    runId: `v-a2a-req-${SEND_ID}-0`, sessionKey: TARGET, status: "ok", delivery: { status: "skipped", mode: "announce" },
    reply: "b 的答案是 42", requestCode: "7F3A", note: "这是「任务群 b」的回答（它的聊天里也看得到），不会再单独送回。", media: ["https://cdn/x.png"],
  });
  assertSchema(result.details);
  assert.equal(acceptedTable(), undefined, "an answered inline send is not recorded for the polling guard");
});

test("inline: no_reply and failed map to their tool results", async () => {
  resetTable();
  for (const [answer, expected] of [
    [{ status: "no_reply", code: "7F3A", note: "「任务群 a」这一轮没有给出文字结果。" },
      { runId: `v-a2a-req-${SEND_ID}-0`, sessionKey: TARGET, status: "no_reply", message: NO_REPLY_MESSAGE, requestCode: "7F3A", note: "「任务群 a」这一轮没有给出文字结果。" }],
    [{ status: "failed", code: "7F3A", failure: { class: "started_failed", reason: "处理时出错：model 404" }, note: "「任务群 a」没能完成 #7F3A：处理时出错：model 404。对方聊天里可能已经发过部分内容。" },
      { runId: `v-a2a-req-${SEND_ID}-0`, status: "error", error: "「任务群 a」没能完成 #7F3A：处理时出错：model 404。对方聊天里可能已经发过部分内容。", sentBeforeError: true, sessionKey: TARGET, requestCode: "7F3A" }],
    [{ status: "failed", code: "7F3A", failure: { class: "aborted", reason: "在对方聊天里被中止" } },
      { runId: `v-a2a-req-${SEND_ID}-0`, status: "error", error: "「任务群 a」没能完成 #7F3A：在对方聊天里被中止。", sentBeforeError: true, sessionKey: TARGET, requestCode: "7F3A" }],
  ]) {
    const relay = loadRelay();
    const { ctx, calls } = inlineContext([answer]);
    const result = await relay.execute(ctx);
    assert.equal(calls.length, 2);
    assert.deepEqual(result.details, expected);
    assertSchema(result.details);
  }
  assert.equal(acceptedTable(), undefined);
});

test("inline: expired turns async with the plugin's note and is recorded", async () => {
  resetTable();
  const relay = loadRelay();
  const note = "「任务群 a」还在处理（已等 120 秒）。结果会作为新的一轮自动回到这里；现在先做别的或结束本轮，不要等待或轮询。";
  const { ctx } = inlineContext([{ status: "expired", code: "7F3A", note }]);
  const result = await relay.execute(ctx);
  assert.equal(result.details.status, "accepted");
  assert.equal(result.details.note, note);
  assert.equal(result.details.requestCode, "7F3A");
  assert.equal(result.details.targetDisposition, "queued");
  assertSchema(result.details);
  assert.equal(acceptedTable().get("run-A").targets.get(TARGET).code, "7F3A");
});

test("inline: still pending at the deadline turns async with the core's note and is recorded", async (t) => {
  resetTable();
  const clock = fakeClock(t);
  const relay = loadRelay();
  const longPoll = (request) => { clock.advance(request.params.timeoutMs); return { status: "pending", code: "7F3A" }; };
  const { ctx, calls } = inlineContext(Array(6).fill(longPoll), { timeoutSeconds: 3600 });
  const result = await relay.execute(ctx);
  assert.equal(calls[0].params.inlineTimeoutMs, 300_000, "inline is capped at 300 s");
  assert.deepEqual(calls.slice(1).map((c) => c.params.timeoutMs), [55_000, 55_000, 55_000, 55_000, 55_000, 25_000]);
  assert.equal(result.details.status, "accepted");
  assert.match(result.details.note, /^「任务群 a」还在处理（已等 300 秒）/u);
  assertSchema(result.details);
  assert.ok(acceptedTable().get("run-A").targets.has(TARGET));
});

test("inline: deadline reached across slices ends at exactly the window", async (t) => {
  resetTable();
  const clock = fakeClock(t);
  const relay = loadRelay();
  const longPoll = (request) => { clock.advance(request.params.timeoutMs); return { status: "pending" }; };
  const { ctx, calls } = inlineContext([longPoll, longPoll, longPoll], { timeoutSeconds: 120 });
  const result = await relay.execute(ctx);
  assert.deepEqual(calls.slice(1).map((c) => c.params.timeoutMs), [55_000, 55_000, 10_000]);
  assert.match(result.details.note, /已等 120 秒/u);
});

test("inline: an RPC failure mid-wait keeps the send accepted (connection note), never falls back", async () => {
  resetTable();
  const relay = loadRelay();
  const { ctx } = inlineContext([() => { throw new Error("gateway closed (1006): Gateway restarting"); }]);
  const result = await relay.execute(ctx);
  assert.notEqual(result, FALLTHROUGH);
  assert.equal(result.details.status, "accepted");
  assert.equal(result.details.note, "和「任务群 a」之间的等待中断了，但请求 #7F3A 已受理，结果会作为新的一轮回来；现在结束本轮，不要重发。");
  assertSchema(result.details);
  assert.ok(acceptedTable().get("run-A").targets.has(TARGET));
  assert.ok(relay.record.warns.some((w) => w.message.startsWith("vrelay.wait failed")));
});

test("inline: an unknown wait status keeps the send accepted", async () => {
  resetTable();
  const relay = loadRelay();
  const { ctx } = inlineContext([{ status: "weird" }]);
  const result = await relay.execute(ctx);
  assert.equal(result.details.status, "accepted");
  assert.match(result.details.note, /等待中断了/u);
});

test("inline: an aborted requester run stops polling and turns async", async () => {
  resetTable();
  const relay = loadRelay();
  const controller = new AbortController();
  controller.abort();
  const { ctx, calls } = inlineContext([], { opts: { runId: "run-A", signal: controller.signal } });
  const result = await relay.execute(ctx);
  assert.equal(calls.length, 1, "no vrelay.wait after the run was aborted");
  assert.equal(result.details.status, "accepted");
});

test("forbidden and error answers pass through as tool results", async () => {
  resetTable();
  for (const answer of [
    { status: "forbidden", code: "DEPTH", error: "已经是第 2 层转派（A → X → 房间），不能再往下派；自己做完，或在最终回复里说明需要谁来做。" },
    { status: "forbidden", code: "REPLY_TO_REQUESTER", error: "你在做「X」交来的事，最终回复会自动交回给它，不用发；要问它问题，用 timeoutSeconds=120 当场等回答。" },
    { status: "error", code: "NO_ROUTE", error: "发不到「任务群 a」的聊天：找不到这个聊天的投递地址" },
  ]) {
    const relay = loadRelay();
    const { ctx, calls, watches } = context({ replies: [answer] });
    const result = await relay.execute(ctx);
    assert.notEqual(result, FALLTHROUGH, "never falls back to v2");
    assert.equal(calls.length, 1);
    assert.equal(result.details.status, answer.status);
    assert.equal(result.details.error, answer.error);
    assert.equal(result.details.code, answer.code);
    assert.equal(result.details.sessionKey, TARGET);
    assert.equal(typeof result.details.runId, "string");
    assertSchema(result.details);
    assert.deepEqual(watches, [], "nothing was sent, nothing to watch");
    assert.deepEqual(relay.record.facts, []);
  }
  assert.equal(acceptedTable(), undefined);
});

test("plugin absent: v2 path, absence cached for 60 s in this process", async (t) => {
  const clock = fakeClock(t);
  for (const text of ["missing scope: operator.admin", "unknown method: vrelay.send"]) {
    const relay = loadRelay();
    const absent = context({ replies: [() => { throw Object.assign(new Error(text), { code: "FORBIDDEN" }); }] });
    assert.equal(await relay.execute(absent.ctx), FALLTHROUGH);
    assert.equal(absent.calls.length, 1);
    assert.ok(relay.record.warns.some((w) => w.message === "vrelay absent; sessions_send uses v2"));
    clock.advance(59_000);
    const cached = context();
    assert.equal(await relay.execute(cached.ctx), FALLTHROUGH);
    assert.equal(cached.calls.length, 0, "no RPC while the absence is cached");
    clock.advance(2_000);
    const retried = context({ replies: [accepted()] });
    assert.equal((await relay.execute(retried.ctx)).details.status, "accepted", "after 60 s the plugin is asked again");
    assert.deepEqual(absent.watches, [], "the v2 path registers its own watch");
  }
});

test("plugin answers fallback (DISABLED, unsupported requester): v2 path, not cached", async () => {
  const relay = loadRelay();
  for (const reason of contracts.FALLBACK_REASONS) {
    const { ctx, calls, watches } = context({ replies: [{ status: "fallback", reason }] });
    assert.equal(await relay.execute(ctx), FALLTHROUGH);
    assert.equal(calls.length, 1, `asked again after ${reason}`);
    assert.deepEqual(watches, []);
  }
  assert.deepEqual(relay.record.facts, []);
});

test("unknown RPC error: an unknown-state error, no fallback, no caching", async () => {
  const relay = loadRelay();
  for (const thrown of [new Error("gateway timeout after 20000ms"), new Error("missing scope: operator.write"), "socket hang up"]) {
    const { ctx, calls } = context({ replies: [() => { throw thrown; }] });
    const result = await relay.execute(ctx);
    assert.notEqual(result, FALLTHROUGH, `${thrown} must not run v2 (the plugin may have accepted it)`);
    assert.equal(calls.length, 1);
    assert.equal(result.details.status, "error");
    assert.match(result.details.error, /^会话转交的状态未知（/u);
    assert.ok(result.details.error.includes(thrown instanceof Error ? thrown.message : thrown));
    assert.match(result.details.error, /先不要重发/u);
    assertSchema(result.details);
  }
  const { ctx } = context({ replies: [null] });
  const odd = await relay.execute(ctx);
  assert.equal(odd.details.status, "error", "an answer without a known status is an unknown state too");
  assert.match(odd.details.error, /状态未知/u);
});

test("unsupported sends never reach the plugin", async () => {
  const cases = [
    ["self-send", { sameSessionA2A: true }],
    ["isolated cron requester", { isIsolatedCronRequester: true }],
    ["exact incarnation", { expectedSessionId: "sess-1" }],
    ["run-scoped target", { resolvedKey: "agent:makaron:cron:nightly:run:r1", displayKey: "agent:makaron:cron:nightly:run:r1" }],
    ["subagent target", { resolvedKey: "agent:makaron:subagent:abc", displayKey: "agent:makaron:subagent:abc" }],
    ["no requester session", { requesterSessionKey: undefined, replyRequesterSessionKey: undefined }],
  ];
  for (const [label, ctxOverrides] of cases) {
    const relay = loadRelay();
    const { ctx, calls } = context({ ctx: ctxOverrides });
    assert.equal(await relay.execute(ctx), FALLTHROUGH, label);
    assert.equal(calls.length, 0, label);
    assert.equal(relay.record.entryLoads, 0, `${label}: decided before any session read`);
  }
  const acpParent = loadRelay({ entry: () => ({ sessionId: "x" }), acpMeta: { mode: "background" }, backgroundAcpParent: (entry, requester) => entry.acp && requester === REQUESTER });
  const acp = context();
  assert.equal(await acpParent.execute(acp.ctx), FALLTHROUGH, "requester owns the target as a background ACP session");
  assert.equal(acp.calls.length, 0);
});

test("requester fields are normalized to the contract (strings or null)", async () => {
  resetTable();
  const relay = loadRelay();
  const { ctx, calls } = context({
    replies: [accepted()],
    ctx: { opts: { runId: undefined, requesterSenderId: 12345, agentThreadId: 778, agentTo: "" }, requesterChannel: undefined, _toolCallId: undefined, visibleSession: { ok: true, missing: true } },
  });
  await relay.execute(ctx);
  const { params } = calls[0];
  assert.deepEqual(contracts.validateSendParams(params), { ok: true, errors: [] });
  assert.equal(params.requester.runId, null);
  assert.equal(params.requester.senderId, "12345");
  assert.equal(params.requester.threadId, "778");
  assert.equal(params.requester.to, null);
  assert.equal(params.requester.channel, null);
  assert.equal(params.requester.senderIsOwner, null);
  assert.equal(params.target.created, true, "a configured-agent main created by this send");
  assert.match(params.toolCallId, /^[0-9a-f-]{36}$/u, "a missing tool call id never makes two sends share a key");
  assert.equal(acceptedTable(), undefined, "no requester runId, nothing for the guard to key on");
});
