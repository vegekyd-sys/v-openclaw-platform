// Candidate end-to-end for lab/patch-deepseek-budget-completions.mjs (E3 follow-up, 2026-10-12).
//
// DS_PATCH=1 patches the runtime's own live bytes first (so the run also proves the patch fits
// what is deployed; VLab's three target files are byte-identical to V's); DS_PATCH=0 runs them
// unchanged and must reproduce both faults, proving the scenarios reach them.
//
// provider — the built-in "openai-completions" provider (openai-completions-D0QZ0AyB.mjs), driven
//   through core's own completeSimple (the entry simple/utility/isolated completions use), sends a
//   deepseek-v4-flash request carrying a 2.4 MB inline image to a loopback DeepSeek stand-in.
//   V today: refused with V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED, the stand-in sees no request.
//   Patched: one request of >2 MB reaches the stand-in and its reply comes back.
//
// notice — a private Gateway (no channels, no cron, V's compaction settings) runs real
//   `openclaw agent` turns on deepseek-v4-flash (V worker) and deepseek-v4-pro (in-Gateway) with a
//   2.1 MB prompt, which the DeepSeek budget guard genuinely refuses before any provider request.
//   Native overflow recovery runs and gives up; the reply payload is what a channel delivers.
//   V today: the English "Context overflow: prompt too large for the model. Try /reset …".
//   Patched: the Chinese notice.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { IMAGE_MARKER, NOTICE_MARKER, TARGETS } from "../patch-deepseek-budget-completions.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const applyPatch = (process.env.DS_PATCH ?? "1") === "1";
const parts = (process.env.DS_PARTS ?? "provider,notice").split(",").map((s) => s.trim()).filter(Boolean);
const scenarios = (process.env.DS_SCENARIOS ?? "worker,in-process").split(",").map((s) => s.trim()).filter(Boolean);
const paths = (process.env.DS_PATHS ?? "chat,cli").split(",").map((s) => s.trim()).filter(Boolean);
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const CHINESE = "上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。";
const GUARD_CODE = "V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};

// ---- the runtime's live target files, patched or not ----
const root = path.join(runtime, "openclaw");
const dist = path.join(root, "dist");
const targets = TARGETS.map((target) => {
  const dir = path.join(root, target.dir);
  // The runtime can hold stale chunks next to the live one; exactly one must define the anchor.
  const live = fs.readdirSync(dir).filter((f) => target.pattern.test(f))
    .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes(target.needle));
  assert.equal(live.length, 1, `expected one live ${target.name} file, found ${live}`);
  const file = path.join(dir, live[0]);
  const before = fs.readFileSync(file, "utf8");
  if (applyPatch) fs.writeFileSync(file, target.patch(before));
  const after = fs.readFileSync(file, "utf8");
  return { name: target.name, file: path.relative(root, file), beforeSha256: sha(before), afterSha256: sha(after), patched: after.includes(IMAGE_MARKER) || after.includes(NOTICE_MARKER) };
});

