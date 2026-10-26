// Candidate probe for the inter-session design (docs/inter-session/design.md §12.1 A1, A2,
// A3, A4, A6). Answers by execution, in a private Gateway on V's bytes:
//
//   A1  Does a custom replyOptions field (vInterSession) put on the Feishu inbound path reach
//       get-reply's opts at the G:3584 admission site?  (Also: does ctx.VInterSession, the
//       fallback, arrive?)
//   A2  Is GetReplyOptions.runId honoured: the runId onAgentRunStart reports vs the preset,
//       per harness (worker; vds = Codex app-server; vcc = claude-cli).
//   A3  With the WP2 wiring (openclaw-tools passes runId / requesterSenderId / senderIsOwner /
//       agentAccountId / agentTo / agentThreadId), what reaches createSessionsSendTool's opts
//       when sessions_send executes inside a worker turn (and a vds / vcc turn)?
//   A4  The exact error text sessions_send's own gatewayCall gets for the unknown method
//       vrelay.send with scopes ["operator.write"], from a worker tool context (Gateway client
//       over the wire) and from the in-process dispatch (vds / vcc tools run in the Gateway);
//       also without explicit scopes, and that a plugin method registered with operator.write
//       is callable both ways.
//   A6  Does a Gateway plugin's onAgentEvent (openclaw/plugin-sdk/agent-harness-runtime) see
//       the lifecycle start/end of a worker run, with runId and sessionKey?
//
// How: everything is private to this candidate run.
//   - Feishu runs in loopback webhook mode against a fake Feishu REST API on 127.0.0.1 (fake
//     app id, no real credentials, no long connection, nothing reaches a real chat). Inbound
//     messages are signed, encrypted im.message.receive_v1 events posted to the webhook, so the
//     real Feishu handler, the durable ingress, the channel turn, get-reply and the harness run.
//   - Temporary instrumentation patches (this run's runtime copy only): G logs what it sees at
//     the admission site; the Feishu monitor puts a preset runId + vInterSession on the
//     replyOptions of a message carrying ISCPROBE-PRESET:<sendId> and logs onAgentRunStart;
//     openclaw-tools gets the §3.2 wiring; sessions_send, for a message containing ISCPROBE,
//     logs its opts, makes the four gateway calls and returns an error result (no real send).
//   - A Gateway-only probe plugin (isc-probe) registers iscprobe.echo (operator.write) and
//     logs every lifecycle agent event.
//   All probe lines go to $VLAB_CANDIDATE_DATA/isc-probe.jsonl; the summary is printed.
//
// ISC_HARNESSES=worker,vds (the plan's default; add vcc once VLab's claude login works again: on
// 2026-10-20 it failed with "OAuth session expired and could not be refreshed"). vds copies the shared managed npm plugins (Codex with
// V's /vds patches) and writes a DeepSeek provider into the agent's codex-home; vcc uses the
// claude binary and login already present for the shared VLab user (VLab's /vcc model
// anthropic/claude-opus-5, not V's private 2.1.280 + claude-opus-5-5).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";

import { newSendId, runIdFor, RELAY_FALLBACK_RE } from "../../apps/v-session-relay/plugin/core/contracts.js";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const HARNESSES = (process.env.ISC_HARNESSES ?? "worker,vds").split(",").map((s) => s.trim()).filter(Boolean);
const MODELS = { worker: "deepseek/deepseek-flash", vds: "deepseek/vds-deepseek-flash", vcc: "anthropic/claude-opus-5" };
const RUNTIME_OF = { worker: "vlab-worker", vds: "codex", vcc: "claude-cli" };
for (const h of HARNESSES) assert(MODELS[h], `unknown harness ${h}`);
const TURN_TIMEOUT_MS = Number(process.env.ISC_TURN_TIMEOUT_MS ?? 420_000);
const PROBE_LOG = path.join(data, "isc-probe.jsonl");
const APP_ID = "cli_15c0be0015c0be00"; // SDK shape cli_ + 16 hex; not a real app
const BOT = "ou_iscprobe0bot";
const OWNERS = { worker: "ou_iscprobe0worker", vds: "ou_iscprobe0vds", vcc: "ou_iscprobe0vcc" };
const TARGET_KEY = "agent:makaron:feishu:group:oc_iscprobe0target";
const VERIFICATION_TOKEN = "isc-probe-verification-token";
const ENCRYPT_KEY = "isc-probe-encrypt-key-000000000000";
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const since = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v && v.length >= 8) out = out.replaceAll(v, "[redacted]");
  return out;
};
const summary = { startedAt: new Date().toISOString(), harnesses: HARNESSES, steps: [], notes: [], harness: {}, answers: {} };
const step = (name, extra = {}) => { summary.steps.push({ at: since(), name, ...extra }); console.error(`[${since()}] ${name} ${redact(JSON.stringify(extra))}`); };
function readSecret(name) {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
}
const readProbe = () => (fs.existsSync(PROBE_LOG) ? fs.readFileSync(PROBE_LOG, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { unparsable: l.slice(0, 200) }; } }) : []);

