import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath, "candidate runtime environment is required");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
assert.equal(typeof token, "string", "candidate Gateway token is missing");

// This is a private writable config copy. Do not let the candidate Gateway
// compete with shared VLab for any messaging-channel connection.
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const essentialPluginIds = new Set([
  "vlab-agent-worker-isolation",
  "deepseek",
  "openai",
  "xai",
]);
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
assert.equal(typeof workerConfigPath, "string");
const workerConfigRelative = path.relative(process.env.OPENCLAW_STATE_DIR, workerConfigPath);
assert(!workerConfigRelative.startsWith(".."), "candidate Worker config escaped state");
const sharedWorkerConfigPath = path.join(
  process.env.VLAB_SHARED_STATE_DIR,
  workerConfigRelative,
);
const workerConfig = fs
  .readFileSync(sharedWorkerConfigPath, "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, process.env.OPENCLAW_STATE_DIR)
  .replaceAll(
    "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime",
    runtime,
  );
fs.mkdirSync(path.dirname(workerConfigPath), { recursive: true });
fs.writeFileSync(workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const gatewayLines = [];
const gateway = spawn(
  process.execPath,
  [
    "--max-old-space-size=4096",
    `${runtime}/openclaw/dist/index.js`,
    "gateway",
    "--port",
    String(port),
  ],
  {
    env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
for (const stream of [gateway.stdout, gateway.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    gatewayLines.push(...chunk.split(/\r?\n/u).filter(Boolean));
    if (gatewayLines.length > 300) gatewayLines.splice(0, gatewayLines.length - 300);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let eventHandler = () => {};
let client;

async function connectGateway() {
  const { GatewayClient } = await import(
    `${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`
  );
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
          onEvent: (event) => eventHandler(event),
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
      if (gateway.exitCode !== null) {
        throw new Error(`candidate Gateway exited with ${gateway.exitCode}`);
      }
      await sleep(500);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

function pcmPeak(buffer) {
  let peak = 0;
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)));
  }
  return peak;
}

async function readHistory(sessionKey) {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt) await sleep(Math.min(2_000, 250 * 2 ** Math.min(attempt - 1, 3)));
    try {
      return await client.request(
        "chat.history",
        { agentId: "makaron", sessionKey, limit: 30 },
        { timeoutMs: 10_000 },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function runRealVoice() {
  const voice = "xiaohe";
  const externalRoot = new URL("../../", import.meta.url);
  const findInput = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        const found = findInput(new URL(`${entry.name}/`, directory));
        if (found) return found;
      } else if (entry.name === "agent-consult.pcm") {
        return path;
      }
    }
  };
  const inputPath = findInput(externalRoot);
  assert(inputPath, "candidate voice input is missing");
  const input = fs.readFileSync(inputPath);
  assert.equal(
    (await import("node:crypto"))
      .createHash("sha256")
      .update(input)
      .digest("hex"),
    "954c91930d5725f77c6226a62af9f32a389fab907da1211f0cdcd2ebd843fef5",
  );
  const sessionKey = `agent:makaron:explicit:candidate-talk-${Date.now()}`;
  const events = [];
  const audio = [];
  let relaySessionId;
  let settled = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const deadline = setTimeout(
    () => rejectDone(new Error("candidate real voice final-audio deadline")),
    180_000,
  );
  eventHandler = (event) => {
    if (event?.event !== "talk.event" || !event.payload) return;
    const payload = event.payload;
    if (relaySessionId && payload.relaySessionId !== relaySessionId) return;
    events.push(payload);
    if (payload.type === "audio" && typeof payload.audioBase64 === "string") {
      audio.push(Buffer.from(payload.audioBase64, "base64"));
    }
    if (payload.type === "mark" && payload.markName && relaySessionId) {
      void client
        .request("talk.session.acknowledgeMark", {
          sessionId: relaySessionId,
          markName: payload.markName,
        })
        .catch(() => {});
    }
    if (payload.type === "error" && !settled) {
      settled = true;
      rejectDone(new Error(payload.message ?? "candidate Talk error"));
    }
    if (payload.type === "audioDone" && !settled) {
      settled = true;
      resolveDone();
    }
  };

  try {
    const created = await client.request(
      "talk.session.create",
      {
        sessionKey,
        provider: "seeduplex",
        model: "1.2.6.1",
        voice,
        language: "zh",
        mode: "realtime",
        transport: "gateway-relay",
        brain: "agent-consult",
        ttlMs: 240_000,
      },
      { timeoutMs: 30_000 },
    );
    relaySessionId = created.relaySessionId ?? created.sessionId;
    assert(relaySessionId);
    const frameBytes = 4_800;
    for (let offset = 0; offset < input.length; offset += frameBytes) {
      const frame = input.subarray(offset, Math.min(offset + frameBytes, input.length));
      await client.request(
        "talk.session.appendAudio",
        {
          sessionId: relaySessionId,
          audioBase64: frame.toString("base64"),
          timestamp: Date.now(),
        },
        { timeoutMs: 10_000 },
      );
      await sleep(90);
    }
    const silence = Buffer.alloc(frameBytes).toString("base64");
    const keepInputAlive = (async () => {
      while (!settled) {
        await client.request(
          "talk.session.appendAudio",
          {
            sessionId: relaySessionId,
            audioBase64: silence,
            timestamp: Date.now(),
          },
          { timeoutMs: 10_000 },
        );
        await sleep(90);
      }
    })();
    await done;
    await keepInputAlive;
    await sleep(500);
    const history = await readHistory(sessionKey);
    const historyJson = JSON.stringify(history.messages ?? []);
    const assistantText = events
      .filter(
        (event) => event.type === "transcript" && event.role === "assistant" && event.final,
      )
      .map((event) => event.text)
      .join(" ")
      .trim();
    const userText = events
      .filter((event) => event.type === "transcript" && event.role === "user" && event.final)
      .map((event) => event.text)
      .join(" ")
      .trim();
    const output = Buffer.concat(audio);
    const runIds = new Set(
      (history.messages ?? [])
        .map((message) => message?.__openclaw?.runId)
        .filter((runId) => typeof runId === "string" && runId.startsWith("talk-")),
    );
    const summary = {
      provider: "seeduplex",
      voice,
      userHasChinese: /[\u3400-\u9fff]/u.test(userText),
      assistantHasChinese: /[\u3400-\u9fff]/u.test(assistantText),
      hasEnglishLeadIn: /^\s*(?:let me|i(?:'ll| will)|sure\b)/iu.test(assistantText),
      assistantChars: assistantText.length,
      audioFrames: audio.length,
      audioBytes: output.length,
      peakPcm16: pcmPeak(output),
      audioDoneCount: events.filter((event) => event.type === "audioDone").length,
      errorCount: events.filter((event) => event.type === "error").length,
      browserToolCallCount: events.filter((event) => event.type === "toolCall").length,
      agentRunCount: runIds.size,
      containsNoTextError:
        historyJson.includes("OpenClaw finished with no text") ||
        historyJson.includes("finished without a confirmed text result") ||
        historyJson.includes("agent consult failed"),
    };
    process.stdout.write(
      `${JSON.stringify({
        candidateLiveVoiceObserved: summary,
        userTranscript: userText.slice(0, 240),
        assistantTranscript: assistantText.slice(0, 240),
      })}\n`,
    );
    assert.equal(summary.userHasChinese, true);
    assert.equal(summary.assistantHasChinese, true);
    assert.equal(summary.hasEnglishLeadIn, false);
    assert(summary.audioBytes > 1_000);
    assert(summary.peakPcm16 > 100);
    assert.equal(summary.audioDoneCount, 1);
    assert.equal(summary.errorCount, 0);
    assert.equal(summary.browserToolCallCount, 0);
    assert.equal(summary.agentRunCount, 1);
    assert.equal(summary.containsNoTextError, false);
    return summary;
  } finally {
    clearTimeout(deadline);
    eventHandler = () => {};
    if (relaySessionId) {
      await client
        .request("talk.session.close", { sessionId: relaySessionId }, { timeoutMs: 10_000 })
        .catch(() => {});
    }
  }
}

try {
  await connectGateway();
  const catalog = await client.request("talk.catalog", {}, { timeoutMs: 15_000 });
  const provider = catalog.realtime?.providers?.find((entry) => entry.id === "seeduplex");
  assert.equal(provider?.configured, true);
  const result = await runRealVoice();
  process.stdout.write(`${JSON.stringify({ candidateLiveVoice: result })}\n`);
} catch (error) {
  const safeTail = gatewayLines
    .slice(-80)
    .join("\n")
    .replace(/(token|api.?key|authorization|secret)[=: ]+[^\s]+/giu, "$1=[redacted]");
  if (safeTail) process.stderr.write(`${safeTail}\n`);
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => gateway.once("exit", resolve)),
    sleep(10_000),
  ]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
