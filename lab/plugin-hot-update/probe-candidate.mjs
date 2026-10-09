// Candidate: can an external plugin's code be updated on 9.1 without a Gateway
// restart? Boots a private Gateway from the candidate runtime (own port, own
// state, no channels) with two probe plugins and measures three ways:
//   A. plain plugin: edit its files, trigger 9.1's plugin reload (plugins.* key)
//   B. shim plugin: point plugins.entries.hotprobe-shim.config.release at a new
//      releases/<rev>/ directory, plugin reload re-runs register()
//   C. shim plugin: hotprobe.shim.hotswap, no reload at all
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, createWriteStream, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RUNTIME = process.env.VLAB_CANDIDATE_RUNTIME;
const DATA = process.env.VLAB_CANDIDATE_DATA;
const CONFIG = process.env.OPENCLAW_CONFIG_PATH;
const SHARED_STATE = process.env.VLAB_SHARED_STATE_DIR;
assert(RUNTIME && DATA && CONFIG && SHARED_STATE, "run through vlab.mjs candidate");
const SHARED_INSTANCE = path.dirname(SHARED_STATE);
const STATE = path.dirname(CONFIG);
const logPath = path.join(DATA, "gateway.log");
const started = Date.now();
const evidence = { steps: [] };
const step = (name, detail = {}) => {
  const entry = { name, atMs: Date.now() - started, ...detail };
  evidence.steps.push(entry);
  console.error(`[probe] ${JSON.stringify(entry)}`);
  return entry;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- probe plugins in a private, writable directory ----------------------
const pluginRoot = path.join(DATA, "probe-plugins");
cpSync(path.resolve("lab/plugin-hot-update/probe"), pluginRoot, { recursive: true });
const plainDir = path.join(pluginRoot, "plain");
const shimDir = path.join(pluginRoot, "shim");
const writeRelease = (rev) => {
  const dir = path.join(shimDir, "releases", rev);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "helper.mjs"), `export const helper = () => "h-${rev}";\n`);
  writeFileSync(path.join(dir, "impl.mjs"), `import { helper } from "./helper.mjs";\nexport const version = () => \`${rev}:\${helper()}\`;\n`);
};

