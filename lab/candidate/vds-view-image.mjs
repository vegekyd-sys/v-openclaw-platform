// Candidate probe: /vds view_image, V's codex plugin + core bytes vs v-vds-view-image-v1.
// Isolated Gateway on the candidate config copy; never touches shared VLab.
//
// A recording proxy sits between Codex and DeepSeek (codex-home base_url), so every
// model request is measured directly: body bytes, images (format, bytes), which
// view_image the model was offered, time to first response byte. It can also answer
// one request with DeepSeek's exact 413 to drive the binding-clear path.
//
// Fixture: four 1080x1920 noise-heavy PNGs (~6 MB each, like the video frames on V),
// each with its own code word. The model must read every code (positive function),
// and a follow-up turn shows whether the images are resent.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const PHASES = (process.env.VI_PHASES ?? "vbytes,patched").split(",");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => spawnSync("sha256sum", [f], { encoding: "utf8" }).stdout.slice(0, 8);

function readSecretsEnv() {
  const env = {};
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  return env;
}

// ---- env ----
const secrets = readSecretsEnv();
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- codex plugin: V's exact bytes (shared state copy, identical to V on 2026-10-10) ----
const V_BEFORE = {
  "thread-lifecycle-DAcEJ_Om.js": "c0a9ce77", "dynamic-tools-BU9tmlYm.js": "2de5868b",
  "run-attempt-D1hJO4fX.js": "d25e0d91", "side-question-BTZAII4l.js": "9be0ea6c",
};
const CORE_TOOLS = path.join(runtime, "openclaw", "dist", "openclaw-tools-BODVdJQD.js");
const CORE_BEFORE = "637c86f3";
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm", "projects");
const codexProject = fs.readdirSync(sharedNpm).find((d) => d.startsWith("openclaw-codex-") && !d.includes("__"));
assert(codexProject, "shared codex plugin copy not found");
const npmProjects = path.join(stateDir, "npm", "projects");
fs.mkdirSync(npmProjects, { recursive: true });
const codexRoot = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex");
const codexDist = path.join(codexRoot, "dist");
const pristine = path.join(scratch, "codex-pristine");
function installVBytes() {
  if (!fs.existsSync(pristine)) {
    spawnSync("cp", ["-a", path.join(sharedNpm, codexProject), pristine]);
    spawnSync("cp", ["-a", CORE_TOOLS, path.join(scratch, "openclaw-tools.pristine.js")]);
  }
  fs.rmSync(path.join(npmProjects, codexProject), { recursive: true, force: true });
  spawnSync("cp", ["-a", pristine, path.join(npmProjects, codexProject)]);
  fs.copyFileSync(path.join(scratch, "openclaw-tools.pristine.js"), CORE_TOOLS);
  for (const [name, h] of Object.entries(V_BEFORE)) assert.equal(sha(path.join(codexDist, name)), h, `${name} is not V's bytes`);
  assert.equal(sha(CORE_TOOLS), CORE_BEFORE, "openclaw-tools is not V's bytes");
}

// ---- fixture ----
const workspace = config0.agents.entries.makaron.workspace ?? config0.agents.defaults.workspace;
assert(workspace, "makaron workspace unknown");
const fixtureDir = path.join(workspace, "vds-view-image-fixture");
const CODES = ["MAPLE-4821", "COBALT-7396", "TULIP-2058", "RAVEN-6143"];
fs.mkdirSync(fixtureDir, { recursive: true });
const gen = spawnSync("python3", ["-c", `
import random,sys
from PIL import Image,ImageDraw,ImageFont
codes=sys.argv[2:];out=sys.argv[1]
for i,code in enumerate(codes):
  random.seed(i)
  W,H=1080,1920
  im=Image.frombytes('RGB',(W,H),bytes(random.getrandbits(8) for _ in range(W*H*3)))
  bg=Image.new('RGB',(W,H),(40+40*i,90,160-30*i))
  im=Image.blend(bg,im,0.22)
  d=ImageDraw.Draw(im)
  try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',96)
  except Exception: f=ImageFont.load_default()
  d.rectangle([90,820,990,1100],fill=(250,245,230))
  d.text((130,900),code,fill=(20,20,20),font=f)
  im.save(f'{out}/frame-{i+1}.png')
`, fixtureDir, ...CODES], { encoding: "utf8" });
assert.equal(gen.status, 0, gen.stderr);
const FIXTURES = CODES.map((_, i) => path.join(fixtureDir, `frame-${i + 1}.png`));
console.log(JSON.stringify({ fixture: FIXTURES.map((f) => [path.basename(f), fs.statSync(f).size]) }));

