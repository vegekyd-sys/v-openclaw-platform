// Candidate test: a /vcc turn waiting on a working foreground Agent subagent must not be reclaimed.
//
// V 2026-11-25 16:29: two foreground Agent calls worked for 16 minutes, the Gateway only saw
// tool:Agent:started, and the diagnostic heartbeat aborted the turn at the 900 s blocked-tool floor
// ("This turn was interrupted because it stopped making progress"). cli-subagent-progress-v1 turns
// Claude subagent records (parent_tool_use_id) into progress of the open parent tool.
//
// Shared VLab has no Claude login, so `claude` is lab/candidate/fake-claude-subagent.mjs: it speaks the
// Agent SDK stream-json protocol and replays one foreground Agent call as Claude Code streams it, the
// subagent's records carrying parent_tool_use_id, CSP_TICKS Bash calls of CSP_SLEEP seconds each
// (default 8 x 140 s, past the 900 s floor). Everything else is real: Gateway, the claude-cli harness
// through the Agent SDK plugin (SDK 0.3.241, as on V), the stream parser, the diagnostic heartbeat and
// its stuck-session recovery. Gaps over 120 s keep the stall warnings coming, so their lastProgress shows
// which signal the heartbeat saw.
//
// CSP_ARM=baseline  V's bytes: the failure path must be hit (warnings with lastProgress=tool:Agent:started,
//                   stuck session recovery aborts after >= 900 s, the stand-in is stopped mid-subagent).
// CSP_ARM=fixed     patched bytes: no recovery, the warnings name tool:Agent:subagent_activity, the
//                   stand-in finishes every tick past the floor and the reply is delivered.
//
// Both arms add a log-only probe to this run's private runtime copy that counts the parent_tool_use_id
// records the parser receives. Channels and cron are cleared so the private Gateway cannot take events
// from shared VLab. Run the arms one after the other.

import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const arm = process.env.CSP_ARM ?? "fixed";
assert(["baseline", "fixed"].includes(arm));
const model = process.env.CSP_MODEL ?? "anthropic/claude-opus-5-5"; // production /vcc
const ticks = Number(process.env.CSP_TICKS ?? 8);
const sleepSecs = Number(process.env.CSP_SLEEP ?? 140);
const FLOOR_MS = 900_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache", "claude-cli"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---- the bytes under test ----
const EXPECTED = {
  baseline: {
    "cli-live-session-registry-Bux1JHPe.js": "c296fab87b3fad58b39d5f97544f16581c11a4e94d629dcdb8c2b3de795f46d5",
    "execute.runtime-DRmvah87.js": "1c8902ac292d49a7e1d98d335972267c1b0bda5571582783084541bef5a5a836",
  },
  fixed: {
    "cli-live-session-registry-Bux1JHPe.js": "83fe2b9f43ec2d5f98e95fe00db477e4f6a22e9f94e2ab5fed12cf2b301c9a98",
    "execute.runtime-DRmvah87.js": "2cb9b0e9ba7706db85dd322a3b98e48740cfbe68c2db283a0046778ef6b419d5",
  },
}[arm];
const bytes = {};
for (const [name, want] of Object.entries(EXPECTED)) {
  bytes[name] = sha256(fs.readFileSync(path.join(dist, name)));
  assert.equal(bytes[name], want, `${arm}: ${name} is not the expected bytes`);
}

// ---- log-only probe: subagent records seen by the stream parser ----
{
  const file = path.join(dist, "cli-live-session-registry-Bux1JHPe.js");
  const src = fs.readFileSync(file, "utf8");
  const anchor = "\tconst handleParsedRecord = (parsed) => {\n\t\tif (parseErrorText) return;\n";
  assert.equal(src.split(anchor).length, 2, "probe anchor");
  const probe = `${anchor}\t\tif (parsed && parsed.parent_tool_use_id != null) { const n = globalThis.__cspSubRecords = (globalThis.__cspSubRecords ?? 0) + 1; if (n === 1 || n % 25 === 0) console.error(\`[csp-probe] subagent record #\${n} parent=\${parsed.parent_tool_use_id} type=\${parsed.type}\`); }\n`;
  fs.writeFileSync(file, src.replace(anchor, probe));
}

