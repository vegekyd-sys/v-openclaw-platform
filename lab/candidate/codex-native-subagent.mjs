// Candidate end-to-end: a Codex native subagent (Codex app-server spawn_agent,
// OpenClaw codex harness) must keep working after its parent turn ends, and its
// result must reach the parent session without anybody sending a message.
//
// Production V 2026-10-02 00:15 CST (Feishu group, /vcodex): the parent spawned
// a native child and yielded; the user sent a follow-up while the child was
// still running. From then on every child tool call was refused with "Native
// hook relay unavailable" (Gateway: nativeHook.invoke "native hook relay not
// found"), the child finished with a report of what it could not do, the task
// row said succeeded, and delivery to the parent failed with "In-process
// gateway dispatch requires a gateway request scope or instance binding
// (method: agent)". The parent never woke.
//
// Scenario (one per run, same steps):
//   1. turn 1: the parent spawns one native child and ends with sessions_yield.
//      The child first sleeps, then hashes an input file whose content is not
//      in any prompt, writes the hash to an output file and reports it.
//   2. turn 2: while the child sleeps, a follow-up message to the parent
//      (production's trigger). It must end before the child wakes up.
//   3. nobody sends anything. The child's tool calls after turn 2 must run,
//      and the parent's next reply must carry the hash.
//
// NSA_EXPECT=baseline  unpatched runtime: production's failure must reproduce
// NSA_EXPECT=fixed     patched runtime: file written, parent woken with the hash
// NSA_FIX_PARTS=codex|core  apply one half of the fix only, to attribute each symptom
// NSA_DROP_SCOPE_RESOLVER=1  test-only: deliver the completion the way V did, with
//      no Gateway resolver on the parent's task scope and no Gateway request scope
//      around the monitor. A CLI turn has both (the shared Codex client is started
//      inside the RPC), so without this the delivery half cannot fail here.
//
// Model: /vds (Codex harness + DeepSeek). Production's /vds patch 5 turns
// native multi_agent off for DeepSeek; this test re-enables it for DeepSeek
// only inside the candidate so the native child path (the one /vcodex uses)
// runs without copying the shared ChatGPT login (memory: candidate-stale-oauth).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const expect = process.env.NSA_EXPECT ?? "fixed";
assert(["fixed", "baseline"].includes(expect));
const dropScopeResolver = process.env.NSA_DROP_SCOPE_RESOLVER === "1";
const followup = process.env.NSA_FOLLOWUP !== "0";
const childSleepSecs = Number(process.env.NSA_CHILD_SLEEP ?? 75);
const MODEL = "deepseek/deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), expect, dropScopeResolver, followup, childSleepSecs, notes: [] };
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

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(token);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---------------------------------------------------------------- Codex plugin = V's bytes
// The candidate state copy has no managed npm plugins; the Gateway would fall back to the
// shared runtime's unpatched generation. Shared VLab state carries V's install (sha-identical
// thread-lifecycle/run-attempt/native-subagent-monitor), so copy that.
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
const codexFile = (re) => {
  const hits = fs.readdirSync(codexDist).filter((f) => re.test(f));
  assert.equal(hits.length, 1, `codex module ${re} not unique`);
  return path.join(codexDist, hits[0]);
};
const V_SHA = {
  "thread-lifecycle-DAcEJ_Om.js": "0e575c99edb63a52de51712393986cd5b7566155cf1b484bda4bdcbf494bd053",
  "run-attempt-D1hJO4fX.js": "694e3817aebbdd511937eee6f40bf1a8441000ca6cd0b5370f8943cf77a5421e",
  "native-subagent-monitor-CnH147jH.js": "33bde1f3a95a60c291d03a85d7d19c21fe69ef7e28652979680a6d1201ff7c24",
};
const CORE_V_SHA = {
  "plugin-sdk/agent-harness-task-runtime.js": "04f713bc2f269afe0906db54317e64f545749a02dd86a8f31d7be955c311fa71",
  "subagent-registry-C24yr_PF.js": "f0b833de66236db51c7feac999ba7229a6559fbd16a581a40b19f8ee6d752bec",
};
summary.startingBytes = {
  codex: Object.fromEntries(Object.entries(V_SHA).map(([f, want]) => [f, sha256(fs.readFileSync(path.join(codexDist, f))) === want ? "V" : "differs"])),
  core: Object.fromEntries(Object.entries(CORE_V_SHA).map(([f, want]) => [f, sha256(fs.readFileSync(path.join(dist, f))) === want ? "V" : "differs"])),
};
for (const [k, v] of Object.entries({ ...summary.startingBytes.codex, ...summary.startingBytes.core })) assert.equal(v, "V", `${k} does not start from V's bytes`);

