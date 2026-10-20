// Candidate smoke for the WeCom inter-session bridge (WP8, docs/inter-session/design.md §3.9).
//
// V's WeCom plugin (code from the Oct 4 tarball for node_modules, with V's current
// channel.js / v-experience.mjs from the 20261020 capture and the bridge's generated
// monitor.js) runs in a private Gateway against the loopback fake WeCom robot socket.
// A candidate-only probe plugin drives the registered bridge the way v-session-relay will
// (resolveRoute → post → start → done), so real model turns on the VLab Worker show:
//   S1  a person's message still runs the normal stream path (regression);
//   S2  an inter-session request into that session: the preset runId is adopted (A2), the
//       run start is reported (A1 on WeCom), the final comes back, the answer goes out as a
//       new markdown message, and nothing ever answers the synthetic req_id (846605);
//   S3  the same into a session that never had an inbound (route only from delivery.to).
// No WP1 core guard here, so BUSY is not exercised (offline test covers the plugin side).
// Nothing talks to WeCom; no shared VLab channel is connected.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeWeComAibot } from "./wecom-fake-aibot.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const MODEL = process.env.ISW_MODEL ?? "deepseek/deepseek-v4-flash";
const TARBALL_NAME = "wecom-openclaw-plugin-2026.8.17-vlab.2-v.tgz";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const CAPTURE = "release/captured/v2026.9.1-db91.6-subagent-index-20261020.wecom/dist";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v && v.length >= 8) out = out.replaceAll(v, "[redacted]");
  return out;
};
const readSecret = (name) => {
  if (!fs.existsSync(SECRETS)) return undefined;
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
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

const report = { model: MODEL, steps: [], scenarios: {} };
const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---------------------------------------------------------------- the plugin, as V runs it + the bridge
const pluginDir = path.join(scratch, "wecom-openclaw-plugin");
fs.mkdirSync(pluginDir, { recursive: true });
const tarball = findInput(TARBALL_NAME);
assert(tarball, `${TARBALL_NAME} support input is missing`);
assert.equal(spawnSync("tar", ["xzf", path.resolve(tarball), "-C", pluginDir]).status, 0, "extract WeCom plugin");
const manifest = JSON.parse(fs.readFileSync("lab/release-files/wecom-inter-session-bridge/manifest.json", "utf8"))[0];
const captureManifest = JSON.parse(fs.readFileSync("release/captured/v2026.9.1-db91.6-subagent-index-20261020.wecom/manifest.json", "utf8"));
for (const rel of ["dist/src/channel.js", "dist/src/v-experience.mjs"]) {
  const bytes = fs.readFileSync(path.join(CAPTURE, rel));
  assert.equal(sha256(bytes), captureManifest.files.find((f) => f.path === `./${rel}`).sha256, `${rel} is V's`);
  fs.writeFileSync(path.join(pluginDir, rel), bytes);
}
const generated = fs.readFileSync("lab/release-files/wecom-inter-session-bridge/dist/src/monitor.js");
assert.equal(sha256(generated), manifest.after, "the generated monitor.js");
assert.equal(sha256(fs.readFileSync(path.join(CAPTURE, "dist/src/monitor.js"))), manifest.before, "the capture is V's monitor.js");
fs.writeFileSync(path.join(pluginDir, "dist/src/monitor.js"), generated);
report.plugin = { monitor: manifest.after, base: manifest.before };

const { WebSocketServer } = createRequire(path.join(pluginDir, "node_modules", "noop.js"))("ws");
const fake = createFakeWeComAibot({ WebSocketServer });
const wsPort = await fake.listen();

// ---------------------------------------------------------------- probe plugin: drives the bridge like v-session-relay
const probeDir = path.join(scratch, "isc-wecom-smoke-plugin");
fs.mkdirSync(probeDir, { recursive: true, mode: 0o700 });
const contractsUrl = pathToFileURL(path.resolve("apps/v-session-relay/plugin/core/contracts.js")).href;
fs.writeFileSync(path.join(probeDir, "package.json"), JSON.stringify({ name: "isc-wecom-smoke", version: "0.0.0", private: true, type: "module", openclaw: { extensions: ["./index.js"] } }, null, 2));
fs.writeFileSync(path.join(probeDir, "openclaw.plugin.json"), JSON.stringify({ id: "isc-wecom-smoke", name: "ISC WeCom smoke", description: "Candidate-only driver for the WeCom inter-session bridge.", activation: { onStartup: true }, configSchema: { type: "object", additionalProperties: false, properties: {} } }, null, 2));
fs.writeFileSync(path.join(probeDir, "index.js"), `import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import * as C from ${JSON.stringify(contractsUrl)};
const runs = (globalThis.__iscWecomSmokeRuns ??= new Map());
export default definePluginEntry({
  id: "isc-wecom-smoke",
  name: "ISC WeCom smoke",
  description: "Candidate-only driver for the WeCom inter-session bridge.",
  register(api) {
    api.registerGatewayMethod("iscwecom.drive", async ({ params }) => {
      const reg = C.getBridgeRegistry();
      const bridge = reg.bridges.get("wecom:default");
      if (!bridge) return { error: "no wecom bridge", keys: [...reg.bridges.keys()] };
      const valid = C.validateBridge(bridge);
      const routed = await bridge.resolveRoute({ sessionKey: params.sessionKey, agentId: "makaron", delivery: { channel: "wecom", to: "wecom:" + params.userId, accountId: "default" }, ownerIds: [] });
      if (!routed.ok) return { valid, routed };
      const sendId = C.newSendId();
      const chainId = C.newChainId();
      const code = C.newCode();
      const ids = C.startIds({ channel: "wecom", kind: "request", id: sendId, attempt: 0 });
      const post = await bridge.post({ route: routed.route, text: "**📨 来自「candidate」的请求 #" + code + "**\\n—\\n" + params.text + "\\n（企业微信里看不到处理过程，做完会发结果）", idempotencyKey: "iscwecom:" + sendId }).catch((e) => ({ error: String(e?.message ?? e), code: e?.code }));
      const req = {
        route: routed.route, sessionKey: params.sessionKey, agentId: "makaron", kind: "request", id: sendId, attempt: 0, ...ids,
        anchorMessageId: post.messageId ?? null, promptText: params.text,
        channelPromptContext: "[会话协作 #" + code + "] 这是候选测试里的一条会话协作请求。你在这里的最终回复就是交回的结果。",
        provenance: { kind: "inter_session", sourceSessionKey: "agent:makaron:feishu:direct:ou_iscwecomsmoke", sourceChannel: "feishu", sourceTool: "sessions_send", originSessionId: C.originSessionIdFor({ chainId, depth: 1, kind: "request", id: sendId }) },
        sender: { id: C.syntheticSenderIdFor(chainId), name: "「candidate」的 V（会话协作）", isOwnerIdentity: false },
        routePeerId: routed.route.peerId,
      };
      const check = C.validateStartRequest(req);
      const t0 = Date.now();
      const outcome = await bridge.start(req);
      const entry = { startedMs: Date.now() - t0, outcome: { ...outcome, done: undefined }, run: null };
      runs.set(sendId, entry);
      if (outcome.status === "started") outcome.done.then((run) => { entry.run = run; entry.doneMs = Date.now() - t0; entry.runValid = C.validateRunOutcome(run); }, (e) => { entry.run = { rejected: String(e) }; });
      return { valid, route: routed.route, post, code, sendId, runId: ids.runId, messageSid: ids.messageSid, check, startValid: C.validateStartOutcome(outcome), ...entry };
    }, { scope: "operator.write" });
    api.registerGatewayMethod("iscwecom.result", async ({ params }) => runs.get(params.sendId) ?? { missing: true }, { scope: "operator.write" });
  },
});
`);

// ---------------------------------------------------------------- Gateway config (same recipe as wecom-experience.mjs)
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const gatewayToken = config.gateway?.auth?.token;
secrets.add(gatewayToken);
config.channels = {
  wecom: {
    enabled: true, connectionMode: "websocket", botId: "candidate-bot", secret: "candidate-fake-secret",
    websocketUrl: `ws://127.0.0.1:${wsPort}`, dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"],
  },
};
config.plugins.load = { ...(config.plugins.load ?? {}), paths: [...(config.plugins.load?.paths ?? []).filter((p) => !/wecom/u.test(p)), pluginDir, probeDir] };
config.plugins.entries = { ...(config.plugins.entries ?? {}), "wecom-openclaw-plugin": { enabled: true }, "isc-wecom-smoke": { enabled: true, config: {} } };
if (Array.isArray(config.plugins.allow)) for (const id of ["wecom-openclaw-plugin", "isc-wecom-smoke"]) if (!config.plugins.allow.includes(id)) config.plugins.allow.push(id);
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "wecom"), { agentId: "makaron", match: { channel: "wecom" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  if (workerConfig.cron) workerConfig.cron.enabled = false;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODEL };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "wecom-openclaw-plugin"')));
}

