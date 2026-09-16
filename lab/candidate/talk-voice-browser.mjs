import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath, "candidate runtime environment is required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
assert.equal(typeof token, "string", "candidate Gateway token is missing");

config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
config.talk = {
  ...(config.talk ?? {}),
  consultThinkingLevel:
    process.env.VLAB_TALK_CONSULT_THINKING_LEVEL ??
    config.talk?.consultThinkingLevel,
  realtime: {
    ...(config.talk?.realtime ?? {}),
    provider: "seeduplex",
    mode: "realtime",
    transport: "gateway-relay",
    brain: "agent-consult",
    providers: {
      ...(config.talk?.realtime?.providers ?? {}),
      seeduplex: {
        ...(config.talk?.realtime?.providers?.seeduplex ?? {}),
        voice: "xiaohe",
        agentModel: "deepseek/deepseek-v4-pro",
      },
    },
  },
};
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
const workerConfigRelative = path.relative(process.env.OPENCLAW_STATE_DIR, workerConfigPath);
assert(!workerConfigRelative.startsWith(".."), "candidate Worker config escaped state");
const sharedWorkerConfigPath = path.join(
  process.env.VLAB_SHARED_STATE_DIR,
  workerConfigRelative,
);
const workerConfig = fs
  .readFileSync(sharedWorkerConfigPath, "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, process.env.OPENCLAW_STATE_DIR)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerConfigPath), { recursive: true });
fs.writeFileSync(workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "talk-browser-candidate-"));
const gatewayLines = [];
const browserLines = [];
let gateway;
let chrome;
let cdp;
let proxyServer;
const proxyConnections = new Set();
let browserAcceptanceStartedAt = 0;

function startGateway() {
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)],
    {
      env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  captureLines(gatewayLines, child.stdout);
  captureLines(gatewayLines, child.stderr);
  return child;
}

async function stopGateway(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(15_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(5_000)]);
  }
}

function captureLines(target, stream) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    target.push(...chunk.split(/\r?\n/u).filter(Boolean));
    if (target.length > 5_000) target.splice(0, target.length - 5_000);
  });
}

function writeWave(pcm, sampleRateHz, trailingSilenceSeconds) {
  const silence = Buffer.alloc(sampleRateHz * 2 * trailingSilenceSeconds);
  const data = Buffer.concat([pcm, silence]);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(tempDir, "voice.wav"), Buffer.concat([header, data]));
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${path.basename(filePath)}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP connection failed"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      this.events.push({ at: Date.now(), ...message });
      if (this.events.length > 20_000) this.events.splice(0, 5_000);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "browser evaluation failed",
    );
  }
  return result.result?.value;
}

const browserStateExpression = `(() => {
  const roots = [];
  const visit = (root) => {
    roots.push(root);
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot);
  };
  visit(document);
  const buttons = roots.flatMap((root) => [...root.querySelectorAll('button')]).map((button) => ({
    label: button.getAttribute('aria-label') || button.title || button.textContent || '',
    disabled: button.disabled,
    visible: (() => { const rect = button.getBoundingClientRect(); const style = getComputedStyle(button); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; })(),
  }));
  const text = roots.map((root) => root.body?.innerText || root.host?.shadowRoot?.textContent || root.textContent || '').join('\\n');
  return { buttons, text: text.slice(-30000), ready: document.readyState };
})()`;

async function waitForTalkButton(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await evaluate(browserStateExpression);
    const button = latest.buttons.find(
      (entry) => entry.visible && !entry.disabled && /(?:开始|启动|start).*(?:语音|voice)|(?:语音|voice).*(?:开始|启动|start)/iu.test(entry.label),
    );
    if (button) return { latest, button };
    await sleep(500);
  }
  throw new Error(`Talk start button was not ready; page tail: ${latest?.text?.slice(-500) ?? ""}`);
}

