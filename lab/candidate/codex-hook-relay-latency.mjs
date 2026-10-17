// Candidate: where the ~9 s of "Command blocked by PreToolUse hook: Native hook
// relay timed out" goes, and the follow-up admission fix.
//
// Production V 2026-10-16/17: Codex tool calls (/vcodex, /vds, native children)
// were blocked after ~9.4 s wall. The relay CLI (`node openclaw.mjs hooks relay`,
// spawned niced by Codex for every hooked tool call) gives up after its own
// --timeout 9000 (Codex hook timeout 10 s minus a 1 s margin) and answers "deny".
//
// FA_MODE=followup  One /vds turn: the parent spawns a native child, waits for it,
//   then sends the same child a follow-up task. On V the follow-up turn's hooked
//   tools all time out: the child's relay claim was released when its first turn
//   completed and nothing claims it again, so core's awaitForegroundAdmission waits
//   until the CLI deadline.
//   FA_EXPECT=baseline  V's bytes: the follow-up exec must be refused after ~9 s
//   FA_EXPECT=fixed     lab/release-files/codex-native-followup-admission applied
//
// FA_MODE=segments  The parent runs one long `sleep`; while its relay is in the
//   foreground the harness fires synthetic pre_tool_use invocations through the
//   real CLI (same argv Codex used) and times every segment: CLI cold start, stdin,
//   SQLite locator read, HTTP to the Gateway bridge, Gateway admission, Gateway
//   before_tool_call policy. Rounds vary concurrency, Gateway main-thread blocking
//   (busy-wait injected by a test-only patch) and host CPU contention.
//
// Test-only patches (never shipped): trace lines from the CLI, the client and the
// Gateway bridge (NHR_TRACE_FILE), a load injector in the Gateway, and V's /vds
// patch 5 lifted so DeepSeek gets native multi_agent (as in codex-native-subagent).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const mode = process.env.FA_MODE ?? "followup";
const expect = process.env.FA_EXPECT ?? "fixed";
assert(["followup", "segments"].includes(mode));
assert(["fixed", "baseline"].includes(expect));
const MODEL = "deepseek/vds-deepseek-flash"; // V's /vds: Codex harness + DeepSeek Flash
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), mode, expect, notes: [] };
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]");
  return out;
};
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const pct = (xs, p) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};
const stats = (xs) => ({ n: xs.filter(Number.isFinite).length, p50: pct(xs, 50), p90: pct(xs, 90), max: pct(xs, 100) });

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(token);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const dsModels = config.models.providers.deepseek.models;
const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  if (!dsModels.some((m) => m.id === id)) dsModels.push({ id, name, ...flashShape });
}
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[MODEL] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [MODEL]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
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

// ---------------------------------------------------------------- Codex plugin = V's bytes
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
const codexRoot = fs.readdirSync(path.join(stateDir, "npm", "projects"))
  .filter((d) => d.startsWith("openclaw-codex-"))
  .map((d) => path.join(stateDir, "npm", "projects", d, "node_modules", "@openclaw", "codex"))
  .find((d) => fs.existsSync(path.join(d, "dist")));
assert(codexRoot, "candidate Codex plugin install not found");
const codexDist = path.join(codexRoot, "dist");
const V_SHA = {
  codex: {
    "thread-lifecycle-DAcEJ_Om.js": "4cceab62ea349d26",
    "run-attempt-D1hJO4fX.js": "8ab5165003ca2185",
    "native-subagent-monitor-CnH147jH.js": "33bde1f3a95a60c2",
  },
  core: {
    "native-hook-relay-BRGvN3HA.js": "64adca1aeb685408",
    "native-hook-relay-cli-DTqrikhm.js": "be7acfb87f02edfc",
    "native-hook-relay-client-GFGIwlRq.js": "aa685524265913e9",
  },
};
summary.startingBytes = {
  codex: Object.fromEntries(Object.entries(V_SHA.codex).map(([f, want]) => [f, sha256(fs.readFileSync(path.join(codexDist, f))).startsWith(want) ? "V" : "differs"])),
  core: Object.fromEntries(Object.entries(V_SHA.core).map(([f, want]) => [f, sha256(fs.readFileSync(path.join(dist, f))).startsWith(want) ? "V" : "differs"])),
};
for (const [k, v] of Object.entries({ ...summary.startingBytes.codex, ...summary.startingBytes.core })) assert.equal(v, "V", `${k} does not start from V's bytes`);