// ---------------------------------------------------------------- V's bytes in this runtime
const dist = path.join(runtime, "openclaw", "dist");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "Feishu plugin must come from this private runtime");
const fixture = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/inter-session-v-bytes.json", import.meta.url), "utf8"));
const vSha = Object.fromEntries(fixture.files.map((f) => [f.file, f.sha256]));
const FILES = {
  G: path.join(dist, "get-reply-CqW1y05D.js"),
  S: path.join(dist, "sessions-spawn-tool-1FQMTkIo.js"),
  T: path.join(dist, "openclaw-tools-BODVdJQD.js"),
  M: path.join(feishuDir, "dist", "monitor.account-WFdlCDhR.js"),
};
summary.startingBytes = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, sha256(fs.readFileSync(f)) === vSha[path.basename(f)] ? "V" : "differs"]));
for (const [k, v] of Object.entries(summary.startingBytes)) assert.equal(v, "V", `${k} (${path.basename(FILES[k])}) does not start from V's bytes`);

// ---------------------------------------------------------------- temporary instrumentation
const WRITER = `\n// isc-probe (candidate-only instrumentation)\nfunction __iscProbeWrite(o) { try { process.getBuiltinModule("node:fs").appendFileSync(${JSON.stringify(PROBE_LOG)}, JSON.stringify({ at: Date.now(), pid: process.pid, ...o }) + "\\n"); } catch {} }\n`;
function patchFile(file, pairs, { writer = true } = {}) {
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    assert.equal(src.split(from).length - 1, 1, `probe anchor must match once in ${path.basename(file)}: ${JSON.stringify(from.slice(0, 90))}`);
    src = src.replace(from, to);
  }
  if (writer) src += WRITER;
  fs.writeFileSync(file, src);
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(check.status, 0, `node --check ${path.basename(file)}: ${check.stderr}`);
}

// G: what the admission site sees (A1).
patchFile(FILES.G, [[
  '\tconst queueAdmissionState = !pendingQueue ? "empty" : pendingQueue.items.some((item) => !item.steerPending) || pendingQueue.inFlight.size > 0 || pendingQueue.droppedCount > 0 ? "ready" : "steering";\n',
  '\tconst queueAdmissionState = !pendingQueue ? "empty" : pendingQueue.items.some((item) => !item.steerPending) || pendingQueue.inFlight.size > 0 || pendingQueue.droppedCount > 0 ? "ready" : "steering";\n'
  + '\ttry { const __vI = opts?.vInterSession, __cI = ctx?.VInterSession; __iscProbeWrite({ probe: "get-reply-admission", sessionKey, optsRunId: opts?.runId ?? null, optsVInterSession: typeof __vI, vInterSessionId: __vI?.id ?? null, vInterSessionExclusive: __vI?.exclusive ?? null, vInterSessionOnBusy: typeof __vI?.onBusy, ctxVInterSession: typeof __cI, ctxVInterSessionId: __cI?.id ?? null, optsOnAgentRunStart: typeof opts?.onAgentRunStart, optsOnDeliberateSilentTerminalReply: typeof opts?.onDeliberateSilentTerminalReply, isActive, activeSessionId: activeSessionId ?? null, queueAdmissionState, recoveryOwnerActive }); } catch (__e) { __iscProbeWrite({ probe: "get-reply-admission-error", error: String(__e) }); }\n',
]]);

