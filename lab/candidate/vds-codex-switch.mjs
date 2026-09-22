// Candidate probe: /vds (Codex harness + DeepSeek V4.1 Flash) and model switching.
// Runs an isolated Gateway on the candidate config copy; never touches shared VLab.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

// Plan C: the DeepSeek provider model itself, run on the Codex runtime (codex plugin patched to accept it).
const VDS_REF = "deepseek/deepseek-flash";
const VCODEX_REF = "openai/gpt-5.6-sol"; // production: makaron overrides it to the Codex runtime
const DS_FLASH_REF = "deepseek/deepseek-v4-flash";
let CODEX_HOME = process.env.VDS_CODEX_HOME ?? "/srv/vlab-production-mirror/labs/vds-codex-home";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");

function readSecretsEnv() {
  const env = {};
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  return env;
}

// ---- candidate config ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");

config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));

// Shared VLab loads @openclaw/codex through plugins.load.paths, so it is not registry-owned and
// never registers the "codex" harness (see Gateway warnings "registry-owned codex harness").
// Production installs it natively; do the same here from the identical package.
const codexLoadPath = (config.plugins.load?.paths ?? []).find((p) => /\/@openclaw\/codex$/u.test(p));
// After the 2026-09-22 merge shared VLab installs codex natively (and patched); the candidate inherits it.
const merged = !codexLoadPath;
if (!merged) config.plugins.load.paths = config.plugins.load.paths.filter((p) => p !== codexLoadPath);

const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high" } };
for (const models of [config.agents.defaults.models, config.agents.entries?.makaron?.models].filter(Boolean)) models[VDS_REF] = vdsEntry;
// Mirror production V exactly: defaults keep /vcodex on vlab-worker, the makaron entry overrides it to Codex.
config.agents.entries.makaron.models[VCODEX_REF] = { alias: "vcodex", params: { thinking: "medium" }, agentRuntime: { id: "codex" } };
// The Codex plugin ignores env CODEX_HOME unless homeScope is "user" (default: <agentDir>/codex-home).
const codexPlugin = config.plugins.entries.codex;
if (!merged) codexPlugin.config = {
  ...(codexPlugin.config ?? {}),
  appServer: { ...(codexPlugin.config?.appServer ?? {}), homeScope: "user" },
  // Default model discovery timeout is 2.5s; app-server cold start exceeds it and OpenClaw then
  // validates against the bundled fallback list, which has no custom (DeepSeek) catalog entries.
  discovery: { ...(codexPlugin.config?.discovery ?? {}), timeoutMs: 30_000 },
};
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const ref of [VDS_REF, VCODEX_REF, DS_FLASH_REF]) if (!allow.includes(ref)) allow.push(ref);

const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = fs
  .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

if (merged) {
  // Same layout as shared VLab after the merge: agent-scoped Codex home, DeepSeek provider, no Codex login.
  CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(CODEX_HOME, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}
console.log(JSON.stringify({ merged, codexHome: CODEX_HOME }));

// ---- scratch repo the agent edits ----
const repo = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "vds-repo");
fs.rmSync(repo, { recursive: true, force: true });
fs.mkdirSync(repo, { recursive: true });
fs.writeFileSync(path.join(repo, "calc.py"), "def average(xs):\n    return sum(xs) / len(xs)\n");
fs.writeFileSync(path.join(repo, "test_calc.py"), "from calc import *\nassert average([1, 2, 3]) == 2\nprint('ALL_PASS')\n");
spawnSync("git", ["init", "-q"], { cwd: repo });