if (mode === "followup" && expect === "fixed") {
  const patch = spawnSync(process.execPath, ["lab/release-files/codex-native-followup-admission/patch-codex-followup-admission.mjs", "--codex", codexRoot], { encoding: "utf8" });
  assert.equal(patch.status, 0, `fix patch failed: ${patch.stderr}`);
  summary.fixPatch = JSON.parse(patch.stdout).report.map((r) => r.state);
}
// FA_HOOK_TIMEOUT_SEC: the optional hook-budget patch (lab/release-files/codex-hook-relay-timeout).
if (process.env.FA_HOOK_TIMEOUT_SEC) {
  const patch = spawnSync(process.execPath, ["lab/release-files/codex-hook-relay-timeout/patch-codex-hook-timeout.mjs", "--codex", codexRoot, "--seconds", process.env.FA_HOOK_TIMEOUT_SEC], { encoding: "utf8" });
  assert.equal(patch.status, 0, `hook timeout patch failed: ${patch.stderr}`);
  summary.hookTimeoutPatch = JSON.parse(patch.stdout).state;
}
// Test-only diagnostics in the monitor: which follow-up evidence arrives and what readmit sees.
if (mode === "followup") {
  const monitor = path.join(codexDist, "native-subagent-monitor-CnH147jH.js");
  let src = fs.readFileSync(monitor, "utf8");
  const anchor = "\t\t\t\tconst childThreadIds = new Set(readStringArray(item?.receiverThreadIds));\n";
  assert.equal(src.split(anchor).length, 2, "diag anchor");
  src = src.replace(anchor, `${anchor}\t\t\t\tif (/collab|subAgent/u.test(readStringField(item, "type") ?? "")) console.error("[fa-diag] item " + JSON.stringify({ method: notification.method, type: readStringField(item, "type"), tool: readStringField(item, "tool"), kind: readStringField(item, "kind"), status: readStringField(item, "status"), receivers: [...childThreadIds], turnId, owner: Boolean(owner), ownerClaim: Boolean(owner?.claimDirectChild), owners: [...state.owners.values()].map((o) => o.turnId ?? null) }));\n`);
  const readmit = "\t\tconst revision = this.threadStatusRevisions.get(childThreadId);\n\t\tif ((existing ? existing.parentThreadId";
  const release = "\t\t\treleaseFollowupClaim?.();\n";
  if (src.includes(release)) src = src.replace(release, `${release}\t\t\tconsole.error("[fa-diag] follow-up claim released " + threadId);\n`);
  if (src.includes(readmit)) src = src.replace(readmit, "\t\tconst revision = this.threadStatusRevisions.get(childThreadId);\n\t\tconsole.error(\"[fa-diag] readmit \" + JSON.stringify({ childThreadId, existing: existing ? { terminal: existing.terminal, claimed: Boolean(existing.releaseDirectChild), settled: existing.settledWithoutCompletion, pending: Boolean(existing.pendingCompletion), parentOk: existing.parentThreadId === state.parentThreadId } : null, revision: revision ? { terminal: revision.terminal, parentOk: revision.parentThreadId === state.parentThreadId } : null }));\n\t\tif ((existing ? existing.parentThreadId");
  fs.writeFileSync(monitor, src);
}
function patchFile(file, pairs) {
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    assert.equal(src.split(from).length - 1, 1, `test-only anchor not unique in ${path.basename(file)}: ${JSON.stringify(from.slice(0, 80))}`);
    src = src.replace(from, to);
  }
  fs.writeFileSync(file, src);
}
// Test-only 1: native multi_agent for DeepSeek (V's /vds patch 5 turns it off; /vcodex has it).
patchFile(path.join(codexDist, "thread-lifecycle-DAcEJ_Om.js"), [[
  'return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");',
  'return normalizedId === "gpt-5.4-nano";']]);