// --- minimal private configuration (worker-generations recipe) ------------
const SECRETS = path.join(SHARED_INSTANCE, "secrets.env");
const secret = (name) => {
  for (const line of readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  throw new Error(`${name} missing from shared secrets.env`);
};
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const port = config.gateway.port;
assert(port && port !== 24993, "candidate config must use a private port");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
config.bindings = [];
const keep = new Set(["vlab-agent-worker-isolation", "deepseek"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
config.plugins.entries["hotprobe-plain"] = { enabled: true, config: { rev: 1 } };
config.plugins.entries["hotprobe-shim"] = { enabled: true, config: { release: "r1" } };
config.plugins.allow = [...(Array.isArray(config.plugins.allow) ? config.plugins.allow.filter((id) => keep.has(id)) : []), "hotprobe-plain", "hotprobe-shim"];
config.plugins.load = { ...(config.plugins.load ?? {}), paths: [
  ...(config.plugins.load?.paths ?? []), plainDir, shimDir,
] };
for (const node of [config.agents.defaults, config.agents.entries?.makaron]) {
  for (const [key, entry] of Object.entries(node?.models ?? {})) {
    const id = typeof entry?.agentRuntime === "string" ? entry.agentRuntime : entry?.agentRuntime?.id;
    if (id && id !== "vlab-worker" && id !== "openclaw") delete node.models[key];
  }
}
config.agents.entries = { makaron: config.agents.entries.makaron };
config.gateway.reload = { ...(config.gateway.reload ?? {}), mode: "hybrid" };
Object.assign(config.plugins.entries["vlab-agent-worker-isolation"].config, {
  minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: CONFIG,
});
const writeConfig = (next) => {
  const tmp = `${CONFIG}.probe-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(tmp, CONFIG);
};
writeConfig(config);
for (const dir of ["tmp", "cache"]) mkdirSync(path.join(DATA, dir), { recursive: true });

// --- private Gateway -------------------------------------------------------
const log = createWriteStream(logPath);
const env = {
  ...process.env,
  DEEPSEEK_API_KEY: secret("DEEPSEEK_API_KEY"),
  HOME: DATA, TMPDIR: path.join(DATA, "tmp"), XDG_CACHE_HOME: path.join(DATA, "cache"),
  npm_config_cache: path.join(DATA, "cache/npm"), npm_config_prefix: path.join(DATA, "user-npm"),
  OPENCLAW_GATEWAY_PORT: String(port),
};
let gateway; let gatewayExit = null; let starts = 0;
function startGateway() {
  starts += 1; gatewayExit = null;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", path.join(RUNTIME, "openclaw/dist/index.js"), "gateway", "--port", String(port)],
    { env, stdio: ["ignore", "pipe", "pipe"] });
  gateway.stdout.pipe(log, { end: false });
  gateway.stderr.pipe(log, { end: false });
  gateway.on("exit", (code, signal) => { gatewayExit = { code, signal }; });
}
const logText = () => readFileSync(logPath, "utf8");
startGateway();

const { GatewayClient } = await import(pathToFileURL(path.join(RUNTIME, "openclaw/dist/plugin-sdk/gateway-runtime.js")).href);
let client;
async function connect() {
  client?.stop();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 20_000);
    client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: config.gateway.auth.token, deviceIdentity: null,
      clientName: "cli", mode: "cli", scopes: ["operator.read", "operator.write", "operator.admin"],
      onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
    client.start();
  });
}
const call = (method, params = {}) => client.request(method, params, { timeoutMs: 60_000 });
async function waitFor(label, fn, timeoutMs, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs; let last;
  while (Date.now() < deadline) {
    if (gatewayExit) {
      if (starts === 1 && /Restart OpenClaw so state migrations run/u.test(logText())) { step("restart-after-migration"); startGateway(); await delay(1_000); continue; }
      throw new Error(`Gateway exited during ${label}: ${JSON.stringify(gatewayExit)}`);
    }
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await delay(intervalMs);
  }
  throw new Error(`${label} timed out; last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}
const countLog = (re) => (logText().match(new RegExp(re, "gu")) ?? []).length;
async function pluginReload(label, mutate) {
  const before = countLog("config hot reload applied");
  const next = JSON.parse(readFileSync(CONFIG, "utf8"));
  mutate(next);
  const t0 = Date.now();
  writeConfig(next);
  await waitFor(`${label} reload applied`, () => countLog("config hot reload applied") > before, 600_000, 250);
  await connect().catch(() => {});
  const reloadMs = Date.now() - t0;
  const tail = logText().split("\n").slice(-200).filter((l) => /\[reload\]|plugin reload|restarting|stopping|Worker Isolation|rolled generation/iu.test(l)).slice(-12);
  return { reloadMs, tail };
}

let failure = null;
try {
  await waitFor("Gateway ready", async () => { await connect(); return (await call("health"))?.ok; }, 600_000, 3_000);
  const plain0 = await call("hotprobe.plain.version");
  const shim0 = await call("hotprobe.shim.version");
  step("loaded", { plain: plain0, shim: shim0 });
  assert.equal(plain0.index, "v1"); assert.equal(shim0.release, "r1");

  // A. plain: edit the files in place, then 9.1's plugin reload.
  writeFileSync(path.join(plainDir, "lib.mjs"), `export const LIB_VERSION = "v2";\n`);
  writeFileSync(path.join(plainDir, "index.mjs"), readFileSync(path.join(plainDir, "index.mjs"), "utf8").replace('INDEX_VERSION = "v1"', 'INDEX_VERSION = "v2"'));
  const a = await pluginReload("A", (c) => { c.plugins.entries["hotprobe-plain"].config.rev = 2; });
  const plain1 = await call("hotprobe.plain.version");
  step("A:plain-after-plugin-reload", { ...a, plain: plain1, newCode: plain1.index === "v2" && plain1.lib === "v2", reRegistered: plain1.registeredAt !== plain0.registeredAt, rev: plain1.rev });

  // B. shim: a new release directory selected by config, plugin reload.
  writeRelease("r2");
  const b = await pluginReload("B", (c) => { c.plugins.entries["hotprobe-shim"].config.release = "r2"; });
  const shim1 = await call("hotprobe.shim.version");
  step("B:shim-after-release-config", { ...b, shim: shim1, newCode: shim1.impl === "r2:h-r2" });

  // C. shim: swap in place, no reload.
  writeRelease("r3");
  const reloadsBefore = countLog("config hot reload applied");
  const t0 = Date.now();
  const swapped = await call("hotprobe.shim.hotswap", { release: "r3" });
  const shim2 = await call("hotprobe.shim.version");
  step("C:shim-hotswap", { swapMs: Date.now() - t0, swapped, shim: shim2, newCode: shim2.impl === "r3:h-r3", reloadsDuring: countLog("config hot reload applied") - reloadsBefore });
  // Also: re-importing an unchanged path returns the cached module (the reason in-place edits do not work).
  writeFileSync(path.join(shimDir, "releases", "r3", "helper.mjs"), `export const helper = () => "h-r3-edited";\n`);
  await call("hotprobe.shim.hotswap", { release: "r3" });
  const shim3 = await call("hotprobe.shim.version");
  step("C:same-path-edit", { shim: shim3, editedCodeVisible: shim3.impl.includes("edited") });
} catch (error) {
  failure = error;
  step("failed", { error: error.message });
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => gateway.once("exit", resolve)), delay(60_000)]);
  if (!gatewayExit) gateway.kill("SIGKILL");
  if (failure) evidence.rawTail = logText().split("\n").slice(-40);
  console.log(JSON.stringify(evidence, null, 1));
}
if (failure) throw failure;