// The fix under test (release script, idempotent anchors).
// NSA_FIX_PARTS=codex|core applies one half only (with NSA_EXPECT=baseline) to attribute each symptom.
const fixParts = (process.env.NSA_FIX_PARTS ?? (expect === "fixed" ? "codex,core" : "")).split(",").map((s) => s.trim()).filter(Boolean);
summary.fixParts = fixParts;
if (fixParts.length) {
  const patch = spawnSync(process.execPath, ["lab/release-files/codex-native-subagent/patch-codex-native-subagent.mjs",
    ...(fixParts.includes("codex") ? ["--codex", codexRoot] : []), ...(fixParts.includes("core") ? ["--core", path.join(runtime, "openclaw")] : [])], { encoding: "utf8" });
  assert.equal(patch.status, 0, `fix patch failed: ${patch.stderr}`);
  summary.fixPatch = JSON.parse(patch.stdout);
}
// Test-only 1: native multi_agent for DeepSeek (V's /vds patch 5 turns it off; /vcodex has it).
{
  const file = codexFile(/^thread-lifecycle-.*\.js$/u);
  const src = fs.readFileSync(file, "utf8");
  const from = 'return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");';
  assert.equal(src.split(from).length, 2, "vds patch 5 anchor not found");
  fs.writeFileSync(file, src.replace(from, 'return normalizedId === "gpt-5.4-nano";'));
}
// Test-only 2: drop the Gateway resolver from the harness task scope (Feishu-ingress shape).
if (dropScopeResolver) {
  const file = fs.readdirSync(dist).map((f) => path.join(dist, f)).find((f) => /\/embedded-agent-[\w-]+\.js$/u.test(f) && fs.readFileSync(f, "utf8").includes("gatewayContextResolver: getGatewayContextResolver(params.admittedRunContext)"));
  assert(file, "embedded-agent scope anchor not found");
  const src = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, src.replace("gatewayContextResolver: getGatewayContextResolver(params.admittedRunContext)", "gatewayContextResolver: void 0"));
  // A CLI turn starts the shared Codex client inside its Gateway request, so the
  // monitor's notification handlers inherit that request scope; on V the client of
  // a Feishu turn has none. Deliver from outside any request scope, as V did.
  const sdk = path.join(dist, "plugin-sdk", "agent-harness-task-runtime.js");
  const head = "async function deliverAgentHarnessTaskCompletion(params) {\n";
  const sdkSrc = fs.readFileSync(sdk, "utf8");
  assert.equal(sdkSrc.split(head).length, 2, "delivery function anchor not found");
  fs.writeFileSync(sdk, sdkSrc.replace(head, `${head}\tif (!params.nsaDetached) return await globalThis[Symbol.for("openclaw.pluginRuntimeGatewayRequestScope")].exit(() => deliverAgentHarnessTaskCompletion({ ...params, nsaDetached: true }));\n`));
}

