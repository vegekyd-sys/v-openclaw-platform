import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const names = {
  wake: "subagent-announce.requester-settle-wake-B2NSziIo.js",
  read: "subagent-registry-read-UaDFTyfW.js",
  store: "subagent-registry.store.sqlite-hzGu4QSk.js",
  registry: "subagent-registry-C24yr_PF.js",
  liveness: "subagent-run-liveness-CrhVXF5Y.js",
};
export function source(kind, variant = "patched") {
  const name = names[kind];
  if (kind === "registry") {
    // The reused fixture's transition/complete callback slice is byte-identical
    // to production (d11db464d202c1a6a670df501b809933ba4c0ef87ba2f3524e24b1bb9397e22c).
    return readFileSync(new URL(`./fixtures/gpt-live-continuation/${name}`, import.meta.url), "utf8");
  }
  if (variant === "patched" && ["wake", "read", "store"].includes(kind)) {
    const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
    return readFileSync(runtime ? join(runtime, "openclaw/dist", name) : new URL(`./release-files/subagent-settle-backlog/${name}`, import.meta.url), "utf8");
  }
  return readFileSync(new URL(`./fixtures/subagent-settle-backlog/${name}`, import.meta.url), "utf8");
}
export function between(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert(from >= 0 && to > from, `native boundary drift: ${start}`);
  return text.slice(from, to);
}
export function native(text, deps, exports) {
  const body = text.replace(/^import .*;\n/gm, "").replace(/^export .*;\n?/gm, "");
  return new Function("deps", `with (deps) { ${body}\nreturn {${exports.join(",")}}; }`)(deps);
}

export const NOW = 1_800_000_000_000;
export function run(id, options = {}) {
  const { live = false, required = true, createdAt = NOW - 1000, endedAt = NOW, ...rest } = options;
  return {
    runId: id, childSessionKey: `agent:makaron:subagent:${id}`, requesterSessionKey: "agent:makaron:main", requesterAgentId: "makaron",
    createdAt, generation: 1, expectsCompletionMessage: required,
    execution: { status: live ? "running" : "terminal", startedAt: createdAt, ...live ? {} : { endedAt } },
    completion: { required }, delivery: { status: required ? "pending" : "not_required" },
    ...live ? {} : { cleanupCompletedAt: endedAt, requesterSettleWake: { status: "pending", attemptCount: 0 } },
    ...rest,
  };
}

export function readHarness({ entries = [], persisted = [], variant = "patched", loadDelay = 0, clock = { value: NOW }, loaders } = {}) {
  const runs = entries instanceof Map ? entries : new Map(entries.map((r) => [r.runId, structuredClone(r)]));
  const disk = persisted instanceof Map ? persisted : new Map(persisted.map((r) => [r.runId, structuredClone(r)]));
  const counts = { full: 0, projected: 0 };
  const date = { now: () => clock.value, UTC: Date.UTC };
  const liveness = native(source("liveness"), { Date: date }, ["hasSubagentRunEnded", "isLiveUnendedSubagentRun"]);
  const generation = native(between(source("store", variant), "function normalizeGeneration(", "/** Allocates a durable"), {}, ["compareSubagentRunGeneration"]);
  const isDeliverySuspended = (entry) => entry.delivery?.status === "suspended" && typeof entry.delivery.suspendedAt === "number";
  let api;
  const deps = {
    Date: date, structuredClone, isVitestRuntimeEnv: () => false, isFastTestRuntimeEnv: () => false,
    subagentRuns: runs, ...liveness, ...generation, isDeliverySuspended,
    getAgentRunContext: () => undefined, normalizeDeliveryContext: (v) => v,
    loadSubagentRegistryFromSqlite: () => { counts.full++; if (loadDelay) clock.value += loadDelay; return loaders?.full() ?? structuredClone(disk); },
    loadSubagentSessionListRunsFromSqlite: () => {
      counts.projected++; if (loadDelay) clock.value += loadDelay;
      return loaders?.projected() ?? new Map([...disk].map(([id, r]) => [id, api.projectSubagentRunForSessionList(r)]));
    },
    loadSubagentRunsForControllerFromSqlite: () => [], loadSubagentRunsForChildSessionFromSqlite: () => [],
    saveSubagentRegistryChangesToSqlite: (current, ids) => { for (const id of ids) current.has(id) ? disk.set(id, structuredClone(current.get(id))) : disk.delete(id); },
    saveSubagentRegistryToSqlite: (current) => { disk.clear(); for (const [id, r] of current) disk.set(id, structuredClone(r)); },
  };
  api = native(source("read", variant), deps, [
    "hasDescendantRunAwaitingSettle", "hasDescendantRunAwaitingSettleFromRuns", "getSubagentRunsSnapshotForRead",
    "getSubagentSessionListRunsSnapshotForRead", "projectSubagentRunForSessionList", "persistSubagentRunsToDiskOrThrow",
    "clearSubagentRunsReadCacheForTest", "restoreSubagentRunsFromDisk", "listSubagentRunsForRequester", "buildSubagentRunReadIndexFromRuns",
  ]);
  return { ...api, runs, disk, counts, clock, liveness };
}

