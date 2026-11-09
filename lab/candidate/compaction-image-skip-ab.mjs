// Candidate for lab/release-files/compaction-image-skip (2026-11-09): does overflow auto-compaction
// in the Gateway process still resize every history image on the event loop?
//
// V 2026-11-09 14:00:48 CST: a skill-workshop review (deepseek-flash, embedded PI runtime inside the
// Gateway) overflowed on a 3,530-message transcript; before the summary request the Gateway resized
// 208 history images in 50 s ("Image resized to fit limits"), liveness overdue 41 s.
//
// Build: one Gateway (embedded runtime, deepseek/deepseek-flash, V's vision setup) runs AB_BUILD_TURNS
// turns against a loopback DeepSeek stand-in; each turn the stand-in asks for view_image on a fresh
// 2400x3200 photo, so the session keeps one 2048 px tool-result image per turn. The built state is
// frozen; every measured run starts from a copy of it.
// Measured run: one tagged turn on that session; the stand-in answers its first request with
// DeepSeek's 400 context-overflow body, the runtime auto-compacts (summary request to the stand-in),
// then retries and gets an answer. Arms, one Gateway at a time on the same frozen state:
//   A = runtime live bytes (= V for both target files, checked)
//   B = lab/release-files/compaction-image-skip installed
//   C = B with OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP=0 (kill switch: must behave like A)
// Each Gateway runs with lab/candidate/el-gap-probe.mjs, which logs event-loop stalls over 100 ms.
// We record, between the injected 400 and the summary request: the longest stall, total stalled time
// and the Gateway's "Image resized to fit limits" lines; and we compare the summary request and the
// retried turn request across arms byte for byte (images as sha256).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeB = process.env.VLAB_CANDIDATE_RUNTIME;
const configPathB = process.env.OPENCLAW_CONFIG_PATH;
const stateB = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateB);
assert(runtimeB && configPathB && stateB && sharedState, "candidate runtime environment is required");
const BUILD_TURNS = Number(process.env.AB_BUILD_TURNS ?? 120);
const ROUNDS = (process.env.AB_ROUNDS ?? "ABC,CBA").split(",").filter(Boolean);
const SESSION_KEY = "agent:makaron:feishu:direct:ou_compaction_image_bench";
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);
const OVERFLOW_400 = JSON.stringify({ error: {
  message: "This model's maximum context length is 1048576 tokens. However, you requested 1432000 tokens (1048000 in the messages, 384000 in the completion). Please reduce the length of the messages or completion.",
  type: "invalid_request_error", param: null, code: "invalid_request_error" } });

// ---- runtimes: A keeps the live bytes, B gets the release files ----
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const RELEASE = JSON.parse(fs.readFileSync(path.join(repoRoot, "lab/compaction-image-skip.plan.json"), "utf8"));
const runtimeA = path.join(scratch, "runtime-a");
const installed = [];
if (!fs.existsSync(runtimeA)) assert.equal(spawnSync("cp", ["-a", runtimeB, runtimeA]).status, 0, "copy runtime for A");
for (const file of RELEASE.files) {
  const target = path.join(runtimeB, file.target);
  const live = fs.readFileSync(target);
  assert.equal(sha(live), file.before, `${file.target}: shared VLab bytes differ from V's`);
  const next = fs.readFileSync(path.join(repoRoot, file.source));
  fs.writeFileSync(`${target}.next`, next);
  fs.renameSync(`${target}.next`, target);
  installed.push({ target: file.target, a: sha(fs.readFileSync(path.join(runtimeA, file.target))), b: sha(next) });
}
for (const f of installed) assert.notEqual(f.a, f.b);
log("installed", JSON.stringify(installed));
const probeUrl = pathToFileURL(path.join(repoRoot, "lab/candidate/el-gap-probe.mjs")).href;

