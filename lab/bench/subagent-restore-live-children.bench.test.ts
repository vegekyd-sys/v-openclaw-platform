// V-sized restore orphan check, old exact read vs column prefetch. Runs inside an openclaw-versa checkout of
// versa/port-subagent-restore-narrow-20261107: copy to src/agents/subagents/registry/ and run
//   BENCH_N=15495 node node_modules/vitest/vitest.mjs run --config test/vitest/vitest.agents-support.config.ts <file>
// (Node 22.23.1). 2026-11-07 on an M-series Mac: exact 20,677 ms, narrow 668 ms, 15,495/15,495 kept by both.
import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { upsertSessionEntryCore } from "../../../config/sessions/session-accessor.js";
import { closeOpenClawAgentDatabasesForTest, openOpenClawAgentDatabase } from "../../../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest } from "../../../state/openclaw-state-db.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { listLiveSubagentChildSessionKeys, resolveSubagentRunOrphanReason } from "./subagent-session-reconciliation.js";

const tempDirs = useAutoCleanupTempDirTracker(afterAll);
const N = Number(process.env.BENCH_N ?? 15_495);
const keys: string[] = [];

async function seed() {
  vi.stubEnv("OPENCLAW_STATE_DIR", tempDirs.make("openclaw-restore-bench-"));
  const tmpl = "agent:main:subagent:workboard-nightshift-template";
  const pad = "补".repeat(Math.floor(76 * 1024 / 3));
  await upsertSessionEntryCore({ agentId: "main", sessionKey: tmpl }, {
    sessionId: "sid-template", updatedAt: Date.now(), label: "label-template", status: "done",
    systemPromptReport: { padding: pad } as never,
  });
  const db = openOpenClawAgentDatabase({ agentId: "main" }).db;
  const row = db.prepare("select * from session_nodes where session_key = ?").get(tmpl) as Record<string, unknown>;
  const cols = Object.keys(row);
  const ins = db.prepare(`insert into session_nodes (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map(() => "?").join(",")})`);
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) {
    const key = `agent:main:subagent:workboard-nightshift-${randomUUID()}`;
    const sid = randomUUID();
    const label = `nightshift-${randomUUID().slice(0, 8)}`;
    const json = String(row.entry_json).replaceAll("sid-template", sid).replaceAll(tmpl, key).replaceAll("label-template", label);
    ins.run(...cols.map((c) => (c === "session_key" ? key : c === "current_session_id" ? sid : c === "entry_json" ? json : c === "label" ? label : (row[c] as never))));
    keys.push(key);
  }
  db.exec("COMMIT");
  // V: every Night Shift child row is validated (entry_valid = 1); direct inserts start unvalidated
  db.exec("UPDATE session_nodes SET entry_valid = 1 WHERE session_key LIKE 'agent:main:subagent:workboard-nightshift-%'");
}

afterAll(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
  vi.unstubAllEnvs();
});

it("times the restore orphan check at V's size", async () => {
  await seed();
  const now = Date.now();
  const runs: SubagentRunRecord[] = keys.map((childSessionKey, i) => ({
    runId: `run-${i}`, childSessionKey, requesterSessionKey: "agent:main:main", requesterDisplayKey: "main",
    task: "t", cleanup: "keep", createdAt: now - 3_600_000,
    execution: { status: "terminal", startedAt: now - 3_600_000, endedAt: now - 3_000_000 },
  }));
  const db = openOpenClawAgentDatabase({ agentId: "main" }).db;
  console.log("rows", JSON.stringify(db.prepare("select count(*) n, sum(entry_valid=1) v from session_nodes").get()));
  console.log("reason0", resolveSubagentRunOrphanReason({ entry: runs[0], includeStaleUnended: true, now }), "tmplReason", resolveSubagentRunOrphanReason({ entry: { ...runs[0], childSessionKey: "agent:main:subagent:workboard-nightshift-template" }, includeStaleUnended: true, now }));
  let t = performance.now();
  const live = listLiveSubagentChildSessionKeys(runs);
  let fast = 0;
  for (const entry of runs) if (resolveSubagentRunOrphanReason({ entry, includeStaleUnended: true, now, liveChildSessionKeys: live }) === null) fast++;
  const narrowMs = performance.now() - t;
  t = performance.now();
  let exact = 0;
  for (const entry of runs) if (resolveSubagentRunOrphanReason({ entry, includeStaleUnended: true, now }) === null) exact++;
  const exactMs = performance.now() - t;
  console.log(JSON.stringify({ n: runs.length, exactMs: Math.round(exactMs), narrowMs: Math.round(narrowMs), exactKept: exact, narrowKept: fast }));
  expect(fast).toBe(exact);
}, 600_000);