function inspectRpcFrames(events) {
  const pending = new Set();
  const requests = new Map();
  const methodCounts = {};
  let pendingPeak = 0;
  let appendRequests = 0;
  let appendResponses = 0;
  let createParams = null;
  let createResult = null;
  let createMethod = null;
  let catalogResult = null;
  let outputAudioFrames = 0;
  let outputAudioBytes = 0;
  const assistantFinalTranscripts = [];
  for (const event of events) {
    if (event.method === "Network.webSocketFrameSent") {
      try {
        const frame = JSON.parse(event.params.response.payloadData);
        if (frame.type === "req" && typeof frame.method === "string") {
          methodCounts[frame.method] = (methodCounts[frame.method] ?? 0) + 1;
          requests.set(frame.id, frame.method);
        }
        if (
          frame.type === "req" &&
          (frame.method === "talk.client.create" || frame.method === "talk.session.create")
        ) {
          createMethod = frame.method;
          createParams = {
            provider: frame.params?.provider,
            voice: frame.params?.voice,
            transport: frame.params?.transport,
          };
        }
        if (frame.type === "req" && frame.method === "talk.session.appendAudio") {
          appendRequests += 1;
          pending.add(frame.id);
          pendingPeak = Math.max(pendingPeak, pending.size);
        }
      } catch {}
    }
    if (event.method === "Network.webSocketFrameReceived") {
      try {
        const frame = JSON.parse(event.params.response.payloadData);
        if (frame.type === "event" && frame.event === "talk.event") {
          const payload = frame.payload ?? {};
          if (payload.type === "audio" && typeof payload.audioBase64 === "string") {
            outputAudioFrames += 1;
            outputAudioBytes += Buffer.from(payload.audioBase64, "base64").byteLength;
          }
          if (
            payload.type === "transcript" &&
            payload.role === "assistant" &&
            payload.final === true &&
            typeof payload.text === "string"
          ) {
            assistantFinalTranscripts.push(payload.text);
          }
        }
        if (
          frame.type === "res" &&
          (requests.get(frame.id) === "talk.client.create" ||
            requests.get(frame.id) === "talk.session.create")
        ) {
          createResult = frame.payload ?? frame.result ?? null;
        }
        if (frame.type === "res" && requests.get(frame.id) === "talk.catalog") {
          catalogResult = frame.payload ?? frame.result ?? null;
        }
        if (frame.type === "res" && pending.delete(frame.id)) appendResponses += 1;
      } catch {}
    }
  }
  return {
    createParams,
    createResult,
    createMethod,
    catalogResult,
    appendRequests,
    appendResponses,
    pendingPeak,
    pendingFinal: pending.size,
    outputAudioFrames,
    outputAudioBytes,
    assistantFinalTranscripts,
    methodCounts,
  };
}

