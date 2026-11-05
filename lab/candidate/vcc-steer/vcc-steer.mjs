// Candidate test: a message sent while a /vcc (claude-cli) reply runs is steered into that reply.
//
// VLab has no Claude subscription, so the private Gateway runs claude-cli against fake-claude.mjs,
// which speaks Claude Code's stream-json protocol and reproduces what V's real Claude Code does with
// a user message written mid-turn (see the header there). Everything on the OpenClaw side is real:
// chat.send queueMode=steer -> replyRunRegistry injection target -> the claude-cli reply handle ->
// the Agent SDK live session -> the process's stdin.
//
// ARM=fixed expects:
//   A (steer while a tool runs): the steer is written to the running process during the tool,
//     consumed in the same turn (one result), and the run's reply names both MAIN-A and STEER-A.
//   B (steer while the final answer is produced): the steer reaches the process during the answer,
//     Claude runs a follow-on turn, and the same OpenClaw run's reply contains both results' text.
//   C (next ordinary turn on the same live session): answers only MAIN-C, nothing leaks from B.
// ARM=baseline records today's behaviour: the steer never reaches the running process.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const ARM = process.env.ARM ?? "fixed";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const work = fs.mkdtempSync(path.join(stateDir, "vcc-steer-"));

// ---- fake Claude Code first on the Gateway's PATH ----
// OpenClaw binds claude-cli to one durable executable inside an @anthropic-ai/claude-code package
// tree, the way V's npm-global install is laid out (bin/claude -> .../claude-code/bin/claude.exe, a
// native binary). So the fake is installed root-owned before the run, as on V:
//   <root>/bin/claude -> <root>/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
//   claude.exe = fake-claude-exe.c, which execs node <root>/fake-claude.mjs
// FAKE_CLAUDE_BIN is <root>/bin; <root>/fake-claude.mjs must equal the reviewed file.
const binDir = process.env.FAKE_CLAUDE_BIN;
assert(binDir && path.isAbsolute(binDir), "FAKE_CLAUDE_BIN is required");
assert.equal(fs.readFileSync(path.join(path.dirname(binDir), "fake-claude.mjs"), "utf8"), fs.readFileSync(path.resolve("lab/candidate/vcc-steer/fake-claude.mjs"), "utf8"), "installed fake differs from the reviewed one");
const fakeLog = path.join(work, "fake-claude.jsonl");

// ---- configuration: makaron -> claude-opus-5-5 on claude-cli (/vcc) ----
const REF = "anthropic/claude-opus-5-5";
function configure(config) {
  const model = { primary: REF, fallbacks: [] };
  const perAgent = { alias: "vcc", agentRuntime: { id: "claude-cli" }, params: { thinking: "low" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[REF] = perAgent;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(REF)) allow.push(REF);
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[REF] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  return config;
}
const config = configure(JSON.parse(fs.readFileSync(configPath, "utf8")));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 3, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = configure(JSON.parse(fs
    .readFileSync(path.join(sharedState, workerRel), "utf8")
    .replaceAll(sharedState, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)));
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private Gateway ----
const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  PATH: `${binDir}:${process.env.PATH ?? "/usr/bin:/bin"}`,
  FAKE_CLAUDE_LOG: fakeLog,
  FAKE_CLAUDE_ANSWER_MS: "4000",
};
const lines = [];
let gateway, client;
// The shared VLab state already binds claude-cli to the host's Claude Code (/usr/bin/claude), so PATH
// alone cannot select the fake. The Gateway runs in a private mount namespace where the host's
// Claude Code entrypoint is bind-mounted to the fake's claude.exe; nothing outside this process
// tree sees the overlay. Needs the candidate's admin identity (no plan "user"); the Gateway then
// drops to the shared service identity inside the namespace.
const SERVICE_USER = "lab-db91-parity";
const REAL_CLAUDE_EXE = fs.realpathSync("/usr/bin/claude");
const FAKE_CLAUDE_EXE = fs.realpathSync(path.join(binDir, "claude"));
assert.notEqual(REAL_CLAUDE_EXE, FAKE_CLAUDE_EXE);
function startGateway() {
  const gatewayArgv = [process.execPath, "--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)];
  assert.equal(process.getuid?.(), 0, "run this candidate with the admin identity (no plan user)");
  // The Gateway itself runs as the shared service identity, inside the namespace.
  // The run directory (runtime, state, data, inputs) is this candidate's own; hand it over whole.
  const runRoot = path.dirname(runtime);
  for (const dir of [runRoot, stateDir, process.env.VLAB_CANDIDATE_DATA, process.cwd()].filter(Boolean)) {
    execFileSync("chown", ["-R", `${SERVICE_USER}:${SERVICE_USER}`, dir]);
  }
  gateway = spawn("unshare", ["--mount", "--propagation", "private", "sh", "-c",
    'mount --bind "$FAKE_CLAUDE_EXE" "$REAL_CLAUDE_EXE" && exec setpriv --reuid="$SERVICE_USER" --regid="$SERVICE_USER" --init-groups "$@"', "sh", ...gatewayArgv],
  { env: { ...env, FAKE_CLAUDE_EXE, REAL_CLAUDE_EXE, SERVICE_USER }, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 80_000) lines.splice(0, lines.length - 80_000);
    });
  }
}
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError, restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(); continue; }
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
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}

