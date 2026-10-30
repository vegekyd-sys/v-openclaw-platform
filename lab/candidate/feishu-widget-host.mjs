// show_widget on Feishu in a private 9.1 Gateway, with the real V - Lab app for outbound and a
// real person's Feishu client. No Feishu WebSocket: the channel runs in webhook mode with no
// webhook configured upstream, so shared VLab keeps every event. Turns start through the same
// synthetic inbound the widget's buttons use. Long-running on purpose: it holds the page and
// the tunnel open while a person opens the card, and is driven through a command file.
//
//   WIDGET_RUN=<nonce>  /tmp/v-feishu-widget-<nonce>.status.json   what happened so far
//                       /tmp/v-feishu-widget-<nonce>.cmd           JSON lines, appended by hand:
//     {"op":"turn","chat":"oc_…","openId":"ou_…","text":"…"}   start a turn as that person
//     {"op":"rpc","method":"…","params":{}}                     read something from the Gateway
//     {"op":"stop"}                                             clean up and exit 0
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { patchFeishuMonitor, MARKER } from "../patch-feishu-widget-inbound.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const run = process.env.WIDGET_RUN;
assert(runtime && stateDir && configPath && /^[a-z0-9-]{4,40}$/u.test(run ?? ""), "candidate env and WIDGET_RUN are required");
const STATUS = `/tmp/v-feishu-widget-${run}.status.json`;
const CMD = `/tmp/v-feishu-widget-${run}.cmd`;
const dist = path.join(runtime, "openclaw", "dist");
const scratch = path.join(stateDir, "widget-host");
fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const status = { startedAt: new Date().toISOString(), phase: "prepare", events: [], rpc: [] };
const save = () => fs.writeFileSync(STATUS, JSON.stringify(status, null, 2), { mode: 0o644 });
const note = (kind, extra = {}) => { status.events.push({ at: new Date().toISOString(), kind, ...extra }); save(); };
save();

// ---- the patched Feishu monitor, in this candidate's runtime only ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "Feishu plugin must come from the candidate runtime");
const monitorName = fs.readdirSync(path.join(feishuDir, "dist")).find((n) => /^monitor\.account-.*\.js$/u.test(n));
const monitorPath = path.join(feishuDir, "dist", monitorName);
const monitorSource = fs.readFileSync(monitorPath, "utf8");
if (!monitorSource.includes(MARKER)) fs.writeFileSync(monitorPath, patchFeishuMonitor(monitorSource));

// Candidate-only: the relocated Feishu plugin has no official install record, so the trusted-runtime
// gate would refuse its ingress queue (same as the other Feishu candidates).
const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) fs.writeFileSync(loaderFile, fs.readFileSync(loaderFile, "utf8").replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));

// ---- service ----
const publicPort = await freePort();
const adminPort = await freePort();
const gatewayPort = Number(config.gateway?.port);
const adminTokenFile = path.join(scratch, "admin-token");
fs.writeFileSync(adminTokenFile, `${crypto.randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
const pathPrefix = "/v-widgets";

const cloudflared = spawn("/usr/local/bin/cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${publicPort}`], { stdio: ["ignore", "pipe", "pipe"] });
const publicBaseUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("quick tunnel did not come up")), 60_000);
  const scan = (chunk) => {
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/u);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  };
  cloudflared.stdout.on("data", scan);
  cloudflared.stderr.on("data", scan);
});
status.publicBaseUrl = publicBaseUrl;
note("tunnel");

// ---- private config: Feishu outbound only ----
const webhookPort = await freePort();
const feishu = {
  ...config.channels.feishu,
  connectionMode: "webhook",
  webhookHost: "127.0.0.1",
  webhookPort,
  webhookPath: "/feishu/candidate-unused",
  verificationToken: crypto.randomBytes(16).toString("hex"),
  encryptKey: crypto.randomBytes(16).toString("hex"),
  // Membership is checked by the host; this keeps the candidate's turn open to the tester.
  dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], requireMention: false,
};
config.channels = { feishu };
const pluginDir = path.resolve("apps/v-feishu-widgets/plugin");
const entry = {
  enabled: true,
  config: { adminUrl: `http://127.0.0.1:${adminPort}`, adminTokenFile, publicLoopbackUrl: `http://127.0.0.1:${publicPort}${pathPrefix}`, chromePath: "/usr/bin/google-chrome" },
};
const addPlugin = (cfg) => {
  cfg.plugins.load = { ...(cfg.plugins.load ?? {}), paths: [...(cfg.plugins.load?.paths ?? []), pluginDir] };
  if (Array.isArray(cfg.plugins.allow) && !cfg.plugins.allow.includes("v-feishu-widgets")) cfg.plugins.allow.push("v-feishu-widgets");
  cfg.plugins.entries = { ...(cfg.plugins.entries ?? {}), "v-feishu-widgets": entry };
};
addPlugin(config);
config.cron = { ...(config.cron ?? {}), enabled: false };
config.messages = { ...(config.messages ?? {}), groupChat: { ...(config.messages?.groupChat ?? {}), visibleReplies: "automatic" } };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  // Tools are built in the Worker on V's default runtime, so the presenter has to be there too.
  addPlugin(workerConfig);
  workerConfig.channels = { feishu };
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig), { mode: 0o600 });
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(gatewayPort),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  npm_config_cache: path.join(scratch, "cache", "npm"),
};
fs.mkdirSync(env.TMPDIR, { recursive: true });
for (const line of fs.readFileSync("/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env", "utf8").split(/\r?\n/u)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+_API_KEY)=(.*)$/u);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
}

