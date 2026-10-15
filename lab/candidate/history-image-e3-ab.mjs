// Candidate A/B for lab/release-files/history-image-e3 (#355 history images are no longer
// resized + #345 DeepSeek budget follow-up), 2026-10-15.
//
// Two private Gateways run side by side, each with its own runtime copy, state and one Worker:
//   A = the runtime's live bytes (byte-identical to V for the five target files, checked below)
//   B = the same runtime with the five release files installed
// Both use V's model setup (deepseek/deepseek-flash, vision, vlab-worker runtime), pointed at a
// loopback DeepSeek stand-in. Every bench turn the stand-in first asks for view_image on a fresh
// 2400x3200 photo, so the session collects one 2048 px history image per turn like V's long image
// sessions since #322, then answers. Turns alternate A/B (ABBA order) on identical sessions.
//
// Per turn we record command -> first model request (chat.send to the stand-in seeing the turn's
// first request), and for every model request the images (sha256 of each data URL) and text blocks
// in order, so A and B requests can be compared byte for byte.
//
// Phase 2 (kill switch): A is stopped, its state is copied, and C = B's runtime with
// OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0 starts on the copy; then B and C alternate. C must be as
// slow as A and send the same requests as B.
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
const TURNS = Number(process.env.AB_TURNS ?? 40);
const SWITCH_TURNS = Number(process.env.AB_SWITCH_TURNS ?? 6);
const SESSION_KEY = "agent:makaron:feishu:direct:ou_history_image_bench";
const MARKER = "[image data removed - already processed by model]";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

// ---- runtimes: A keeps the live bytes, B gets the release files ----
const RELEASE = JSON.parse(fs.readFileSync(new URL("../history-image-e3.plan.json", import.meta.url), "utf8"));
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const runtimeA = path.join(scratch, "runtime-a");
const installed = [];
{
  const t = Date.now();
  if (!fs.existsSync(runtimeA)) assert.equal(spawnSync("cp", ["-a", runtimeB, runtimeA]).status, 0, "copy runtime for A");
  log(`runtime A copied in ${Date.now() - t} ms`);
  for (const file of RELEASE.files) {
    const target = path.join(runtimeB, file.target);
    const live = fs.readFileSync(target);
    assert.equal(sha(live), file.before, `${file.target}: shared VLab bytes differ from V's`);
    const next = fs.readFileSync(path.join(repoRoot, file.source));
    fs.writeFileSync(`${target}.next`, next);
    fs.renameSync(`${target}.next`, target);
    installed.push({ target: file.target, a: sha(fs.readFileSync(path.join(runtimeA, file.target))), b: sha(fs.readFileSync(target)) });
  }
  for (const f of installed) assert.notEqual(f.a, f.b);
}