// Test-only 2: trace every relay segment.
const traceFile = path.join(stateDir, "state", "nhr-trace.jsonl");
const W = "const __nhrW = (o) => { try { const f = process.env.NHR_TRACE_FILE; if (f) process.getBuiltinModule(\"node:fs\").appendFileSync(f, JSON.stringify(o) + \"\\n\"); } catch {} };\n";
patchFile(path.join(dist, "native-hook-relay-cli-DTqrikhm.js"), [
  ["async function runNativeHookRelayCli(opts, deps = {}) {\n",
    `${W}async function runNativeHookRelayCli(opts, deps = {}) {\n\tconst __t = globalThis.__nhrTrace = { kind: "cli", pid: process.pid, bootMs: Math.round(performance.now()), startAt: Date.now(), argv: process.argv };\n\tif (!process.env.NHR_TRACE_FILE && opts.stateDb) process.env.NHR_TRACE_FILE = String(opts.stateDb).replace(/[^/]+$/u, "nhr-trace.jsonl");\n`],
  ["\t\t\trawPayload = rawInput.trim() ? JSON.parse(rawInput) : null;\n",
    "\t\t\trawPayload = rawInput.trim() ? JSON.parse(rawInput) : null;\n\t\t\t__t.stdinMs = Date.now() - __t.startAt; __t.toolUseId = rawPayload?.tool_use_id; __t.agentId = rawPayload?.agent_id; __t.tool = rawPayload?.tool_name; __t.event = opts.event;\n"],
  ["\t} finally {\n\t\tdeadline.dispose();\n",
    "\t} finally {\n\t\tdeadline.dispose();\n\t\t__t.endAt = Date.now(); __t.deadlineHit = deadline.signal.aborted; __nhrW(__t);\n"],
]);
patchFile(path.join(dist, "native-hook-relay-client-GFGIwlRq.js"), [
  ["\t\tconst record = readNativeHookRelayClientBridgeRecord({\n",
    "\t\tconst __r0 = Date.now(); if (globalThis.__nhrTrace) globalThis.__nhrTrace.lookups = (globalThis.__nhrTrace.lookups ?? 0) + 1;\n\t\tconst record = readNativeHookRelayClientBridgeRecord({\n"],
  ["\t\tif (!record) throw new Error(\"native hook relay bridge not found\");\n",
    "\t\tif (globalThis.__nhrTrace) globalThis.__nhrTrace.locatorMs = (globalThis.__nhrTrace.locatorMs ?? 0) + Date.now() - __r0;\n\t\tif (!record) throw new Error(\"native hook relay bridge not found\");\n"],
  ["\t\tconst resolveOnce = (value) => {\n",
    "\t\tconst __p0 = Date.now(); if (globalThis.__nhrTrace) globalThis.__nhrTrace.postAt = __p0;\n\t\tconst resolveOnce = (value) => {\n\t\t\tif (globalThis.__nhrTrace && !settled) globalThis.__nhrTrace.postMs = Date.now() - __p0;\n"],
  ["\t\tconst rejectOnce = (error) => {\n",
    "\t\tconst rejectOnce = (error) => {\n\t\t\tif (globalThis.__nhrTrace && !settled) { globalThis.__nhrTrace.postMs = Date.now() - __p0; globalThis.__nhrTrace.postError = String(error?.message ?? error).slice(0, 160); }\n"],
]);
// Gateway side + load injector (control file: "<blockMs> <everyMs>", absent = no load).
const loadFile = path.join(stateDir, "state", "nhr-load");
patchFile(path.join(dist, "native-hook-relay-BRGvN3HA.js"), [
  ["//#region src/agents/harness/native-hook-relay-bridge.ts\n",
    W
    + "if (process.env.NHR_TRACE_FILE && process.argv.includes(\"gateway\") && !globalThis.__nhrLoad) {\n"
    + "\tconst nfs = process.getBuiltinModule(\"node:fs\");\n"
    + "\tconst h = process.getBuiltinModule(\"node:perf_hooks\").monitorEventLoopDelay({ resolution: 20 }); h.enable();\n"
    + "\tlet next = 0; let saturating = false;\n"
    + "\tconst readSpec = () => { try { return nfs.readFileSync(process.env.NHR_LOAD_FILE, \"utf8\").trim().split(/\\s+/); } catch { return []; } };\n"
    + "\tconst burn = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };\n"
    // "sat <ms>": one busy chunk per event-loop iteration (self-rescheduling setImmediate), so the
    // loop never idles and every I/O callback waits up to one chunk: ELU=1 with max delay ≈ <ms>.
    + "\tconst saturate = () => { const spec = readSpec(); if (spec[0] !== \"sat\") { saturating = false; return; } burn(Number(spec[1])); setImmediate(saturate); };\n"
    + "\tglobalThis.__nhrLoad = setInterval(() => {\n"
    + "\t\tconst spec = readSpec();\n"
    + "\t\tif (spec[0] === \"sat\") { if (!saturating) { saturating = true; setImmediate(saturate); } return; }\n"
    + "\t\tconst [blockMs, everyMs] = spec.map(Number); const now = Date.now();\n"
    + "\t\tif (!(blockMs > 0) || now < next) return; next = now + everyMs;\n"
    + "\t\tburn(blockMs);\n"
    + "\t}, 50);\n"
    + "\tsetInterval(() => { __nhrW({ kind: \"gw-loop\", at: Date.now(), p99: Math.round(h.percentile(99) / 1e6), max: Math.round(h.max / 1e6) }); h.reset(); }, 5000).unref();\n"
    + "}\n"
    + "//#region src/agents/harness/native-hook-relay-bridge.ts\n"],
  ["async function handleNativeHookRelayBridgeRequest(req, res, auth) {\n\ttry {\n",
    "async function handleNativeHookRelayBridgeRequest(req, res, auth) {\n\tconst __g = { kind: \"gw-bridge\", reqAt: Date.now() };\n\tconst __end = res.end.bind(res); res.end = (...a) => { __g.endAt = Date.now(); __g.status = res.statusCode; __nhrW(__g); return __end(...a); };\n\ttry {\n"],
  ["\t\tconst body = await readNativeHookRelayBridgeBody(req);\n",
    "\t\tconst body = await readNativeHookRelayBridgeBody(req);\n\t\t__g.bodyMs = Date.now() - __g.reqAt; try { const b = JSON.parse(body); __g.toolUseId = b.rawPayload?.tool_use_id; __g.event = b.event; } catch {}\n"],
  ["\tconst effectiveRegistration = await resolveNativeHookRelayInvocationBinding(registration, event, params.rawPayload);\n",
    "\tconst __g = { kind: \"gw-invoke\", event, relayId, toolUseId: params.rawPayload?.tool_use_id, agentId: params.rawPayload?.agent_id, startAt: Date.now() };\n"
    + "\tlet effectiveRegistration;\n"
    + "\ttry { effectiveRegistration = await resolveNativeHookRelayInvocationBinding(registration, event, params.rawPayload); } catch (e) { __g.admissionMs = Date.now() - __g.startAt; __g.error = String(e?.message ?? e).slice(0, 160); __nhrW(__g); throw e; }\n"
    + "\t__g.admissionMs = Date.now() - __g.startAt;\n"],
  ["\t\tadapter: getNativeHookRelayProviderAdapter(provider)\n\t});\n\tif (event === \"pre_tool_use\" || event === \"permission_request\") effectiveRegistration.assertActive?.();\n",
    "\t\tadapter: getNativeHookRelayProviderAdapter(provider)\n\t});\n\t__g.policyMs = Date.now() - startedAt; __g.blocked = /\"deny\"/u.test(response?.stdout ?? \"\"); __nhrW(__g);\n\tif (event === \"pre_tool_use\" || event === \"permission_request\") effectiveRegistration.assertActive?.();\n"],
]);
const readTrace = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

