// Candidate A/B: where a /vds (Codex 0.159.2 + DeepSeek) session compacts when a turn ends just
// under Codex's 900,000-token compaction line and the next message arrives after the OpenClaw
// workspace context changed (V re-delivers it as a ~75k-character developer message).
//
// On V (11/10) this is the "📦 正在整理上下文" wait before the first word: the delivered context pushes
// the thread past the line, Codex compacts before the turn (pre-turn), and the compaction request
// is a cold ~750k-token prefill (Codex sends it without tools, so DeepSeek's cached prefix breaks).
//
//   ARM=v      CODEX_HOME/config.toml as on V (no post-turn threshold)
//   ARM=post   config.toml also sets model_post_turn_compact_threshold_percent = POST_PCT (90)
//   ARM=hot    no setting while the session is built; the setting is written to config.toml and the
//              DeepSeek app-server is stopped before the trigger turn, so the thread is resumed
//              under the new file (what an idle V thread does after `configure ... apply`)
//
// Turns: /vds; seed messages until the thread is at SEED_TARGET (840k, under 90% of 950k); T0 carries
// one more part of the list plus a short question and ends at T0_TARGET (893k, under 900k);
// post arms: T0b is sent while T0 compacts and must be answered (V steers it into T0's turn; Codex answers after the compaction);
// SOUL.md gets one more line (re-delivery); T1 is the measured first message; T2 recalls the code word.
// User-visible first text = chat.send -> first assistant text event of that run on this Gateway
// (no Feishu here; the card adds ~0.5–1 s on V).
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
const ARM = process.env.ARM ?? "post";
assert(["v", "post", "hot"].includes(ARM), `ARM=${ARM}`);
const POST_PCT = Number(process.env.POST_PCT ?? 90);
const SEED_TARGET = Number(process.env.SEED_TARGET ?? 840_000); // below 90% × 950k, so no seed turn compacts
const T0_TARGET = Number(process.env.T0_TARGET ?? 893_000); // T0 itself ends here, just under 900k
const SEED_CEILING = 893_000; // stay under Codex's 900,000 line after the seed turn's own output
const PAD_WORDS = Number(process.env.PAD_WORDS ?? 26_000);
const SOUL_CHARS = Number(process.env.SOUL_CHARS ?? 90_000);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const salt = randomUUID().slice(0, 8);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (o) => console.log(JSON.stringify(o));

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

// ---- codex plugin: V's dist from the runtime (same as codex-turn-context-handoff-e2e) ----
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
const fileSha = (f) => createHash("sha256").update(fs.readFileSync(path.join(codexDist, f))).digest("hex").slice(0, 12);
log({ arm: ARM, postPct: POST_PCT, seedTarget: SEED_TARGET, codexProject, dist: Object.fromEntries(["thread-lifecycle-DAcEJ_Om.js", "run-attempt-D1hJO4fX.js", "v-deepseek-model-catalog.json"].map((f) => [f, fileSha(f)])) });

// ---- config: V's /vds, no channels or cron ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex", "memory-core"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 980000, maxTokens: 64000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
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
// V's workspace context is ~75k characters (mostly the skills list); a long SOUL.md stands in for it.
fs.mkdirSync(workspace, { recursive: true });
const soulFiller = Array.from({ length: Math.ceil(SOUL_CHARS / 64) }, (_, i) => `- Principle ${i}: keep replies short, check facts, and say what was verified.`).join("\n");
for (const [name, body] of Object.entries({
  "AGENTS.md": "# AGENTS.md\n\nReply briefly. Do not use tools unless asked.\n",
  "SOUL.md": `# SOUL.md - Who I Am\n\nCore truths for this candidate.\n\n${soulFiller}\n`,
  "IDENTITY.md": "# IDENTITY.md\n\nname V.\n",
  "USER.md": "# USER.md\n\nThe human is Tianyi.\n",
  "MEMORY.md": "# MEMORY.md - Hot Memory\n\nNothing yet.\n",
})) fs.writeFileSync(path.join(workspace, name), body);
const soulPath = path.join(workspace, "SOUL.md");

