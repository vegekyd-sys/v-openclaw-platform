// Candidate: a DingTalk reconnect refused with HTTP 400 after the account was
// stopped must not take down the Gateway (V 2026-11-08 10:08, 2026-11-12 22:08).
//
// The DingTalk connector exactly as V runs it (npm project tarball from V)
// runs in a private Gateway against the loopback fake open platform
// (lab/candidate/dingtalk-fake-open-api.mjs). The run:
//   1. normal path: a user message is acked and answered (real model turn);
//   2. the fake drops the Stream connection and holds the reconnect's
//      handshake (as on V, where it hung for 10 s+ during an event-loop stall);
//   3. `channels.stop` stops the account while that handshake runs (what the
//      health monitor's restart does);
//   4. the fake refuses every handshake still waiting with HTTP 400 (the used
//      ticket);
//   5. with DG_EXPECT=survive: the Gateway is still up, `channels.start`
//      reconnects, and a user message is acked and answered again, a Gateway
//      `send` reaches the user, and `health` is fine.
// DG_EXPECT=crash runs V's bytes unchanged and asserts the Gateway exits with
// "Unexpected server response: 400" (the fault path is real); DG_EXPECT=survive
// applies apps/v-experience/dingtalk/patch-socket-guard.mjs first.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeDingTalkOpenApi } from "./dingtalk-fake-open-api.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const EXPECT = process.env.DG_EXPECT ?? "survive";
assert(["crash", "survive"].includes(EXPECT), "DG_EXPECT is crash or survive");
const MODEL = process.env.DG_MODEL ?? "deepseek/deepseek-v4-flash";
const TARBALL_NAME = "dingtalk-connector-0.8.26-v.tgz";
const findInput = (name) => {
  const stack = ["."];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) return p;
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) stack.push(p);
    }
  }
  return undefined;
};
const TARBALL = process.env.DG_PROJECT_TARBALL ?? findInput(TARBALL_NAME);
assert(TARBALL, `${TARBALL_NAME} support input is missing`);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const secret = (name) => {
  if (!fs.existsSync(SECRETS)) return undefined;
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};

const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---- the connector, exactly as installed on V ----
const project = path.join(scratch, "dingtalk-project");
fs.mkdirSync(project, { recursive: true });
assert.equal(spawnSync("tar", ["xzf", path.resolve(TARBALL), "-C", project]).status, 0, "extract connector project");
const pluginDir = path.join(project, "node_modules", "@dingtalk-real-ai", "dingtalk-connector");
const pluginDist = path.join(pluginDir, "dist");
const connectionFile = path.join(pluginDist, "connection-DCvu-l09.mjs");
const report = { expect: EXPECT, model: MODEL, connection: { before: sha(fs.readFileSync(connectionFile)) } };
assert.equal(report.connection.before, "397c42c3f66d0cd7898168de21be1607303723cd797d9174ad4b1d6694d44520", "the tarball is not V's current connector");
if (EXPECT === "survive") {
  const { patchSocketGuard } = await import(pathToFileURL(path.resolve("apps/v-experience/dingtalk/patch-socket-guard.mjs")).href);
  fs.writeFileSync(connectionFile, patchSocketGuard(fs.readFileSync(connectionFile, "utf8")));
}
report.connection.tested = sha(fs.readFileSync(connectionFile));

const { WebSocketServer } = createRequire(path.join(project, "node_modules", "noop.js"))("ws");
const fake = createFakeDingTalkOpenApi({ WebSocketServer });
const apiPort = await fake.listen();
const fakeBase = `http://127.0.0.1:${apiPort}`;
// Candidate-only: point every DingTalk host at the fake, in this private copy
// (after hashing: the rewrite changes the bytes).
let rewritten = 0;
for (const file of [
  ...fs.readdirSync(pluginDist).filter((f) => f.endsWith(".mjs")).map((f) => path.join(pluginDist, f)),
  ...["constants.mjs", "constants.cjs"].map((f) => path.join(project, "node_modules", "dingtalk-stream", "dist", f)),
]) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  const next = source.replaceAll("https://api.dingtalk.com", fakeBase).replaceAll("https://oapi.dingtalk.com", fakeBase);
  if (next !== source) { fs.writeFileSync(file, next); rewritten += 1; }
}
report.hostRewrites = rewritten;