const fakeRecords = () => fs.existsSync(fakeLog) ? fs.readFileSync(fakeLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
async function waitFor(predicate, ms, label) {
  const until = Date.now() + ms;
  while (Date.now() < until) { const hit = await predicate(); if (hit) return hit; await sleep(100); }
  throw new Error(`timed out waiting for ${label}\nfake: ${JSON.stringify(fakeRecords().slice(-8))}\n${redact(lines.slice(-30).map((l) => l.line).join("\n"))}`);
}
const userIn = (word) => fakeRecords().find((r) => r.in === "user" && String(r.text ?? "").includes(word));
const textsOf = (history) => (history?.messages ?? []).filter((m) => m.role === "assistant").map((m) => typeof m.content === "string" ? m.content : (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n"));

const results = {};
const seenClaudeProcesses = new Set();
try {
  startGateway();
  await connectGateway();
  const sessionKey = `agent:makaron:explicit:vcc-steer-${ARM}-${Date.now()}`;
  const send = (message, extra = {}) => {
    const idempotencyKey = randomUUID();
    return client.request("chat.send", { agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 300000, idempotencyKey, message, ...extra })
      .then((payload) => ({ idempotencyKey, payload }), (error) => ({ idempotencyKey, error: String(error?.message ?? error) }));
  };
  const finish = async (runId) => client.request("agent.wait", { runId, timeoutMs: 240_000 }).catch((e) => ({ error: String(e?.message ?? e) }));

  for (const scenario of ["A", "B", "C"]) {
    const main = scenario === "A" ? "MAIN-A 请执行一个慢工具 SLOW:9000 然后回答" : `MAIN-${scenario} 直接回答`;
    const sent = await send(main);
    const runId = sent.payload?.runId ?? sent.idempotencyKey;
    await waitFor(async () => {
      for (const row of execFileSync("ps", ["-eo", "pid,ppid,args"], { encoding: "utf8" }).split("\n")) {
        if (/claude/iu.test(row) && !/vcc-steer\.mjs|ps -eo/u.test(row)) seenClaudeProcesses.add(row.trim().slice(0, 300));
      }
      if (lines.some((l) => l.line.includes("cli terminal failure"))) {
        const { a: resolveExecutable } = await import(`${dist}/executable-path-CtMW1uXF.js`).catch(() => ({}));
        const diag = {
          fakeLogExists: fs.existsSync(fakeLog),
          gatewayPid: gateway.pid,
          claudeProcesses: [...seenClaudeProcesses],
          resolvedForGatewayEnv: resolveExecutable?.("claude", { env }),
          gatewayPathHead: env.PATH.split(":").slice(0, 3),
          claudeLines: lines.filter((l) => /\/claude|claude-code|executable/iu.test(l.line)).map((l) => l.line.slice(0, 240)).slice(-10),
        };
        throw new Error(`claude-cli failed (not the fake?) ${JSON.stringify(diag)}\n${redact(lines.filter((l) => /cli (exec|terminal)/u.test(l.line)).map((l) => l.line).join("\n"))}`);
      }
      return userIn(`MAIN-${scenario}`);
    }, 180_000, `MAIN-${scenario} at the fake CLI`);
    let steer;
    if (scenario !== "C") {
      await sleep(scenario === "A" ? 2_500 : 1_200); // A: inside the 9 s tool; B: inside the 4 s answer
      steer = await send(`STEER-${scenario} 插话：回复里带上我`, { queueMode: "steer" });
    }
    const waited = await finish(runId);
    if (steer?.payload?.runId && steer.payload.runId !== runId) await finish(steer.payload.runId);
    await sleep(6_000); // let a fallback follow-up (baseline) run and land in history
    const history = await client.request("chat.history", { sessionKey, limit: 50 }).catch(() => null);
    const fakeSteer = steer ? userIn(`STEER-${scenario}`) : undefined;
    results[scenario] = {
      main: { runId, payload: sent.payload, error: sent.error },
      steer: steer && { payload: steer.payload, error: steer.error, reachedFakeCli: Boolean(fakeSteer), phaseAtFakeCli: fakeSteer?.phase, priority: fakeSteer?.priority },
      waited: { status: waited?.status, error: waited?.error },
      assistantTexts: textsOf(history).slice(-3),
      fakeResults: fakeRecords().filter((r) => r.event === "result").map((r) => r.text).slice(-3),
    };
  }
  const fakeProcesses = new Set(fakeRecords().map((r) => r.pid)).size;
  results.fakeProcesses = fakeProcesses;
  results.liveSessionStarts = lines.filter((l) => l.line.includes("cli live session start")).length;
  results.steerLogs = lines.filter((l) => /steer|injection/iu.test(l.line)).map((l) => l.line.replace(/\x1b\[[0-9;]*m/gu, "").slice(0, 200)).slice(-12);
  console.log(JSON.stringify({ arm: ARM, results }, null, 2));

  if (ARM === "fixed") {
    const A = results.A, B = results.B, C = results.C;
    assert.equal(A.steer.reachedFakeCli, true, "A: steer reached the running Claude process");
    assert.equal(A.steer.phaseAtFakeCli, "tool", "A: steer arrived while the tool ran");
    assert.match(A.fakeResults.at(-1), /consumed=2: MAIN-A \| STEER-A/u, "A: one Claude turn consumed both");
    assert.ok(A.assistantTexts.some((t) => /MAIN-A \| STEER-A/u.test(t)), "A: the reply names the steer");
    assert.equal(B.steer.reachedFakeCli, true, "B: steer reached the running Claude process");
    assert.equal(B.steer.phaseAtFakeCli, "answer", "B: steer arrived during the final answer");
    assert.ok(B.assistantTexts.some((t) => /MAIN-B/u.test(t) && /STEER-B/u.test(t)), "B: the run's reply holds both results");
    assert.ok(C.assistantTexts.at(-1)?.includes("consumed=1: MAIN-C"), "C: the next turn is clean");
    assert.ok(!/STEER/u.test(C.assistantTexts.at(-1) ?? ""), "C: nothing from B leaked into C");
    assert.equal(fakeProcesses, 1, "one live Claude process served all turns");
    console.log("PASS");
  } else {
    assert.equal(results.A.steer?.reachedFakeCli && results.A.steer.phaseAtFakeCli === "tool", false, "baseline: steer never reached the running tool phase");
    console.log("BASELINE recorded");
  }
} finally {
  await stopGateway();
}