const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: path.join(scratch, "tmp"), XDG_CACHE_HOME: path.join(scratch, "cache"), npm_config_cache: path.join(scratch, "cache", "npm") };
for (const name of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  const value = readSecret(name);
  if (value) { env[name] = value; secrets.add(value); }
}
const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (const s of [gateway.stdout, gateway.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
    if (lines.length > 30_000) lines.splice(0, lines.length - 30_000);
  });
}
const waitFor = async (predicate, ms, label) => {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const value = await predicate();
    if (value) return value;
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}`);
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
};
let client;
async function rpc(method, params, timeoutMs = 30_000) {
  if (!client) {
    const { GatewayClient } = await import(pathToFileURL(`${dist}/plugin-sdk/gateway-runtime.js`).href);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: gatewayToken, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
      client.start();
    });
  }
  return client.request(method, params, { timeoutMs });
}
const streamsFor = (chatId, since) => fake.streams().filter((s) => s.chatId === chatId && s.createdAt >= since);
const proactiveFor = (chatId, since) => fake.proactive.filter((m) => m.chatId === chatId && m.at >= since);
const findKeys = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) findKeys(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k === "key" || k === "sessionKey" || typeof v === "object") findKeys(v, out);
  return out;
};

async function drive(name, { userId, sessionKey, text, token }) {
  const since = Date.now();
  const respondsBefore = fake.respondAttempts.length;
  const started = await rpc("iscwecom.drive", { userId, sessionKey, text }, 120_000);
  const result = started.outcome?.status === "started"
    ? await waitFor(async () => { const r = await rpc("iscwecom.result", { sendId: started.sendId }); return r.run ? r : null; }, 420_000, `${name} done`)
    : started;
  await waitFor(() => proactiveFor(userId, since).some((m) => m.text?.includes(token)), 30_000, `${name} final in the chat`).catch(() => null);
  await sleep(2000);
  const responds = fake.respondAttempts.slice(respondsBefore);
  return {
    started: { ...started, check: started.check?.ok ?? started.check, valid: started.valid?.ok ?? started.valid },
    run: result.run ?? null, runValid: result.runValid ?? null, doneMs: result.doneMs ?? null,
    presetAdopted: started.outcome?.runId === started.runId,
    proactive: proactiveFor(userId, since).map((m) => ({ msgtype: m.msgtype, text: String(m.text ?? "").slice(0, 400) })),
    streams: streamsFor(userId, since).map((s) => ({ finished: s.finished, content: s.content.slice(0, 200) })),
    respondAttempts: responds.map((a) => ({ reqId: a.reqId, rejected: a.rejected })),
    respondsToSyntheticReqId: responds.filter((a) => a.reqId === started.messageSid).length,
    unknownReqIdResponds: fake.respondsToUnknownReqIds().length,
    bridgeLog: lines.filter((l) => l.at >= since && /inter-session/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-10),
  };
}

try {
  await waitFor(() => fake.authenticated(), 600_000, "WeCom socket authentication");
  await sleep(3000);
  report.steps.push({ at: new Date().toISOString(), step: "authenticated" });

  // S1: a person's message (regression; also creates the session S2 targets).
  {
    const since = Date.now();
    const userId = "candIscA";
    const { reqId } = fake.sendUserText({ userId, text: "这是自动化测试。只回复 HELLO_ISC_WECOM，不要做别的。" });
    await waitFor(() => streamsFor(userId, since).some((s) => s.finished && /HELLO_ISC_WECOM/u.test(s.content)), 420_000, "S1 reply");
    const listed = await rpc("sessions.list", {}, 30_000).catch((e) => ({ error: String(e?.message ?? e) }));
    const keys = [...new Set(findKeys(listed).filter((k) => /wecom/iu.test(k) && /candisca/iu.test(k)))];
    report.scenarios.S1 = {
      streams: streamsFor(userId, since).map((s) => ({ finished: s.finished, content: s.content.slice(0, 200) })),
      respondsOnOwnReqId: fake.respondAttempts.filter((a) => a.reqId === reqId && !a.rejected).length,
      unknownReqIdResponds: fake.respondsToUnknownReqIds().length,
      sessionKeys: keys,
    };
    assert.equal(keys.length, 1, `one WeCom session for candIscA: ${JSON.stringify(keys)}`);
  }
  const keyA = report.scenarios.S1.sessionKeys[0];

  // S2: an inter-session request into that session.
  const tokenA = `ISC_WECOM_OK_${crypto.randomBytes(3).toString("hex")}`;
  report.scenarios.S2 = await drive("S2", { userId: "candIscA", sessionKey: keyA, text: `这是一条会话协作测试请求。只回复 ${tokenA}，不要调用任何工具，不要做别的。`, token: tokenA });
  try {
    const history = await rpc("chat.history", { sessionKey: keyA, limit: 4 }, 30_000);
    report.scenarios.S2.transcriptTail = redact(JSON.stringify(history)).slice(-1500);
  }
  catch (e) { report.scenarios.S2.transcriptTail = `chat.history failed: ${String(e?.message ?? e).slice(0, 200)}`; }

  // S3: a session that never had an inbound (the key S1's route would give candIscB).
  const keyB = keyA.replace(/candisca/iu, "candiscb");
  const tokenB = `ISC_WECOM_NEW_${crypto.randomBytes(3).toString("hex")}`;
  report.scenarios.S3 = await drive("S3", { userId: "candIscB", sessionKey: keyB, text: `这是一条会话协作测试请求（新会话）。只回复 ${tokenB}，不要调用任何工具。`, token: tokenB });
  report.scenarios.S3.sessionKey = keyB;

  report.frameCommands = [...new Set(fake.frames.map((f) => f.cmd))];
  report.wecomErrors = lines.filter((l) => /wecom/iu.test(l.line) && /error|failed|threw|846605/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-25);
} catch (error) {
  report.fatal = redact(String(error?.stack ?? error)).slice(0, 3000);
  report.gatewayTail = lines.slice(-120).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  try { client?.stop?.(); } catch { }
  gateway.kill("SIGTERM");
  await sleep(3000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await fake.close();
}

console.log(redact(JSON.stringify(report, null, 1)));

if (!report.fatal) {
  const s = report.scenarios;
  assert(s.S1.streams.some((x) => x.finished && /HELLO_ISC_WECOM/u.test(x.content)), "S1: the person's reply stream");
  assert(s.S1.respondsOnOwnReqId >= 1, "S1: the person's turn replied on its own req_id");
  for (const name of ["S2", "S3"]) {
    const r = s[name];
    assert.equal(r.started.valid, true, `${name}: bridge invalid`);
    assert.equal(r.started.check, true, `${name}: start request invalid`);
    assert.equal(r.started.outcome?.status, "started", `${name}: ${JSON.stringify(r.started.outcome)}`);
    assert(r.presetAdopted, `${name}: preset runId not adopted (${r.started.outcome?.runId} vs ${r.started.runId})`);
    assert.equal(r.runValid?.ok, true, `${name}: run outcome invalid ${JSON.stringify(r.runValid)}`);
    assert.equal(r.run.status, "ok", `${name}: ${JSON.stringify(r.run)}`);
    assert(r.run.finals.some((f) => /ISC_WECOM_(OK|NEW)_/u.test(f.text ?? "")), `${name}: final ${JSON.stringify(r.run.finals)}`);
    assert(r.proactive.some((m) => /📨 来自「candidate」的请求/u.test(m.text)), `${name}: no request anchor`);
    assert(r.proactive.some((m) => /ISC_WECOM_(OK|NEW)_/u.test(m.text)), `${name}: the answer did not reach the chat`);
    assert.deepEqual(r.streams, [], `${name}: a stream was opened`);
    assert.equal(r.respondsToSyntheticReqId, 0, `${name}: something answered the synthetic req_id`);
    assert.equal(r.unknownReqIdResponds, 0, `${name}: a reply to an unknown req_id was attempted`);
  }
}
