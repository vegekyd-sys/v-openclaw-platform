// Candidate end-to-end: a real Worker-run turn calls image_generate, the turn
// ends, and nobody sends another message. The completion must reach the
// session on its own. MEDIA_RELAY_EXPECT=failure runs the unpatched runtime
// and must reproduce the production wake failure, proving the probe can see it.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const expect = process.env.MEDIA_RELAY_EXPECT ?? "delivered";
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
assert(["delivered", "failure"].includes(expect));

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  throw new Error(`${name} missing from shared secrets.env`);
};

const eventsFile = path.join(runtime, "production-worker", "worker-gateway-events.mjs");
const toolsFile = fs.readdirSync(path.join(runtime, "openclaw", "dist"))
  .map((f) => path.join(runtime, "openclaw", "dist", f))
  .find((f) => /\/openclaw-tools-[\w-]+\.js$/u.test(f) && fs.readFileSync(f, "utf8").includes("function scheduleMediaGenerationTaskCompletion(params)"));
const relayInstalled = {
  core: fs.readFileSync(toolsFile, "utf8").includes("versa-worker-media-completion-relay-v0.3.0-92"),
  router: fs.readFileSync(eventsFile, "utf8").includes("Pending handoffs must be retried"),
};
assert.deepEqual(relayInstalled, expect === "delivered" ? { core: true, router: true } : { core: false, router: false });

// Private writable config copy: no messaging channel may compete with shared VLab.
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "makaron-image"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
// VLab hosts have no makaron-cli (V does); install a private copy for this run.
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const cliPrefix = path.join(scratch, "makaron-cli");
const cliPath = path.join(cliPrefix, "lib", "node_modules", "makaron-cli", "bin", "makaron.mjs");
const npm = path.join(path.dirname(process.execPath), "npm");
const cliInstall = spawnSync(npm, ["install", "-g", "--prefix", cliPrefix, "--no-audit", "--no-fund", "makaron-cli@0.13.0"], {
  encoding: "utf8", timeout: 300_000, env: { ...process.env, npm_config_cache: path.join(scratch, "cache", "npm") },
});
assert(fs.existsSync(cliPath), `makaron-cli install failed: ${cliInstall.stderr?.slice(-500)}`);
const makaronWorkspace = path.join(scratch, "makaron-workspace");
fs.mkdirSync(makaronWorkspace, { recursive: true });
config.plugins.entries["makaron-image"] = {
  ...config.plugins.entries["makaron-image"],
  config: { ...(config.plugins.entries["makaron-image"]?.config ?? {}), command: process.execPath, cliPath, workspace: makaronWorkspace },
};
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = fs
  .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
// Tools run in the Worker, which reads its own config copy, not the Gateway's.
const workerConfigJson = JSON.parse(workerConfig);
workerConfigJson.plugins ??= {};
workerConfigJson.plugins.entries ??= {};
workerConfigJson.plugins.entries["makaron-image"] = {
  ...workerConfigJson.plugins.entries["makaron-image"],
  config: { ...(workerConfigJson.plugins.entries["makaron-image"]?.config ?? {}), ...config.plugins.entries["makaron-image"].config },
};
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfigJson, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  DEEPSEEK_API_KEY: secret("DEEPSEEK_API_KEY"),
  MAKARON_API_KEY: secret("MAKARON_API_KEY"),
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
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
startGateway();

let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      // First start on a fresh candidate state installs configured plugins and
      // then asks for a restart so migrations see the final inventory.
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