// S: what createSessionsSendTool's opts carry, and what its gatewayCall gets back (A3, A4).
patchFile(FILES.S, [[
  '\t\t\tconst message = readToolStringParam(params, "message", { required: true });\n',
  '\t\t\tconst message = readToolStringParam(params, "message", { required: true });\n'
  + '\t\t\tif (message.includes("ISCPROBE")) {\n'
  + '\t\t\t\tconst __probe = { probe: "sessions_send", toolCallId: _toolCallId, message: message.slice(0, 120), process: { argv: process.argv.slice(1, 3).map((a) => String(a).slice(-80)), ipcChild: typeof process.send === "function" }, inProcessGatewayContext: (() => { try { return hasInProcessGatewayToolContext(); } catch (e) { return "error: " + String(e).slice(0, 80); } })(),\n'
  + '\t\t\t\t\topts: { runId: opts?.runId ?? null, requesterSenderId: opts?.requesterSenderId ?? null, senderIsOwner: opts?.senderIsOwner ?? null, agentChannel: opts?.agentChannel ?? null, agentAccountId: opts?.agentAccountId ?? null, agentTo: opts?.agentTo ?? null, agentThreadId: opts?.agentThreadId ?? null, agentSessionKey: opts?.agentSessionKey ?? null, agentId: opts?.agentId ?? null, sandboxed: opts?.sandboxed ?? null, callGatewayOverride: typeof opts?.callGateway === "function" }, calls: {} };\n'
  + '\t\t\t\tfor (const [name, method, scopes] of [["unknownWrite", "vrelay.send", ["operator.write"]], ["unknownDefault", "vrelay.send", void 0], ["pluginWrite", "iscprobe.echo", ["operator.write"]], ["pluginDefault", "iscprobe.echo", void 0]]) {\n'
  + '\t\t\t\t\tconst __t0 = Date.now();\n'
  + '\t\t\t\t\ttry { const r = await gatewayCall({ method, params: { v: 1, probe: name }, ...scopes ? { scopes } : {}, timeoutMs: 15e3 }); __probe.calls[name] = { ok: true, ms: Date.now() - __t0, result: r }; }\n'
  + '\t\t\t\t\tcatch (err) { __probe.calls[name] = { ok: false, ms: Date.now() - __t0, message: formatErrorMessage(err), rawMessage: String(err?.message ?? err), errorName: err?.name ?? null, code: err?.code ?? err?.gatewayCode ?? null, details: err?.details ?? err?.data ?? null }; }\n'
  + '\t\t\t\t}\n'
  + '\t\t\t\t__iscProbeWrite(__probe);\n'
  + '\t\t\t\treturn jsonResult({ runId: crypto.randomUUID(), status: "error", error: "ISCPROBE recorded. This was a connectivity probe: do not call sessions_send again; reply with the single word DONE." });\n'
  + '\t\t\t}\n',
]]);

// openclaw-tools: the WP2 wiring of design §3.2, so A3 measures what that wiring delivers.
patchFile(FILES.T, [[
  '\t\t\tcreateSessionsSendTool({\n\t\t\t\tagentId: sessionAgentId,\n\t\t\t\tagentSessionKey: options?.agentSessionKey,\n\t\t\t\tagentChannel: options?.agentChannel,\n\t\t\t\tsandboxed: options?.sandboxed,\n\t\t\t\tconfig: sessionConfig\n\t\t\t})',
  '\t\t\tcreateSessionsSendTool({\n\t\t\t\tagentId: sessionAgentId,\n\t\t\t\tagentSessionKey: options?.agentSessionKey,\n\t\t\t\tagentChannel: options?.agentChannel,\n\t\t\t\tsandboxed: options?.sandboxed,\n\t\t\t\tconfig: sessionConfig,\n'
  + '\t\t\t\trunId: options?.runId, requesterSenderId: options?.requesterSenderId ?? void 0, senderIsOwner: options?.senderIsOwner,\n'
  + '\t\t\t\tagentAccountId: options?.agentAccountId, agentTo: options?.agentTo, agentThreadId: options?.agentThreadId\n\t\t\t})',
]], { writer: false });

// Feishu monitor: a message carrying ISCPROBE-PRESET:<sendId> gets the bridge's replyOptions
// (preset runId, vInterSession, wrapped onAgentRunStart) and ctx.VInterSession (A1, A2).
patchFile(FILES.M, [[
  '\t\t\t\t\tresolveTurn: () => ({\n',
  '\t\t\t\t\tresolveTurn: () => __iscProbeTurn(ctx, {\n',
]]);
fs.appendFileSync(FILES.M, `
function __iscProbeTurn(ctx, turn) {
\ttry {
\t\tconst m = /ISCPROBE-PRESET:(s_[0-9a-z]+)/u.exec(String(ctx?.content ?? ""));
\t\tif (!m) return turn;
\t\tconst id = m[1];
\t\tconst preset = "v-a2a-req-" + id + "-0";
\t\tconst ro = turn.replyOptions ?? {};
\t\tconst orig = ro.onAgentRunStart;
\t\tconst vInterSession = { exclusive: false, id, kind: "request", onBusy: (info) => __iscProbeWrite({ probe: "feishu-onBusy", id, info }) };
\t\tlet ctxSet = false;
\t\ttry { if (turn.ctxPayload && typeof turn.ctxPayload === "object") { turn.ctxPayload.VInterSession = vInterSession; ctxSet = true; } } catch (e) { __iscProbeWrite({ probe: "feishu-ctx-payload-error", error: String(e) }); }
\t\t__iscProbeWrite({ probe: "feishu-reply-options", id, preset, sessionKey: turn.route?.sessionKey ?? null, hadOnAgentRunStart: typeof orig, ctxSet, replyOptionKeys: Object.keys(ro).sort() });
\t\treturn { ...turn, replyOptions: { ...ro, runId: preset, vInterSession, onAgentRunStart: (runId, ...rest) => {
\t\t\t__iscProbeWrite({ probe: "feishu-onAgentRunStart", id, preset, runId, honoured: runId === preset, sessionKey: turn.route?.sessionKey ?? null });
\t\t\treturn orig?.(runId, ...rest);
\t\t} } };
\t} catch (e) {
\t\t__iscProbeWrite({ probe: "feishu-reply-options-error", error: String(e) });
\t\treturn turn;
\t}
}
`);
assert.equal(spawnSync(process.execPath, ["--check", FILES.M]).status, 0, "node --check monitor after probe helper");
summary.instrumented = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, sha256(fs.readFileSync(f)).slice(0, 16)]));

