// Candidate: what a Telegram conversation with V actually shows.
//
// A private Gateway runs its real Telegram channel against a loopback fake of
// the Bot API (lab/candidate/telegram-fake-bot-api.mjs), so no real bot or
// Telegram account is involved. Each scenario sends a user message as an
// update, presses buttons the bot shows, and records every message the bot
// sent and every edit it made. Turns are real model turns on the VLab Worker.
//
// TG_EXPECT=baseline only reports (the stock 9.1 behaviour).
// TG_EXPECT=patched also asserts the v-experience behaviour.
// TG_SCENARIOS picks scenarios (comma list); TG_MODEL picks the model.
// The model-roles scenario also patches the core command-auth and sets the
// command roles (lab/candidate/model-roles.mjs).
// The `secret-link` scenario also runs apps/v-secret-entry next to the
// Gateway, widens the core secret-entry patch to Telegram, follows the link
// the bot sends and submits a value over HTTP, like a person would. The links
// name a hostname, so the fake accepts the 填写凭据 button; with
// TG_SECRET_LINK_BASE=loopback they name 127.0.0.1, which Telegram (and the
// fake) refuse as a button url, so the link arrives as text.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFakeTelegramBotApi, FAKE_BOT_TOKEN, inlineButtons } from "./telegram-fake-bot-api.mjs";
import { assertModelRoles, configureRoles, patchCoreCommandAuth, ROLES_CONFIGURED, runModelRoles } from "./model-roles.mjs";
import { startHandoff } from "./channel-cards-support.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const EXPECT = process.env.TG_EXPECT ?? "baseline";
const MODEL = process.env.TG_MODEL ?? "deepseek/deepseek-v4-flash";
const SCENARIO_NAMES = (process.env.TG_SCENARIOS ?? "progress,ask-single,ask-multi,secret,background,model").split(",").map((s) => s.trim()).filter(Boolean);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]").replace(/bot\d+:[\w-]+/gu, "bot[redacted]");
const secret = (name) => {
  if (!fs.existsSync(SECRETS)) return undefined;
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};

const dist = path.join(runtime, "openclaw", "dist");
const patchReport = EXPECT === "patched"
  ? (await import(pathToFileURL(path.resolve("apps/v-experience/telegram/patch.mjs")).href)).patchTelegram(dist, { experienceSource: path.resolve("apps/v-experience/v-experience.mjs") })
  : undefined;
const fake = createFakeTelegramBotApi();
const apiPort = await fake.listen();

// ---- secret-link: the core patch for Telegram and the entry service ----
const SECRET_LINK = SCENARIO_NAMES.includes("secret-link");
// TG_SECRET_CORE=1 widens the core without the service: the `secret` scenario then shows the fallback.
const SECRET_CORE = SECRET_LINK || process.env.TG_SECRET_CORE === "1";
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
let secretEntry;
let secretCorePatch;
if (SECRET_CORE) {
  // The runtime already carries V's secret-entry v1 (as V does); widen it to Telegram.
  const core = await import(pathToFileURL(path.resolve("lab/release-files/feishu-secret-entry/patch-openclaw91-secret-entry.mjs")).href);
  const corePatch = fs.readdirSync(dist).filter((f) => /^(builtin-openclaw|dispatch-from-config)-[\w-]+\.js$/u.test(f)).map((file) => {
    const p = path.join(dist, file);
    const source = fs.readFileSync(p, "utf8");
    const entry = { file, v1: source.includes(core.MARKER), secretsPrompt: source.includes('if (toolName === "secrets") {') };
    if (file.startsWith("builtin-openclaw") && entry.secretsPrompt) {
      const result = core.patchSecretEntryChannelsSource(source);
      if (result.changed) fs.writeFileSync(p, result.source);
      entry.channels = result.changed ? "applied" : "already";
    }
    return entry;
  });
  assert(corePatch.some((e) => e.channels), `no builtin chunk with the secrets prompt: ${JSON.stringify(corePatch)}`);
  secretCorePatch = corePatch;
}
if (SECRET_LINK) {
  const dir = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "secret-entry");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, "admin-token"), `${crypto.randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  const [publicPort, adminPort] = [await freePort(), await freePort()];
  const serviceConfig = {
    bind: "127.0.0.1", publicBind: "127.0.0.1", publicPort, adminPort,
    publicBaseUrl: process.env.TG_SECRET_LINK_BASE === "loopback" ? `http://127.0.0.1:${publicPort}` : `http://secret-entry.vlab.test:${publicPort}`, pathPrefix: "/secret-entry",
    stateDir: path.join(dir, "state"), adminTokenFile: path.join(dir, "admin-token"), openclawDist: dist,
  };
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(serviceConfig, null, 2), { mode: 0o600 });
  secretEntry = { dir, publicPort, adminPort, config: serviceConfig, lines: [] };
}

