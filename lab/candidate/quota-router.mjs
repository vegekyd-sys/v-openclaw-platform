// Candidate: v-quota-router against a real 2026.9.1 Gateway (no model turns, no quota spent).
//
// A private Gateway runs on the candidate config copy with channels/cron off and an empty
// makaron database. Test sessions are created with feishu-shaped keys, then the controller
// (apps/v-quota-router/quota-router.mjs, run as a child process exactly like the timer does)
// is driven through fixed quota readings:
//
//   1. surplus      owner DM -> /vcc (claude-cli), VIP group -> /vcodex (codex); low-score
//                   group, cron session and a session the "user" put on /vcc stay untouched;
//                   sessions.list reports the new runtime; openclaw.json bytes unchanged
//   2. user moves   the VIP group is switched by the "user" to /deepseek -> released, no patch
//   3. exhausted    Claude limit reached -> owner DM back to the agent default, override cleared
//   4. release-all  mode off reverts every remaining controller switch
//   5. admin trap   the same sessions.patch from an operator.admin client: 9.1 persists the
//                   model into openclaw.json (sticky model selection) iff modelSelectionScope is
//                   unset/"effective" (QR_SCOPE=effective arm); V and VLab set "session"
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const summary = { startedAt: new Date().toISOString(), steps: {}, notes: [] };
const appDir = path.resolve("apps/v-quota-router");
assert(fs.existsSync(path.join(appDir, "quota-router.mjs")), "controller sources missing from the candidate inputs");

const VCC = "anthropic/claude-opus-5-5";
const VCODEX = "openai/gpt-6.1-sol";
const VDS = "deepseek/vds-deepseek-flash";
const DEEPSEEK = "deepseek/deepseek-flash";

// ---------------------------------------------------------------- private config shaped like V's makaron
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0 && token, "candidate Gateway port/token missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const entries = {
  [VDS]: { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } },
  [VCC]: { alias: "vcc", agentRuntime: { id: "claude-cli" } },
  [VCODEX]: { alias: "vcodex", agentRuntime: { id: "codex" } },
  [DEEPSEEK]: { alias: "deepseek", agentRuntime: { id: "vlab-worker" } },
};
const dsModels = config.models?.providers?.deepseek?.models;
if (Array.isArray(dsModels)) {
  const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions" };
  for (const id of ["deepseek-flash", "vds-deepseek-flash"]) if (!dsModels.some((m) => m.id === id)) dsModels.push({ id, name: id, ...shape });
}
for (const [ref, entry] of Object.entries(entries)) {
  config.agents.defaults.models[ref] = { ...(config.agents.defaults.models[ref] ?? {}), ...entry };
  config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [ref]: { ...(config.agents.entries.makaron.models?.[ref] ?? {}), ...entry } };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(ref)) allow.push(ref);
}
config.agents.defaults.model = { primary: VDS, fallbacks: ["openai/gpt-6-luna"] };
config.agents.entries.makaron.model = { primary: VDS, fallbacks: ["openai/gpt-6-luna"] };
// QR_SCOPE=effective removes modelSelectionScope (9.1 default) so the admin-scope trap can fire;
// the controller's own patches must still leave openclaw.json alone.
if (process.env.QR_SCOPE === "effective") delete config.agents.defaults.modelSelectionScope;
summary.modelSelectionScope = config.agents.defaults.modelSelectionScope ?? "(unset = effective)";
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.qr-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const lines = [];
let gateway;
let starts = 0;
function startGateway() {
  starts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push(line); if (lines.length > 20_000) lines.splice(0, lines.length - 20_000); });
  }
}
async function connect(scopes) {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let last;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${lines.slice(-40).join("\n").replaceAll(token, "[token]")}`);
    }
    let client;
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes, onHelloOk: () => { clearTimeout(t); resolve(); }, onConnectError: (e) => { clearTimeout(t); reject(e); } });
        client.start();
      });
      return { call: (m, p = {}) => client.request(m, p, { timeoutMs: 60_000 }), stop: () => client.stop() };
    } catch (e) { last = e; client?.stop(); await sleep(1_000); }
  }
  throw last ?? new Error("Gateway not ready");
}

// ---------------------------------------------------------------- controller as a child process
const qrState = path.join(data, "quota-router-state");
const qrConfigPath = path.join(qrState, "config.json");
fs.mkdirSync(qrState, { recursive: true, mode: 0o700 });
const OWNER = "feishu:ou_qrowner0000";
const writeQrConfig = (mode) => fs.writeFileSync(qrConfigPath, JSON.stringify({
  mode, agentId: "makaron", listActiveMinutes: 1440, listLimit: 100,
  gateway: { url: `ws://127.0.0.1:${port}`, dist },
  policy: { maxUpgradesPerTick: 5 },
  importance: { ownerIds: [OWNER], vip: { "feishu:group:oc_qrvip0000": 45 } },
  codex: { sessionsDirs: [path.join(data, "no-rollouts")], usageStatusFallback: false },
}, null, 2));
const HOUR = 3_600_000;
const fixture = (name, claude, codex) => {
  const file = path.join(qrState, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ claude, codex }));
  return file;
};
const weekly = (used, resetInH, limited = false) => ({ weekly: { label: "week", usedPercent: used, resetsAt: Date.now() + resetInH * HOUR, windowMs: 7 * 24 * HOUR, limited }, fiveHour: null });
function tick(fixtureFile, extra = []) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(appDir, "quota-router.mjs"), ...extra, "--config", qrConfigPath, "--state-dir", qrState, "--openclaw-config", configPath, "--quota-fixture", fixtureFile], { env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `controller failed: ${r.stderr}`);
  const report = JSON.parse(r.stdout);
  return { ms: Date.now() - started, mode: report.mode, applied: report.applied, pace: Object.fromEntries(Object.entries(report.pace).map(([k, p]) => [k, p.state])), actions: report.actions.map((a) => ({ type: a.type, key: a.key, tier: a.tier, done: a.done, model: a.after?.modelRef ?? null, why: a.why ?? a.reasons })), managed: report.managed };
}

