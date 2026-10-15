// Candidate for lab/release-files/upstream-5xx-fallback (2026-10-15): when DeepSeek answers
// 503 "Service is too busy" / 429 / 5xx, does V switch to the configured fallback model, and how
// long does the user wait for a visible reply?
//
// Private Gateways with one Worker each, V's model setup (deepseek/deepseek-flash primary,
// xai/grok-4.6 fallback, both on the vlab-worker runtime). Both providers point at a loopback
// stand-in: /v1/chat/completions plays DeepSeek, /v1/responses plays Grok. Arms:
//   A = the runtime's live bytes (checked equal to V's before shas of the release files)
//   B = the same runtime with the release files installed (only when the plan lists files)
// DeepSeek's behaviour per turn is chosen by a tag in the user message:
//   ok    normal answer (control)
//   pre   every request of the turn: HTTP 503 "Service is too busy ..." before any token
//   pre1  first request 503, later requests answer (one quick same-model retry is enough)
//   r429  every request: HTTP 429 rate limit
//   r500  every request: HTTP 500 internal server error
//   tool  first request streams text + a read tool call; every later request 503
//   toolw first request streams text + a write tool call (a side effect); every later request 503
//   toolw1 like toolw, but only the first request after the tool fails; then DeepSeek answers
//   mid   streams half an answer, then the connection drops (no finish_reason)
//   r504  every request: HTTP 504 gateway timeout
//   hang  every request: 200 + SSE headers, then silence until the provider timeout (FB_DS_TIMEOUT_S)
// FB_RUNTIME=embedded runs both models inside the Gateway instead of the vlab-worker.
// Per turn we record chat.send -> first visible text, -> final, the final text, which stand-in
// endpoint produced it, and the model requests in order.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const runtimeB = process.env.VLAB_CANDIDATE_RUNTIME;
const configPathB = process.env.OPENCLAW_CONFIG_PATH;
const stateB = process.env.OPENCLAW_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateB);
assert(runtimeB && configPathB && stateB, "candidate runtime environment is required");
const SCENARIOS = (process.env.FB_SCENARIOS ?? "ok,pre,pre1,r429,r500,tool,toolw,toolw1,mid").split(",").filter(Boolean);
const REPEAT = Number(process.env.FB_REPEAT ?? 1);
const EMBEDDED = process.env.FB_RUNTIME === "embedded";
const TURN_TIMEOUT_MS = Number(process.env.FB_TURN_TIMEOUT_MS ?? 900_000);
const BUSY = "Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

// ---- runtimes: A keeps the live bytes, B gets the patch ----
// B applies the same patch functions the release build applies to V's bytes
// (lab/build-upstream-5xx-fallback.mjs), here to the runtime's own bytes: shared VLab can differ
// from V in files the patch does not touch (2026-10-15: history-image-e3 staged; worker.mjs without
// V's heartbeat-v2 guard). The release files themselves are checked against V's bytes by
// lab/upstream-5xx-fallback.test.mjs.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { FILES } = await import(path.join(repoRoot, "lab/build-upstream-5xx-fallback.mjs"));
const withB = process.env.FB_ARMS !== "A";
const runtimeA = path.join(scratch, "runtime-a");
const installed = [];
{
  if (!fs.existsSync(runtimeA)) assert.equal(spawnSync("cp", ["-a", runtimeB, runtimeA]).status, 0, "copy runtime for A");
  if (withB && process.env.FB_INSTALL_PLAN) {
    // Install a release plan exactly as shipped (byte-for-byte sources, before-checked).
    const plan = JSON.parse(fs.readFileSync(path.join(repoRoot, process.env.FB_INSTALL_PLAN), "utf8"));
    for (const file of plan.files) {
      const target = path.join(runtimeB, file.target);
      const live = fs.existsSync(target) ? fs.readFileSync(target) : null;
      assert.equal(live === null ? null : sha(live), file.before, `${file.target}: runtime bytes differ from the plan's before`);
      fs.writeFileSync(`${target}.next`, fs.readFileSync(path.join(repoRoot, file.source)));
      fs.renameSync(`${target}.next`, target);
      installed.push({ target: file.target, before: file.before, b: sha(fs.readFileSync(target)), fromPlan: process.env.FB_INSTALL_PLAN });
    }
  }
  for (const file of withB && !process.env.FB_INSTALL_PLAN ? FILES : []) {
    const target = path.join(runtimeB, file.target, file.name);
    const live = fs.readFileSync(target, "utf8");
    const next = file.patch(live);
    fs.writeFileSync(`${target}.next`, next);
    fs.renameSync(`${target}.next`, target);
    installed.push({ target: `${file.target}/${file.name}`, live: sha(live), vBefore: file.before, liveIsV: sha(live) === file.before, b: sha(next) });
  }
}