// ---- private config: DingTalk only ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {
  "dingtalk-connector": {
    enabled: true, clientId: "dingcandidate", clientSecret: "candidate-fake-secret",
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], requireMention: false,
    groupReplyMode: "aicard", typingIndicator: true, separateSessionByConversation: true, groupSessionScope: "group",
    resolveSenderNames: false, enableMediaUpload: false, debug: true,
  },
};
config.plugins.load = { ...(config.plugins.load ?? {}), paths: [...(config.plugins.load?.paths ?? []).filter((p) => !/dingtalk/u.test(p)), pluginDir] };
config.plugins.entries = { ...(config.plugins.entries ?? {}), "dingtalk-connector": { enabled: true } };
if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("dingtalk-connector")) config.plugins.allow.push("dingtalk-connector");
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "dingtalk-connector"), { agentId: "makaron", match: { channel: "dingtalk-connector" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
config.messages = { ...(config.messages ?? {}), groupChat: { ...(config.messages?.groupChat ?? {}), visibleReplies: "automatic" } };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
// Turns run on the VLab Worker, as on V (same setup as dingtalk-experience.mjs).
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
// V's per-agent model entry: the Gateway hands the turn to vlab-worker (without it the
// shared VLab config routes the model to the codex harness, disabled here).
const perAgent = { ...(config.agents.defaults.models?.[MODEL] ?? {}), agentRuntime: { id: "vlab-worker" } };
config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODEL };
(config.agents.defaults.models ??= {})[MODEL] = perAgent;
if (config.agents.entries?.makaron) {
  config.agents.entries.makaron.model = { ...(typeof config.agents.entries.makaron.model === "object" ? config.agents.entries.makaron.model : {}), primary: MODEL };
  (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent;
}
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Candidate-only: the relocated connector has no official install record (as in dingtalk-experience.mjs).
const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "dingtalk-connector"')));
}

const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  npm_config_cache: path.join(scratch, "cache", "npm"),
};
for (const name of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}
const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
const exited = new Promise((resolve) => gateway.once("exit", (code, signal) => resolve({ code, signal, at: Date.now() })));
for (const s of [gateway.stdout, gateway.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
    if (lines.length > 30_000) lines.splice(0, lines.length - 30_000);
  });
}
const rpc = async (method, params, timeoutMs = 60_000) => {
  const { GatewayClient } = await import(pathToFileURL(`${dist}/plugin-sdk/gateway-runtime.js`).href);
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Gateway hello timeout")), 15_000);
    client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: config.gateway?.auth?.token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"],
      onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
    client.start();
  });
  try {
    return await client.request(method, params, { timeoutMs });
  } finally {
    client.stop();
  }
};
const alive = () => gateway.exitCode === null && gateway.signalCode === null;
const waitFor = async (predicate, ms, label) => {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const value = predicate();
    if (value) return value;
    if (!alive()) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-30).map((l) => l.line).join("\n"))}`);
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const logSince = (since, re) => lines.filter((l) => l.at >= since && re.test(l.line)).map((l) => redact(l.line).slice(0, 400));

// One user message: the connector's immediate ack over Stream, then the model's reply.
let user = 0;
const converse = async (label) => {
  const userId = `cand${String(++user).padStart(3, "0")}`;
  const sent = fake.sendUserText({ userId, text: "这是自动化连接测试。请只回复两个字：收到" });
  const r = { userId };
  r.acked = Boolean(await waitFor(() => fake.calls.find((c) => c.method === "WS" && c.at >= sent.at && c.body?.headers?.messageId === `stream-${sent.msgId}`), 30_000, `${label} ack`));
  const replyText = () => [
    ...fake.cards().filter((c) => c.createdAt >= sent.at).map((c) => c.content),
    ...fake.webhookMessages.filter((m) => m.at >= sent.at && m.conversationId === sent.conversationId).map((m) => String(m.text ?? "")),
  ].join("\n");
  r.reply = (await waitFor(() => (/收到/u.test(replyText()) ? replyText() : null), 240_000, `${label} reply`)).slice(0, 200);
  return r;
};

const t0 = Date.now();
try {
  await waitFor(() => fake.connected(), 180_000, "DingTalk Stream connection");
  report.startupMs = Date.now() - t0;
  report.before = await converse("before");

  // The reconnect stuck in its handshake, then the account stops under it.
  fake.holdUpgrades(true);
  const tDrop = Date.now();
  fake.dropSockets();
  await waitFor(() => fake.held().length > 0, 30_000, "the reconnect's handshake");
  report.heldAfterDrop = fake.held();
  report.stop = await rpc("channels.stop", { channel: "dingtalk-connector" }).then((r) => ({ ok: true, result: r })).catch((e) => ({ error: redact(String(e?.message ?? e)).slice(0, 300) }));
  await sleep(1500);
  report.heldBeforeAnswer = fake.held();
  // The DingTalk gateway refuses the used ticket.
  const tAnswer = Date.now();
  report.answered = fake.answerHeld(400);
  const exit = await Promise.race([exited, sleep(10_000).then(() => null)]);
  report.gateway = exit ? { exited: true, ...exit, afterAnswerMs: exit.at - tAnswer } : { exited: false };
  report.crashLines = logSince(tDrop, /Unexpected server response|unexpected runtime error|uncaught/iu);
  report.guardLines = logSince(tDrop, /stopped connection socket error|aborting the stopped connection/u);

  if (!exit) {
    fake.holdUpgrades(false);
    report.start = await rpc("channels.start", { channel: "dingtalk-connector" }).then(() => ({ ok: true })).catch((e) => ({ error: redact(String(e?.message ?? e)).slice(0, 300) }));
    await waitFor(() => fake.connected(), 60_000, "reconnect after channels.start");
    report.after = await converse("after");
    const tSend = Date.now();
    report.send = await rpc("send", { channel: "dingtalk-connector", to: `user:${report.after.userId}`, message: "候选测试：Gateway 主动发送", agentId: "makaron", idempotencyKey: crypto.randomUUID() }, 120_000)
      .then((r) => ({ ok: true, messageId: r?.messageId ?? r?.result?.messageId ?? null })).catch((e) => ({ error: redact(String(e?.message ?? e)).slice(0, 300) }));
    await sleep(3000);
    report.send.delivered = fake.robotMessagesSince(tSend).length + fake.cards().filter((c) => c.createdAt >= tSend).length;
    report.health = await rpc("health", {}).then((h) => ({ ok: h?.ok })).catch((e) => ({ error: redact(String(e?.message ?? e)).slice(0, 300) }));
    report.stillAlive = alive();
  }
} catch (err) {
  report.error = redact(String(err?.stack ?? err)).slice(0, 3000);
  report.diagnostics = {
    cards: fake.cards().map((c) => ({ status: c.status, content: String(c.content ?? "").slice(0, 300) })),
    webhook: fake.webhookMessages.map((m) => ({ msgtype: m.msgtype, text: String(m.text ?? "").slice(0, 300) })),
    robot: fake.robotMessages.map((m) => ({ msgKey: m.msgKey, param: JSON.stringify(m.msgParam ?? "").slice(0, 300) })),
    lines: lines.filter((l) => /error|warn|fail|model|agent|dispatch|worker|回复|消息处理/iu.test(l.line)).slice(-60).map((l) => redact(l.line).slice(0, 300)),
  };
  process.exitCode = 1;
} finally {
  if (alive()) {
    gateway.kill("SIGTERM");
    await Promise.race([exited, sleep(60_000)]);
    if (alive()) gateway.kill("SIGKILL");
  }
  report.tail = lines.slice(-25).map((l) => redact(l.line).slice(0, 300));
  fs.writeFileSync(path.join(scratch, "dingtalk-socket-guard-report.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  await Promise.race([fake.close(), sleep(10_000)]);
}

assert.equal(report.error, undefined, report.error);
assert(report.before.acked && /收到/u.test(report.before.reply), "normal path before the fault failed");
assert(report.heldAfterDrop.length > 0, "the reconnect never reached the held handshake");
if (EXPECT === "crash") {
  assert.equal(report.gateway.exited, true, "V's bytes did not crash: the fault path was not reproduced");
  assert.notEqual(report.gateway.code, 0);
  assert(report.crashLines.some((l) => l.includes("Unexpected server response: 400")), `crash was not the 400: ${JSON.stringify(report.crashLines)}`);
  assert(report.answered.some((h) => h.answered === 400), "no handshake was answered 400");
} else {
  assert.equal(report.gateway.exited, false, `the Gateway exited: ${JSON.stringify(report.crashLines)}`);
  assert.deepEqual(report.crashLines, [], "uncaught error lines after the fault");
  assert(report.heldBeforeAnswer.some((h) => h.clientGone), "stop() did not abort the stopped connection's handshake");
  assert(report.guardLines.some((l) => l.includes("stopped connection socket error (ignored)")), "the guard did not log the stopped socket's error");
  assert(report.start.ok, `channels.start: ${JSON.stringify(report.start)}`);
  assert(report.after.acked && /收到/u.test(report.after.reply), "no reply after the reconnect");
  assert(report.send.ok && report.send.delivered > 0, `Gateway send after the reconnect: ${JSON.stringify(report.send)}`);
  assert(report.health.ok !== false && !report.health.error, `health: ${JSON.stringify(report.health)}`);
  assert(report.stillAlive);
}
console.log(`ok: DG_EXPECT=${EXPECT}`);
