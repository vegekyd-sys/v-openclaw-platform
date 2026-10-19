// Candidate probe: the /vds DeepSeek byte guard (v-codex-ds-window-v2) against V's Codex bytes.
// Isolated Gateway on the candidate config copy; never touches shared VLab.
//
// Baseline (v): the shared VLab state/npm copy of the Codex plugin, byte-identical to V
// (run-attempt 8ab51650, v-codex-ds-window-v1). Fixed: the same copy after
// lab/release-files/codex-ds-window/patch-codex-ds-window.mjs, i.e. the v1 -> v2 upgrade
// path V will take; the result must be the release artifact (80875cf3).
//
// Every DeepSeek request goes to the real endpoint through a recording proxy (body bytes,
// images, status). Nothing is rejected locally: a 413 here is DeepSeek's own.
//
//   PHASES=classify   real thread bindings from shared VLab (read-only): which get the 40 MiB
//                     limit (DeepSeek) and which keep V's behaviour (GPT and others: no limit)
//   PHASES=img-fixed  /vds thread fed IMG_PER_TURN fresh images per turn (OpenClaw view_image,
//                     ≤1 MB each): must start a fresh thread before the request passes 48 MiB,
//                     no 413, codes read every turn, the code word from the start still known
//   PHASES=img-v      the same on V's bytes: shows the fixture reaches DeepSeek's 413
//   PHASES=text-fixed,text-v  text-only /vds thread: one thread, no byte guard, same as V
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const PHASES = (process.env.PHASES ?? "classify,img-fixed,img-v,text-fixed,text-v").split(",");
const IMG_PER_TURN = Number(process.env.IMG_PER_TURN ?? 8);
const IMG_TURNS = Number(process.env.IMG_TURNS ?? 7);
const TEXT_SEEDS = Number(process.env.TEXT_SEEDS ?? 4);
const TEXT_WORDS = Number(process.env.TEXT_WORDS ?? 22000);
const MiB = 1024 * 1024;
const V_RUN_ATTEMPT = "8ab5165003ca21852beded6455a029cce521df48fadb56ea509ca156d45beeba";
const FIXED_RUN_ATTEMPT = "80875cf3cab593453d4f1c1014c47105d0ce1657e955ed510ff93d754f56457f";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => spawnSync("sha256sum", [f], { encoding: "utf8" }).stdout.slice(0, 64);
const mib = (n) => +(n / MiB).toFixed(2);

