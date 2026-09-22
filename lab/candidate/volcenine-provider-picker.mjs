import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
assert.equal(typeof token, "string", "candidate Gateway token is missing");

config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const essentialPluginIds = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "xai"]);
if (config.plugins?.entries) {
  config.plugins.entries = Object.fromEntries(
    Object.entries(config.plugins.entries).filter(([id]) => essentialPluginIds.has(id)),
  );
}
if (Array.isArray(config.plugins?.allow)) {
  config.plugins.allow = config.plugins.allow.filter((id) => essentialPluginIds.has(id));
}

const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
const workerConfigRelative = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerConfigRelative.startsWith(".."), "candidate Worker config escaped state");
const sharedWorkerConfigPath = path.join(process.env.VLAB_SHARED_STATE_DIR, workerConfigRelative);
const workerConfig = fs
  .readFileSync(sharedWorkerConfigPath, "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = [];
let gateway;
let client;

function startGateway() {
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)],
    {
      env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      lines.push(...chunk.split(/\r?\n/u).filter(Boolean));
      if (lines.length > 300) lines.splice(0, lines.length - 300);
    });
  }
  return child;
}

async function connectGateway() {
  const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  let lastError;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client?.stop();
          reject(new Error("candidate Gateway hello timeout"));
        }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`,
          token,
          deviceIdentity: null,
          clientName: "cli",
          mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onEvent: () => {},
          onHelloOk: () => {
            clearTimeout(timeout);
            resolve();
          },
          onConnectError: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
        client.start();
      });
      return;
    } catch (error) {
      lastError = error;
      client?.stop();
      if (gateway.exitCode !== null) throw new Error(`candidate Gateway exited with ${gateway.exitCode}`);
      await sleep(500);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

try {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    gateway = startGateway();
    try {
      await connectGateway();
      break;
    } catch (error) {
      const restartRequired = lines.some((line) =>
        line.includes("Restart OpenClaw so state migrations run against the final config"),
      );
      if (!restartRequired || attempt === 2) throw error;
      client?.stop();
      client = undefined;
      await sleep(500);
    }
  }
  assert(client, "candidate Gateway connection is missing");
  const catalog = await client.request("talk.catalog", {}, { timeoutMs: 15_000 });
  const providers = catalog.realtime?.providers ?? [];
  const xiaohe = providers.find((entry) => entry.id === "volcengine-rtc-agent");
  assert(xiaohe, "volcengine-rtc-agent is missing from Talk catalog");
  assert.equal(xiaohe.label, "volcenine-rtc");
  assert.equal(xiaohe.configured, true);
  assert.deepEqual(xiaohe.transports, ["managed-room"]);

  const gptLive = providers.find(
    (entry) =>
      entry.id !== "volcengine-rtc-agent" &&
      [entry.id, entry.label, entry.defaultModel, ...(entry.models ?? [])]
        .filter(Boolean)
        .some((value) => /gpt[- ]?live|openai/iu.test(String(value))),
  );
  assert(gptLive, "GPT Live provider is missing from Talk catalog");

  process.stdout.write(
    `${JSON.stringify({
      providerPicker: {
        current: catalog.realtime?.provider,
        xiaohe: { id: xiaohe.id, label: xiaohe.label, transports: xiaohe.transports },
        gptLive: {
          id: gptLive.id,
          label: gptLive.label,
          configured: gptLive.configured,
          models: gptLive.models,
        },
      },
    })}\n`,
  );
} catch (error) {
  const safeTail = lines
    .slice(-80)
    .join("\n")
    .replace(/(token|api.?key|authorization|secret)[=: ]+[^\s]+/giu, "$1=[redacted]");
  if (safeTail) process.stderr.write(`${safeTail}\n`);
  throw error;
} finally {
  client?.stop();
  gateway?.kill("SIGTERM");
  if (gateway) {
    await Promise.race([new Promise((resolve) => gateway.once("exit", resolve)), sleep(10_000)]);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
}
