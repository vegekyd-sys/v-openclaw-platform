// Candidate-only timing marks for the transcript projection reconcile (never shipped). Inserts
// mark() calls into copies of the reconcile chunk and its worker so a candidate can split the
// window from a dirty append to a readable projection into its segments. A mark appends
// {k, t, ...} to $VPROJ_TIMING_FILE, t = performance.timeOrigin + performance.now(), which is
// comparable across the main thread and Worker threads of one process. Anchors that a variant
// does not have are skipped (optional), so the same marks apply to V's bytes and to the release.
import assert from "node:assert/strict";

const MARK_FN = `const __vprojMark = (k, extra) => { const file = process.env.VPROJ_TIMING_FILE; if (file) process.getBuiltinModule("node:fs").appendFileSync(file, JSON.stringify({ k, t: performance.timeOrigin + performance.now(), ...extra }) + "\\n"); };\n`;

function insert(source, anchor, text, { after = true, optional = false } = {}) {
  const parts = source.split(anchor);
  if (optional && parts.length === 1) return source;
  assert.equal(parts.length, 2, `instrument anchor ${parts.length === 1 ? "missing" : "not unique"}: ${anchor.slice(0, 80)}`);
  return parts.join(after ? anchor + text : text + anchor);
}

export function instrumentReconcile(source) {
  let s = insert(source, "//#region src/config/sessions/session-transcript-reconcile.ts\n", MARK_FN);
  // the preflight's eval Worker source
  s = insert(s, `(async () => {\n\tconst index = await import(workerData.indexUrl);`, `\n\tconst __m = (k) => parentPort.postMessage({ type: "mark", k, t: performance.timeOrigin + performance.now() });\n\t__m("pw.imported");`);
  s = insert(s, `\t\t\tconst transcriptExists = db.prepare(`, `\t\t\t__m("pw.ftsScanned");\n`, { after: false });
  s = insert(s, `\t\t\tconst needsReconcile = workerData.needs ? index.o(db).length > 0 : false;`, `\n\t\t\t__m("pw.needs");`);
  const once = `\t\tworker.once("message", (message) => {\n\t\t\tsettle(() => message?.type === "done"`;
  assert.equal(s.split(once).length, 2, "preflight message anchor");
  s = s.replace(once, `\t\tworker.on("message", (message) => {\n\t\t\tif (message?.type === "mark") { __vprojMark(message.k, { t: message.t }); return; }\n\t\t\tsettle(() => message?.type === "done"`);
  s = insert(s, `function scanTranscriptIndexPreflight(databasePath, needs) {\n`, `\t__vprojMark("pre.spawn", { needs });\n`);
  s = insert(s, `\tconst scanMs = Math.round(performance.now() - startedAt);\n`, `\t__vprojMark("pre.result", { operationLabel, orphans: scan.orphans.length, ftsRows: scan.ftsRows });\n`);
  s = insert(s, `\treturn scan.needsReconcile;\n}`, `\t__vprojMark("pre.end", { operationLabel });\n`, { after: false });
  s = insert(s, `\tconst workerUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sessionTranscriptReconcile);\n`, `\t__vprojMark("rw.spawn");\n`, { after: false });
  s = insert(s, `\t\tconst handleMessage = async (message) => {\n`, `\t\t\tif (message.type === "mark") { __vprojMark(message.k, { t: message.t }); return; }\n\t\t\t__vprojMark("rw.msg", { type: message.type });\n`);
  s = insert(s, `\t\t\t\t\tif (applied) reconciledSessions += 1;\n`, `\t\t\t\t\t__vprojMark("delta.applied", { applied });\n`);
  s = insert(s, `\t\t\t\t\tif (finalized) reconciledSessions += 1;\n`, `\t\t\t\t\t__vprojMark("full.finalized", { finalized });\n`);
  const resolves = s.split(/\n\t+settle\(\(\) => resolve\(\{ reconciledSessions/u).length - 1;
  assert(resolves >= 1, "owner resolve anchor");
  s = s.replace(/\n(\t+)(settle\(\(\) => resolve\(\{ reconciledSessions)/gu, '\n$1__vprojMark("owner.resolve");\n$1$2');
  s = insert(s, `\t\t\treturn await reconcileSessionTranscriptIndexesAsProcessOwner(params);`, `\t\t\t__vprojMark("lease.acquired", { waitMs: wait?.waitMs });\n`, { after: false });
  s = insert(s, `function startSessionTranscriptIndexReconcile(params) {\n`, `\t__vprojMark("start", { preferred: params.preferredSessionId ?? null, running: runningReconciles.has(reconcileKey(params)) });\n`);
  s = insert(s, `\t\t\tconst result = await reconcileSessionTranscriptIndexes({\n`, `\t\t\t__vprojMark("pass.start", { preferred: preferredSessionId ?? null });\n`, { after: false });
  s = insert(s, `\t\t\treconciledSessions += result.reconciledSessions;\n`, `\t\t\t__vprojMark("pass.end", { pending: state.pending });\n`, { after: false });
  s = insert(s, `\t\t\t\treturn { ...proof, waitMs, polls };\n`, `\t\t\t\t__vprojMark("wait.ready", { polls });\n`, { after: false });
  // release-only anchors (no-ops on V's bytes)
  s = insert(s, `\t\t\t\t\t// transcript-projection-fixed-cost-v1: orphan sweep mark\n`, `\t\t\t\t\t__vprojMark("sweep.start");\n`, { optional: true });
  s = insert(s, `\tif (worker) worker.postMessage({\n\t\ttype: "run",`, `\t__vprojMark(worker ? "rw.reused" : "rw.new");\n`, { after: false, optional: true });
  return s;
}

export function instrumentWorker(source) {
  let s = insert(source, "//#region src/config/sessions/session-transcript-reconcile.worker.ts\n", `const __vprojMark = (k) => { if (process.env.VPROJ_TIMING_FILE) parentPort.postMessage({ type: "mark", k, t: performance.timeOrigin + performance.now() }); };\n__vprojMark("w.top");\n`);
  s = insert(s, `\t\tconst database = readOnlyDatabase ?? openOpenClawAgentDatabase({`, `\t\t__vprojMark("w.opened");\n`, { after: false });
  s = insert(s, `\t\tfor (const sessionId of sessionIds) {\n`, `\t\t__vprojMark("w.listed");\n`, { after: false, optional: true });
  s = insert(s, `\t\tfor (const sessionId of sessionIds) await reconcileSession(sessionId);`, `\t\t__vprojMark("w.listed");\n`, { after: false, optional: true });
  s = insert(s, `\t\t\tcurrentPreferredSessionId = next.preferredSessionId;\n`, `\t\t\t__vprojMark("w.run");\n`, { optional: true });
  s = insert(s, `\t\t\tconst delta = prepareIncrementalSessionTranscriptProjection(database.db, sessionId);\n`, `\t\t\t__vprojMark("w.deltaPlanned");\n`);
  s = insert(s, `\t\t\tconst plan = prepareSessionTranscriptProjection(database.db, sessionId);\n`, `\t\t\t__vprojMark("w.fullPlanned");\n`);
  return s;
}