try {
  gateway = startGateway();

  const fixtureRoot = new URL("../../", import.meta.url);
  const findFixture = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        const found = findFixture(new URL(`${entry.name}/`, directory));
        if (found) return found;
      } else if (entry.name === "agent-consult.pcm") return child;
    }
  };
  const inputPath = findFixture(fixtureRoot);
  assert(inputPath, "candidate voice input is missing");
  writeWave(fs.readFileSync(inputPath), 24_000, 420);

  const devtoolsPath = path.join(tempDir, "profile", "DevToolsActivePort");
  proxyServer = net.createServer((client) => {
    const upstream = net.connect({ host: "127.0.0.1", port });
    proxyConnections.add(client);
    proxyConnections.add(upstream);
    client.on("data", (chunk) => upstream.write(chunk));
    upstream.on("data", (chunk) => client.write(chunk));
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
      proxyConnections.delete(client);
      proxyConnections.delete(upstream);
    };
    client.on("error", closeBoth);
    upstream.on("error", closeBoth);
    client.on("close", () => {
      upstream.destroy();
      proxyConnections.delete(client);
      proxyConnections.delete(upstream);
    });
    upstream.on("close", () => {
      client.destroy();
      proxyConnections.delete(client);
      proxyConnections.delete(upstream);
    });
  });
  await new Promise((resolve, reject) => {
    proxyServer.once("error", reject);
    proxyServer.listen(0, "127.0.0.1", resolve);
  });
  const proxyPort = proxyServer.address().port;
  chrome = spawn(
    "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${path.join(tempDir, "profile")}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.join(tempDir, "voice.wav")}`,
      "--autoplay-policy=no-user-gesture-required",
      "--lang=zh-CN",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  captureLines(browserLines, chrome.stdout);
  captureLines(browserLines, chrome.stderr);
  await waitForFile(devtoolsPath, 20_000);
  const [debugPort] = fs.readFileSync(devtoolsPath, "utf8").split(/\r?\n/u);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const target = targets.find((entry) => entry.type === "page");
  assert(target?.webSocketDebuggerUrl, "Chrome page target is missing");
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Network.enable", { maxTotalBufferSize: 100_000_000 }),
    cdp.send("Log.enable"),
  ]);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      globalThis.__talkCandidateBackpressure = {
        delayMs: 0,
        pending: 0,
        peak: 0,
        sent: 0,
        delivered: 0,
      };
    })();`,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1_280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", {
    url: `http://127.0.0.1:${proxyPort}/chat/makaron?token=${encodeURIComponent(token)}`,
  });
  await waitForTalkButton(90_000);

  const catalogDeadline = Date.now() + 20_000;
  let catalogMetrics;
  while (Date.now() < catalogDeadline) {
    catalogMetrics = inspectRpcFrames(cdp.events);
    if (catalogMetrics.catalogResult) break;
    await sleep(250);
  }
  assert(catalogMetrics?.catalogResult, "Talk provider catalog did not finish loading");
  process.stdout.write(`${JSON.stringify({ candidateBrowserTalkCatalog: catalogMetrics.catalogResult })}\n`);

  // Exercise a real, credentialed model switch before starting Talk. The
  // Worker IPC must preserve this session selection instead of falling back to
  // the stale/default model it already loaded when the Gateway started.
  const candidateAgentModel =
    process.env.VLAB_TALK_AGENT_MODEL ?? "deepseek/deepseek-v4-pro";
  const modelSwitch = await evaluate(`(async () => {
    const roots = [];
    const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
    visit(document);
    const state = roots.flatMap((root) => [root.host, ...root.querySelectorAll('*')]).filter(Boolean).map((entry) => entry.state).find((entry) => entry?.connected && entry?.client && entry?.sessionKey);
    if (!state) return { ok: false, reason: 'chat state unavailable' };
    const response = await state.client.request('sessions.patch', {
      key: state.sessionKey,
      agentId: 'makaron',
      model: '${candidateAgentModel}',
    });
    return { ok: true, sessionKey: state.sessionKey, model: '${candidateAgentModel}', response };
  })()`);
  assert.equal(modelSwitch?.ok, true, `candidate Agent model switch failed: ${modelSwitch?.reason ?? "unknown"}`);
  process.stdout.write(`${JSON.stringify({ candidateBrowserAgentModel: modelSwitch })}\n`);
  const connectCountBeforeRestart = inspectRpcFrames(cdp.events).methodCounts.connect ?? 0;
  await stopGateway(gateway);
  gatewayLines.push("[candidate] restarted private Gateway after persisting Agent model selection");
  gateway = startGateway();
  const reconnectDeadline = Date.now() + 90_000;
  while (Date.now() < reconnectDeadline) {
    await sleep(500);
    const reconnectMetrics = inspectRpcFrames(cdp.events);
    if ((reconnectMetrics.methodCounts.connect ?? 0) > connectCountBeforeRestart) break;
  }
  assert(
    (inspectRpcFrames(cdp.events).methodCounts.connect ?? 0) > connectCountBeforeRestart,
    "Control UI did not reconnect after the private Gateway restart",
  );
  const catalogCountBeforeReload =
    inspectRpcFrames(cdp.events).methodCounts["talk.catalog"] ?? 0;
  await cdp.send("Page.reload", { ignoreCache: true });
  const reloadDeadline = Date.now() + 60_000;
  while (Date.now() < reloadDeadline) {
    await sleep(500);
    const reloadMetrics = inspectRpcFrames(cdp.events);
    if ((reloadMetrics.methodCounts["talk.catalog"] ?? 0) > catalogCountBeforeReload) break;
  }
  assert(
    (inspectRpcFrames(cdp.events).methodCounts["talk.catalog"] ?? 0) >
      catalogCountBeforeReload,
    "Control UI did not reload the Talk catalog after the private Gateway restart",
  );
  await waitForTalkButton(30_000);
  browserAcceptanceStartedAt = Date.now();

  const startButtonDetails = await evaluate(`(() => {
    const roots = [];
    const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
    visit(document);
    return roots.flatMap((root) => [...root.querySelectorAll('button')]).filter((entry) => /Start voice input|开始语音输入/iu.test(entry.getAttribute('aria-label') || entry.title || entry.textContent || '')).map((entry) => {
      const rect = entry.getBoundingClientRect();
      return {
        label: entry.getAttribute('aria-label') || entry.title || entry.textContent || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        disabled: entry.disabled,
        parentTags: [entry, entry.parentElement, entry.parentElement?.parentElement, entry.parentElement?.parentElement?.parentElement].filter(Boolean).map((node) => node.tagName + (node.className ? '.' + String(node.className).slice(0, 120) : '')),
      };
    });
  })()`);
  process.stdout.write(`${JSON.stringify({ candidateBrowserStartButtons: startButtonDetails })}\n`);

  const startButton = startButtonDetails.find((entry) => entry.rect.width > 0 && entry.rect.height > 0);
  assert(startButton, "visible Talk start button disappeared");
  const invoked = await evaluate(`(() => {
    const roots = [];
    const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
    visit(document);
    const button = roots.flatMap((root) => [...root.querySelectorAll('button')]).find((entry) => /Start voice input|开始语音输入/iu.test(entry.getAttribute('aria-label') || entry.title || entry.textContent || ''));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(invoked, true, "Talk start button disappeared before activation");

  await sleep(2_000);
  let earlyMetrics = inspectRpcFrames(cdp.events);
  if (!earlyMetrics.createResult) {
    const microphoneSelection = await evaluate(`(() => {
      const roots = [];
      const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
      visit(document);
      for (const select of roots.flatMap((root) => [...root.querySelectorAll('select')])) {
        const options = [...select.options];
        const option = options.find((entry) => /Fake Audio Input 1/iu.test(entry.textContent || '')) ?? options.find((entry) => !entry.disabled);
        if (!option) continue;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return { changed: true, label: option.textContent || '', value: option.value };
      }
      const optionElements = roots.flatMap((root) => [...root.querySelectorAll('*')]);
      const visible = optionElements.filter((entry) => {
        const rect = entry.getBoundingClientRect();
        const style = getComputedStyle(entry);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const exact = (pattern) => visible.filter((entry) => pattern.test((entry.textContent || '').trim())).sort((a, b) => a.childElementCount - b.childElementCount);
      const optionElement = exact(/^Fake Audio Input 1$/iu)[0] ?? exact(/^System default$/iu)[0];
      if (optionElement) {
        optionElement.click();
        return { changed: true, label: (optionElement.textContent || '').trim(), tag: optionElement.tagName, role: optionElement.getAttribute('role') };
      }
      return { changed: false };
    })()`);
    process.stdout.write(`${JSON.stringify({ candidateBrowserMicrophoneSelection: microphoneSelection })}\n`);
    if (microphoneSelection?.changed) {
      await sleep(1_000);
      const reinvoked = await evaluate(`(async () => {
        const visibleButton = (pattern) => {
          const roots = [];
          const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
          visit(document);
          return roots.flatMap((root) => [...root.querySelectorAll('button')]).find((entry) => {
            const rect = entry.getBoundingClientRect();
            const style = getComputedStyle(entry);
            return !entry.disabled && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && pattern.test((entry.getAttribute('aria-label') || entry.title || entry.textContent || '').trim());
          });
        };
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const talk = visibleButton(/^(?:Tap to talk|点击开始对话|轻触开始对话)$/iu);
          if (talk) {
            talk.click();
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const opener = visibleButton(/Start voice input|开始语音输入/iu);
        if (!opener) return false;
        opener.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        visibleButton(/^(?:Tap to talk|点击开始对话|轻触开始对话)$/iu)?.click();
        return true;
      })()`);
      assert.equal(reinvoked, true, "Tap to talk action was unavailable after microphone selection");
    }
  }

  const startDeadline = Date.now() + 45_000;
  let startState;
  let startMetrics;
  while (Date.now() < startDeadline) {
    await sleep(500);
    startState = await evaluate(browserStateExpression);
    startMetrics = inspectRpcFrames(cdp.events);
    if (startMetrics.createResult && startMetrics.appendRequests >= 3) break;
  }
  if (!startMetrics?.createResult) {
    const componentState = await evaluate(`(() => {
      const roots = [];
      const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
      visit(document);
      return roots.flatMap((root) => [root.host, ...root.querySelectorAll('*')]).filter(Boolean).map((entry) => entry.state).filter(Boolean).map((state) => ({
        hasToggle: typeof state.onToggleRealtimeTalk === 'function',
        active: state.realtimeTalkActive,
        status: state.realtimeTalkStatus,
        detail: state.realtimeTalkDetail,
        sessionKey: state.sessionKey,
        dictation: state.dictation ? {
          ownKeys: Object.keys(state.dictation),
          prototypeKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(state.dictation)),
          fields: Object.fromEntries(Object.entries(state.dictation).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))),
          optionKeys: Object.keys(state.dictation.options || {}),
        } : null,
      })).filter((entry) => entry.hasToggle || entry.active !== undefined || entry.status !== undefined);
    })()`);
    process.stdout.write(`${JSON.stringify({ candidateBrowserComponentState: componentState, candidateBrowserStartState: startState, candidateBrowserStartMetrics: startMetrics })}\n`);
  }
  assert(startMetrics?.createResult, "Talk click did not create a realtime session");

  let state;
  let metrics;
  let assistantHasChinese = false;
  let terminalChineseResult = false;
  let hasEnglishLeadIn = false;
  const observePage = async () => {
    await sleep(1_000);
    state = await evaluate(browserStateExpression);
    metrics = inspectRpcFrames(cdp.events);
    const normalized = state.text.replace(/\s+/gu, " ");
    assistantHasChinese = /V\s*[×x]\s*Makaron[\s\S]*[\u3400-\u9fff]/u.test(normalized);
    terminalChineseResult =
      metrics.assistantFinalTranscripts.length >= 2 &&
      /[\u3400-\u9fff]/u.test(metrics.assistantFinalTranscripts.at(-1) ?? "");
    hasEnglishLeadIn =
      metrics.assistantFinalTranscripts.some((text) =>
        (() => {
          const chineseCharacters = text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
          const latinWords = text.match(/[A-Za-z]{2,}/gu)?.length ?? 0;
          return /\b(?:Let me|The request|asked me|I should|report back truthfully|doesn't map)\b/iu.test(text) ||
            latinWords > Math.max(8, chineseCharacters / 3);
        })(),
      ) || /V\s*[×x]\s*Makaron\s+(?:Let me\b|Sure\b|I\s+(?:will|have|found|checked|can)\b)/iu.test(normalized);
    const forbidden = /Realtime Talk audio input fell behind|OpenClaw finished with no text|agent consult failed/iu.test(normalized);
    if (forbidden) throw new Error("browser Talk exposed a forbidden terminal error");
  };

  // While the microphone pump is known to be live, delay only append-audio RPC
  // promises. Other WebSocket events and keepalives remain live, so this
  // exercises the actual bounded UI queue without manufacturing a disconnect.
  const requestDelayInstalled = await evaluate(`(() => {
    const roots = [];
    const visit = (root) => { roots.push(root); for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); };
    visit(document);
    const state = roots.flatMap((root) => [root.host, ...root.querySelectorAll('*')]).filter(Boolean).map((entry) => entry.state).find((entry) => entry?.connected && entry?.client && entry?.sessionKey);
    const client = state?.client;
    if (!client || typeof client.request !== 'function') return false;
    if (client.__talkCandidateOriginalRequest) return true;
    const original = client.request.bind(client);
    Object.defineProperty(client, '__talkCandidateOriginalRequest', { value: original });
    client.request = (method, params, options) => {
      const result = original(method, params, options);
      const stats = globalThis.__talkCandidateBackpressure;
      if (method !== 'talk.session.appendAudio' || !stats || stats.delayMs <= 0) return result;
      const delayMs = stats.delayMs;
      stats.sent += 1;
      stats.pending += 1;
      stats.peak = Math.max(stats.peak, stats.pending);
      const settle = () => {
        stats.delivered += 1;
        stats.pending -= 1;
      };
      return Promise.resolve(result).then(
        (value) => new Promise((resolve) => setTimeout(() => { settle(); resolve(value); }, delayMs)),
        (error) => new Promise((_, reject) => setTimeout(() => { settle(); reject(error); }, delayMs)),
      );
    };
    return true;
  })()`);
  assert.equal(requestDelayInstalled, true, "Control UI request delay hook was unavailable");
  await evaluate("globalThis.__talkCandidateBackpressure.delayMs = 20000");
  const stressDeadline = Date.now() + 90_000;
  let browserBackpressure;
  while (Date.now() < stressDeadline) {
    await observePage();
    browserBackpressure = await evaluate("({...globalThis.__talkCandidateBackpressure})");
    if (browserBackpressure.peak >= 32 && browserBackpressure.delivered >= 32) break;
  }
  await evaluate("globalThis.__talkCandidateBackpressure.delayMs = 0");
  const drainDeadline = Date.now() + 30_000;
  while (Date.now() < drainDeadline) {
    await observePage();
    browserBackpressure = await evaluate("({...globalThis.__talkCandidateBackpressure})");
    if (browserBackpressure.pending === 0) break;
  }

  // Then prove the complete real Provider -> single Agent run -> final Chinese
  // browser reply path in the same Talk session after the queue recovered.
  const agentDeadline = Date.now() + 300_000;
  while (Date.now() < agentDeadline) {
    await observePage();
    if (terminalChineseResult) break;
  }

  metrics = inspectRpcFrames(cdp.events);
  const finalText = state?.text ?? "";
  const acceptanceBrowserEvents = cdp.events.filter(
    (event) => event.at >= browserAcceptanceStartedAt,
  );
  const allConsoleFailureEvents = acceptanceBrowserEvents.filter((event) =>
    event.method === "Runtime.exceptionThrown" ||
    (event.method === "Log.entryAdded" && event.params?.entry?.level === "error"),
  );
  const unexpectedConsoleFailureEvents = allConsoleFailureEvents.filter(
    (event) =>
      !(
        event.params?.entry?.source === "network" &&
        /\/__openclaw__\/workspace-icon\//u.test(event.params?.entry?.url ?? "")
      ),
  );
  const consoleFailures = unexpectedConsoleFailureEvents.length;
  const ignoredWorkspaceIconMisses =
    allConsoleFailureEvents.length - unexpectedConsoleFailureEvents.length;
  const consoleWarnings = acceptanceBrowserEvents.filter(
    (event) => event.method === "Log.entryAdded" && event.params?.entry?.level === "warning",
  ).length;
  const consoleFailureDetails = unexpectedConsoleFailureEvents
    .map((event) => ({
      message:
        event.params?.exceptionDetails?.exception?.description ??
        event.params?.exceptionDetails?.text ??
        event.params?.entry?.text ??
        event.method,
      source: event.params?.entry?.source,
      url: event.params?.entry?.url,
      lineNumber:
        event.params?.entry?.lineNumber ?? event.params?.exceptionDetails?.lineNumber,
    }));
  const agentRunCount = gatewayLines.filter(
    (line) => line.includes('"kind":"start"') && line.includes("talk-realtime-relay-consult"),
  ).length;
  const routingLine = gatewayLines.find((line) =>
    line.includes("[firsttext-metrics]") &&
    line.includes("talk-realtime-relay-consult") &&
    line.includes('"stage":"model-call-enter"'),
  );
  let actualAgentRoute;
  try {
    const jsonStart = routingLine?.indexOf("{") ?? -1;
    actualAgentRoute = jsonStart >= 0 ? JSON.parse(routingLine.slice(jsonStart)) : undefined;
  } catch {}
  const summary = {
    createMethod: metrics.createMethod,
    createParams: metrics.createParams,
    createResult: metrics.createResult,
    configuredProvider: config.talk.realtime.provider,
    configuredVoice: config.talk.realtime.providers.seeduplex.voice,
    configuredTransport: config.talk.realtime.transport,
    candidateAgentModel,
    appendRequests: metrics.appendRequests,
    appendResponses: metrics.appendResponses,
    pendingPeak: browserBackpressure?.peak ?? 0,
    pendingFinal: browserBackpressure?.pending ?? 0,
    delayedAppendResponses: browserBackpressure?.delivered ?? 0,
    wirePendingPeak: metrics.pendingPeak,
    wirePendingFinal: metrics.pendingFinal,
    outputAudioFrames: metrics.outputAudioFrames,
    outputAudioBytes: metrics.outputAudioBytes,
    assistantFinalTranscriptCount: metrics.assistantFinalTranscripts.length,
    assistantFinalText: metrics.assistantFinalTranscripts.at(-1),
    assistantHasChinese,
    terminalChineseResult,
    hasEnglishLeadIn,
    talkStayedActive: state?.buttons?.some((entry) => /停止.*语音|stop.*voice/iu.test(entry.label)) ?? false,
    containsAudioBackpressureError: /Realtime Talk audio input fell behind/iu.test(finalText),
    containsNoTextError: /OpenClaw finished with no text|finished without a confirmed text result/iu.test(finalText),
    containsConsultFailure: /agent consult failed/iu.test(finalText),
    containsOutputOwnershipError: /Realtime provider output has no live response owner/iu.test(finalText),
    consoleFailures,
    consoleFailureDetails,
    ignoredWorkspaceIconMisses,
    consoleWarnings,
    browserToolCallCount: metrics.methodCounts["talk.client.toolCall"] ?? 0,
    agentRunCount,
    actualAgentProvider: actualAgentRoute?.provider,
    actualAgentModel: actualAgentRoute?.model,
    buttonLabels: (state?.buttons ?? []).map((entry) => entry.label.trim()).filter(Boolean).slice(-30),
    textTail: finalText.replace(/\s+/gu, " ").slice(-1_000),
    rpcMethods: metrics.methodCounts,
  };
  process.stdout.write(`${JSON.stringify({ candidateBrowserTalkObserved: summary })}\n`);
  assert.equal(metrics.createMethod, "talk.session.create");
  assert.equal(config.talk.realtime.provider, "seeduplex");
  assert.equal(config.talk.realtime.providers.seeduplex.voice, "xiaohe");
  assert.equal(config.talk.realtime.transport, "gateway-relay");
  assert(summary.appendRequests >= 64, "browser did not sustain microphone input");
  assert(summary.appendResponses >= 32, "browser did not receive audio append acknowledgements");
  assert.equal(summary.pendingPeak, 32, "browser did not exercise the bounded backlog");
  assert.equal(summary.pendingFinal, 0, "browser audio backlog did not drain");
  assert(summary.delayedAppendResponses >= 32, "browser did not receive delayed audio acknowledgements");
  assert(summary.outputAudioFrames > 0, "browser did not receive provider audio output");
  assert(summary.outputAudioBytes > 0, "browser provider audio output was empty");
  assert.equal(summary.assistantHasChinese, true, "browser did not render a Chinese assistant reply");
  assert.equal(summary.terminalChineseResult, true, "browser did not render the final Chinese Agent result");
  assert.equal(summary.hasEnglishLeadIn, false, "browser spoke English narration for a Chinese request");
  assert.equal(summary.talkStayedActive, true, "browser Talk stopped during sustained input");
  assert.equal(summary.containsAudioBackpressureError, false);
  assert.equal(summary.containsNoTextError, false);
  assert.equal(summary.containsConsultFailure, false);
  assert.equal(summary.containsOutputOwnershipError, false);
  assert.equal(summary.consoleFailures, 0);
  assert.equal(summary.browserToolCallCount, 0, "Seeduplex consult escaped to the browser");
  assert.equal(summary.agentRunCount, 1, "Seeduplex consult did not run exactly once");
  assert.equal(summary.actualAgentProvider, "deepseek", "Talk used the wrong Agent provider");
  assert.equal(summary.actualAgentModel, "deepseek-v4-pro", "Talk used the wrong Agent model");
  process.stdout.write(`${JSON.stringify({ candidateBrowserTalk: summary })}\n`);
} catch (error) {
  const safe = [...gatewayLines.slice(-60), ...browserLines.slice(-30)]
    .join("\n")
    .replace(/(token|api.?key|authorization|secret)[=: ]+[^\s]+/giu, "$1=[redacted]");
  if (safe) process.stderr.write(`${safe}\n`);
  throw error;
} finally {
  cdp?.close();
  chrome?.kill("SIGTERM");
  gateway?.kill("SIGTERM");
  for (const connection of proxyConnections) connection.destroy();
  proxyServer?.close();
  await sleep(1_000);
  if (chrome?.exitCode === null) chrome.kill("SIGKILL");
  if (gateway?.exitCode === null) gateway.kill("SIGKILL");
  fs.rmSync(tempDir, { recursive: true, force: true });
}
