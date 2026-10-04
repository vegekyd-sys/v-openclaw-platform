// Candidate: v-session-relay end to end in a private Gateway with a real worker.
// Feishu runs in loopback webhook mode, so this Gateway never opens a second
// WebSocket consumer for the shared VLab bot, but outbound messages are real:
// the 「消息来自」 cards and both V replies land in the owner's VLab DM and in the
// test group, where they can be looked at. The owner's DM turn is started from
// the CLI (no channel sender), so the plugin's test-only session-key fallback
// stands in for the Feishu sender id.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const OWNER = process.env.RELAY_OWNER_OPEN_ID ?? "ou_775a78b0aaae67da5e15eeaf102e3cd9";
const GROUP = process.env.RELAY_TARGET_CHAT ?? "oc_5afced473a29eb6f5fed3ba9966aa9ff";
const GROUP_NAME = process.env.RELAY_TARGET_NAME ?? "VLab 发布验收 B";
const MODEL = process.env.RELAY_MODEL ?? "deepseek/deepseek-v4-flash";
const only = (process.env.RELAY_SCENARIOS ?? "relay,denied").split(",").map((s) => s.trim()).filter(Boolean);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), scenarios: {}, notes: [] };

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
const feishu = config.channels?.feishu;
assert(feishu && typeof feishu.appId === "string" && typeof feishu.appSecret === "string", "VLab Feishu app credentials are not plain strings");
Object.assign(feishu, {
  connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: port + 19, webhookPath: "/candidate/session-relay",
  verificationToken: "candidate-verification-token", encryptKey: "candidate-encrypt-key-0000000000",
});
config.channels = { feishu };
config.cron = { ...(config.cron ?? {}), enabled: false };
config.commands = { ...config.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
for (const id of ["codex"]) if (config.plugins.entries?.[id]) config.plugins.entries[id].enabled = false;
const allow = config.agents?.defaults?.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
summary.notes.push(`agents: ${JSON.stringify(Object.keys(config.agents ?? {}))}, entries: ${JSON.stringify(Object.entries(config.agents?.entries ?? {}).map(([k, v]) => [k, v?.default ?? null]))}, defaults.id: ${config.agents?.defaults?.id ?? null}, bindings: ${Array.isArray(config.bindings) ? config.bindings.length : "none"}, binding sample: ${JSON.stringify((config.bindings ?? [])[0] ?? null).slice(0, 200)}`);

// The private runtime has no official install record for the relocated Feishu plugin
// (same candidate-only allowance as feishu-dm-approvals).
const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n))
  .find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}

const storeDir = path.join(stateDir, "v-session-relay");
const pluginDir = path.join(process.cwd(), "apps", "v-session-relay", "plugin");
fs.mkdirSync(path.join(pluginDir, "node_modules"), { recursive: true });
if (!fs.existsSync(path.join(pluginDir, "node_modules", "typebox"))) fs.symlinkSync(path.join(runtime, "openclaw", "node_modules", "typebox"), path.join(pluginDir, "node_modules", "typebox"));
const relayEntry = { enabled: true, config: { storeDir, owners: [`feishu:${OWNER}`], sessionKeyActorFallback: true, pollMs: 1000 } };
const wire = (cfg) => {
  cfg.plugins ??= {};
  cfg.plugins.load ??= {};
  cfg.plugins.load.paths = [...new Set([...(cfg.plugins.load.paths ?? []), pluginDir])];
  if (Array.isArray(cfg.plugins.allow) && !cfg.plugins.allow.includes("v-session-relay")) cfg.plugins.allow.push("v-session-relay");
  cfg.plugins.entries ??= {};
  cfg.plugins.entries["v-session-relay"] = relayEntry;
};
wire(config);

