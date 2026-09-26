// Candidate end-to-end: does every agent runtime's progress-card write reach
// the one in-process hook the Feishu monitor subscribes to?
//
// A private Gateway (no channels, so nothing competes with shared VLab's Feishu
// bot) runs the patched core. A probe preloaded into the Gateway process
// subscribes to the same global listener set the Feishu monitor uses. Each
// scenario runs a real agent turn on a Feishu-shaped session key through one
// runtime (V worker, claude-cli, codex) and asks the model to call
// progress_card. A scenario passes only if the probe saw that session's card
// inside the Gateway process; a runtime that could not run (no login, no tool
// call) is reported as not covered, never as passed.
//
// FEISHU_PROGRESS_EXPECT=absent runs the unpatched core and must see nothing,
// proving the probe cannot pass on its own.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const expect = process.env.FEISHU_PROGRESS_EXPECT ?? "delivered";
const only = (process.env.FEISHU_PROGRESS_SCENARIOS ?? "worker,in-process,claude-cli,codex").split(",").map((s) => s.trim()).filter(Boolean);
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
assert(["delivered", "absent"].includes(expect));

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const SYMBOL = "openclaw.v.progressCardChangedListeners";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};

const dist = path.join(runtime, "openclaw", "dist");
const coreFile = fs.readdirSync(dist).find((f) => /^progress-card-[\w-]+\.js$/u.test(f));
const corePatched = fs.readFileSync(path.join(dist, coreFile), "utf8").includes("v-progress-card-changed-listeners-v1");
assert.equal(corePatched, expect === "delivered", "core patch state does not match the expectation");

// The patched Feishu monitor must link against the real runtime it will run in.
const feishuDist = fs.readdirSync(path.join(runtime, "npm", "projects"))
  .filter((d) => d.startsWith("openclaw-feishu-"))
  .map((d) => path.join(runtime, "npm", "projects", d, "node_modules", "@openclaw", "feishu", "dist"))
  .find((d) => fs.existsSync(d));
const monitorFile = feishuDist && fs.readdirSync(feishuDist).find((f) => /^monitor\.account-[\w-]+\.js$/u.test(f));
const monitorSource = monitorFile ? fs.readFileSync(path.join(feishuDist, monitorFile), "utf8") : "";
const monitorPatched = monitorSource.includes("v-feishu-progress-stream-v1");
let monitorLinks = null;
if (monitorPatched) {
  try {
    await import(path.join(feishuDist, monitorFile));
    monitorLinks = true;
  } catch (error) {
    monitorLinks = `import failed: ${String(error?.message ?? error).slice(0, 300)}`;
  }
}

// ---- private config: no channels, no cron, V worker kept ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = fs
  .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
// In-process scenario: the built-in runtime runs the tool inside the Gateway,
// the same in-process call a Codex dynamic tool makes. Shared VLab has no
// OpenAI login, so Codex itself cannot run here.
config.agents.entries.makaron.models ??= {};
config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"] = {
  ...config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"],
  agentRuntime: { id: "openclaw" },
};
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const ref of ["anthropic/claude-sonnet-5", "deepseek/deepseek-v4-pro"]) if (!allow.includes(ref)) allow.push(ref);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- probe preloaded into the Gateway process ----
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
const probeLog = path.join(scratch, "progress-probe.jsonl");
const probeFile = path.join(scratch, "progress-probe.mjs");
fs.writeFileSync(probeFile, `import fs from "node:fs";
const set = globalThis[Symbol.for(${JSON.stringify(SYMBOL)})] ??= new Set();
set.add((event) => {
  const card = event?.card ?? null;
  fs.appendFileSync(${JSON.stringify(probeLog)}, JSON.stringify({
    at: Date.now(), pid: process.pid, gateway: process.argv.includes("gateway"),
    sessionKey: event?.sessionKey ?? null, revision: card?.revision ?? null,
    steps: card?.steps ?? null, markdown: card?.markdown ?? null,
  }) + "\\n");
});
`);
const probeEvents = () => (fs.existsSync(probeLog) ? fs.readFileSync(probeLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
};
for (const name of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
    env: { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --import ${probeFile}`.trim() },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
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

const PROMPT = [
  "这是一次自动化测试，请严格照做。",
  "第一步：立即调用 progress_card 工具（有的环境里它叫 mcp__openclaw__progress_card），",
  "参数 plan 为三步：[{\"step\":\"读需求\",\"status\":\"completed\"},{\"step\":\"写方案\",\"status\":\"in_progress\"},{\"step\":\"复核\",\"status\":\"pending\"}]，",
  "参数 markdown 为 \"**测试进行中**\"。",
  "第二步：工具调用成功后只回复 OK 两个字母，不要做别的事。",
].join("");

const SCENARIOS = {
  worker: { model: "deepseek/deepseek-v4-flash", runtime: "vlab-worker" },
  "in-process": { model: "deepseek/deepseek-v4-pro", runtime: "openclaw" },
  "claude-cli": { model: "anthropic/claude-sonnet-5", runtime: "claude-cli" },
  codex: { model: "openai/gpt-5.6-sol", runtime: "codex" },
};

function runTurn(name) {
  const scenario = SCENARIOS[name];
  const sessionKey = `agent:makaron:feishu:direct:ou_progress_${name.replace(/\W/gu, "_")}_${Date.now()}`;
  const mark = lines.length;
  const started = Date.now();
  const r = spawnSync(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", scenario.model, "--message", PROMPT, "--json", "--timeout", "420",
  ], { env, encoding: "utf8", timeout: 480_000, maxBuffer: 64 * 1024 * 1024 });
  let meta;
  try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  const events = probeEvents().filter((e) => e.at >= started);
  const mine = events.filter((e) => typeof e.sessionKey === "string" && e.sessionKey.toLowerCase() === sessionKey.toLowerCase());
  const toolLog = lines.slice(mark).filter((l) => /progress_card|progressCard/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300));
  return {
    name,
    requested: scenario,
    sessionKey,
    exit: r.status,
    secs: Math.round((Date.now() - started) / 1000),
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime } : null,
    reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 200),
    probe: mine.map((e) => ({ inGateway: e.gateway && e.pid === gateway.pid, sessionKey: e.sessionKey, revision: e.revision, steps: e.steps?.map((s) => `${s.status}:${s.step}`), markdown: e.markdown })),
    otherSessions: events.filter((e) => !mine.includes(e)).map((e) => e.sessionKey),
    toolLog: toolLog.slice(-6),
    stderr: r.status === 0 ? undefined : redact(`${r.stderr}`).slice(-800),
  };
}

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  const results = [];
  for (const name of only) results.push(runTurn(name));
  const summary = {
    expect,
    corePatched,
    monitorPatched,
    monitorLinks,
    readyMs: Date.now() - startedAt,
    gatewayPid: gateway.pid,
    results,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (monitorPatched) assert.equal(monitorLinks, true, "patched Feishu monitor does not link against this runtime");
  if (expect === "delivered") {
    const covered = results.filter((r) => r.probe.length > 0);
    for (const r of covered) {
      assert(r.probe.every((e) => e.inGateway), `${r.name}: progress event fired outside the Gateway process`);
      assert(r.probe.some((e) => e.steps?.join("|") === "completed:读需求|in_progress:写方案|pending:复核"), `${r.name}: card content did not arrive intact`);
    }
    assert(covered.length > 0, "no runtime produced a progress-card event; the probe exercised nothing");
  } else {
    assert.deepEqual(probeEvents(), [], "unpatched core must not notify the listener set");
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