// ---- DeepSeek proxy: records each Responses request and its usage ----
const requests = [];
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
    const rec = json && req.url.includes("responses") ? { at: Date.now(), tools: (json.tools ?? []).length, items: (json.input ?? []).length } : undefined;
    if (rec) requests.push(rec);
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.deepseek.com" } }, (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      let tail = "";
      upRes.on("data", (c) => { if (rec) { tail = (tail + c.toString("utf8")).slice(-20000); } });
      upRes.on("end", () => {
        if (!rec) return;
        rec.endAt = Date.now();
        rec.status = upRes.statusCode;
        const m = tail.match(/"usage"\s*:\s*\{[^{}]*"input_tokens"\s*:\s*(\d+)[^{}]*?"input_tokens_details"\s*:\s*\{[^{}]*"cached_tokens"\s*:\s*(\d+)/u) ?? tail.match(/"input_tokens"\s*:\s*(\d+)[\s\S]*?"cached_tokens"\s*:\s*(\d+)/u);
        if (m) { rec.input = Number(m[1]); rec.cached = Number(m[2]); }
      });
      upRes.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    up.end(raw);
  });
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const CODEX_HOME = path.join(agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
const configToml = (withPostTurn) => `${withPostTurn ? `model_post_turn_compact_threshold_percent = ${POST_PCT}\n\n` : ""}[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxy.address().port}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\nrequest_max_retries = 1\nstream_max_retries = 1\n`;
fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), configToml(ARM === "post"), { mode: 0o600 });

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
        onEvent(e) {
          const p = e.payload;
          const r = runs.get(p?.runId);
          if (!r) return;
          const now = Date.now();
          if (e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string" && p.data.text.trim()) {
            r.firstTextAt ??= now;
            const text = p.data.text.slice(0, 200);
            // Streamed text grows within a message; a text that does not extend the last one starts a new message.
            const texts = (r.texts ??= []);
            if (texts.length && text.startsWith(texts.at(-1))) texts[texts.length - 1] = text; else { texts.push(text); (r.textAt ??= []).push(now); }
            r.text = text;
          }
          if (e.event === "agent" && p.stream === "compaction") (r.compaction ??= []).push({ at: now, phase: p.data?.phase, completed: p.data?.completed });
          if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = now; if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); }
        },
        onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
      c.start();
    });
    break;
  } catch (error) {
    if (attempt >= 36) throw error;
    await sleep(5000);
  }
}
async function start(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now(), r0: requests.length };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 900_000 }, { timeoutMs: 60_000 });
  return r;
}
async function wait(r) {
  const until = Date.now() + 920_000;
  while (!r.terminal && Date.now() < until) await sleep(250);
  r.requests = requests.slice(r.r0);
  return r;
}
const send = async (key, message) => wait(await start(key, message));

// ---- rollout (the Codex thread's own record) ----
function threadRollout() {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const deepseek = files.filter((f) => { try { return JSON.parse(fs.readFileSync(f, "utf8").split("\n", 1)[0]).payload?.model_provider === "deepseek"; } catch { return false; } });
  return deepseek.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}
function rolloutEvents(file) {
  const out = [];
  for (const l of fs.readFileSync(file, "utf8").split("\n")) {
    if (!l) continue;
    let d; try { d = JSON.parse(l); } catch { continue; }
    const p = d.payload ?? {};
    const at = Date.parse(d.timestamp);
    if (p.type === "task_started") out.push({ at, k: "start" });
    else if (p.type === "task_complete" || p.type === "turn_aborted") out.push({ at, k: "end" });
    else if (d.type === "compacted") out.push({ at, k: "compacted" });
    else if (p.type === "token_count" && p.info?.last_token_usage?.input_tokens) out.push({ at, k: "tokens", input: p.info.last_token_usage.input_tokens, cached: p.info.last_token_usage.cached_input_tokens });
    else if (d.type === "response_item" && p.type === "message" && p.role === "developer") out.push({ at, k: "developer", chars: JSON.stringify(p.content ?? []).length });
  }
  return out;
}
const lastInput = () => { const f = threadRollout(); if (!f) return 0; const t = rolloutEvents(f).filter((e) => e.k === "tokens"); return t.at(-1)?.input ?? 0; };
// What the rollout says about one run's turn: compactions before / after its first assistant text.
function turnView(r) {
  const f = threadRollout();
  const ev = rolloutEvents(f).filter((e) => e.at >= r.sentAt - 1000 && e.at <= (r.endAt ?? Date.now()) + 1000);
  const comp = ev.filter((e) => e.k === "compacted").map((e) => e.at);
  return {
    compactedBeforeText: comp.filter((t) => r.firstTextAt && t < r.firstTextAt).length,
    compactedAfterText: comp.filter((t) => r.firstTextAt && t >= r.firstTextAt).length,
    developerChars: ev.filter((e) => e.k === "developer").reduce((s, e) => s + e.chars, 0),
  };
}
const secs = (a, b) => (a && b ? Math.round((b - a) / 100) / 10 : null);
const summarize = (label, r) => ({
  turn: label, terminal: r.terminal, error: r.error,
  firstTextSec: secs(r.sentAt, r.firstTextAt), endSec: secs(r.sentAt, r.endAt),
  compactionEvents: (r.compaction ?? []).map((c) => ({ phase: c.phase, completed: c.completed, sec: secs(r.sentAt, c.at) })),
  requests: (r.requests ?? []).map((q) => ({ sec: secs(r.sentAt, q.at), tookSec: secs(q.at, q.endAt), tools: q.tools, input: q.input, cached: q.cached, status: q.status })),
  ...turnView(r), text: r.text, texts: r.texts ?? [],
});