// Codex app-server home for /vds: agent-scoped, DeepSeek provider (same as vds-codex-switch).
const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
{
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- input only the child can read
const workspace = config.agents.entries.makaron.workspace ?? path.join(data, "workspace", "makaron");
fs.mkdirSync(workspace, { recursive: true });
const runTag = crypto.randomBytes(3).toString("hex");
const inputName = `nsa-input-${runTag}.bin`;
const outputName = `nsa-output-${runTag}.txt`;
const inputBytes = crypto.randomBytes(4096);
fs.writeFileSync(path.join(workspace, inputName), inputBytes);
const wantHash = sha256(inputBytes);
const wantShort = wantHash.slice(0, 16);
// The parent's own tools in turns 2 and 3: a token only a real `cat` can return. In the
// fixed runtime turn 2 registers under a turn-scoped relay id while the child keeps the
// session one, so the parent's hooks must follow its own turn's relay.
const parentTokens = [2, 3].map((n) => ({ n, file: `nsa-turn${n}-${runTag}.txt`, token: `TOK${n}-${crypto.randomBytes(5).toString("hex").toUpperCase()}` }));
for (const p of parentTokens) fs.writeFileSync(path.join(workspace, p.file), `${p.token}\n`);
fs.rmSync(path.join(workspace, outputName), { force: true });

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.nsa-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey; secrets.add(deepseekKey);
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

function runTurn(sessionKey, prompt, timeoutSecs = 420) {
  const mark = lines.length;
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
      const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
      resolve({
        exit: code, secs: Math.round((Date.now() - started) / 1000), startedAt: started, endedAt: Date.now(),
        ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime } : null,
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 800),
        logFrom: mark,
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
const textOf = (message) => typeof message.content === "string"
  ? message.content
  : (message.content ?? []).map((b) => b.text ?? `[${b.type}]`).join(" ");
async function history(sessionKey) {
  const result = await client.request("chat.history", { agentId: "makaron", sessionKey, limit: 80 }, { timeoutMs: 15_000 });
  return (result?.messages ?? []).map((m) => ({ role: m.role, text: redact(textOf(m)).slice(0, 600) }));
}
function taskRows() {
  const file = path.join(stateDir, "state", "openclaw.sqlite");
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(`select status, delivery_status as deliveryStatus, notify_policy as notifyPolicy, error, substr(terminal_summary,1,400) as terminalSummary, run_id as runId, requester_session_key as requester, tool_use_count as tools
      from task_runs where task_kind = 'codex-native' order by created_at`).all();
  } finally {
    db.close();
  }
}
// Codex keeps its own transcript: every tool call and what came back.
function codexToolCalls(since) {
  const out = [];
  const files = spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(codexHome, "sessions"))} -name 'rollout-*.jsonl' -newermt @${Math.floor(since / 1000) - 1} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const f of files) {
    let threadId, parent;
    const calls = new Map();
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      if (o.type === "session_meta") { threadId ??= p.id; parent ??= p.parent_thread_id ?? p.source?.subagent?.thread_spawn?.parent_thread_id; }
      if ((p.type === "function_call" || p.type === "custom_tool_call") && p.call_id) calls.set(p.call_id, { at: o.timestamp, name: p.name, args: redact(String(p.arguments ?? p.input ?? "")).slice(0, 200) });
      else if ((p.type === "function_call_output" || p.type === "custom_tool_call_output") && calls.has(p.call_id)) calls.get(p.call_id).output = redact(typeof p.output === "string" ? p.output : JSON.stringify(p.output)).slice(0, 300);
    }
    out.push({ file: path.basename(f), threadId, parent: parent ?? null, calls: [...calls.values()] });
  }
  return out;
}
const logMatches = (re, from = 0) => lines.slice(from).filter((l) => re.test(l.line)).map((l) => redact(l.line).slice(0, 400));

