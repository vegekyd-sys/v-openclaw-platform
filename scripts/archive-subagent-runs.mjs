#!/usr/bin/env node
// Archives inert subagent runs out of the state database's subagent_runs table: every selected row is
// written to a gzip JSONL file first (all columns, verified by reading it back), then deleted by run_id.
// See lab/subagent-scoped-row-index.md, "Archiving ended runs".
//
// Default is a preview: nothing is written. --apply exports and deletes. Run it while the Gateway and its
// workers are stopped: they keep every run in memory (restored at startup) and a full registry save
// writes the in-memory runs back, so rows deleted under a running Gateway come back and its memory does
// not shrink. --apply refuses when another process has the state database open (lsof), unless
// --allow-open-db is given.
//
//   sudo -u openclaw node scripts/archive-subagent-runs.mjs \
//     --state-db /home/openclaw/.openclaw/state/openclaw.sqlite \
//     --agent-db /home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite \
//     --out /home/openclaw/.openclaw/backups/subagent-runs-archive-YYYYMMDD.jsonl.gz \
//     [--older-than-days 14] [--apply]
//
// A run is archived only when all hold (the registry sweep keeps such runs forever when cleanup is
// "keep"; it deletes the others itself):
//   - payload is valid JSON, execution.status "terminal" with a numeric endedAt older than the threshold
//   - cleanupCompletedAt is a number, pauseReason is not "sessions_yield"
//   - delivery.status is not "pending" or "in_progress"; spawnMode is not "session"
//   - its child session is gone from --agent-db's session_nodes, or was last updated before the threshold
//   - no run whose requester is that child is still unended (descendants stay reachable)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const stateDbPath = option("state-db");
const agentDbPath = option("agent-db");
const outPath = option("out");
const OLDER_THAN_DAYS = Number(option("older-than-days", "14"));
const APPLY = flag("apply");
const line = (event, data) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
if (!stateDbPath || !agentDbPath || (APPLY && !outPath)) {
  console.error("usage: archive-subagent-runs.mjs --state-db <openclaw.sqlite> --agent-db <agent openclaw-agent.sqlite> [--out <file.jsonl.gz> --apply]");
  process.exit(2);
}
const cutoff = Date.now() - OLDER_THAN_DAYS * 86400_000;

const parse = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};
const state = new DatabaseSync(stateDbPath, { readOnly: !APPLY });
const rows = state.prepare("SELECT * FROM subagent_runs ORDER BY created_at, run_id").all();
const agent = new DatabaseSync(agentDbPath, { readOnly: true });
const sessionUpdatedAt = new Map(agent.prepare("SELECT session_key, updated_at FROM session_nodes").all().map((r) => [r.session_key, r.updated_at]));
agent.close();

const unendedRequesters = new Set();
for (const row of rows) {
  const payload = parse(row.payload_json);
  if (!payload || payload.execution?.status !== "terminal") unendedRequesters.add(row.requester_session_key);
}
const reasons = {};
const skip = (reason) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
const selected = [];
for (const row of rows) {
  const payload = parse(row.payload_json);
  if (!payload) { skip("invalid payload"); continue; }
  const execution = payload.execution ?? {};
  if (execution.status !== "terminal" || typeof execution.endedAt !== "number") { skip("not ended"); continue; }
  if (execution.endedAt >= cutoff) { skip("ended recently"); continue; }
  if (typeof payload.cleanupCompletedAt !== "number") { skip("cleanup not completed"); continue; }
  if (payload.pauseReason === "sessions_yield") { skip("sessions_yield"); continue; }
  if (payload.delivery?.status === "pending" || payload.delivery?.status === "in_progress") { skip("delivery open"); continue; }
  if (payload.spawnMode === "session") { skip("session mode"); continue; }
  const childUpdatedAt = sessionUpdatedAt.get(row.child_session_key);
  if (childUpdatedAt !== undefined && childUpdatedAt >= cutoff) { skip("child session active"); continue; }
  if (unendedRequesters.has(row.child_session_key)) { skip("child has unended runs"); continue; }
  selected.push(row);
}
const payloadBytes = selected.reduce((sum, row) => sum + Buffer.byteLength(row.payload_json), 0);
line("plan", {
  apply: APPLY,
  olderThanDays: OLDER_THAN_DAYS,
  runs: rows.length,
  selected: selected.length,
  selectedPayloadMB: Math.round(payloadBytes / 1e5) / 10,
  remaining: rows.length - selected.length,
  childSessionGone: selected.filter((row) => !sessionUpdatedAt.has(row.child_session_key)).length,
  skipped: reasons,
});
if (!APPLY || selected.length === 0) process.exit(0);

if (!flag("allow-open-db")) {
  let holders = "";
  try { holders = execFileSync("lsof", ["-t", stateDbPath], { encoding: "utf8" }).trim(); } catch { holders = ""; }
  const others = holders.split("\n").filter((pid) => pid && Number(pid) !== process.pid);
  if (others.length > 0) {
    line("refused", { reason: "state database is open by other processes; stop the Gateway and workers first", pids: others });
    process.exit(3);
  }
}

// Export first; verify by reading the file back.
if (fs.existsSync(outPath)) { line("refused", { reason: "output exists", outPath }); process.exit(3); }
const body = selected.map((row) => JSON.stringify(row)).join("\n") + "\n";
fs.writeFileSync(outPath, zlib.gzipSync(body), { mode: 0o600 });
const readBack = zlib.gunzipSync(fs.readFileSync(outPath)).toString("utf8");
const ids = readBack.trim().split("\n").map((l) => JSON.parse(l).run_id);
if (readBack !== body || ids.length !== selected.length) { line("refused", { reason: "archive read-back mismatch" }); process.exit(4); }
const digest = createHash("sha256").update(body).digest("hex");
fs.writeFileSync(`${outPath}.sha256`, `${digest}  ${outPath} (uncompressed JSONL)\n`, { mode: 0o600 });
line("exported", { outPath, rows: ids.length, sha256: digest });

// Delete only rows that are still byte-identical to what was exported.
state.exec("PRAGMA busy_timeout = 10000");
const remove = state.prepare("DELETE FROM subagent_runs WHERE run_id = ? AND payload_json = ?");
let deleted = 0;
for (let offset = 0; offset < selected.length; offset += 200) {
  state.exec("BEGIN IMMEDIATE");
  try {
    for (const row of selected.slice(offset, offset + 200)) deleted += Number(remove.run(row.run_id, row.payload_json).changes);
    state.exec("COMMIT");
  } catch (error) {
    state.exec("ROLLBACK");
    throw error;
  }
}
const after = state.prepare("SELECT count(*) AS n FROM subagent_runs").get().n;
state.close();
line("done", { deleted, exported: ids.length, remaining: after });