const keys = {
  ownerDm: "agent:makaron:feishu:direct:ou_qrowner0000",
  vip: "agent:makaron:feishu:group:oc_qrvip0000",
  low: "agent:makaron:feishu:group:oc_qrlow0000",
  userVcc: "agent:makaron:feishu:direct:ou_qruser0000",
  cron: "agent:makaron:cron:qr-daily",
  adminTrap: "agent:makaron:feishu:group:oc_qrtrap0000",
};
const row = (rows, key) => rows.find((r) => r.key === key);
const view = (r) => (r ? { model: `${r.modelProvider}/${r.model}`, source: r.modelOverrideSource ?? null, runtime: r.agentRuntime?.id ?? null } : null);

startGateway();
let admin;
let writer;
try {
  admin = await connect(["operator.admin", "operator.read", "operator.write"]);
  // The "user" in step 2 is a write-scoped client: an admin-scoped model patch may rewrite
  // the agent default (step 5), which would change what "back to default" means.
  writer = await connect(["operator.read", "operator.write"]);
  summary.gatewayReadyMs = Date.now() - Date.parse(summary.startedAt);
  for (const [name, key] of Object.entries(keys)) {
    await admin.call("sessions.create", { key, agentId: "makaron", ...(name === "userVcc" ? { model: VCC } : {}) });
  }
  const listAll = async () => (await admin.call("sessions.list", { agentId: "makaron", limit: 50, includeLastMessage: false })).sessions;
  const configBytes = () => sha256(fs.readFileSync(configPath));
  const before = await listAll();
  summary.created = Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, view(row(before, k))]));
  const configSha0 = configBytes();

  // 1. surplus
  writeQrConfig("apply");
  const s1 = tick(fixture("surplus", weekly(20, 110), weekly(10, 150)));
  const after1 = await listAll();
  summary.steps.surplus = { tick: s1, rows: Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, view(row(after1, k))])), configUnchanged: configBytes() === configSha0 };
  assert.equal(view(row(after1, keys.ownerDm)).model, VCC);
  assert.equal(view(row(after1, keys.ownerDm)).runtime, "claude-cli");
  assert.equal(view(row(after1, keys.vip)).model, VCODEX);
  assert.equal(view(row(after1, keys.vip)).runtime, "codex");
  assert.equal(view(row(after1, keys.low)).model, VDS);
  assert.equal(view(row(after1, keys.cron)).model, VDS);
  assert.equal(view(row(after1, keys.userVcc)).model, VCC);
  assert.equal(configBytes(), configSha0, "controller patch (no admin scope) must not rewrite openclaw.json");

  // dry-run makes no changes
  const dry = tick(fixture("surplus2", weekly(20, 110), weekly(10, 150)), ["--dry-run"]);
  summary.steps.dryRun = dry;

  // 2. user moves the VIP group to /deepseek
  await writer.call("sessions.patch", { key: keys.vip, model: DEEPSEEK });
  const s2 = tick(fixture("hold", weekly(20, 110), weekly(10, 150)));
  const after2 = await listAll();
  summary.steps.userMoved = { tick: s2, vip: view(row(after2, keys.vip)) };
  assert.equal(view(row(after2, keys.vip)).model, DEEPSEEK, "user choice kept");
  assert.ok(s2.actions.some((a) => a.type === "release" && a.key === keys.vip));

  // 3. Claude exhausted
  const s3 = tick(fixture("exhausted", weekly(92, 20, true), weekly(10, 150)));
  const after3 = await listAll();
  summary.steps.exhausted = { tick: s3, ownerDm: view(row(after3, keys.ownerDm)) };
  assert.equal(view(row(after3, keys.ownerDm)).model, VDS);
  assert.equal(view(row(after3, keys.ownerDm)).source, null);

  // 4. upgrade again, then release-all
  const s4a = tick(fixture("surplus3", weekly(20, 110), weekly(10, 150)));
  const s4b = tick(fixture("surplus4", weekly(20, 110), weekly(10, 150)), ["release-all"]);
  const after4 = await listAll();
  summary.steps.releaseAll = { upgrade: s4a, release: s4b, rows: Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, view(row(after4, k))])) };
  for (const k of [keys.ownerDm, keys.low]) assert.equal(view(row(after4, k)).model, VDS);
  assert.equal(view(row(after4, keys.userVcc)).model, VCC, "user's own /vcc never touched");
  assert.equal(configBytes(), configSha0);

  // 5. the admin-scope trap (documented, not asserted either way)
  const trapBefore = configBytes();
  await admin.call("sessions.patch", { key: keys.adminTrap, model: VCC });
  await sleep(3_000);
  const trapCfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  summary.steps.adminScopeTrap = {
    configChanged: configBytes() !== trapBefore,
    makaronPrimary: trapCfg.agents.entries.makaron.model?.primary ?? trapCfg.agents.entries.makaron.model ?? null,
    defaultsPrimary: trapCfg.agents.defaults.model?.primary ?? null,
    stickyLog: lines.filter((l) => /sticky model selection/u.test(l)).slice(-3),
  };
  // 9.1 persists admin-scoped selections only when modelSelectionScope resolves to "effective".
  assert.equal(summary.steps.adminScopeTrap.configChanged, process.env.QR_SCOPE === "effective", "admin-scope sticky selection behaves as read from source");
  summary.result = "pass";
} catch (error) {
  summary.result = "fail";
  summary.error = String(error.stack ?? error).replaceAll(token, "[token]");
  summary.gatewayTail = lines.slice(-30).map((l) => l.replaceAll(token, "[token]"));
} finally {
  admin?.stop();
  writer?.stop();
  if (gateway && gateway.exitCode === null) { gateway.kill("SIGTERM"); await sleep(5_000); if (gateway.exitCode === null) gateway.kill("SIGKILL"); }
  fs.rmSync(shortTmp, { recursive: true, force: true });
  summary.events = fs.existsSync(path.join(qrState, "events.jsonl")) ? fs.readFileSync(path.join(qrState, "events.jsonl"), "utf8").trim().split("\n").length : 0;
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.result === "pass" ? 0 : 1;
}
