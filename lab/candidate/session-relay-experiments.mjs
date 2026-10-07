// Candidate experiments for the native sessions_send + v-session-relay, on the worker
// (DeepSeek), vds (Codex app-server + DeepSeek) and vcc (Claude Code) harnesses.
// vcodex (Codex + ChatGPT) is the same Codex path as vds with a different model; it is
// not run here because refreshing the candidate's copied ChatGPT token can revoke the
// account's token chain (memory: candidate-stale-oauth-refresh). It is checked on shared
// VLab with `vlab.mjs test`.
//
// EXP_SUITE=ui        Part 1, the UI that shows a sessions_send. Real Feishu: the owner's
//                     VLab DM and the test group. Per harness: an inline exchange and an
//                     async one (the target works 75 s); worker only: a send steered into a
//                     busy turn, and a target run that fails. Cards are read back from Feishu.
// EXP_SUITE=work      Part 2, one conversation's V handing work to another's: dispatch and
//                     use the result (W1), dispatch to two and combine (W2), a long job
//                     (W3), a job that needs something only the requester knows (W4), and
//                     a follow-up dispatch into the same conversation (W5, after W1 #1).
//                     Private sessions (no Feishu). Every trial runs in its own agent with
//                     its own workspace and memory, so trials cannot see each other (they
//                     did when they shared makaron's daily memory). EXP_TRIALS repeats W1.
// RELAY_GUIDANCE=off  The same, with the plugin's prompt guidance switched off (D6 control).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const OWNER = process.env.RELAY_OWNER_OPEN_ID ?? "ou_775a78b0aaae67da5e15eeaf102e3cd9";
const GROUP = process.env.RELAY_TARGET_CHAT ?? "oc_5afced473a29eb6f5fed3ba9966aa9ff";
const GROUP_NAME = process.env.RELAY_TARGET_NAME ?? "VLab 发布验收 B";
const HARNESSES = {
  worker: { model: "deepseek/deepseek-v4-flash", harness: /vlab-worker|openclaw/u },
  vds: { model: "deepseek/deepseek-flash", harness: /codex/u },
  vcc: { model: "anthropic/claude-opus-5", harness: /claude-cli/u },
};
const harnesses = (process.env.EXP_HARNESSES ?? "worker,vds,vcc").split(",").map((s) => s.trim()).filter(Boolean);
for (const h of harnesses) assert(HARNESSES[h], `unknown harness ${h}`);
const suite = process.env.EXP_SUITE ?? "dialogue";
const trials = Number(process.env.EXP_TRIALS ?? 1);
const workCases = (process.env.EXP_CASES ?? "W1,W2,W3,W4").split(",").map((s) => s.trim()).filter(Boolean);
const guidance = process.env.RELAY_GUIDANCE !== "off";
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
const summary = { startedAt: new Date().toISOString(), suite, harnesses, guidance, trials, results: {}, notes: [] };

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
const feishu = config.channels?.feishu;
assert(feishu && typeof feishu.appId === "string" && typeof feishu.appSecret === "string", "VLab Feishu app credentials are not plain strings");
// Loopback webhook: real outbound messages, no second WebSocket consumer of the shared bot.
Object.assign(feishu, {
  connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: port + 21, webhookPath: "/candidate/session-relay-exp",
  verificationToken: "candidate-verification-token", encryptKey: "candidate-encrypt-key-0000000000",
});
config.channels = { feishu };
config.cron = { ...(config.cron ?? {}), enabled: false };
config.commands = { ...config.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
const allow = config.agents?.defaults?.modelPolicy?.allow;
if (Array.isArray(allow)) for (const h of harnesses) if (!allow.includes(HARNESSES[h].model)) allow.push(HARNESSES[h].model);
const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) fs.writeFileSync(loaderFile, fs.readFileSync(loaderFile, "utf8").replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));

