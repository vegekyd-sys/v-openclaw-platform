// Candidate: native sessions_send, posted natively. Only the core patch
// v-sessions-send-reply-once-v2 is applied; the v-session-relay plugin is NOT loaded,
// so nothing here draws its own cards. What each V says in the target's turn and in
// the requester's wake-up turn must reach that session's own Feishu chat through the
// Feishu channel's ordinary outbound (reply card / post / image / file).
//
// Feishu runs in loopback webhook mode, so this Gateway never opens a second
// WebSocket consumer for the shared VLab bot. Outbound messages are real; the bot
// cannot list group history, so read the two chats back as the owner afterwards
// (lark-cli im +chat-messages-list) and match them by RUN_TAG.
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
const only = (process.env.RELAY_SCENARIOS ?? "inline,async,media").split(",").map((s) => s.trim()).filter(Boolean);
const RUN_TAG = process.env.RUN_TAG ?? `NT${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
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
const summary = { runTag: RUN_TAG, startedAt: new Date().toISOString(), scenarios: {}, notes: [] };
const DM_KEY = `agent:makaron:feishu:direct:${OWNER}`;
const GROUP_KEY = `agent:makaron:feishu:group:${GROUP}`;

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
const feishu = config.channels?.feishu;
assert(feishu && typeof feishu.appId === "string" && typeof feishu.appSecret === "string", "VLab Feishu app credentials are not plain strings");
Object.assign(feishu, {
  connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: port + 19, webhookPath: "/candidate/session-relay-native",
  verificationToken: "candidate-verification-token", encryptKey: "candidate-encrypt-key-0000000000",
});
summary.notes.push(`feishu renderMode=${feishu.renderMode ?? "default"} streaming=${JSON.stringify(feishu.streaming ?? null)}`);
config.channels = { feishu };
config.cron = { ...(config.cron ?? {}), enabled: false };
config.commands = { ...config.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
for (const id of ["codex", "v-session-relay"]) if (config.plugins.entries?.[id]) config.plugins.entries[id].enabled = false;
const allow = config.agents?.defaults?.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);

// The private runtime has no official install record for the relocated Feishu plugin
// (same candidate-only allowance as feishu-dm-approvals).
const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n))
  .find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}

// Core: apply the patch to this private runtime's own bytes.
const { patchSessionsSendReplyOnce, MARKER, FILE } = await import("../release-files/sessions-send-reply-once/patch.mjs");
const sessionsTool = path.join(dist, FILE);
const sessionsSource = fs.readFileSync(sessionsTool, "utf8");
assert(!/v-sessions-send-reply-once-v\d/u.test(sessionsSource) || sessionsSource.includes(MARKER), "runtime already carries another version of the patch");
summary.notes.push(`core ${FILE}: ${sessionsSource.includes(MARKER) ? "already patched" : "patched for this run"}`);
if (!sessionsSource.includes(MARKER)) fs.writeFileSync(sessionsTool, patchSessionsSendReplyOnce(sessionsSource));

// The worker child reads its own config copy.
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const workerJson = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerJson.channels = { feishu: { ...feishu, enabled: false } };
  workerJson.commands = { ...workerJson.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
  const wAllow = workerJson.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(wAllow) && !wAllow.includes(MODEL)) wAllow.push(MODEL);
  if (workerJson.plugins?.entries?.["v-session-relay"]) workerJson.plugins.entries["v-session-relay"].enabled = false;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerJson, null, 2)}\n`, { mode: 0o600 });
  summary.notes.push("worker pool on (1-2 workers)");
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
const logSince = (mark, re) => lines.slice(mark).filter((l) => re.test(l.line)).map((l) => `${new Date(l.at).toISOString().slice(11, 19)} ${redact(l.line).slice(0, 400)}`);
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
// With --channel/--to the session is routed like an inbound message and keeps its
// Feishu address, which the native delivery of later turns resolves as "last".
function agentTurn(message, deliverTo, { timeout = 600 } = {}) {
  const args = [`${dist}/index.js`, "agent", "--agent", "makaron", "--model", MODEL, "--message", message, "--json", "--timeout", String(timeout), "--channel", "feishu", "--to", deliverTo, "--deliver"];
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: (timeout + 60) * 1000, maxBuffer: 64 * 1024 * 1024 });
  let meta;
  try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { /* not json */ }
  return { exit: r.status, startedAt: new Date(started).toISOString(), secs: Math.round((Date.now() - started) / 1000), reply: redact(String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 600), stderr: r.status === 0 ? undefined : redact(r.stderr).slice(-1200) };
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
const textOf = (m) => (typeof m?.content === "string" ? m.content : Array.isArray(m?.content) ? m.content.map((b) => (b?.type === "text" ? b.text : b?.type ? `[${b.type}${b.name ? `:${b.name}` : ""}]` : "")).join(" ") : "");
async function history(sessionKey, limit = 40) {
  const res = await rpc("chat.history", { sessionKey, limit }).catch((e) => ({ error: e.message }));
  if (res?.error) return { error: res.error };
  return (res?.messages ?? []).map((m) => ({ role: m.role, at: m.timestamp ? new Date(m.timestamp).toISOString().slice(11, 19) : undefined, provenance: m.provenance?.kind ?? m.inputProvenance?.kind, text: redact(textOf(m)).slice(0, 300) }));
}
// Waits until a session has an assistant message mentioning `needle` after `sinceIso`.
async function waitAssistant(sessionKey, needle, ms) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(3_000)) {
    const h = await history(sessionKey, 30);
    if (Array.isArray(h) && h.some((m) => m.role === "assistant" && needle.test(m.text))) return true;
  }
  return false;
}
const DELIVERY_LOG = /deliver|outbound|sendMessage|sendMedia|feishu.*(send|sent|reply|image|file)|sessions_send|sessions-send|inter_session/iu;

