// Candidate end-to-end for skill-workshop-agent-apply-v1 (lab/patch-skill-workshop-agent-apply.mjs).
//
// A private Gateway with V's routing: deepseek-flash turns run in vlab-worker,
// /vds (Codex harness + DeepSeek) runs in the Gateway. The workspace gets three
// skills that no Workshop create proposal claims, as most of V's skills:
//   A  hand-written, updated from a Worker turn
//   B  hand-written, updated from a /vds (Codex) turn
//   C  composite (COMPOSITE.json, like makaron / scene-cli)
// Each turn asks the agent to update its skill through skill_workshop and apply it.
// The Worker turn also makes >= 10 model iterations, so the Skill Workshop experience
// review is scheduled inside the Worker after it.
//
// SW_EXPECT=baseline  V's bytes: A and B fail with "does not own this skill path",
//                     the Worker review fails with "Worker native attempt is no
//                     longer active" (V 10/26: 87 of 91 review failures)
// SW_EXPECT=fixed     release files: A and B applied by the agent (actor agent),
//                     C still refused, the Worker review runs a model call and ends
//                     without error
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const expect = process.env.SW_EXPECT ?? "fixed";
assert(["fixed", "baseline"].includes(expect));
const REVIEW_WAIT_MS = Number(process.env.SW_REVIEW_WAIT_MS ?? 240_000);
const FLASH = "deepseek/deepseek-flash";
const VDS = "deepseek/vds-deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), expect, notes: [] };
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

// ---------------------------------------------------------------- bytes under test
const V_BYTES = {
  "openclaw/dist/service-query-Bt8YN8NM.js": "2d2689ef3d30db33f1af19b60ba514603e1e7849150374c75bbdb6452c3291f8",
  "openclaw/dist/openclaw-tools-BODVdJQD.js": "4bed21d8039c6d825e70100615329d03c2ede065249ff61a0c503e83d432a754",
  "openclaw/dist/experience-review-default-Dr4f0pMZ.js": "798e630be141634dc0c6fc42ecffcbc545e805ad2dea197394a7041dcd77d61b",
  "production-worker/native-attempt-bridge.mjs": "0429d15e7793b3700b877f4ee6200eedb3f5ad484e79425935563edde958f2fa",
};
summary.bytes = {};
for (const [rel, vSha] of Object.entries(V_BYTES)) {
  const body = fs.readFileSync(path.join(runtime, rel), "utf8");
  const state = sha256(body) === vSha ? "V" : body.includes("skill-workshop-agent-apply-v1") ? "patched" : "other";
  summary.bytes[rel] = state;
  assert.equal(state, expect === "baseline" ? "V" : "patched", `${rel} is ${state}`);
}