// Candidate-only: the private runtime has no official install record for the relocated Feishu
// plugin, so the trusted-runtime gate would refuse its ingress queue (as feishu-dm-approvals).
{
  const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
  const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
  assert(loaderFile, "trusted-runtime gate not found");
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}

// ---------------------------------------------------------------- the Gateway-only probe plugin (A4 positive, A6)
const pluginDir = path.join(data, "isc-probe-plugin");
fs.mkdirSync(pluginDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(pluginDir, "package.json"), JSON.stringify({ name: "isc-probe", version: "0.0.0", private: true, type: "module", openclaw: { extensions: ["./index.js"] } }, null, 2));
fs.writeFileSync(path.join(pluginDir, "openclaw.plugin.json"), JSON.stringify({ id: "isc-probe", name: "ISC probe", description: "Candidate-only probe for the inter-session design.", activation: { onStartup: true }, configSchema: { type: "object", additionalProperties: false, properties: {} } }, null, 2));
fs.writeFileSync(path.join(pluginDir, "index.js"), `import fs from "node:fs";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import * as harness from "openclaw/plugin-sdk/agent-harness-runtime";
const LOG = ${JSON.stringify(PROBE_LOG)};
const write = (o) => { try { fs.appendFileSync(LOG, JSON.stringify({ at: Date.now(), pid: process.pid, ...o }) + "\\n"); } catch {} };
let moduleRegistrations = 0;
export default definePluginEntry({
  id: "isc-probe",
  name: "ISC probe",
  description: "Candidate-only probe for the inter-session design.",
  register(api) {
    moduleRegistrations += 1;
    globalThis.__iscProbeRegistrations = (globalThis.__iscProbeRegistrations ?? 0) + 1;
    const registration = globalThis.__iscProbeRegistrations;
    write({ probe: "plugin-register", registration, moduleRegistrations, argv: process.argv.slice(1, 3).map((a) => String(a).slice(-60)), onAgentEvent: typeof harness.onAgentEvent, resolveActiveEmbeddedRunSessionId: typeof harness.resolveActiveEmbeddedRunSessionId });
    api.registerGatewayMethod("iscprobe.echo", async ({ params, client }) => {
      const r = { ok: true, echo: params ?? null, client: { scopes: client?.connect?.scopes ?? null, mode: client?.connect?.client?.mode ?? null, clientId: client?.connect?.client?.id ?? null, internal: Boolean(client?.internal) } };
      write({ probe: "plugin-method", method: "iscprobe.echo", ...r });
      return r;
    }, { scope: "operator.write" });
    const streams = new Map();
    const off = harness.onAgentEvent?.((evt) => {
      try {
        if (evt.stream !== "lifecycle") {
          const c = streams.get(evt.runId) ?? {};
          c[evt.stream] = (c[evt.stream] ?? 0) + 1;
          streams.set(evt.runId, c);
          if (c[evt.stream] === 1 || evt.stream === "run_status") write({ probe: "agent-event-other", registration, stream: evt.stream, runId: evt.runId, sessionKey: evt.sessionKey ?? null, seq: evt.seq, dataKeys: Object.keys(evt.data ?? {}).sort(), status: evt.stream === "run_status" ? JSON.stringify(evt.data).slice(0, 240) : undefined });
          return;
        }
        let activeEmbedded = null;
        try { activeEmbedded = evt.sessionKey ? (harness.resolveActiveEmbeddedRunSessionId?.(evt.sessionKey) ?? null) : null; } catch (e) { activeEmbedded = "error:" + String(e).slice(0, 80); }
        write({ probe: "agent-event", registration, phase: evt.data?.phase ?? null, runId: evt.runId, sessionKey: evt.sessionKey ?? null, sessionId: evt.sessionId ?? null, agentId: evt.agentId ?? null, seq: evt.seq, activeEmbedded, otherStreams: streams.get(evt.runId) ?? null, error: evt.data?.error ? String(evt.data.error).slice(0, 200) : undefined });
      } catch (e) { write({ probe: "agent-event-error", error: String(e) }); }
    });
    write({ probe: "plugin-subscribed", registration, subscribed: typeof off === "function" });
  },
});
`);