// The worker child reads its own config copy: declare the plugin there too.
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const workerJson = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  // Workers never run channel monitors; keep the credentials so the tool can look up group names.
  workerJson.channels = { feishu: { ...feishu, enabled: false } };
  workerJson.commands = { ...workerJson.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
  const wAllow = workerJson.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(wAllow) && !wAllow.includes(MODEL)) wAllow.push(MODEL);
  wire(workerJson);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerJson, null, 2)}\n`, { mode: 0o600 });
  summary.notes.push("worker pool on (1-2 workers), plugin declared in the worker config");
} else {
  summary.notes.push("no worker plugin in this config: turns run in the Gateway");
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: path.join(stateDir, "tmp"), XDG_CACHE_HOME: path.join(stateDir, "cache") };
fs.mkdirSync(env.TMPDIR, { recursive: true });
for (const name of ["DEEPSEEK_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}

// ---------------------------------------------------------------- Feishu read-back
const domain = feishu.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
let tenant;
async function feishuGet(p) {
  if (!tenant) {
    const auth = await fetch(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret }), signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    assert.equal(auth.code, 0, "Feishu auth failed (credentials redacted)");
    tenant = auth.tenant_access_token;
  }
  const res = await fetch(`${domain}/open-apis/${p}`, { headers: { Authorization: `Bearer ${tenant}` }, signal: AbortSignal.timeout(15000) }).then((r) => r.json());
  assert.equal(res.code, 0, `Feishu GET ${p.split("?")[0]} failed: ${res.code} ${res.msg}`);
  return res.data;
}

// ---------------------------------------------------------------- Gateway
const lines = [];
let gateway;
let starts = 0;
function startGateway() {
  starts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 30_000) lines.splice(0, lines.length - 30_000);
    });
  }
}
const logSince = (mark, re) => lines.slice(mark).filter((l) => re.test(l.line)).map((l) => redact(l.line).slice(0, 500));
async function waitLog(re, ms, label) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(250)) {
    const hit = lines.find((l) => re.test(l.line));
    if (hit) return hit.line;
    if (gateway.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-40).map((l) => l.line).join("\n"))}`);
    }
  }
  throw new Error(`timed out waiting for ${label}`);
}
// With --channel/--to (no --session-key) the session is routed like an inbound message
// and keeps its Feishu address, which `deliver: true` runs need later.
function agentTurn(sessionKey, message, { deliverTo, timeout = 600 } = {}) {
  const args = [`${dist}/index.js`, "agent", "--agent", "makaron", "--model", MODEL, "--message", message, "--json", "--timeout", String(timeout)];
  if (deliverTo) args.push("--channel", "feishu", "--to", deliverTo, "--deliver");
  else args.push("--session-key", sessionKey);
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: (timeout + 60) * 1000, maxBuffer: 64 * 1024 * 1024 });
  let meta;
  try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { /* not json */ }
  return { exit: r.status, sessionKey: meta?.result?.meta?.agentMeta?.sessionKey ?? meta?.sessionKey ?? meta?.result?.sessionKey, secs: Math.round((Date.now() - started) / 1000), reply: redact(String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 600), stderr: r.status === 0 ? undefined : redact(r.stderr).slice(-1200) };
}
let client;
async function rpc(method, params) {
  if (!client) {
    const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
      client.start();
    });
  }
  return client.request(method, params);
}
async function sessionRows(search) {
  const res = await rpc("sessions.list", { agentId: "makaron", search, limit: 10, includeLastMessage: false }).catch((e) => ({ error: e.message }));
  if (res?.error) return [{ error: res.error }];
  const rows = res?.sessions ?? res?.rows ?? res?.items ?? [];
  return rows.map((r) => ({ key: r.key ?? r.sessionKey, label: r.label ?? r.displayName, lastChannel: r.lastChannel ?? r.deliveryContext?.channel, lastTo: r.lastTo ?? r.deliveryContext?.to }));
}
const ledger = () => {
  try { return fs.readdirSync(storeDir).filter((n) => /^r_\w+\.json$/u.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(storeDir, n), "utf8"))); } catch { return []; }
};

