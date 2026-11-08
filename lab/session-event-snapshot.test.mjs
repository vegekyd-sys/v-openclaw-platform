import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FILES, MARKER, PATCH, PROBE_MARKER, RELEASE_DIR, patchFile, probeFile, sha256, unpatchFile } from "./patch-session-event-snapshot.mjs";

// session-event-snapshot-coalesce: one session row per handled agent event for the calls without an event
// or lifecycle projection. See lab/session-event-snapshot.md.
const root = new URL("..", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), "utf8");
const NAME = "server-chat-Mh_L0_2e.js";

test("release file is the patcher applied to V bytes and unpatches back to them", () => {
  const release = read(`${RELEASE_DIR}/${NAME}`);
  const base = unpatchFile(NAME, release);
  assert.equal(sha256(base), FILES[NAME].before);
  assert.equal(patchFile(NAME, base), release);
  assert.throws(() => patchFile(NAME, release), /already patched/u);
  assert(release.includes(MARKER));
  assert(!release.includes(PROBE_MARKER), "the release carries no instrumentation");
  assert.deepEqual(Object.keys(PATCH), [NAME], "only server-chat changes");
});

test("only the snapshot builder and the event entry change; lifecycle calls bypass the shared row", () => {
  const release = read(`${RELEASE_DIR}/${NAME}`);
  const lines = new Set(release.split("\n"));
  const removed = unpatchFile(NAME, release).split("\n").filter((line) => !lines.has(line)).map((line) => line.trim().slice(0, 80));
  assert.deepEqual(removed, [], "only additions: the original builder and handler bodies are kept as they are");
  // every call that carries an event, active run state or lifecycle projection, and any call outside a
  // handled event (timers, persistence callbacks), goes to the uncached builder
  assert.match(release, /if \(evt !== void 0 \|\| includeActiveRunState \|\| lifecycleProjection \|\| coalescedEventSnapshots === null \|\| process\.env\.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE === "0"\) return buildSessionEventSnapshotUncached\(/u);
  // the shared rows live for one handleEvent call and are restored on exit, even when it throws
  assert.match(release, /coalescedEventSnapshots = \/\* @__PURE__ \*\/ new Map\(\);\n\t\ttry \{\n\t\t\treturn handleEventCoalesced\(event\);\n\t\t\} finally \{\n\t\t\tcoalescedEventSnapshots = outerEventSnapshots;/u);
  // call sites are untouched
  assert.equal(release.split("buildSessionEventSnapshot(sessionKey, void 0, sessionAgentId)").length - 1, 5);
  assert.equal(release.split("buildSessionEventSnapshot(sessionKey, snapshotEvent, sessionAgentId, true, true)").length - 1, 1);
  assert.equal(release.split("buildSessionEventSnapshot(sessionKey, evt, sessionAgentId, true, true)").length - 1, 1);
});

test("probe applies over V bytes and over the change", () => {
  const release = read(`${RELEASE_DIR}/${NAME}`);
  const probed = probeFile(NAME, release);
  assert.equal(probed.split('__vSnapProbe.site = "').length - 1, 7, "all seven call sites labelled");
  assert.equal(probeFile(NAME, unpatchFile(NAME, release)).split('__vSnapProbe.site = "').length - 1, 7);
  assert.throws(() => probeFile(NAME, probed), /already probed/u);
});

// ---- behaviour, against the real runtime (inside a candidate: VLAB_CANDIDATE_RUNTIME has the release file) ----
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const distFile = runtime ? path.join(runtime, "openclaw", "dist", NAME) : null;
const live = distFile && fs.existsSync(distFile) && fs.readFileSync(distFile, "utf8").includes(MARKER);

async function harness() {
  const mod = await import(distFile);
  const loads = [];
  const frames = [];
  let revision = 0;
  const subscribers = new Set(["ui"]);
  const messageSubscribers = new Map([["agent:makaron:explicit:snap-test", new Set(["viewer"])]]);
  const handler = mod.createAgentEventHandler({
    broadcast: (event, payload) => frames.push({ to: "all", event, payload }),
    broadcastToConnIds: (event, payload, connIds) => frames.push({ to: [...connIds].join(","), event, payload }),
    nodeSendToSession: (sessionKey, event, payload) => frames.push({ to: "node", event, payload }),
    agentRunSeq: new Map(),
    chatRunState: mod.createChatRunState(),
    resolveSessionKeyForRun: () => void 0,
    clearAgentRunContext: () => {},
    toolEventRecipients: { get: () => new Set(["cli"]), markFinal: () => {} },
    sessionEventSubscribers: { getAll: () => subscribers },
    sessionMessageSubscribers: { get: (key) => messageSubscribers.get(key) ?? new Set() },
    loadGatewaySessionLifecycleSnapshotForEvent: (sessionKey, options) => {
      loads.push({ sessionKey, options });
      return { lifecycleRunId: "run-1", row: { key: sessionKey, sessionId: "s-1", updatedAt: 1000 + revision, label: `label-${revision}`, model: `model-${revision}`, status: "running", childSessions: [`child-${revision}`] } };
    },
    persistGatewaySessionLifecycleEventForEvent: () => Promise.resolve(),
    resolveSessionActiveRunState: () => ({ active: true, status: "running", runIds: ["run-1"] }),
  });
  return { handler, loads, frames, bump: () => { revision += 1; } };
}
const toolEvent = (seq, phase, extra = {}) => ({ runId: "run-1", seq, stream: "tool", ts: 1_000 + seq, sessionKey: "agent:makaron:explicit:snap-test", agentId: "makaron", data: { phase, name: "exec", toolCallId: `t${seq}` }, ...extra });
const snapshotFields = (frames) => frames.filter((f) => f.payload?.session).map((f) => ({ to: f.to, event: f.event, session: f.payload.session, label: f.payload.label, model: f.payload.model, childSessions: f.payload.childSessions }));

test("one tool event: several frames, one row load, identical frames, separate objects", { skip: !live && "needs the candidate runtime with the release file" }, async () => {
  for (const side of ["0", "1"]) {
    if (side === "0") process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE = "0"; else delete process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE;
    const h = await harness();
    h.handler(toolEvent(1, "start"));
    const sessionFrames = h.frames.filter((f) => f.payload?.session);
    assert(sessionFrames.length >= 2, `tool event reaches the tool-event client and the session subscriber (${sessionFrames.length})`);
    assert.equal(h.loads.length, side === "0" ? sessionFrames.length : 1, `side ${side}: loads`);
    const [a, b] = sessionFrames;
    assert.deepEqual(a.payload.session, b.payload.session);
    assert.notEqual(a.payload.session, b.payload.session, "each frame has its own session object");
    test.sideSnapshots ??= {};
    test.sideSnapshots[side] = snapshotFields(h.frames);
  }
  assert.deepEqual(test.sideSnapshots["1"], test.sideSnapshots["0"], "frames are the same with the switch off and on");
});

test("the next event loads again: a rename, model or child change between events is seen", { skip: !live && "needs the candidate runtime with the release file" }, async () => {
  delete process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE;
  const h = await harness();
  h.handler(toolEvent(1, "start"));
  h.bump();
  h.handler(toolEvent(2, "result"));
  assert.equal(h.loads.length, 2);
  const after = snapshotFields(h.frames).filter((f) => f.label === "label-1");
  assert(after.length >= 2 && after.every((f) => f.model === "model-1" && f.childSessions[0] === "child-1"));
});

test("hidden-session mirror shares the row only within its own event", { skip: !live && "needs the candidate runtime with the release file" }, async () => {
  delete process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE;
  const h = await harness();
  h.handler(toolEvent(1, "start", { controlUiVisible: false }));
  h.handler({ runId: "run-1", seq: 2, stream: "item", ts: 1_002, sessionKey: "agent:makaron:explicit:snap-test", agentId: "makaron", controlUiVisible: false, data: { phase: "start", kind: "tool", itemId: "i1" } });
  assert.equal(h.loads.length, 2, "one load per event");
  assert(h.frames.filter((f) => f.payload?.session && f.to === "viewer").length >= 2);
});

test("lifecycle start is never served from the shared row", { skip: !live && "needs the candidate runtime with the release file" }, async () => {
  delete process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE;
  const h = await harness();
  h.handler({ runId: "run-1", seq: 1, stream: "lifecycle", ts: 1_001, sessionKey: "agent:makaron:explicit:snap-test", agentId: "makaron", data: { phase: "start", startedAt: 1_001 } });
  const changed = h.frames.filter((f) => f.event === "sessions.changed");
  assert.equal(changed.length, 1);
  assert.equal(changed[0].payload.hasActiveRun, true, "lifecycle snapshot keeps the active run state");
  assert.deepEqual(changed[0].payload.activeRunIds, ["run-1"]);
  assert.equal(h.loads.length, 1);
});