// ---- photos: 2400x3200, distinct per turn ----
// Inside makaron's workspace (shared by the arms, read only): view_image only reads permitted paths.
const photoDir = path.join(JSON.parse(fs.readFileSync(configPathB, "utf8")).agents.entries.makaron.workspace, "bench-photos");
fs.mkdirSync(photoDir, { recursive: true });
{
  const py = `
import sys, random
from PIL import Image, ImageDraw, ImageFilter
out, n = sys.argv[1], int(sys.argv[2])
for k in range(1, n + 1):
    p = f"{out}/photo-{k:03d}.jpg"
    rnd = random.Random(k)
    w, h = 2400, 3200
    base = Image.linear_gradient("L").resize((w, h)).rotate(rnd.randint(0, 359), expand=False)
    img = Image.merge("RGB", (base, base.transpose(Image.FLIP_LEFT_RIGHT), base.transpose(Image.FLIP_TOP_BOTTOM)))
    d = ImageDraw.Draw(img)
    for _ in range(60):
        x, y, r = rnd.randint(0, w), rnd.randint(0, h), rnd.randint(40, 500)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(rnd.randint(0, 255), rnd.randint(0, 255), rnd.randint(0, 255)))
    noise = Image.effect_noise((w, h), 40).convert("RGB")
    img = Image.blend(img, noise, 0.18).filter(ImageFilter.GaussianBlur(0.6))
    img.save(p, "JPEG", quality=88)
`;
  const r = spawnSync("python3", ["-c", py, photoDir, String(TURNS + SWITCH_TURNS + 2)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}
const photo = (k) => path.join(photoDir, `photo-${String(k).padStart(3, "0")}.jpg`);

// ---- loopback DeepSeek stand-in ----
const requests = [];
const debug = [];
const other = [];
// The latest user message carrying a bench tag is the current turn (tool-result images can follow
// as untagged user messages); the turn is past its first call once an assistant tool call follows.
const turnOf = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const text = typeof messages[i].content === "string" ? messages[i].content : (messages[i].content ?? []).map((b) => b.text ?? "").join("");
    const m = /\[bench (\w+) turn (\d+)\]/u.exec(text);
    if (!m) continue;
    const afterTool = messages.slice(i + 1).some((x) => x?.role === "assistant" && (x.tool_calls ?? []).length > 0);
    return { arm: m[1], turn: Number(m[2]), step: afterTool ? "after-tool" : "start" };
  }
};
// Arm-specific directories (state, runtime) appear in the system prompt; compare without them.
const armPaths = [];
const normalize = (text) => armPaths.reduce((t, [from, to]) => t.replaceAll(from, to), text).replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, "<UUID>").replace(/\d/gu, "#").replace(/\[bench \w+ turn/gu, "[bench X turn");
// The request shape the model sees: every content block in order, images as hashes.
const shapeOf = (messages) => messages.map((m) => {
  const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content : [];
  return {
    role: m.role,
    blocks: blocks.map((b) => b.type === "image_url" ? { image: sha(b.image_url?.url ?? ""), bytes: (b.image_url?.url ?? "").length }
      : b.type === "text" ? { text: b.text === MARKER ? "MARKER" : sha(normalize(b.text)) } : { other: b.type }),
    toolCalls: (m.tool_calls ?? []).map((c) => `${c.function?.name}:${sha(String(c.function?.arguments ?? ""))}`),
  };
});
const ownerOf = (port) => {
  const r = spawnSync("ss", ["-tnpH", "state", "established", `( sport = :${port} )`], { encoding: "utf8" });
  const pid = /pid=(\d+)/u.exec(r.stdout ?? "")?.[1];
  if (!pid) return { pid: null };
  let cmd = "";
  try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" "); } catch {}
  return { pid: Number(pid), worker: /worker\.mjs/u.test(cmd), cmd: cmd.slice(0, 200) };
};
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const turn = turnOf(messages);
    const owner = ownerOf(req.socket.remotePort);
    const send = (delta, finish) => {
      const chunk = (d, f, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: d, finish_reason: f }], ...(usage ? { usage } : {}) })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(chunk(delta, null) + chunk({}, finish, { prompt_tokens: 12000, completion_tokens: 20, total_tokens: 12020 }) + "data: [DONE]\n\n");
    };
    if (!turn) {
      other.push({ at, model: body.model, messages: messages.length, owner });
      return send({ role: "assistant", content: "ok" }, "stop");
    }
    const step = turn.step;
    const shape = shapeOf(messages);
    const images = shape.flatMap((m) => m.blocks.filter((b) => b.image));
    if (turn.turn === 1 || (turn.turn === 2 && step === "after-tool")) {
      debug.push({ arm: turn.arm, turn: turn.turn, step, systemLines: messages.filter((m) => m.role === "system").flatMap((m) => normalize(typeof m.content === "string" ? m.content : (m.content ?? []).map((x) => x.text ?? "").join("")).split("\n")),
        layout: messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? `str:${m.content.length}${m.role === "tool" ? `:${m.content.slice(0, 400)}` : ""}` : (m.content ?? []).map((x) => x.type === "text" ? `text:${x.text.slice(0, 160)}` : `${x.type}:${JSON.stringify(x).slice(0, 160)}`), tool_calls: m.tool_calls?.length, keys: Object.keys(m) })) });
    }
    const systemLines = messages.filter((m) => m.role === "system").flatMap((m) => normalize(typeof m.content === "string" ? m.content : (m.content ?? []).map((x) => x.text ?? "").join("")).split("\n"));
    requests.push({ at, arm: turn.arm, turn: turn.turn, step, messages: messages.length, systemLines, bytes: Buffer.concat(chunks).length, model: body.model, owner,
      images: images.length, imageBytes: images.reduce((n, b) => n + b.bytes, 0), markers: shape.reduce((n, m) => n + m.blocks.filter((b) => b.text === "MARKER").length, 0),
      shapeSha: sha(JSON.stringify(shape)), imageSeqSha: sha(JSON.stringify(images.map((b) => b.image))), shape });
    if (step === "start") {
      return send({ role: "assistant", content: "", tool_calls: [{ index: 0, id: `call_bench_${turn.turn}`, type: "function",
        function: { name: "view_image", arguments: JSON.stringify({ path: photo(turn.turn) }) } }] }, "tool_calls");
    }
    send({ role: "assistant", content: `第 ${turn.turn} 张图看过了：彩色圆斑和渐变，没有文字。`.repeat(4) }, "stop");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const standinPort = server.address().port;

