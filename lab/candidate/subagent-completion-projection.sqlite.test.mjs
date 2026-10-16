import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { HELPER } from "../patch-subagent-completion-projection.mjs";

test("actual old Feishu session copy: baseline rejects a rebuilding projection; admitted completion waits and reads the same history", { timeout: 120000 }, async () => {
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  const data = process.env.VLAB_CANDIDATE_DATA;
  const state = process.env.OPENCLAW_STATE_DIR;
  assert(runtime && data && state && state.startsWith(data + path.sep), "private candidate state required");
  assert.notEqual(state, process.env.VLAB_SHARED_STATE_DIR);
  const file = path.join(state, "agents/makaron/agent/openclaw-agent.sqlite");
  assert(fs.realpathSync(file).startsWith(fs.realpathSync(data) + path.sep));
  const dist = path.join(runtime, "openclaw/dist");
  const db = new DatabaseSync(file);
  const sessionId = "d2ca4d3a-0db1-46fa-9c91-1e58d2aee246";
  const row = db.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(sessionId);
  assert(row, "the real affected VLab session must be present in the snapshot");
  const target = { agentId: "makaron", sessionId, sessionKey: row.session_key, storePath: file };
  const { t: SessionManager } = await import(pathToFileURL(path.join(dist, "session-manager-CNTG_BAJ.js")));
  const { waitForSessionTranscriptProjection } = await import(pathToFileURL(path.join(dist, "session-transcript-reconcile-DFsDtc9l.js")));
  const { i: waitForReconcile } = await import(pathToFileURL(path.join(dist, "session-transcript-reconcile-j5qhAafV.js")));
  const read = () => SessionManager.open(target, data, { maxBytes: 64 * 1024 * 1024, maxEvents: 10000 }).buildSessionContext().messages;
  const digest = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const count = () => db.prepare("SELECT count(*) AS n FROM transcript_events WHERE session_id = ?").get(sessionId).n;
  const signal = AbortSignal.timeout(90000);
  const wait = new Function(`${HELPER.replace('"./session-transcript-reconcile-DFsDtc9l.js"', JSON.stringify(pathToFileURL(path.join(dist, "session-transcript-reconcile-DFsDtc9l.js")).href))}; return waitForSubagentCompletionProjection;`)();
  const input = {
    attempt: { ...target, inputProvenance: { kind: "inter_session", sourceTool: "agent_harness_task" }, abortSignal: signal },
    sessionTarget: target,
    externalAbortController: { throwIfFired: () => signal.throwIfAborted() },
  };
  try {
    await waitForSessionTranscriptProjection(target, signal);
    await waitForReconcile({ agentId: "makaron", path: file });
    const before = read(), beforeCount = count();
    const originalDigest = digest(before);
    const dirty = () => {
      const result = db.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?").run(sessionId);
      assert.equal(result.changes, 1);
    };
    dirty();
    assert.throws(read, (error) => error.name === "SessionTranscriptProjectionUnavailableError" && error.sessionId === sessionId,
      "unmodified model-context open must reproduce the original failure");
    await waitForSessionTranscriptProjection(target, signal);
    await waitForReconcile({ agentId: "makaron", path: file });
    const waitsMs = [];
    for (let i = 0; i < 3; i++) {
      dirty();
      const start = performance.now();
      await wait(input);
      waitsMs.push(Math.round(performance.now() - start));
      const after = read();
      assert.equal(digest(after), originalDigest, "rebuild must retain the exact original history");
      assert.equal(count(), beforeCount, "readiness cannot add/replay any prompt, tool result or transcript event");
      assert.equal(db.prepare("SELECT needs_rebuild FROM session_transcript_index_state WHERE session_id = ?").get(sessionId).needs_rebuild, 0);
      await waitForReconcile({ agentId: "makaron", path: file });
    }
    console.log(JSON.stringify({ kind: "completion-projection-real-sqlite", baseline: "rebuilding-error", patched: "ready-three-times", waitsMs, messages: before.length, events: beforeCount, historyUnchanged: true, modelCalls: 0, toolCalls: 0 }));
  } finally {
    db.close();
  }
});