// ---- gateway ----
const secrets = readSecretsEnv();
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
// Only the DeepSeek key: shared secrets.env also sets OPENCLAW_DB91_INTEGRITY_STATE_ROOT to the
// shared state dir, which would make this Gateway preflight the shared agent databases.
const tmpDir = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
const cacheDir = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, CODEX_HOME, OPENCLAW_GATEWAY_PORT: String(port),
  // keep temp files, logs and npm cache out of the shared instance directories
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};
assert(env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT === undefined || env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT.startsWith(stateDir), "integrity root must stay inside candidate state");
const install = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
console.log(JSON.stringify({ codexInstall: install.status, out: redact((install.stdout || "") + (install.stderr || "")).split("\n").filter(Boolean).slice(-8) }));
// ---- plan C: let the Codex harness accept the deepseek provider ----
const npmProjects = path.join(stateDir, "npm", "projects");
const codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
assert(codexProject, "installed codex plugin not found");
const codexDist = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex", "dist");
const harnessFile = fs.readdirSync(codexDist).map((f) => path.join(codexDist, f)).find((f) => /\/harness-[^/]+\.js$/u.test(f) && fs.readFileSync(f, "utf8").includes("DEFAULT_CODEX_HARNESS_PROVIDER_IDS = "));
assert(harnessFile, "codex harness module not found");
let harnessSrc = fs.readFileSync(harnessFile, "utf8");
const PATCHES = [
  ['new Set(["codex", "openai"]);', 'new Set(["codex", "openai", "deepseek"]);'],
  ['} else if (ctx.modelProvider && provider !== "codex" && !nativeAccountOwnsUnobservedModel) return {',
   '} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {'],
  // OpenClaw's deepseek provider carries its own baseUrl/api (openai-completions). Codex never replays
  // that transport: it reaches DeepSeek through [model_providers.deepseek] in its own config.toml.
  ['if (ctx.modelProvider?.requestTransportOverrides === "present") return {',
   'if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {'],
];
if (process.env.VDS_DIAG === "1") PATCHES.push([
  'const provider = ctx.provider.trim().toLowerCase();',
  'const provider = ctx.provider.trim().toLowerCase(); if (provider === "deepseek") console.error("[vds-supports] " + JSON.stringify({ requestedRuntime: ctx.requestedRuntime, rto: ctx.modelProvider?.requestTransportOverrides, runtimePolicy: ctx.modelProvider?.runtimePolicy, auth: ctx.modelProvider?.preparedAuth && { source: ctx.modelProvider.preparedAuth.source, mode: ctx.modelProvider.preparedAuth.mode, requirement: ctx.modelProvider.preparedAuth.requirement }, api: ctx.modelProvider?.api, hasBaseUrl: Boolean(ctx.modelProvider?.baseUrl), hasRequest: Boolean(ctx.modelProvider?.request) }));',
]);
for (const [from, to] of PATCHES) {
  if (harnessSrc.includes(to)) continue; // already patched (merged install)
  assert.equal(harnessSrc.split(from).length, 2, `patch anchor must match exactly once: ${from.slice(0, 60)}`);
  harnessSrc = harnessSrc.replace(from, to);
}
fs.writeFileSync(harnessFile, harnessSrc);
// Codex code mode exposes a custom "exec" tool; DeepSeek only accepts the apply_patch custom tool,
// so DeepSeek threads run with code mode off (plain function tools such as exec_command).
const runAttemptFile = fs.readdirSync(codexDist).map((f) => path.join(codexDist, f)).find((f) => /\/run-attempt-[^/]+\.js$/u.test(f));
assert(runAttemptFile, "codex run-attempt module not found");
let runAttemptSrc = fs.readFileSync(runAttemptFile, "utf8");
const CODE_MODE_FROM = "nativeCodeModeEnabled: params.nativeToolSurfaceEnabled,";
const CODE_MODE_TO = 'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",';
if (!runAttemptSrc.includes(CODE_MODE_TO)) {
  assert.equal(runAttemptSrc.split(CODE_MODE_FROM).length, 2, "code mode anchor must match exactly once");
  runAttemptSrc = runAttemptSrc.replace(CODE_MODE_FROM, CODE_MODE_TO);
}
fs.writeFileSync(runAttemptFile, runAttemptSrc);
// Deferred OpenClaw dynamic tools are reached through Codex tool search, which needs code mode; with code
// mode off DeepSeek can see web_search/web_fetch/message but cannot call them. Reuse the plugin's own
// per-model "tool search unsupported" switch (today only gpt-5.4-nano) so they load directly.
const lifecycleFile = fs.readdirSync(codexDist).map((f) => path.join(codexDist, f)).find((f) => /\/thread-lifecycle-[^/]+\.js$/u.test(f));
assert(lifecycleFile, "codex thread-lifecycle module not found");
let lifecycleSrc = fs.readFileSync(lifecycleFile, "utf8");
const TS_FROM = 'return normalizeCodexModelId(modelId) === "gpt-5.4-nano";';
const TS_TO = 'const normalizedId = normalizeCodexModelId(modelId); return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");';
if (process.env.VDS_NO_PATCH5 !== "1" && !lifecycleSrc.includes(TS_TO)) {
  assert.equal(lifecycleSrc.split(TS_FROM).length, 2, "tool search anchor must match exactly once");
  lifecycleSrc = lifecycleSrc.replace(TS_FROM, TS_TO);
  fs.writeFileSync(lifecycleFile, lifecycleSrc);
}
console.log(JSON.stringify({ codexPatched: [path.basename(harnessFile), path.basename(runAttemptFile), path.basename(lifecycleFile)] }));