// ---- unit tests against the real 9.1 modules (runtime A = live bytes) ----
const unit = spawnSync(process.execPath, ["--test", "--test-name-pattern", "classification", path.join(repoRoot, "lab/upstream-5xx-fallback.runtime.test.mjs")], {
  encoding: "utf8", env: { ...process.env, OPENCLAW_DIST: path.join(runtimeA, "openclaw", "dist") } });
const unitTests = { status: unit.status, summary: (unit.stdout ?? "").split("\n").filter((l) => /^[✔✖﹣ℹ]|^ok|not ok|# (pass|fail|skip)/u.test(l)).slice(0, 40),
  ...(unit.status === 0 ? {} : { output: `${unit.stdout ?? ""}\n${unit.stderr ?? ""}`.slice(-6000) }) };
log(`unit tests exit=${unit.status}`);

// ---- loopback stand-ins ----
const requests = [];
const hanging = new Set();
const other = [];
const tagOf = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = m?.role;
    if (role !== "user") continue;
    const content = m.content;
    const text = typeof content === "string" ? content : (content ?? []).map((b) => b.text ?? "").join("");
    const t = /\[fb (\w+) (\w+) (\d+)\]/u.exec(text);
    if (!t) continue;
    const later = messages.slice(i + 1);
    const afterTool = later.some((x) => (x?.role === "assistant" && (x.tool_calls ?? []).length > 0) || x?.type === "function_call");
    return { arm: t[1], scenario: t[2], n: Number(t[3]), step: afterTool ? "after-tool" : "start" };
  }
};
const ownerOf = (port) => {
  const r = spawnSync("ss", ["-tnpH", "state", "established", `( sport = :${port} )`], { encoding: "utf8" });
  const pid = /pid=(\d+)/u.exec(r.stdout ?? "")?.[1];
  if (!pid) return { pid: null };
  let cmd = "";
  try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" "); } catch {}
  return { pid: Number(pid), worker: /worker\.mjs/u.test(cmd) };
};
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const USAGE = { prompt_tokens: 9000, completion_tokens: 20, total_tokens: 9020 };
const DS_ANSWER = "DeepSeek 的回答：一切正常。";
const GROK_ANSWER = "Grok 备用模型的回答：已经接上。";
const PARTIAL = "这是 DeepSeek 前半段回答，";
const deepseek = (req, res, body, turn) => {
  const model = body.model;
  const sendText = (text) => { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(ccChunk(model, { role: "assistant", content: text }, null) + ccChunk(model, {}, "stop", USAGE) + "data: [DONE]\n\n"); };
  const fail = (status, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message } })); };
  if (!turn) return sendText("ok");
  const seen = requests.filter((r) => r.provider === "deepseek" && r.arm === turn.arm && r.scenario === turn.scenario && r.n === turn.n).length;
  switch (turn.scenario) {
    case "ok": return sendText(DS_ANSWER);
    case "pre": return fail(503, BUSY);
    case "pre1": return seen <= 1 ? fail(503, BUSY) : sendText(DS_ANSWER);
    case "r429": return fail(429, "Rate limit reached for requests");
    case "r500": return fail(500, "Internal Server Error");
    case "r504": return fail(504, "Gateway Timeout");
    case "hang": { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(": keep-alive\n\n"); hanging.add(res); return; }
    case "tool": {
      if (turn.step === "after-tool") return fail(503, BUSY);
      const read = (body.tools ?? []).map((t) => t.function?.name).find((n) => n === "read") ?? "read";
      res.writeHead(200, { "content-type": "text/event-stream" });
      return res.end(ccChunk(model, { role: "assistant", content: "我先查一下说明文件。" }, null)
        + ccChunk(model, { tool_calls: [{ index: 0, id: `call_fb_${turn.n}`, type: "function", function: { name: read, arguments: JSON.stringify({ path: "AGENTS.md" }) } }] }, null)
        + ccChunk(model, {}, "tool_calls", USAGE) + "data: [DONE]\n\n");
    }
    case "toolw":
    case "toolw1": {
      if (turn.step === "after-tool") {
        const afterTool = requests.filter((r) => r.provider === "deepseek" && r.arm === turn.arm && r.scenario === turn.scenario && r.n === turn.n && r.step === "after-tool").length;
        return turn.scenario === "toolw1" && afterTool > 1 ? sendText(DS_ANSWER) : fail(503, BUSY);
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      return res.end(ccChunk(model, { role: "assistant", content: "我先记一笔。" }, null)
        + ccChunk(model, { tool_calls: [{ index: 0, id: `call_fbw_${turn.n}`, type: "function", function: { name: "write", arguments: JSON.stringify({ path: `fb-scratch/${turn.arm}-${turn.n}-${Date.now()}.txt`, content: "fallback test\n" }) } }] }, null)
        + ccChunk(model, {}, "tool_calls", USAGE) + "data: [DONE]\n\n");
    }
    case "mid": {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(ccChunk(model, { role: "assistant", content: PARTIAL }, null));
      setTimeout(() => res.socket?.destroy(), 400);
      return;
    }
    default: return fail(400, `unknown scenario ${turn.scenario}`);
  }
};
const grok = (req, res, body) => {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const item = { type: "message", id: "msg_fb", role: "assistant", status: "completed", content: [{ type: "output_text", text: GROK_ANSWER, annotations: [] }] };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ev("response.created", { response: { id: "resp_fb", object: "response", status: "in_progress", model: body.model, output: [] } })
    + ev("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress", content: [] } })
    + ev("response.content_part.added", { item_id: "msg_fb", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } })
    + ev("response.output_text.delta", { item_id: "msg_fb", output_index: 0, content_index: 0, delta: GROK_ANSWER })
    + ev("response.output_text.done", { item_id: "msg_fb", output_index: 0, content_index: 0, text: GROK_ANSWER })
    + ev("response.content_part.done", { item_id: "msg_fb", output_index: 0, content_index: 0, part: item.content[0] })
    + ev("response.output_item.done", { output_index: 0, item })
    + ev("response.completed", { response: { id: "resp_fb", object: "response", status: "completed", model: body.model, output: [item], usage: { input_tokens: 9000, output_tokens: 20, total_tokens: 9020 } } }));
};
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    const isGrok = /\/responses\b/u.test(req.url ?? "");
    const messages = isGrok ? (Array.isArray(body.input) ? body.input : []) : (Array.isArray(body.messages) ? body.messages : []);
    const turn = tagOf(isGrok ? messages.map((m) => ({ ...m, role: m.role ?? m.type, content: Array.isArray(m.content) ? m.content.map((b) => ({ text: b.text })) : m.content })) : messages);
    const owner = ownerOf(req.socket.remotePort);
    if (!turn) other.push({ at, url: req.url, model: body.model, owner });
    else requests.push({ at, provider: isGrok ? "xai" : "deepseek", url: req.url, model: body.model, ...turn, messages: messages.length, owner });
    if (isGrok) return grok(req, res, body);
    if (/\/chat\/completions\b/u.test(req.url ?? "")) return deepseek(req, res, body, turn);
    res.writeHead(404); res.end();
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const standinPort = server.address().port;

