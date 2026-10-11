// Candidate end-to-end: after a tool call, does an authored NO_REPLY stay silent, or does the
// runtime ask for a summary and send "The tool run finished, but no final summary was produced"?
//
// A private Gateway (no channels, no cron) runs the shared VLab runtime. NO_REPLY_PATCH=1 applies
// lab/patch-no-reply-after-tool.mjs to the runtime's own builtin-openclaw bytes first (so the
// test also proves the patch fits what is deployed); NO_REPLY_PATCH=0 runs them unchanged and
// must reproduce the fallback, proving the scenario reaches the bug.
//
// Each scenario is a real DeepSeek turn on a Feishu-group-shaped session key through one built-in
// runtime (V worker, in-Gateway): run `true` with exec, then answer exactly NO_REPLY. Reactions
// need a channel; they take the same path (any settled tool batch), see the 10/08 13:52 exec case.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MARKER, patchBuiltinOpenclaw } from "../patch-no-reply-after-tool.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const applyPatch = (process.env.NO_REPLY_PATCH ?? "1") === "1";
const only = (process.env.NO_REPLY_SCENARIOS ?? "worker,in-process").split(",").map((s) => s.trim()).filter(Boolean);
const repeats = Number(process.env.NO_REPLY_REPEATS ?? 2);
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const FALLBACK = "no final summary was produced";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};

// ---- the runtime's builtin-openclaw, patched or not ----
const dist = path.join(runtime, "openclaw", "dist");
// The runtime can hold stale builtin-openclaw chunks next to the live one; patch the one that
// defines the gate (exactly one must).
const builtinCandidates = fs.readdirSync(dist)
  .filter((f) => /^builtin-openclaw-[\w-]+\.js$/u.test(f))
  .filter((f) => fs.readFileSync(path.join(dist, f), "utf8").includes("function shouldTreatEmptyAssistantReplyAsSilent("));
assert.equal(builtinCandidates.length, 1, `expected one live builtin-openclaw, found ${builtinCandidates}`);
const builtinFile = path.join(dist, builtinCandidates[0]);
const builtinBefore = fs.readFileSync(builtinFile, "utf8");
assert(!builtinBefore.includes(MARKER), "runtime already carries the patch");
if (applyPatch) fs.writeFileSync(builtinFile, patchBuiltinOpenclaw(builtinBefore));
const builtin = { file: path.basename(builtinFile), beforeSha256: sha(builtinBefore), patched: fs.readFileSync(builtinFile, "utf8").includes(MARKER) };

// ---- private config: no channels, no cron, V worker kept ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = fs
  .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
config.agents.entries.makaron.models ??= {};
config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"] = {
  ...config.agents.entries.makaron.models["deepseek/deepseek-v4-pro"],
  agentRuntime: { id: "openclaw" },
};
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const ref of ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"]) if (!allow.includes(ref)) allow.push(ref);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Shared VLab loads its managed plugins (Codex, Feishu…) from state/npm; without a copy the
// private Gateway tries to install them and refuses to start.
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  npm_config_cache: path.join(scratch, "cache", "npm"),
};
for (const name of ["DEEPSEEK_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
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

const PROMPT = [
  "这是一次自动化测试，请严格照做，不要解释。",
  "第一步：用 exec 工具运行命令 true。",
  "第二步：命令成功后，你这一轮的最终回答必须且只能是 NO_REPLY 这 8 个字符（表示不在群里说话），不要输出任何其他文字。",
].join("");

const SCENARIOS = {
  worker: { model: "deepseek/deepseek-v4-flash" },
  "in-process": { model: "deepseek/deepseek-v4-pro" },
};

async function transcript(sessionKey) {
  try {
    const res = await client.request("chat.history", { sessionKey, limit: 40 });
    return (res?.messages ?? []).filter((m) => m.role === "assistant").map((m) => {
      const c = Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content ?? "") }];
      return {
        model: m.model,
        texts: c.filter((b) => b.type === "text").map((b) => b.text.slice(0, 120)),
        tools: c.filter((b) => b.type === "toolCall").map((b) => b.name),
      };
    });
  } catch (error) {
    return { error: String(error?.message ?? error).slice(0, 200) };
  }
}