// ---- photos: 2400x3200, distinct per build turn ----
const configB = JSON.parse(fs.readFileSync(configPathB, "utf8"));
const photoDir = path.join(configB.agents.entries.makaron.workspace, "compaction-bench-photos");
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
  const r = spawnSync("python3", ["-c", py, photoDir, String(BUILD_TURNS)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}
const photo = (k) => path.join(photoDir, `photo-${String(k).padStart(3, "0")}.jpg`);

// ---- loopback DeepSeek stand-in ----
const requests = [];
const textOfContent = (content) => typeof content === "string" ? content : (Array.isArray(content) ? content : []).map((b) => b?.text ?? "").join("");
// A compaction summary request carries the serialized conversation, not the live turn.
const isSummaryRequest = (messages) => messages.some((m) => /\[User\]:|<conversation>|summar/iu.test(textOfContent(m.content)) && m.role !== "system")
  && !messages.some((m) => m.role === "tool");
const tagOf = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const m = /\[(build|ovf) (\w+) (\d+)\]/u.exec(textOfContent(messages[i].content));
    if (!m) continue;
    const afterTool = messages.slice(i + 1).some((x) => x?.role === "assistant" && (x.tool_calls ?? []).length > 0);
    return { kind: m[1], arm: m[2], n: Number(m[3]), step: afterTool ? "after-tool" : "start" };
  }
};
const armPaths = [];
const normalize = (text) => armPaths.reduce((t, [from, to]) => t.replaceAll(from, to), text).replace(/\[ovf \w+ /gu, "[ovf X ")
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, "<UUID>").replace(/\d/gu, "#");
const shapeOf = (messages) => messages.filter((m) => m.role !== "system").map((m) => ({
  role: m.role,
  blocks: (typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content : []).map((b) =>
    b.type === "image_url" ? { image: sha(b.image_url?.url ?? "") } : b.type === "text" ? { text: sha(normalize(b.text)) } : { other: b.type }),
  toolCalls: (m.tool_calls ?? []).map((c) => `${c.function?.name}:${sha(normalize(String(c.function?.arguments ?? "")))}`),
}));
const ownerOf = (port) => {
  const r = spawnSync("ss", ["-tnpH", "state", "established", `( sport = :${port} )`], { encoding: "utf8" });
  const pid = /pid=(\d+)/u.exec(r.stdout ?? "")?.[1];
  return pid ? Number(pid) : null;
};
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const summary = isSummaryRequest(messages);
    const tag = summary ? undefined : tagOf(messages);
    const images = shapeOf(messages).flatMap((m) => m.blocks.filter((b) => b.image));
    const rec = { at, pid: ownerOf(req.socket.remotePort), bytes: Buffer.concat(chunks).length, messages: messages.length, images: images.length,
      kind: summary ? "summary" : tag?.kind ?? "other", ...tag, shapeSha: sha(JSON.stringify(shapeOf(messages))) };
    if (summary) {
      rec.summaryText = normalize(messages.filter((m) => m.role !== "system").map((m) => textOfContent(m.content)).join("\n\n"));
      rec.summaryInputSha = sha(rec.summaryText);
    }
    if (tag?.kind === "ovf") rec.shape = shapeOf(messages);
    requests.push(rec);
    const send = (delta, finish) => {
      const chunk = (d, f, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: d, finish_reason: f }], ...(usage ? { usage } : {}) })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(chunk(delta, null) + chunk({}, finish, { prompt_tokens: 12000, completion_tokens: 20, total_tokens: 12020 }) + "data: [DONE]\n\n");
    };
    if (summary) return send({ role: "assistant", content: "## 摘要\n用户连续发来多张彩色圆斑照片，助手逐张确认看过，没有文字内容。\n## 待办\n无。" }, "stop");
    if (tag?.kind === "build") {
      if (tag.step === "start") return send({ role: "assistant", content: "", tool_calls: [{ index: 0, id: `call_build_${tag.n}`, type: "function",
        function: { name: "view_image", arguments: JSON.stringify({ path: photo(tag.n) }) } }] }, "tool_calls");
      return send({ role: "assistant", content: `第 ${tag.n} 张图看过了：彩色圆斑和渐变，没有文字。` }, "stop");
    }
    if (tag?.kind === "ovf") {
      const mine = requests.filter((r) => r.kind === "ovf" && r.arm === tag.arm && r.n === tag.n);
      if (mine.length === 1) {
        rec.injected = true;
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(OVERFLOW_400);
      }
      return send({ role: "assistant", content: "压缩后继续：之前的照片都看过了。" }, "stop");
    }
    send({ role: "assistant", content: "ok" }, "stop");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const standinPort = server.address().port;

