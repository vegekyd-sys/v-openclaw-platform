// Candidate probe: /vds context window (patch D, a DeepSeek-only Codex model catalog) and
// oversized-thread handling (patch C). Isolated Gateway; /vds configured as on V.
//
// DeepSeek requests go through a local capture proxy, so the exact request Codex sends with
// and without the catalog can be compared field by field: the catalog must only change the
// context window, never the instructions or tools DeepSeek receives.
//
//   PHASES=A          no catalog, one small turn (baseline request)
//   PHASES=A,B        + catalog (lab/release-files/codex-firsttext/openclaw-deepseek-model-catalog.json), same turn, compare
//   PHASES=A,B,C,D    + big session without catalog (C) and with catalog (D), two turns each
//   PHASES=T          owner and member turns share one thread (patch F)
//   PHASES=S          a compaction handoff summary is not delivered as the reply (patch G)
//   PHASES=U          big session, owner and member alternating: V's bytes vs codex-toolset-cover
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
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const PHASES = (process.env.PHASES ?? "A,C").split(",");
const BIG_WORDS = Number(process.env.BIG_WORDS ?? 140000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (s) => (s === undefined ? null : spawnSync("sha256sum", { input: s, encoding: "utf8" }).stdout.slice(0, 12));

const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
const captureDir = path.join(scratch, "captures");
for (const d of [tmpDir, cacheDir, captureDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- codex plugin: V's bytes + this branch's patch ----
const npmProjects = path.join(stateDir, "npm", "projects");
let codexProject = fs.existsSync(npmProjects) && fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
if (!codexProject) {
  const r = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  console.log(JSON.stringify({ codexInstall: r.status }));
  codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
}
assert(codexProject, "codex plugin not found");
const codexRoot = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex");
const codexDist = path.join(codexRoot, "dist");
fs.copyFileSync(path.join(repoRoot, "lab/release-files/background-work-20261002/vlab-codex-parity/harness-DXVZ5II5.js"), path.join(codexDist, "harness-DXVZ5II5.js"));
for (const f of ["run-attempt-D1hJO4fX.js", "thread-lifecycle-DAcEJ_Om.js"]) fs.copyFileSync(path.join(repoRoot, "lab/release-files/codex-firsttext/dist", f), path.join(codexDist, f));
// TRACE=1: log every app-server notification the turn projector sees (method, item id/type/phase,
// first characters of a delta), in this candidate's copy only.
if (process.env.TRACE === "1") {
  const ra = path.join(codexDist, "run-attempt-D1hJO4fX.js");
  const anchor = "\t\tthis.assistantProjection.handleNotification(notification.method, params);\n";
  const src = fs.readFileSync(ra, "utf8");
  assert.equal(src.split(anchor).length, 2, "trace anchor");
  fs.writeFileSync(ra, src.replace(anchor, anchor + "\t\tconsole.log(\"[codex-notify-trace] \" + JSON.stringify({ m: notification.method, id: params?.itemId ?? params?.item?.id, t: params?.item?.type, ph: params?.item?.phase, d: typeof params?.delta === \"string\" ? params.delta.slice(0, 24) : void 0, compacting: this.isCompacting() }));\n"));
}

// ---- config: V's /vds ----
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
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
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
    if (json && req.url.includes("responses")) {
      const seq = captures.length;
      fs.writeFileSync(path.join(captureDir, `${seq}.json`), JSON.stringify(json));
      captures.push({ at: Date.now(), url: req.url, json });
    }
    const headers = { ...req.headers, host: "api.deepseek.com" };
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers }, (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    up.end(raw);
  });
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const proxyPort = proxy.address().port;

const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxyPort}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
const CATALOG_TARGET = path.join(CODEX_HOME, "openclaw-deepseek-model-catalog.json");
// Phases B and D need a catalog file (CATALOG_SOURCE); the per-thread catalog was not shipped, see README.
const CATALOG_SOURCE = process.env.CATALOG_SOURCE ?? path.join(repoRoot, "lab/candidate/openclaw-deepseek-model-catalog.json");

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) { s.setEncoding("utf8"); s.on("data", (c) => { lines.push(...c.split(/\r?\n/u).filter(Boolean)); if (lines.length > 20000) lines.splice(0, lines.length - 20000); }); }
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
  // The Gateway may restart itself right after it starts listening (config derivation); retry.
  for (let attempt = 1; ; attempt += 1) {
    try { await connectOnce(); return; } catch (error) {
      if (attempt >= 36) throw error;
      console.log(JSON.stringify({ connectRetry: attempt, error: String(error?.message ?? error).slice(0, 120) }));
      await sleep(5000);
    }
  }
}
async function connectOnce(scopes = ["operator.read", "operator.write", "operator.admin"]) {
  client = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes,
      onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string") r.streamed = (r.streamed ?? []).concat(p.data.text.slice(0, 60)).slice(-40); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
      onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
    c.start();
  });
}
async function send(key, message, via = client) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await via.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 }, { timeoutMs: 60_000 });
  const deadline = Date.now() + 620_000;
  while (!r.terminal && Date.now() < deadline) await sleep(500);
  return r;
}
function rollouts(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    let turns = 0, compactions = 0, tools = null; const windows = new Set(); const usage = [];
    for (const l of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "session_meta") tools = (p.dynamic_tools ?? []).length;
      if (e.type === "event_msg" && p.type === "task_started") turns += 1;
      if (e.type === "compacted") compactions += 1;
      if (e.type === "event_msg" && p.type === "token_count" && p.info) { windows.add(p.info.model_context_window); usage.push(p.info.last_token_usage?.total_tokens); }
    }
    const tid = path.basename(f).slice(-41, -6);
    const tags = spawnSync("sqlite3", ["-readonly", `file:${CODEX_HOME}/logs_2.sqlite?mode=ro`, `select feedback_log_body from logs where thread_id='${tid}' and feedback_log_body like '%model_context_window%' limit 1`], { encoding: "utf8" }).stdout;
    const tag = (k) => tags.match(new RegExp(`"${k}":"([^"]*)"`, "u"))?.[1];
    return { thread: tid.slice(0, 13), tools, turns, compactions, windows: [...windows], usage: usage.slice(-4),
      catalogTag: tag("model_catalog_json"), windowTag: tag("model_context_window"), effectiveTag: tag("model_context_window_effective") };
  });
}
function summarize(json) {
  const tools = (json.tools ?? []).map((t) => t.name ?? t.type);
  const rest = Object.fromEntries(Object.entries(json).filter(([k]) => !["input", "instructions", "tools", "prompt_cache_key"].includes(k)));
  return { keys: Object.keys(json).sort(), instructionsSha: sha(json.instructions), instructionsLen: json.instructions?.length, toolsSha: sha(JSON.stringify(json.tools)), tools, rest };
}
function diffRequests(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (["input", "prompt_cache_key"].includes(k)) continue;
    const va = JSON.stringify(a[k]), vb = JSON.stringify(b[k]);
    if (va !== vb) out.push({ field: k, a: va?.slice(0, 300), b: vb?.slice(0, 300) });
  }
  return out;
}
const bigText = (words) => Array.from({ length: words }, (_, i) => `w${i % 997}`).join(" ");

