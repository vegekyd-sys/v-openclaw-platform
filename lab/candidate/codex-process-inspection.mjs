// Candidate check for codex-process-inspection-budget-v1: does registering a freshly spawned
// Codex app-server survive a busy Gateway main thread?
//
// V 2026-10-17 03:28: the first /vds message of a 21k-event session failed with "Cannot inspect
// Codex processes. Process inspection exceeded its deadline": while the app-server child was being
// registered (a few /proc reads with a 2 s deadline), the same turn's synchronous bounded-history
// read held the main thread for 2.57 s.
//
// Each trial calls the plugin's real createStdioTransport with a stub app-server (a shell script
// that ignores its arguments and sleeps), and, as soon as the child is spawned, blocks the main
// thread synchronously for BLOCK_MS: the registration's /proc reads resume only after the block,
// as on V. The trial passes when the transport is returned (child registered); it is then closed.
// The candidate's private state database copy has its Codex process registry emptied first, so no
// shared-VLab registration is read or reaped.

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const PLUGIN_DIST = "npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist";
const BLOCKS_MS = (process.env.BLOCKS_MS ?? "0,2600,5000").split(",").map(Number);
const TRIALS = Number(process.env.TRIALS ?? 3);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "codex-inspection-"));
{
  // the candidate's private state database is an online-backup copy; empty its Codex process
  // registry so the plugin's orphan reaper has nothing from shared VLab to read or reap
  const privateStateDb = path.join(process.env.OPENCLAW_STATE_DIR, "state", "openclaw.sqlite");
  assert(fs.existsSync(privateStateDb), `no private state database at ${privateStateDb}`);
  assert(!privateStateDb.startsWith(process.env.VLAB_SHARED_STATE_DIR ?? "\0"), "refusing to touch the shared state");
  const db = new DatabaseSync(privateStateDb);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("DELETE FROM plugin_state_entries WHERE plugin_id = 'codex' AND namespace = 'app-server-processes'").run();
  db.close();
}
const stub = path.join(scratch, "codex-stub.sh");
fs.writeFileSync(stub, "#!/bin/sh\nexec sleep 60\n", { mode: 0o755 });

const file = path.join(runtime, PLUGIN_DIST, "transport-stdio-CyPldczm.js");
const source = fs.readFileSync(file, "utf8");
const patched = source.includes("codex-process-inspection-budget-v1");
const transport = await import(pathToFileURL(file).href);
const createStdioTransport = transport.t;
const closeAndWait = transport.i;
assert.equal(typeof createStdioTransport, "function");

const busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const results = [];
for (const blockMs of BLOCKS_MS) {
  for (let trial = 0; trial < TRIALS; trial++) {
    const started = Date.now();
    let child;
    const spawned = [];
    try {
      child = await createStdioTransport({ command: stub, args: [] }, process.env, undefined, (spawnedChild) => {
        spawned.push(spawnedChild.pid);
        if (blockMs > 0) setTimeout(() => busy(blockMs), 1);
      });
      results.push({ blockMs, trial, ok: true, ms: Date.now() - started, pids: spawned });
    } catch (error) {
      results.push({ blockMs, trial, ok: false, ms: Date.now() - started, pids: spawned, error: String(error?.message ?? error).slice(0, 160), cause: error?.cause ? String(error.cause?.stack ?? error.cause).slice(0, 700) : undefined });
    } finally {
      if (child) await closeAndWait(child, { drainStdio: true }).catch(() => {});
    }
  }
}
await new Promise((resolve) => setTimeout(resolve, 1000));
const leftovers = results.flatMap((r) => r.pids ?? []).filter((pid) => fs.existsSync(`/proc/${pid}`));
for (const pid of leftovers) { try { process.kill(pid, "SIGKILL"); } catch {} }
fs.rmSync(scratch, { recursive: true, force: true });
const summary = {};
for (const r of results) {
  const s = (summary[r.blockMs] ??= { trials: 0, ok: 0, errors: [] });
  s.trials++; if (r.ok) s.ok++; else s.errors.push(r.error);
}
console.log(JSON.stringify({ patched, summary, results, leftoverStubs: leftovers.length }, null, 1));
process.exit(0);