const summarize = (message) => {
  const text = typeof message.content === "string"
    ? message.content
    : (message.content ?? []).map((b) => b.text ?? (b.type === "image" ? "[image]" : `[${b.type}]`)).join(" ");
  return { role: message.role, text: text.slice(0, 240), media: /\.(png|jpe?g|webp)|\[image\]|MEDIA:|mediaUrl/iu.test(JSON.stringify(message)) };
};
async function history(sessionKey) {
  const result = await client.request("chat.history", { agentId: "makaron", sessionKey, limit: 50 }, { timeoutMs: 15_000 });
  return (result?.messages ?? []).map(summarize);
}
function queueRows() {
  const file = path.join(stateDir, "state", "openclaw.sqlite");
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(`select status, retry_count as retryCount, last_attempt_at as lastAttemptAt, json_extract(entry_json, '$.messageId') as messageId
      from delivery_queue_entries where json_extract(entry_json, '$.messageId') like '%_generate:%'`).all();
  } finally {
    db.close();
  }
}
const logMatches = (re, since = 0) => lines.filter((l) => l.at >= since && re.test(l.line)).map((l) => redact(l.line).slice(0, 400));

const startedAt = Date.now();
try {
  await connectGateway();
  const readyMs = Date.now() - startedAt;
  const sessionKey = `agent:makaron:explicit:media-relay-${expect}-${Date.now()}`;
  const turnStartedAt = Date.now();
  const turn = spawnSync(process.execPath, [
    `${runtime}/openclaw/dist/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--message", "请直接调用内置 image_generate 工具生成一张图：白色背景上一个简单的红色圆形。不要使用 makaron skill、CLI 或任何其他工具。调用后等待完成事件即可。",
    "--json", "--timeout", "420",
  ], { env, encoding: "utf8", timeout: 480_000, maxBuffer: 64 * 1024 * 1024 });
  const turnEndedAt = Date.now();
  const turnMessages = await history(sessionKey);
  const imageToolCalled = logMatches(/image_generate|image-generate|makaron-image/iu, turnStartedAt).length > 0
    || turnMessages.some((m) => /Background task started for image generation/iu.test(m.text));

  // Nobody sends another message from here on.
  const deadline = turnEndedAt + (expect === "failure" ? 420_000 : 360_000);
  let deliveredAt;
  let failure;
  let messages = turnMessages;
  while (Date.now() < deadline) {
    await sleep(3_000);
    failure = logMatches(/wake failed|delivery was not confirmed|Worker Gateway event relay failed/iu, turnStartedAt);
    messages = await history(sessionKey);
    if (!deliveredAt && messages.length > turnMessages.length && messages.slice(turnMessages.length).some((m) => m.role === "assistant" && m.media)) {
      deliveredAt = Date.now();
    }
    if (failure.length) break;
    if (deliveredAt && Date.now() - deliveredAt > 15_000) break;
  }
  const rows = queueRows();
  const generationDone = logMatches(/makaron-image|image-generation\]/iu, turnStartedAt);
  const result = {
    expect,
    relayInstalled,
    readyMs,
    gatewayStarts,
    turnExit: turn.status,
    turnMs: turnEndedAt - turnStartedAt,
    imageToolCalled,
    deliveredAfterTurnMs: deliveredAt ? deliveredAt - turnEndedAt : null,
    failures: failure,
    queueRows: rows,
    newMessages: messages.slice(turnMessages.length),
    turnMessages,
    relayLog: logMatches(/worker-gateway-event|media completion|session delivery|image-generate|sessions_yield/iu, turnStartedAt).slice(-40),
    generationDone: generationDone.slice(-5),
  };
  console.log(JSON.stringify(result, null, 1));
  assert(imageToolCalled, "the agent did not call image_generate; the probe exercised nothing");
  if (expect === "delivered") {
    assert.deepEqual(failure, [], "completion wake reported a failure");
    assert(deliveredAt, "the generated image never reached the session without a follow-up message");
    assert(rows.every((row) => row.status !== "pending"), "a completion delivery is still pending");
  } else {
    assert(failure.some((l) => /completion wake failed after successful generation|failure wake failed/iu.test(l)), "baseline did not reproduce the wake failure");
    assert(rows.some((row) => row.status === "pending" && row.retryCount === 0 && row.lastAttemptAt == null), "baseline did not leave an unattempted queue row");
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
