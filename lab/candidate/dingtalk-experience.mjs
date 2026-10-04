// Candidate: what a DingTalk conversation with V actually shows.
//
// The production DingTalk connector (copied from V as an npm project tarball,
// code only) runs in a private Gateway against a loopback fake of the DingTalk
// open platform (lab/candidate/dingtalk-fake-open-api.mjs). The candidate
// rewrites api.dingtalk.com / oapi.dingtalk.com to the fake in its private copy
// only. Scenarios send robot messages over the fake Stream connection and
// record every AI card state and session-webhook message. Turns are real model
// turns on the VLab Worker.
//
// DT_EXPECT=baseline only reports; DT_EXPECT=patched applies
// apps/v-experience/dingtalk/patch.mjs to the private copy and asserts.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeDingTalkOpenApi } from "./dingtalk-fake-open-api.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const EXPECT = process.env.DT_EXPECT ?? "baseline";
const MODEL = process.env.DT_MODEL ?? "deepseek/deepseek-v4-flash";
const SCENARIO_NAMES = (process.env.DT_SCENARIOS ?? "progress,ask-single,ask-multi,secret,background").split(",").map((s) => s.trim()).filter(Boolean);
// The connector project (package.json, lock, node_modules) tarred from V, passed
// as an external support input and found by basename.
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
const TARBALL = process.env.DT_PROJECT_TARBALL ?? findInput(TARBALL_NAME);
assert(TARBALL, `${TARBALL_NAME} support input is missing`);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
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
const { WebSocketServer } = createRequire(path.join(project, "node_modules", "noop.js"))("ws");
const fake = createFakeDingTalkOpenApi({ WebSocketServer });
const apiPort = await fake.listen();
const fakeBase = `http://127.0.0.1:${apiPort}`;