const bigText = (words) => Array.from({ length: words }, (_, i) => `w${(i * 7919 + words) % 99991}`).join(" ");
const key = `agent:makaron:explicit:vlab-postturn-${ARM}-${salt}`;
const result = { arm: ARM, postPct: ARM === "v" ? null : POST_PCT, seed: [], turns: [] };
try {
  await send(key, "/vds");
  // Seed the thread to just under the line. Each seed turn is one model request.
  let tokensPerWord = 2.6;
  for (let i = 0; i < 40; i += 1) {
    const now = lastInput();
    if (now >= SEED_TARGET) break;
    const words = Math.max(2000, Math.min(PAD_WORDS, Math.floor((SEED_TARGET - now) / tokensPerWord)));
    const msg = i === 0 ? `[${salt}] Remember the code word HERON-${salt.slice(0, 4)} and this list for later; do not repeat it, just reply OK. ${bigText(words)}` : `Part ${i + 1} of the list for later; do not repeat it, just reply OK. ${bigText(words)}`;
    const r = await send(key, msg);
    const after = lastInput();
    if (i > 0 && after > now) tokensPerWord = Math.max(1, (after - now - 400) / words);
    result.seed.push({ i, words, terminal: r.terminal, input: after, sec: secs(r.sentAt, r.endAt), compacted: turnView(r).compactedBeforeText + turnView(r).compactedAfterText });
    assert.equal(r.terminal, "final", `seed ${i}: ${r.error ?? r.terminal}`);
    assert(after < SEED_CEILING, `seed overshot the line: ${after}`);
  }
  log({ seeded: result.seed.at(-1), tokensPerWord });
  assert(lastInput() >= SEED_TARGET, `seed reached ${lastInput()}`);

  if (ARM === "hot") {
    // The live thread keeps the config it loaded; V unloads it after 30 idle minutes. Stopping the
    // app-server here makes the next turn resume the thread under the changed config.toml.
    fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), configToml(true), { mode: 0o600 });
    const ps = spawnSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" }).stdout.split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/u)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
    const mine = new Set([gateway.pid]);
    for (let grew = true; grew;) { grew = false; for (const p of ps) if (mine.has(p.ppid) && !mine.has(p.pid)) { mine.add(p.pid); grew = true; } }
    const pids = ps.filter((p) => mine.has(p.pid) && /codex/u.test(p.args) && /app-server/u.test(p.args)).map((p) => p.pid);
    for (const pid of pids) try { process.kill(Number(pid), "SIGTERM"); } catch {}
    result.hotStoppedAppServers = pids.length;
    await sleep(3000);
  }

  // T0 brings the thread to just under the line, as a long working turn does on V.
  const now0 = lastInput();
  const t0Words = Math.max(500, Math.floor((T0_TARGET - now0) / tokensPerWord));
  const t0 = await start(key, `Last part of the list; do not repeat it. ${bigText(t0Words)}\n\nWithout using any tools: what is 17 times 23? Reply in one line.`);
  let t0b;
  if (ARM !== "v") {
    // A follow-up sent while T0 compacts after its answer.
    const until = Date.now() + 600_000;
    while (!(t0.compaction ?? []).some((c) => c.phase === "start") && !t0.terminal && Date.now() < until) await sleep(200);
    await sleep(2000);
    t0b = await start(key, "Without using any tools: what is 2 plus 2? Reply with the number only.");
  }
  await wait(t0);
  result.turns.push({ ...summarize("T0", t0), endedAtTokens: lastInput() });
  if (t0b) {
    await wait(t0b);
    // Where the answer to T0b shows up (its own run, or T0's run when it was steered in), and when.
    const answers = [t0, t0b].flatMap((r) => (r.texts ?? []).map((text, i) => ({ text, at: r.textAt?.[i] }))).filter((a) => /^\s*4\b/u.test(a.text) && a.at >= t0b.sentAt);
    result.turns.push({ ...summarize("T0b", t0b), sentWhileT0Compacting: !t0.endAt || t0b.sentAt < t0.endAt, answerSec: answers.length ? secs(t0b.sentAt, Math.min(...answers.map((a) => a.at))) : null });
  }
  // The workspace context changes (on V: a new skill, or the macOS node list in another order).
  fs.appendFileSync(soulPath, `- Principle extra ${salt}: prefer plain words.\n`);
  await sleep(2000);
  // T1 is the message Tianyi waits on.
  const t1 = await send(key, "Without using any tools: name three primary colors. Reply in one line.");
  result.turns.push(summarize("T1", t1));
  const t2 = await send(key, "Without using any tools: what was the code word I asked you to remember at the start? Reply with the word only.");
  result.turns.push(summarize("T2", t2));
} finally {
  await stopGateway();
  proxy.close();
}
const f = threadRollout();
const ev = rolloutEvents(f);
result.rollout = { file: path.basename(f), compactions: ev.filter((e) => e.k === "compacted").length, turns: ev.filter((e) => e.k === "start").length };
result.compactionRequests = requests.filter((q) => q.tools === 0).map((q) => ({ input: q.input, cached: q.cached, tookSec: secs(q.at, q.endAt) }));
result.postTurnLog = lines.filter((l) => /post-turn|Post-turn|compaction/iu.test(l)).map((l) => redact(l).slice(0, 200)).slice(-12);
console.log(JSON.stringify(result, null, 1));