// Codex app-server home for /vds: agent-scoped, DeepSeek provider.
const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
{
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
  // FA_V2=1: Codex multi-agent V2 (agent paths, followup_task), what /vcodex used on V on 10/17.
  if (process.env.FA_V2 === "1") {
    const cur = fs.readFileSync(tomlPath, "utf8");
    if (!/multi_agent_v2\s*=\s*true/u.test(cur)) fs.writeFileSync(tomlPath, cur.includes("[features]") ? cur.replace("[features]", "[features]\nmulti_agent_v2 = true") : `${cur}\n[features]\nmulti_agent_v2 = true\n`, { mode: 0o600 });
  }
}
summary.multiAgentV2 = process.env.FA_V2 === "1";
const workspace = config.agents.entries.makaron.workspace ?? path.join(data, "workspace", "makaron");
fs.mkdirSync(workspace, { recursive: true });
const runTag = crypto.randomBytes(3).toString("hex");

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.nhr-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"), NHR_TRACE_FILE: traceFile, NHR_LOAD_FILE: loadFile };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey; secrets.add(deepseekKey);
fs.rmSync(loadFile, { force: true });
fs.rmSync(traceFile, { force: true });
const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(8_000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) {
      lastError = error;
      client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
function runTurn(sessionKey, prompt, timeoutSecs = 600) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", MODEL, "--message", prompt, "--json", "--timeout", String(timeoutSecs)], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    const kill = setTimeout(() => child.kill("SIGKILL"), (timeoutSecs + 90) * 1000);
    child.on("exit", (code) => {
      clearTimeout(kill);
      let meta;
      try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { /* not json */ }
      resolve({
        exit: code, secs: Math.round((Date.now() - started) / 1000), startedAt: started,
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 800),
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
// Codex's own transcript: every tool call, its output, and its thread.
function codexToolCalls(since) {
  const out = [];
  const files = spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(codexHome, "sessions"))} -name 'rollout-*.jsonl' -newermt @${Math.floor(since / 1000) - 1} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const f of files) {
    let threadId, parent;
    const calls = new Map();
    let turns = 0;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      if (o.type === "session_meta") { threadId ??= p.id; parent ??= p.source?.subagent?.thread_spawn?.parent_thread_id ?? null; }
      if (o.type === "event_msg" && p.type === "task_started") turns += 1;
      if ((p.type === "function_call" || p.type === "custom_tool_call") && p.call_id) calls.set(p.call_id, { at: o.timestamp, turn: turns, name: p.name, args: redact(String(p.arguments ?? p.input ?? "")).slice(0, 160) });
      else if ((p.type === "function_call_output" || p.type === "custom_tool_call_output") && calls.has(p.call_id)) {
        const c = calls.get(p.call_id);
        c.output = redact(typeof p.output === "string" ? p.output : JSON.stringify(p.output)).slice(0, 240);
        c.secs = Math.round((Date.parse(o.timestamp) - Date.parse(c.at)) / 100) / 10;
      }
    }
    out.push({ file: path.basename(f), threadId, parent: parent ?? null, turns, calls: [...calls.values()] });
  }
  return out;
}
const logMatches = (re) => lines.filter((l) => re.test(l.line)).map((l) => redact(l.line).slice(0, 300));
const relayRefused = (c) => /PreToolUse hook: Native hook relay/u.test(c.output ?? "");

