// Candidate test: a Claude Code background subagent must not hold a /vcc reply.
//
// Production incident 2026-09-27 23:14: under the claude-cli harness Claude
// Code launched its Agent tool with run_in_background=true, wrote a complete
// reply 8 s later (stop=end_turn), and OpenClaw never delivered it. The bridge
// delivers on the CLI's terminal result, which Claude Code withholds while a
// background task is alive; after 373 s without progress the stuck-session
// recovery aborted the run and the finished reply was lost.
//
// OpenClaw already passes --disallowedTools "Bash(run_in_background:true)" and
// friends, but not the Agent tool's background mode. The fix under test is
// Claude Code's own switch, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, set in the
// Gateway environment that every claude child inherits.
//
// VCC_BG_EXPECT=held   baseline: the failure path must reproduce (async launch,
//                      reply held for most of the background task)
// VCC_BG_EXPECT=prompt fixed:    the switch reaches the claude process, nothing
//                      runs in the background, the reply is delivered promptly
//
// Channels and cron are cleared so the private Gateway cannot take Feishu
// events from shared VLab.

import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const expect = process.env.VCC_BG_EXPECT ?? "prompt";
assert(["held", "prompt"].includes(expect));
const fix = process.env.VCC_BG_FIX === "1";
const claudeVersion = process.env.VCC_CLAUDE_VERSION ?? "2.1.280"; // production V
const model = process.env.VCC_MODEL ?? "anthropic/claude-opus-5-5"; // production /vcc
const sleepSecs = Number(process.env.VCC_BG_SLEEP ?? 60);
const SWITCH = "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache", "claude-cli"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---- the production Claude Code version, private to this run ----
const cliDir = path.join(scratch, "claude-cli");
const npm = path.join(path.dirname(process.execPath), "npm");
const install = spawnSync(npm, ["install", "--prefix", cliDir, "--no-audit", "--no-fund", `@anthropic-ai/claude-code@${claudeVersion}`],
  { encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(scratch, "cache", "npm") }, timeout: 600_000 });
assert.equal(install.status, 0, `claude-code install failed: ${redact(install.stderr).slice(-600)}`);
const cliBin = path.join(cliDir, "node_modules", ".bin");
const home = process.env.HOME;
const baseEnv = {
  ...process.env,
  PATH: `${cliBin}:${process.env.PATH}`,
  DISABLE_AUTOUPDATER: "1",
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
};
delete baseEnv[SWITCH];
const version = execFileSync(path.join(cliBin, "claude"), ["--version"], { env: baseEnv, encoding: "utf8" }).trim();
assert(version.startsWith(claudeVersion), `expected Claude Code ${claudeVersion}, got ${version}`);
const auth = JSON.parse(execFileSync(path.join(cliBin, "claude"), ["auth", "status", "--json"], { env: baseEnv, encoding: "utf8" }));
assert.equal(auth.loggedIn, true, `claude is not logged in under HOME=${home}`);

// ---- private config: no channels, no cron, production /vcc entry ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs
    .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.agents.entries.makaron.models ??= {};
config.agents.entries.makaron.models[model] = { params: { thinking: "high" }, agentRuntime: { id: "claude-cli" } };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(model)) allow.push(model);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// OpenClaw's startup PATH bootstrap puts its trusted dirs (and so /usr/bin)
// ahead of ours, and the claude-cli backend has no command override -- it
// spawns "claude" from PATH. Marking PATH as already bootstrapped keeps the
// private production-version CLI first.
const env = { ...baseEnv, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_PATH_BOOTSTRAPPED: "1" };
if (fix) env[SWITCH] = "1";

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
    });
  }
}

let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) {
        startGateway();
        continue;
      }
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

// ---- the claude child the Gateway spawns: path and whether the switch reached it ----
function claudeChildren() {
  const out = [];
  const walk = (pid) => {
    let kids = "";
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8"); } catch { return; }
    for (const k of kids.trim().split(/\s+/u).filter(Boolean)) {
      let args = [];
      try { args = fs.readFileSync(`/proc/${k}/cmdline`, "utf8").split("\0"); } catch { continue; }
      if (args.includes("--output-format") && args.some((a) => /claude/u.test(a))) {
        let names = [];
        try { names = fs.readFileSync(`/proc/${k}/environ`, "utf8").split("\0").map((e) => e.split("=")[0]); } catch {}
        const i = args.indexOf("--disallowedTools");
        out.push({ pid: Number(k), exe: args[0], hasSwitch: names.includes(SWITCH), disallowed: i >= 0 ? args[i + 1] : null });
      }
      walk(k);
    }
  };
  walk(gateway.pid);
  return out;
}

// ---- Claude Code's own transcript for this turn ----
function transcriptFor(marker, since) {
  const root = path.join(home, ".claude", "projects");
  const files = [];
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const d = path.join(root, dir);
    let names = [];
    try { names = fs.readdirSync(d).filter((n) => n.endsWith(".jsonl")); } catch { continue; }
    for (const f of names) {
      const p = path.join(d, f);
      if (fs.statSync(p).mtimeMs >= since && fs.readFileSync(p, "utf8").includes(marker)) files.push(p);
    }
  }
  return files;
}

