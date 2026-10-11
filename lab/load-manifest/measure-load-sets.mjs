// Measures which runtime files the Gateway process loads and which a Worker
// process loads, against the real 9.1 runtime in a VLab candidate. Output feeds
// release/load-manifest/ and docs/worker-roll-scope.md.
//
// Boots a private Gateway from the candidate runtime with
// `--import load-trace-hook.mjs` (Workers inherit it), keeps the plugin set of
// the shared config so plugin code and the core chunks it imports load as on V,
// but removes every channel account, cron and binding so nothing can reach a
// real user, and disables the plugins that attach to shared sidecars (V
// Browser broker, desktop handoff, xiaoai, respeaker, Night Shift Feishu).
// Then drives typical traffic:
//   worker turns (plain, exec, memory_search, read + sessions_list), /vds
//   (codex runtime, runs in the Gateway), /vcc (claude-cli, runs in the
//   Gateway; no Claude login here, so it fails after loading its harness),
//   a workboard card create + start, a sweep of read RPCs, a Worker roll.
// Prints {gateway, worker, other} file lists relative to the candidate runtime.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RUNTIME = process.env.VLAB_CANDIDATE_RUNTIME;
const DATA = process.env.VLAB_CANDIDATE_DATA;
const CONFIG = process.env.OPENCLAW_CONFIG_PATH;
const SHARED_STATE = process.env.VLAB_SHARED_STATE_DIR;
assert(RUNTIME && DATA && CONFIG && SHARED_STATE, "run through vlab.mjs candidate");

