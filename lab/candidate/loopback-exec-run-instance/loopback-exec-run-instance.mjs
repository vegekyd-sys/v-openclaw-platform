// Candidate test: a /vcc (claude-cli) cron whose job carries an explicit tool list with `exec`
// (V's 十二家 0a46c5c9: message, memory_search, memory_get, exec) can run OpenClaw's exec over the
// MCP loopback while the secret egress proxy is on, as on V.
//
// V 2026-11-06..08: every such call, even `echo ok`, returned "Secret egress proxy requires an
// admitted agent run instance": the loopback built that exec without the grant's admitted run.
//
// VLab has no Claude subscription, so the private Gateway runs claude-cli against fake-claude.mjs,
// which reads the --mcp-config OpenClaw passes and calls tools/call exec over the loopback.
// Everything on the OpenClaw side is real: the cron row, cron.run -> isolated run -> claude-cli ->
// MCP grant -> loopback tool resolution -> exec -> secret egress registration.
// The shared VLab config has no secrets.egressProxy; this candidate turns it on like V.
//
// ARM=fixed expects the exec to succeed and write the proof file.
// ARM=baseline records today's behaviour: the egress error, no file.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const ARM = process.env.ARM ?? "fixed";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const work = fs.mkdtempSync(path.join(stateDir, "loopback-exec-"));
const proof = path.join(work, "proof.txt");
const fakeLog = path.join(work, "fake-claude.jsonl");

const binDir = process.env.FAKE_CLAUDE_BIN;
assert(binDir && path.isAbsolute(binDir), "FAKE_CLAUDE_BIN is required");
assert.equal(fs.readFileSync(path.join(path.dirname(binDir), "fake-claude.mjs"), "utf8"), fs.readFileSync(path.resolve("lab/candidate/loopback-exec-run-instance/fake-claude.mjs"), "utf8"), "installed fake differs from the reviewed one");

// ---- configuration: makaron -> claude-opus-5-5 on claude-cli (/vcc), cron on, no channels ----
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
  config.cron = { ...(config.cron ?? {}), enabled: true };
  // V runs with the secret egress proxy; the shared VLab config does not.
  config.secrets = { ...(config.secrets ?? {}), egressProxy: { ...(config.secrets?.egressProxy ?? {}), enabled: true } };
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

// ---- private state: no snapshot job may fire in this candidate ----
// The candidate copies no databases unless a plan asks; then the Gateway creates a fresh state
// database and there are no snapshot jobs to disable.
const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
function editJobs(edit) {
  const db = new DatabaseSync(stateDb);
  try {
    const rows = db.prepare("SELECT store_key, job_id, job_json FROM cron_jobs").all();
    const update = db.prepare("UPDATE cron_jobs SET enabled = ?, owner_agent_id = ?, job_json = ? WHERE store_key = ? AND job_id = ?");
    let changed = 0;
    for (const row of rows) {
      const job = JSON.parse(row.job_json);
      if (edit(job, row.job_id) === false) continue;
      update.run(job.enabled ? 1 : 0, job.owner?.agentId ?? null, JSON.stringify(job), row.store_key, row.job_id);
      changed += 1;
    }
    return changed;
  } finally { db.close(); }
}
const disabled = fs.existsSync(stateDb) ? editJobs((job) => { if (!job.enabled) return false; job.enabled = false; }) : 0;