// ---- configuration: V's model setup on the embedded runtime, stand-in summarizer ----
const portB = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(portB) && token, "candidate Gateway port/token missing");
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const sharedCompaction = structuredClone(configB.agents?.defaults?.compaction ?? null);
const asV = (config, runtimeId) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const ds = config.models.providers.deepseek;
  Object.assign(ds, { baseUrl: `http://127.0.0.1:${standinPort}/v1`, apiKey: "sk-standin-loopback" });
  delete ds.agentRuntime;
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  const entry = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = { primary: MODEL, fallbacks: [] };
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), [MODEL]: entry };
  const makaron = config.agents.entries.makaron;
  makaron.model = { primary: MODEL, fallbacks: [] };
  makaron.models = { ...(makaron.models ?? {}), [MODEL]: entry };
  if (runtimeId === "openclaw") makaron.agentRuntime = undefined;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  // V's safeguard compaction, summarized by the stand-in (the provider and quality guard would add
  // real model calls after the part under test; sanitization runs before either).
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", model: MODEL, provider: undefined,
    qualityGuard: { enabled: false }, midTurnPrecheck: { enabled: false }, notifyUser: false };
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  if (config.plugins?.entries?.["skill-workshop"]) config.plugins.entries["skill-workshop"].enabled = false;
  if (config.auth?.order?.openai) delete config.auth.order.openai;
  return config;
};
const workerPluginB = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginB, "candidate Worker plugin configuration is missing");
Object.assign(workerPluginB, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPathB });
const workerRel = path.relative(stateB, workerPluginB.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const workerConfigB = asV(JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateB).replaceAll(sharedRuntime, runtimeB)), "openclaw");
fs.mkdirSync(path.dirname(workerPluginB.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPluginB.workerConfigPath, `${JSON.stringify(workerConfigB, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPathB, `${JSON.stringify(asV(configB, "openclaw"), null, 2)}\n`, { mode: 0o600 });
if (!fs.existsSync(path.join(stateB, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");
const imageMaxDimensionPx = configB.agents.defaults.imageMaxDimensionPx ?? null;

// ---- Gateways ----
const portRangeFree = async (base, span) => {
  for (let p = base; p < base + span; p++) {
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(true))); });
    if (!ok) return false;
  }
  return true;
};
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
  armPaths.push([state, "<STATE>"]);
  return { name, runtime, state, configPath, port };
};
const startGateway = async (arm, extraEnv = {}) => {
  const tmp = path.join(scratch, `tmp-${arm.name}`);
  for (const dir of [tmp, path.join(scratch, `cache-${arm.name}`)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).replaceAll(configPathB, arm.configPath).replaceAll(stateB, arm.state).replaceAll(runtimeB, arm.runtime)]));
  const probeOut = path.join(scratch, `el-${arm.name}`);
  const env = { ...base, OPENCLAW_CONFIG_PATH: arm.configPath, OPENCLAW_STATE_DIR: arm.state, OPENCLAW_GATEWAY_PORT: String(arm.port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, `cache-${arm.name}`), npm_config_cache: path.join(scratch, `cache-${arm.name}`, "npm"), EL_PROBE_OUT: probeOut, ...extraEnv };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  if (!("OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP" in extraEnv)) delete env.OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP;
  const dist = path.join(arm.runtime, "openclaw", "dist");
  const lines = [];
  let starts = 0;
  const launch = () => {
    starts += 1;
    arm.proc = spawn(process.execPath, ["--import", probeUrl, "--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(arm.port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [arm.proc.stdout, arm.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 60000) lines.splice(0, lines.length - 60000); });
    }
  };
  arm.lines = lines;
  arm.events = [];
  arm.probeOut = probeOut;
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
      await sleep(20_000);
      log(`${arm.name} ready in ${arm.readyMs} ms on port ${arm.port} pid ${arm.proc.pid}`);
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
const textOf = (message) => !message ? "" : typeof message === "string" ? message : textOfContent(message.content);
const send = async (arm, message, key) => {
  const t0 = Date.now();
  const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey: SESSION_KEY, message, deliver: false, timeoutMs: 900_000, idempotencyKey: `${key}-${t0}` });
  assert(sent?.runId, `${key}: chat.send returned no runId`);
  const waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 900_000 }, { timeoutMs: 920_000 });
  await sleep(500);
  const terminal = arm.events.filter((e) => e.runId === sent.runId && ["final", "error", "aborted"].includes(e.state));
  return { t0, t1: Date.now(), runId: sent.runId, waitStatus: waited?.status, states: terminal.map((e) => e.state), reply: terminal.map((e) => textOf(e.message)).join("").slice(0, 80) };
};
const readGaps = (arm) => {
  const out = [];
  for (const f of fs.readdirSync(path.dirname(arm.probeOut)).filter((n) => n.startsWith(`${path.basename(arm.probeOut)}.`))) {
    const pid = Number(f.split(".").at(-2));
    for (const l of fs.readFileSync(path.join(path.dirname(arm.probeOut), f), "utf8").split("\n").filter(Boolean)) out.push({ pid, ...JSON.parse(l) });
  }
  return out;
};

const results = [];
const builder = { name: "build", runtime: runtimeA, state: stateB, configPath: configPathB, port: portB };
armPaths.push([runtimeA, "<RUNTIME>"], [runtimeB, "<RUNTIME>"], [stateB, "<STATE>"]);
let frozen;
let build;
try {
  // ---- build the image history once (A runtime; the patch does not touch this path) ----
  const b0 = Date.now();
  await startGateway(builder);
  for (let n = 1; n <= BUILD_TURNS; n++) {
    const r = await send(builder, `[build x ${n}] 帮我看看这张照片：${photo(n)}`, `build-${n}`);
    assert(r.states.includes("final") && r.reply.includes("看过了"), `build turn ${n} did not finish: ${JSON.stringify(r)}`);
    if (n % 20 === 0) log(`built ${n}/${BUILD_TURNS} turns in ${Date.now() - b0} ms`);
  }
  build = { turns: BUILD_TURNS, ms: Date.now() - b0, compactionsDuringBuild: builder.lines.filter((l) => /auto-compaction|context overflow detected/u.test(l.line)).length,
    lastBuildRequestImages: requests.filter((r) => r.kind === "build").at(-1)?.images };
  await stopGateway(builder);
  frozen = await cloneArm(builder, "frozen", runtimeA);

  // ---- measured runs, one Gateway at a time ----
  const runtimes = { A: runtimeA, B: runtimeB, C: runtimeB };
  let round = 0;
  for (const order of ROUNDS) {
    round += 1;
    for (const name of order) {
      const arm = await cloneArm(frozen, `${name}${round}`, runtimes[name]);
      await startGateway(arm, name === "C" ? { OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP: "0" } : {});
      const tag = `${name}${round}`;
      const r = await send(arm, `[ovf ${tag} 1] 继续，帮我总结一下前面这些照片。`, `ovf-${tag}`);
      const mine = requests.filter((q) => (q.kind === "ovf" && q.arm === tag) || (q.kind === "summary" && q.at >= r.t0 && q.at <= r.t1));
      const injected = mine.find((q) => q.injected);
      const summaryReq = mine.find((q) => q.kind === "summary");
      const retried = mine.filter((q) => q.kind === "ovf" && !q.injected);
      const from = injected?.at ?? r.t0;
      // Stalls are logged when they end; the summary request is sent right after the last one.
      const to = (summaryReq?.at ?? r.t1) + 200;
      const gaps = readGaps(arm).filter((g) => g.pid === arm.proc.pid);
      const inWindow = gaps.filter((g) => g.at >= from && g.at <= to);
      const resized = arm.lines.filter((l) => l.at >= from && l.at <= (summaryReq?.at ?? r.t1) && /Image resized to fit limits/u.test(l.line));
      const row = { arm: name, round, tag, ...r, gatewayPid: arm.proc.pid,
        requestPids: [...new Set(mine.map((q) => q.pid))],
        overflowToSummaryMs: injected && summaryReq ? summaryReq.at - injected.at : null,
        maxStallMs: Math.max(0, ...inWindow.map((g) => g.gapMs)), stalledMs: inWindow.reduce((s, g) => s + g.gapMs, 0), stallsOver1s: inWindow.filter((g) => g.gapMs >= 1000).length,
        resizedLines: resized.length, resizedSample: resized.slice(0, 2).map((l) => l.line.slice(0, 200)),
        overflowDetected: arm.lines.some((l) => l.at >= r.t0 && /context overflow detected/u.test(l.line)),
        compactionSucceeded: arm.lines.some((l) => l.at >= r.t0 && /auto-compaction succeeded/u.test(l.line)),
        summaryImages: summaryReq?.images, summaryInputSha: summaryReq?.summaryInputSha, summaryShapeSha: summaryReq?.shapeSha, summaryRequests: mine.filter((q) => q.kind === "summary").length,
        retryShapeSha: retried[0]?.shapeSha, retryImages: retried[0]?.images, retries: retried.length,
        summaryText: summaryReq?.summaryText, retryShape: retried[0]?.shape,
        errors: arm.lines.filter((l) => l.at >= r.t0 && /\bERROR\b|Unhandled|uncaught/iu.test(l.line)).slice(0, 5).map((l) => redact(l.line).slice(0, 300)) };
      results.push(row);
      log(JSON.stringify(row));
      await stopGateway(arm);
      fs.rmSync(arm.state, { recursive: true, force: true });
    }
  }
} finally {
  if (builder.proc && builder.proc.exitCode === null) await stopGateway(builder);
  server.close();
}

// ---- analysis ----
const by = (name) => results.filter((r) => r.arm === name);
const stat = (rows, key) => rows.map((r) => r[key]);
// Where two arms' summary input or retried request differ, the first difference.
const firstTextDiff = (a = "", b = "") => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i >= a.length && a.length === b.length ? null : { at: i, lengths: [a.length, b.length], a: a.slice(Math.max(0, i - 200), i + 300), b: b.slice(Math.max(0, i - 200), i + 300) };
};
const firstShapeDiff = (a = [], b = []) => {
  const i = a.findIndex((m, j) => JSON.stringify(m) !== JSON.stringify(b[j]));
  return i < 0 && a.length === b.length ? null : { messageIndex: i, lengths: [a.length, b.length], a: a[i], b: b[i] };
};
const ref = results[0];
const diffs = results.slice(1).map((r) => ({ tag: r.tag, vs: ref?.tag, summary: firstTextDiff(ref?.summaryText, r.summaryText), retry: firstShapeDiff(ref?.retryShape, r.retryShape) }));
for (const r of results) { delete r.summaryText; delete r.retryShape; }
const out = {
  diffs,
  installed, imageMaxDimensionPx, sharedCompaction, build, rounds: ROUNDS,
  summary: Object.fromEntries(["A", "B", "C"].map((n) => [n, { maxStallMs: stat(by(n), "maxStallMs"), stalledMs: stat(by(n), "stalledMs"), resizedLines: stat(by(n), "resizedLines"), overflowToSummaryMs: stat(by(n), "overflowToSummaryMs"), totalMs: by(n).map((r) => r.t1 - r.t0) }])),
  sameSummaryInput: new Set(results.map((r) => r.summaryInputSha)).size === 1,
  sameRetryRequest: new Set(results.map((r) => r.retryShapeSha)).size === 1,
  results,
};
console.log(JSON.stringify(out, null, 1));
for (const r of results) {
  assert(r.overflowDetected && r.compactionSucceeded, `${r.tag}: overflow compaction did not run and succeed`);
  assert(r.states.includes("final") && r.reply.includes("压缩后继续"), `${r.tag}: the retried turn did not finish`);
  assert.deepEqual(r.requestPids, [r.gatewayPid], `${r.tag}: model requests did not come from the Gateway process`);
}
assert(out.sameSummaryInput, "summary request input differs between arms");
assert(out.sameRetryRequest, "retried turn request differs between arms");
for (const r of by("A").concat(by("C"))) assert(r.resizedLines >= BUILD_TURNS / 2, `${r.tag}: expected the old behaviour to resize the history images`);
for (const r of by("B")) assert.equal(r.resizedLines, 0, `${r.tag}: B still resized history images during compaction`);
