// Shared VLab acceptance for lab/release-files/codex-firsttext (run on the VLab host as root).
//
//   node codex-firsttext-shared-accept.mjs backup  --owner O
//   node codex-firsttext-shared-accept.mjs vds-config --owner O      # V's /vds on shared VLab, validated first
//   node codex-firsttext-shared-accept.mjs patch   --owner O --patch <patch-codex-firsttext.mjs>
//   node codex-firsttext-shared-accept.mjs restart --owner O
//   node codex-firsttext-shared-accept.mjs run     --owner O --label L --bigKey <session key>
//   node codex-firsttext-shared-accept.mjs restore --owner O         # byte-for-byte from backup, then restart
//
// The codex plugin lives under state/npm, outside the release channel's runtime
// fingerprint; the backup holds the exact pre-test bytes. Test turns use deliver:false.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const LAB = "/srv/vlab-production-mirror/labs";
const BASE = `${LAB}/instances/db91-parity`;
const UNIT = "openclaw-vlab-production-mirror-v8.service";
const NODE = "/opt/vlab/node-v22.23.1-linux-x64/bin/node";
const PORT = 24993;
const WORK = `${LAB}/shared-workflow/codex-firsttext-20261007`;
// The live configs are wherever the running Gateway says (not state/openclaw.json): its
// OPENCLAW_CONFIG_PATH, and the Worker config that one names. makaron turns run in the
// Worker, which applies its own allowlist and aliases.
const liveConfigPath = () => {
  const pid = Number(execFileSync("systemctl", ["show", "openclaw-vlab-production-mirror-v8.service", "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
  const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").find((x) => x.startsWith("OPENCLAW_CONFIG_PATH="));
  return env.slice("OPENCLAW_CONFIG_PATH=".length);
};
const CONFIG = liveConfigPath();
const WORKER_CONFIG = JSON.parse(fs.readFileSync(CONFIG, "utf8")).plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath;
const CODEX_HOME = `${BASE}/state/agents/makaron/agent/codex-home`;
const TOML = `${CODEX_HOME}/config.toml`;
const CODEX = `${BASE}/state/npm/projects/openclaw-codex-8902d781d4/node_modules/@openclaw/codex`;
const CODEX_FILES = ["run-attempt-D1hJO4fX.js", "thread-lifecycle-DAcEJ_Om.js", "harness-DXVZ5II5.js"];
const VDS_REF = "deepseek/vds-deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => execFileSync("sha256sum", [f], { encoding: "utf8" }).slice(0, 16);

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const owner = opt("owner");
assert(owner, "--owner required");
const leaseOwner = () => JSON.parse(fs.readFileSync(`${LAB}/control/integration.json`, "utf8")).owner;
assert.equal(leaseOwner(), owner, "integration lease belongs to another task");
assert.equal(process.getuid(), 0, "run as root on the VLab host");
fs.mkdirSync(`${WORK}/backup`, { recursive: true, mode: 0o700 });
const log = (o) => { const line = JSON.stringify(o); console.log(line); fs.appendFileSync(`${WORK}/log.jsonl`, `${line}\n`); };

function replaceKeepingOwner(file, content) {
  const st = fs.statSync(file);
  const tmp = `${file}.codexft-tmp`;
  fs.writeFileSync(tmp, content, { flag: "wx", mode: st.mode & 0o777 });
  fs.chownSync(tmp, st.uid, st.gid);
  fs.renameSync(tmp, file);
}

const gatewayPid = () => Number(execFileSync("systemctl", ["show", UNIT, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
function gatewayEnv() {
  const pid = gatewayPid();
  assert(pid > 1, "Gateway is not running");
  return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
}

let client;
const runs = new Map();
async function connect() {
  const env = gatewayEnv();
  const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const token = String(cfg.gateway.auth.token).replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? "");
  const { GatewayClient } = await import(`${BASE}/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${PORT}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin"],
      onEvent(e) {
        const p = e.payload;
        const r = runs.get(p?.runId);
        if (!r) return;
        const at = Date.now();
        if (e.event === "agent") {
          const stream = p.stream ?? "?";
          r.streams[stream] ??= at - r.sentAt;
          const text = String(p.data?.text ?? p.data?.delta ?? "");
          if (stream === "assistant" && text.trim() && !r.firstBodyAt) r.firstBodyAt = at;
          if (/think|reason/iu.test(stream) && text.trim()) { r.reasoningChars += text.length; r.firstReasoningAt ??= at; }
        }
        if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) {
          r.terminal = p.state;
          r.endAt = at;
          if (p.state !== "final") r.error = redact(String(p.errorMessage ?? JSON.stringify(p)).slice(0, 300));
        }
      },
      onHelloOk() { clearTimeout(timer); resolve(); },
      onConnectError(e) { clearTimeout(timer); reject(e); },
    });
    client.start();
  });
}
const call = (method, params, timeoutMs = 30_000) => client.request(method, params, { timeoutMs });

async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now(), streams: {}, reasoningChars: 0 };
  runs.set(id, r);
  await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 300_000 });
  const deadline = Date.now() + 330_000;
  while (!r.terminal && Date.now() < deadline) await sleep(250);
  return r;
}
const text = (m) => (typeof m.content === "string" ? m.content : (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
async function lastReply(key) {
  const h = await call("chat.history", { agentId: "makaron", sessionKey: key, limit: 6 });
  const a = (h.messages ?? []).filter((m) => m.role === "assistant").at(-1);
  return a ? { text: text(a).trim(), model: a.model, provider: a.provider } : {};
}
function journal(sinceMs, re) {
  const out = spawnSync("journalctl", ["-u", UNIT, "--since", `@${Math.floor(sinceMs / 1000)}`, "--no-pager", "-o", "cat"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).stdout;
  return out.split("\n").filter((l) => re.test(l)).map((l) => redact(l).slice(0, 260));
}
function rollouts(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    let model = "", threadId = "", turns = 0;
    const usage = [], errors = [];
    let reasoningText = 0;
    for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "session_meta") threadId = p.id ?? threadId;
      if (e.type === "turn_context") model = p.model;
      if (e.type === "event_msg" && p.type === "task_started") turns += 1;
      if (e.type === "event_msg" && p.type === "error") errors.push(String(p.message).slice(0, 200));
      if (e.type === "event_msg" && p.type === "token_count" && p.info?.last_token_usage) usage.push([p.info.last_token_usage.input_tokens, p.info.last_token_usage.cached_input_tokens]);
      if (e.type === "response_item" && p.type === "reasoning") reasoningText += (p.content ?? []).filter((c) => c.type === "reasoning_text").length;
    }
    return { threadId: threadId.slice(0, 13), model, turns, usage, reasoningTextItems: reasoningText, errors };
  });
}
function turnRow(label, scenario, r, extra = {}) {
  return {
    label, scenario, terminal: r.terminal, error: r.error,
    firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null,
    firstReasoningMs: r.firstReasoningAt ? r.firstReasoningAt - r.sentAt : null,
    reasoningChars: r.reasoningChars, totalMs: r.endAt ? r.endAt - r.sentAt : null, streams: r.streams, ...extra,
  };
}

async function run(label, bigKey) {
  await connect();
  const health = await call("health", {});
  log({ label, at: new Date().toISOString(), pid: gatewayPid(), codex: Object.fromEntries(CODEX_FILES.map((f) => [f, sha(`${CODEX}/dist/${f}`)])), eventLoop: health.eventLoop });
  const since = Date.now();
  const stamp = Date.now().toString(36);
  // Warm-up: the first Codex turn after a restart can trip the previous Gateway's orphan
  // app-server registration ("Cannot reap registered Codex process"); keep it out of the results.
  const warm = `agent:makaron:explicit:vlab-dev-codexft-${label}-warm-${stamp}`;
  await send(warm, "/vds");
  log(turnRow(label, "warmup", await send(warm, "Reply with exactly: WARM")));

  // 1. Big session (25 MB group mirror): first text under a slow prompt write.
  if (bigKey) {
    const before = await call("sessions.list", { agentId: "makaron", search: bigKey.split(":").at(-1), limit: 5, includeLastMessage: false }).catch(() => ({}));
    const entry = (before.sessions ?? []).find((s) => s.key === bigKey);
    log({ label, scenario: "big", key: bigKey, before: entry ? { model: entry.model, modelProvider: entry.modelProvider, modelOverride: entry.modelOverride, providerOverride: entry.providerOverride } : null });
    const s0 = Date.now();
    log(turnRow(label, "big:/vds", await send(bigKey, "/vds")));
    for (const prompt of [
      "（VLab 首字验收，不要调用任何工具）用大约 300 字解释为什么酸面包会发酵膨胀，第一个词写 ALPHA。",
      "（VLab 首字验收，不要调用任何工具）用大约 300 字解释潮汐是怎么形成的，第一个词写 BRAVO。",
    ]) {
      const r = await send(bigKey, prompt);
      log(turnRow(label, "big", r, { reply: (await lastReply(bigKey)).text?.slice(0, 40) }));
    }
    log({ label, scenario: "big", journal: journal(s0, /pre-bind|transient thread|cross-provider|provider family|client_closed|replay|invalid_request/u).slice(-12) });
    // Put the mirror session back on the model it had.
    if (entry) {
      const back = entry.modelOverride ? `${entry.providerOverride ? `${entry.providerOverride}/` : ""}${entry.modelOverride}` : null;
      const res = await call("sessions.patch", { key: bigKey, model: back }).then(() => "ok", (e) => String(e.message).slice(0, 160));
      log({ label, scenario: "big", restoreModel: back, result: res });
    }
  }

  // 2. Continuity: one /vds session, four turns.
  const cont = `agent:makaron:explicit:vlab-dev-codexft-${label}-cont-${stamp}`;
  const c0 = Date.now();
  await send(cont, "/vds");
  for (const prompt of [
    "Without using any tools, write about 250 words on how bees navigate. Start with the word ALPHA.",
    "Without using any tools, write about 250 words on why the sky is blue. Start with BRAVO and end by naming the first topic.",
    "Without using any tools, write about 250 words on how glaciers move. Start with CHARLIE and end by listing the first word of each earlier answer.",
    "Without using any tools, in two sentences: which topics have we covered so far?",
  ]) {
    const r = await send(cont, prompt);
    log(turnRow(label, "continuity", r, { reply: (await lastReply(cont)).text?.slice(0, 120) }));
  }
  log({ label, scenario: "continuity", rollouts: rollouts(c0) });
  log({ label, scenario: "continuity", journal: journal(c0, /pre-bind|transient thread|cross-provider|provider family|client_closed|invalid_request/u).slice(-12) });

  // 3. Switching: vds -> vcodex -> vds -> vcodex in one session.
  const sw = `agent:makaron:explicit:vlab-dev-codexft-${label}-switch-${stamp}`;
  const w0 = Date.now();
  const steps = [
    ["/vds", "Do not use any tools. Remember the code word KIWI-3 for later and reply with one short sentence."],
    ["/vcodex", "Do not use any tools or read files. From our conversation only: what code word did I give you earlier? One line."],
    ["/vds", "Do not use any tools. From our conversation only: what did the previous assistant answer say? Also remember a second code word HERON-9. One or two lines."],
    ["/vcodex", "Do not use any tools or read files. From our conversation only: list every code word I gave you. One line."],
  ];
  for (const [alias, prompt] of steps) {
    const d = await send(sw, alias);
    const r = await send(sw, prompt);
    const reply = await lastReply(sw);
    log(turnRow(label, `switch:${alias}`, r, { directive: d.terminal, provider: reply.provider, model: reply.model, reply: reply.text?.slice(0, 200) }));
  }
  log({ label, scenario: "switch", rollouts: rollouts(w0) });
  log({ label, scenario: "switch", journal: journal(w0, /pre-bind|transient thread|cross-provider|provider family|client_closed|invalid_request|array_above_max_length/u).slice(-16) });

  // 4. Transcript order in every scenario session.
  for (const key of [bigKey, cont, sw].filter(Boolean)) {
    const h = await call("chat.history", { agentId: "makaron", sessionKey: key, limit: key === bigKey ? 8 : 40 });
    const msgs = (h.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant");
    log({ label, order: key.slice(-30), roles: msgs.map((m) => `${m.role[0]}:${text(m).trim().slice(0, 12).replace(/\s+/gu, " ")}`) });
  }
  log({ label, finishedSecs: Math.round((Date.now() - since) / 1000) });
  client.stop?.();
}

async function waitReady(timeoutMs = 30 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listening = await new Promise((resolve) => {
      const sock = net.connect({ host: "127.0.0.1", port: PORT });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (listening) {
      try { await connect(); await call("health", {}); client.stop?.(); return; } catch { /* still starting */ }
    }
    await sleep(3000);
  }
  throw new Error("Gateway not ready");
}
async function restart() {
  await connect();
  const w = await call("vlab.workers.status", {}).catch(() => null);
  if (w) assert(!w.pending && w.workers.every((x) => !x.activeCount && !x.queued), "Worker busy; not restarting");
  client.stop?.();
  const t0 = Date.now();
  execFileSync("systemctl", ["restart", UNIT], { timeout: 300_000 });
  await waitReady();
  log({ restart: true, pid: gatewayPid(), readySecs: Math.round((Date.now() - t0) / 1000) });
}

if (command === "backup") {
  const dir = `${WORK}/backup`;
  for (const [src, name] of [[CONFIG, "live-openclaw.json"], [WORKER_CONFIG, "live-worker-openclaw.json"], [TOML, "config.toml"], ...CODEX_FILES.map((f) => [`${CODEX}/dist/${f}`, f])]) {
    const dst = `${dir}/${name}`;
    if (!fs.existsSync(dst)) execFileSync("cp", ["-a", src, dst]);
    assert.equal(sha(dst), sha(src), `${name} already backed up with different bytes`);
  }
  log({ backup: dir, files: fs.readdirSync(dir).map((f) => [f, sha(`${dir}/${f}`)]) });
} else if (command === "vds-config") {
  for (const [file, name] of [[CONFIG, "openclaw.vds.json"], [WORKER_CONFIG, "worker-openclaw.vds.json"]]) {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    const ds = cfg.models.providers.deepseek.models;
    const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
    for (const [id, label] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!ds.some((m) => m.id === id)) ds.push({ id, name: label, ...shape });
    const entry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
    cfg.agents.defaults.models[VDS_REF] = entry;
    if (cfg.agents.entries?.makaron) cfg.agents.entries.makaron.models = { ...(cfg.agents.entries.makaron.models ?? {}), [VDS_REF]: entry };
    const allow = cfg.agents.defaults.modelPolicy?.allow;
    if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
    const candidate = `${WORK}/${name}`;
    fs.rmSync(candidate, { force: true });
    fs.writeFileSync(candidate, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
    fs.chownSync(candidate, fs.statSync(file).uid, fs.statSync(file).gid);
    const env = { ...gatewayEnv(), OPENCLAW_CONFIG_PATH: candidate };
    const v = spawnSync("sudo", ["-u", "lab-db91-parity", "--preserve-env", NODE, `${BASE}/runtime/openclaw/dist/index.js`, "config", "validate", "--json"], { env, encoding: "utf8", cwd: "/tmp", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    log({ validate: name, status: v.status, out: redact((v.stdout || "") + (v.stderr || "")).slice(-600) });
    assert.equal(v.status, 0, `${name} validate failed; shared config untouched`);
    if (fs.readFileSync(candidate, "utf8") !== fs.readFileSync(file, "utf8")) replaceKeepingOwner(file, fs.readFileSync(candidate));
    log({ vdsConfig: file, sha: sha(file) });
  }
} else if (command === "patch") {
  const r = spawnSync(NODE, [opt("patch"), "--codex", CODEX], { encoding: "utf8" });
  log({ patch: r.status, out: (r.stdout || "").slice(-800), err: (r.stderr || "").slice(-800) });
  assert.equal(r.status, 0);
  for (const f of CODEX_FILES) execFileSync(NODE, ["--check", `${CODEX}/dist/${f}`]);
} else if (command === "restart") {
  await restart();
} else if (command === "run") {
  await run(opt("label"), opt("bigKey"));
} else if (command === "big") {
  // A /vds session larger than Codex's 258,400 fallback window: two turns must share one thread.
  await connect();
  const label = opt("label") ?? "big";
  const key = `agent:makaron:explicit:vlab-dev-codexft-${label}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const words = Number(opt("words") ?? 140000);
  const list = Array.from({ length: words }, (_, i) => `w${i % 997}`).join(" ");
  await send(key, "/vds");
  for (const msg of [`Remember this list for later; do not repeat it, just reply OK. ${list}`, "Without using any tools: what was the first word of the list I gave you? Reply in one line.", "Without using any tools: reply with one short sentence about tides."]) {
    const r = await send(key, msg);
    log(turnRow(label, "big", r, { reply: (await lastReply(key)).text?.slice(0, 80) }));
  }
  log({ label, scenario: "big", rollouts: rollouts(t0) });
  log({ label, scenario: "big", journal: journal(t0, /keeping oversized DeepSeek|exceeded active token limit|auto-compaction|starting a fresh thread|pre-bind/u).slice(-10) });
  client.stop?.();
} else if (command === "models") {
  await connect();
  for (const [method, params] of [["models.list", { agentId: "makaron" }], ["models.list", { agentId: "makaron", view: "all" }]]) {
    const r = await call(method, params).catch((e) => ({ error: String(e.message).slice(0, 300) }));
    const list = r.models ?? r.entries ?? [];
    log({ method, params, error: r.error, keys: Object.keys(r).slice(0, 12), deepseek: list.filter((m) => JSON.stringify(m).includes("deepseek")).map((m) => JSON.stringify(m).slice(0, 220)) });
  }
} else if (command === "restore") {
  const dir = `${WORK}/backup`;
  for (const [dst, name] of [[CONFIG, "live-openclaw.json"], [WORKER_CONFIG, "live-worker-openclaw.json"], [TOML, "config.toml"], ...CODEX_FILES.map((f) => [`${CODEX}/dist/${f}`, f])]) execFileSync("cp", ["-a", `${dir}/${name}`, dst]);
  log({ restored: true });
  await restart();
} else {
  throw new Error(`unknown command ${command}`);
}
process.exit(0);