// The service in its own process, as on a host: same env as the Gateway for the CLI transport.
const serviceConfig = path.join(scratch, "service.json");
fs.writeFileSync(serviceConfig, JSON.stringify({ publicPort, adminPort, publicBaseUrl, pathPrefix, adminTokenFile, stateDir: path.join(scratch, "service-state"), openclawDist: dist, openclawConfigPath: configPath }), { mode: 0o600 });
fs.mkdirSync(path.join(scratch, "service-state"), { recursive: true });
const service = spawn(process.execPath, [path.resolve("apps/v-feishu-widgets/service/server.mjs"), serviceConfig], { env, stdio: ["ignore", "pipe", "pipe"] });
const serviceLog = [];
for (const s of [service.stdout, service.stderr]) s.on("data", (b) => { serviceLog.push(String(b).slice(0, 2000)); if (serviceLog.length > 200) serviceLog.shift(); });

const gatewayLog = path.join(scratch, "gateway.log");
const logStream = fs.createWriteStream(gatewayLog, { mode: 0o600 });
let gateway;
const startGateway = () => {
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(gatewayPort)], { env, stdio: ["ignore", "pipe", "pipe"] });
  gateway.stdout.pipe(logStream, { end: false });
  gateway.stderr.pipe(logStream, { end: false });
};
startGateway();
status.gatewayLog = gatewayLog;

const { GatewayClient } = await import(pathToFileURL(`${dist}/plugin-sdk/gateway-runtime.js`).href);
const rpc = async (method, params, timeoutMs = 60_000) => {
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("hello timeout")), 8_000);
    client = new GatewayClient({ url: `ws://127.0.0.1:${gatewayPort}`, token: config.gateway?.auth?.token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
    client.start();
  });
  try { return await client.request(method, params, { timeoutMs }); } finally { client.stop(); }
};

let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  if (gateway.exitCode !== null) {
    if (fs.readFileSync(gatewayLog, "utf8").includes("Restart OpenClaw so state migrations run") && i < 280) startGateway();
    else throw new Error(`Gateway exited ${gateway.exitCode}: ${fs.readFileSync(gatewayLog, "utf8").slice(-1500)}`);
    await sleep(1000);
  }
  try {
    await rpc("health", {}, 5_000);
    // The channel has to be up too: the inbound method needs its registry entry.
    ready = true;
  } catch { await sleep(2000); }
}
assert(ready, "Gateway did not become ready");
status.phase = "ready";
note("gateway-ready");

// ---- driven by hand ----
let offset = 0;
const stop = async (code) => {
  for (const child of [cloudflared, service, gateway]) { try { child.kill("SIGTERM"); } catch {} }
  await sleep(4000);
  for (const child of [cloudflared, service, gateway]) { try { if (child.exitCode === null) child.kill("SIGKILL"); } catch {} }
  status.phase = "stopped";
  status.serviceLog = serviceLog.slice(-20);
  status.audit = fs.existsSync(path.join(scratch, "service-state", "audit.jsonl")) ? fs.readFileSync(path.join(scratch, "service-state", "audit.jsonl"), "utf8").trim().split("\n") : [];
  save();
  console.log(JSON.stringify({ events: status.events, rpc: status.rpc.map((r) => ({ method: r.method, ok: r.ok })), audit: status.audit }));
  process.exit(code);
};
process.on("SIGTERM", () => void stop(143));
for (const deadline = Date.now() + Number(process.env.WIDGET_HOLD_MS ?? 6 * 3600_000); Date.now() < deadline;) {
  await sleep(1500);
  const auditFile = path.join(scratch, "service-state", "audit.jsonl");
  status.liveAudit = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, "utf8").trim().split("\n").slice(-30) : [];
  status.serviceErrors = serviceLog.slice(-5);
  save();
  if (!fs.existsSync(CMD)) continue;
  const text = fs.readFileSync(CMD, "utf8");
  const fresh = text.slice(offset);
  const end = fresh.lastIndexOf("\n");
  if (end < 0) continue;
  offset += end + 1;
  for (const line of fresh.slice(0, end).split("\n").filter(Boolean)) {
    const cmd = JSON.parse(line);
    if (cmd.op === "stop") await stop(0);
    if (cmd.op === "turn") {
      try {
        const result = await rpc("vwidgets.inbound", { accountId: "default", chat: cmd.chat, chatType: cmd.chatType ?? "group", title: "VLab 测试", openId: cmd.openId, name: cmd.name ?? "测试", text: cmd.text, cardMessageId: null }, 30_000);
        note("turn-started", { result });
      } catch (error) { note("turn-failed", { error: String(error?.message ?? error) }); }
    }
    if (cmd.op === "rpc") {
      try { status.rpc.push({ at: new Date().toISOString(), method: cmd.method, ok: true, result: await rpc(cmd.method, cmd.params ?? {}, 30_000) }); }
      catch (error) { status.rpc.push({ at: new Date().toISOString(), method: cmd.method, ok: false, error: String(error?.message ?? error) }); }
      save();
    }
  }
}
await stop(0);