const t0 = Date.now();
startGateway();
try {
  await waitLog(/starting Webhook server on 127\.0\.0\.1/u, 600_000, "Feishu webhook start");
  summary.gatewayReadyMs = Date.now() - t0;

  // The group session must exist with its Feishu address before anyone can send to it.
  summary.scenarios.seed = agentTurn(`【原生推送测试 ${RUN_TAG}·准备】只回复：就绪 ${RUN_TAG}`, `chat:${GROUP}`, { timeout: 300 });
  await rpc("sessions.patch", { key: GROUP_KEY, label: GROUP_NAME }).catch(() => {});

  // ------------------------------------------------------------ inline: the requester waits
  if (only.includes("inline")) {
    const mark = lines.length;
    const tag = `${RUN_TAG}-I`;
    const turn = agentTurn(`【原生推送测试 ${tag}】用 sessions_send 让「${GROUP_NAME}」群里的 V 给 v2.3 上线通知起一个 10 字以内的标题，要它在回复开头写上 ${tag}。你等它回复，然后把它给的标题告诉我。`, `user:${OWNER}`);
    summary.scenarios.inline = {
      tag, coordinatorTurn: turn,
      groupHistory: await history(GROUP_KEY, 12), dmHistory: await history(DM_KEY, 12),
      log: logSince(mark, DELIVERY_LOG).slice(-30),
    };
    assert.equal(turn.exit, 0, `coordinator turn failed: ${turn.stderr}`);
  }

  // ------------------------------------------------------------ async: the target works longer than any wait
  if (only.includes("async")) {
    const mark = lines.length;
    const tag = `${RUN_TAG}-A`;
    const turn = agentTurn(`【原生推送测试 ${tag}】用 sessions_send（timeoutSeconds 设 0，不要等）让「${GROUP_NAME}」群里的 V 用 exec 执行 \`sleep 75 && date\`，再把时间连同 ${tag} 一起回复。你发出去就先告诉我已经交给它了；它做完会回来，到时再把时间告诉我。`, `user:${OWNER}`);
    const woke = await waitAssistant(DM_KEY, /\d{1,2}:\d{2}/u, 420_000) && await waitAssistant(GROUP_KEY, new RegExp(tag), 30_000);
    await sleep(10_000); // let the last delivery reach Feishu
    summary.scenarios.async = {
      tag, coordinatorTurn: turn, woke,
      groupHistory: await history(GROUP_KEY, 12), dmHistory: await history(DM_KEY, 12),
      log: logSince(mark, DELIVERY_LOG).slice(-40),
    };
    assert.equal(turn.exit, 0, `coordinator turn failed: ${turn.stderr}`);
  }

  // ------------------------------------------------------------ media: the target sends an image
  if (only.includes("media")) {
    const mark = lines.length;
    const tag = `${RUN_TAG}-M`;
    const turn = agentTurn(`【原生推送测试 ${tag}】用 sessions_send 让「${GROUP_NAME}」群里的 V 用 exec 跑 Python 生成一张 320x200 的纯色 PNG（只用标准库 zlib/struct，不要装包），把这张图片发在它自己的群里，并回复一句带 ${tag} 的说明和图片路径。你等它回复，再告诉我图片发出去没有。`, `user:${OWNER}`);
    await sleep(10_000);
    summary.scenarios.media = {
      tag, coordinatorTurn: turn,
      groupHistory: await history(GROUP_KEY, 16), dmHistory: await history(DM_KEY, 8),
      log: logSince(mark, DELIVERY_LOG).slice(-40),
    };
    assert.equal(turn.exit, 0, `coordinator turn failed: ${turn.stderr}`);
  }

  summary.ok = true;
} catch (error) {
  summary.ok = false;
  summary.error = redact(error?.stack ?? error).slice(0, 3000);
  summary.tail = lines.slice(-80).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  summary.endedAt = new Date().toISOString();
  summary.totalMs = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  client?.stop();
  gateway?.kill("SIGTERM");
  await sleep(2_000);
  if (gateway && gateway.exitCode === null) gateway.kill("SIGKILL");
}
