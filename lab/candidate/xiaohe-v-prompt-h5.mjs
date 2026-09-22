import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const inputRoot = process.cwd();
const promptPath = path.join(inputRoot, "lab/xiaohe-v-realtime-prompt.md");
const h5ServerPath = path.join(inputRoot, "lab/rtc-h5/server.mjs");
const adapterPath = path.join(inputRoot, "lab/volcengine-rtc-managed-room-client.mjs");
const h5Port = Number(process.env.RTC_H5_PORT ?? 26252);
const publicSelfTest = process.env.RTC_H5_PUBLIC_SELF_TEST === "1";
const publicBasePath = "/voice";
const publicAccessToken = "vlab-candidate-public-access-token-20260922";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function promptFromMarkdown(markdown) {
  const match = markdown.match(/```text\s*\n([\s\S]*?)\n```/u);
  assert(match?.[1]?.trim(), "V realtime prompt code fence is missing");
  return match[1].trim();
}

function capture(label, child, lines) {
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) {
        lines.push(`[${label}] ${line}`);
        if (lines.length > 500) lines.splice(0, lines.length - 500);
      }
    });
  }
}

async function waitForPort(port, child, label, lines, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited with ${child.exitCode}\n${lines.slice(-40).join("\n")}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolve(); });
        socket.once("error", reject);
        socket.setTimeout(1_000, () => socket.destroy(new Error("connect timeout")));
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`${label} did not listen on ${port}: ${lastError?.message ?? "timeout"}\n${lines.slice(-40).join("\n")}`);
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(10_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function request(pathname, { method = "GET", cookie, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${h5Port}${pathname}`, {
    method,
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    location: response.headers.get("location"),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? "",
    payload: contentType.includes("application/json") ? await response.json() : await response.text(),
  };
}

async function runPublicSelfTest() {
  const redirect = await request(publicBasePath);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.location, `${publicBasePath}/`);

  const page = await request(`${publicBasePath}/`);
  assert.equal(page.status, 200);
  assert.match(page.payload, /\.\/app\.js/u);

  const unauthorized = await request(`${publicBasePath}/api/status`);
  assert.equal(unauthorized.status, 401);
  assert.equal(Object.hasOwn(unauthorized.payload, "sessionKey"), false);

  const rejected = await request(`${publicBasePath}/api/access`, { method: "POST", body: { access: "wrong" } });
  assert.equal(rejected.status, 403);

  const firstAccess = await request(`${publicBasePath}/api/access`, { method: "POST", body: { access: publicAccessToken } });
  const secondAccess = await request(`${publicBasePath}/api/access`, { method: "POST", body: { access: publicAccessToken } });
  assert.equal(firstAccess.status, 200);
  assert.equal(secondAccess.status, 200);
  assert(firstAccess.cookie && secondAccess.cookie && firstAccess.cookie !== secondAccess.cookie, "visitors must receive distinct cookies");

  let firstStatus;
  const statusDeadline = Date.now() + 90_000;
  do {
    firstStatus = await request(`${publicBasePath}/api/status`, { cookie: firstAccess.cookie });
    if (firstStatus.status === 200) break;
    await sleep(1_000);
  } while (Date.now() < statusDeadline);
  assert.equal(firstStatus.status, 200, `H5 did not connect to candidate Gateway: ${JSON.stringify(firstStatus.payload)}`);
  assert.deepEqual(firstStatus.payload, { connected: true, gateway: "V" });

  const firstSession = await request(`${publicBasePath}/api/session`, { method: "POST", cookie: firstAccess.cookie, body: {} });
  const secondSession = await request(`${publicBasePath}/api/session`, { method: "POST", cookie: secondAccess.cookie, body: {} });
  assert.equal(firstSession.status, 200);
  assert.equal(secondSession.status, 200);
  assert(firstSession.payload.voiceSessionId, "first public visitor did not receive a voice session");
  assert(secondSession.payload.voiceSessionId, "second public visitor did not receive a voice session");
  assert.notEqual(firstSession.payload.voiceSessionId, secondSession.payload.voiceSessionId);
  assert.equal(firstSession.payload.provider, "volcengine-rtc-agent");
  assert.equal(firstSession.payload.transport, "managed-room");

  const firstClose = await request(`${publicBasePath}/api/close`, {
    method: "POST",
    cookie: firstAccess.cookie,
    body: { voiceSessionId: firstSession.payload.voiceSessionId },
  });
  const secondClose = await request(`${publicBasePath}/api/close`, {
    method: "POST",
    cookie: secondAccess.cookie,
    body: { voiceSessionId: secondSession.payload.voiceSessionId },
  });
  assert.equal(firstClose.status, 200);
  assert.equal(secondClose.status, 200);
  console.log(JSON.stringify({
    publicSelfTest: true,
    route: `${publicBasePath}/`,
    accessProtected: true,
    isolatedVisitors: 2,
    provider: firstSession.payload.provider,
    transport: firstSession.payload.transport,
  }));
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const gatewayPort = Number(config.gateway?.port);
assert(Number.isInteger(gatewayPort) && gatewayPort > 0, "candidate Gateway port is missing");
assert.equal(typeof config.gateway?.auth?.token, "string", "candidate Gateway token is missing");

// The candidate must never compete with shared VLab for messaging channels or cron.
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
config.talk = {
  ...(config.talk ?? {}),
  consultThinkingLevel: "off",
  consultFastMode: true,
  realtime: {
    ...(config.talk?.realtime ?? {}),
    // Public H5 must select Xiaohe per request instead of mutating the
    // Control UI's configured default provider.
    provider: publicSelfTest ? "openai" : "volcengine-rtc-agent",
    model: "xiaohe-agent",
    mode: "realtime",
    transport: "managed-room",
    brain: "agent-consult",
    speakerVoice: "xiaohe",
    instructions: promptFromMarkdown(fs.readFileSync(promptPath, "utf8")),
    providers: {
      ...(config.talk?.realtime?.providers ?? {}),
      ...(publicSelfTest ? { openai: {} } : {}),
      "volcengine-rtc-agent": {
        ...(config.talk?.realtime?.providers?.["volcengine-rtc-agent"] ?? {}),
        agentModel: "deepseek/deepseek-v4-flash",
      },
    },
  },
};
assert(config.talk.realtime.providers["volcengine-rtc-agent"].botId, "Xiaohe botId is missing");

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
const workerConfigPath = workerPlugin.workerConfigPath;
const workerConfigRelative = path.relative(stateDir, workerConfigPath);
assert(!workerConfigRelative.startsWith(".."), "candidate Worker config escaped state");
const sharedWorkerConfigPath = path.join(process.env.VLAB_SHARED_STATE_DIR, workerConfigRelative);
const workerConfig = fs
  .readFileSync(sharedWorkerConfigPath, "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerConfigPath), { recursive: true });
fs.writeFileSync(workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const lines = [];
let gateway;
let h5;
let stopping = false;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  await terminate(h5);
  await terminate(gateway);
  process.exit(code);
};

try {
  gateway = spawn(
    process.execPath,
    ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(gatewayPort)],
    {
      env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(gatewayPort) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  capture("gateway", gateway, lines);
  await waitForPort(gatewayPort, gateway, "candidate Gateway", lines);

  h5 = spawn(process.execPath, [h5ServerPath], {
    env: {
      ...process.env,
      RTC_H5_HOST: "127.0.0.1",
      RTC_H5_PORT: String(h5Port),
      RTC_H5_RUNTIME_ROOT: `${runtime}/openclaw`,
      RTC_H5_ADAPTER_PATH: adapterPath,
      RTC_H5_PROVIDER_ID: "volcengine-rtc-agent",
      ...(publicSelfTest ? {
        RTC_H5_ACCESS_TOKEN: publicAccessToken,
        RTC_H5_BASE_PATH: publicBasePath,
        RTC_H5_MAX_ACTIVE_SESSIONS: "2",
        RTC_H5_MAX_ACTIVE_SESSIONS_PER_IP: "2",
      } : {
        RTC_H5_SESSION_KEY: "agent:makaron:f0cf5055",
      }),
      OPENCLAW_GATEWAY_PORT: String(gatewayPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture("h5", h5, lines);
  await waitForPort(h5Port, h5, "candidate H5", lines, 30_000);
  console.log(JSON.stringify({
    ready: true,
    h5Port,
    gatewayPort,
    provider: config.talk.realtime.provider,
    model: config.talk.realtime.model,
    backend: config.talk.realtime.providers["volcengine-rtc-agent"].agentModel,
    instructionsChars: config.talk.realtime.instructions.length,
  }));

  if (publicSelfTest) {
    await runPublicSelfTest();
    await terminate(h5);
    await terminate(gateway);
    process.exit(0);
  }

  gateway.once("exit", (code) => {
    if (!stopping) {
      console.error(`candidate Gateway exited with ${code}\n${lines.slice(-60).join("\n")}`);
      void stop(1);
    }
  });
  h5.once("exit", (code) => {
    if (!stopping) {
      console.error(`candidate H5 exited with ${code}\n${lines.slice(-60).join("\n")}`);
      void stop(1);
    }
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void stop(0));
  await new Promise(() => {});
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  await stop(1);
}