// ---- private config: Telegram only, pointed at the fake ----
const USERS = Array.from({ length: 12 }, (_, i) => String(70000001 + i));
// Allowed to talk to the bot but not an owner (model-roles).
const NON_OWNER = "70000099";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {
  telegram: {
    enabled: true,
    botToken: FAKE_BOT_TOKEN,
    apiRoot: `http://127.0.0.1:${apiPort}`,
    dmPolicy: "allowlist",
    allowFrom: [...USERS, NON_OWNER],
    groupAllowFrom: [...USERS, NON_OWNER],
    ...(process.env.TG_STREAM_MODE ? { streaming: { mode: process.env.TG_STREAM_MODE } } : {}),
  },
};
config.commands = { ...(config.commands ?? {}), ownerAllowFrom: USERS.map((u) => `telegram:${u}`) };
config.plugins.entries = { ...(config.plugins.entries ?? {}), telegram: { ...(config.plugins.entries?.telegram ?? {}), enabled: true } };
if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("telegram")) config.plugins.allow.push("telegram");
// Same routing as V: the channel belongs to the makaron agent.
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "telegram"), { agentId: "makaron", match: { channel: "telegram" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin && process.env.TG_WORKER !== "off") {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
} else if (config.plugins.entries?.["vlab-agent-worker-isolation"]) {
  config.plugins.entries["vlab-agent-worker-isolation"].enabled = false;
}
config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODEL };
const rolesSetup = SCENARIO_NAMES.includes("model-roles")
  ? { coreCommandAuth: patchCoreCommandAuth(runtime), roles: configureRoles(config, "telegram", []) }
  : {};
// handoff-*: the desktop handoff service and this branch's plugin (lab/candidate/channel-cards-support.mjs).
// TG_HANDOFF_PUBLIC_BASE=loopback: links name 127.0.0.1, which Telegram refuses as a button url.
const HANDOFF_PUBLIC_BASE = process.env.TG_HANDOFF_PUBLIC_BASE === "loopback" ? "http://127.0.0.1:9" : "https://openclaw.example.test";
const handoff = SCENARIO_NAMES.some((n) => n.startsWith("handoff-"))
  ? await startHandoff({ dir: path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "desktop-handoff"), config, runtime, dist, publicBaseUrl: HANDOFF_PUBLIC_BASE })
  : undefined;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
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
if (secretEntry) {
  // The service calls the Gateway as its CLI does: same config, state and port.
  secretEntry.process = spawn(process.execPath, [path.resolve("apps/v-secret-entry/server.mjs"), path.join(secretEntry.dir, "config.json")], {
    env: { ...env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir }, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [secretEntry.process.stdout, secretEntry.process.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) secretEntry.lines.push(line); });
  }
  env.V_SECRET_ENTRY_ADMIN_URL = `http://127.0.0.1:${secretEntry.adminPort}`;
  env.V_SECRET_ENTRY_ADMIN_TOKEN_FILE = secretEntry.config.adminTokenFile;
}

const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
  env, stdio: ["ignore", "pipe", "pipe"],
});
for (const s of [gateway.stdout, gateway.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
    if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
  });
}

