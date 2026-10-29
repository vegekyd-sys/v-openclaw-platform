// Candidate e2e for lab/release-files/codex-turn-context-handoff: a real /vds session (Codex
// 0.159.2 app-server + DeepSeek, configured as on V) in an isolated Gateway. Every DeepSeek request
// goes through a local capture proxy, so we see exactly which developer items the model received.
//
// Four turns; SOUL.md gets a new line between turns 2 and 3.
//   MODE=baseline  V's bytes: the context rides collaboration-mode developer_instructions
//                  (DeepSeek has no catalog override, so it arrives) and is re-sent on change.
//   MODE=fixed     plan maps the patched files: the context arrives as one
//                  <openclaw_workspace_context> developer message, not in the collaboration item;
//                  re-delivered once after the SOUL.md change; each turn's first request extends
//                  the previous turn's last request (cached prefix kept).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const MODE = process.env.MODE ?? "fixed";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const SOUL_EDIT = `E2E-SOUL-EDIT-${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");

const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- codex plugin: install into the candidate state, then V's dist from the runtime ----
// The Gateway loads plugins from state, which starts without one. The runtime's V generation
// carries V's bytes plus, in the fixed run, the files the plan maps.
const npmProjects = path.join(stateDir, "npm", "projects");
let codexProject = fs.existsSync(npmProjects) && fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
if (!codexProject) {
  const r = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, `codex plugin install failed: ${redact((r.stderr || r.stdout).slice(-800))}`);
  codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
}
assert(codexProject, "codex plugin not found");
const codexDist = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex", "dist");
const vCodexDist = path.join(runtime, "npm", "projects", "openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2", "node_modules", "@openclaw", "codex", "dist");
fs.cpSync(vCodexDist, codexDist, { recursive: true, force: true });
const fileSha = (f) => createHash("sha256").update(fs.readFileSync(path.join(codexDist, f))).digest("hex").slice(0, 8);
console.log(JSON.stringify({ codexProject, dist: Object.fromEntries(["attempt-context-DmQUNWwT.js", "thread-lifecycle-DAcEJ_Om.js", "run-attempt-D1hJO4fX.js", "compact-_t0HQrUS.js"].map((f) => [f, fileSha(f)])) }));

// ---- config: V's /vds, no channels or cron ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex", "memory-core"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!config.models.providers.deepseek.models.some((m) => m.id === id)) config.models.providers.deepseek.models.push({ id, name, ...shape });
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const text = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8").replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, text, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const agentDir = config.agents.entries.makaron.agentDir;
const workspace = config.agents.entries.makaron.workspace;
// The candidate workspace starts empty: seed the bootstrap files with recognizable lines.
fs.mkdirSync(workspace, { recursive: true });
for (const [name, body] of Object.entries({
  "AGENTS.md": "# AGENTS.md\n\nE2E agents file: reply briefly.\n",
  "SOUL.md": "# SOUL.md - Who I Am\n\nE2E-SOUL-HEAD Core Truths: be genuinely helpful.\n",
  "IDENTITY.md": "# IDENTITY.md\n\nE2E-IDENTITY-HEAD name V.\n",
  "USER.md": "# USER.md\n\nE2E-USER-HEAD the human is Tianyi.\n",
  "MEMORY.md": "# MEMORY.md - Hot Memory\n\nE2E-MEMORY-HEAD DealClaw Admin entry is example.invalid/admin.\n",
})) if (!fs.existsSync(path.join(workspace, name))) fs.writeFileSync(path.join(workspace, name), body);
const soulPath = path.join(workspace, "SOUL.md");
const soulHead = fs.readFileSync(soulPath, "utf8").split("\n").find((l) => l.trim().length > 12)?.trim();
const memoryPath = path.join(workspace, "MEMORY.md");
const memoryHead = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, "utf8").split("\n").find((l) => l.trim().length > 12 && !l.startsWith("#"))?.trim() : undefined;

// ---- capture proxy in front of DeepSeek ----
const captures = [];
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const enc = String(req.headers["content-encoding"] ?? "");
    let body = raw;
    try { if (enc.includes("zstd")) body = zlib.zstdDecompressSync(raw); else if (enc.includes("gzip")) body = zlib.gunzipSync(raw); } catch {}
    let json;
    try { json = JSON.parse(body.toString("utf8")); } catch {}
    if (json && req.url.includes("responses")) captures.push({ at: Date.now(), json });
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.deepseek.com" } }, (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    up.end(raw);
  });
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const CODEX_HOME = path.join(agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxy.address().port}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

// ---- Gateway ----
const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (const s of [gateway.stdout, gateway.stderr]) { s.setEncoding("utf8"); s.on("data", (c) => { lines.push(...c.split(/\r?\n/u).filter(Boolean)); if (lines.length > 20000) lines.splice(0, lines.length - 20000); }); }
async function stopGateway() {
  if (gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
const deadline = Date.now() + 600_000;
for (;;) {
  if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
  if (await new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); })) break;
  if (Date.now() > deadline) throw new Error("Gateway did not listen");
  await sleep(500);
}
const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
let client;
for (let attempt = 1; ; attempt += 1) {
  try {
    client = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
      const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
        onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string") r.text = p.data.text.slice(0, 120); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
        onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
      c.start();
    });
    break;
  } catch (error) {
    if (attempt >= 36) throw error;
    await sleep(5000);
  }
}
async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 }, { timeoutMs: 60_000 });
  const until = Date.now() + 620_000;
  while (!r.terminal && Date.now() < until) await sleep(500);
  return r;
}