// ---------------------------------------------------------------- fake Feishu REST (loopback, self-signed)
const fake = { requests: [], replies: [], creates: [], unknown: new Map() };
const tlsDir = path.join(data, "fake-feishu-tls");
fs.mkdirSync(tlsDir, { recursive: true, mode: 0o700 });
const certFile = path.join(tlsDir, "cert.pem");
const keyFile = path.join(tlsDir, "key.pem");
const openssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyFile, "-out", certFile], { encoding: "utf8" });
assert.equal(openssl.status, 0, `openssl failed: ${openssl.stderr}`);
const json = (res, body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const fakeServer = https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, async (req, res) => {
  const url = new URL(req.url, "http://fake");
  let body = "";
  for await (const chunk of req) body += chunk;
  const p = url.pathname;
  fake.requests.push({ at: Date.now(), method: req.method, path: p.replace(/o[mcu]_[A-Za-z0-9_-]+/gu, ":id") });
  let m;
  if (p.endsWith("/tenant_access_token/internal") || p.endsWith("/app_access_token/internal")) return json(res, { code: 0, msg: "ok", tenant_access_token: "t-fake", app_access_token: "a-fake", expire: 7200 });
  if (p === "/open-apis/bot/v3/info") return json(res, { code: 0, msg: "ok", bot: { open_id: BOT, app_name: "V", activate_status: 2 } });
  if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reply$/u))) {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    fake.replies.push({ to: m[1], at: Date.now(), msgType: parsed.msg_type, text: String(parsed.content ?? "").slice(0, 300) });
    return json(res, { code: 0, msg: "ok", data: { message_id: `om_reply_${fake.replies.length}`, chat_id: "oc_x", create_time: String(Date.now()) } });
  }
  if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reactions/u))) return json(res, { code: 0, msg: "ok", data: { reaction_id: `r_${Date.now()}` } });
  if (p === "/open-apis/im/v1/messages" && req.method === "POST") {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    fake.creates.push({ to: parsed.receive_id, at: Date.now(), msgType: parsed.msg_type, text: String(parsed.content ?? "").slice(0, 300) });
    return json(res, { code: 0, msg: "ok", data: { message_id: `om_create_${fake.creates.length}` } });
  }
  if (p === "/open-apis/im/v1/messages" && req.method === "GET") return json(res, { code: 0, msg: "ok", data: { items: [], has_more: false } });
  if ((m = p.match(/^\/open-apis\/im\/v1\/chats\/([^/]+)$/u))) return json(res, { code: 0, msg: "ok", data: { chat_id: m[1], name: "isc probe", chat_mode: "group", chat_type: "private", owner_id: OWNERS.worker, user_count: "1" } });
  if (p.startsWith("/open-apis/contact/v3/users/")) return json(res, { code: 0, msg: "ok", data: { user: { name: "Probe Owner", open_id: OWNERS.worker } } });
  if (p.startsWith("/open-apis/cardkit/v1/cards") && req.method === "POST" && /\/cards$/u.test(p)) return json(res, { code: 0, msg: "ok", data: { card_id: `card_${crypto.randomUUID()}` } });
  const key = `${req.method} ${p.replace(/o[mcu]_[A-Za-z0-9_-]+|card_[0-9a-f-]+/gu, ":id")}`;
  fake.unknown.set(key, (fake.unknown.get(key) ?? 0) + 1);
  return json(res, { code: 0, msg: "ok", data: {} });
});
await new Promise((resolve) => fakeServer.listen(0, "127.0.0.1", resolve));
const FAKE_URL = `https://127.0.0.1:${fakeServer.address().port}`;
async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => { s.once("error", reject); s.listen(0, "127.0.0.1", resolve); });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const WEBHOOK_PORT = await freePort();
const WEBHOOK_PATH = "/candidate/isc-probe";