// ---- Gateways ----
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
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
const asV = (config) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const ds = config.models.providers.deepseek;
  Object.assign(ds, { baseUrl: `http://127.0.0.1:${standinPort}/v1`, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" } });
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  const entry = { alias: "deepseek", agentRuntime: { id: "vlab-worker" }, params: { thinking: "high" } };
  config.agents.defaults.model = { primary: "deepseek/deepseek-flash", fallbacks: [] };
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), "deepseek/deepseek-flash": entry };
  const makaron = config.agents.entries.makaron;
  makaron.model = { primary: "deepseek/deepseek-flash", fallbacks: [] };
  makaron.models = { ...(makaron.models ?? {}), "deepseek/deepseek-flash": entry };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes("deepseek/deepseek-flash")) allow.push("deepseek/deepseek-flash");
  if (config.agents.defaults.compaction) Object.assign(config.agents.defaults.compaction, { model: "deepseek/deepseek-flash", midTurnPrecheck: { enabled: true } });
  return config;
};

// B's configuration (Gateway + Worker copy), written in place.
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

// Clone a stopped Gateway's state + configuration into a new arm (paths and port rewritten).
const cloneArm = async (from, name, runtime) => {
  const state = path.join(scratch, `arm-${name}`);
  fs.rmSync(state, { recursive: true, force: true });
  assert.equal(spawnSync("cp", ["-a", from.state, state]).status, 0, `copy state for ${name}`);
  let port = from.port + 40;
  while (!(await portRangeFree(port, 12))) port += 13;
  const configPath = path.join(state, `openclaw-${name}.json`);
  const rewrite = (text) => text.replaceAll(from.configPath, configPath).replaceAll(from.state, state).replaceAll(from.runtime, runtime).replaceAll(`"port": ${from.port}`, `"port": ${port}`);
  fs.writeFileSync(configPath, rewrite(fs.readFileSync(from.configPath, "utf8")), { mode: 0o600 });
  const wcfg = path.join(state, workerRel);
  fs.writeFileSync(wcfg, rewrite(fs.readFileSync(path.join(from.state, workerRel), "utf8")), { mode: 0o600 });
  armPaths.push([state, "<STATE>"]);
  return { name, runtime, state, configPath, port };
};