const HOOK = fileURLToPath(new URL("./load-trace-hook.mjs", import.meta.url));
const TRACE = path.join(DATA, "load-trace");
const SHARED_INSTANCE = path.dirname(SHARED_STATE);
const logPath = path.join(DATA, "gateway.log");
const started = Date.now();
const steps = [];
const step = (name, detail = {}) => {
  const entry = { name, atMs: Date.now() - started, ...detail };
  steps.push(entry);
  console.error(`[lm] ${JSON.stringify(entry)}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errText = (error) => String(error?.message ?? error).slice(0, 300);

// --- private configuration ----------------------------------------------
const SECRETS = path.join(SHARED_INSTANCE, "secrets.env");
const secret = (name) => {
  for (const line of readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const port = config.gateway.port;
assert(port && port !== 24993, "candidate config must use a private port");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
config.bindings = [];
const SIDECARS = ["v-browser-device", "v-desktop-handoff", "cua-computer", "v-browser-fill",
  "openclaw-plugin-xiaoai-cloud", "respeaker-agent-bridge", "nightshift-feishu"];
for (const id of SIDECARS) if (config.plugins.entries[id]) config.plugins.entries[id].enabled = false;
config.gateway.reload = { ...(config.gateway.reload ?? {}), mode: "off" };
// Codex is npm-managed; the candidate runtime carries V's generation of it.
const npmProjects = path.join(RUNTIME, "npm/projects");
const codexProject = existsSync(npmProjects)
  ? readdirSync(npmProjects).filter((d) => d.startsWith("openclaw-codex-")).sort((a, b) => Number(b.includes("g-b42d646e")) - Number(a.includes("g-b42d646e")))[0]
  : undefined;
if (codexProject) {
  config.plugins.load = { ...(config.plugins.load ?? {}), paths: [...(config.plugins.load?.paths ?? []), path.join(npmProjects, codexProject, "node_modules/@openclaw/codex")] };
}
// Never hand a copied OAuth login to a private process: refreshing it would
// invalidate the shared one (memory: candidate-stale-oauth-refresh).
const logins = [];
const findLogins = (dir, depth = 0) => {
  if (depth > 6 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findLogins(full, depth + 1);
    else if (entry.name === "auth.json" || entry.name === ".credentials.json") logins.push(full);
  }
};
findLogins(DATA);
assert.deepEqual(logins, [], "candidate data must not contain copied logins");
// Codex (/vcodex, /vds) and claude-cli (/vcc) turns run in the Gateway and
// build the same OpenClaw tools there (Codex: openClawCodingToolsFactory; claude-cli:
// MCP loopback). Neither can run here without copying a login, so a model on
// the embedded runtime stands in: its turns execute the OpenClaw tools inside
// the Gateway process.
const PROXY_MODEL = "deepseek/deepseek-v4-pro";
config.agents.defaults.models[PROXY_MODEL] = { ...(config.agents.defaults.models[PROXY_MODEL] ?? {}), agentRuntime: { id: "openclaw" } };
const workerEntry = config.plugins.entries["vlab-agent-worker-isolation"];
Object.assign(workerEntry.config, {
  minWorkers: 2, maxWorkers: 3, sessionsPerWorker: 3, warmSpareWorkers: 0, gatewayConfigPath: CONFIG,
});
const tmp = `${CONFIG}.lm-${process.pid}`;
writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
renameSync(tmp, CONFIG);
for (const dir of ["tmp", "cache", "home"]) mkdirSync(path.join(DATA, dir), { recursive: true });
// The plugin derives the Worker config at start, but only into an existing
// directory; seed it the way the derivation maps runtimes.
const workerConfigPath = workerEntry.config.workerConfigPath;
assert(!path.relative(path.dirname(CONFIG), workerConfigPath).startsWith(".."), "worker config escaped candidate state");
mkdirSync(path.dirname(workerConfigPath), { recursive: true });
writeFileSync(workerConfigPath, JSON.stringify(JSON.parse(JSON.stringify(config), (key, value) => {
  if (key === "agentRuntime" && value === "vlab-worker") return "openclaw";
  if (key === "agentRuntime" && value?.id === "vlab-worker") return { ...value, id: "openclaw" };
  return value;
}), null, 2), { mode: 0o600 });

// --- private Gateway ------------------------------------------------------
const log = createWriteStream(logPath);
const env = {
  ...process.env,
  HOME: path.join(DATA, "home"), TMPDIR: path.join(DATA, "tmp"), XDG_CACHE_HOME: path.join(DATA, "cache"),
  npm_config_cache: path.join(DATA, "cache/npm"), npm_config_prefix: path.join(DATA, "user-npm"),
  OPENCLAW_GATEWAY_PORT: String(port), LOAD_TRACE_DIR: TRACE,
};
for (const name of ["DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}
let gateway;
let gatewayExit = null;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gatewayExit = null;
  gateway = spawn(process.execPath, [
    "--max-old-space-size=8192", "--import", pathToFileURL(HOOK).href,
    path.join(RUNTIME, "openclaw/dist/index.js"), "gateway", "--port", String(port),
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  gateway.stdout.pipe(log, { end: false });
  gateway.stderr.pipe(log, { end: false });
  gateway.on("exit", (code, signal) => { gatewayExit = { code, signal }; });
}
startGateway();
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
const tryCall = async (method, params, timeoutMs) => {
  try {
    await call(method, params, timeoutMs);
    return "ok";
  } catch (error) {
    return `error: ${errText(error)}`;
  }
};

async function waitFor(label, fn, timeoutMs, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (gatewayExit) {
      if (gatewayStarts === 1 && /Restart OpenClaw so state migrations run/u.test(logText())) {
        step("gateway-restart-after-migration");
        startGateway();
        await delay(1_000);
        continue;
      }
      throw new Error(`Gateway exited during ${label}: ${JSON.stringify(gatewayExit)}`);
    }
    try {
      last = await fn();
      if (last) return last;
    } catch (error) { last = error; }
    await delay(intervalMs);
  }
  throw new Error(`${label} timed out; last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

let turn = 0;
async function runTurn(label, message, { model } = {}) {
  turn += 1;
  const sessionKey = `agent:makaron:explicit:lm-${Date.now()}-${turn}`;
  const result = { label };
  try {
    if (model) result.patch = await tryCall("sessions.patch", { key: sessionKey, model });
    const sent = await call("chat.send", {
      agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 240_000,
      idempotencyKey: `lm-${Date.now()}-${turn}`, message,
    }, 120_000);
    const waited = await call("agent.wait", { runId: sent?.runId, timeoutMs: 240_000 }, 260_000);
    result.status = waited?.status;
    if (waited?.error) result.error = errText(waited.error);
    const history = await call("chat.history", { agentId: "makaron", sessionKey, limit: 12 });
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    result.roles = messages.map((m) => m?.role).join(",");
    result.toolCalls = JSON.stringify(messages).match(/"(?:toolName|name)":"([a-z_]+)"/g)?.slice(0, 8) ?? [];
  } catch (error) {
    result.error = errText(error);
  }
  step(`turn:${label}`, result);
  return result;
}

const proxyWindow = { from: null, to: null };
let failure = null;
try {
  await waitFor("Gateway ready", async () => { await connect(); return (await call("health"))?.ok; }, 900_000, 3_000);
  step("gateway-ready");
  const ready = await waitFor("Workers ready", async () => {
    const s = await call("vlab.workers.status");
    return s.workers.filter((w) => w.ready && !w.retiring).length >= 2 ? s : null;
  }, 300_000);
  step("workers-ready", { generation: ready.generation ?? null, version: ready.workerIsolationVersion, codexProject: codexProject ?? null });

  await runTurn("worker-plain", "Reply with exactly: LM-PLAIN-END");
  await runTurn("worker-exec", "Use the exec tool to run `echo lm-exec-probe && uname -a`, then reply with the first word of its output and the line LM-EXEC-END.");
  await runTurn("worker-memory", "Call the memory_search tool with the query \"lighthouse history\" (do not skip it), then reply with the number of results and the line LM-MEM-END.");
  await runTurn("worker-read-sessions", "Use the read tool to read the first 5 lines of AGENTS.md in your workspace, then call sessions_list with limit 3, then reply LM-READ-END.");
  await runTurn("worker-web", "Use web_fetch on https://example.com and reply with the page title and LM-WEB-END.");

  // Codex runtime (/vds: Codex harness + DeepSeek) and claude-cli (/vcc) run
  // inside the Gateway, not in a Worker.
  await runTurn("vds-codex", "Use the exec tool to run `echo lm-vds-probe`, then reply LM-VDS-END.", { model: "deepseek/vds-deepseek-flash" });
  await runTurn("vcc-claude-cli", "Reply with exactly: LM-VCC-END", { model: "anthropic/claude-opus-5" });

  // Workboard: create a card and start it (dispatch runs it as an agent turn).
  let cardId = null;
  try {
    const created = await call("workboard.cards.create", { title: "load manifest probe", body: "Reply LM-CARD-END and finish.", agentId: "makaron" });
    cardId = created?.card?.id ?? null;
    step("workboard-create", { cardId });
  } catch (error) { step("workboard-create", { error: errText(error) }); }
  if (cardId) {
    step("workboard-start", { result: await tryCall("workboard.cards.start", { id: cardId }, 120_000) });
    await delay(45_000);
    step("workboard-list", { result: await tryCall("workboard.cards.list", {}) });
  }

  // Voice: the realtime client hands consult questions to the Gateway.
  const voiceKey = `agent:makaron:explicit:lm-voice-${Date.now()}`;
  step("voice-consult", { result: await tryCall("talk.client.toolCall", {
    sessionKey: voiceKey, callId: `lm-call-${Date.now()}`, name: "openclaw_agent_consult",
    args: { question: "Reply with exactly: LM-VOICE-END" },
  }, 240_000) });

  const sweep = {};
  for (const method of ["status", "sessions.list", "sessions.describe", "models.list", "agents.list", "skills.status",
    "config.get", "usage.status", "tools.catalog", "cron.list", "nodes.list", "talk.config", "workboard.boards.list",
    "workboard.cards.stats", "vlab.workers.status", "logs.tail", "channels.status", "doctor.memory.status"]) {
    sweep[method] = await tryCall(method, method === "sessions.list" ? { agentId: "makaron", limit: 5 } : {}, 30_000);
  }
  step("rpc-sweep", sweep);

  const rolled = await tryCall("vlab.workers.roll", { reason: "load-manifest" });
  step("roll", { rolled });
  await runTurn("after-roll", "Reply with exactly: LM-ROLL-END");
  await delay(5_000);

  // Last, so that what loads in this window is what the Gateway adds by
  // running the tools itself.
  proxyWindow.from = Date.now();
  await runTurn("gateway-tools-exec", "Use the exec tool to run `echo lm-gw-probe`, then reply LM-GW1-END.", { model: PROXY_MODEL });
  await runTurn("gateway-tools-memory", "Call memory_search with the query \"lighthouse history\", then use read on AGENTS.md (first 5 lines), then sessions_list with limit 3, then reply LM-GW2-END.", { model: PROXY_MODEL });
  await runTurn("gateway-tools-web", "Use web_fetch on https://example.com and reply with the title and LM-GW3-END.", { model: PROXY_MODEL });
  proxyWindow.to = Date.now();
  await delay(3_000);
} catch (error) {
  failure = error;
  step("failed", { error: errText(error) });
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => gateway.once("exit", resolve)), delay(60_000)]);
  if (!gatewayExit) gateway.kill("SIGKILL");
  await delay(3_000);
}