// ---- request inspection ----
const developerTexts = (json) => (json.input ?? []).filter((i) => i.type === "message" && i.role === "developer").flatMap((i) => (i.content ?? []).map((c) => c.text ?? ""));
function inspect(json) {
  const dev = developerTexts(json);
  const collab = dev.filter((t) => t.includes("<collaboration_mode>"));
  const handoff = dev.filter((t) => t.includes("<openclaw_workspace_context>"));
  const userText = (json.input ?? []).filter((i) => i.role === "user").flatMap((i) => (i.content ?? []).map((c) => c.text ?? "")).join("\n");
  return {
    items: (json.input ?? []).length,
    collabItems: collab.length,
    collabWithSoul: collab.filter((t) => t.includes(soulHead)).length,
    handoffItems: handoff.length,
    handoffWithSoul: handoff.filter((t) => t.includes(soulHead)).length,
    soulEditItems: dev.filter((t) => t.includes(SOUL_EDIT)).length,
    memoryInDeveloper: memoryHead ? dev.some((t) => t.includes(memoryHead)) : null,
    soulInUser: userText.includes(soulHead),
  };
}
const extendsPrevious = (prev, next) => JSON.stringify(next.input.slice(0, prev.input.length)) === JSON.stringify(prev.input);

const key = `agent:makaron:explicit:vlab-turnctx-${MODE}-${Date.now().toString(36)}`;
const turns = [];
let soulOriginal;
try {
  await send(key, "/vds");
  for (let i = 1; i <= 4; i += 1) {
    if (i === 3) {
      soulOriginal = fs.readFileSync(soulPath, "utf8");
      fs.writeFileSync(soulPath, `${soulOriginal.trimEnd()}\n\n${SOUL_EDIT}\n`);
    }
    const c0 = captures.length;
    const r = await send(key, `只回复：收到${i}`);
    turns.push({ turn: i, terminal: r.terminal, error: r.error, secs: Math.round(((r.endAt ?? Date.now()) - r.sentAt) / 1000), text: r.text, requests: captures.slice(c0).map((c) => c.json) });
  }
} finally {
  if (soulOriginal !== undefined) fs.writeFileSync(soulPath, soulOriginal);
  await stopGateway();
  proxy.close();
}

const summary = turns.map(({ requests, ...t }) => ({ ...t, requests: requests.length, first: requests[0] ? inspect(requests[0]) : null }));
const itemShape = (json) => (json.input ?? []).map((i) => `${i.type}:${i.role ?? ""}:${JSON.stringify(i.content ?? i).length}:${(i.content?.[0]?.text ?? "").slice(0, 28).replace(/\s+/gu, " ")}`);
if (process.env.DUMP_SMALL_ITEMS === "1") for (const i of turns[0]?.requests[0]?.input ?? []) { const t = i.content?.[0]?.text ?? ""; if (t.length < 2000 && !t.includes("openclaw_workspace_context")) console.log(JSON.stringify({ role: i.role, text: redact(t) })); }
console.log(JSON.stringify({ turn1Items: turns[0]?.requests[0] ? itemShape(turns[0].requests[0]) : null, turn2Items: turns[1]?.requests[0] ? itemShape(turns[1].requests[0]) : null }, null, 1));
const prefixKept = turns.slice(1).map((t, i) => {
  const prev = turns[i].requests.at(-1);
  const next = t.requests[0];
  return prev && next ? extendsPrevious(prev, next) : null;
});
const markerDir = path.join(agentDir, "codex-turn-context");
const markers = fs.existsSync(markerDir) ? fs.readdirSync(markerDir).map((f) => ({ f: f.slice(0, 13), ...JSON.parse(fs.readFileSync(path.join(markerDir, f), "utf8")) })) : [];
const warnings = lines.filter((l) => /workspace context|turn-context|turnContext/iu.test(l)).map((l) => redact(l).slice(0, 240)).slice(-10);
console.log(JSON.stringify({ mode: MODE, soulHead: soulHead?.slice(0, 40), memoryHead: memoryHead?.slice(0, 40), summary, prefixKept, markers: markers.map(({ sha256, ...m }) => ({ ...m, sha256: sha256.slice(0, 12) })), warnings }, null, 1));

for (const t of summary) assert.equal(t.terminal, "final", `turn ${t.turn}: ${t.terminal} ${t.error ?? ""}`);
for (const t of summary) assert.equal(t.first.soulInUser, false, `turn ${t.turn}: SOUL must not be in user input`);
assert(prefixKept.every((x) => x === true), `cached prefix kept across turns: ${JSON.stringify(prefixKept)}`);
const firsts = summary.map((t) => t.first);
if (MODE === "baseline") {
  // DeepSeek has no catalog override: the collaboration item carries the context, re-sent on change.
  assert.deepEqual(firsts.map((f) => f.collabWithSoul), [1, 1, 2, 2]);
  assert.deepEqual(firsts.map((f) => f.handoffItems), [0, 0, 0, 0]);
  assert.equal(markers.length, 0);
} else {
  assert.deepEqual(firsts.map((f) => f.collabWithSoul), [0, 0, 0, 0], "context must not ride collaboration mode");
  assert.deepEqual(firsts.map((f) => f.handoffWithSoul), [1, 1, 2, 2], "delivered once, again after the SOUL.md change");
  assert.deepEqual(firsts.map((f) => f.soulEditItems), [0, 0, 1, 1]);
  assert.equal(markers.length, 1, "one delivery record for the thread");
}
console.log(JSON.stringify({ ok: true, mode: MODE }));
// The Gateway client keeps its socket open; nothing else is pending.
process.exit(0);