// ---- recording proxy between Codex and DeepSeek ----
const records = [];
let force413 = 0;
const DS413 = "Failed to buffer the request body: length limit exceeded";
const proxy = http.createServer((req, res) => {
  const chunks = [];
  const t0 = Date.now();
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const rec = { at: t0, path: req.url, bytes: body.length, images: [], viewImage: null };
    try {
      const j = JSON.parse(body.toString("utf8"));
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== "object") return;
        if (o.type === "input_image" && typeof o.image_url === "string") {
          const m = o.image_url.match(/^data:([^;]+);base64,/u);
          rec.images.push([m?.[1] ?? "url", o.image_url.length]);
          return;
        }
        Object.values(o).forEach(walk);
      };
      walk(j.input);
      const vi = (j.tools ?? []).find((t) => t.name === "view_image");
      rec.viewImage = vi ? String(vi.description ?? "").slice(0, 48) : null;
      rec.tools = (j.tools ?? []).length;
    } catch { rec.parseError = true; }
    records.push(rec);
    if (force413 > 0) {
      force413 -= 1;
      rec.status = 413; rec.forced = true;
      res.writeHead(413, { "content-type": "text/plain" });
      res.end(DS413);
      return;
    }
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.deepseek.com", "content-length": body.length } }, (r) => {
      rec.status = r.statusCode;
      res.writeHead(r.statusCode, r.headers);
      let first = true;
      r.on("data", (c) => { if (first) { rec.ttfbMs = Date.now() - t0; first = false; } res.write(c); });
      r.on("end", () => { rec.totalMs = Date.now() - t0; res.end(); });
    });
    up.on("error", (e) => { rec.error = String(e); res.writeHead(502); res.end(); });
    up.end(body);
  });
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const proxyPort = proxy.address().port;

// ---- config: V's /vds ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const dsModels = config.models.providers.deepseek.models;
const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  if (!dsModels.some((m) => m.id === id)) dsModels.push({ id, name, ...flashShape });
}
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
const tomlPath = path.join(CODEX_HOME, "config.toml");
const toml = (fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "").replace(/\n\[model_providers\.deepseek\][\s\S]*?(?=\n\[|$)/u, "");
fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxyPort}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { lines.push(...chunk.split(/\r?\n/u).filter(Boolean).map((l) => `${Date.now()} ${l}`)); if (lines.length > 20000) lines.splice(0, lines.length - 20000); });
  }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
async function waitPort(timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
    const ok = await new Promise((resolve) => {
      const sock = net.connect({ host: "127.0.0.1", port });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error("Gateway did not listen");
}
const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
async function connect(onEvent) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    const client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin"], onEvent,
      onHelloOk() { clearTimeout(timer); resolve(client); },
      onConnectError(e) { clearTimeout(timer); reject(e); },
    });
    client.start();
  });
}

function rolloutThreads(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} 2>/dev/null | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    const imgs = [];
    let provider = "", calls = 0;
    for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "session_meta") provider = p.model_provider ?? provider;
      if (e.type === "response_item" && p.type === "function_call" && p.name === "view_image") calls += 1;
      if (e.type === "response_item" && /function_call_output/u.test(p.type ?? "")) {
        for (const m of line.matchAll(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/gu)) imgs.push([m[1], m[2].length]);
      }
    }
    return { thread: path.basename(f).slice(-41, -6), provider, viewImageCalls: calls, images: imgs, bytes: fs.statSync(f).size };
  });
}