const PROMPT_1 = [
  "这是一次自动化测试，请严格照做。",
  "1. 用 Codex 原生的 spawn_agent 工具创建一个子 agent（不要用 sessions_spawn，也不要自己做下面的事）。交给子 agent 的任务原文如下：",
  `   「先运行 shell 命令 sleep ${childSleepSecs}。等它结束后，再运行命令 sha256sum ${inputName} 计算工作目录里这个文件的 SHA-256，`,
  `   然后把完整的 64 位十六进制哈希写入工作目录下的文件 ${outputName}（只写哈希），最后用一行回复：NSA_HASH <哈希前16位>。任何一步失败就回复 NSA_FAIL 加原样错误。」`,
  "2. 创建子 agent 之后，立刻调用 sessions_yield 结束本轮，等子 agent 的结果自动送回来，不要用 wait_agent 等它。",
  "3. 收到子 agent 的结果后，只回复一行：PARENT_GOT <子 agent 回复里的那串字符>。",
].join("\n");
const parentPrompt = (p) => `这是另一条消息，跟子 agent 的任务无关，也不要去管子 agent：请用 exec_command 运行 cat ${p.file}，然后只回复一行：PONG <文件内容>。`;

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  summary.gatewayReadyMs = Date.now() - startedAt;
  const sessionKey = `agent:makaron:explicit:nsa-${expect}-${runTag}`;
  summary.sessionKey = sessionKey;
  // The wake-up turn runs on the session's model, not on a per-call --model. On V the
  // session carries /vcodex as its model; persist /vds the same way.
  summary.sessionPatch = Boolean(await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODEL }, { timeoutMs: 30_000 }));

  const t1 = await runTurn(sessionKey, PROMPT_1);
  summary.turn1 = { exit: t1.exit, secs: t1.secs, ran: t1.ran, reply: t1.reply, stderr: t1.stderr };
  if (followup) {
    const t2 = await runTurn(sessionKey, parentPrompt(parentTokens[0]), 180);
    summary.turn2 = { exit: t2.exit, secs: t2.secs, ran: t2.ran, reply: t2.reply, stderr: t2.stderr, endedAfterTurn1Ms: t2.endedAt - t1.endedAt, parentToolOk: t2.reply.includes(parentTokens[0].token) };
  }
  const afterTurns = await history(sessionKey);
  const quietFrom = Date.now();
  summary.quietFromMs = quietFrom - t1.startedAt;

  // Nobody sends anything from here on.
  const deadline = quietFrom + Number(process.env.NSA_WAIT_SECS ?? 480) * 1000;
  let woke;
  while (Date.now() < deadline) {
    await sleep(5_000);
    const rows = taskRows();
    const messages = await history(sessionKey);
    const fresh = messages.slice(afterTurns.length).filter((m) => m.role === "assistant");
    if (!woke && fresh.some((m) => m.text.includes(wantShort))) woke = { atMs: Date.now() - quietFrom, text: fresh.map((m) => m.text).join(" | ").slice(0, 600) };
    const settled = rows.length > 0 && rows.every((r) => r.status !== "running" && r.status !== "queued" && r.deliveryStatus !== "pending");
    if (woke && settled) break;
    if (settled && rows.every((r) => r.deliveryStatus === "delivered") && fresh.length > 0 && Date.now() - quietFrom > 60_000) break;
    if (settled && Date.now() - quietFrom > 120_000 && rows.every((r) => r.deliveryStatus === "failed")) break;
    // Baseline: V's delivery error has shown up and retries keep failing; no need to sit out all six.
    if (!fixParts.includes("core") && Date.now() - quietFrom > 180_000 && rows.some((r) => /In-process gateway dispatch requires/u.test(r.error ?? ""))) break;
  }
  const messages = await history(sessionKey);
  // Turn 3, after the child is done: the parent's own tools still work.
  // Snapshot before turn 3: a new user turn makes Codex hand the child's notification to
  // the parent thread, and the monitor then marks the task delivered (V at 00:25) even
  // though the parent was never woken. The verdict judges the state before that.
  const tasksBeforeTurn3 = taskRows();
  const t3 = await runTurn(sessionKey, parentPrompt(parentTokens[1]), 180);
  summary.turn3 = { exit: t3.exit, secs: t3.secs, reply: t3.reply, stderr: t3.stderr, parentToolOk: t3.reply.includes(parentTokens[1].token) };
  const outputPath = path.join(workspace, outputName);
  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8").trim() : null;
  const calls = codexToolCalls(t1.startedAt);
  const childRollouts = calls.filter((c) => c.parent);
  const relayRefusals = calls.flatMap((c) => c.calls).filter((c) => /Native hook relay unavailable|native hook relay/iu.test(c.output ?? "")).length;
  summary.result = {
    outputFile: output === null ? "missing" : output === wantHash ? "correct-hash" : `wrong: ${output.slice(0, 80)}`,
    wantShort,
    parentWokeWithHash: woke ?? null,
    parentMessagesAfterTurns: messages.slice(afterTurns.length).map((m) => ({ role: m.role, text: m.text.slice(0, 300) })),
    tasks: tasksBeforeTurn3,
    tasksAfterTurn3: taskRows().map((r) => ({ status: r.status, deliveryStatus: r.deliveryStatus })),
    nativeChildren: childRollouts.length,
    relayRefusalsInCodexTranscript: relayRefusals,
    gatewayRelayNotFound: logMatches(/native hook relay not found/u).length,
    gatewayRelayErrors: logMatches(/nativeHook\.invoke[^\n]*✗|native hook relay (?:not found|expired|retained invocation not allowed|foreground)/u).slice(0, 8),
    nativeSubagentLog: logMatches(/native subagent|Codex native|codex-native/iu).slice(-12),
    codexTranscripts: calls.map((c) => ({ ...c, calls: c.calls.slice(-12) })),
  };

  // -------------------------------------------------------------- verdict
  assert.equal(t1.exit, 0, `turn 1 failed: ${t1.stderr}`);
  assert(childRollouts.length >= 1, "the parent did not spawn a Codex native child");
  if (followup) assert(summary.turn2.parentToolOk, `turn 2: the parent's own tool call did not run: ${summary.turn2.reply}`);
  // With delivery broken, turn 3 is where the stranded child result finally surfaces (V at
  // 00:25) and the model may answer that instead of the prompt; only judge it otherwise.
  if (fixParts.includes("core") || !dropScopeResolver) assert(summary.turn3.parentToolOk, `turn 3: the parent's own tool call did not run: ${summary.turn3.reply}`);
  const row = summary.result.tasks.at(-1);
  const relayFixed = fixParts.includes("codex");
  const deliveryFixed = fixParts.includes("core") || !dropScopeResolver;
  if (relayFixed) {
    assert.equal(summary.result.outputFile, "correct-hash", "the child did not write the hash");
    assert.equal(relayRefusals, 0, "child tool calls were refused by the relay");
    assert.equal(summary.result.gatewayRelayNotFound, 0, "Gateway reported native hook relay not found");
  } else {
    // Production signature: the child's tools are refused after the follow-up turn.
    assert(relayRefusals > 0 && summary.result.gatewayRelayNotFound > 0, "baseline did not reproduce the relay refusal");
    assert.notEqual(summary.result.outputFile, "correct-hash", "baseline child should not have managed to write the hash");
  }
  if (deliveryFixed) {
    assert.equal(row?.deliveryStatus, "delivered", `task delivery: ${JSON.stringify(row)}`);
    if (relayFixed) assert(woke, "the parent was not woken with the child's hash");
  } else {
    // V's delivery failure: the parent is never woken.
    assert.match(String(row?.error), /In-process gateway dispatch requires a gateway request scope or instance binding \(method: agent\)/u, `delivery error: ${JSON.stringify(row)}`);
    assert.notEqual(row?.deliveryStatus, "delivered");
    assert.equal(summary.result.parentMessagesAfterTurns.length, 0, "the parent should not have been woken");
  }
  summary.verdict = "pass";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-80).map((l) => l.line).join("\n")).slice(-8000);
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  await stopChild(gateway);
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