const waitFor = async (predicate, ms, label) => {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const value = predicate();
    if (value) return value;
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-40).map((l) => l.line).join("\n"))}`);
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
};

/** Bot messages in one chat since `since`, oldest first. */
const chatMessages = (chatId, since = 0) => fake.messages().filter((m) => m.chatId === String(chatId) && m.createdAt >= since).sort((a, b) => a.messageId - b.messageId);
const lastActivity = (chatId) => Math.max(0, ...chatMessages(chatId).flatMap((m) => m.history.map((h) => h.at)));
/** Wait until the chat has been quiet for `quietMs` and `done` holds. */
const settle = async (chatId, since, done, { quietMs = 6000, timeoutMs = 300_000, label = "reply" } = {}) =>
  waitFor(() => {
    const msgs = chatMessages(chatId, since);
    return msgs.length > 0 && done(msgs) && Date.now() - lastActivity(chatId) > quietMs ? msgs : null;
  }, timeoutMs, label);

const describe = (msgs) => msgs.map((m) => {
  const distinct = [];
  for (const h of m.history) if (h.text !== undefined && distinct.at(-1) !== h.text) distinct.push(h.text);
  return {
    id: m.messageId, kind: m.kind, deleted: m.deleted,
    edits: m.history.filter((h) => h.op !== "send").length,
    final: m.text?.slice(0, 1500),
    buttons: inlineButtons(m),
    // A sample of intermediate states, enough to see what streamed.
    states: distinct.length <= 8 ? distinct.map((t) => t.slice(0, 600)) : [...distinct.slice(0, 4), `… ${distinct.length - 8} more …`, ...distinct.slice(-4)].map((t) => t.slice(0, 600)),
  };
});
const anyText = (msgs, re) => msgs.some((m) => m.history.some((h) => re.test(h.text ?? "")));

let userIndex = 0;
const newChat = () => USERS[userIndex++];

// The 「电脑」 card: a photo with the card as caption and 接管 / 完成 / 跳过; press `command`'s
// button (Telegram core turns callback data "/v-handback <id>" into that command from the presser).
const HANDOFF_ASK = "这是自动化测试，请严格照做。立即调用 desktop_handoff_request 工具，参数 reason 填「需要你登录测试站点」。工具返回后按它返回的 instruction 只回复一句话，然后结束，不要做别的事。收到 /v-handback 或 /v-skip 之后，只回复一句「收到，继续」。";
const handoffScenario = async (command) => {
  const chat = newChat();
  const since = Date.now();
  // The model sometimes answers without calling the tool: ask once more in that case.
  const replies = [];
  let card;
  for (let attempt = 0; attempt < 2 && !card; attempt += 1) {
    const at = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: HANDOFF_ASK });
    const found = await waitFor(() => chatMessages(chat, at).find((m) => m.history[0]?.replyMarkup?.inline_keyboard?.flat().some((b) => /^\/v-handback h_/u.test(b.callback_data ?? "")))
      ?? (chatMessages(chat, at).some((m) => m.kind === "text" && !m.deleted) && Date.now() - lastActivity(chat) > 20_000 ? "no-card" : null), 300_000, "handoff card");
    if (found === "no-card") replies.push(chatMessages(chat, at).map((m) => m.text).join("\n").slice(-300));
    else card = found;
  }
  if (!card) throw new Error(`no handoff card; replies: ${JSON.stringify(replies)}`);
  await settle(chat, since, (msgs) => msgs.some((m) => m !== card && m.kind === "text" && !m.deleted), { label: "handoff reply", quietMs: 6000, timeoutMs: 240_000 }).catch(() => null);
  const sentButtons = (card.history[0].replyMarkup?.inline_keyboard ?? []).flat().map((b) => ({ text: b.text, data: b.callback_data, url: b.url }));
  const id = handoff.issued().at(-1)?.id;
  const token = new RegExp(`/desktop-handoff/#([\\w-]+)`, "u").exec([card.history[0].text, ...sentButtons.map((b) => b.url ?? "")].join("\n"))?.[1];
  const hide = (value) => (token ? JSON.parse(JSON.stringify(value).replaceAll(token, "[token]")) : value);
  const claimStatus = token ? await handoff.claim(token) : null;
  const before = await handoff.status(id);
  const data = sentButtons.find((b) => b.data?.startsWith(`/${command} `))?.data;
  const pressedAt = Date.now();
  if (data) fake.pressButton({ chatId: chat, userId: chat, messageId: card.messageId, data });
  const expected = command === "v-handback" ? "done" : "skipped";
  let status = null;
  for (const until = Date.now() + 60_000; Date.now() < until;) {
    status = await handoff.status(id);
    if (status?.card?.state === expected) break;
    await sleep(500);
  }
  await settle(chat, pressedAt, (msgs) => anyText(msgs, /收到|继续/u), { label: "after the press", quietMs: 8000, timeoutMs: 240_000 }).catch(() => null);
  return {
    chat,
    retriedAsk: replies,
    handoffId: id,
    kind: card.kind,
    photo: card.photo,
    threadId: card.threadId ?? null,
    cover: handoff.cover,
    sent: hide({ caption: card.history[0].text, parseMode: card.parseMode, buttons: sentButtons }),
    refusedFirst: fake.calls.filter((c) => c.at >= since && c.at <= card.createdAt && c.error).map((c) => `${c.method}: ${c.error}`),
    claimStatus,
    before: { cardState: before?.card?.state, cardChannel: before?.card?.channel, ended: before?.ended },
    pressed: data,
    edits: hide(card.history.slice(1).map((h) => ({ op: h.op, text: h.text?.slice(0, 300), buttons: (h.replyMarkup?.inline_keyboard ?? []).flat().map((b) => b.text) }))),
    final: hide({ caption: card.text, buttons: inlineButtons(card).map((b) => b.text) }),
    after: { cardState: status?.card?.state, ended: status?.ended, endReason: status?.endReason },
    afterPress: chatMessages(chat, pressedAt).filter((m) => m !== card).map((m) => String(m.text ?? "").slice(0, 300)),
    urlInReply: chatMessages(chat, since).filter((m) => m !== card).some((m) => /desktop-handoff/u.test(m.text ?? "")),
    handoffLog: lines.filter((l) => /desktop.handoff|v-desktop-handoff/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-10),
  };
};

let gatewayRuntime;
const gatewayCall = async (method, params) => {
  gatewayRuntime ??= await import(pathToFileURL(path.join(dist, "plugin-sdk", "gateway-runtime.js")).href);
  // Explicit URL: this process's environment may name another Gateway port.
  return gatewayRuntime.callGatewayFromCli(method, { json: true, timeout: "15000", url: `ws://127.0.0.1:${port}`, token }, params, { scopes: ["operator.admin", "operator.questions"], progress: false });
};

/**
 * Where a submitted value shows up: every state/data file written since `since`
 * (transcripts, session and agent databases, logs), the Gateway and service
 * output, and everything the bot sent. The secret store is where it belongs
 * and is listed separately: the `secrets/` mirror, and SQLite databases whose
 * only rows holding the value are in `secret_store_entries` (their WAL too).
 */