const startGateway = async (arm, extraEnv = {}) => {
  const tmp = path.join(scratch, `tmp-${arm.name}`);
  for (const dir of [tmp, path.join(scratch, `cache-${arm.name}`)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // The candidate environment points several variables at B's state/config/runtime; move them all.
  const moved = [];
  const base = Object.fromEntries(Object.entries(process.env).map(([k, v]) => {
    const next = String(v).replaceAll(configPathB, arm.configPath).replaceAll(stateB, arm.state).replaceAll(runtimeB, arm.runtime);
    if (next !== v) moved.push(k);
    return [k, next];
  }));
  log(`${arm.name} env moved: ${moved.join(",")}`);
  const env = { ...base, OPENCLAW_CONFIG_PATH: arm.configPath, OPENCLAW_STATE_DIR: arm.state, OPENCLAW_GATEWAY_PORT: String(arm.port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, `cache-${arm.name}`), npm_config_cache: path.join(scratch, `cache-${arm.name}`, "npm"), ...extraEnv };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  if (!("OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP" in extraEnv)) delete env.OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP;
  const dist = path.join(arm.runtime, "openclaw", "dist");
  const lines = [];
  let starts = 0;
  const launch = () => {
    starts += 1;
    arm.proc = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(arm.port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [arm.proc.stdout, arm.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push(line); if (lines.length > 20000) lines.splice(0, lines.length - 20000); });
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
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l))) { launch(); continue; }
      throw new Error(`${arm.name} Gateway exited ${arm.proc.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
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
      arm.startupLog = lines.filter((l) => /worker-isolation|vlab-worker|degraded|production-worker|Worker /iu.test(l)).slice(0, 25).map((l) => redact(l).slice(0, 500));
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
const FILLER = Array.from({ length: 24 }, (_, i) => `第${i + 1}行背景：这是一段模拟长会话里的普通文字，用来让每一轮的历史接近真实私聊的长度。`).join("\n");
const runTurn = async (arm, turn) => {
  const message = `[bench ${arm.name} turn ${turn}] 帮我看看这张照片：${photo(turn)}\n${FILLER}`;
  const t0 = Date.now();
  const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey: SESSION_KEY, message, deliver: false, timeoutMs: 600_000, idempotencyKey: `hist-img-${arm.name}-${turn}-${t0}` });
  assert(sent?.runId, `${arm.name} turn ${turn}: chat.send returned no runId`);
  const waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 600_000 }, { timeoutMs: 620_000 });
  const t1 = Date.now();
  await sleep(500);
  const mine = requests.filter((r) => r.arm === arm.name && r.turn === turn);
  const start = mine.find((r) => r.step === "start");
  const afterTool = mine.find((r) => r.step === "after-tool");
  const terminal = arm.events.filter((e) => e.runId === sent.runId && ["final", "error", "aborted"].includes(e.state));
  return { arm: arm.name, turn, waitStatus: waited?.status, totalMs: t1 - t0,
    cmdToFirstRequestMs: start ? start.at - t0 : null, toolToSecondRequestMs: start && afterTool ? afterTool.at - start.at : null,
    requests: mine.length, worker: mine.every((r) => r.owner?.worker === true),
    reply: terminal.map((e) => textOf(e.message)).join("").slice(0, 60), states: terminal.map((e) => e.state),
    ...(terminal.some((e) => e.state !== "final") ? { error: terminal.map((e) => redact(e.errorMessage ?? textOf(e.message)).slice(0, 400)), log: arm.lines.slice(-400).filter((l) => /error|fail|refus|denied|invalid/iu.test(l)).slice(-8).map((l) => redact(l).slice(0, 400)) } : {}) };
};

const armB = { name: "B", runtime: runtimeB, state: stateB, configPath: configPathB, port: portB };
armPaths.push([runtimeA, "<RUNTIME>"], [runtimeB, "<RUNTIME>"], [stateB, "<STATE>"]);
const results = [];
let armA;
let armC;
const errorsOf = (arm) => arm.lines.filter((l) => /\bERROR\b|Unhandled|uncaught/iu.test(l)).map((l) => redact(l).slice(0, 300));
try {
  // A starts from a copy of B's pristine state; only the runtime differs.
  armA = await cloneArm(armB, "A", runtimeA);
  await startGateway(armA);
  await startGateway(armB);
  // Warm both Workers with one plain turn on a separate session (not measured).
  for (const arm of [armA, armB]) {
    const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey: `agent:makaron:feishu:direct:ou_warm_${arm.name}`, message: "预热，回复 ok", deliver: false, timeoutMs: 300_000, idempotencyKey: `warm-${arm.name}-${Date.now()}` });
    await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 300_000 }, { timeoutMs: 320_000 });
  }
  for (let turn = 1; turn <= TURNS; turn++) {
    const order = turn % 2 ? [armA, armB] : [armB, armA];
    for (const arm of order) {
      const r = await runTurn(arm, turn);
      results.push({ phase: "ab", ...r });
      log(JSON.stringify(r));
    }
  }
  // Phase 2: kill switch. C = B's runtime with OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0 on a copy of A's session.
  armA.errors = errorsOf(armA);
  if (SWITCH_TURNS > 0) {
  await stopGateway(armA);
  armC = await cloneArm(armA, "C", runtimeB);
  await startGateway(armC, { OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP: "0" });
  for (let turn = TURNS + 1; turn <= TURNS + SWITCH_TURNS; turn++) {
    const order = turn % 2 ? [armC, armB] : [armB, armC];
    for (const arm of order) {
      const r = await runTurn(arm, turn);
      results.push({ phase: "switch", ...r });
      log(JSON.stringify(r));
    }
  }
  }
} finally {
  for (const arm of [armA, armB, armC]) if (arm?.proc && arm.proc.exitCode === null) await stopGateway(arm);
  server.close();
}

// ---- analysis ----
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };
const summary = (rows) => {
  const v = rows.map((r) => r.cmdToFirstRequestMs).filter((x) => x != null);
  return { n: v.length, p50: pct(v, 0.5), p90: pct(v, 0.9), max: Math.max(...v), mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length) };
};
const byPhase = (phase, arm) => results.filter((r) => r.phase === phase && r.arm === arm);
// Compare each request with its counterpart (same turn, same step) in the other arm.
const compare = (x, y, turns) => {
  const rows = [];
  for (const turn of turns) for (const step of ["start", "after-tool"]) {
    const a = requests.find((r) => r.arm === x && r.turn === turn && r.step === step);
    const b = requests.find((r) => r.arm === y && r.turn === turn && r.step === step);
    rows.push({ turn, step, present: Boolean(a && b), sameShape: a?.shapeSha === b?.shapeSha, sameImages: a?.imageSeqSha === b?.imageSeqSha,
      images: [a?.images, b?.images], markers: [a?.markers, b?.markers], imageBytes: [a?.imageBytes, b?.imageBytes] });
  }
  const firstDiff = rows.find((r) => !r.sameShape);
  let detail;
  if (firstDiff) {
    const a = requests.find((r) => r.arm === x && r.turn === firstDiff.turn && r.step === firstDiff.step)?.shape ?? [];
    const b = requests.find((r) => r.arm === y && r.turn === firstDiff.turn && r.step === firstDiff.step)?.shape ?? [];
    const i = a.findIndex((m, j) => JSON.stringify(m) !== JSON.stringify(b[j]));
    detail = { messageIndex: i, a: a[i], b: b[i], lengths: [a.length, b.length] };
  }
  // Where the system prompt differs, the differing lines (normalized) on each side.
  const systemDiffs = rows.filter((r) => !r.sameShape).map((r) => {
    const a = requests.find((q) => q.arm === x && q.turn === r.turn && q.step === r.step)?.systemLines ?? [];
    const b = requests.find((q) => q.arm === y && q.turn === r.turn && q.step === r.step)?.systemLines ?? [];
    return { turn: r.turn, step: r.step, [`only${x}`]: a.filter((l) => !b.includes(l)).slice(0, 6).map((l) => l.slice(0, 300)), [`only${y}`]: b.filter((l) => !a.includes(l)).slice(0, 6).map((l) => l.slice(0, 300)) };
  });
  // A request matches when everything but the system prompt is identical (images, markers, every
  // other text block, tool calls); system prompt differences are listed in systemDiffs.
  const nonSystem = (q) => sha(JSON.stringify(q?.shape?.filter((m) => m.role !== "system") ?? null));
  const sameNonSystem = rows.filter((r) => nonSystem(requests.find((q) => q.arm === x && q.turn === r.turn && q.step === r.step)) === nonSystem(requests.find((q) => q.arm === y && q.turn === r.turn && q.step === r.step))).length;
  return { compared: rows.length, allPresent: rows.every((r) => r.present), identical: rows.filter((r) => r.sameShape).length, identicalExceptSystem: sameNonSystem, imagesIdentical: rows.filter((r) => r.sameImages).length, firstDiff, detail, systemDiffs,
    last: rows.at(-1) };
};
const abTurns = Array.from({ length: TURNS }, (_, i) => i + 1);
const swTurns = Array.from({ length: SWITCH_TURNS }, (_, i) => TURNS + 1 + i);
const tail = (rows, from) => rows.filter((r) => r.turn >= from);
const sysOf = (arm) => debug.find((d) => d.arm === arm && d.turn === 1 && d.step === "start")?.systemLines ?? [];
const sysA = sysOf("A"), sysB = sysOf("B");
const out = {
  debug: { onlyA: sysA.filter((l) => !sysB.includes(l)).slice(0, 15).map((l) => l.slice(0, 300)), onlyB: sysB.filter((l) => !sysA.includes(l)).slice(0, 15).map((l) => l.slice(0, 300)),
    layouts: debug.map(({ systemLines, ...d }) => d) },
  installed, standinPort, turns: TURNS, switchTurns: SWITCH_TURNS,
  ready: { A: armA?.readyMs, B: armB.readyMs, C: armC?.readyMs },
  startupLog: { A: armA?.startupLog, B: armB.startupLog, C: armC?.startupLog },
  ab: { A: summary(byPhase("ab", "A")), B: summary(byPhase("ab", "B")), A_last10: summary(tail(byPhase("ab", "A"), TURNS - 9)), B_last10: summary(tail(byPhase("ab", "B"), TURNS - 9)),
    equivalence: compare("A", "B", abTurns) },
  killSwitch: { C: summary(byPhase("switch", "C")), B: summary(byPhase("switch", "B")), equivalence: compare("C", "B", swTurns) },
  allOnWorker: results.every((r) => r.worker), allCompleted: results.every((r) => r.states.includes("final") && r.reply.includes("看过了")),
  otherRequests: other.length, otherRequestOwners: [...new Set(other.map((o) => o.owner?.worker))],
  errors: { A: armA?.errors ?? (armA?.lines ? errorsOf(armA) : []), B: armB.lines ? errorsOf(armB) : [], C: armC?.lines ? errorsOf(armC) : [] },
  paths: { runtimeA, runtimeB, stateA: armA?.state, stateB, stateC: armC?.state, configB: configPathB, workspace: configB.agents?.entries?.makaron?.workspace, scratch },
  perTurn: results.map(({ phase, arm, turn, cmdToFirstRequestMs, toolToSecondRequestMs, totalMs, requests: n, worker }) => ({ phase, arm, turn, cmdToFirstRequestMs, toolToSecondRequestMs, totalMs, n, worker })),
};
console.log(JSON.stringify(out, null, 1));
out.requestMessages = { first: requests.filter((r) => r.arm === "B" && r.step === "start").slice(0, 8).map((r) => r.messages), last: requests.filter((r) => r.arm === "B" && r.step === "start").slice(-3).map((r) => r.messages) };

assert(out.allCompleted, "every bench turn must finish with the stand-in's answer");
assert(out.allOnWorker, "every bench model request must come from a Worker process");
for (const [name, eq] of [["A/B", out.ab.equivalence], ["C/B", out.killSwitch.equivalence]]) {
  assert(eq.allPresent && eq.imagesIdentical === eq.compared && eq.identicalExceptSystem === eq.compared, `${name}: model requests differ outside the system prompt`);
}
assert(TURNS >= 10, "fewer than ten image turns never reaches the resize-skip boundary");
assert(out.ab.A_last10.p50 > out.ab.B_last10.p50, "B is not faster than A on the long session");
assert(out.killSwitch.C.p50 > out.killSwitch.B.p50, "OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP=0 did not restore the old behaviour");