// chat.history hides NO_REPLY turns; read the transcript to see what the model actually wrote.
async function authoredNoReply(sessionKey) {
  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const node = db.prepare("select current_session_id as id from session_nodes where session_key = ?").get(sessionKey);
    if (!node) return 0;
    let count = 0;
    for (const { event_json } of db.prepare("select event_json from transcript_events where session_id = ? order by seq").all(node.id)) {
      const m = JSON.parse(event_json).message ?? {};
      if (m.role !== "assistant" || m.model === "delivery-mirror" || !Array.isArray(m.content)) continue;
      if (m.content.some((b) => b.type === "text" && b.text.trim() === "NO_REPLY")) count += 1;
    }
    return count;
  } finally {
    db.close();
  }
}

async function runTurn(name, i) {
  const scenario = SCENARIOS[name];
  const sessionKey = `agent:makaron:feishu:group:oc_noreply_${name.replace(/\W/gu, "_")}_${Date.now()}_${i}`;
  const mark = lines.length;
  const started = Date.now();
  const r = spawnSync(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", scenario.model, "--message", PROMPT, "--json", "--timeout", "300",
  ], { env, encoding: "utf8", timeout: 360_000, maxBuffer: 64 * 1024 * 1024 });
  await sleep(1_500);
  let meta;
  try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
  const runLog = lines.slice(mark).map((l) => l.line).filter((l) => /settled|finalization|lacked a final answer/iu.test(l)).map((l) => redact(l).slice(0, 260));
  const history = await transcript(sessionKey);
  const historyText = JSON.stringify(history);
  return {
    name,
    i,
    sessionKey,
    exit: r.status,
    secs: Math.round((Date.now() - started) / 1000),
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime } : null,
    payloads: payloads.map((p) => String(p?.text ?? "").slice(0, 160)),
    authoredNoReply: await authoredNoReply(sessionKey),
    ranExec: Array.isArray(history) && history.some((m) => m.tools.some((t) => /exec|bash/iu.test(t))),
    askedForSummary: runLog.some((l) => /lacked a final answer/u.test(l)),
    sentFallback: payloads.some((p) => String(p?.text ?? "").includes(FALLBACK)) || historyText.includes(FALLBACK),
    runLog: runLog.slice(-6),
    history,
    stderr: r.status === 0 ? undefined : redact(`${r.stderr}`).slice(-800),
  };
}

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  const results = [];
  for (const name of only) for (let i = 0; i < repeats; i += 1) results.push(await runTurn(name, i));
  console.log(JSON.stringify({ applyPatch, builtin, readyMs: Date.now() - startedAt, results }, null, 1));
  const covered = results.filter((r) => r.ranExec);
  assert(covered.length > 0, "no turn ran the command; the scenario exercised nothing");
  const silent = covered.filter((r) => r.authoredNoReply > 0);
  assert(silent.length > 0, "the model never answered NO_REPLY; the scenario exercised nothing");
  if (applyPatch) {
    for (const r of silent) {
      assert.equal(r.askedForSummary, false, `${r.name}#${r.i}: runtime still asked for a summary`);
      assert.equal(r.sentFallback, false, `${r.name}#${r.i}: fallback text was produced`);
      assert(r.payloads.every((p) => !p.trim() || /^\s*NO_REPLY\s*$/u.test(p)), `${r.name}#${r.i}: visible reply ${JSON.stringify(r.payloads)}`);
    }
  } else {
    assert(silent.some((r) => r.askedForSummary && r.sentFallback), "unpatched runtime did not reproduce the fallback");
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