// ---- provider: core completeSimple -> built-in openai-completions provider ----
async function providerPart() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (c) => { bytes += c.length; chunks.push(c); });
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
      const images = JSON.stringify(body.messages ?? []).match(/data:image\//gu)?.length ?? 0;
      requests.push({ path: req.url, bytes, model: body.model, max_tokens: body.max_tokens ?? body.max_completion_tokens, images });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
      res.end(chunk({ role: "assistant", content: "看到了一张图片" }, null) + chunk({}, "stop", { prompt_tokens: 9000, completion_tokens: 6, total_tokens: 9006 }) + "data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    // The chunk that registers the built-in providers on the default registry also exports completeSimple.
    const streamChunks = fs.readdirSync(dist).filter((f) => /^stream-[\w-]+\.js$/u.test(f))
      .filter((f) => fs.readFileSync(path.join(dist, f), "utf8").includes("registerBuiltInApiProviders(defaultApiRegistry)"));
    assert.equal(streamChunks.length, 1, `core stream chunk: ${streamChunks}`);
    const source = fs.readFileSync(path.join(dist, streamChunks[0]), "utf8");
    const alias = source.match(/\bcompleteSimple as (\w+)\b/u)?.[1];
    assert(alias, "completeSimple export");
    const completeSimple = (await import(path.join(dist, streamChunks[0])))[alias];
    const model = {
      id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", api: "openai-completions", provider: "deepseek",
      baseUrl: `http://127.0.0.1:${port}/v1`, reasoning: false, input: ["text", "image"],
      contextWindow: 1_000_000, maxTokens: 384_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const image = Buffer.alloc(1_800_000, 7).toString("base64"); // ~2.4 MB of base64, like a generated image
    const context = {
      systemPrompt: "candidate test",
      messages: [{ role: "user", timestamp: Date.now(), content: [{ type: "text", text: "这张图里有什么？" }, { type: "image", data: image, mimeType: "image/png" }] }],
    };
    const started = Date.now();
    const message = await completeSimple(model, context, { apiKey: "sk-candidate-loopback", maxTokens: 384_000 });
    const text = (message.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return { ms: Date.now() - started, imageBase64Bytes: image.length, stopReason: message.stopReason, errorMessage: message.errorMessage?.slice(0, 160), text, requests };
  } finally {
    server.close();
  }
}

// ---- notice: private Gateway, real agent turns ----
async function noticePart() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const port = Number(config.gateway?.port);
  const token = config.gateway?.auth?.token;
  assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  // V's compaction settings (VLab differs: model deepseek-v4-pro, midTurnPrecheck off).
  Object.assign(config.agents.defaults.compaction, { model: "deepseek/deepseek-flash", midTurnPrecheck: { enabled: true } });
  const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
  assert(workerPlugin, "candidate Worker plugin configuration is missing");
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs
    .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  // The Worker reads its own copy of the configuration (V keeps the two in step by hand).
  if (workerConfig.agents?.defaults?.compaction) Object.assign(workerConfig.agents.defaults.compaction, { model: "deepseek/deepseek-flash", midTurnPrecheck: { enabled: true } });
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
  config.agents.entries.makaron.models ??= {};
  config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"] = {
    ...config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"],
    agentRuntime: { id: "openclaw" },
  };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow)) for (const ref of ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"]) if (!allow.includes(ref)) allow.push(ref);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  // Shared VLab loads its managed plugins from state/npm; without a copy the Gateway refuses to start.
  if (!fs.existsSync(path.join(stateDir, "npm"))) {
    assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
  }
  const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
  for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
  const env = {
    ...process.env,
    OPENCLAW_GATEWAY_PORT: String(port),
    TMPDIR: path.join(scratch, "tmp"),
    XDG_CACHE_HOME: path.join(scratch, "cache"),
    npm_config_cache: path.join(scratch, "cache", "npm"),
  };
  const key = secret("DEEPSEEK_API_KEY");
  if (key) env.DEEPSEEK_API_KEY = key;

  // ~2.1 MB of ASCII: the guard (two bytes per token) sees ~1.05M tokens, more than DeepSeek v4's
  // 1M window; the generic precheck (about four characters per token) sees ~0.53M and lets it through.
  const promptFile = path.join(scratch, "tmp", "oversized-prompt.txt");
  const filler = Array.from({ length: 21_000 }, (_, i) => `line ${String(i).padStart(5, "0")}: the quick brown fox jumps over the lazy dog, again and again and again.`).join("\n");
  fs.writeFileSync(promptFile, `这是一次自动化测试。下面是一段很长的材料，读完后只回复「已读」。\n${filler}\n`);

  const lines = [];
  let gateway;
  let gatewayStarts = 0;
  const startGateway = () => {
    gatewayStarts += 1;
    gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [gateway.stdout, gateway.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
        if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
      });
    }
  };
  let client;
  const chatEvents = [];
  const connectGateway = async () => {
    const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
    const deadline = Date.now() + 900_000;
    let lastError;
    while (Date.now() < deadline) {
      if (gateway.exitCode !== null) {
        if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
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
            onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) chatEvents.push({ at: Date.now(), ...e.payload }); },
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
  };
  const visibleHistory = async (sessionKey) => {
    try {
      const res = await client.request("chat.history", { sessionKey, limit: 20 });
      return (res?.messages ?? []).filter((m) => m.role === "assistant").map((m) => {
        const c = Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content ?? "") }];
        return { model: m.model, stopReason: m.stopReason, texts: c.filter((b) => b.type === "text").map((b) => b.text.slice(0, 200)), errorMessage: m.errorMessage?.slice(0, 200) };
      });
    } catch (error) {
      return { error: String(error?.message ?? error).slice(0, 200) };
    }
  };
  const SCENARIOS = { worker: "deepseek/deepseek-v4-flash", "in-process": "deepseek/deepseek-v4-pro" };
  const textOf = (message) => {
    if (!message) return "";
    if (typeof message === "string") return message;
    if (typeof message.content === "string") return message.content;
    return (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
  };
  const overflowLog = (mark) => lines.slice(mark).map((l) => l.line.replace(/\u001b\[\d+m/gu, ""))
    .filter((l) => /context-overflow|overflow recovery|auto-compaction|compaction failed|V_DEEPSEEK|failed before reply/iu.test(l));
  // chat.send is the reply path channels use (auto-reply runner); `openclaw agent` is the CLI/RPC path.
  const runChat = async (sessionKey, model) => {
    const sent = await client.request("chat.send", { agentId: "makaron", sessionKey, message: fs.readFileSync(promptFile, "utf8"),
      deliver: false, timeoutMs: 600_000, idempotencyKey: `ds-budget-notice-${Date.now()}` });
    const runId = sent?.runId;
    assert(runId, `chat.send returned no runId: ${JSON.stringify(sent).slice(0, 200)}`);
    const waited = await client.request("agent.wait", { runId, timeoutMs: 600_000 }, { timeoutMs: 620_000 });
    await sleep(2_000);
    const events = chatEvents.filter((e) => e.runId === runId);
    const terminal = events.filter((e) => ["final", "error", "aborted"].includes(e.state));
    return { runId, waitStatus: waited?.status, texts: terminal.map((e) => textOf(e.message) || String(e.errorMessage ?? "")).filter(Boolean),
      states: terminal.map((e) => e.state) };
  };
  const runCli = (sessionKey, model) => {
    const r = spawnSync(process.execPath, [
      `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
      "--model", model, "--message-file", promptFile, "--json", "--timeout", "600",
    ], { env, encoding: "utf8", timeout: 720_000, maxBuffer: 64 * 1024 * 1024 });
    let meta;
    try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
    const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
    // A failed run has no payloads; the CLI prints the error as "Reason: …".
    const reason = /Reason: (.*)/u.exec(r.stderr ?? "")?.[1];
    return { exit: r.status, texts: [...payloads.map((p) => String(p?.text ?? "")), ...(reason ? [reason] : [])].filter(Boolean) };
  };
  const runTurn = async (name, via) => {
    const model = SCENARIOS[name];
    if (via === "chat") {
      // chat.send has no per-message model; pin the session's model first.
      const sessionKey = `agent:makaron:feishu:direct:ou_ds_budget_${name.replace(/\W/gu, "_")}_chat_${Date.now()}`;
      await client.request("sessions.patch", { key: sessionKey, model });
      const mark = lines.length;
      const started = Date.now();
      const out = await runChat(sessionKey, model);
      return finish({ name, via, model, sessionKey, started, mark, ...out });
    }
    const sessionKey = `agent:makaron:feishu:direct:ou_ds_budget_${name.replace(/\W/gu, "_")}_cli_${Date.now()}`;
    const mark = lines.length;
    const started = Date.now();
    const out = runCli(sessionKey, model);
    await sleep(1_500);
    return finish({ name, via, model, sessionKey, started, mark, ...out });
  };
  const finish = async (r) => {
    const log = overflowLog(r.mark);
    return {
      name: r.name, via: r.via, model: r.model, sessionKey: r.sessionKey, exit: r.exit, waitStatus: r.waitStatus, states: r.states,
      secs: Math.round((Date.now() - r.started) / 1000),
      userTexts: r.texts.map((t) => t.slice(0, 240)),
      guardRefused: log.some((l) => l.includes(GUARD_CODE)),
      sawChinese: r.texts.some((t) => t.includes(CHINESE)),
      // Anything else the user got: English overflow/recovery copy, generic failures.
      otherTexts: r.texts.filter((t) => !t.includes(CHINESE)).map((t) => t.slice(0, 160)),
      runLog: log.map((l) => redact(l).slice(0, 360)).slice(-10),
      history: await visibleHistory(r.sessionKey),
    };
  };

  const startedAt = Date.now();
  startGateway();
  try {
    await connectGateway();
    const readyMs = Date.now() - startedAt;
    const results = [];
    for (const via of paths) for (const name of scenarios) results.push(await runTurn(name, via));
    // Regression: an ordinary short turn on each runtime still gets its real reply.
    const normal = [];
    for (const name of scenarios) {
      const sessionKey = `agent:makaron:feishu:direct:ou_ds_budget_${name.replace(/\W/gu, "_")}_normal_${Date.now()}`;
      await client.request("sessions.patch", { key: sessionKey, model: SCENARIOS[name] });
      const started = Date.now();
      const sent = await client.request("chat.send", { agentId: "makaron", sessionKey, message: "这是一次自动化测试，只回复：收到",
        deliver: false, timeoutMs: 300_000, idempotencyKey: `ds-budget-normal-${Date.now()}` });
      const waited = await client.request("agent.wait", { runId: sent?.runId, timeoutMs: 300_000 }, { timeoutMs: 320_000 });
      await sleep(2_000);
      const terminal = chatEvents.filter((e) => e.runId === sent?.runId && ["final", "error", "aborted"].includes(e.state));
      normal.push({ name, model: SCENARIOS[name], waitStatus: waited?.status, secs: Math.round((Date.now() - started) / 1000),
        states: terminal.map((e) => e.state), texts: terminal.map((e) => textOf(e.message) || String(e.errorMessage ?? "")).map((t) => t.slice(0, 120)) });
    }
    return { readyMs, promptBytes: fs.statSync(promptFile).size, results, normal };
  } catch (error) {
    console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
    throw error;
  } finally {
    client?.stop();
    gateway.kill("SIGTERM");
    await sleep(3_000);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
}

const out = { applyPatch, targets };
let failure;
try {
  if (parts.includes("provider")) out.provider = await providerPart();
  if (parts.includes("notice")) out.notice = await noticePart();
} catch (error) {
  failure = error;
}
console.log(JSON.stringify(out, null, 1));
if (failure) throw failure;

if (out.provider) {
  const p = out.provider;
  if (applyPatch) {
    assert.equal(p.requests.length, 1, "patched: the image request must reach the provider");
    assert(p.requests[0].bytes > 2_000_000 && p.requests[0].images === 1, "patched: the request carries the image");
    assert.equal(p.stopReason, "stop");
    assert.equal(p.text, "看到了一张图片");
  } else {
    assert.equal(p.requests.length, 0, "V today: the provider is never called");
    assert.match(p.errorMessage ?? "", new RegExp(GUARD_CODE), "V today: refused by the budget guard");
  }
}
if (out.notice) {
  for (const n of out.notice.normal) {
    assert(n.states.includes("final") && n.texts.some((t) => t.includes("收到")), `${n.name}: an ordinary turn did not get its reply: ${JSON.stringify(n)}`);
    assert(!n.texts.some((t) => t.includes(CHINESE)), `${n.name}: an ordinary turn got the budget notice`);
  }
  const covered = out.notice.results.filter((r) => r.guardRefused);
  assert(covered.length > 0, "the budget guard never refused a turn; the scenario exercised nothing");
  assert(covered.some((r) => r.via === "chat"), "no channel-path (chat.send) turn reached the guard");
  for (const r of covered) {
    const where = `${r.via}/${r.name}`;
    assert(r.userTexts.length > 0, `${where}: the user got no text at all`);
    if (applyPatch) {
      assert(r.sawChinese, `${where}: the user did not get the Chinese notice: ${JSON.stringify(r.userTexts)}`);
      assert.deepEqual(r.otherTexts, [], `${where}: the user also got other text`);
    } else {
      assert(!r.sawChinese && r.otherTexts.some((t) => /context overflow|compaction/iu.test(t)), `${where}: V today should deliver English overflow copy: ${JSON.stringify(r.userTexts)}`);
    }
  }
}
