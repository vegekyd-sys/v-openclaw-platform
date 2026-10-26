// Candidate end-to-end: when a Codex native subagent finishes, the parent session is
// woken by an announce turn (`announce:codex-native:<parent>:<child>:succeeded`). That
// turn is a Gateway `agent` call with expectFinal and
// timeoutMs = agents.defaults.subagents.announceTimeoutMs (default 120 000). The run is
// aborted when the caller times out.
//
// Production V 2026-10-26 14:27 CST (Feishu group oc_1f2843b2, /vcodex): the child
// finished, the parent kept working inside the announce turn as its reply instruction
// says ("continue or wrap up the parent task"), and both attempts were aborted at
// ~120.5 s (lane task AbortError). No final, nothing in Feishu, task row
// delivery_status=failed / "gateway request timeout for agent".
//
// Scenario:
//   1. turn 1: the parent spawns one native child and ends with sessions_yield. The child
//      hashes an input file whose content is in no prompt and reports the hash.
//   2. nobody sends anything. In the announce turn the parent must first run a command
//      that takes ANN_PARENT_SLEEP seconds (> 120), then read a token file, then reply
//      with the hash and the token.
//
// ANN_EXPECT=baseline  config as on V (no announceTimeoutMs): the announce turn is
//                      aborted near 120 s and the reply never arrives
// ANN_EXPECT=fixed     announceTimeoutMs=ANN_TIMEOUT_MS: the announce turn runs to the
//                      end, its final carries hash + token, the task row is delivered
//
// Model: /vds (Codex harness + DeepSeek), with native multi_agent re-enabled for
// DeepSeek inside the candidate only (same as codex-native-subagent.mjs).
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
const expect = process.env.ANN_EXPECT ?? "fixed";
assert(["fixed", "baseline"].includes(expect));
const announceTimeoutMs = Number(process.env.ANN_TIMEOUT_MS ?? 1_800_000);
const parentSleepSecs = Number(process.env.ANN_PARENT_SLEEP ?? 150);
const MODEL = "deepseek/vds-deepseek-flash"; // V's /vds: Codex harness + DeepSeek Flash
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), expect, announceTimeoutMs: expect === "fixed" ? announceTimeoutMs : "unset (default 120000)", parentSleepSecs, notes: [] };
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
// V's /vds entry: plain deepseek-flash runs on vlab-worker, /vds pins the Codex runtime.
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
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { ...(config.plugins.entries.codex?.config?.appServer ?? {}), mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
summary.sharedAnnounceTimeoutMs = config.agents.defaults.subagents?.announceTimeoutMs ?? null;
if (expect === "fixed") {
  config.agents.defaults.subagents = { ...(config.agents.defaults.subagents ?? {}), announceTimeoutMs };
} else if (config.agents.defaults.subagents) {
  delete config.agents.defaults.subagents.announceTimeoutMs;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---------------------------------------------------------------- Codex plugin from shared VLab state
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
// V's bytes on 2026-10-26 15:3x CST. Recorded, not asserted for the Codex plugin: shared
// VLab loads its own state/npm copy (memory: vlab-fidelity-gap 10/10).
const V_SHA = {
  codex: {
    "thread-lifecycle-DAcEJ_Om.js": "4cceab62ea349d266533cf18f6ffdbd620407504cfe16126e16aa04e5bfcb661",
    "run-attempt-D1hJO4fX.js": "80875cf3cab593453d4f1c1014c47105d0ce1657e955ed510ff93d754f56457f",
    "native-subagent-monitor-CnH147jH.js": "b899ca81e9255ba3f817af3b81c9a2beb5298cc5644876e2fac65d6b74df69fe",
  },
  core: {
    "plugin-sdk/agent-harness-task-runtime.js": "50dc439b5cbb8a16860aab0bd8b4f4fd485f16a246f881820be5c0ea9c0754e3",
    "subagent-registry-C24yr_PF.js": "1d9f45d61e7201f27cd79b5941985443e4639b2bc21a0d4e1d97b386ad190a47",
    "subagent-announce-delivery-Dosep7Zr.js": "6269e1bd1697177f5eca9aef878509521fa7fcb64d5c9a0c18e44bdcb53a363b",
  },
};
const fileSha = (f) => (fs.existsSync(f) ? sha256(fs.readFileSync(f)) : "missing");
summary.startingBytes = {
  codex: Object.fromEntries(Object.entries(V_SHA.codex).map(([f, want]) => [f, fileSha(path.join(codexDist, f)) === want ? "V" : "differs"])),
  core: Object.fromEntries(Object.entries(V_SHA.core).map(([f, want]) => [f, fileSha(path.join(dist, f)) === want ? "V" : "differs"])),
};
// Test-only: native multi_agent for DeepSeek (V's /vds patch 5 turns it off; /vcodex has it).
{
  const hits = fs.readdirSync(codexDist).filter((f) => /^thread-lifecycle-.*\.js$/u.test(f));
  assert.equal(hits.length, 1, "thread-lifecycle module not unique");
  const file = path.join(codexDist, hits[0]);
  const src = fs.readFileSync(file, "utf8");
  const from = 'return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");';
  assert.equal(src.split(from).length, 2, "vds patch 5 anchor not found");
  fs.writeFileSync(file, src.replace(from, 'return normalizedId === "gpt-5.4-nano";'));
}

const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
{
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- inputs
const workspace = config.agents.entries.makaron.workspace ?? path.join(data, "workspace", "makaron");
fs.mkdirSync(workspace, { recursive: true });
const runTag = crypto.randomBytes(3).toString("hex");
const inputName = `ann-input-${runTag}.bin`;
const inputBytes = crypto.randomBytes(4096);
fs.writeFileSync(path.join(workspace, inputName), inputBytes);
const wantShort = sha256(inputBytes).slice(0, 16);
const tokenFile = `ann-token-${runTag}.txt`;
const parentToken = `TOK-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
fs.writeFileSync(path.join(workspace, tokenFile), `${parentToken}\n`);

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.ann-${process.pid}`;
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
        exit: code, secs: Math.round((Date.now() - started) / 1000), startedAt: started, endedAt: Date.now(),
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 800),
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
const textOf = (message) => typeof message.content === "string"
  ? message.content
  : (message.content ?? []).map((b) => b.text ?? `[${b.type}${b.name ? `:${b.name}` : ""}]`).join(" ");
async function history(sessionKey) {
  const result = await client.request("chat.history", { agentId: "makaron", sessionKey, limit: 120 }, { timeoutMs: 15_000 });
  return {
    inFlightRun: result?.inFlightRun ? { runId: result.inFlightRun.runId, startedAt: result.inFlightRun.startedAt } : null,
    messages: (result?.messages ?? []).map((m) => ({ role: m.role, ts: Number(m.timestamp ?? 0), stopReason: m.stopReason, text: redact(textOf(m)).slice(0, 600) })),
  };
}
function taskRows() {
  const file = path.join(stateDir, "state", "openclaw.sqlite");
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(`select status, delivery_status as deliveryStatus, error, ended_at as endedAt, substr(terminal_summary,1,300) as terminalSummary
      from task_runs where task_kind = 'codex-native' order by created_at`).all();
  } finally {
    db.close();
  }
}
// The diagnostic lines (lane task error, run ... ended) go to the file log, not stdout.
function fileLogLines() {
  const out = [];
  for (const dir of [shortTmp, ...fs.readdirSync("/tmp").filter((d) => d.startsWith("openclaw-")).map((d) => path.join("/tmp", d))]) {
    let files = [];
    try { files = spawnSync("bash", ["-c", `find ${JSON.stringify(dir)} -maxdepth 2 -name 'openclaw-*.log' -newermt @${Math.floor(Date.parse(summary.startedAt) / 1000)} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean); } catch { /* none */ }
    for (const f of files) {
      try { out.push(...fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes(String(port)) || l.includes("announce:") || l.includes("lane task error"))); } catch { /* unreadable */ }
    }
  }
  return out;
}
const announceEvidence = (sessionKey) => {
  const all = [...lines.map((l) => l.line), ...fileLogLines()];
  const pick = (re) => [...new Set(all.filter((l) => re.test(l)).map((l) => redact(l).slice(0, 400)))];
  return {
    laneAborts: pick(new RegExp(`lane task error: lane=session:${sessionKey.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[^"]*durationMs=\\d+[^"]*aborted`, "u"))
      .map((l) => Number(l.match(/durationMs=(\d+)/u)?.[1])),
    cleanupFailed: pick(/agent cleanup failed: runId=announce:codex-native/u).length,
    announceEnded: pick(/run announce:codex-native:[^ ]+ ended with stopReason=\w+/u).map((l) => l.match(/stopReason=\w+/u)?.[0]),
  };
};

const PROMPT_1 = [
  "这是一次自动化测试，请严格照做。",
  "1. 用 Codex 原生的 spawn_agent 工具创建一个子 agent（不要用 sessions_spawn，也不要自己做子 agent 的事）。交给子 agent 的任务原文如下：",
  `   「运行命令 sha256sum ${inputName} 计算工作目录里这个文件的 SHA-256，然后只用一行回复：ANN_HASH <哈希前16位>。失败就回复 ANN_FAIL 加原样错误。」`,
  "2. 创建子 agent 之后，立刻调用 sessions_yield 结束本轮，等子 agent 的结果自动送回来，不要用 wait_agent 等它。",
  `3. 收到子 agent 的结果后，在同一轮里先用 exec_command 运行 sleep ${parentSleepSecs} && cat ${tokenFile}。`,
  "   这条命令要等它完整结束才算数：没结束就继续用 write_stdin 等待它的输出，不要提前回复，不要中途放弃。",
  "4. 命令结束后，只回复一行：PARENT_DONE <子 agent 给的哈希前16位> <命令输出的那串 TOK- 开头的字符>。",
].join("\n");

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  summary.gatewayReadyMs = Date.now() - startedAt;
  const sessionKey = `agent:makaron:explicit:ann-${expect}-${runTag}`;
  summary.sessionKey = sessionKey;
  summary.sessionPatch = Boolean(await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODEL }, { timeoutMs: 30_000 }));
  const runtimeTimeout = await client.request("config.get", {}, { timeoutMs: 15_000 }).then(
    (r) => (r?.config ?? r?.parsed ?? r)?.agents?.defaults?.subagents?.announceTimeoutMs ?? null,
    () => "config.get failed",
  );
  summary.runtimeAnnounceTimeoutMs = runtimeTimeout;

  const t1 = await runTurn(sessionKey, PROMPT_1);
  summary.turn1 = { exit: t1.exit, secs: t1.secs, reply: t1.reply, stderr: t1.stderr };
  assert.equal(t1.exit, 0, `turn 1 failed: ${t1.reply} ${t1.stderr}`);
  const afterTurn1 = (await history(sessionKey)).messages.length;
  const quietFrom = Date.now();

  // Nobody sends anything from here on.
  const waitSecs = Number(process.env.ANN_WAIT_SECS ?? (expect === "fixed" ? parentSleepSecs + 600 : parentSleepSecs + 420));
  const deadline = quietFrom + waitSecs * 1000;
  let done;
  let childDoneAt;
  while (Date.now() < deadline) {
    await sleep(5_000);
    const rows = taskRows();
    if (!childDoneAt && rows.some((r) => r.status === "succeeded")) childDoneAt = Date.now();
    const h = await history(sessionKey);
    const fresh = h.messages.slice(afterTurn1).filter((m) => m.role === "assistant");
    const hit = fresh.find((m) => m.text.includes("PARENT_DONE") && m.text.includes(parentToken));
    if (hit && !done) done = { atMs: Date.now() - quietFrom, text: hit.text.slice(0, 300) };
    const ev = announceEvidence(sessionKey);
    const settled = rows.length > 0 && rows.every((r) => r.deliveryStatus !== "pending" && r.status !== "running");
    if (done && settled && !h.inFlightRun) break;
    // Baseline: the production signature is in — one abort near 120 s and the delivery failed.
    const cut = fresh.length === 0 ? undefined : h.messages.slice(afterTurn1).find((m) => /without a matching tool\.result/u.test(m.text));
    if (expect === "baseline" && cut && (ev.cleanupFailed >= 1 || ev.laneAborts.length >= 1) && !h.inFlightRun) break;
  }
  const h = await history(sessionKey);
  const rows = taskRows();
  const ev = announceEvidence(sessionKey);
  // The announce turn's first step and the point where its open tool call was cut off.
  const after = h.messages.slice(afterTurn1);
  const firstStep = after.find((m) => m.role === "assistant" && m.ts);
  const cutOff = after.find((m) => /without a matching tool\.result/u.test(m.text) && m.ts);
  const cutAfterMs = firstStep && cutOff ? cutOff.ts - firstStep.ts : null;
  summary.result = {
    wantShort,
    parentDone: done ?? null,
    childDoneAfterQuietMs: childDoneAt ? childDoneAt - quietFrom : null,
    inFlightRunAtEnd: h.inFlightRun,
    messagesAfterTurn1: h.messages.slice(afterTurn1).map((m) => ({ role: m.role, at: m.ts ? new Date(m.ts).toISOString() : null, stopReason: m.stopReason, text: m.text.slice(0, 240) })),
    tasks: rows,
    announce: ev,
    toolCutAfterFirstStepMs: cutAfterMs,
  };

  // -------------------------------------------------------------- verdict
  assert.equal(t1.exit, 0, `turn 1 failed: ${t1.stderr}`);
  assert(rows.length >= 1 && rows.at(-1).status === "succeeded", `child task did not succeed: ${JSON.stringify(rows)}`);
  assert(firstStep && /toolCall/u.test(firstStep.text), "the announce turn never started the long command; the scenario did not run");
  if (expect === "baseline") {
    // Production signature: the open command is cut off when the 120 s announce call times out.
    assert(cutOff, `the announce turn's command was not cut off: ${JSON.stringify(summary.result.messagesAfterTurn1)}`);
    assert(cutAfterMs < parentSleepSecs * 1000 && cutAfterMs <= 125_000, `cut off after ${cutAfterMs} ms, not by the 120 s announce timeout`);
    assert(ev.cleanupFailed >= 1 || ev.laneAborts.length >= 1, `no announce abort in the Gateway log: ${JSON.stringify(ev)}`);
    assert.equal(done, undefined, "baseline should not have produced PARENT_DONE");
  } else {
    assert(done, "the announce turn did not deliver PARENT_DONE with hash + token");
    assert(done.text.includes(wantShort), `PARENT_DONE without the child's hash: ${done.text}`);
    assert.equal(ev.laneAborts.length, 0, `announce turn was aborted: ${JSON.stringify(ev.laneAborts)}`);
    assert.equal(ev.cleanupFailed, 0, "announce turn cleanup failed (aborted)");
    assert.equal(cutOff, undefined, "the announce turn's command was cut off");
    assert.equal(rows.at(-1).deliveryStatus, "delivered", `task delivery: ${JSON.stringify(rows.at(-1))}`);
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