function analyse(file) {
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const at = (r) => Date.parse(r.timestamp ?? "");
  const r = { agentCalls: [], asyncLaunched: false, endTurnAt: null, endTurnText: null, notificationAt: null };
  for (const row of rows) {
    const content = row.message?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "tool_use" && b.name === "Agent") r.agentCalls.push({ at: at(row), background: b.input?.run_in_background ?? null });
        if (b.type === "tool_result" && /Async agent launched/u.test(JSON.stringify(b.content))) r.asyncLaunched = true;
      }
      if (row.type === "assistant" && row.message?.stop_reason === "end_turn" && r.endTurnAt === null) {
        r.endTurnAt = at(row);
        r.endTurnText = content.filter((b) => b.type === "text").map((b) => b.text).join("").slice(0, 120);
      }
    } else if (typeof content === "string" && content.includes("<task-notification>") && r.notificationAt === null) {
      r.notificationAt = at(row);
    }
  }
  return r;
}

const marker = `VCCBG-${Date.now()}`;
const PROMPT = [
  `这是一次自动化测试（${marker}），请严格照做。`,
  // Claude Code refuses a bare foreground `sleep N`, and OpenClaw refuses
  // background Bash, so the subagent waits inside Python instead.
  `第一步：调用 Agent 工具启动一个子 agent，参数 run_in_background 设为 true，让子 agent 用 Bash 在前台执行 \`python3 -c "import time; time.sleep(${sleepSecs}); print('sub-done')"\`。`,
  "第二步：子 agent 启动后，你立刻只回复一行：已启动。不要等待子 agent 完成，也不要做别的事。",
].join("");

async function runTurn() {
  const sessionKey = `agent:makaron:feishu:direct:ou_vccbg_${Date.now()}`;
  const started = Date.now();
  const child = spawn(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", model, "--message", PROMPT, "--json", "--timeout", "900",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const seen = new Map();
  const poll = setInterval(() => { for (const c of claudeChildren()) seen.set(c.pid, c); }, 1_000);
  const exit = await new Promise((resolve) => child.on("close", resolve));
  clearInterval(poll);
  const returnedAt = Date.now();
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  const files = transcriptFor(marker, started);
  const t = files.length ? analyse(files[0]) : null;
  return {
    sessionKey, exit, secs: Math.round((returnedAt - started) / 1000),
    // this build reports the harness as the provider id ("claude-cli")
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model,
      harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime ?? (agentMeta.provider === "claude-cli" ? "claude-cli" : undefined) } : null,
    reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 200),
    claude: [...seen.values()],
    transcript: t && {
      files: files.map((f) => path.basename(f)),
      agentCalls: t.agentCalls.map((c) => ({ atSec: Math.round((c.at - started) / 1000), background: c.background })),
      asyncLaunched: t.asyncLaunched,
      endTurnSec: t.endTurnAt && Math.round((t.endTurnAt - started) / 1000),
      endTurnText: t.endTurnText,
      notificationSec: t.notificationAt && Math.round((t.notificationAt - started) / 1000),
    },
    heldMs: t?.endTurnAt ? returnedAt - t.endTurnAt : null,
    transcriptFiles: files,
    stderr: exit === 0 ? undefined : redact(stderr).slice(-800),
  };
}

startGateway();
let result;
try {
  await connectGateway();
  result = await runTurn();
  const summary = { expect, fix, claudeVersion: version, model, sleepSecs, result: { ...result, transcriptFiles: undefined } };
  console.log(JSON.stringify(summary, null, 1));

  assert.equal(result.exit, 0, "openclaw agent failed");
  assert.equal(result.ran?.harness, "claude-cli", `turn did not run on the claude-cli harness: ${JSON.stringify(result.ran)}`);
  assert(result.claude.length > 0, "no claude child was observed under the Gateway");
  assert(result.claude.every((c) => c.exe.startsWith(cliDir)),
    `Gateway spawned ${result.claude.map((c) => c.exe).join(", ")}, not the Claude Code ${claudeVersion} under test`);
  assert(result.transcript, "Claude Code transcript for this turn was not found");
  assert(result.transcript.agentCalls.length > 0, "model never called the Agent tool; the scenario exercised nothing");

  if (expect === "held") {
    // the failure path must actually be triggered, or this baseline proves nothing
    assert(result.claude.every((c) => !c.hasSwitch), "baseline claude unexpectedly had the switch");
    assert.equal(result.transcript.asyncLaunched, true, "baseline did not launch a background agent");
    assert(result.heldMs >= sleepSecs * 600, `baseline reply was not held (held ${result.heldMs} ms)`);
  } else {
    assert(result.claude.every((c) => c.hasSwitch), `${SWITCH} did not reach the claude process`);
    assert.equal(result.transcript.asyncLaunched, false, "a background agent was still launched with the switch set");
    assert(result.heldMs !== null && result.heldMs < 10_000, `reply held ${result.heldMs} ms after end_turn`);
    assert(result.reply.length > 0, "no reply was delivered");
  }
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  // this turn's transcripts live in the shared HOME; leave nothing behind
  for (const f of result?.transcriptFiles ?? []) { try { fs.rmSync(f); } catch {} }
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