const report = { expect: EXPECT, model: MODEL, scenarios: {} };
if (EXPECT === "patched") {
  const { patchDingtalkConnector } = await import(pathToFileURL(path.resolve("apps/v-experience/dingtalk/patch.mjs")).href);
  report.patch = patchDingtalkConnector(pluginDist, { experienceSource: path.resolve("apps/v-experience/v-experience.mjs") });
}
// Candidate-only: point every DingTalk host at the fake, in this private copy.
let rewritten = 0;
for (const file of [
  ...fs.readdirSync(pluginDist).filter((f) => f.endsWith(".mjs")).map((f) => path.join(pluginDist, f)),
  ...["constants.mjs", "constants.cjs"].map((f) => path.join(project, "node_modules", "dingtalk-stream", "dist", f)),
]) {
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
// Same routing as V: the channel belongs to the makaron agent.
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "dingtalk-connector"), { agentId: "makaron", match: { channel: "dingtalk-connector" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin && process.env.DT_WORKER !== "off") {
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
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Candidate-only: the relocated connector has no official install record, so the
// trusted-runtime gate would refuse its ingress queue (same as the Feishu candidates).
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
for (const s of [gateway.stdout, gateway.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
    if (lines.length > 30_000) lines.splice(0, lines.length - 30_000);
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

// ---- what one conversation shows ----
const cardsSince = (since) => fake.cards().filter((c) => c.createdAt >= since);
const messagesSince = (conv, since) => fake.webhookMessages.filter((m) => m.conversationId === conv && m.at >= since);
const lastActivity = (conv, since) => Math.max(0, ...cardsSince(since).flatMap((c) => c.history.map((h) => h.at)), ...messagesSince(conv, since).map((m) => m.at));
const view = (conv, since) => ({
  cards: cardsSince(since).map((c) => {
    const distinct = [];
    for (const h of c.history) if (distinct.at(-1) !== h.content) distinct.push(h.content);
    return {
      status: c.status, updates: c.history.length, final: c.content.slice(0, 1500),
      states: (distinct.length <= 10 ? distinct : [...distinct.slice(0, 5), `… ${distinct.length - 10} more …`, ...distinct.slice(-5)]).map((t) => String(t).slice(0, 700)),
    };
  }),
  messages: messagesSince(conv, since).map((m) => ({ msgtype: m.msgtype, text: String(m.text ?? "").slice(0, 1200) })),
});
const allText = (conv, since) => [...cardsSince(since).flatMap((c) => c.history.map((h) => h.content)), ...messagesSince(conv, since).map((m) => m.text)].join("\n\n");
const settle = async (conv, since, done, { quietMs = 6000, timeoutMs = 300_000, label = "reply" } = {}) =>
  waitFor(() => done(allText(conv, since)) && Date.now() - lastActivity(conv, since) > quietMs, timeoutMs, label);
// A question card from a template (real buttons) also counts as shown.
const questionCardSince = (since) => fake.cards().some((c) => c.createdAt >= since && c.templateId && !/02fcf2f4/u.test(c.templateId));
const finishedCards = (since) => cardsSince(since).filter((c) => /^(3|FINISHED)$/u.test(String(c.status ?? "")));

let user = 0;
const nextUser = () => `cand${String(++user).padStart(3, "0")}`;
const SCENARIOS = {
  progress: async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: [
      "这是一次自动化测试，请严格照做。",
      "1) 调用 progress_card 工具，建立一个 3 步计划：「查资料」「写草稿」「检查」，第 1 步进行中。",
      "2) 用 exec 运行 `sleep 4 && echo STEP1`。",
      "3) 再调用 progress_card：第 1 步完成，第 2 步进行中。",
      "4) 用 exec 运行 `sleep 4 && echo STEP2`。",
      "5) 再调用 progress_card：3 步全部完成。",
      "6) 最后只回复 PROGRESS_DONE。",
    ].join("\n") });
    await settle(conversationId, since, (t) => /PROGRESS_DONE/u.test(t) && finishedCards(since).length > 0, { label: "progress reply" });
    const states = cardsSince(since).flatMap((c) => c.history.map((h) => h.content));
    return {
      ...view(conversationId, since),
      sawWorkWhileRunning: states.some((s) => /⚙️|▶️|◻️/u.test(s) && !/PROGRESS_DONE/u.test(s)),
      sawChecklist: states.some((s) => /写草稿/u.test(s)),
      sawCheckedStep: states.some((s) => /(☑️|✅)[^\n]*查资料/u.test(s)),
      finalIsAnswerOnly: finishedCards(since).every((c) => !/◻️|▶️|⚙️|🛠️/u.test(c.content)),
    };
  },
  "ask-single": async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个单选题：「午饭吃什么？」选项为 面条、米饭、饺子。拿到答案后只回复「午饭定了：<答案>」。" });
    const asked = await waitFor(() => questionCardSince(since) || (/饺子/u.test(allText(conversationId, since).replace(/这是自动化测试[\s\S]*?答案>」。/u, "")) && allText(conversationId, since)), 240_000, "question shown").catch(() => null);
    await sleep(2000);
    fake.sendUserText({ userId: u, text: "3", conversationId });
    await settle(conversationId, since, (t) => /午饭定了/u.test(t), { label: "ask-single answer", timeoutMs: 240_000 }).catch(() => null);
    return { questionShown: Boolean(asked), ...view(conversationId, since), continued: /午饭定了[：:]\s*饺子/u.test(allText(conversationId, since)) };
  },
  "ask-multi": async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个多选题（允许多选）：「周末想做什么？」选项为 爬山、看电影、读书、做饭。拿到答案后只回复「周末安排：<答案>」。" });
    const asked = await waitFor(() => questionCardSince(since) || (/看电影/u.test(allText(conversationId, since)) && allText(conversationId, since)), 240_000, "multi question shown").catch(() => null);
    await sleep(2000);
    fake.sendUserText({ userId: u, text: "1、3", conversationId });
    await settle(conversationId, since, (t) => /周末安排/u.test(t), { label: "ask-multi answer", timeoutMs: 240_000 }).catch(() => null);
    const t = allText(conversationId, since);
    return { questionShown: Boolean(asked), ...view(conversationId, since), continued: /周末安排[^\n]*爬山[^\n]*读书|周末安排[^\n]*读书[^\n]*爬山/u.test(t) };
  },
  // C2: a message sent while V is replying steers the running turn.
  steer: async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "测试 steer：用 exec 执行 sleep 40，然后只回复 STEER_A" });
    await waitFor(() => /Exec|运行命令/u.test(allText(conversationId, since)), 120_000, "steer tool start").catch(() => null);
    await sleep(5000);
    fake.sendUserText({ userId: u, text: "改成只回复 STEER_B", conversationId });
    await settle(conversationId, since, (t) => /STEER_B/u.test(t), { label: "steer reply", timeoutMs: 240_000, quietMs: 15_000 }).catch(() => null);
    const finals = [...cardsSince(since).map((c) => c.content ?? ""), ...messagesSince(conversationId, since).map((m) => m.text ?? "")];
    return { finals: finals.map((t) => t.slice(0, 200)), steered: finals.some((t) => /STEER_B/u.test(t)), answeredA: finals.some((t) => /STEER_A/u.test(t) && !/STEER_B/u.test(t)) };
  },
  secret: async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用）。如果没法索取，就只回复 SECRET_UNAVAILABLE。" });
    await settle(conversationId, since, (t) => /SECRET_|凭据|🔑/u.test(t) && finishedCards(since).length > 0, { label: "secret", quietMs: 10_000, timeoutMs: 240_000 }).catch(() => null);
    return view(conversationId, since);
  },
  // Real buttons: question card from the template, answered by tapping it.
  "ask-card": async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个单选题：「去哪个城市？」选项为 杭州、苏州、南京。拿到答案后只回复「城市：<答案>」。" });
    const card = await waitFor(() => fake.cards().find((c) => c.createdAt >= since && c.templateId && !/02fcf2f4/u.test(c.templateId)), 240_000, "question card").catch(() => null);
    if (!card) return { questionCard: false, ...view(conversationId, since) };
    const ack = await fake.pressCard({ outTrackId: card.outTrackId, userId: u, params: { name: "q0", type: "CHECKBOX_LIST", value: 1 } });
    await settle(conversationId, since, (t) => /城市[：:]\s*苏州/u.test(t), { label: "ask-card answer", timeoutMs: 240_000 }).catch(() => null);
    const reply = ack?.data ?? ack?.response ?? ack;
    const replyText = JSON.stringify(reply ?? {});
    return { questionCard: true, templateId: card.templateId, ack: replyText.slice(0, 400), cardAnswered: /已选择：苏州/u.test(replyText), continued: /城市[：:]\s*苏州/u.test(allText(conversationId, since)), ...view(conversationId, since) };
  },
  background: async () => {
    const u = nextUser(); const since = Date.now();
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试，请严格照做，不要等待任何结果。第一步：调用 sessions_spawn 启动一个子 agent，task 写：`用 exec 运行 sleep 40，然后回复 CHILD_DONE。` 第二步：工具返回后，立刻只回复 BG_OK。" });
    await settle(conversationId, since, (t) => /BG_OK/u.test(t) && finishedCards(since).length > 0, { label: "background reply", quietMs: 4000 });
    const atAnswer = view(conversationId, since);
    await sleep(75_000);
    const later = view(conversationId, since);
    const states = cardsSince(since).flatMap((c) => c.history.map((h) => h.content));
    return { atAnswer, after75s: later, sawBackgroundLine: states.some((s) => /后台 \d+ 项进行中/u.test(s)), sawBackgroundDone: states.some((s) => /后台任务已结束/u.test(s)) };
  },
};