async function runPhase(label) {
  const runs = new Map();
  const client = await connect((e) => {
    const p = e.payload;
    const r = runs.get(p?.runId);
    if (!r) return;
    const at = Date.now();
    if (e.event === "agent" && p.stream === "assistant" && String(p.data?.text ?? p.data?.delta ?? "").trim() && !r.firstBodyAt) r.firstBodyAt = at;
    if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = at; r.final = p; }
  });
  const call = (method, params) => client.request(method, params, { timeoutMs: 30_000 });
  const key = `agent:makaron:explicit:vlab-dev-vds-view-image-${label}-${Date.now().toString(36)}`;
  await call("sessions.messages.subscribe", { agentId: "makaron", key });
  const phaseStart = Date.now();
  const send = async (message) => {
    const id = randomUUID();
    const r = { id, sentAt: Date.now(), rec0: records.length };
    runs.set(id, r);
    await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 });
    const deadline = Date.now() + 620_000;
    while (!r.terminal && Date.now() < deadline) await sleep(250);
    const reqs = records.slice(r.rec0);
    const text = JSON.stringify(r.final?.message ?? r.final ?? "");
    return {
      terminal: r.terminal, firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null, totalMs: r.endAt ? r.endAt - r.sentAt : null,
      requests: reqs.map((q) => ({ mb: +(q.bytes / 1e6).toFixed(2), imgs: q.images.length, png: q.images.filter(([m]) => m === "image/png").length, jpeg: q.images.filter(([m]) => m === "image/jpeg").length, status: q.status, ttfbMs: q.ttfbMs, forced: q.forced })),
      viewImageOffered: [...new Set(reqs.map((q) => q.viewImage))],
      codes: CODES.map((c) => text.includes(c)),
    };
  };
  const out = { phase: label, switch: (await send("/vds")).terminal };
  out.look = await send(`请分别用 view_image 打开这 ${FIXTURES.length} 张图（每张单独调用一次 view_image），然后逐张告诉我图中白色方框里的暗号（大写英文-数字）。图片路径：\n${FIXTURES.join("\n")}`);
  console.log(JSON.stringify({ phase: label, look: out.look }));
  out.followup = await send("不要再调用任何工具。把第 2 张和第 4 张图的暗号再写一遍。");
  console.log(JSON.stringify({ phase: label, followup: out.followup }));
  const threadsBefore413 = rolloutThreads(phaseStart).map((t) => t.thread);
  force413 = 1;
  out.forced413 = await send("不要调用工具，回复：收到。");
  const bindingCleared = lines.some((l) => /image payload error detected; clearing thread binding/u.test(l));
  out.after413 = await send("不要调用工具，回复：OK。");
  const threadsAfter = rolloutThreads(phaseStart);
  out.binding = { clearedLog: bindingCleared, threadsBefore: threadsBefore413.length, threadsAfter: threadsAfter.length, newThreadAfter413: threadsAfter.some((t) => !threadsBefore413.includes(t.thread)) };
  out.threads = threadsAfter.map((t) => ({ ...t, images: t.images.map(([m, n]) => `${m.slice(6)}:${(n / 1e6).toFixed(2)}MB`) }));
  console.log(JSON.stringify({ phase: label, forced413: out.forced413, after413: out.after413, binding: out.binding, threads: out.threads }));
  client.stop?.();
  return out;
}

try {
  const results = {};
  for (const label of PHASES) {
    installVBytes();
    if (label === "patched") {
      const r = spawnSync(process.execPath, [path.join(repoRoot, "lab/release-files/vds-view-image/patch-vds-view-image.mjs"), "--codex", codexRoot, "--core-dist", path.dirname(CORE_TOOLS)], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
    }
    console.log(JSON.stringify({ phase: label, files: Object.fromEntries([...Object.keys(V_BEFORE).map((n) => [n, sha(path.join(codexDist, n))]), ["openclaw-tools", sha(CORE_TOOLS)]]) }));
    startGateway();
    await waitPort();
    await sleep(3000);
    results[label] = await runPhase(label);
    const warn = lines.filter((l) => /\b(error|warn)\b/iu.test(l) && /codex|view_image|image/iu.test(l)).slice(-12).map((l) => redact(l).slice(0, 300));
    console.log(JSON.stringify({ phase: label, warnings: warn }));
    await stopGateway();
  }
  const s = (r) => ({
    codesRead: r.look.codes.filter(Boolean).length + "/" + CODES.length,
    followupCodes: [r.followup.codes[1], r.followup.codes[3]],
    viewImage: r.look.viewImageOffered,
    maxRequestMB: Math.max(...r.look.requests.concat(r.followup.requests).map((q) => q.mb)),
    followupRequestMB: r.followup.requests.map((q) => q.mb),
    lookFirstBodyMs: r.look.firstBodyMs, followupFirstBodyMs: r.followup.firstBodyMs,
    newThreadAfter413: r.binding.newThreadAfter413, after413: r.after413.terminal,
  });
  console.log(JSON.stringify({ summary: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, s(v)])) }));
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).join("\n")));
  process.exitCode = 1;
} finally {
  await stopGateway();
  proxy.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