// Executes the captured lifecycle's durable transition/complete callbacks, not
// a reimplementation of wake cleanup. External task-status/context hooks are inert.
export function wakeHarness({ entries = [], variant = "patched", persisted = [], delivery, hasDescendants, persistError, loadDelay = 0, clock = { value: NOW }, loaders } = {}) {
  const reader = readHarness({ entries, persisted, variant, loadDelay, clock, loaders });
  const { runs, disk } = reader;
  const delivered = [], completed = [], transitions = [], scheduled = [], writes = [], voiceWakes = [];
  let descendantChecks = 0;
  const original = source("registry", "baseline");
  const callbacks = between(original, "const transitionRequesterSettleWakeBatch =", "const persistRequesterSettleWakePending =");
  const timers = new Map();
  const persistOrThrow = (...ids) => {
    if (persistError?.()) throw new Error("durable write failed");
    writes.push([...ids]); reader.persistSubagentRunsToDiskOrThrow(runs, ids);
  };
  runs.confirmRetirement = () => {};
  runs.commitOwnership = () => {};
  const context = {
    options: { runs, resumedRuns: new Set(), persistOrThrow, clearPendingLifecycleError: () => {}, resolveSubagentTask: () => ({}) },
    getRequesterSettleWakeTimer: (id) => timers.get(id), deleteRequesterSettleWakeTimer: (id) => timers.delete(id),
  };
  const lifecycle = native(callbacks, {
    Date: { now: () => clock.value }, structuredClone, clearTimeout: () => {}, subagentRuns: runs,
    ensureDeliveryState: (entry) => entry.delivery ??= { status: "pending" },
    clearGatewayContextResolver: () => {}, safeSetSubagentTaskDeliveryStatus: () => {},
    blockSubagentCompletionDelivery: ({ subagent, disposition, reason }) => {
      subagent.delivery = { status: "failed", disposition, lastError: reason }; return true;
    },
    scheduleRequesterSettleWake: (_context, id) => scheduled.push(id),
  }, ["transitionRequesterSettleWakeBatch", "completeRequesterSettleWakeBatch"]);
  const deps = {
    Date: { now: () => clock.value }, SILENT_REPLY_TOKEN: "NO_REPLY", getRuntimeConfig: () => ({}),
    resolveSubagentRequesterAgentId: (_cfg, entry) => entry.requesterAgentId,
    isCronSessionKey: (key) => key.includes(":cron:"), listSubagentRunsForRequester: reader.listSubagentRunsForRequester,
    hasDescendantRunAwaitingSettle: (...args) => { descendantChecks++; return hasDescendants ? hasDescendants(...args) : reader.hasDescendantRunAwaitingSettle(...args); },
    hasSubagentRunEnded: reader.liveness.hasSubagentRunEnded, getSubagentDepthFromSessionStore: () => 0,
    loadRequesterSessionEntry: () => ({ entry: { sessionId: "requester-canonical" } }), hasUsableSessionEntry: () => true,
    dedupeLatestChildCompletionRows: (rows) => rows, filterCurrentDirectChildCompletionRows: (rows) => rows,
    getLatestSubagentRunByChildSessionKey: () => undefined, buildChildCompletionFindings: () => "Verified synthetic child results.",
    normalizeDeliveryContext: (v) => v, resolveAnnounceOrigin: () => undefined, normalizeMessageChannel: () => undefined,
    isDeliverableMessageChannel: () => false, buildAnnounceIdempotencyKey: (v) => v, INTERNAL_MESSAGE_CHANNEL: "internal",
    getSharedGatewayContextResolver: () => undefined, logWarn: () => {}, truncateUtf16Safe: (v, limit) => v.slice(0, limit),
    resolveGptLiveConsultRequesterWake: (params) => { voiceWakes.push(params); return { causal: params }; },
    deliverSubagentAnnouncement: async (params) => { delivered.push(params); return delivery ? await delivery(params, delivered.length) : { delivered: true, path: "direct" }; },
  };
  const wake = native(source("wake", variant), deps, ["maybeWakeRequesterAfterAllChildrenSettled"]).maybeWakeRequesterAfterAllChildrenSettled;
  const invoke = (id, options = {}) => {
    const entry = runs.get(id);
    if (!entry?.requesterSettleWake) return Promise.resolve(false);
    return wake({ ...options, requesterSessionKey: entry.requesterSessionKey, settledEntry: entry,
      transitionBatch: (ids, state) => { transitions.push({ ids, state: structuredClone(state) }); lifecycle.transitionRequesterSettleWakeBatch(context, ids, state); },
      completeBatch: (ids, generation, outcome) => { completed.push({ ids, generation, outcome }); lifecycle.completeRequesterSettleWakeBatch(context, ids, generation, outcome); },
    });
  };
  const sweep = async () => {
    const initial = [...runs.values()].filter((r) => r.requesterSettleWake).map((r) => r.runId);
    for (const id of initial) await invoke(id);
    let count = 0;
    while (scheduled.length) { assert(++count < 100_000, "wake scheduling did not converge"); await invoke(scheduled.shift()); }
  };
  return { ...reader, invoke, sweep, delivered, completed, transitions, writes, voiceWakes, timers, scheduled, context,
    get descendantChecks() { return descendantChecks; },
    pending: () => [...runs.values()].filter((r) => r.requesterSettleWake),
    durableEntries: () => [...disk.values()].map((r) => structuredClone(r)),
  };
}
