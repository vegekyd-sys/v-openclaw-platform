// Candidate e2e for lab/release-files/remote-node-stable: a real /vds session (Codex 0.159.2
// app-server + DeepSeek, configured as on V) in an isolated Gateway, while two paired macOS exec
// nodes disconnect and reconnect between turns the way a sleeping laptop does on V.
//
// The nodes are driven inside the Gateway process: a preload imports the same core module the Gateway
// uses (remote-CiV-Qx_e.js), installs a node registry that lists the "connected" fake nodes, and
// calls recordRemoteNodeInfo/recordRemoteNodeBins/removeRemoteNodeInfo, which is what the Gateway's
// node connect/disconnect handlers call. Every DeepSeek request goes through a capture proxy, and the
// Codex rollout shows each <openclaw_workspace_context> delivery.
//   ARM=v       V's bytes: live-connection note; each flap changes it and re-delivers the context.
//   ARM=stable  plan maps the patched file: one delivery for the whole session.
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
const ARM = process.env.ARM ?? "stable";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
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
// ---- in-Gateway node driver ----
const CTL = path.join(scratch, "node-ctl");
fs.mkdirSync(CTL, { recursive: true });
const preload = path.join(scratch, "node-flap-preload.mjs");
fs.writeFileSync(preload, `
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
const CTL = ${JSON.stringify(CTL)};
// The Gateway may run in a child of the launched process; only the process that listens on the
// Gateway port drives the nodes, so both never consume the same request.
let serving = false;
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const port = typeof args[0] === "object" && args[0] !== null ? args[0].port : args[0];
  if (Number(port) === ${port}) serving = true;
  return listen.apply(this, args);
};
const mod = await import(${JSON.stringify(`file://${runtime}/openclaw/dist/remote-CiV-Qx_e.js`)});
const record = mod.i, recordBins = mod.r, remove = mod.s, setRegistry = mod.l, eligibility = mod.t;
const live = new Map();
const registry = { listCurrentConnectedSync: () => [...live.values()], get: (id) => live.get(id), checkConnectivity: async () => ({ ok: true }) };
const NODES = { air: "Tianyi Air Headless", laptop: "Tianyi Mac" };
let installed = false;
setInterval(() => {
  if (!serving) return;
  const req = path.join(CTL, "req.json");
  if (!fs.existsSync(req)) return;
  const { seq, ops } = JSON.parse(fs.readFileSync(req, "utf8"));
  fs.rmSync(req);
  for (const [op, id] of ops) {
    if (op === "install" && !installed) { setRegistry(registry); installed = true; }
    if (op === "connect") {
      const session = { nodeId: id, connId: "conn-" + id + "-" + Date.now(), pairingGeneration: "g1", displayName: NODES[id], platform: "macos", deviceFamily: "Mac", commands: ["system.run", "system.which"] };
      live.set(id, session);
      record(session);
      recordBins(id, [], "g1");
    }
    if (op === "disconnect") { live.delete(id); remove(id); }
  }
  fs.writeFileSync(path.join(CTL, "ack-" + seq + ".json"), JSON.stringify({ note: eligibility()?.note ?? null, pid: process.pid }));
}, 100).unref();
`);
let ctlSeq = 0;
const driverPids = new Set();
async function nodes(...ops) {
  const seq = ++ctlSeq;
  fs.writeFileSync(path.join(CTL, "req.json"), JSON.stringify({ seq, ops }));
  const ack = path.join(CTL, `ack-${seq}.json`);
  for (let i = 0; i < 100 && !fs.existsSync(ack); i += 1) await sleep(100);
  assert(fs.existsSync(ack), "node driver did not answer");
  const answer = JSON.parse(fs.readFileSync(ack, "utf8"));
  driverPids.add(answer.pid);
  return answer.note;
}
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", "--import", `file://${preload}`, `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
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


// ---- what the thread received ----
function rolloutWorkspaceDeliveries() {
  const root = path.join(CODEX_HOME, "sessions");
  const files = spawnSync("bash", ["-c", `find ${root} -name 'rollout-*.jsonl' 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const out = [];
  for (const f of files) {
    for (const l of fs.readFileSync(f, "utf8").split("\n")) {
      if (!l.includes("openclaw_workspace_context")) continue;
      let d; try { d = JSON.parse(l); } catch { continue; }
      const p = d.payload ?? {};
      if (d.type !== "response_item" || p.role !== "developer") continue;
      const text = (p.content ?? []).map((c) => c.text ?? "").join("");
      if (!text.startsWith("<openclaw_workspace_context>")) continue;
      out.push({ at: d.timestamp, chars: text.length, sha: createHash("sha256").update(text).digest("hex").slice(0, 12), nodeLine: (text.match(/^.*(Remote macOS node|Paired macOS nodes).*$/mu) ?? [null])[0] });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

const key = `agent:makaron:explicit:vlab-node-flap-${ARM}-${Date.now().toString(36)}`;
const steps = [];
try {
  steps.push({ step: "connect air, laptop", note: await nodes(["install"], ["connect", "air"], ["connect", "laptop"]) });
  await send(key, "/vds");
  const turns = [
    ["T1", null],
    ["T2", ["laptop sleeps", [["disconnect", "laptop"]]]],
    ["T3", ["laptop wakes", [["connect", "laptop"]]]],
    ["T4", ["air reconnects (order changes)", [["disconnect", "air"], ["connect", "air"]]]],
    ["T5", ["both asleep", [["disconnect", "air"], ["disconnect", "laptop"]]]],
  ];
  for (const [turn, flap] of turns) {
    if (flap) steps.push({ step: flap[0], note: await nodes(...flap[1]) });
    const r = await send(key, `只回复：收到${turn}`);
    steps.push({ step: turn, terminal: r.terminal, error: r.error, secs: Math.round(((r.endAt ?? Date.now()) - r.sentAt) / 1000), deliveriesSoFar: rolloutWorkspaceDeliveries().length });
  }
} finally {
  await stopGateway();
  proxy.close();
}
const deliveries = rolloutWorkspaceDeliveries();
console.log(JSON.stringify({ arm: ARM, steps, deliveries, driverPids: [...driverPids] }, null, 1));
assert.equal(driverPids.size, 1, "one Gateway process drove every node change");
for (const s of steps.filter((s) => s.terminal !== undefined)) assert.equal(s.terminal, "final", `${s.step}: ${s.terminal} ${s.error ?? ""}`);
const notes = steps.filter((s) => s.note !== undefined).map((s) => s.note);
if (ARM === "v") {
  assert(new Set(notes).size >= 3, `V's note follows the live connections: ${JSON.stringify(notes)}`);
  assert(deliveries.length >= 4, `V re-delivers the context after node flaps: ${deliveries.length}`);
} else {
  assert.equal(new Set(notes).size, 1, `the note is the same through every flap: ${JSON.stringify(notes)}`);
  assert.equal(notes[0], "Paired macOS nodes: Tianyi Air Headless, Tianyi Mac. Run macOS-only skills via exec host=node on one of them; a node that is asleep or offline fails the call.");
  assert.equal(deliveries.length, 1, `one delivery for the whole session: ${deliveries.length}`);
  assert.match(deliveries[0].nodeLine ?? "", /Paired macOS nodes: Tianyi Air Headless, Tianyi Mac\./u, "the delivered context carries the note");
}
console.log(JSON.stringify({ ok: true, arm: ARM, deliveries: deliveries.length }));
process.exit(0);
