// Candidate acceptance for worker-generations.1 against the real 9.1 runtime.
//
// Boots a private Gateway from the candidate runtime (own port, own state, every
// channel and outbound plugin disabled), then, while a real model turn is
// streaming through a Worker:
//   1. rewrites a plugins.* key, which on 9.1 takes the plugin-reload path that
//      killed V's pool on 2026-09-20 and 2026-09-23;
//   2. calls vlab.workers.roll.
// Each time the in-flight turn must finish with a real reply, a new turn must
// succeed on the next generation, and the old generation must drain to zero.
// Run with no release files (V's 0.2.11) as the control: it must fail at the
// first reload, otherwise this test proves nothing.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RUNTIME = process.env.VLAB_CANDIDATE_RUNTIME;
const DATA = process.env.VLAB_CANDIDATE_DATA;
const CONFIG = process.env.OPENCLAW_CONFIG_PATH;
const SHARED_STATE = process.env.VLAB_SHARED_STATE_DIR;
const MODE = process.env.WG_MODE ?? "candidate"; // "candidate" | "control"
assert(RUNTIME && DATA && CONFIG && SHARED_STATE, "run through vlab.mjs candidate");

const SHARED_INSTANCE = path.dirname(SHARED_STATE);
const STATE = path.dirname(CONFIG);
const logPath = path.join(DATA, "gateway.log");
const started = Date.now();
const evidence = { mode: MODE, steps: [] };
const step = (name, detail = {}) => {
  const entry = { name, atMs: Date.now() - started, ...detail };
  evidence.steps.push(entry);
  console.error(`[wg] ${JSON.stringify(entry)}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- private configuration ----------------------------------------------
const OUTBOUND_PLUGINS = [
  "feishu", "openclaw-qqbot", "wecom-openclaw-plugin", "dingtalk-connector",
  "msteams", "nightshift-feishu", "openclaw-plugin-xiaoai-cloud",
  "respeaker-agent-bridge", "v-desktop-handoff", "cua-computer",
  "v-browser-device", "landing-chat", "workboard", "openclaw-deck",
];
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const port = config.gateway.port;
assert(port && port !== 24993, "candidate config must use a private port");
for (const channel of Object.values(config.channels ?? {})) {
  if (channel && typeof channel === "object") channel.enabled = false;
}
for (const id of OUTBOUND_PLUGINS) {
  if (config.plugins?.entries?.[id]) config.plugins.entries[id].enabled = false;
}
config.cron = { ...(config.cron ?? {}), enabled: false };
config.gateway.reload = { ...(config.gateway.reload ?? {}), mode: "hybrid" };
const workerEntry = config.plugins.entries["vlab-agent-worker-isolation"];
Object.assign(workerEntry.config, {
  minWorkers: 2, maxWorkers: 4, sessionsPerWorker: 2, warmSpareWorkers: 0,
});
config.plugins.entries["memory-core"] ??= { enabled: true };
config.plugins.entries["memory-core"].config ??= {};
config.plugins.entries["memory-core"].config.dreaming ??= {};
config.plugins.entries["memory-core"].config.dreaming.enabled = false;

// The Worker reads its own config; the candidate snapshot does not carry it.
const workerConfigPath = workerEntry.config.workerConfigPath;
const sharedWorkerConfig = path.join(SHARED_STATE, path.relative(STATE, workerConfigPath));
assert(existsSync(sharedWorkerConfig), `shared worker config missing: ${sharedWorkerConfig}`);
let workerText = readFileSync(sharedWorkerConfig, "utf8");
workerText = workerText
  .replaceAll(path.join(SHARED_INSTANCE, "runtime"), RUNTIME)
  .replaceAll(SHARED_STATE, STATE)
  .replaceAll(path.join(SHARED_INSTANCE, "workspace"), process.env.OPENCLAW_WORKSPACE_DIR ?? path.join(DATA, "workspace"));
// Read-only plugin sources may stay shared (the main candidate config uses the
// same ones); nothing writable may.
const sharedRefs = [...new Set(workerText.match(new RegExp(`${SHARED_INSTANCE.replaceAll("/", "\\/")}/[^/"]+`, "g")) ?? [])];
step("worker-config-shared-refs", { sharedRefs });
for (const ref of sharedRefs) {
  assert(!/\/(state|workspace|runtime|tmp|cache)$/.test(ref), `worker config still writes into the shared instance: ${ref}`);
}
const workerConfig = JSON.parse(workerText);
for (const channel of Object.values(workerConfig.channels ?? {})) {
  if (channel && typeof channel === "object") channel.enabled = false;
}
for (const id of OUTBOUND_PLUGINS) {
  if (workerConfig.plugins?.entries?.[id]) workerConfig.plugins.entries[id].enabled = false;
}
mkdirSync(path.dirname(workerConfigPath), { recursive: true });
writeFileSync(workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });

const writeConfig = (next) => {
  const tmp = `${CONFIG}.wg-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(tmp, CONFIG);
};
writeConfig(config);
for (const dir of ["tmp", "cache"]) mkdirSync(path.join(DATA, dir), { recursive: true });

// --- private Gateway ------------------------------------------------------
const log = createWriteStream(logPath);
const gateway = spawn(process.execPath, [
  "--max-old-space-size=8192", path.join(RUNTIME, "openclaw/dist/index.js"), "gateway", "--port", String(port),
], {
  env: {
    ...process.env,
    HOME: DATA, TMPDIR: path.join(DATA, "tmp"), XDG_CACHE_HOME: path.join(DATA, "cache"),
    OPENCLAW_GATEWAY_PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
gateway.stdout.pipe(log);
gateway.stderr.pipe(log);
let gatewayExit = null;
gateway.on("exit", (code, signal) => { gatewayExit = { code, signal }; });
const logText = () => readFileSync(logPath, "utf8");

const { GatewayClient } = await import(pathToFileURL(path.join(RUNTIME, "openclaw/dist/plugin-sdk/gateway-runtime.js")).href);
let client;
async function connect() {
  client?.stop();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Gateway connect deadline")), 20_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token: config.gateway.auth.token, deviceIdentity: null,
      clientName: "cli", mode: "cli", scopes: ["operator.read", "operator.write", "operator.admin"],
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: (error) => { clearTimeout(timer); reject(error); },
    });
    client.start();
  });
}
const call = (method, params = {}, timeoutMs = 60_000) => client.request(method, params, { timeoutMs });

async function waitFor(label, fn, timeoutMs, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (gatewayExit) throw new Error(`Gateway exited during ${label}: ${JSON.stringify(gatewayExit)}`);
    try {
      last = await fn();
      if (last) return last;
    } catch (error) { last = error; }
    await delay(intervalMs);
  }
  throw new Error(`${label} timed out; last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

const status = () => call("vlab.workers.status");
const liveWorkers = (s) => s.workers.filter((worker) => worker.ready && !worker.retiring).length;
const activeIn = (s) => s.workers.reduce((sum, worker) => sum + worker.activeCount, 0);

let turn = 0;
async function startTurn(label, words) {
  turn += 1;
  const sessionKey = `agent:makaron:explicit:wg-${MODE}-${Date.now()}-${turn}`;
  const sent = await call("chat.send", {
    agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 300_000,
    idempotencyKey: `wg-${MODE}-${Date.now()}-${turn}`,
    message: words
      ? `Write an English essay of about ${words} words on the history of lighthouses. Plain prose, no tools, no headings. End with the exact line WG-${turn}-END.`
      : `Reply with exactly: WG-${turn}-END`,
  }, 120_000);
  step(`${label}:sent`, { sessionKey, runId: sent?.runId });
  return { label, sessionKey, runId: sent?.runId, marker: `WG-${turn}-END` };
}
async function finishTurn(t) {
  const waited = await call("agent.wait", { runId: t.runId, timeoutMs: 280_000 }, 300_000);
  const history = await call("chat.history", { agentId: "makaron", sessionKey: t.sessionKey, limit: 6 });
  const text = JSON.stringify(history?.messages ?? history ?? "");
  const ok = text.includes(t.marker);
  step(`${t.label}:finished`, { status: waited?.status, error: waited?.error, replyHasMarker: ok, chars: text.length });
  return ok;
}
async function waitForActive(label) {
  return await waitFor(`${label} active in a Worker`, async () => activeIn(await status()) > 0, 60_000, 250);
}

let failure = null;
try {
  await waitFor("Gateway ready", async () => { await connect(); return (await call("health"))?.ok; }, 600_000, 3_000);
  const first = await waitFor("Workers ready", async () => {
    const s = await status();
    return liveWorkers(s) >= 2 ? s : null;
  }, 300_000);
  step("ready", { generation: first.generation ?? null, workers: liveWorkers(first), version: first.workerIsolationVersion });

  assert.ok(await finishTurn(await startTurn("warmup")), "warm-up turn must succeed");

  // --- 1. config hot reload during a streaming turn -------------------------
  const r1 = await startTurn("reload-inflight", 600);
  await waitForActive("reload-inflight");
  const before = await status();
  const next = JSON.parse(readFileSync(CONFIG, "utf8"));
  next.plugins.entries["memory-core"].config.dreaming.enabled = true;
  writeConfig(next);
  step("config-written", { key: "plugins.entries.memory-core.config.dreaming.enabled", generationBefore: before.generation ?? null });
  await waitFor("plugin reload applied", async () => /config hot reload applied \(plugins/.test(logText()), 600_000);
  step("reload-applied", { pluginReloadLogged: /before plugin reload/.test(logText()) });
  await connect().catch(() => {});
  assert.ok(await finishTurn(r1), "the turn admitted before the reload must finish");
  const r2 = await startTurn("after-reload");
  assert.ok(await finishTurn(r2), "a new turn after the reload must succeed");
  const afterReload = await status();
  step("after-reload-status", { generation: afterReload.generation ?? null, workers: liveWorkers(afterReload), predecessor: afterReload.predecessor ?? null });
  assert.ok((afterReload.generation ?? 1) > (before.generation ?? 1), "a new Worker generation is serving");
  await waitFor("old generation drained", async () => (await status()).predecessor === null, 300_000);
  step("reload-drained");

  // --- 2. operator roll during a streaming turn ------------------------------
  const r3 = await startTurn("roll-inflight", 600);
  await waitForActive("roll-inflight");
  const rolled = await call("vlab.workers.roll", { reason: "candidate" });
  step("rolled", rolled);
  assert.ok(await finishTurn(r3), "the turn admitted before the roll must finish");
  assert.ok(await finishTurn(await startTurn("after-roll")), "a new turn after the roll must succeed");
  await waitFor("rolled generation drained", async () => (await status()).predecessor === null, 300_000);
  const final = await status();
  step("final", { generation: final.generation, workers: liveWorkers(final) });

  const closing = (logText().match(/worker pool is closing/g) ?? []).length;
  step("log-check", { poolClosingErrors: closing });
  assert.equal(closing, 0, "no request may hit a closing pool");
} catch (error) {
  failure = error;
  step("failed", { error: error.message });
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => gateway.once("exit", resolve)), delay(60_000)]);
  if (!gatewayExit) gateway.kill("SIGKILL");
  const tail = logText().split("\n").filter((line) =>
    /vlab-worker-pool|Worker Isolation|reload|worker pool|generation|Worker Agent request failed/i.test(line)).slice(-60);
  evidence.logTail = tail;
  if (failure) evidence.rawTail = logText().split("\n").slice(-40);
  evidence.ok = !failure;
  console.log(JSON.stringify(evidence, null, 1));
}
if (MODE === "control") {
  // The control must hit the fault: V's 0.2.11 cannot survive a plugin reload.
  assert.ok(failure, "control run passed: the test does not trigger the reload fault");
} else if (failure) {
  throw failure;
}