// ---------------------------------------------------------------- scenarios
async function followupScenario(sessionKey) {
  // Plain fruit words: a "TOK…" value made the V2 child refuse to echo it as a credential.
  const files = [["A", "PEAR"], ["B", "PLUM"]].map(([n, word]) => ({ n, file: `fa-${n}-${runTag}.txt`, token: `${word}${crypto.randomInt(100000, 999999)}` }));
  for (const f of files) fs.writeFileSync(path.join(workspace, f.file), `${f.token}\n`);
  const prompt = [
    "这是一次自动化测试，请严格按步骤用 Codex 原生协作工具完成，不要自己代做子 agent 的事：",
    `1. 用 spawn_agent 创建一个子 agent，交给它的任务原文：「用 exec_command 运行 cat ${files[0].file}，然后只回复一行：A_OK <文件内容>」。`,
    "2. 用 wait_agent 等这个子 agent 完成。",
    `3. 子 agent 完成后，用 followup_task 给同一个子 agent 派新任务（没有 followup_task 就用 send_input），任务原文：「用 exec_command 运行 cat ${files[1].file}，然后只回复一行：B_OK <文件内容>。如果命令被拒绝，原样回复错误」。`,
    "4. 再用 wait_agent 等它完成。不要关闭这个子 agent 之前的结果。",
    "5. 最后只回复一行：DONE <A 的内容> <B 的内容>（拿不到就写 MISSING 和原因）。",
  ].join("\n");
  const turn = await runTurn(sessionKey, prompt);
  const calls = codexToolCalls(turn.startedAt);
  const children = calls.filter((c) => c.parent);
  const trace = readTrace();
  const childInvokes = trace.filter((t) => t.kind === "gw-invoke" && t.agentId && t.event === "pre_tool_use");
  const cli = trace.filter((t) => t.kind === "cli" && t.event === "pre_tool_use");
  const childCalls = children.flatMap((c) => c.calls.map((x) => ({ ...x, thread: c.threadId, turns: c.turns })));
  const followupCalls = childCalls.filter((x) => x.turn >= 2 || x.args.includes(files[1].file));
  summary.turn = { exit: turn.exit, secs: turn.secs, reply: turn.reply, stderr: turn.stderr };
  summary.result = {
    children: children.map((c) => ({ threadId: c.threadId, turns: c.turns, calls: c.calls.length })),
    parentCollabCalls: calls.filter((c) => !c.parent).flatMap((c) => c.calls).filter((x) => /agent|followup|send|wait/u.test(x.name)).map((x) => `${x.name} ${x.secs}s`),
    followupChildCalls: followupCalls.map((x) => ({ name: x.name, secs: x.secs, refused: relayRefused(x), output: x.output?.slice(0, 160) })),
    childGatewayInvokes: childInvokes.map((t) => ({ admissionMs: t.admissionMs, policyMs: t.policyMs, error: t.error })),
    cliDeadlineHits: cli.filter((t) => t.deadlineHit).length,
    cliWallMs: stats(cli.map((t) => t.endAt - t.startAt + t.bootMs)),
    replyHasA: turn.reply.includes(files[0].token),
    replyHasB: turn.reply.includes(files[1].token),
    admittedLog: logMatches(/follow-up admitted to the parent relay/u).length,
    releasedLog: logMatches(/follow-up claim released/u).length,
    diag: logMatches(/\[fa-diag\] (?:readmit|follow-up)|follow-up admitted|"tool":"(?:sendInput|followupTask|resumeAgent)"|"kind":"interacted"/u).slice(-12),
  };
  assert.equal(turn.exit, 0, `turn failed: ${turn.stderr}`);
  assert(children.length >= 1, "the parent did not spawn a Codex native child");
  assert(followupCalls.some((x) => /exec/u.test(x.name)), `the follow-up turn never ran exec: ${JSON.stringify(summary.result.parentCollabCalls)}`);
  const refused = followupCalls.filter(relayRefused);
  if (expect === "baseline") {
    assert(refused.length > 0, "baseline did not reproduce the follow-up refusal");
    assert(refused.every((x) => /timed out/u.test(x.output)), "baseline refusal is not the timeout");
    assert(!summary.result.replyHasB, "baseline should not have read file B");
  } else {
    assert.equal(refused.length, 0, "follow-up child tool calls were refused");
    assert(summary.result.replyHasA && summary.result.replyHasB, `reply misses a token: ${turn.reply}`);
    assert(summary.result.admittedLog >= 1, "no follow-up admission logged");
    // A turn-scoped claim (child's previous result still in delivery) must be released when that turn ends.
    if (summary.result.diag.some((l) => /"existing":\{"terminal":true/u.test(l))) assert(summary.result.releasedLog >= 1, "turn-scoped follow-up claim was not released after the child turn");
    assert.equal(summary.result.cliDeadlineHits, 0, "a relay CLI hit its deadline");
  }
}

function invokeRelay(argv, seq) {
  const payload = { hook_event_name: "PreToolUse", tool_name: "exec_command", tool_input: { cmd: `echo nhr-${runTag}-${seq}` }, tool_use_id: `nhr-${runTag}-${seq}`, cwd: workspace };
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("nice", ["-n", "10", ...argv], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stdin.end(JSON.stringify(payload));
    child.on("exit", (code) => resolve({ seq, toolUseId: payload.tool_use_id, code, wallMs: Date.now() - started, denied: /"deny"/u.test(stdout), reason: stdout.match(/permissionDecisionReason":"([^"]*)/u)?.[1] }));
  });
}
async function segmentsScenario(sessionKey) {
  const holdSecs = Number(process.env.FA_HOLD_SECS ?? 900);
  const turnPromise = runTurn(sessionKey, `这是一次自动化测试：用 exec_command 运行 sleep ${holdSecs}（不要设超时，也不要拆分），结束后只回复 SLEPT。`, holdSecs + 300);
  // The parent's own hook for the sleep gives us the exact relay argv Codex uses.
  let argv;
  for (let i = 0; i < 240 && !argv; i += 1) {
    await sleep(1_000);
    const t = readTrace().find((x) => x.kind === "cli" && x.event === "pre_tool_use" && !x.deadlineHit);
    if (t) argv = t.argv;
  }
  assert(argv, "the parent's relay CLI never ran");
  summary.relayArgv = argv.slice(2).map((a) => (a.length > 60 ? `${a.slice(0, 24)}…` : a));
  if (process.env.FA_HOOK_TIMEOUT_SEC) assert.equal(argv[argv.indexOf("--timeout") + 1], String(Number(process.env.FA_HOOK_TIMEOUT_SEC) * 1000 - 1000), "Codex did not get the longer hook budget");
  await sleep(3_000);
  const busy = [];
  const rounds = [
    { name: "idle-seq", n: 8, conc: 1 },
    { name: "idle-conc8", n: 24, conc: 8 },
    { name: "gwblock-1500/2000-seq", n: 8, conc: 1, load: "1500 2000" },
    { name: "gwblock-3000/4000-seq", n: 8, conc: 1, load: "3000 4000" },
    { name: "gwblock-3000/4000-conc8", n: 24, conc: 8, load: "3000 4000" },
    { name: "gwblock-9500/10000-seq", n: 3, conc: 1, load: "9500 10000" },
    { name: "cpu4-seq", n: 8, conc: 1, cpu: 4 },
    { name: "cpu4-conc8", n: 24, conc: 8, cpu: 4 },
    { name: "sat-1000-seq", n: 6, conc: 1, load: "sat 1000" },
    { name: "sat-3000-seq", n: 6, conc: 1, load: "sat 3000" },
    { name: "sat-3000-conc8", n: 16, conc: 8, load: "sat 3000" },
  ].filter((r) => !process.env.FA_ROUNDS || process.env.FA_ROUNDS.split(",").includes(r.name));
  let seq = 0;
  summary.rounds = [];
  for (const round of rounds) {
    if (round.load) fs.writeFileSync(loadFile, round.load); else fs.rmSync(loadFile, { force: true });
    for (let i = 0; i < (round.cpu ?? 0); i += 1) busy.push(spawn(process.execPath, ["-e", "for(;;){}"], { stdio: "ignore" }));
    await sleep(round.load ? 2_500 : 500);
    const roundStart = Date.now();
    const results = [];
    const queue = Array.from({ length: round.n }, () => (seq += 1));
    await Promise.all(Array.from({ length: round.conc }, async () => {
      while (queue.length) {
        const s = queue.shift();
        results.push(await invokeRelay(argv, s));
        if (round.conc === 1) await sleep(300);
      }
    }));
    fs.rmSync(loadFile, { force: true });
    while (busy.length) busy.pop().kill("SIGKILL");
    await sleep(1_000);
    const trace = readTrace();
    const by = (kind) => new Map(trace.filter((t) => t.kind === kind && t.toolUseId).map((t) => [t.toolUseId, t]));
    const cli = by("cli"), bridge = by("gw-bridge"), inv = by("gw-invoke");
    const rows = results.map((r) => {
      const c = cli.get(r.toolUseId) ?? {}, b = bridge.get(r.toolUseId) ?? {}, g = inv.get(r.toolUseId) ?? {};
      return {
        wall: r.wallMs, boot: c.bootMs, stdin: c.stdinMs, locator: c.locatorMs, lookups: c.lookups,
        toGateway: b.reqAt && c.postAt ? b.reqAt - c.postAt : null, // HTTP connect + accept, delayed by a busy main thread
        body: b.bodyMs, admission: g.admissionMs, policy: g.policyMs,
        bridgeTotal: b.reqAt && b.endAt ? b.endAt - b.reqAt : null,
        post: c.postMs, deadline: Boolean(c.deadlineHit), denied: r.denied, reason: r.reason,
      };
    });
    const pick = (k) => stats(rows.map((r) => r[k]));
    summary.rounds.push({
      ...round, calls: rows.length,
      deadlineHits: rows.filter((r) => r.deadline).length,
      denied: rows.filter((r) => r.denied).length,
      reasons: [...new Set(rows.map((r) => r.reason).filter(Boolean))],
      wall: pick("wall"), boot: pick("boot"), stdin: pick("stdin"), locator: pick("locator"), toGateway: pick("toGateway"),
      body: pick("body"), admission: pick("admission"), policy: pick("policy"), bridgeTotal: pick("bridgeTotal"), post: pick("post"),
      loopMaxMs: trace.filter((t) => t.kind === "gw-loop" && t.at >= roundStart).map((t) => t.max),
    });
    console.error(`[segments] ${round.name}: ${JSON.stringify(summary.rounds.at(-1))}`);
  }
  summary.parentHooks = readTrace().filter((t) => t.kind === "cli" && !String(t.toolUseId ?? "").startsWith("nhr-")).map((t) => ({ boot: t.bootMs, wall: t.endAt - t.startAt, deadline: t.deadlineHit }));
  spawnSync("pkill", ["-f", `sleep ${holdSecs}`]);
  const turn = await turnPromise;
  summary.turn = { exit: turn.exit, secs: turn.secs, reply: turn.reply.slice(0, 200) };
  const idle = summary.rounds.find((r) => r.name === "idle-seq");
  if (idle) assert(idle.deadlineHits === 0 && idle.denied === 0, `idle relay calls failed: ${JSON.stringify(idle)}`);
}

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  summary.gatewayReadyMs = Date.now() - startedAt;
  const sessionKey = `agent:makaron:explicit:nhr-${mode}-${expect}-${runTag}`;
  summary.sessionKey = sessionKey;
  summary.sessionPatch = Boolean(await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODEL }, { timeoutMs: 30_000 }));
  if (mode === "followup") await followupScenario(sessionKey);
  else await segmentsScenario(sessionKey);
  summary.verdict = "pass";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-60).map((l) => l.line).join("\n")).slice(-6000);
  summary.codex = (() => { try { return codexToolCalls(startedAt).map((c) => ({ ...c, calls: c.calls.slice(-10) })); } catch { return null; } })();
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  await stopChild(gateway);
  try { fs.rmSync(shortTmp, { recursive: true, force: true }); } catch { /* compile cache still being written */ }
}