// ---------------------------------------------------------------- private config
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const gatewayToken = config.gateway?.auth?.token;
secrets.add(gatewayToken);
const { appId: _appId, appSecret: _appSecret, domain: _domain, ...feishuShape } = config.channels?.feishu ?? {};
config.channels = {
  feishu: {
    ...feishuShape, enabled: true, appId: APP_ID, appSecret: "isc-probe-fake-secret-not-a-credential", domain: FAKE_URL,
    connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: WEBHOOK_PORT, webhookPath: WEBHOOK_PATH,
    verificationToken: VERIFICATION_TOKEN, encryptKey: ENCRYPT_KEY,
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], resolveSenderNames: false,
  },
};
summary.feishu = { renderMode: feishuShape.renderMode ?? null, streaming: feishuShape.streaming ?? null, typingIndicator: feishuShape.typingIndicator ?? null, connectionMode: "webhook (loopback)", domain: "fake (127.0.0.1)" };
config.cron = { ...(config.cron ?? {}), enabled: false };
config.commands = { ...(config.commands ?? {}), ownerAllowFrom: Object.values(OWNERS).map((o) => `feishu:${o}`) };
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugin is not loaded here
const keep = new Set(["feishu", "deepseek", "moonshot", "vlab-agent-worker-isolation", "isc-probe", ...(HARNESSES.includes("vds") ? ["codex", "openai"] : ["codex"]), ...(HARNESSES.includes("vcc") ? ["anthropic"] : [])]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
config.plugins.entries["isc-probe"] = { enabled: true, config: {} };
if (Array.isArray(config.plugins.allow)) config.plugins.allow = [...config.plugins.allow.filter((id) => keep.has(id)), "isc-probe"];
config.plugins.load.paths = [
  ...config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.includes("moonshot-provider") || p.endsWith("/production-worker")),
  pluginDir,
];
// DeepSeek models the three harnesses use (present in the VLab config; added if missing).
const dsModels = config.models?.providers?.deepseek?.models;
if (Array.isArray(dsModels)) {
  const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
  for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!dsModels.some((x) => x.id === id)) dsModels.push({ id, name, ...flashShape });
}
const runtimes = {};
for (const h of HARNESSES) {
  const model = MODELS[h];
  const entry = config.agents.entries.makaron.models?.[model] ?? config.agents.defaults.models?.[model];
  runtimes[h] = entry?.agentRuntime?.id ?? null;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(model)) allow.push(model);
}
summary.modelRuntimes = runtimes;
for (const h of HARNESSES) if (runtimes[h] !== RUNTIME_OF[h]) summary.notes.push(`${h}: ${MODELS[h]} is configured for runtime ${runtimes[h]}, expected ${RUNTIME_OF[h]}`);
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
{
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {}; // the Worker never opens channels; keep real credentials out of it
  if (workerConfig.cron) workerConfig.cron.enabled = false;
  workerConfig.commands = { ...(workerConfig.commands ?? {}), ownerAllowFrom: config.commands.ownerAllowFrom };
  const wAllow = workerConfig.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(wAllow)) for (const h of HARNESSES) if (!wAllow.includes(MODELS[h])) wAllow.push(MODELS[h]);
  summary.workerConfigPlugins = Object.keys(workerConfig.plugins?.entries ?? {}).filter((id) => workerConfig.plugins.entries[id]?.enabled !== false).sort();
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
summary.gatewayPlugins = Object.keys(config.plugins.entries).sort();

// vds: the shared managed npm plugins (Codex carries V's /vds patches) and a DeepSeek provider for the
// agent's Codex home (same recipe as codex-hook-relay-latency.mjs).
if (HARNESSES.includes("vds")) {
  const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
  if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
  const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}