// ---- private Gateway (same namespace overlay as vcc-steer: the fake replaces Claude Code) ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), PATH: `${binDir}:${process.env.PATH ?? "/usr/bin:/bin"}`, FAKE_CLAUDE_LOG: fakeLog };
const lines = [];
let gateway, client;
const SERVICE_USER = "lab-db91-parity";
const REAL_CLAUDE_EXE = fs.realpathSync("/usr/bin/claude");
const FAKE_CLAUDE_EXE = fs.realpathSync(path.join(binDir, "claude"));
assert.notEqual(REAL_CLAUDE_EXE, FAKE_CLAUDE_EXE);
function startGateway() {
  const gatewayArgv = [process.execPath, "--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)];
  assert.equal(process.getuid?.(), 0, "run this candidate with the admin identity (no plan user)");
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
  for (let i = 0; i < 90 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  for (let i = 0; i < 20 && gateway.exitCode === null; i += 1) await sleep(500);
}
const fakeRecords = () => fs.existsSync(fakeLog) ? fs.readFileSync(fakeLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
async function waitFor(predicate, ms, label) {
  const until = Date.now() + ms;
  while (Date.now() < until) { const hit = await predicate(); if (hit) return hit; await sleep(250); }
  throw new Error(`timed out waiting for ${label}\nfake: ${JSON.stringify(fakeRecords().slice(-6))}\n${redact(lines.filter((l) => /cron|cli |claude/iu.test(l.line)).slice(-40).map((l) => l.line).join("\n"))}`);
}

const OWNER = "agent:makaron:feishu:group:oc_5afced473a29eb6f5fed3ba9966aa9ff";
const TOOLS = ["message", "memory_search", "memory_get", "exec"];
const result = { arm: ARM, disabledSnapshotJobs: disabled };
try {
  // 1. Create the job row through the real API, then give it V's eb525073 shape offline.
  startGateway();
  await connectGateway();
  const added = await client.request("cron.add", {
    name: "loopback-exec-run-instance candidate",
    agentId: "makaron",
    enabled: false,
    schedule: { kind: "at", at: "2030-01-01T00:00:00.000Z" },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: { kind: "agentTurn", model: REF, timeoutSeconds: 300, message: `MCP-EXEC:${proof} 用 exec 把 ok 写进这个文件。`, toolsAllow: TOOLS },
    delivery: { mode: "none" },
  });
  const jobId = added?.id ?? added?.job?.id;
  assert(jobId, `cron.add returned no id: ${JSON.stringify(added).slice(0, 300)}`);
  await stopGateway();
  const shaped = editJobs((job, id) => {
    if (id !== jobId) return false;
    job.owner = { agentId: "makaron", sessionKey: OWNER, accountId: "default" };
    job.scheduledToolPolicy = { version: 1, mode: "account", ownerSessionKey: OWNER, ownerAccountId: "default" };
  });
  assert.equal(shaped, 1, "candidate job row was not reshaped");

  // 2. Run it once.
  startGateway();
  await connectGateway();
  const listed = await client.request("cron.list", { includeDisabled: true });
  const job = (listed?.jobs ?? []).find((j) => j.id === jobId);
  result.storedJob = job && { payload: { toolsAllow: job.payload?.toolsAllow, toolsAllowIsDefault: job.payload?.toolsAllowIsDefault, model: job.payload?.model }, owner: job.owner, scheduledToolPolicy: job.scheduledToolPolicy };
  assert.deepEqual(job?.payload?.toolsAllow, TOOLS, "the job keeps its explicit tool list");
  assert.equal(job?.scheduledToolPolicy?.mode, "account", "the job keeps its account scheduled policy");
  result.run = await client.request("cron.run", { id: jobId, mode: "force" });
  const exec = await waitFor(() => fakeRecords().find((r) => r.event === "exec"), 600_000, "the fake Claude's loopback exec");
  await waitFor(() => fakeRecords().find((r) => r.event === "result"), 120_000, "the fake Claude's result");
  await sleep(3_000);
  result.argv = fakeRecords().find((r) => r.event === "argv");
  result.exec = exec;
  result.proofExists = fs.existsSync(proof);
  result.fakeResult = fakeRecords().filter((r) => r.event === "result").map((r) => r.text);
  result.runs = await client.request("cron.runs", { scope: "job", id: jobId, limit: 3 }).then((r) => (r?.entries ?? r?.runs ?? []).map((e) => ({ status: e.status, error: e.error, summary: String(e.summary ?? "").slice(0, 160) })), (e) => String(e?.message ?? e));
  result.cliLines = lines.filter((l) => /cli exec|cron:|egress|mcp/iu.test(l.line)).map((l) => redact(l.line).replace(/\x1b\[[0-9;]*m/gu, "").slice(0, 220)).slice(-10);
  console.log(JSON.stringify(result, null, 2));

  if (ARM === "fixed") {
    assert.equal(exec.isError, false, `loopback exec failed: ${exec.text}`);
    assert.equal(result.proofExists, true, "the proof file was written");
    assert.ok(result.fakeResult.some((t) => t.startsWith("MCP-EXEC-OK")), "the run reported the write");
    console.log("PASS");
  } else {
    assert.equal(exec.isError, true, "baseline: loopback exec fails");
    assert.match(String(exec.text), /Secret egress proxy requires an admitted agent run instance/u, "baseline: V's error");
    assert.equal(result.proofExists, false, "baseline: no file");
    console.log("BASELINE recorded");
  }
} finally {
  await stopGateway();
}