const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- codex plugin: V's bytes (shared state copy) and the v1 -> v2 upgrade ----
const sharedNpm = path.join(sharedState, "npm", "projects");
const codexProject = fs.readdirSync(sharedNpm).find((d) => d.startsWith("openclaw-codex-") && !d.includes("__"));
assert(codexProject, "shared codex plugin copy not found");
const npmProjects = path.join(stateDir, "npm", "projects");
fs.mkdirSync(npmProjects, { recursive: true });
const codexRoot = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex");
const codexDist = path.join(codexRoot, "dist");
const runAttempt = path.join(codexDist, "run-attempt-D1hJO4fX.js");
const pristine = path.join(scratch, "codex-pristine");
function installBytes(variant) {
  if (!fs.existsSync(pristine)) spawnSync("cp", ["-a", path.join(sharedNpm, codexProject), pristine]);
  fs.rmSync(path.join(npmProjects, codexProject), { recursive: true, force: true });
  spawnSync("cp", ["-a", pristine, path.join(npmProjects, codexProject)]);
  assert.equal(sha(runAttempt), V_RUN_ATTEMPT, "shared copy is not V's run-attempt");
  if (variant === "fixed") {
    const r = spawnSync(process.execPath, [path.join(repoRoot, "lab/release-files/codex-ds-window/patch-codex-ds-window.mjs"), "--codex", codexRoot], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    console.log(JSON.stringify({ patch: r.stdout.trim() }));
    assert.equal(sha(runAttempt), FIXED_RUN_ATTEMPT, "v1 -> v2 upgrade did not produce the release artifact");
  }
  return sha(runAttempt).slice(0, 8);
}

// ---- recording proxy in front of DeepSeek ----
const records = [];
const proxy = http.createServer((req, res) => {
  const chunks = [];
  const t0 = Date.now();
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const rec = { at: t0, path: req.url, bytes: body.length, images: 0 };
    let text = body;
    const enc = String(req.headers["content-encoding"] ?? "");
    try { if (enc.includes("zstd")) text = zlib.zstdDecompressSync(body); else if (enc.includes("gzip")) text = zlib.gunzipSync(body); } catch {}
    if (text !== body) rec.decodedBytes = text.length;
    rec.images = (text.toString("latin1").match(/"input_image"/gu) ?? []).length;
    records.push(rec);
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.deepseek.com", "content-length": body.length } }, (r) => {
      rec.status = r.statusCode;
      res.writeHead(r.statusCode, r.headers);
      r.on("data", (c) => res.write(c));
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
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex", "memory-core"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!config.models.providers.deepseek.models.some((m) => m.id === id)) config.models.providers.deepseek.models.push({ id, name, ...flashShape });
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
assert.equal(JSON.stringify(config).includes("maxActiveTranscriptBytes"), false, "config sets maxActiveTranscriptBytes; V does not");
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const text = fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, text, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
const tomlPath = path.join(CODEX_HOME, "config.toml");
const toml = (fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "").replace(/\n\[model_providers\.deepseek\][\s\S]*?(?=\n\[|$)/u, "");
fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxyPort}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

// ---- fixture: fresh images with fresh codes every turn ----
const workspace = config0.agents.entries.makaron.workspace ?? config0.agents.defaults.workspace;
assert(workspace, "makaron workspace unknown");
const fixtureDir = path.join(workspace, "ds-bytes-fixture");
const WORDS = ["MAPLE", "COBALT", "TULIP", "RAVEN", "CEDAR", "AMBER", "FJORD", "LOTUS", "QUARTZ", "BISON", "HERON", "OPAL"];
function makeImages(turn) {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.mkdirSync(fixtureDir, { recursive: true });
  const codes = Array.from({ length: IMG_PER_TURN }, (_, i) => `${WORDS[(turn * 5 + i) % WORDS.length]}-${String(1000 + ((turn * 7919 + i * 104729) % 9000))}`);
  const gen = spawnSync("python3", ["-c", `
import os,sys
from PIL import Image,ImageDraw,ImageFont
out=sys.argv[1];codes=sys.argv[2:]
for i,code in enumerate(codes):
  W,H=1080,1920
  im=Image.frombytes('RGB',(W,H),os.urandom(W*H*3))
  im=Image.blend(Image.new('RGB',(W,H),(30+15*i,90,170-12*i)),im,0.35)
  d=ImageDraw.Draw(im)
  try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',110)
  except Exception: f=ImageFont.load_default()
  d.rectangle([80,800,1000,1120],fill=(250,245,230))
  d.text((120,890),code,fill=(15,15,15),font=f)
  im.save(f'{out}/img-{i+1}.png')
`, fixtureDir, ...codes], { encoding: "utf8" });
  assert.equal(gen.status, 0, gen.stderr);
  return { codes, files: codes.map((_, i) => path.join(fixtureDir, `img-${i + 1}.png`)) };
}

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) { s.setEncoding("utf8"); s.on("data", (c) => { lines.push(...c.split(/\r?\n/u).filter(Boolean)); if (lines.length > 40000) lines.splice(0, lines.length - 40000); }); }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
async function waitPort() {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
    if (await new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); })) return;
    await sleep(500);
  }
  throw new Error("Gateway did not listen");
}
const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
let client;
async function connect() {
  for (let attempt = 1; ; attempt += 1) {
    try { await connectOnce(); return; } catch (error) {
      if (attempt >= 36) throw error;
      await sleep(5000);
    }
  }
}
async function connectOnce() {
  client = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
      onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 200)); } },
      onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
    c.start();
  });
}
async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now(), rec0: records.length, line0: lines.length };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 900_000 }, { timeoutMs: 60_000 });
  const deadline = Date.now() + 920_000;
  while (!r.terminal && Date.now() < deadline) await sleep(500);
  const h = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 4 }, { timeoutMs: 30_000 });
  const a = (h.messages ?? []).filter((m) => m.role === "assistant").at(-1);
  const reply = String(typeof a?.content === "string" ? a.content : (a?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ")).trim();
  const log = lines.slice(r.line0);
  const reqs = records.slice(r.rec0);
  return { terminal: r.terminal ?? "timeout", error: r.error, secs: Math.round(((r.endAt ?? Date.now()) - r.sentAt) / 1000), reply,
    requests: reqs.map((q) => `${mib(q.bytes)}MiB/${q.images}img/${q.status ?? q.error ?? "?"}`),
    maxRequestMiB: reqs.length ? mib(Math.max(...reqs.map((q) => q.bytes))) : 0, status413: reqs.filter((q) => q.status === 413).length,
    byteGuard: log.filter((l) => /exceeded active byte limit/u.test(l)).map((l) => redact(l).slice(0, 260)),
    imagePayloadClear: log.filter((l) => /image payload error detected/u.test(l)).length,
    compactions: log.filter((l) => /auto-compaction succeeded|compaction_succeeded/u.test(l)).length };
}
function threads(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} 2>/dev/null | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    const body = fs.readFileSync(f, "latin1");
    return { thread: path.basename(f).slice(-41, -28), MiB: mib(fs.statSync(f).size), images: (body.match(/data:image\/[a-z]+;base64,/gu) ?? []).length,
      omitted: (body.match(/\[image omitted\]/gu) ?? []).length, compacted: (body.match(/"type":"compacted"/gu) ?? []).length };
  });
}
function boundThread(key) {
  const rows = spawnSync("sqlite3", [`file:${path.join(stateDir, "state", "openclaw.sqlite")}?mode=ro`, "select entry_key || char(9) || value_json from plugin_state_entries where namespace='app-server-thread-bindings';"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const row of rows) { try { const [entryKey, json] = row.split("\t"); const v = JSON.parse(json); if (entryKey.includes(key) || json.includes(key)) return { thread: v.binding?.threadId?.slice(0, 13), modelProvider: v.binding?.modelProvider, model: v.binding?.model }; } catch {} }
  return null;
}

// ---- phases ----
function classify() {
  // The two functions the guard uses, taken verbatim from the release artifact.
  const src = fs.readFileSync(path.join(repoRoot, "lab/release-files/codex-ds-window/dist/run-attempt-D1hJO4fX.js"), "utf8");
  const take = (name) => { const i = src.indexOf(`function ${name}(`); assert(i >= 0, name); return src.slice(i, src.indexOf("\n}\n", i) + 2); };
  const limitFor = new Function(`${take("parseCodexAppServerByteLimit")}\n${take("resolveCodexDeepSeekTranscriptByteLimit")}\nreturn resolveCodexDeepSeekTranscriptByteLimit;`)();
  const rows = spawnSync("sqlite3", [`file:${path.join(sharedState, "state", "openclaw.sqlite")}?mode=ro`, "select value_json from plugin_state_entries where namespace='app-server-thread-bindings';"], { encoding: "utf8", maxBuffer: 256 * MiB }).stdout.split("\n").filter(Boolean);
  const groups = {};
  for (const row of rows) {
    let b; try { b = JSON.parse(row).binding; } catch { continue; }
    if (!b?.threadId) continue;
    const k = `${b.modelProvider ?? "(none)"}/${b.model ?? "(none)"}`;
    const g = groups[k] ??= { bindings: 0, limits: new Set(), rolloutsOver40MiB: 0, maxRolloutMiB: 0 };
    g.bindings += 1;
    g.limits.add(String(limitFor(b)));
    let size = 0; try { size = fs.statSync(b.rolloutPath).size; } catch {}
    if (size >= 40 * MiB) g.rolloutsOver40MiB += 1;
    g.maxRolloutMiB = Math.max(g.maxRolloutMiB, mib(size));
  }
  for (const g of Object.values(groups)) g.limits = [...g.limits];
  const gptLimited = Object.entries(groups).filter(([k, g]) => !/deepseek/iu.test(k) && g.limits.some((l) => l !== "undefined"));
  const dsUnlimited = Object.entries(groups).filter(([k, g]) => /deepseek/iu.test(k) && g.limits.some((l) => l !== String(40 * MiB)));
  console.log(JSON.stringify({ phase: "classify", bindings: rows.length, groups, nonDeepSeekLimited: gptLimited.length, deepSeekWithoutLimit: dsUnlimited.length,
    withEnvOff: (() => { process.env.OPENCLAW_V_CODEX_DS_WINDOW = "0"; const v = limitFor({ modelProvider: "deepseek", model: "deepseek-flash" }); delete process.env.OPENCLAW_V_CODEX_DS_WINDOW; return String(v); })() }));
  return { nonDeepSeekLimited: gptLimited.length, deepSeekWithoutLimit: dsUnlimited.length };
}

async function imagePhase(variant) {
  const key = `agent:makaron:explicit:vlab-dev-dsbytes-img-${variant}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const turns = [];
  await send(key, "/vds");
  const salt = `salt-${variant}-${randomUUID().slice(0, 8)}`;
  turns.push({ turn: "seed", ...(await send(key, `[${salt}] 请记住开头暗号 OTTER-4，后面会问。不要调用工具，只回复 OK。`)) });
  let first413;
  for (let t = 1; t <= IMG_TURNS; t += 1) {
    const { codes, files } = makeImages(t);
    const r = await send(key, `请用 view_image 打开下面 ${files.length} 张图，每张单独调用一次 view_image，不要用其他工具。然后只用一行按顺序列出每张图白色方框里的暗号。\n${files.join("\n")}`);
    const read = codes.filter((c) => r.reply.includes(c)).length;
    const row = { turn: t, ...r, reply: r.reply.slice(0, 160), codesRead: `${read}/${codes.length}`, bound: boundThread(key), threads: threads(t0) };
    turns.push(row);
    console.log(JSON.stringify({ phase: `img-${variant}`, ...row }));
    if (r.status413 && !first413) first413 = t;
    if (first413 && t >= first413 + 1) break; // baseline: one more turn after the first 413 is enough
  }
  const recall = await send(key, "不要调用任何工具。从我们的对话里回答：最开始让你记住的暗号是什么？只回一行。");
  turns.push({ turn: "recall", ...recall, reply: recall.reply.slice(0, 120), recallOk: recall.reply.includes("OTTER-4"), threads: threads(t0) });
  console.log(JSON.stringify({ phase: `img-${variant}`, turn: "recall", terminal: recall.terminal, reply: recall.reply.slice(0, 120), status413: recall.status413, byteGuard: recall.byteGuard.length }));
  const all = turns.filter((x) => x.requests);
  return {
    turns: all.map((x) => ({ turn: x.turn, terminal: x.terminal, codesRead: x.codesRead, maxRequestMiB: x.maxRequestMiB, status413: x.status413, byteGuard: x.byteGuard.length, cleared413: x.imagePayloadClear, compactions: x.compactions, bound: x.bound?.thread })),
    totalStatus413: all.reduce((n, x) => n + x.status413, 0), maxRequestMiB: Math.max(...all.map((x) => x.maxRequestMiB)), byteGuardRotations: all.reduce((n, x) => n + x.byteGuard.length, 0),
    failedTurns: all.filter((x) => x.terminal !== "final").length, recallOk: recall.reply.includes("OTTER-4"), threads: threads(t0),
    byteGuardLog: all.flatMap((x) => x.byteGuard).slice(0, 4),
  };
}

async function textPhase(variant) {
  const key = `agent:makaron:explicit:vlab-dev-dsbytes-text-${variant}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  await send(key, "/vds");
  const words = (n) => Array.from({ length: n }, (_, i) => `w${i % 997}`).join(" ");
  const out = [];
  for (let i = 0; i < TEXT_SEEDS; i += 1) {
    const r = await send(key, `${i === 0 ? `[salt-${variant}-${randomUUID().slice(0, 8)}] 请记住开头暗号 LARCH-7 和下面这段列表` : `列表第 ${i + 1} 段`}，后面会问。不要复述，不要调用工具，只回复 OK。 ${words(TEXT_WORDS)}`);
    out.push({ turn: i + 1, terminal: r.terminal, maxRequestMiB: r.maxRequestMiB, byteGuard: r.byteGuard.length, compactions: r.compactions, bound: boundThread(key)?.thread });
  }
  const recall = await send(key, "不要调用任何工具。最开始让你记住的暗号是什么？只回一行。");
  out.push({ turn: "recall", terminal: recall.terminal, reply: recall.reply.slice(0, 80), byteGuard: recall.byteGuard.length, bound: boundThread(key)?.thread });
  const th = threads(t0);
  const summary = { turns: out, threads: th, recallOk: recall.reply.includes("LARCH-7"), byteGuardRotations: out.reduce((n, x) => n + (x.byteGuard ?? 0), 0), failedTurns: out.filter((x) => x.terminal !== "final").length };
  console.log(JSON.stringify({ phase: `text-${variant}`, ...summary }));
  return summary;
}

try {
  const results = {};
  for (const label of PHASES) {
    if (label === "classify") { results[label] = classify(); continue; }
    const [kind, variant] = label.split("-");
    const runAttemptSha = installBytes(variant);
    console.log(JSON.stringify({ phase: label, runAttempt: runAttemptSha, sidecars: ["v-deepseek-model-catalog.json", "v-deepseek-base-instructions.md"].map((f) => sha(path.join(codexDist, f)).slice(0, 8)) }));
    startGateway();
    await waitPort();
    await sleep(3000);
    await connect();
    results[label] = { runAttempt: runAttemptSha, ...(kind === "img" ? await imagePhase(variant) : await textPhase(variant)) };
    client?.stop?.();
    await stopGateway();
  }
  console.log(JSON.stringify({ summary: results }));
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).join("\n")));
  process.exitCode = 1;
} finally {
  client?.stop?.();
  await stopGateway();
  proxy.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref?.();
  process.exit(process.exitCode ?? 0);
}