// ---- Gateways ----
const portRangeFree = async (base, span) => {
  for (let p = base; p < base + span; p++) {
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(true))); });
    if (!ok) return false;
  }
  return true;
};
const configB = JSON.parse(fs.readFileSync(configPathB, "utf8"));
const portB = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(portB) && token, "candidate Gateway port/token missing");

const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const V_GROK = { id: "grok-4.6", name: "Grok 4.6", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 500000, maxTokens: 64000 };
const asV = (config) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const providers = config.models.providers;
  const ds = providers.deepseek;
  Object.assign(ds, { baseUrl: `http://127.0.0.1:${standinPort}/v1`, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" }, timeoutSeconds: Number(process.env.FB_DS_TIMEOUT_S ?? 300) });
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  providers.xai = { ...(providers.xai ?? {}), baseUrl: `http://127.0.0.1:${standinPort}/v1`, apiKey: "xai-standin-loopback", api: "openai-responses" };
  providers.xai.models = [...(providers.xai.models ?? []).filter((m) => m.id !== V_GROK.id), V_GROK];
  const rt = { agentRuntime: { id: "vlab-worker" } };
  const dsEntry = { alias: "deepseek", ...rt, params: { thinking: "high" } };
  const model = { primary: "deepseek/deepseek-flash", fallbacks: ["xai/grok-4.6"] };
  config.agents.defaults.model = model;
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), "deepseek/deepseek-flash": dsEntry, "xai/grok-4.6": rt };
  const makaron = config.agents.entries.makaron;
  makaron.model = model;
  makaron.models = { ...(makaron.models ?? {}), "deepseek/deepseek-flash": dsEntry };
  const allow = config.agents.defaults.modelPolicy?.allow;
  for (const ref of ["deepseek/deepseek-flash", "xai/grok-4.6"]) if (Array.isArray(allow) && !allow.includes(ref)) allow.push(ref);
  if (config.agents.defaults.compaction) Object.assign(config.agents.defaults.compaction, { model: "deepseek/deepseek-flash" });
  if (EMBEDDED) {
    // Both models run inside the Gateway on the built-in OpenClaw runtime, no vlab-worker.
    const openclaw = { id: "openclaw" };
    ds.agentRuntime = openclaw;
    providers.xai.agentRuntime = openclaw;
    for (const entries of [config.agents.defaults.models, makaron.models]) for (const ref of ["deepseek/deepseek-flash", "xai/grok-4.6"]) if (entries?.[ref]) entries[ref].agentRuntime = openclaw;
    makaron.agentRuntime = undefined;
    // The candidate's copied OpenAI OAuth order is not usable here and the embedded runner checks it.
    if (config.auth?.order?.openai) delete config.auth.order.openai;
  }
  return config;
};