// Core: the reply-once backport on this private runtime's own bytes.
const { patchSessionsSendReplyOnce, MARKER, FILE } = await import("../release-files/sessions-send-reply-once/patch.mjs");
const sessionsTool = path.join(dist, FILE);
const sessionsSource = fs.readFileSync(sessionsTool, "utf8");
if (!sessionsSource.includes(MARKER)) fs.writeFileSync(sessionsTool, patchSessionsSendReplyOnce(sessionsSource));
// Core: after_tool_call for loopback MCP tool calls (claude-cli), backported from 9.8.
const mcp = await import("../release-files/mcp-after-tool-call/patch.mjs");
const mcpFile = path.join(dist, mcp.FILE);
const mcpSource = fs.readFileSync(mcpFile, "utf8");
if (!mcpSource.includes(mcp.MARKER)) fs.writeFileSync(mcpFile, mcp.patchMcpAfterToolCall(mcpSource));

const storeDir = path.join(stateDir, "v-session-relay");
const pluginDir = path.join(process.cwd(), "apps", "v-session-relay", "plugin");
const relayEntry = { enabled: true, hooks: { allowConversationAccess: true }, config: { storeDir, owners: [`feishu:${OWNER}`], pollMs: 1000, guidance } };
const wire = (cfg) => {
  cfg.plugins ??= {};
  cfg.plugins.load ??= {};
  cfg.plugins.load.paths = [...new Set([...(cfg.plugins.load.paths ?? []), pluginDir])];
  if (Array.isArray(cfg.plugins.allow) && !cfg.plugins.allow.includes("v-session-relay")) cfg.plugins.allow.push("v-session-relay");
  cfg.plugins.entries ??= {};
  cfg.plugins.entries["v-session-relay"] = relayEntry;
};
wire(config);
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 3, warmSpareWorkers: 0, gatewayConfigPath: configPath });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."));
const workerJson = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
workerJson.channels = { feishu: { ...feishu, enabled: false } };
workerJson.commands = { ...workerJson.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
const wAllow = workerJson.agents?.defaults?.modelPolicy?.allow;
if (Array.isArray(wAllow)) for (const h of harnesses) if (!wAllow.includes(HARNESSES[h].model)) wAllow.push(HARNESSES[h].model);
wire(workerJson);
// One agent per work trial: same configuration as makaron (models, tools, identity), its
// own empty workspace memory and session store. A and B of a trial share it, like two chats
// of the same V; different trials do not.
const trialPlan = suite === "work"
  ? harnesses.flatMap((h) => workCases.flatMap((c) => Array.from({ length: c === "W1" ? trials : 1 }, (_, i) => ({ h, c, n: i + 1, agentId: `rx-${h}-${c.toLowerCase()}-${i + 1}` }))))
  : [];
const makaron = config.agents.entries.makaron;
for (const t of trialPlan) {
  const workspace = path.join(path.dirname(makaron.workspace), t.agentId);
  const agentDir = path.join(path.dirname(path.dirname(makaron.agentDir)), t.agentId, "agent");
  fs.mkdirSync(workspace, { recursive: true });
  for (const name of fs.readdirSync(makaron.workspace)) {
    if (name === "memory" || name.startsWith(".")) continue;
    spawnSync("cp", ["-a", path.join(makaron.workspace, name), workspace]);
  }
  fs.mkdirSync(path.join(workspace, "memory"), { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  for (const name of fs.existsSync(makaron.agentDir) ? fs.readdirSync(makaron.agentDir) : []) {
    if (/\.sqlite|sessions|codex-home|^\./u.test(name)) continue;
    spawnSync("cp", ["-a", path.join(makaron.agentDir, name), agentDir]);
  }
  const entry = { ...structuredClone(makaron), workspace, agentDir, name: `V ${t.agentId}` };
  config.agents.entries[t.agentId] = entry;
  workerJson.agents ??= {};
  workerJson.agents.entries ??= {};
  workerJson.agents.entries[t.agentId] = structuredClone(entry);
}
summary.trialAgents = trialPlan.length;
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerJson, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// /vds: production's three DeepSeek patches on the Codex plugin, and a DeepSeek provider in
// the agent's Codex home (same anchors as v-browser-cross-harness / vds-codex-switch).
if (harnesses.includes("vds")) {
  const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
  if (!fs.existsSync(path.join(stateDir, "npm")) && fs.existsSync(sharedNpm)) {
    assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
  }
  const codexDists = [path.join(stateDir, "npm", "projects"), path.join(runtime, "npm", "projects")]
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => fs.readdirSync(dir).filter((d) => d.startsWith("openclaw-codex-")).map((d) => path.join(dir, d, "node_modules", "@openclaw", "codex", "dist")))
    .filter((dir) => fs.existsSync(dir))
    .filter((dir) => fs.readdirSync(dir).some((f) => /^harness-[^/]+\.js$/u.test(f) && fs.readFileSync(path.join(dir, f), "utf8").includes("DEFAULT_CODEX_HARNESS_PROVIDER_IDS = ")));
  assert(codexDists.length > 0, "candidate Codex plugin install not found");
  const patchOnce = (codexDist, re, pairs) => {
    const file = fs.readdirSync(codexDist).map((f) => path.join(codexDist, f)).find((f) => re.test(f) && pairs.some(([from, to]) => { const t = fs.readFileSync(f, "utf8"); return t.includes(from) || t.includes(to); }));
    assert(file, `codex module ${re} not found in ${codexDist}`);
    let src = fs.readFileSync(file, "utf8");
    for (const [from, to] of pairs) {
      if (src.includes(to)) continue;
      assert.equal(src.split(from).length, 2, `patch anchor must match exactly once: ${from.slice(0, 60)}`);
      src = src.replace(from, to);
    }
    fs.writeFileSync(file, src);
  };
  for (const d of codexDists) {
    patchOnce(d, /\/harness-[^/]+\.js$/u, [
      ['new Set(["codex", "openai"]);', 'new Set(["codex", "openai", "deepseek"]);'],
      ['} else if (ctx.modelProvider && provider !== "codex" && !nativeAccountOwnsUnobservedModel) return {', '} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {'],
      ['if (ctx.modelProvider?.requestTransportOverrides === "present") return {', 'if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {'],
    ]);
    patchOnce(d, /\/run-attempt-[^/]+\.js$/u, [["nativeCodeModeEnabled: params.nativeToolSurfaceEnabled,", 'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",']]);
    patchOnce(d, /\/thread-lifecycle-[^/]+\.js$/u, [['return normalizeCodexModelId(modelId) === "gpt-5.4-nano";', 'const normalizedId = normalizeCodexModelId(modelId); return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");']]);
  }
  for (const agentDir of [config.agents.entries.makaron.agentDir, ...trialPlan.filter((t) => t.h === "vds").map((t) => config.agents.entries[t.agentId].agentDir)]) {
    const codexHome = path.join(agentDir, "codex-home");
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const tomlPath = path.join(codexHome, "config.toml");
    const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
    if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
  }
}

const shortTmp = `/tmp/.relay-exp-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: path.join(stateDir, "cache"), npm_config_cache: path.join(stateDir, "cache", "npm") };
env.DEEPSEEK_API_KEY = secret("DEEPSEEK_API_KEY");
assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");

// ---------------------------------------------------------------- Gateway + helpers
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
    if (lines.some((l) => re.test(l.line))) return;
    if (gateway.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-40).map((l) => l.line).join("\n"))}`);
    }
  }
  throw new Error(`timed out waiting for ${label}`);
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
/** One CLI turn; resolves when it ends. `to` routes it like an inbound Feishu message. */
function turn({ sessionKey, model, message, to, timeout = 900, agent = "makaron" }) {
  const args = [`${dist}/index.js`, "agent", "--agent", agent, "--model", model, "--message", message, "--json", "--timeout", String(timeout)];
  if (to) args.push("--channel", "feishu", "--to", to, "--deliver");
  else args.push("--session-key", sessionKey);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { err += b; });
    child.on("exit", (code) => {
      let meta;
      try { meta = JSON.parse(out.slice(out.indexOf("{"))); } catch { /* not json */ }
      const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
      resolve({
        exit: code, startedAt, endedAt: Date.now(), secs: Math.round((Date.now() - startedAt) / 1000),
        harness: agentMeta ? String(agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime ?? agentMeta.provider ?? "") : null,
        reply: redact(String(meta?.result?.payloads?.map?.((p) => p.text).filter(Boolean).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 1500),
        stderr: code === 0 ? undefined : redact(err).slice(-800),
      });
    });
  });
}
const ledger = () => {
  try { return fs.readdirSync(storeDir).filter((n) => /^r_\w+\.json$/u.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(storeDir, n), "utf8"))); } catch { return []; }
};
const threadOf = (fromKey, since) => {
  const mine = ledger().filter((r) => r.createdAt >= since && (r.from?.sessionKey === fromKey || r.to?.sessionKey === fromKey));
  return mine.sort((a, b) => a.createdAt - b.createdAt);
};
async function settle(fromKey, since, { quietMs = 25_000, maxMs = 900_000 } = {}) {
  let seen = -1, quietSince = Date.now();
  for (const until = Date.now() + maxMs; Date.now() < until; await sleep(2_000)) {
    const t = threadOf(fromKey, since);
    const sig = t.map((r) => `${r.id}:${r.status}`).join(",");
    if (sig !== seen) { seen = sig; quietSince = Date.now(); }
    if (t.every((r) => ["done", "failed", "interrupted"].includes(r.status)) && Date.now() - quietSince > quietMs) return t;
  }
  return threadOf(fromKey, since);
}
const show = (t) => t.map((r) => ({ id: r.id, via: r.via, inline: !!r.inline, disp: r.targetDisposition, status: r.status, wokenBy: r.wokenBy ?? (r.inline ? null : "core"), from: r.from?.label ?? r.from?.sessionKey, to: r.to?.label ?? r.to?.sessionKey, said: String(r.message ?? "").slice(0, 300), answered: String(r.reply ?? r.error ?? "").slice(0, 500), secs: r.finishedAt ? Math.round((r.finishedAt - r.createdAt) / 1000) : null, closing: r.closingText ? String(r.closingText).slice(0, 500) : undefined }));
const pin = async (key, model, label) => {
  const out = {};
  out.model = await rpc("sessions.patch", { key, model }).then(() => "ok", (e) => e.message);
  if (label) out.label = await rpc("sessions.patch", { key, label }).then(() => "ok", (e) => e.message);
  return out;
};
// The plugin's hooks may run in a worker whose log does not reach this Gateway's stdout;
// it leaves a marker file per blocked call instead.
const blockedFrom = (sessionKey, since) => {
  const dir = path.join(storeDir, "blocked");
  try {
    return fs.readdirSync(dir).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"))).filter((m) => m.sessionKey === sessionKey && m.at >= since).length;
  } catch { return 0; }
};
const logSince = (mark, re) => lines.slice(mark).filter((l) => re.test(l.line)).map((l) => redact(l.line).slice(0, 300));