for (const t of result.turns) {
  // Baseline only: after a pre-turn compaction V's bytes sometimes send one more request after the answer
  // and DeepSeek rejects it (400); the run then fails over to openai, which has no profile here. The answer
  // was already shown, so it is recorded, not treated as a broken baseline.
  if (ARM === "v" && t.turn === "T1" && t.terminal === "error" && t.firstTextSec !== null) { console.log(JSON.stringify({ baselineErrorAfterAnswer: t.error })); continue; }
  assert.equal(t.terminal, "final", `${t.turn}: ${t.terminal} ${t.error ?? ""}`);
}
const turn = (name) => result.turns.find((t) => t.turn === name);
assert(turn("T0").texts.some((t) => /391/u.test(t)), "T0 answered");
assert(turn("T0").endedAtTokens >= 855_000 || ARM !== "v", "T0 left the thread near the line");
if (ARM === "v") {
  assert.equal(turn("T0").compactedAfterText, 0, "V: no compaction after T0's answer");
  assert.equal(turn("T1").compactedBeforeText, 1, "V: T1 compacts before its first text (the wait Tianyi sees)");
} else {
  assert.equal(turn("T0").compactedAfterText, 1, "post-turn: T0 compacts after its answer");
  assert.equal(turn("T1").compactedBeforeText, 0, "post-turn: T1 starts without compacting");
  assert.equal(turn("T0b").sentWhileT0Compacting, true, "T0b went in during T0's compaction");
  // V queues by steering: a message sent while T0 is still running is answered inside T0's run.
  assert([...turn("T0").texts, ...turn("T0b").texts].some((t) => /^\s*4\b/u.test(t)), "the follow-up sent during the compaction is answered");
}
// What survives the compaction is up to the summary (the same request in every arm); recorded, not asserted.
console.log(JSON.stringify({ codeWordKept: /HERON/u.test(String(turn("T2").text ?? "")) }));
console.log(JSON.stringify({ ok: true, arm: ARM }));
process.exit(0);