function findValue(value, since) {
  const needle = Buffer.from(value);
  const hits = { files: [], secretStore: [], gatewayLog: 0, serviceLog: 0, botApi: 0, filesScanned: 0 };
  const roots = [...new Set([stateDir, process.env.VLAB_CANDIDATE_DATA].filter(Boolean))];
  const seen = new Set();
  const scan = (p) => {
    const fd = fs.openSync(p, "r");
    try {
      const buf = Buffer.alloc(8 << 20);
      let carry = Buffer.alloc(0);
      for (let pos = 0; ; ) {
        const n = fs.readSync(fd, buf, 0, buf.length, pos);
        if (!n) return false;
        const chunk = Buffer.concat([carry, buf.subarray(0, n)]);
        if (chunk.includes(needle)) return true;
        carry = chunk.subarray(Math.max(0, chunk.length - needle.length));
        pos += n;
      }
    } finally {
      fs.closeSync(fd);
    }
  };
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (seen.has(p)) continue;
      seen.add(p);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile()) continue;
      try {
        if (fs.statSync(p).mtimeMs < since - 1000) continue;
        hits.filesScanned += 1;
        if (scan(p)) (p.split(path.sep).includes("secrets") ? hits.secretStore : hits.files).push(path.relative(stateDir, p));
      } catch { /* vanished or unreadable */ }
    }
  };
  for (const root of roots) walk(root);
  // Which tables of a database hold the value; a WAL follows its database.
  const tablesWith = (file) => {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const found = [];
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
        const cols = db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all().map((c) => c.name);
        if (!cols.length) continue;
        const where = cols.map((c) => `instr(CAST("${c.replaceAll('"', '""')}" AS BLOB), CAST(? AS BLOB)) > 0`).join(" OR ");
        const n = db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}" WHERE ${where}`).get(...cols.map(() => value)).n;
        if (n) found.push(`${name}:${n}`);
      }
      return found;
    } finally {
      db.close();
    }
  };
  hits.databases = {};
  for (const rel of [...hits.files]) {
    const base = rel.replace(/-(wal|shm|journal)$/u, "");
    if (!/\.sqlite$/u.test(base)) continue;
    try { hits.databases[base] ??= tablesWith(path.join(stateDir, base)); } catch (error) { hits.databases[base] = [`unreadable: ${String(error?.message ?? error).slice(0, 120)}`]; }
    if (hits.databases[base].length && hits.databases[base].every((t) => t.startsWith("secret_store_entries:"))) {
      hits.files.splice(hits.files.indexOf(rel), 1);
      hits.secretStore.push(`${rel} (secret_store_entries)`);
    }
  }
  hits.gatewayLog = lines.filter((l) => l.line.includes(value)).length;
  hits.serviceLog = (secretEntry?.lines ?? []).filter((l) => l.includes(value)).length;
  hits.botApi = fake.calls.filter((c) => JSON.stringify(c.params ?? {}).includes(value)).length + fake.messages().filter((m) => JSON.stringify(m.history).includes(value)).length;
  return hits;
}

