// Candidate: the Worker config is derived from the Gateway config.
//
// A. Static, on the real shared-VLab Gateway config (read-only, in memory):
//    the derived Worker config passes validation, allows every model the
//    Gateway allows and keeps no Gateway-only runtime id.
// B. Real boot: a private Gateway starts with a deliberately stale Worker
//    config (the shared copy minus one Gateway-allowed model). The patched
//    plugin must rewrite it at register(), a real Worker must boot from it,
//    and a real DeepSeek turn overriding to that model must run in the Worker.
//    WORKER_CONFIG_EXPECT=stale runs the unpatched runtime and must reproduce
//    the production symptom ("Model override ... is not allowed").
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedConfigPath = process.env.VLAB_SHARED_CONFIG_PATH;
const sharedStateDir = process.env.VLAB_SHARED_STATE_DIR;
const expect = process.env.WORKER_CONFIG_EXPECT ?? "derived";
assert(runtime && configPath && stateDir && sharedConfigPath && sharedStateDir, "candidate environment is required");
assert(["derived", "stale"].includes(expect));

const PROBE_MODEL = "deepseek/deepseek-v4-pro";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=:" ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  throw new Error(`${name} missing from shared secrets.env`);
};

const workerDir = path.join(runtime, "production-worker");
const indexSource = fs.readFileSync(path.join(workerDir, "index.mjs"), "utf8");
const installed = {
  index: indexSource.includes("deriveWorkerConfigFile") ? "derive" : indexSource.includes("syncWorkerRuntimeConfigFile") ? "sync" : "unknown",
  module: fs.existsSync(path.join(workerDir, "worker-config-derive.mjs")),
};
assert.deepEqual(installed, expect === "derived" ? { index: "derive", module: true } : { index: "sync", module: false });

// The module under test. For the baseline it is loaded from the repo copy
// shipped as support, only to compute what the derivation would produce.
const derivePath = installed.module
  ? path.join(workerDir, "worker-config-derive.mjs")
  : path.resolve("lab/release-files/worker-config-derive/worker-config-derive.mjs");
const { deriveWorkerConfig, validateWorkerConfig, diffConfigPaths } = await import(pathToFileURL(derivePath).href);

const allowOf = (c) => c?.agents?.defaults?.modelPolicy?.allow ?? [];
const runtimeIdsOf = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((v) => runtimeIdsOf(v, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "agentRuntime") out.push(typeof v === "string" ? v : v?.id);
      runtimeIdsOf(v, out);
    }
  }
  return out;
};

// ---- A. real shared config, in memory only ----
const sharedGateway = JSON.parse(fs.readFileSync(sharedConfigPath, "utf8"));
const sharedPlugin = sharedGateway.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
const sharedWorker = JSON.parse(fs.readFileSync(sharedPlugin.workerConfigPath, "utf8"));
const sharedDerived = deriveWorkerConfig(sharedGateway);
const staticCheck = {
  problems: validateWorkerConfig(sharedDerived, sharedGateway),
  gatewayAllow: allowOf(sharedGateway).length,
  allowMissingInDerived: allowOf(sharedGateway).filter((m) => !allowOf(sharedDerived).includes(m)),
  allowMissingInCurrentSharedWorker: allowOf(sharedGateway).filter((m) => !allowOf(sharedWorker).includes(m)),
  currentSharedWorkerProblems: validateWorkerConfig(sharedWorker, sharedGateway),
  gatewayOnlyRuntimeIdsLeft: [sharedDerived.agents, sharedDerived.models?.providers].flatMap((n) => runtimeIdsOf(n)).filter((id) => id === "vlab-worker").length,
  derivedRuntimeIds: [...new Set([sharedDerived.agents, sharedDerived.models?.providers].flatMap((n) => runtimeIdsOf(n)))].sort(),
  maintenanceMode: sharedDerived.session?.maintenance?.mode,
  changedPathsVsSharedWorker: diffConfigPaths(sharedWorker, sharedDerived),
};
assert.deepEqual(staticCheck.problems, [], "derived shared config failed validation");
assert.deepEqual(staticCheck.allowMissingInDerived, []);
assert.equal(staticCheck.gatewayOnlyRuntimeIdsLeft, 0);
assert.equal(staticCheck.maintenanceMode, "warn");
assert(allowOf(sharedGateway).includes(PROBE_MODEL), `${PROBE_MODEL} must be allowed by the Gateway`);