async function phase(label, withCatalog, turns) {
  if (withCatalog) fs.copyFileSync(CATALOG_SOURCE, CATALOG_TARGET); else fs.rmSync(CATALOG_TARGET, { force: true });
  const key = `agent:makaron:explicit:vlab-dev-dswin-${label}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const c0 = captures.length;
  await send(key, "/vds");
  const results = [];
  for (const msg of turns) {
    const mark = lines.length;
    const r = await send(key, msg);
    results.push({ terminal: r.terminal, error: r.error, secs: Math.round((r.endAt - r.sentAt) / 1000),
      log: lines.slice(mark).filter((l) => /exceeded active token limit|keeping oversized DeepSeek|auto-compaction|starting a fresh thread|model_catalog_json|catalog/iu.test(l)).map((l) => redact(l).slice(0, 220)).slice(-6) });
  }
  if (process.env.TRACE === "1") {
    // Collapse runs of the same (method, item) so the order stays readable.
    const out = [];
    for (const l of lines.filter((x) => x.includes("[codex-notify-trace]"))) {
      const j = JSON.parse(l.slice(l.indexOf("{")));
      const k = `${j.m}|${j.id}`;
      if (out.length && out.at(-1).k === k) { out.at(-1).n += 1; continue; }
      out.push({ k, n: 1, ...j });
    }
    console.log(JSON.stringify({ phase: label, trace: out.map(({ k, ...r }) => r) }));
    lines.splice(0, lines.length);
  }
  const caps = captures.slice(c0);
  console.log(JSON.stringify({ phase: label, catalog: withCatalog, results, requests: caps.length, first: caps[0] ? summarize(caps[0].json) : null, rollouts: rollouts(t0) }));
  return caps;
}

try {
  startGateway();
  await waitPort();
  await sleep(3000);
  await connect();
  const small = ["Without using any tools, reply with one short sentence about tides."];
  const big = [`Remember this list for later; do not repeat it, just reply OK. ${bigText(BIG_WORDS)}`, "Without using any tools: what was the first word of the list I gave you? Reply in one line."];
  let A, B;
  if (PHASES.includes("A")) A = await phase("A", false, small);
  if (PHASES.includes("B")) {
    assert(fs.existsSync(CATALOG_SOURCE), `${CATALOG_SOURCE} missing`);
    B = await phase("B", true, small);
    if (A?.[0] && B?.[0]) console.log(JSON.stringify({ compareFirstRequest: diffRequests(A[0].json, B[0].json) }));
  }
  if (PHASES.includes("C")) await phase("C", false, big);
  if (PHASES.includes("D")) await phase("D", true, big);
  // F: the deferred memory flush must not take over the session's Codex thread.
  if (PHASES.includes("F")) {
    const tl = path.join(codexDist, "thread-lifecycle-DAcEJ_Om.js");
    const patchedLine = '\t\tconst transientDelegationRestriction = params.params.delegationCapability === "report_only" || params.params.trigger === "memory";\n';
    const vLine = '\t\tconst transientDelegationRestriction = params.params.delegationCapability === "report_only";\n';
    const patchedSrc = fs.readFileSync(tl, "utf8");
    for (const variant of (process.env.F_VARIANTS ?? "v,patched").split(",")) {
      fs.writeFileSync(tl, variant === "v" ? patchedSrc.replace(patchedLine, vLine) : patchedSrc);
      client?.stop?.(); await stopGateway(); startGateway(); await waitPort(); await sleep(3000); await connect();
      const key = `agent:makaron:explicit:vlab-dev-dsflush-${variant}-${Date.now().toString(36)}`;
      const t0 = Date.now();
      await send(key, "/vds");
      const r1 = await send(key, big[0]);
      const mark = lines.length;
      const deadline = Date.now() + 8 * 60_000;
      let flush;
      while (Date.now() < deadline && !(flush = lines.slice(mark).find((l) => /memory-flush-deferred\.1\].*"phase":"ran"/u.test(l)))) await sleep(3000);
      const r2 = await send(key, big[1]);
      console.log(JSON.stringify({ phase: "F", variant, turn1: r1.terminal, flush: flush ? redact(flush).slice(-160) : "no flush within 8 min", turn2: r2.terminal, turn2Secs: Math.round((r2.endAt - r2.sentAt) / 1000), rollouts: rollouts(t0) }));
    }
  }
  // S: a /vds session over Codex's window compacts inside the next turn. The handoff summary the
  // model writes for the compaction must not become the reply; the real answer must. Runs V's
  // run-attempt (v) and this branch's (fixed) on the same Gateway setup.
  if (PHASES.includes("S")) {
    const ra = path.join(codexDist, "run-attempt-D1hJO4fX.js");
    const fixedSrc = fs.readFileSync(ra, "utf8");
    const fixedLine = "\t\tif (!this.isCompacting()) this.assistantProjection.handleRawResponseItemCompleted(item, this.activeItemIds); // v-codex-firsttext-v5: a compaction handoff summary is not a reply\n";
    const vLine = "\t\tthis.assistantProjection.handleRawResponseItemCompleted(item, this.activeItemIds);\n";
    assert.equal(fixedSrc.split(fixedLine).length, 2, "fixed line present once");
    for (const variant of (process.env.S_VARIANTS ?? "v,fixed").split(",")) {
      fs.writeFileSync(ra, variant === "v" ? fixedSrc.replace(fixedLine, vLine) : fixedSrc);
      client?.stop?.(); await stopGateway(); startGateway(); await waitPort(); await sleep(3000); await connect();
      const key = `agent:makaron:explicit:vlab-dev-dssum-${variant}-${Date.now().toString(36)}`;
      const t0 = Date.now();
      await send(key, "/vds");
      const r1 = await send(key, big[0]);
      const mark = lines.length;
      const r2 = await send(key, "Do not use any tools. Reply with exactly this and nothing else: ANSWER-OK-7");
      const h = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 6 }, { timeoutMs: 30_000 });
      const texts = (h.messages ?? []).filter((m) => m.role === "assistant").map((m) => (typeof m.content === "string" ? m.content : (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ")).trim());
      const last = texts.at(-1) ?? "";
      const streamedSummary = (r2.streamed ?? []).some((t) => /Checkpoint|Handoff|^#/u.test(t));
      console.log(JSON.stringify({ phase: "S", variant, turn1: r1.terminal, turn2: r2.terminal, turn2Secs: Math.round((r2.endAt - r2.sentAt) / 1000),
        storedReply: last.slice(0, 120), replyIsAnswer: last.includes("ANSWER-OK-7"), storedSummary: texts.some((t) => /Checkpoint|Handoff/u.test(t)), streamedSummary,
        streamedFirst: (r2.streamed ?? [])[0], compactionLog: lines.slice(mark).filter((l) => /keeping oversized|auto-compaction/u.test(l)).length, rollouts: rollouts(t0) }));
    }
  }
  // T: owner and member turns in one /vds session. chat.send marks the sender owner only with
  // operator.admin; members lose the owner-only tools. The member opens the session, so the owner's
  // first turn must rotate to a bigger thread; every later member turn must stay on it, and the
  // member must still be refused an owner-only tool.
  if (PHASES.includes("T")) {
    await connectOnce(["operator.read", "operator.write"]);
    const member = client;
    await connect();
    const key = `agent:makaron:explicit:vlab-dev-toolset-${Date.now().toString(36)}`;
    const t0 = Date.now();
    const mark = lines.length;
    await send(key, "/vds");
    const steps = [
      ["member", "Do not use any tools. Remember the code word OTTER-4 and reply with one short sentence."],
      ["owner", "Do not use any tools. From our conversation only: what code word was given earlier? One line."],
      ["member", "Do not use any tools. Remember a second code word LARCH-7 and reply with one short sentence."],
      ["owner", "Do not use any tools. From our conversation only: list every code word given so far. One line."],
      ["member", "Call the conversations_list tool once with no arguments and report in one line exactly what it returned (error text included). Do not call any other tool."],
      ["member", "Do not use any tools. From our conversation only: list every code word given so far. One line."],
    ];
    const results = [];
    for (const [who, msg] of steps) {
      const r = await send(key, msg, who === "owner" ? client : member);
      const h = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 4 }, { timeoutMs: 30_000 });
      const a = (h.messages ?? []).filter((m) => m.role === "assistant").at(-1);
      const reply = typeof a?.content === "string" ? a.content : (a?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
      results.push({ who, terminal: r.terminal, error: r.error, secs: Math.round((r.endAt - r.sentAt) / 1000), reply: String(reply).trim().slice(0, 160) });
    }
    const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(t0 / 1000)}`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    const body = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    console.log(JSON.stringify({ phase: "T", results, rollouts: rollouts(t0),
      ownerOnlyProbe: { calls: body.split('"name":"conversations_list"').length - 1, refused: body.split("Unknown OpenClaw tool: conversations_list").length + body.split("not available for this turn").length - 2 },
      log: lines.slice(mark).filter((l) => /tool catalog|starting a new thread|transient thread|cross-provider|not available for this turn|Unknown OpenClaw tool/u.test(l)).map((l) => redact(l).slice(0, 220)).slice(-12) }));
    member.stop?.();
  }
  // U: the oc_88d96b7e case on V's current Codex bytes. A /vds session over Codex's 244,800-token
  // compaction limit while a member and the owner take turns. V's thread-lifecycle (v) starts a
  // fresh thread at every change of speaker and replays the whole transcript into it, so each such
  // turn compacts; codex-toolset-cover (fixed) keeps the owner's thread for the member's turns.
  if (PHASES.includes("U")) {
    for (const f of fs.readdirSync(path.join(repoRoot, "lab/release-files/vds-view-image/codex-dist"))) fs.copyFileSync(path.join(repoRoot, "lab/release-files/vds-view-image/codex-dist", f), path.join(codexDist, f));
    const tl = path.join(codexDist, "thread-lifecycle-DAcEJ_Om.js");
    const sources = { v: "lab/release-files/vds-view-image/codex-dist/thread-lifecycle-DAcEJ_Om.js", fixed: "lab/release-files/codex-toolset-cover/dist/thread-lifecycle-DAcEJ_Om.js" };
    for (const variant of (process.env.U_VARIANTS ?? "v,fixed").split(",")) {
      fs.copyFileSync(path.join(repoRoot, sources[variant]), tl);
      client?.stop?.(); await stopGateway(); startGateway(); await waitPort(); await sleep(3000);
      await connectOnce(["operator.read", "operator.write"]);
      const member = client;
      await connect();
      const key = `agent:makaron:explicit:vlab-dev-toolcover-${variant}-${Date.now().toString(36)}`;
      const t0 = Date.now();
      await send(key, "/vds");
      // A thread projection drops most of one huge message, so pad the session with several
      // (U_SEED_MESSAGES × U_SEED_WORDS) to get a fresh thread's replay past the limit, as on V.
      const seeds = Number(process.env.U_SEED_MESSAGES ?? 1);
      const seedWords = Number(process.env.U_SEED_WORDS ?? BIG_WORDS);
      const steps = [
        ...Array.from({ length: seeds }, (_, i) => ["member", `${i === 0 ? "Remember the code word OTTER-4 and this list" : `Part ${i + 1} of the list`} for later; do not repeat it, just reply OK. ${bigText(seedWords)}`]),
        ["owner", "Do not use any tools. From our conversation only: what code word was given earlier? One line."],
        ["member", "Do not use any tools. Remember a second code word LARCH-7 and reply with one short sentence."],
        ["owner", "Do not use any tools. From our conversation only: list every code word given so far. One line."],
        ["member", "Do not use any tools. Remember a third code word BIRCH-2 and reply with one short sentence."],
        ["owner", "Do not use any tools. From our conversation only: list every code word given so far. One line."],
      ];
      const results = [];
      for (const [who, msg] of steps) {
        const mark = lines.length;
        const r = await send(key, msg, who === "owner" ? client : member);
        const h = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 4 }, { timeoutMs: 30_000 });
        const a = (h.messages ?? []).filter((m) => m.role === "assistant").at(-1);
        const reply = typeof a?.content === "string" ? a.content : (a?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
        const log = lines.slice(mark);
        results.push({ who, terminal: r.terminal, error: r.error, secs: Math.round((r.endAt - r.sentAt) / 1000), reply: String(reply).trim().slice(0, 120),
          compactions: log.filter((l) => /auto-compaction succeeded/u.test(l)).length, keptThread: log.some((l) => /tool catalog covers this turn/u.test(l)) });
      }
      const threads = rollouts(t0);
      console.log(JSON.stringify({ phase: "U", variant, results, threads: threads.length, compactions: threads.reduce((n, t) => n + t.compactions, 0), rollouts: threads }));
      member.stop?.();
    }
  }
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-60).join("\n")));
  process.exitCode = 1;
} finally {
  client?.stop?.();
  await stopGateway();
  proxy.close();
}