// --- collect -----------------------------------------------------------------
const runtimeReal = realpathSync(RUNTIME);
const dataReal = realpathSync(DATA);
const rel = (url) => {
  const file = url.startsWith("file:") ? fileURLToPath(url) : url;
  if (file.startsWith(`${runtimeReal}/`)) return file.slice(runtimeReal.length + 1);
  if (file.startsWith(`${dataReal}/`)) return `@data/${file.slice(dataReal.length + 1)}`;
  return `@abs${file}`;
};
const sets = { gateway: new Set(), worker: new Set(), other: new Set() };
const processes = [];
const proxyFiles = new Set();
for (const name of existsSync(TRACE) ? readdirSync(TRACE) : []) {
  const role = name.split("-")[0];
  const lines = readFileSync(path.join(TRACE, name), "utf8").split("\n").filter(Boolean);
  const argv = lines[0]?.startsWith("#argv ") ? lines[0].slice(6) : "";
  const entries = lines.filter((line) => !line.startsWith("#")).map((line) => [Number(line.slice(0, line.indexOf(" "))), rel(line.slice(line.indexOf(" ") + 1))]);
  const files = entries.map(([, file]) => file);
  if (role === "gateway" && proxyWindow.from) {
    for (const [at, file] of entries) if (at >= proxyWindow.from && at <= proxyWindow.to + 3_000) proxyFiles.add(file);
  }
  processes.push({ name, role, argv: argv.replaceAll(runtimeReal, "<runtime>").replaceAll(DATA, "<data>"), files: files.length });
  for (const file of files) sets[role in sets ? role : "other"].add(file);
}
const out = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v].sort()]));