fs.mkdirSync(config.agents.entries.makaron.workspace, { recursive: true });

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.isc-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"), NODE_EXTRA_CA_CERTS: certFile };
env.DEEPSEEK_API_KEY = readSecret("DEEPSEEK_API_KEY");
assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
secrets.add(env.DEEPSEEK_API_KEY);
if (HARNESSES.includes("vcc")) {
  const which = spawnSync("bash", ["-lc", "command -v claude && claude --version"], { env, encoding: "utf8" });
  summary.vccCli = which.status === 0 ? which.stdout.trim().split("\n") : `not found: ${which.stderr.slice(-200)}`;
}

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
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}
async function waitLog(re, ms, label) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(250)) {
    if (lines.some((l) => re.test(l.line))) return true;
    if (gateway.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed during startup convergence/u.test(l.line))) { step("gateway asked for a restart after startup convergence"); startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-50).map((l) => l.line).join("\n"))}`);
    }
  }
  throw new Error(`timed out waiting for ${label}`);
}
let client;
async function rpc(method, params, timeoutMs = 30_000) {
  if (!client) {
    const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: gatewayToken, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
      client.start();
    });
  }
  return client.request(method, params, { timeoutMs });
}

// One signed, encrypted im.message.receive_v1 event through the webhook, exactly as Feishu sends it.
let eventSeq = 0;
async function postFeishuEvent({ openId, text }) {
  eventSeq += 1;
  const messageId = `om_iscprobe_${Date.now().toString(36)}_${eventSeq}`;
  const envelope = {
    schema: "2.0",
    header: { event_id: crypto.randomUUID().replaceAll("-", ""), token: VERIFICATION_TOKEN, create_time: String(Date.now()), event_type: "im.message.receive_v1", tenant_key: "tk_iscprobe", app_id: APP_ID },
    event: {
      sender: { sender_id: { open_id: openId, union_id: `on_${openId.slice(3)}`, user_id: `u_${openId.slice(3)}` }, sender_type: "user", tenant_key: "tk_iscprobe" },
      message: { message_id: messageId, chat_id: `oc_dm_${openId.slice(3)}`, chat_type: "p2p", message_type: "text", content: JSON.stringify({ text }), create_time: String(Date.now()) },
    },
  };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(ENCRYPT_KEY).digest(), iv);
  const encrypted = Buffer.concat([iv, cipher.update(JSON.stringify(envelope), "utf8"), cipher.final()]).toString("base64");
  const body = JSON.stringify({ encrypt: encrypted });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString("hex");
  const signature = sha256(timestamp + nonce + ENCRYPT_KEY + body);
  const res = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: WEBHOOK_PORT, path: WEBHOOK_PATH, method: "POST", headers: { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "x-lark-request-timestamp": timestamp, "x-lark-request-nonce": nonce, "x-lark-signature": signature } }, (r) => {
      let out = "";
      r.setEncoding("utf8");
      r.on("data", (c) => { out += c; });
      r.on("end", () => resolve({ status: r.statusCode, body: out.slice(0, 200) }));
    });
    req.on("error", reject);
    req.end(body);
  });
  return { messageId, ...res };
}

// ---------------------------------------------------------------- run one harness
async function probeHarness(h) {
  const owner = OWNERS[h];
  const sessionKey = `agent:makaron:feishu:direct:${owner}`;
  const sendId = newSendId();
  const preset = runIdFor("request", sendId, 0);
  const out = { model: MODELS[h], runtime: runtimes[h], sessionKey, sendId, preset };
  summary.harness[h] = out;
  try {
    out.sessionsPatch = await rpc("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODELS[h] }).then(() => "ok", (e) => `failed: ${redact(e?.message ?? e).slice(0, 200)}`);
    const text = `ISCPROBE-PRESET:${sendId} 这是一次连通性测试。请立刻调用一次 sessions_send 工具，参数 sessionKey="${TARGET_KEY}"，message="ISCPROBE ${sendId}"，timeoutSeconds=0。不要调用任何其他工具，不要解释。工具返回后只回复 DONE。`;
    const t0 = Date.now();
    out.webhook = await postFeishuEvent({ openId: owner, text });
    step(`${h}: event posted`, out.webhook);
    // Wait for the probe's own turn: tool call recorded and the run's lifecycle end.
    let probe;
    let runEnd;
    for (const until = Date.now() + TURN_TIMEOUT_MS; Date.now() < until; await sleep(2_000)) {
      const rows = readProbe();
      probe = rows.find((r) => r.probe === "sessions_send" && (String(r.message).includes(sendId) || (r.at >= t0 && r.opts?.agentSessionKey === sessionKey)));
      const started = rows.find((r) => r.probe === "feishu-onAgentRunStart" && r.id === sendId);
      const runId = started?.runId ?? preset;
      runEnd = rows.find((r) => r.probe === "agent-event" && r.runId === runId && (r.phase === "end" || r.phase === "error"));
      if (probe && runEnd) break;
      if (runEnd && !probe && Date.now() - runEnd.at > 20_000) break; // the turn ended without calling the tool
      if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}`);
    }
    out.turnMs = Date.now() - t0;
    out.toolCalled = Boolean(probe);
    out.runEnded = runEnd ? runEnd.phase : null;
    const rows = readProbe();
    out.rows = {
      replyOptions: rows.filter((r) => r.probe === "feishu-reply-options" && r.id === sendId),
      admission: rows.filter((r) => r.probe === "get-reply-admission" && r.sessionKey === sessionKey),
      onAgentRunStart: rows.filter((r) => r.probe === "feishu-onAgentRunStart" && r.id === sendId),
      sessionsSend: rows.filter((r) => r.probe === "sessions_send" && (String(r.message).includes(sendId) || (r.at >= t0 && r.opts?.agentSessionKey === sessionKey))),
      lifecycle: rows.filter((r) => r.probe === "agent-event" && r.sessionKey === sessionKey),
    };
    step(`${h}: turn finished`, { toolCalled: out.toolCalled, runEnded: out.runEnded, ms: out.turnMs });
  } catch (error) {
    out.error = redact(error?.stack ?? error).slice(0, 2000);
    step(`${h}: failed`, { error: out.error.slice(0, 300) });
  }
}

