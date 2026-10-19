// One arm of the big-session history A/B: drives the real chat.history and sessions.branches.list
// handlers of one dist directory against the private big-session database, in a fresh process.
// Usage: node big-session-history-arm.mjs <dist> <out-dir> <name>=<session-key>[,...] <op>[,<op>...]
//   <name>/history:<limit>   chat.history {sessionKey, limit}     (Control UI sends 1000, task view 800)
//   <name>/branches          sessions.branches.list {sessionKey}
//   <name>/open:<limit>      both at once, as the Control UI does when a session is opened
// Prints one JSON line per op: wall time, longest event-loop block, RSS/heap, reply digest.
// Replies are written to <out-dir>/<n>-<op>.json for the field-by-field comparison.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const [dist, outDir, sessionsArg, opsArg] = process.argv.slice(2);
assert(dist && outDir && sessionsArg && opsArg);
const sessionKeys = Object.fromEntries(sessionsArg.split(",").map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
fs.mkdirSync(outDir, { recursive: true });
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const load = (name) => import(pathToFileURL(path.join(dist, name)).href);
const { t: chatHandlers } = await load("chat-D3QlhTHk.js");
const { sessionRewindHandlers } = await load("sessions-rewind-Cp7gVVQ3.js");
assert.equal(typeof chatHandlers["chat.history"], "function");
assert.equal(typeof sessionRewindHandlers["sessions.branches.list"], "function");

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const context = {
  getRuntimeConfig: () => cfg,
  logGateway: quiet,
  chatAbortControllers: new Map(),
  workerSessionPlacementService: { getMany: () => new Map(), getPlacementMoves: () => new Map(), get: () => undefined },
};
const client = { connect: { scopes: ["operator.admin"] } };
async function call(handler, params) {
  let response;
  await handler({ params, client, context, req: { id: "candidate" }, respond: (ok, payload, error) => { response = { ok, payload, error: error ?? null }; } });
  assert(response, "handler responded");
  return response;
}
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

async function measure(run) {
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  let last = performance.now(), gap = 0;
  const timer = setInterval(() => { const now = performance.now(); gap = Math.max(gap, now - last); last = now; }, 2);
  histogram.enable();
  const started = performance.now();
  const value = await run();
  const ms = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 20));
  histogram.disable();
  clearInterval(timer);
  return { value, ms: Math.round(ms), blockMs: Math.round(Math.max(gap, histogram.max / 1e6)) };
}

let index = 0;
for (const op of opsArg.split(",")) {
  const [name, rest] = op.split("/");
  const sessionKey = sessionKeys[name];
  assert(sessionKey, `unknown session ${name}`);
  const [kind, arg] = rest.split(":");
  const limit = Number(arg ?? 1000);
  const history = () => call(chatHandlers["chat.history"], { sessionKey, limit });
  const branches = () => call(sessionRewindHandlers["sessions.branches.list"], { sessionKey });
  const run = kind === "history" ? async () => ({ history: await history() })
    : kind === "branches" ? async () => ({ branches: await branches() })
    : kind === "open" ? async () => { const [h, b] = await Promise.all([history(), branches()]); return { history: h, branches: b }; }
    : assert.fail(`unknown op ${op}`);
  const result = await measure(run);
  const file = path.join(outDir, `${index++}-${op.replace(/[:/]/gu, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(result.value));
  const memory = process.memoryUsage();
  const h = result.value.history, b = result.value.branches;
  console.log(JSON.stringify({
    op, ms: result.ms, blockMs: result.blockMs,
    maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024), heapMb: Math.round(memory.heapUsed / 1048576),
    ...h ? { historyOk: h.ok, historyError: h.error?.message ?? null, messages: h.payload?.messages?.length, totalMessages: h.payload?.totalMessages, hasMore: h.payload?.hasMore, nextOffset: h.payload?.nextOffset, historyBytes: Buffer.byteLength(JSON.stringify(h)), historyDigest: digest(h) } : {},
    ...b ? { branchesOk: b.ok, branchCount: b.payload?.branches?.length, branchesDigest: digest(b) } : {},
    file,
  }));
}
process.exit(0);