// ---- B. private Gateway with a stale Worker config ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
// Models on other harnesses (codex, claude-cli) would make the Gateway install
// those plugins from npm. The probe only needs the Worker route.
const workerRuntimes = new Set(["vlab-worker", "openclaw"]);
for (const node of [config.agents.defaults, config.agents.entries?.makaron]) {
  for (const [key, entry] of Object.entries(node?.models ?? {})) {
    const id = typeof entry?.agentRuntime === "string" ? entry.agentRuntime : entry?.agentRuntime?.id;
    if (id && !workerRuntimes.has(id)) delete node.models[key];
  }
}
config.agents.entries = { makaron: config.agents.entries.makaron };
config.bindings = [];
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
assert.equal(config.agents.defaults.models?.[PROBE_MODEL]?.agentRuntime?.id, "vlab-worker", `${PROBE_MODEL} must route to the Worker pool`);
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Stale copy: the correct Worker config for this Gateway config minus the
// probe model — exactly the drift V had after a model was added to the
// Gateway config only. Nothing else differs, so the probe isolates it.
const stale = deriveWorkerConfig(config);
stale.agents.defaults.modelPolicy.allow = allowOf(stale).filter((m) => m !== PROBE_MODEL);
delete stale.agents.defaults.models[PROBE_MODEL];
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(stale, null, 2)}\n`);
fs.chmodSync(workerPlugin.workerConfigPath, 0o640); // non-default, so preservation is observable
const staleSnapshot = fs.readFileSync(workerPlugin.workerConfigPath, "utf8");

const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  DEEPSEEK_API_KEY: secret("DEEPSEEK_API_KEY"),
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  // Never let a plugin install touch the shared instance's npm cache/prefix.
  npm_config_cache: path.join(scratch, "cache", "npm"),
  npm_config_prefix: path.join(scratch, "npm-prefix"),
};

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) {
        startGateway();
        continue;
      }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) {
      lastError = error;
      client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
const logMatches = (re, since = 0) => lines.filter((l) => l.at >= since && re.test(l.line)).map((l) => redact(l.line).slice(0, 400));

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  const readyMs = Date.now() - startedAt;
  const afterBootText = fs.readFileSync(workerPlugin.workerConfigPath, "utf8");
  const afterBoot = JSON.parse(afterBootText);
  const expected = deriveWorkerConfig(config);
  const afterBootStat = fs.statSync(workerPlugin.workerConfigPath);
  const fileCheck = {
    rewritten: afterBootText !== staleSnapshot,
    equalsDerivation: JSON.stringify(afterBoot) === JSON.stringify(expected),
    probeAllowed: allowOf(afterBoot).includes(PROBE_MODEL),
    probeRuntime: afterBoot.agents?.defaults?.models?.[PROBE_MODEL]?.agentRuntime?.id ?? null,
    mode: (afterBootStat.mode & 0o777).toString(8),
    tempFilesLeft: fs.readdirSync(path.dirname(workerPlugin.workerConfigPath)).filter((n) => n.includes(".derive-")).length,
  };
  const deriveLog = logMatches(/Worker config derivation/u);

  const sessionKey = `agent:makaron:explicit:worker-config-derive-${expect}-${Date.now()}`;
  const turnStartedAt = Date.now();
  const turn = spawnSync(process.execPath, [
    `${runtime}/openclaw/dist/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", PROBE_MODEL, "--message", "只回复两个字：收到。不要调用任何工具。", "--json", "--timeout", "300",
  ], { env, encoding: "utf8", timeout: 360_000, maxBuffer: 64 * 1024 * 1024 });
  const turnMs = Date.now() - turnStartedAt;
  await sleep(2_000);
  const turnText = `${turn.stdout ?? ""}\n${turn.stderr ?? ""}`;
  let reply = null;
  try {
    const parsed = JSON.parse(turn.stdout);
    reply = JSON.stringify(parsed?.result?.payloads ?? parsed?.payloads ?? parsed?.reply ?? null).slice(0, 200);
  } catch {
    reply = null;
  }
  const notAllowed = /is not allowed for agent/u.test(turnText) || logMatches(/is not allowed for agent/u, turnStartedAt).length > 0;
  const workerLines = logMatches(/\[vlab-worker:\d+\]/u, turnStartedAt);
  const finalStat = fs.statSync(workerPlugin.workerConfigPath);
  const result = {
    expect,
    installed,
    staticCheck,
    readyMs,
    gatewayStarts,
    fileCheck,
    deriveLog,
    turn: { exit: turn.status, turnMs, notAllowed, reply, tail: redact(turnText.trim().split("\n").slice(-6).join("\n")).slice(0, 1200) },
    workerLogLines: workerLines.length,
    workerLogSample: workerLines.slice(0, 5),
    workerRewroteConfig: finalStat.mtimeMs !== afterBootStat.mtimeMs,
  };
  console.log(JSON.stringify(result, null, 1));
  if (expect === "derived") {
    assert(fileCheck.rewritten && fileCheck.equalsDerivation, "the Gateway did not derive the Worker config at register()");
    assert(fileCheck.probeAllowed && fileCheck.probeRuntime === "openclaw");
    assert.equal(fileCheck.mode, "640", "Worker config mode was not preserved");
    assert.equal(fileCheck.tempFilesLeft, 0);
    assert(
      deriveLog.some((l) => /rewrote Worker config, 2 changed path\(s\): agents\.defaults\.modelPolicy\.allow, agents\.defaults\.models\["deepseek\/deepseek-v4-pro"\]/u.test(l)),
      "derivation summary missing or not limited to the drifted paths",
    );
    assert.equal(notAllowed, false, "the Worker still rejected the Gateway-allowed model");
    assert.equal(turn.status, 0, "the probe turn failed");
    assert(workerLines.length > 0, "the turn left no Worker log; it may not have run in a Worker");
    assert.equal(result.workerRewroteConfig, false, "a Worker child rewrote the config");
  } else {
    assert.equal(fileCheck.probeAllowed, false, "baseline unexpectedly repaired the stale Worker config");
    assert(notAllowed, "baseline did not reproduce the Model override rejection");
  }
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