// ---- the stand-in claude, private to this run ----
const cliBin = path.join(scratch, "fake-claude-bin");
fs.mkdirSync(cliBin, { recursive: true });
const fakeScript = path.resolve("lab/candidate/fake-claude-subagent.mjs");
assert(fs.existsSync(fakeScript), "fake claude script missing");
const fakeLog = path.join(scratch, "fake-claude.jsonl");
// The harness may hand the child a filtered environment, so the stand-in's settings live in the wrapper.
fs.writeFileSync(path.join(cliBin, "claude"), [
  "#!/bin/sh",
  `export FAKE_TICKS=${ticks} FAKE_SLEEP=${sleepSecs} FAKE_LOG=${JSON.stringify(fakeLog)}`,
  `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeScript)} "$@"`,
  "",
].join("\n"), { mode: 0o755 });
const baseEnv = {
  ...process.env,
  PATH: `${cliBin}:${process.env.PATH}`,
  DISABLE_AUTOUPDATER: "1",
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", // as on V (PR #74)
  FAKE_TICKS: String(ticks),
  FAKE_SLEEP: String(sleepSecs),
  FAKE_LOG: fakeLog,
};
const version = execFileSync(path.join(cliBin, "claude"), ["--version"], { env: baseEnv, encoding: "utf8" }).trim();

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
// Managed npm plugins (codex etc.) come from shared VLab; a missing one makes plugin verification try
// an install through the shared npm cache, which this user cannot write.
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}

const env = { ...baseEnv, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_PATH_BOOTSTRAPPED: "1", npm_config_cache: path.join(scratch, "cache", "npm") };

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
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
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

function claudeChildren() {
  const out = [];
  const walk = (pid) => {
    let kids = "";
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8"); } catch { return; }
    for (const k of kids.trim().split(/\s+/u).filter(Boolean)) {
      let args = [];
      try { args = fs.readFileSync(`/proc/${k}/cmdline`, "utf8").split("\0"); } catch { continue; }
      if (args.includes("--output-format") && args.some((a) => /claude/u.test(a))) {
        out.push({ pid: Number(k), fake: args.some((a) => a.endsWith("fake-claude-subagent.mjs")), sdk: args.includes("--input-format") && args.includes("stream-json") });
      }
      walk(k);
    }
  };
  walk(gateway.pid);
  return out;
}