// ---------------------------------------------------------------- Part 2 cases: handing work over
const FEEDBACK = (code) => `【背景，记住即可】这是本周（代号 ${code}）客服收集的 12 条客户反馈：1. 登录要转很久 2. 导出 Excel 报错 3. 登录太慢了 4. 价格有点贵 5. 导出失败了两次 6. 登录页卡住不动 7. 希望有暗色模式 8. 导出的文件打不开 9. 早上登录特别慢 10. 点导出按钮没反应 11. 登录时白屏 12. 客服回复慢。只回复：好的。`;
const has = (text, ...words) => words.every((w) => String(text ?? "").includes(w));
const CASES = {
  W1: {
    a: () => "【背景】你在老板的私聊里，帮老板协调各个组。只回复：好的。",
    others: { b: { name: "客服组", seed: FEEDBACK } },
    asks: [
      (l, code) => `让「${l.b}」把本周（代号 ${code}）的客户反馈整理成最主要的 3 个问题，然后你根据这 3 个问题给产品团队写一段周报开头。`,
      (l, code) => `让「${l.b}」把刚才第 2 个问题展开说说：具体是哪几条反馈，他们怎么看。`,
    ],
    followUps: 1, // W5 runs as the second ask of trial 1
    judge: (t, finals, l) => {
      const toB = t.filter((r) => r.to?.sessionKey === l.bKey);
      const bText = toB.map((r) => r.reply).join("\n");
      return {
        dispatched: toB.length > 0,
        bFoundTop2: has(bText, "登录") && has(bText, "导出"),
        usedResult: has(finals[0], "登录") && has(finals[0], "导出"),
        correct: toB.length > 0 && has(finals[0], "登录") && has(finals[0], "导出"),
      };
    },
    judgeFollowUp: (t, finals, l, since) => {
      const later = t.filter((r) => r.to?.sessionKey === l.bKey && r.createdAt >= since);
      const text = later.map((r) => r.reply).join("\n") + (finals[1] ?? "");
      const items = ["2", "5", "8", "10"].filter((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`, "u").test(text)).length;
      return { dispatchedAgain: later.length > 0, aboutExport: has(text, "导出"), itemsCited: items, correct: later.length > 0 && has(text, "导出") && items >= 3 };
    },
  },
  W2: {
    a: () => "【背景】你在老板的私聊里，帮老板协调各个组。只回复：好的。",
    others: {
      b: { name: "客服组", seed: FEEDBACK },
      c: { name: "销售组", seed: (code) => `【背景，记住即可】本周（代号 ${code}）成交 17 单，成交额 47.3 万元。只回复：好的。` },
    },
    asks: [(l, code) => `让「${l.b}」统计一下本周（代号 ${code}）反馈最多的问题，同时让「${l.c}」报一下本周成交额，然后给我一句话总结。`],
    judge: (t, finals, l) => {
      const toB = t.some((r) => r.to?.sessionKey === l.bKey);
      const toC = t.some((r) => r.to?.sessionKey === l.cKey);
      return { toBoth: toB && toC, hasTop: has(finals[0], "登录"), hasSales: /47\.3/u.test(finals[0] ?? ""), correct: toB && toC && has(finals[0], "登录") && /47\.3/u.test(finals[0] ?? "") };
    },
  },
  W3: {
    a: () => "【背景】你在老板的私聊里，帮老板协调各个组。只回复：好的。",
    others: { b: { name: "数据组", seed: (code) => `【背景，记住即可】数据组跑本周（代号 ${code}）报表的方法：用 exec 执行 \`sleep 90 && echo 本周活跃用户 12873，环比 +6.4%\`，以输出为准，不要自己编数字。只回复：好的。` } },
    asks: [(l, code) => `让「${l.b}」跑一下本周（代号 ${code}）的报表，那边要一两分钟，出来以后把关键数字告诉我。`],
    judge: (t, finals, l) => {
      const toB = t.filter((r) => r.to?.sessionKey === l.bKey);
      return {
        dispatched: toB.length > 0,
        path: toB.map((r) => (r.inline ? "inline" : r.wokenBy === "plugin" ? "async-plugin" : "async-core")).join(","),
        targetSecs: toB.map((r) => (r.finishedAt && r.createdAt ? Math.round((r.finishedAt - r.createdAt) / 1000) : null)),
        numberBack: /12873|12,873/u.test(finals[0] ?? ""),
        correct: toB.length > 0 && /12873|12,873/u.test(finals[0] ?? ""),
      };
    },
  },
  W4: {
    a: (code) => `【背景，记住即可】发布会（代号 ${code}）的主视觉颜色定了：深蓝 #1A2B4C，配金色点缀。只回复：好的。`,
    others: { b: { name: "设计组", seed: (code) => `【背景，记住即可】设计组写任何海报文案前，必须先确认主视觉颜色，品牌规定只能用发起方给定的颜色；这次发布会（代号 ${code}）的颜色我们组不知道。只回复：好的。` } },
    asks: [(l, code) => `让「${l.b}」出一版发布会（代号 ${code}）的海报文案。`],
    judge: (t, finals, l) => {
      const toB = t.filter((r) => r.to?.sessionKey === l.bKey);
      const said = toB.map((r) => r.message).join("\n");
      const text = toB.map((r) => r.reply).join("\n") + (finals[0] ?? "");
      const colour = /1A2B4C|深蓝/iu.test(text);
      return { rounds: toB.length, kind: toB.length >= 2 ? "asked-back" : /1A2B4C|深蓝/iu.test(said) ? "upfront" : "single", colourUsed: colour, correct: toB.length > 0 && colour };
    },
  },
};

async function workTrial({ h, c, n, agentId }) {
  const spec = CASES[c];
  const model = HARNESSES[h].model;
  const tag = Date.now().toString(36).slice(-5);
  const code = Math.random().toString(36).slice(2, 5).toUpperCase();
  const key = (role) => `agent:${agentId}:explicit:${role}-${tag}`;
  const l = { aKey: key("boss") };
  const others = Object.entries(spec.others);
  for (const [role, o] of others) {
    l[role] = `${o.name} ${tag}`;
    l[`${role}Key`] = key(role);
  }
  const seeds = await Promise.all([
    turn({ agent: agentId, sessionKey: l.aKey, model, message: spec.a(code), timeout: 300 }),
    ...others.map(([role, o]) => turn({ agent: agentId, sessionKey: l[`${role}Key`], model, message: o.seed(code), timeout: 300 })),
  ]);
  await pin(l.aKey, model, `老板私聊 ${tag}`);
  for (const [role] of others) await pin(l[`${role}Key`], model, l[role]);
  const since = Date.now();
  const asks = [];
  const finals = [];
  const askCount = n === 1 && spec.followUps ? spec.asks.length : 1;
  let followSince = null;
  for (let i = 0; i < askCount; i += 1) {
    if (i === 1) followSince = Date.now();
    const askedAt = Date.now();
    const ask = await turn({ agent: agentId, sessionKey: l.aKey, model, message: spec.asks[i](l, code) });
    const t = await settle(l.aKey, askedAt);
    const closing = t.filter((r) => r.closingText && r.createdAt >= askedAt).at(-1)?.closingText;
    asks.push({ exit: ask.exit, harness: ask.harness, secs: ask.secs, reply: ask.reply.slice(0, 500), stderr: ask.stderr });
    finals.push(closing ?? ask.reply);
  }
  const t = threadOf(l.aKey, since);
  const verdict = spec.judge(t, finals, l);
  const followUp = askCount > 1 ? spec.judgeFollowUp(t, finals, l, followSince) : undefined;
  return { harness: h, case: c, trial: n, agentId, code, seeded: seeds.map((x) => x.exit), asks, verdict, followUp, finals: finals.map((f) => String(f ?? "").slice(0, 600)), blocked: blockedFrom(l.bKey, since), thread: show(t) };
}

// ---------------------------------------------------------------- Part 1 cases
const domain = feishu.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
let tenant;
async function readMessage(id) {
  if (!tenant) {
    const auth = await fetch(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret }), signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    tenant = auth.tenant_access_token;
  }
  const res = await fetch(`${domain}/open-apis/im/v1/messages/${id}?card_msg_content_type=raw_card_content`, { headers: { Authorization: `Bearer ${tenant}` }, signal: AbortSignal.timeout(15000) }).then((r) => r.json());
  return res.code === 0 ? JSON.stringify(res.data?.items?.[0]?.body ?? {}) : `ERR ${res.code} ${res.msg}`;
}
const dmKey = `agent:makaron:feishu:direct:${OWNER}`;
const groupKey = `agent:makaron:feishu:group:${GROUP}`;
// Feishu returns the card parsed (markdown becomes styled runs), so compare plain text only.
const norm = (s) => String(s ?? "").replace(/\\+/gu, "").replace(/[`*_#>\[\]()~|-]/gu, "").replace(/\s+/gu, "");
async function uiCheck(t) {
  const root = t[0] && ledger().find((r) => r.id === t[0].chainId);
  const cards = root?.threadCards ?? {};
  const out = { cards: {}, finals: [] };
  for (const [key, id] of Object.entries(cards)) {
    const raw = await readMessage(id);
    // Feishu returns the card parsed into elements (a code span becomes its own run), so
    // join every text value of the card before comparing.
    const texts = [];
    const walk = (v) => {
      if (typeof v === "string") {
        try { if (/^[{[]/u.test(v.trim())) return walk(JSON.parse(v)); } catch { /* plain text */ }
        texts.push(v);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k === "content" || k === "text" || typeof x === "object" || (typeof x === "string" && /^[{[]/u.test(x.trim()))) walk(x);
    };
    try { walk(JSON.parse(raw)); } catch { texts.push(raw); }
    const body = norm(texts.join(""));
    // Every message of the thread, as said, appears in the card (first 12 chars of each).
    const missing = t.flatMap((r) => [r.message, r.reply].filter(Boolean)).map((s) => norm(s).slice(0, 12)).filter((s) => s && !body.includes(s));
    out.cards[key.includes(":group:") ? "group" : "dm"] = { id, status: /已完成/u.test(raw) ? "已完成" : /中断/u.test(raw) ? "中断" : /进行中/u.test(raw) ? "进行中" : "?", missing };
    // Messages are cut to the first 12 plain characters; one that starts with code or a link
    // may still differ after Feishu's parsing, so a miss is reported, not guessed away.
  }
  for (const r of t) if (r.finalMessageId) out.finals.push({ id: r.finalMessageId, text: (await readMessage(r.finalMessageId)).slice(0, 200) });
  out.pass = Object.keys(out.cards).length === 2 && Object.values(out.cards).every((c) => c.missing.length === 0 && c.status !== "?" && c.status !== "进行中") && out.finals.length <= 1;
  return out;
}
async function uiCase(h, kind) {
  const model = HARNESSES[h].model;
  await pin(groupKey, model, GROUP_NAME);
  await pin(dmKey, model);
  const since = Date.now();
  const mark = lines.length;
  let ask, busy;
  if (kind === "inline") {
    ask = await turn({ model, to: `user:${OWNER}`, message: `【候选测试·UI·${h}·当场】问一下「${GROUP_NAME}」群里的 V：今天是星期几？一句话就行。` });
  } else if (kind === "async") {
    ask = await turn({ model, to: `user:${OWNER}`, message: `【候选测试·UI·${h}·异步】让「${GROUP_NAME}」群里的 V 用 exec 执行 \`sleep 75 && date\`，然后把那个时间告诉我。不用一直等它，它做完会回来。` });
  } else if (kind === "steered") {
    busy = turn({ model, to: `chat:${GROUP}`, message: "【候选测试·UI·插队】请用 exec 执行 `sleep 50 && date`，然后回复「群里的活做完了」和那个时间。" });
    await sleep(12_000);
    ask = await turn({ model, to: `user:${OWNER}`, message: `【候选测试·UI·插队】让「${GROUP_NAME}」群里的 V 顺便告诉我：它现在手上在做什么。不用等它。` });
    busy = await busy;
  } else if (kind === "failed") {
    // The target session is pinned to a model this private Gateway cannot run.
    await pin(groupKey, "openai/gpt-5.6-sol", GROUP_NAME);
    ask = await turn({ model, to: `user:${OWNER}`, message: `【候选测试·UI·失败】让「${GROUP_NAME}」群里的 V 回一句「收到」。不用等它。` });
  }
  const t = await settle(dmKey, since, { quietMs: 30_000 });
  await sleep(6_000);
  const ui = t.length ? await uiCheck(t) : { pass: false, reason: "no sessions_send followed" };
  if (kind === "failed") await pin(groupKey, model, GROUP_NAME);
  return { harness: h, kind, askTurn: { exit: ask.exit, harness: ask.harness, secs: ask.secs, reply: ask.reply.slice(0, 300), stderr: ask.stderr }, busy: busy && { secs: busy.secs, reply: busy.reply.slice(0, 200) }, thread: show(t), ui, log: logSince(mark, /session relay|sessions_send reply flow/iu).slice(-12) };
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
startGateway();
try {
  await waitLog(/session relay follower started/u, 900_000, "relay follower");
  await waitLog(/starting Webhook server on 127\.0\.0\.1/u, 120_000, "Feishu webhook");
  summary.gatewayReadyMs = Date.now() - t0;
  if (suite === "ui") {
    // Seed the two real chats once so their sessions know their Feishu address.
    summary.seed = await Promise.all([
      turn({ model: HARNESSES.worker.model, to: `chat:${GROUP}`, message: "【候选测试·准备】只回复：就绪", timeout: 300 }),
      turn({ model: HARNESSES.worker.model, to: `user:${OWNER}`, message: "【候选测试·准备】接下来是自动测试，会有几张「⇄」卡片，可以忽略。只回复：好的", timeout: 300 }),
    ]).then((r) => r.map((x) => x.exit));
    summary.results.ui = [];
    const kinds = (process.env.EXP_UI_KINDS ?? "inline,async,steered,failed").split(",").map((k) => k.trim());
    for (const h of harnesses) for (const kind of kinds.filter((k) => k === "inline" || k === "async")) summary.results.ui.push(await uiCase(h, kind));
    if (harnesses.includes("worker")) for (const kind of kinds.filter((k) => k === "steered" || k === "failed")) summary.results.ui.push(await uiCase("worker", kind));
  } else {
    assert.equal(suite, "work", `unknown suite ${suite}`);
    summary.results.work = [];
    // Harnesses run side by side, trials one after another within a harness.
    await Promise.all(harnesses.map(async (h) => {
      for (const t of trialPlan.filter((x) => x.h === h)) {
        try {
          summary.results.work.push(await workTrial(t));
        } catch (error) {
          summary.results.work.push({ harness: h, case: t.c, trial: t.n, error: redact(error?.stack ?? error).slice(0, 800) });
        }
      }
    }));
    const table = {};
    const count = (k, ok) => { table[k] ??= { trials: 0, correct: 0 }; table[k].trials += 1; if (ok) table[k].correct += 1; };
    for (const r of summary.results.work) {
      count(`${r.harness} ${r.case}`, r.verdict?.correct);
      if (r.followUp) count(`${r.harness} W5`, r.followUp.correct);
    }
    summary.table = table;
  }
  summary.ok = true;
} catch (error) {
  summary.ok = false;
  summary.error = redact(error?.stack ?? error).slice(0, 3000);
  summary.tail = lines.slice(-60).map((l) => redact(l.line).slice(0, 300));
  process.exitCode = 1;
} finally {
  summary.totalMs = Date.now() - t0;
  summary.hookLines = lines.filter((l) => /session relay/u.test(l.line)).length;
  console.log(JSON.stringify(summary, null, 2));
  client?.stop();
  gateway?.kill("SIGTERM");
  await sleep(2_000);
  if (gateway && gateway.exitCode === null) gateway.kill("SIGKILL");
}