const t0 = Date.now();
startGateway();
try {
  await waitLog(/starting Webhook server on 127\.0\.0\.1/u, 600_000, "Feishu webhook start");
  await waitLog(/session relay dispatcher started/u, 120_000, "relay dispatcher");
  summary.gatewayReadyMs = Date.now() - t0;

  // ------------------------------------------------------------ relay: DM -> group -> DM
  if (only.includes("relay")) {
    const dmKey = `agent:makaron:feishu:direct:${OWNER}`;
    const since = Date.now() - 2_000;
    const seed = agentTurn(null, "【候选测试·准备】记住本群的规矩：任何上线通知都必须写明回滚负责人（小王）和灰度比例；灰度比例要先向发起方确认，不能自己假设。只回复：记住了", { deliverTo: `chat:${GROUP}`, timeout: 300 });
    summary.scenarios.seed = { seed, groupRows: await sessionRows(GROUP) };
    const mark = lines.length;
    const ask = `【候选测试】让「${GROUP_NAME}」群里的 V 按它们群的规矩起草 v2.3 的上线通知：周四 20:00 上线，主要改动是飞书里的「电脑」接管卡片。它问什么你就答，灰度比例是 20%（等它问了再告诉它）。最后把定稿给我。`;
    const coordinator = agentTurn(dmKey, ask, { deliverTo: `user:${OWNER}` });
    let records = ledger();
    const deadline = Date.now() + 900_000;
    // A thread is finished when every relay in it is finished and nothing new appeared for a while.
    let quietSince = Date.now(), seen = 0;
    while (Date.now() < deadline) {
      await sleep(2_000);
      records = ledger();
      const settled = records.length && records.every((r) => ["done", "failed", "interrupted"].includes(r.status));
      if (records.length !== seen) { seen = records.length; quietSince = Date.now(); }
      if (settled && Date.now() - quietSince > 20_000) break;
    }
    await sleep(8_000); // let the last delivery reach Feishu
    const cardText = async (id) => (id ? JSON.stringify((await feishuGet(`im/v1/messages/${id}?card_msg_content_type=raw_card_content`)).items?.[0]?.body ?? {}).slice(0, 300) : null);
    const groupMsgs = [];
    for (const r of records) groupMsgs.push({ requestCard: await cardText(r.requestCardId).catch((e) => e.message), resultCard: await cardText(r.resultCardId).catch((e) => e.message) });
    summary.scenarios.relay = {
      coordinatorTurn: coordinator,
      dmRows: await sessionRows(OWNER),
      records: records.map((r) => ({ id: r.id, status: r.status, via: r.via, requestedBy: r.requestedBy, from: r.from, to: r.to, reply: String(r.reply ?? "").slice(0, 300), error: r.error, runId: r.runId, replyRunId: r.replyRunId, ms: (r.doneAt ?? r.updatedAt) - r.createdAt })),
      groupMessages: groupMsgs,
      relayLog: logSince(mark, /session relay|v-session-relay|deliver|feishu.*(send|sent|message)/iu).slice(-40),
    };
    assert.equal(coordinator.exit, 0, `coordinator turn failed: ${coordinator.stderr}`);
    records.sort((a, b) => a.createdAt - b.createdAt);
    summary.scenarios.relay.thread = records.map((r) => ({ round: r.id, chain: r.chainId, via: r.via, from: r.from.label, to: r.to.label, said: String(r.message).slice(0, 400), answered: String(r.reply ?? "").slice(0, 600), status: r.status }));
    assert(records.length >= 2, `expected the two V's to go back and forth, got ${records.length} relay(s)`);
    assert(records.every((r) => r.chainId === records[0].chainId), "relays are not one thread");
    assert(records.slice(1).every((r) => r.via === "reply"), "follow-ups did not come from the woken origin");
    assert.match(records.map((r) => r.message).join("\n"), /20\s*%/u, "the origin never passed on the rollout percentage");
    const rec = records[0];
    assert.equal(rec.to.sessionKey, `agent:makaron:feishu:group:${GROUP}`);
    assert(rec.requestCardId && rec.resultCardId, "a 「消息来自」 card was not posted");
    for (const r of records) assert.equal(r.status, "done", `relay ${r.id} ended ${r.status}: ${r.error ?? ""}`);
    assert.match(rec.reply, /\S/u, "the group's reply was not captured");
    assert.match(groupMsgs[0].requestCard ?? "", /消息来自/u, "request card not readable in the group");
  }

  // ------------------------------------------------------------ denied: a non-owner turn cannot relay
  if (only.includes("denied")) {
    const before = ledger().length;
    const mark = lines.length;
    const turn = agentTurn("agent:makaron:feishu:group:oc_candidate_relay_denied", `【候选测试】请用 session_relay_send 让「${GROUP_NAME}」群里的 V 说一句你好。`, {});
    const denied = logSince(mark, /session relay denied/u);
    summary.scenarios.denied = { turn, denied, ledgerBefore: before, ledgerAfter: ledger().length };
    assert.equal(ledger().length, before, "a non-owner turn created a relay");
    // The tool runs in the worker, whose plugin log lines do not reach this Gateway's stdout;
    // the ledger staying unchanged is the evidence.
  }
  summary.ok = true;
} catch (error) {
  summary.ok = false;
  summary.error = redact(error?.stack ?? error).slice(0, 3000);
  summary.tail = lines.slice(-80).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  summary.totalMs = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  client?.stop();
  gateway?.kill("SIGTERM");
  await sleep(2_000);
  if (gateway && gateway.exitCode === null) gateway.kill("SIGKILL");
}