// --- import graph -------------------------------------------------------------
// Relative import specifiers of every runtime JS file. From the measured
// Gateway set, follow static and dynamic edges: what the Gateway could still
// load on a path this run did not exercise. Static edges of a loaded module
// must already be loaded; their misses check the hook itself.
const graphRoots = ["openclaw/dist", "production-worker"];
const SPEC = /\b(import\s*\(\s*|from\s*|import\s+)(["'])(\.{1,2}\/[^"'\n]+)\2/gu;
const edges = new Map();
const walk = (dir) => {
  for (const entry of readdirSync(path.join(runtimeReal, dir), { withFileTypes: true })) {
    const relPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(relPath); continue; }
    if (!/\.(?:m?js|cjs)$/u.test(entry.name)) continue;
    const text = readFileSync(path.join(runtimeReal, relPath), "utf8");
    const list = [];
    for (const m of text.matchAll(SPEC)) {
      list.push({ to: path.posix.normalize(path.posix.join(path.posix.dirname(relPath), m[3])), dynamic: m[1].startsWith("import(") || /^import\s*\(/u.test(m[1]) });
    }
    edges.set(relPath, list);
  }
};
for (const root of graphRoots) if (existsSync(path.join(runtimeReal, root))) walk(root);
const gatewayLoaded = new Set(out.gateway);
const reach = new Set(out.gateway.filter((f) => edges.has(f)));
const queue = [...reach];
const staticMisses = new Set();
while (queue.length) {
  const from = queue.pop();
  for (const { to, dynamic } of edges.get(from) ?? []) {
    if (!edges.has(to)) continue;
    if (!dynamic && gatewayLoaded.has(from) && !gatewayLoaded.has(to)) staticMisses.add(`${from} -> ${to}`);
    if (!reach.has(to)) { reach.add(to); queue.push(to); }
  }
}
const gatewayReachable = [...reach].filter((f) => !gatewayLoaded.has(f)).sort();
const workerOnly = out.worker.filter((f) => /^(openclaw\/dist|production-worker)\//u.test(f) && !gatewayLoaded.has(f));
const graph = {
  files: edges.size,
  gatewayReachable,
  staticMisses: [...staticMisses].slice(0, 50),
  staticMissCount: staticMisses.size,
  workerOnlyMeasured: workerOnly.length,
  workerOnlyUnreachable: workerOnly.filter((f) => !reach.has(f)).length,
};
const pluginErrors = logText().split("\n").filter((line) => /plugin.*(fail|error)|failed to load/i.test(line)).slice(0, 20)
  .map((line) => line.slice(0, 240));
const logTail = failure ? logText().split("\n").slice(-30).map((line) => line.replace(/\x1b\[[0-9;]*m/gu, "").slice(0, 300)) : undefined;
console.log(JSON.stringify({ ok: !failure, steps, processes, pluginErrors, logTail, counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), graph,
  gatewayToolsProxy: { model: PROXY_MODEL, window: proxyWindow, files: [...proxyFiles].sort() }, sets: out }));
if (failure) process.exitCode = 1;