try {
  await waitFor(() => fake.connected(), 600_000, "DingTalk Stream connection");
  await sleep(3000);
  for (const name of SCENARIO_NAMES) {
    const started = Date.now();
    try { report.scenarios[name] = { ...(await SCENARIOS[name]()), secs: Math.round((Date.now() - started) / 1000) }; }
    catch (error) { report.scenarios[name] = { error: redact(String(error?.message ?? error)).slice(0, 1500), secs: Math.round((Date.now() - started) / 1000) }; }
  }
  report.unknownCalls = [...new Set(fake.calls.filter((c) => c.method !== "WS").map((c) => `${c.method} ${c.path}`))];
  report.experienceLog = lines.filter((l) => /v-experience/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-40);
  report.dingErrors = lines.filter((l) => /DingTalk|dingtalk/u.test(l.line) && /error|failed|❌/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-25);
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

fs.writeFileSync(path.join(scratch, "dingtalk-experience-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

if (EXPECT === "patched") {
  const s = report.scenarios;
  if (s.progress) {
    assert.equal(s.progress.error, undefined, s.progress.error);
    assert(s.progress.sawWorkWhileRunning, "no work lines while the turn ran");
    assert(s.progress.sawChecklist && s.progress.sawCheckedStep, "progress_card checklist missing");
    assert(s.progress.finalIsAnswerOnly, "finished card still shows working state");
  }
  for (const name of ["ask-single", "ask-multi"]) if (s[name]) {
    assert(s[name].questionShown, `${name}: question never reached the chat`);
    assert(s[name].continued, `${name}: chat answer did not reach the agent`);
  }
  if (s.steer) assert(s.steer.steered && !s.steer.answeredA, "steer: second message did not steer the running reply");
  if (s.background) assert(s.background.sawBackgroundLine && s.background.sawBackgroundDone, "background line missing");
  if (s["ask-card"]) {
    assert(s["ask-card"].questionCard, "no question card was delivered");
    assert(s["ask-card"].cardAnswered, "tapping the card did not answer it");
    assert(s["ask-card"].continued, "the agent did not continue after the tap");
  }
}
