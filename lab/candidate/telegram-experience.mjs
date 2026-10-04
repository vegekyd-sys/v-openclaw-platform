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
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFakeTelegramBotApi, FAKE_BOT_TOKEN, inlineButtons } from "./telegram-fake-bot-api.mjs";
import { assertModelRoles, configureRoles, patchCoreCommandAuth, ROLES_CONFIGURED, runModelRoles } from "./model-roles.mjs";

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
  secret: async () => {
    const chat = newChat();
    const since = Date.now();
    fake.sendUserText({ chatId: chat, userId: chat, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用，可以随便填）。拿到后只回复 SECRET_SAVED；如果没法索取，就回复 SECRET_UNAVAILABLE 并说明原因。" });
    const msgs = await settle(chat, since, (m) => m.some((x) => /SECRET_|凭据|credential|secret/iu.test(x.text ?? "")), { label: "secret request", quietMs: 10_000 });
    return { chat, messages: describe(msgs), buttons: msgs.flatMap(inlineButtons), notice: anyText(msgs, /不能安全地输入凭据/u), agentCarriedOn: anyText(msgs, /SECRET_UNAVAILABLE/u) };
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

const report = { expect: EXPECT, model: MODEL, patch: patchReport, ...rolesSetup, scenarios: {} };
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
} catch (error) {
  report.fatal = redact(String(error?.message ?? error)).slice(0, 3000);
  report.gatewayTail = lines.slice(-120).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  gateway.kill("SIGTERM");
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
  if (s.secret) assert(s.secret.notice && s.secret.agentCarriedOn, "credential request did not end with a notice");
  if (s.background) {
    assert.equal(s.background.error, undefined, s.background.error);
    assert(s.background.sawBackgroundLine, "background work line never appeared");
  }
  if (s["model-roles"]) {
    assert.equal(s["model-roles"].error, undefined, s["model-roles"].error);
    if (ROLES_CONFIGURED) assertModelRoles(s["model-roles"]);
  }
}