const SCENARIOS = {
  // B1/B2: process streaming and the progress checklist.
  progress: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: [
      "这是一次自动化测试，请严格照做。",
      "1) 调用 progress_card 工具，建立一个 3 步计划：「查资料」「写草稿」「检查」，第 1 步进行中。",
      "2) 用 exec 运行 `sleep 4 && echo STEP1`。",
      "3) 再调用 progress_card：第 1 步完成，第 2 步进行中。",
      "4) 用 exec 运行 `sleep 4 && echo STEP2`。",
      "5) 再调用 progress_card：3 步全部完成。",
      "6) 最后只回复 PROGRESS_DONE。",
    ].join("\n") });
    const msgs = await settle(chat, since, (m) => anyText(m, /PROGRESS_DONE/u), { label: "progress reply" });
    return {
      chat, messages: describe(msgs),
      sawChecklist: anyText(msgs, /写草稿/u),
      sawCheckedStep: anyText(msgs, /☑️[^\n]*查资料|✅[^\n]*查资料|~查资料~/u),
      sawToolLine: anyText(msgs, /exec|sleep|🛠|⚙/iu),
      finalHasChecklist: msgs.some((m) => /写草稿/u.test(m.text ?? "") && /PROGRESS_DONE/u.test(m.text ?? "")),
      // V's layout instead of the stock draft: "🛠️ Exec", a rule, the plan; no "Working" headline or raw progress_card line.
      sawFeishuToolLine: anyText(msgs, /🛠️ Exec/u),
      sawPlanUnderRule: anyText(msgs, /───[\s\S]*(☑️|▶️|◻️)/u),
      sawStockDraft: anyText(msgs, /^Working\b|Progress Card/mu),
      workingMessageGone: msgs.filter((m) => !m.deleted && /写草稿/u.test(m.text ?? "")).length === 0,
    };
  },
  // A1: one single-choice question, answered by a button press.
  "ask-single": async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "这是自动化测试。请调用 ask_user 工具问我一个单选题：「午饭吃什么？」选项为 面条、米饭、饺子。拿到答案后只回复「午饭定了：<答案>」。" });
    const asked = await waitFor(() => chatMessages(chat, since).find((m) => inlineButtons(m).some((b) => /饺子/u.test(b.text))), 240_000, "question buttons").catch(() => null);
    let pressed = null;
    if (asked) {
      const button = inlineButtons(asked).find((b) => /饺子/u.test(b.text));
      pressed = { text: button.text, data: button.data };
      fake.pressButton({ chatId: chat, userId: chat, messageId: asked.messageId, data: button.data });
    } else {
      fake.sendUserText({ chatId: chat, userId: chat, text: "饺子" });
    }
    const msgs = await settle(chat, since, (m) => anyText(m, /午饭定了/u), { label: "ask-single answer" });
    return { chat, buttonsShown: Boolean(asked), pressed, answeredBy: asked ? "button" : "chat", messages: describe(msgs), continued: anyText(msgs, /午饭定了[：:]\s*饺子/u) };
  },
  // A1: multi-select, which stock 9.1 renders as text only.
  "ask-multi": async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "这是自动化测试。请调用 ask_user 工具问我一个多选题（允许多选）：「周末想做什么？」选项为 爬山、看电影、读书、做饭。拿到答案后只回复「周末安排：<答案>」。" });
    const asked = await waitFor(() => chatMessages(chat, since).find((m) => (/爬山/u.test(m.text ?? "") && /读书/u.test(m.text ?? "")) || (inlineButtons(m).some((b) => /爬山/u.test(b.text)) && inlineButtons(m).some((b) => /读书/u.test(b.text)))), 240_000, "multi question").catch(() => null);
    const buttons = asked ? inlineButtons(asked) : [];
    const pressedSeq = [];
    const pick = (re) => buttons.find((b) => re.test(b.text) && b.data);
    const confirm = () => inlineButtons(chatMessages(chat, since).find((m) => m.messageId === asked.messageId)).find((b) => /确认|继续|提交|Done|Submit/iu.test(b.text) && b.data);
    if (pick(/爬山/u) && pick(/读书/u)) {
      for (const re of [/爬山/u, /读书/u]) {
        const before = chatMessages(chat, since).find((m) => m.messageId === asked.messageId).history.length;
        const b = inlineButtons(chatMessages(chat, since).find((m) => m.messageId === asked.messageId)).find((x) => re.test(x.text));
        fake.pressButton({ chatId: chat, userId: chat, messageId: asked.messageId, data: b.data });
        pressedSeq.push(b.text);
        await waitFor(() => chatMessages(chat, since).find((m) => m.messageId === asked.messageId).history.length > before, 15_000, `toggle ${b.text}`).catch(() => null);
      }
      const c = confirm();
      if (c) { fake.pressButton({ chatId: chat, userId: chat, messageId: asked.messageId, data: c.data }); pressedSeq.push(c.text); }
    } else {
      fake.sendUserText({ chatId: chat, userId: chat, text: "爬山、读书" });
    }
    const msgs = await settle(chat, since, (m) => anyText(m, /周末安排/u), { label: "ask-multi answer" });
    return { chat, questionShown: Boolean(asked), buttons: buttons.map((b) => b.text), pressed: pressedSeq, answeredBy: pressedSeq.length ? "buttons" : "chat", messages: describe(msgs), continued: anyText(msgs, /周末安排[^\n]*爬山[^\n]*读书|周末安排[^\n]*读书[^\n]*爬山/u) };
  },
  // A3: a credential request.
  // C2: a message sent while V is replying steers the running turn.
  steer: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "测试 steer：用 exec 执行 sleep 40，然后只回复 STEER_A" });
    await waitFor(() => anyText(chatMessages(chat, since), /Exec|运行命令/u), 120_000, "steer tool start").catch(() => null);
    await sleep(5000);
    fake.sendUserText({ chatId: chat, userId: chat, text: "改成只回复 STEER_B" });
    const msgs = await settle(chat, since, (m) => anyText(m, /STEER_B/u), { label: "steer reply", timeoutMs: 240_000, quietMs: 15_000 }).catch(() => chatMessages(chat, since));
    const finals = msgs.filter((m) => !m.deleted).map((m) => m.text ?? "");
    return { finals: finals.map((t) => t.slice(0, 200)), steered: finals.some((t) => /STEER_B/u.test(t)), answeredA: finals.some((t) => /STEER_A/u.test(t) && !/STEER_B/u.test(t)) };
  },
  secret: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用，可以随便填）。拿到后只回复 SECRET_SAVED；如果没法索取，就回复 SECRET_UNAVAILABLE 并说明原因。" });
    const msgs = await settle(chat, since, (m) => m.some((x) => /SECRET_|凭据|credential|secret/iu.test(x.text ?? "")), { label: "secret request", quietMs: 10_000 });
    return { chat, messages: describe(msgs), buttons: msgs.flatMap(inlineButtons), notice: anyText(msgs, /不能安全地输入凭据/u), agentCarriedOn: anyText(msgs, /SECRET_UNAVAILABLE/u) };
  },
  // A3 by link: the bot sends a one-time link; the value is typed on the page.
  "secret-link": async () => {
    const chat = newChat();
    const since = Date.now();
    const name = "V_CANDIDATE_DEMO_TOKEN";
    const value = `vsl-${crypto.randomBytes(12).toString("hex")}`;
    fake.sendUserText({ chatId: chat, userId: chat, text: `这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 ${name} 的凭据（说明写：测试用，可以随便填）。拿到后只回复 SECRET_SAVED；如果没法索取，就回复 SECRET_UNAVAILABLE 并说明原因。` });
    const linkRe = /(https?:\/\/\S+\/secret-entry\/#([\w-]+))/u;
    // Behind the 填写凭据 button, or (refused button) in the text.
    const linkOf = (m) => inlineButtons(m).find((b) => linkRe.test(b.url ?? ""))?.url ?? (linkRe.test(m.text ?? "") ? m.text : undefined);
    const linkMessage = await waitFor(() => chatMessages(chat, since).find(linkOf), 300_000, "secret link message");
    const [, url, token] = linkRe.exec(linkOf(linkMessage));
    const linkButton = inlineButtons(linkMessage).find((b) => linkRe.test(b.url ?? ""));
    const base = `http://127.0.0.1:${secretEntry.publicPort}/secret-entry`;
    const post = async (route, body) => { const r = await fetch(`${base}/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const page = await fetch(`${base}/`);
    const pageText = await page.text();
    const info = await post("info", { token });
    const adminToken = fs.readFileSync(secretEntry.config.adminTokenFile, "utf8").trim();
    const linkState = await fetch(`http://127.0.0.1:${secretEntry.adminPort}/v1/links`, { headers: { authorization: `Bearer ${adminToken}` } }).then((r) => r.json());
    const questionId = linkState.links?.at(-1)?.questionId;
    const getQuestion = () => gatewayCall("question.get", { id: questionId }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 300) }));
    const before = questionId ? await getQuestion() : undefined;
    const submitStarted = Date.now();
    const submit = await post("submit", { token, value });
    const msgs = await settle(chat, since, (m) => anyText(m, /SECRET_(SAVED|UNAVAILABLE)/u), { label: "secret-link reply", quietMs: 8000 });
    const savedAt = msgs.filter((m) => /SECRET_SAVED/u.test(m.text ?? "")).map((m) => m.createdAt);
    const reuse = await post("submit", { token, value: "second-use" });
    const after = questionId ? await getQuestion() : undefined;
    const mirror = path.join(stateDir, "secrets", "store", name);
    await sleep(3000);
    const linkSend = fake.calls.find((c) => c.method === "sendMessage" && !c.error && JSON.stringify(c.params ?? {}).includes("/secret-entry/"));
    return {
      chat, messages: describe(msgs).map((m) => JSON.parse(JSON.stringify(m).replaceAll(token, "[token]"))), linkMessage: linkMessage.text.replace(token, "[token]"),
      linkVia: linkButton ? "button" : "text", linkButton: linkButton ? { text: linkButton.text, url: linkButton.url.replace(token, "[token]") } : null,
      linkParseMode: linkMessage.parseMode ?? null, refusedButtons: fake.calls.filter((c) => /BUTTON_URL_INVALID/u.test(c.error ?? "")).length,
      linkHost: new URL(url).host, linkSendOptions: linkSend ? Object.keys(linkSend.params).filter((k) => k !== "text") : null,
      linkPreviewDisabled: Boolean(linkSend && JSON.stringify(linkSend.params).includes("is_disabled")),
      pageHasPasswordInput: /type="password"/u.test(pageText), pageStatus: page.status, info: { status: info.status, name: info.body.name, reason: info.body.reason },
      questionId, before: before?.question ? { status: before.question.status } : before,
      submit, reuse: reuse.status, replyAfterSubmitSecs: savedAt.length ? Math.round((Math.min(...savedAt) - submitStarted) / 1000) : null,
      after: after?.question ? JSON.parse(JSON.stringify(after.question, (k, v) => (k === "questions" ? undefined : v))) : after,
      cancelled: anyText(msgs, /不能安全地输入凭据/u),
      saved: anyText(msgs, /SECRET_SAVED/u),
      mirrorMatches: fs.existsSync(mirror) ? fs.readFileSync(mirror, "utf8") === value : null,
      leaks: findValue(value, since),
    };
  },
  // B3: background work left running after the reply.
  background: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "这是自动化测试，请严格照做，不要等待任何结果。第一步：调用 sessions_spawn 启动一个子 agent，task 写：`用 exec 运行 sleep 40，然后回复 CHILD_DONE。` 第二步：两个工具都返回后，立刻只回复 BG_OK。" });
    const answered = await settle(chat, since, (m) => anyText(m, /BG_OK/u), { label: "background reply", quietMs: 4000 });
    const snapshotAtAnswer = describe(answered);
    await sleep(70_000);
    const later = chatMessages(chat, since);
    return { chat, atAnswer: snapshotAtAnswer, after70s: describe(later), sawBackgroundLine: anyText(later, /后台 \d+ 项进行中/u), sawBackgroundDone: anyText(later, /后台任务已结束/u) };
  },
  // C1: model / harness switching.
  model: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "/model" });
    const msgs = await settle(chat, since, (m) => m.length > 0, { label: "/model reply", quietMs: 3000, timeoutMs: 60_000 });
    const result = { chat, messages: describe(msgs), buttons: msgs.flatMap(inlineButtons).map((b) => b.text) };
    const since2 = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "/model deepseek/deepseek-v4-pro" });
    result.switch = describe(await settle(chat, since2, (m) => m.length > 0, { label: "/model switch", quietMs: 3000, timeoutMs: 60_000 }));
    return result;
  },
  // A4: V's 「电脑」 card — photo + 接管 / 完成 / 跳过, edited in place; 完成 pressed.
  "handoff-card": () => handoffScenario("v-handback"),
  // The same card, 跳过 pressed: the handoff ends.
  "handoff-skip": () => handoffScenario("v-skip"),
  // C1: the owner keeps every command; a non-owner may only switch their own session's model.
  "model-roles": () => runModelRoles({
    dist, port, token, config,
    transport: {
      owner: USERS.at(-1), nonOwner: NON_OWNER,
      send: (user, text) => fake.sendUserText({ chatId: user, userId: user, text }),
      text: (user, since) => chatMessages(user, since).flatMap((m) => m.history.map((h) => h.text ?? "")).filter(Boolean).join("\n\n"),
      connections: () => fake.calls.filter((c) => c.method === "getMe").length,
    },
  }),
};