const workerPluginB = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginB, "candidate Worker plugin configuration is missing");
Object.assign(workerPluginB, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPathB });
const workerRel = path.relative(stateB, workerPluginB.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const workerConfigB = asV(JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateB).replaceAll(sharedRuntime, runtimeB)));
fs.mkdirSync(path.dirname(workerPluginB.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPluginB.workerConfigPath, `${JSON.stringify(workerConfigB, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPathB, `${JSON.stringify(asV(configB), null, 2)}\n`, { mode: 0o600 });
if (!fs.existsSync(path.join(stateB, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");
}

const cloneArm = async (from, name, runtime) => {
  const state = path.join(scratch, `arm-${name}`);
  fs.rmSync(state, { recursive: true, force: true });
  assert.equal(spawnSync("cp", ["-a", from.state, state]).status, 0, `copy state for ${name}`);
  let port = from.port + 40;
  while (!(await portRangeFree(port, 12))) port += 13;
  const configPath = path.join(state, `openclaw-${name}.json`);
  const rewrite = (text) => text.replaceAll(from.configPath, configPath).replaceAll(from.state, state).replaceAll(from.runtime, runtime).replaceAll(`"port": ${from.port}`, `"port": ${port}`);
  fs.writeFileSync(configPath, rewrite(fs.readFileSync(from.configPath, "utf8")), { mode: 0o600 });
  fs.writeFileSync(path.join(state, workerRel), rewrite(fs.readFileSync(path.join(from.state, workerRel), "utf8")), { mode: 0o600 });
  return { name, runtime, state, configPath, port };
};

const startGateway = async (arm) => {
  const tmp = path.join(scratch, `tmp-${arm.name}`);
  for (const dir of [tmp, path.join(scratch, `cache-${arm.name}`)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).replaceAll(configPathB, arm.configPath).replaceAll(stateB, arm.state).replaceAll(runtimeB, arm.runtime)]));
  const env = { ...base, OPENCLAW_CONFIG_PATH: arm.configPath, OPENCLAW_STATE_DIR: arm.state, OPENCLAW_GATEWAY_PORT: String(arm.port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, `cache-${arm.name}`), npm_config_cache: path.join(scratch, `cache-${arm.name}`, "npm") };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  const dist = path.join(arm.runtime, "openclaw", "dist");
  const lines = [];
  let starts = 0;
  const launch = () => {
    starts += 1;
    arm.proc = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(arm.port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [arm.proc.stdout, arm.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 40000) lines.splice(0, lines.length - 40000); });
    }
  };
  arm.lines = lines;
  arm.events = [];
  const t0 = Date.now();
  launch();
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (arm.proc.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { launch(); continue; }
      throw new Error(`${arm.name} Gateway exited ${arm.proc.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { arm.client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        arm.client = new GatewayClient({
          url: `ws://127.0.0.1:${arm.port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) arm.events.push({ at: Date.now(), ...e.payload }); },
        });
        arm.client.start();
      });
      arm.readyMs = Date.now() - t0;
      await sleep(15_000);
      log(`${arm.name} ready in ${arm.readyMs} ms on port ${arm.port}`);
      return arm;
    } catch (error) {
      lastError = error;
      arm.client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error(`${arm.name} Gateway did not become ready`);
};
const stopGateway = async (arm) => {
  arm.client?.stop();
  arm.proc?.kill("SIGTERM");
  for (let i = 0; i < 30 && arm.proc?.exitCode === null; i++) await sleep(1_000);
  if (arm.proc?.exitCode === null) arm.proc.kill("SIGKILL");
  await sleep(2_000);
};

const textOf = (message) => !message ? "" : typeof message === "string" ? message : typeof message.content === "string" ? message.content
  : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const DECISION_RE = /failover decision|model fallback decision|transient|empty-error-retry|incomplete turn|Trying next account|fallback|grok|continuation|retry|Worker Agent|agent end|harness|failover|surfac|replay|error/iu;
const NOISE_RE = /firsttext-|prompt-prep|memory-prep|bundle-prep|project-memory|card-phase|CLIENT-SIDE HEARTBEAT|sqlite\/transaction|\[diagnostic\] (?:lane|session)/u;
const runTurn = async (arm, scenario, n) => {
  const sessionKey = `agent:makaron:feishu:direct:ou_fb_${arm.name}_${scenario}_${n}`;
  const message = `[fb ${arm.name} ${scenario} ${n}] 帮我简单说明一下现在的情况。`;
  const t0 = Date.now();
  const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `fb-${arm.name}-${scenario}-${n}-${t0}` });
  assert(sent?.runId, `${arm.name} ${scenario}: chat.send returned no runId`);
  let waited;
  try { waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }); } catch (error) { waited = { status: `wait-error:${error.message}` }; }
  const t1 = Date.now();
  await sleep(1_500);
  const mine = requests.filter((r) => r.arm === arm.name && r.scenario === scenario && r.n === n);
  const events = arm.events.filter((e) => e.runId === sent.runId);
  const firstText = events.find((e) => textOf(e.message).trim());
  const terminal = events.filter((e) => ["final", "error", "aborted"].includes(e.state));
  const finalText = terminal.map((e) => textOf(e.message) || e.errorMessage || "").join(" | ");
  let history;
  try { history = await arm.client.request("chat.history", { sessionKey, limit: 20 }); } catch {}
  const transcript = (history?.messages ?? []).filter((m) => m.role === "assistant").map((m) => ({ model: m.model ?? m.provider, stopReason: m.stopReason, text: textOf(m).slice(0, 160), error: m.errorMessage?.slice(0, 160) }));
  return { arm: arm.name, scenario, n, waitStatus: waited?.status, totalMs: t1 - t0,
    firstTextMs: firstText ? firstText.at - t0 : null, firstText: firstText ? textOf(firstText.message).slice(0, 80) : null,
    states: terminal.map((e) => e.state), finalText: finalText.slice(0, 400),
    // What a streaming card would show over time: each distinct delta snapshot, in order.
    deltaSnapshots: events.filter((e) => e.state === "delta").map((e) => `${Math.round((e.at - t0) / 100) / 10}s ${textOf(e.message).slice(0, 80)}`).filter((v, i, a) => i === 0 || v.slice(v.indexOf(" ")) !== a[i - 1].slice(a[i - 1].indexOf(" "))).slice(0, 20),
    answeredBy: finalText.includes("Grok 备用模型") ? "grok" : finalText.includes("DeepSeek 的回答") ? "deepseek" : "none",
    partialKept: finalText.includes(PARTIAL) || finalText.includes("我先查一下"),
    requests: mine.map((r) => `${Math.round((r.at - t0) / 100) / 10}s ${r.provider}/${r.step}${r.owner?.worker ? "" : "(gw)"}`),
    transcript,
    decisions: arm.lines.filter((l) => l.at >= t0 && l.at <= t1 + 1500 && DECISION_RE.test(l.line) && !NOISE_RE.test(l.line)).map((l) => `${Math.round((l.at - t0) / 100) / 10}s ${redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").slice(0, 400)}`).slice(0, 120) };
};

const armB = { name: "B", runtime: runtimeB, state: stateB, configPath: configPathB, port: portB };
const results = [];
let armA;
try {
  armA = await cloneArm(armB, "A", runtimeA);
  const arms = withB ? [armA, armB] : [armA];
  for (const arm of arms) await startGateway(arm);
  for (const arm of arms) {
    const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey: `agent:makaron:feishu:direct:ou_fb_warm_${arm.name}`, message: "预热，回复 ok", deliver: false, timeoutMs: 300_000, idempotencyKey: `fb-warm-${arm.name}-${Date.now()}` });
    await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 300_000 }, { timeoutMs: 320_000 });
  }
  for (let n = 1; n <= REPEAT; n++) {
    for (const scenario of SCENARIOS) {
      const order = n % 2 ? arms : [...arms].reverse();
      for (const arm of order) {
        const r = await runTurn(arm, scenario, n);
        results.push(r);
        log(JSON.stringify(r, null, 1));
      }
    }
  }
} finally {
  for (const arm of [armA, armB]) if (arm?.proc && arm.proc.exitCode === null) await stopGateway(arm);
  for (const res of hanging) res.destroy();
  server.close();
}

const out = {
  runtime: EMBEDDED ? "embedded" : "vlab-worker", dsTimeoutS: Number(process.env.FB_DS_TIMEOUT_S ?? 300), unitTests, installed, standinPort, scenarios: SCENARIOS, repeat: REPEAT, ready: { A: armA?.readyMs, B: withB ? armB.readyMs : null },
  summary: results.map(({ arm, scenario, n, totalMs, firstTextMs, answeredBy, partialKept, states, finalText }) => ({ arm, scenario, n, totalS: Math.round(totalMs / 100) / 10, firstTextS: firstTextMs == null ? null : Math.round(firstTextMs / 100) / 10, answeredBy, partialKept, states: states.join(","), finalText: finalText.slice(0, 160) })),
  otherRequests: other.length,
  results,
};
const outPath = process.env.FB_OUT ?? path.join(scratch, "upstream-5xx-fallback-result.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