const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (const s of [gateway.stdout, gateway.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (chunk) => { lines.push(...chunk.split(/\r?\n/u).filter(Boolean)); if (lines.length > 4000) lines.splice(0, lines.length - 4000); });
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

function turn(sessionKey, model, message) {
  const mark = lines.length;
  const started = Date.now();
  const r = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", model, "--message", message, "--json", "--timeout", "420"], { env, encoding: "utf8", timeout: 480_000, maxBuffer: 64 * 1024 * 1024 });
  let reply = "";
  let meta;
  try {
    const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    const payloads = out.result?.payloads ?? out.payloads ?? [];
    reply = payloads.map((p) => p.text).filter(Boolean).join("\n") || out.reply || out.text || "";
    meta = out.result?.meta ?? out.meta;
  } catch { reply = r.stdout.slice(-800); }
  const route = lines.slice(mark).filter((l) => /agent\/cli-backend|codex|provider=|model=|harness|runtime|error|failed|invalid_request/iu.test(l)).slice(-14);
  const rec = {
    sessionKey, requested: model, message: message.slice(0, 60), exit: r.status, secs: Math.round((Date.now() - started) / 1000),
    reply: redact(reply).slice(0, 3000),
    model: meta?.agentMeta ? { provider: meta.agentMeta.provider, model: meta.agentMeta.model, harness: meta.agentMeta.harnessId ?? meta.agentMeta.runtime } : undefined,
    stderr: redact(r.stderr ?? "").split("\n").filter((l) => l && !/Skill descriptions/u.test(l)).slice(-14),
    route: route.map((l) => redact(l).slice(0, 260)),
  };
  console.log(JSON.stringify(rec));
  return rec;
}

try {
  await waitPort();
  await sleep(3000);
  if (process.env.VDS_DIAG === "1") {
    const insp = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "inspect", "codex", "--runtime", "--json"], { env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    console.log("INSPECT-HARNESS:", /"agentHarnessIds": \[\s*"codex"/u.test(insp.stdout || ""));
    const ml = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "models", "list", "--json"], { env, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    try { const mj = JSON.parse(ml.stdout.slice(ml.stdout.indexOf("{"))); console.log("MODELS:", JSON.stringify(mj.models.filter((m) => /codex|gpt-5\.6|deepseek/u.test(m.key)).map((m) => [m.key, m.tags, m.available, m.contextWindow]))); } catch { console.log("MODELS-RAW:", redact(ml.stdout + ml.stderr).slice(0, 3000)); }
    const ls = spawnSync("bash", ["-c", `ls -la ${CODEX_HOME}; head -c 600 ${CODEX_HOME}/models_cache.json 2>/dev/null`], { encoding: "utf8" });
    console.log("CODEX-HOME:", ls.stdout.slice(0, 1500));
    const mark = lines.length;
    const r = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "agent", "--agent", "makaron", "--session-key", "vlab-dev-vds-diag", "--model", VDS_REF, "--message", "Reply with exactly: VDS_OK", "--json", "--timeout", "300"], { env: { ...env, OPENCLAW_DEBUG: "1" }, encoding: "utf8", timeout: 360_000, maxBuffer: 64 * 1024 * 1024 });
    console.log("VDS-TURN:", r.status, redact((r.stdout || "").slice(-600)), redact((r.stderr || "").split("\n").filter((l) => /Reason|at |Error/u.test(l)).slice(0, 25).join("\n")));
    console.log("GW-LOG:\n" + redact(lines.slice(mark).filter((l) => /vds-supports|codex|catalog|discover|harness|fallback/iu.test(l)).slice(-40).join("\n")).slice(0, 8000));
    throw new Error("diag only");
  }
  const t = Date.now().toString(36);
  const A = `vlab-dev-vds-a-${t}`;
  const B = `vlab-dev-vds-b-${t}`;
  const C = `vlab-dev-vds-c-${t}`;
  const task = (s) => `Work only inside the git repo at ${repo}. ${s} Reply in one or two sentences.`;

  // CLI turns do not parse inline /alias directives (those are channel-ingress only), so each
  // turn names its model with --model: same effect on harness routing as a user switch.
  const VDS = VDS_REF, DSF = DS_FLASH_REF, GPT = VCODEX_REF;
  if (process.env.VDS_TOOLS === "1") {
    const startedAt = Date.now();
    fs.writeFileSync(path.join(repo, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const D = `vlab-dev-vds-tools-${t}`, G = `vlab-dev-vcodex-tools-${t}`;
    const listPrompt = "Do not call any tool. List every tool / function name you can call in this session, exactly as named, one per line, grouped as you see them. No commentary.";
    console.log("## Tool inventory");
    turn(D, VDS_REF, listPrompt);
    turn(G, VCODEX_REF, listPrompt);
    console.log("## /vds tool probes");
    const probes = [
      ["shell", "Run the shell command `uname -s && python3 --version` and report the exact output."],
      ["apply_patch", task("Create tools.txt with the two lines `alpha` and `beta`, then change `beta` to `gamma` using your file editing / patch tool (not shell redirection). Report which tool you used.")],
      ["web_search", "Use your web search tool (not curl) to find the latest released version of the Python programming language. Give the version and one source URL. If you have no web search tool, say NO_WEB_SEARCH_TOOL."],
      ["web_fetch", "Use your web_fetch tool (not curl) to fetch https://example.com and report the page <title> and the tool name. If you have no web fetch tool, say NO_WEB_FETCH_TOOL."],
      ["plan", "Use your planning / todo / update_plan tool to record a 3-step plan for writing a CLI calculator, then report the tool name. If you have no such tool, say NO_PLAN_TOOL."],
      ["view_image", `Use your image viewing tool to look at ${path.join(repo, "pixel.png")} and describe its colour. If you cannot view images, say NO_IMAGE_TOOL.`],
      ["subagent", "Spawn a sub-agent (use your agent/sub-agent/session spawning tool) whose only job is to reply with the word SUBAGENT_OK, wait for it, and report its answer and the tool name you used. If you have no such tool, say NO_SUBAGENT_TOOL."],
      ["memory", "Use the memory search tool to search for the word 'makaron' and report how many results came back and the tool name. If you have no such tool, say NO_MEMORY_TOOL."],
    ];
    for (const [name, prompt] of probes) { console.log(`### probe ${name}`); turn(D, VDS_REF, prompt); }
    // Ground truth: what Codex actually called, per rollout, for this run only.
    const rolls = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(startedAt / 1000)} | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    for (const f of rolls) {
      let model = "", provider = "";
      const calls = [], errors = [];
      for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        const p = e.payload ?? {};
        if (e.type === "session_meta") provider = p.model_provider;
        if (e.type === "turn_context") model = p.model;
        if (e.type === "response_item" && /call$/u.test(p.type ?? "") && !/_output$/u.test(p.type)) calls.push(p.name ?? p.type);
        if (e.type === "response_item" && /web_search/u.test(p.type ?? "")) calls.push(p.type);
        if (e.type === "event_msg" && /error|warning/iu.test(p.type ?? "")) errors.push(String(p.message ?? JSON.stringify(p)).slice(0, 200));
      }
      console.log(JSON.stringify({ rollout: path.basename(f).slice(9, 28), provider, model, calls, errors: errors.slice(0, 3) }));
    }
    throw new Error("tools probe done");
  }
  console.log("## Session A: vds -> ds-flash -> vds -> vcodex (makaron: Codex runtime, as production)");
  turn(A, VDS, task("Create notes.txt containing exactly the secret word PINEAPPLE-42, and add a function triple(x) returning 3*x to calc.py."));
  turn(A, DSF, task("Without reading notes.txt, tell me the secret word from earlier and the function added. Then add quadruple(x) returning 4*x below it."));
  turn(A, VDS, task("Without reading files first, name the two functions added so far. Then append asserts triple(2)==6 and quadruple(2)==8 to test_calc.py and run python3 test_calc.py."));
  turn(A, GPT, task("Say which functions exist in calc.py and run python3 test_calc.py."));
  turn(A, GPT, task("Try again: run python3 test_calc.py and report the output."));

  console.log("## Session B: vcodex -> vds");
  turn(B, GPT, task("Create b.txt containing exactly the word MANGO-7."));
  turn(B, VDS, task("Without reading b.txt, tell me the word written to it in the previous turn."));

  console.log("## Session C: vds -> vcodex context carry-over (no file reads)");
  turn(C, VDS, task("Create c.txt containing exactly the word KIWI-3. Also remember this phrase for later: BLUE-HERON."));
  turn(C, GPT, task("Do not read or list any files. From our conversation only: what word was written to c.txt, and what phrase did I ask you to remember?"));
  turn(C, VDS, task("Do not read any files. Which model or assistant answered the previous turn, and what phrase was mentioned?"));

  const final = spawnSync("python3", ["test_calc.py"], { cwd: repo, encoding: "utf8" });
  console.log(JSON.stringify({ finalTest: (final.stdout + final.stderr).trim().slice(-300), files: fs.readdirSync(repo) }));
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).join("\n")));
  process.exitCode = 1;
} finally {
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(15_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