const report = { expect: EXPECT, model: MODEL, patch: patchReport, ...rolesSetup, secretEntryCorePatch: secretCorePatch, scenarios: {} };
try {
  await waitFor(() => fake.calls.some((c) => c.method === "getMe"), 600_000, "Telegram channel start (getMe)");
  await sleep(3000);
  report.startupCalls = [...new Set(fake.calls.map((c) => c.method))];
  for (const name of SCENARIO_NAMES) {
    const started = Date.now();
    try {
      report.scenarios[name] = { ...(await SCENARIOS[name]()), secs: Math.round((Date.now() - started) / 1000) };
    } catch (error) {
      report.scenarios[name] = { error: redact(String(error?.message ?? error)).slice(0, 1500), secs: Math.round((Date.now() - started) / 1000) };
    }
  }
  report.apiErrors = fake.calls.filter((c) => c.error).map((c) => `${c.method}: ${c.error}`).slice(0, 30);
  report.callbackAnswers = fake.callbackAnswers.map((a) => a.text ?? "").slice(0, 20);
  report.gatewayErrors = lines.filter((l) => /telegram/iu.test(l.line) && /error|failed/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-20);
  report.experienceLog = lines.filter((l) => /v-experience/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-40);
  if (secretEntry) {
    report.secretEntryLog = secretEntry.lines.map((l) => redact(l).slice(0, 300)).slice(-20);
    try {
      report.secretEntryAudit = fs.readFileSync(path.join(secretEntry.config.stateDir, "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    } catch {
      report.secretEntryAudit = [];
    }
    report.secretLines = lines.filter((l) => /secret|credential/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-30);
  }
} catch (error) {
  report.fatal = redact(String(error?.message ?? error)).slice(0, 3000);
  report.gatewayTail = lines.slice(-120).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  gateway.kill("SIGTERM");
  secretEntry?.process?.kill("SIGTERM");
  await handoff?.close();
  await sleep(3000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await fake.close();
}

const out = path.join(scratch, "telegram-experience-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

if (EXPECT === "patched") {
  const s = report.scenarios;
  if (s.progress) {
    assert.equal(s.progress.error, undefined, s.progress.error);
    assert(s.progress.sawChecklist, "progress_card checklist never appeared in the reply");
    assert(s.progress.sawCheckedStep, "checklist never showed a finished step");
    assert(s.progress.sawFeishuToolLine, "working message never showed the Feishu tool line");
    assert(s.progress.sawPlanUnderRule, "plan was not under a rule in the working message");
    assert(!s.progress.sawStockDraft, "stock Working draft still shown");
    assert(s.progress.workingMessageGone, "working message stayed after the answer");
  }
  if (s["ask-multi"]) {
    assert.equal(s["ask-multi"].error, undefined, s["ask-multi"].error);
    assert.equal(s["ask-multi"].answeredBy, "buttons", "multi-select question had no toggle buttons");
    assert(s["ask-multi"].continued, "multi-select answer did not reach the agent");
  }
  if (s["ask-single"]) {
    assert.equal(s["ask-single"].answeredBy, "button", "single question had no option buttons");
    assert(s["ask-single"].continued, "single question answer did not reach the agent");
  }
  if (s.secret && !SECRET_LINK) assert(s.secret.notice && s.secret.agentCarriedOn, "credential request did not end with a notice");
  if (s["secret-link"]) {
    const r = s["secret-link"];
    assert.equal(r.error, undefined, r.error);
    assert(r.pageHasPasswordInput, "entry page has no password input");
    if (process.env.TG_SECRET_LINK_BASE === "loopback") {
      assert.equal(r.linkVia, "text", "a refused button must fall back to the text link");
      assert(r.refusedButtons >= 1, "the button was never tried");
    } else {
      assert.equal(r.linkVia, "button", "the link is not behind a button");
      assert.equal(r.linkButton.text, "填写凭据");
      assert.match(r.linkMessage, /^<b>🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN<\/b>\n\n/u, "card title");
      assert.equal(r.linkParseMode, "HTML");
      assert.doesNotMatch(r.linkMessage, /secret-entry/u, "the url is only behind the button");
    }
    assert.equal(r.info.status, 200, "link info not readable");
    assert.equal(r.before?.status, "pending", "question was not waiting when the link was used");
    assert.equal(r.submit.status, 200, `submit failed: ${JSON.stringify(r.submit)}`);
    assert.equal(r.reuse, 410, "the link worked twice");
    assert(r.saved, "agent did not reply SECRET_SAVED");
    assert(!r.cancelled, "the old notice + cancel was shown");
    assert.notEqual(r.mirrorMatches, false, "stored value differs from the submitted one");
    assert.deepEqual(r.leaks.files, [], `value found outside the secret store: ${r.leaks.files.join(", ")}`);
    assert.equal(r.leaks.gatewayLog + r.leaks.serviceLog + r.leaks.botApi, 0, "value found in logs or chat");
    assert(!JSON.stringify(report.secretEntryAudit ?? []).includes("vsl-"), "value in the service audit");
  }
  if (s.steer) assert(s.steer.steered && !s.steer.answeredA, "steer: second message did not steer the running reply");
  if (s.background) {
    assert.equal(s.background.error, undefined, s.background.error);
    assert(s.background.sawBackgroundLine, "background work line never appeared");
  }
  if (s["model-roles"]) {
    assert.equal(s["model-roles"].error, undefined, s["model-roles"].error);
    if (ROLES_CONFIGURED) assertModelRoles(s["model-roles"]);
  }
  for (const name of ["handoff-card", "handoff-skip"]) if (s[name]) {
    const r = s[name];
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.kind, "photo", "the card is not a photo");
    assert.deepEqual({ bytes: r.photo?.bytes, jpeg: r.photo?.jpeg }, { bytes: r.cover.bytes, jpeg: true }, "the desktop picture was not uploaded with the card");
    assert.equal(r.sent.parseMode, "HTML");
    assert.match(r.sent.caption, /^<b>电脑<\/b> · 需要操作\n\n需要你登录测试站点\n\n<i>点「接管」打开 V 的电脑直接操作，做完点「完成」，V 接着做；不需要就点「跳过」。\d+ 分钟内打开有效。<\/i>/u);
    // (the report went through JSON: absent fields, not undefined ones)
    const commands = [{ text: "完成", data: `/v-handback ${r.handoffId}` }, { text: "跳过", data: `/v-skip ${r.handoffId}` }];
    if (HANDOFF_PUBLIC_BASE.startsWith("https://")) {
      assert.deepEqual(r.sent.buttons, [{ text: "接管", url: "https://openclaw.example.test/desktop-handoff/#[token]" }, ...commands]);
      assert.deepEqual(r.refusedFirst, []);
    } else {
      // Telegram refuses a non-public url as a button: the link moves into the caption.
      assert(r.refusedFirst.some((e) => /sendPhoto: .*BUTTON_URL_INVALID/u.test(e)), `the url button was not tried first: ${r.refusedFirst}`);
      assert.deepEqual(r.sent.buttons, commands);
      assert.match(r.sent.caption, /\n\n接管：http:\/\/127\.0\.0\.1:9\/desktop-handoff\/#\[token\]$/u);
    }
    assert.equal(r.claimStatus, 200, "the card's link does not open the handoff");
    assert.deepEqual(r.before, { cardState: "pending", cardChannel: "telegram", ended: false });
    assert(!r.urlInReply, "the url was also pasted into the reply");
    const word = name === "handoff-card" ? "已完成" : "已跳过";
    assert.equal(r.after.cardState, name === "handoff-card" ? "done" : "skipped", `${r.pressed} did not reach the plugin`);
    assert.equal(r.after.ended, name === "handoff-skip");
    assert.match(r.final.caption, new RegExp(`^<b>电脑</b> · ${word}\\n\\n需要你登录测试站点\\n\\n<i>`, "u"), "the card was not edited in place");
    assert.deepEqual(r.final.buttons, [], "buttons left on a finished card");
    assert(r.edits.some((e) => e.op === "edit-caption" && e.text.includes(word)), "no caption edit");
    assert.match(r.afterPress.join("\n"), /收到|继续/u, "the agent did not continue after the press");
  }
}