// ---------------------------------------------------------------- answers
function answer() {
  const a = {};
  const rows = readProbe();
  a.pluginLoaded = rows.filter((r) => r.probe === "plugin-register" || r.probe === "plugin-subscribed");
  for (const [h, out] of Object.entries(summary.harness)) {
    const adm = (out.rows?.admission ?? []).find((r) => r.vInterSessionId === out.sendId || r.ctxVInterSessionId === out.sendId || r.optsRunId === out.preset);
    const start = (out.rows?.onAgentRunStart ?? [])[0];
    const send = (out.rows?.sessionsSend ?? [])[0];
    const life = out.rows?.lifecycle ?? [];
    const runId = start?.runId ?? out.preset;
    a[h] = {
      A1: adm ? { optsVInterSession: adm.optsVInterSession, vInterSessionIdMatches: adm.vInterSessionId === out.sendId, onBusyIsFunction: adm.vInterSessionOnBusy === "function", ctxVInterSession: adm.ctxVInterSession, optsRunIdIsPreset: adm.optsRunId === out.preset, isActive: adm.isActive, queueAdmissionState: adm.queueAdmissionState } : "no admission row for the probe message",
      A2: start ? { preset: out.preset, reported: start.runId, honoured: start.honoured } : "onAgentRunStart never fired for the probe message",
      A3: send ? { ...send.opts, runIdIsPreset: send.opts.runId === out.preset, runIdIsReported: send.opts.runId === runId, process: send.process, inProcessGatewayContext: send.inProcessGatewayContext } : "sessions_send was not called",
      A4: send ? Object.fromEntries(Object.entries(send.calls).map(([k, v]) => [k, v.ok ? { ok: true, result: v.result } : { ok: false, message: v.message, matchesFallbackRe: RELAY_FALLBACK_RE.test(v.message ?? "") }])) : null,
      A6: Object.fromEntries(["gateway", "other"].map((where) => {
        const mine = life.filter((r) => r.runId === runId && (where === "gateway") === (r.pid === summary.gatewayPid));
        const regs = new Set(mine.map((r) => r.registration));
        const one = mine.filter((r) => r.registration === Math.min(...regs));
        return [where, { pids: [...new Set(mine.map((r) => r.pid))], registrations: regs.size, phases: one.map((r) => r.phase), withSessionKey: one.every((r) => r.sessionKey === out.sessionKey), activeEmbeddedAtEnd: one.filter((r) => r.phase === "end").map((r) => r.activeEmbedded), otherStreamsAtEnd: one.filter((r) => r.phase === "end").map((r) => r.otherStreams) }];
      })),
      A6otherRunsInSession: [...new Set(life.filter((r) => r.runId !== runId).map((r) => r.runId))],
    };
  }
  a.pluginMethodCalls = rows.filter((r) => r.probe === "plugin-method").map((r) => ({ client: r.client, echo: r.echo }));
  a.onBusy = rows.filter((r) => r.probe === "feishu-onBusy");
  a.errors = rows.filter((r) => /error/u.test(r.probe ?? "") || r.unparsable);
  return a;
}

// ---------------------------------------------------------------- main
startGateway();
try {
  await waitLog(/starting Webhook server on 127\.0\.0\.1/u, 600_000, "Feishu webhook start");
  summary.gatewayReadyMs = Date.now() - T0;
  summary.gatewayPid = gateway.pid;
  step("gateway ready", { ms: summary.gatewayReadyMs, pid: gateway.pid });
  await sleep(3_000);
  for (const h of HARNESSES) await probeHarness(h);
  await sleep(3_000);
  summary.answers = answer();
  summary.ok = HARNESSES.every((h) => summary.harness[h]?.toolCalled);
} catch (error) {
  summary.ok = false;
  summary.error = redact(error?.stack ?? error).slice(0, 3000);
  try { summary.answers = answer(); } catch {}
} finally {
  summary.fake = { requests: fake.requests.length, replies: fake.replies.slice(-8), creates: fake.creates.slice(-8), unknown: Object.fromEntries(fake.unknown) };
  summary.gatewayLogTail = lines.filter((l) => /isc-probe|sessions_send|vrelay|iscprobe|plugin|error|warn|feishu\[/iu.test(l.line)).slice(-80).map((l) => `${new Date(l.at).toISOString().slice(11, 19)} ${redact(l.line).slice(0, 400)}`);
  summary.probeRows = readProbe().map((r) => JSON.parse(redact(JSON.stringify(r))));
  summary.endedAt = new Date().toISOString();
  summary.totalMs = Date.now() - T0;
  console.log(JSON.stringify(summary, null, 2));
  try { client?.stop(); } catch {}
  gateway?.kill("SIGTERM");
  await sleep(3_000);
  if (gateway && gateway.exitCode === null) gateway.kill("SIGKILL");
  fakeServer.close();
  fs.rmSync(shortTmp, { recursive: true, force: true });
  if (!summary.ok) process.exitCode = 1;
}