// ---------------------------------------------------------------- private config as on V
const flashEntry = {
  id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000, maxTokens: 384000, api: "openai-completions",
  compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" },
};
function asProduction(config, runtimeId) {
  const deepseek = config.models.providers.deepseek;
  deepseek.models = (deepseek.models ?? []).filter((m) => m.id !== flashEntry.id && m.id !== "vds-deepseek-flash")
    .concat([flashEntry, { ...flashEntry, id: "vds-deepseek-flash", name: "DeepSeek V4.1 Flash (Codex vds alias)" }]);
  const model = { primary: FLASH, fallbacks: [] };
  const flash = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  const vds = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
  config.agents.defaults.model = model;
  Object.assign((config.agents.defaults.models ??= {}), { [FLASH]: flash, [VDS]: vds });
  config.agents.entries.makaron.model = model;
  Object.assign((config.agents.entries.makaron.models ??= {}), { [FLASH]: flash, [VDS]: vds });
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow)) for (const m of [FLASH, VDS]) if (!allow.includes(m)) allow.push(m);
  // V: skills.workshop approvalPolicy auto (no approval card), autonomous mode default (auto).
  config.skills = { ...(config.skills ?? {}), workshop: { ...(config.skills?.workshop ?? {}), approvalPolicy: "auto" } };
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { ...(config.plugins.entries.codex?.config?.appServer ?? {}), mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(token);
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Codex plugin and DeepSeek provider for /vds, as codex-announce-timeout.mjs.
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
{
  const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- skills nobody's Workshop created
const workspace = config.agents.entries.makaron.workspace ?? path.join(data, "workspace", "makaron");
const tag = crypto.randomBytes(3).toString("hex");
const skill = (letter) => `sw-${letter}-${tag}`;
const desc = (letter) => `Candidate test skill ${letter} ${tag}; only for skill-workshop-agent-apply.`;
const tokenFor = (letter) => `SWTOKEN-${letter.toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const tokens = { a: tokenFor("a"), b: tokenFor("b"), c: tokenFor("c") };
for (const letter of ["a", "b", "c"]) {
  const dir = path.join(workspace, "skills", skill(letter));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${skill(letter)}\ndescription: "${desc(letter)}"\n---\n\n# ${skill(letter)}\n\nOriginal hand-written body.\n`);
  if (letter === "c") fs.writeFileSync(path.join(dir, "COMPOSITE.json"), `${JSON.stringify({ parts: ["parts/base/SKILL.md"] })}\n`);
}
const skillBody = (letter) => fs.readFileSync(path.join(workspace, "skills", skill(letter), "SKILL.md"), "utf8");
const newContent = (letter) => `---\nname: ${skill(letter)}\ndescription: "${desc(letter)}"\n---\n\n# ${skill(letter)}\n\nUpdated body. Marker: ${tokens[letter]}\n`;

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.sw-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
env.DEEPSEEK_API_KEY = secret("DEEPSEEK_API_KEY");
assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
secrets.add(env.DEEPSEEK_API_KEY);
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
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
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
function runTurn(sessionKey, model, prompt, timeoutSecs = 600) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", model, "--message", prompt, "--json", "--timeout", String(timeoutSecs)], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    const kill = setTimeout(() => child.kill("SIGKILL"), (timeoutSecs + 90) * 1000);
    child.on("exit", (code) => {
      clearTimeout(kill);
      let meta;
      try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { /* not json */ }
      resolve({
        exit: code, secs: Math.round((Date.now() - started) / 1000), endedAt: Date.now(),
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 1200),
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
// skill_workshop calls and results from the session transcript (Gateway RPC).
async function workshopCalls(sessionKey) {
  const result = await client.request("chat.history", { agentId: "makaron", sessionKey, limit: 200 }, { timeoutMs: 20_000 });
  const out = [];
  for (const m of result?.messages ?? []) {
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (m.role === "assistant" && (b.type === "toolCall" || b.type === "tool_use") && /skill_workshop/u.test(b.name ?? "")) {
        const args = b.arguments ?? b.input ?? {};
        out.push({ call: args.action, skill: args.skill_name ?? args.proposal_id ?? args.name });
      }
    }
    if (m.role === "toolResult" && /skill_workshop/u.test(m.toolName ?? "")) {
      const text = (Array.isArray(m.content) ? m.content : []).map((b) => b.text ?? "").join(" ");
      out.push({ result: m.isError ? "error" : "ok", text: redact(text).slice(0, 300) });
    }
  }
  return out;
}
function proposals() {
  const db = new DatabaseSync(path.join(stateDir, "state", "openclaw.sqlite"), { readOnly: true });
  try {
    return db.prepare(`select p.proposal_id as id, p.kind, p.status, json_extract(p.record_json, '$.target.skillKey') as skill,
        (select json_extract(e.actor_json, '$.type') from skill_workshop_proposal_events e where e.proposal_id = p.proposal_id and e.event_type = 'applied') as appliedBy
      from skill_workshop_proposals p where json_extract(p.record_json, '$.target.skillKey') like ? order by p.created_at`).all(`sw-%-${tag}`);
  } catch (error) {
    return [{ error: String(error) }];
  } finally {
    db.close();
  }
}
const allLines = () => lines.map((l) => l.line);
function reviewEvidence(sinceMs) {
  const recent = lines.filter((l) => l.at >= sinceMs).map((l) => l.line);
  const pick = (re) => [...new Set(recent.filter((l) => re.test(l)).map((l) => redact(l).slice(0, 360)))];
  return {
    reviewFailed: pick(/skill experience review failed/u),
    workerReviewLines: pick(/^\[vlab-worker:\d+\].*skill-workshop-review/u).length,
    providerAccepted: pick(/skill-workshop-review:[^"]*".*provider-accepted|runId":"skill-workshop-review:[^"]*".*"stage":"provider-accepted"/u).length,
    reviewRunEnd: pick(/embedded run agent end: runId=skill-workshop-review:/u),
    laneErrors: pick(/lane task error: lane=skill-workshop-review/u),
  };
}

const prompt = (letter, { iterations = 0 } = {}) => [
  "这是一次自动化测试，请严格照做，不要省略步骤。",
  ...(iterations ? [`0. 先调用 exec 工具 ${iterations} 次，一次只执行一条命令，依次是 echo step-1、echo step-2 …… echo step-${iterations}。不要合并成一条，也不要并行。`] : []),
  `1. 用 skill_workshop 工具（不要用 exec 或 openclaw CLI，不要直接写文件）调用 action="update"，skill_name="${skill(letter)}"，description="${desc(letter)}"，proposal_content 逐字使用下面三个反引号之间的全文：`,
  "```",
  newContent(letter),
  "```",
  "2. 用上一步返回的 proposal id 调用 skill_workshop action=\"apply\"。",
  ...(letter === "a" ? [
    `3. 对 skill_name="${skill("c")}" 也做同样两步：action="update"，description="${desc("c")}"，proposal_content 为：`,
    "```",
    newContent("c"),
    "```",
    "   然后 action=\"apply\"。",
  ] : []),
  "最后只回复一行，格式：APPLY <每个 apply 的结果：ok 或报错原文>。任何一步报错都不要重试、不要改用其他办法。",
].join("\n");

startGateway();
try {
  await connectGateway();
  summary.gatewayStarts = gatewayStarts;

  // ---------- Worker turn: A + C, >= 10 model iterations so the review is scheduled.
  const workerKey = `agent:makaron:explicit:sw-worker-${expect}-${tag}`;
  await client.request("sessions.patch", { key: workerKey, agentId: "makaron", model: FLASH }, { timeoutMs: 30_000 });
  const w = await runTurn(workerKey, FLASH, prompt("a", { iterations: 10 }));
  summary.workerTurn = { exit: w.exit, secs: w.secs, reply: w.reply, stderr: w.stderr };
  summary.workerTurnRanInWorker = allLines().some((l) => /^\[vlab-worker:\d+\]/u.test(l));
  summary.workerCalls = await workshopCalls(workerKey);

  // The review is scheduled 30 s after the turn when the Worker is idle; keep everything quiet.
  const reviewFrom = w.endedAt - 5_000;
  const reviewDeadline = Date.now() + REVIEW_WAIT_MS;
  let ev;
  while (Date.now() < reviewDeadline) {
    await sleep(5_000);
    ev = reviewEvidence(reviewFrom);
    if (ev.reviewFailed.length > 0 || ev.reviewRunEnd.length > 0) { await sleep(5_000); ev = reviewEvidence(reviewFrom); break; }
  }
  summary.workerReview = ev;

  // ---------- /vds (Codex harness in the Gateway): B.
  const vdsKey = `agent:makaron:explicit:sw-vds-${expect}-${tag}`;
  await client.request("sessions.patch", { key: vdsKey, agentId: "makaron", model: VDS }, { timeoutMs: 30_000 });
  const v = await runTurn(vdsKey, VDS, prompt("b"));
  summary.vdsTurn = { exit: v.exit, secs: v.secs, reply: v.reply, stderr: v.stderr };
  summary.vdsCalls = await workshopCalls(vdsKey);

  summary.proposals = proposals();
  summary.skills = Object.fromEntries(["a", "b", "c"].map((l) => [skill(l), skillBody(l).includes(tokens[l]) ? "updated" : "original"]));

  // ---------- verdict
  const applied = (letter) => summary.proposals.some((p) => p.skill === skill(letter) && p.status === "applied" && p.appliedBy === "agent");
  const callText = [...summary.workerCalls, ...summary.vdsCalls].map((c) => c.text ?? "").join("\n");
  assert.equal(w.exit, 0, `worker turn failed: ${w.stderr}`);
  assert.equal(v.exit, 0, `vds turn failed: ${v.stderr}`);
  assert(summary.workerCalls.some((c) => c.call === "apply"), "the Worker turn never called skill_workshop apply");
  assert(summary.vdsCalls.some((c) => c.call === "apply"), "the /vds turn never called skill_workshop apply");
  assert.equal(summary.skills[skill("c")], "original", "the composite skill was rewritten");
  assert(/does not own this skill path/u.test(callText), "no ownership refusal was observed (composite or baseline)");
  if (expect === "baseline") {
    assert(!applied("a") && !applied("b"), `baseline applied a hand-written skill: ${JSON.stringify(summary.proposals)}`);
    assert.equal(summary.skills[skill("a")], "original");
    assert.equal(summary.skills[skill("b")], "original");
    assert(ev?.reviewFailed.some((l) => /Worker native attempt is no longer active/u.test(l)), `baseline Worker review did not fail as on V: ${JSON.stringify(ev)}`);
  } else {
    assert(applied("a"), `A (Worker) not applied by the agent: ${JSON.stringify(summary.proposals)}`);
    assert(applied("b"), `B (/vds) not applied by the agent: ${JSON.stringify(summary.proposals)}`);
    assert.equal(summary.skills[skill("a")], "updated");
    assert.equal(summary.skills[skill("b")], "updated");
    assert(/generated composite/u.test(callText), "the composite refusal does not point to install-composites");
    assert.equal(ev?.reviewFailed.length ?? 0, 0, `Worker review failed: ${JSON.stringify(ev?.reviewFailed)}`);
    assert(ev?.reviewRunEnd.length > 0 || ev?.providerAccepted > 0, `no Worker review ran: ${JSON.stringify(ev)}`);
    assert(ev?.reviewRunEnd.every((l) => !/isError=true/u.test(l)), `Worker review ended in error: ${JSON.stringify(ev?.reviewRunEnd)}`);
  }
  summary.verdict = "pass";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-120).map((l) => l.line).join("\n")).slice(-12000);
  process.exitCode = 1;
} finally {
  summary.reviewLines = [...new Set(allLines().filter((l) => /skill-workshop-review|skills\/workshop|skill_workshop failed|does not own/u.test(l) && !/registerTool|prompt-prep|bundle-prep|project-memory/u.test(l)).map((l) => redact(l).slice(0, 300)))].slice(-60);
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  await stopChild(gateway);
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