function fakeTimeline(since) {
  let rows = [];
  try { rows = fs.readFileSync(fakeLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch {}
  return rows.filter((r) => r.at >= since).map(({ at, sinceStartSec, ...r }) => ({ atSec: Math.round((at - since) / 1000), ...r }));
}

const marker = `CSP-${arm}-${Date.now()}`;
const PROMPT = `这是一次自动化测试（${marker}）。stand-in claude 会回放一次前台 Agent 调用。`;

async function runTurn() {
  const sessionKey = `agent:makaron:feishu:direct:ou_csp_${arm}_${Date.now()}`;
  const started = Date.now();
  const child = spawn(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", model, "--message", PROMPT, "--json", "--timeout", String(ticks * sleepSecs + 900),
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const seen = new Map();
  const poll = setInterval(() => { for (const c of claudeChildren()) seen.set(c.pid, c); }, 2_000);
  const exit = await new Promise((resolve) => child.on("close", resolve));
  clearInterval(poll);
  const returnedAt = Date.now();
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  const fake = fakeTimeline(started);
  const sinceStart = (l) => Math.round((l.at - started) / 1000);
  const log = lines.filter((l) => l.at >= started);
  const stalls = log.filter((l) => /stalled session:/u.test(l.line) && l.line.includes(sessionKey)).map((l) => ({
    atSec: sinceStart(l),
    reason: l.line.match(/ reason=(\S+)/u)?.[1],
    lastProgress: l.line.match(/ lastProgress=(\S+)/u)?.[1],
    lastProgressAge: l.line.match(/ lastProgressAge=(\S+)/u)?.[1],
    activeToolAge: l.line.match(/ activeToolAge=(\S+)/u)?.[1],
  }));
  const recoveries = log.filter((l) => /stuck session recovery|stale takeover/u.test(l.line)).map((l) => ({ atSec: sinceStart(l), line: redact(l.line).slice(0, 260) }));
  const probe = log.filter((l) => /\[csp-probe\]/u.test(l.line)).map((l) => ({ atSec: sinceStart(l), line: l.line.slice(l.line.indexOf("[csp-probe]"), l.line.indexOf("[csp-probe]") + 120) }));
  const reply = String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.map((p) => p.text).join("\n") ?? "").slice(0, 300);
  return {
    sessionKey, exit, secs: Math.round((returnedAt - started) / 1000),
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model } : null,
    reply,
    claude: [...seen.values()],
    fake: fake.filter((r) => !["sub_tool_use", "sub_tool_result"].includes(r.event) || r.n === 1 || r.n === ticks),
    fakeSubRecords: Math.max(0, ...fake.map((r) => r.subRecords ?? 0)),
    stalls, recoveries, probe,
    stderr: exit === 0 ? undefined : redact(stderr).slice(-800),
  };
}

startGateway();
let result;
try {
  await connectGateway();
  result = await runTurn();
  const summary = { arm, claude: version, model, ticks, sleepSecs, bytes, result };
  console.log(JSON.stringify(summary, null, 1));

  assert(result.claude.length > 0 && result.claude.every((c) => c.fake && c.sdk), `Gateway did not run the stand-in through the SDK: ${JSON.stringify(result.claude)}`);
  const ev = (name) => result.fake.filter((r) => r.event === name);
  assert(ev("control_request").some((r) => r.subtype === "initialize"), "no SDK initialize handshake");
  assert.equal(ev("agent_tool_use").length, 1, "the Agent call was not replayed");
  assert(ev("can_use_tool").every((r) => r.behavior === "allow"), `OpenClaw denied Agent: ${JSON.stringify(ev("can_use_tool"))}`);
  // the SDK stream carries the subagent's records to OpenClaw's parser
  assert(result.probe.length > 0, "the stream parser received no record with parent_tool_use_id");

  if (arm === "baseline") {
    assert(result.stalls.some((s) => s.lastProgress === "tool:Agent:started" && Number.parseInt(s.lastProgressAge) >= 300),
      "baseline warnings did not show the frozen tool:Agent:started");
    const abort = result.recoveries.find((r) => /stuck session recovery:.*aborted=true/u.test(r.line));
    assert(abort, "baseline was not reclaimed: the failure path was not reproduced");
    assert(abort.atSec * 1000 >= FLOOR_MS, `baseline reclaimed before the floor (${abort.atSec}s)`);
    assert.equal(ev("turn_done").length, 0, "baseline subagent finished although the turn was reclaimed");
    assert(ev("signal").length + ev("stdin_closed").length + ev("turn_interrupted").length > 0, "the stand-in was not stopped");
  } else {
    assert.equal(result.recoveries.filter((r) => /stuck session recovery:/u.test(r.line)).length, 0, "fixed turn was reclaimed");
    assert(result.stalls.every((s) => s.lastProgress !== "tool:Agent:started" || Number.parseInt(s.lastProgressAge) < 300),
      "the heartbeat still saw only tool:Agent:started");
    assert(result.stalls.some((s) => s.lastProgress === "tool:Agent:subagent_activity"), "no warning named tool:Agent:subagent_activity (hook never fired?)");
    const done = ev("turn_done")[0];
    assert(done && done.atSec * 1000 > FLOOR_MS, `subagent did not finish past the floor: ${JSON.stringify(done)}`);
    assert.equal(result.exit, 0, "openclaw agent failed");
    assert(/SUB-DONE/u.test(result.reply), `reply not delivered: ${result.reply}`);
  }
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
