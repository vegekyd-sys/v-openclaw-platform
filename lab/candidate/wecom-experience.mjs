// Candidate: what a WeCom conversation with V actually shows.
//
// The production WeCom plugin (copied from V, code only) runs in a private
// Gateway whose `channels.wecom.websocketUrl` points at a loopback fake of the
// smart-robot socket (lab/candidate/wecom-fake-aibot.mjs). Scenarios push user
// messages and record every streamed reply frame and proactive message.
// Turns are real model turns on the VLab Worker.
//
// WC_EXPECT=baseline only reports; WC_EXPECT=patched applies
// apps/v-experience/wecom/patch.mjs to the private copy and asserts.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeWeComAibot } from "./wecom-fake-aibot.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const EXPECT = process.env.WC_EXPECT ?? "baseline";
const MODEL = process.env.WC_MODEL ?? "deepseek/deepseek-v4-flash";
const SCENARIO_NAMES = (process.env.WC_SCENARIOS ?? "progress,ask-single,ask-multi,secret,background").split(",").map((s) => s.trim()).filter(Boolean);
const TARBALL_NAME = "wecom-openclaw-plugin-2026.8.17-vlab.2-v.tgz";
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

const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

const pluginDir = path.join(scratch, "wecom-openclaw-plugin");
fs.mkdirSync(pluginDir, { recursive: true });
const tarball = findInput(TARBALL_NAME);
assert(tarball, `${TARBALL_NAME} support input is missing`);
assert.equal(spawnSync("tar", ["xzf", path.resolve(tarball), "-C", pluginDir]).status, 0, "extract WeCom plugin");
const { WebSocketServer } = createRequire(path.join(pluginDir, "node_modules", "noop.js"))("ws");
const fake = createFakeWeComAibot({ WebSocketServer });
const wsPort = await fake.listen();

const report = { expect: EXPECT, model: MODEL, scenarios: {} };
if (EXPECT === "patched") {
  const { patchWeComPlugin } = await import(pathToFileURL(path.resolve("apps/v-experience/wecom/patch.mjs")).href);
  report.patch = patchWeComPlugin(path.join(pluginDir, "dist", "src"), { experienceSource: path.resolve("apps/v-experience/v-experience.mjs") });
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {
  wecom: {
    enabled: true, connectionMode: "websocket", botId: "candidate-bot", secret: "candidate-fake-secret",
    websocketUrl: `ws://127.0.0.1:${wsPort}`, dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"],
  },
};
config.plugins.load = { ...(config.plugins.load ?? {}), paths: [...(config.plugins.load?.paths ?? []).filter((p) => !/wecom/u.test(p)), pluginDir] };
config.plugins.entries = { ...(config.plugins.entries ?? {}), "wecom-openclaw-plugin": { enabled: true } };
if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("wecom-openclaw-plugin")) config.plugins.allow.push("wecom-openclaw-plugin");
// Same routing as V: the channel belongs to the makaron agent.
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "wecom"), { agentId: "makaron", match: { channel: "wecom" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin && process.env.WC_WORKER !== "off") {
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

const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "wecom-openclaw-plugin"')));
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
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}`);
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const streamsSince = (chatId, since) => fake.streams().filter((s) => s.chatId === chatId && s.createdAt >= since);
const proactiveSince = (chatId, since) => fake.proactive.filter((m) => m.chatId === chatId && m.at >= since);
const allText = (chatId, since) => [...streamsSince(chatId, since).flatMap((s) => s.history.map((h) => h.content)), ...proactiveSince(chatId, since).map((m) => m.text)].join("\n\n");
const lastActivity = (chatId, since) => Math.max(0, ...streamsSince(chatId, since).flatMap((s) => s.history.map((h) => h.at)), ...proactiveSince(chatId, since).map((m) => m.at));
const finished = (chatId, since) => streamsSince(chatId, since).filter((s) => s.finished);
const view = (chatId, since) => ({
  streams: streamsSince(chatId, since).map((s) => {
    const distinct = [];
    for (const h of s.history) if (distinct.at(-1) !== h.content) distinct.push(h.content);
    return { finished: s.finished, frames: s.history.length, final: s.content.slice(0, 1500),
      states: (distinct.length <= 10 ? distinct : [...distinct.slice(0, 5), `… ${distinct.length - 10} more …`, ...distinct.slice(-5)]).map((t) => String(t).slice(0, 700)) };
  }),
  proactive: proactiveSince(chatId, since).map((m) => ({ msgtype: m.msgtype, text: String(m.text ?? "").slice(0, 1200) })),
});
const settle = async (chatId, since, done, { quietMs = 6000, timeoutMs = 300_000, label = "reply" } = {}) =>
  waitFor(() => done(allText(chatId, since)) && Date.now() - lastActivity(chatId, since) > quietMs, timeoutMs, label);

let user = 0;
const nextUser = () => `cand${String(++user).padStart(3, "0")}`;
const SCENARIOS = {
  progress: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: [
      "这是一次自动化测试，请严格照做。",
      "1) 调用 progress_card 工具，建立一个 3 步计划：「查资料」「写草稿」「检查」，第 1 步进行中。",
      "2) 用 exec 运行 `sleep 4 && echo STEP1`。",
      "3) 再调用 progress_card：第 1 步完成，第 2 步进行中。",
      "4) 用 exec 运行 `sleep 4 && echo STEP2`。",
      "5) 再调用 progress_card：3 步全部完成。",
      "6) 最后只回复 PROGRESS_DONE。",
    ].join("\n") });
    await settle(chatId, since, (t) => /PROGRESS_DONE/u.test(t) && finished(chatId, since).length > 0, { label: "progress reply" });
    const states = streamsSince(chatId, since).flatMap((s) => s.history.map((h) => h.content));
    return {
      ...view(chatId, since),
      framesBeforeFinish: streamsSince(chatId, since).reduce((n, s) => n + s.history.filter((h) => !h.finish).length, 0),
      sawWorkWhileRunning: states.some((s) => /⚙️|▶️|◻️/u.test(s) && !/PROGRESS_DONE/u.test(s)),
      sawChecklist: states.some((s) => /写草稿/u.test(s)),
      sawCheckedStep: states.some((s) => /(☑️|✅)[^\n]*查资料/u.test(s)),
      finalIsAnswerOnly: finished(chatId, since).every((s) => !/◻️|▶️|⚙️|🛠️|progress_card/u.test(s.content)),
    };
  },
  "ask-single": async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个单选题：「午饭吃什么？」选项为 面条、米饭、饺子。拿到答案后只回复「午饭定了：<答案>」。" });
    const asked = await waitFor(() => /饺子/u.test(allText(chatId, since)) && allText(chatId, since), 240_000, "question shown").catch(() => null);
    await sleep(2000);
    const answerAt = Date.now();
    fake.sendUserText({ userId: u, text: "3" });
    await settle(chatId, since, (t) => /午饭定了/u.test(t), { label: "ask-single answer", timeoutMs: 240_000 }).catch(() => null);
    const t = allText(chatId, since);
    const continuedAt = Math.min(...streamsSince(chatId, since).flatMap((s) => s.history.filter((h) => /午饭定了/u.test(h.content)).map((h) => h.at)), ...proactiveSince(chatId, since).filter((m) => /午饭定了/u.test(m.text)).map((m) => m.at));
    return { questionShown: Boolean(asked), ...view(chatId, since), continued: /午饭定了[：:]\s*饺子/u.test(t), continuedAfterSecs: Number.isFinite(continuedAt) ? Math.round((continuedAt - answerAt) / 1000) : null };
  },
  "ask-multi": async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个多选题（允许多选）：「周末想做什么？」选项为 爬山、看电影、读书、做饭。拿到答案后只回复「周末安排：<答案>」。" });
    const asked = await waitFor(() => /看电影/u.test(allText(chatId, since)) && allText(chatId, since), 240_000, "multi question shown").catch(() => null);
    await sleep(2000);
    fake.sendUserText({ userId: u, text: "1、3" });
    await settle(chatId, since, (t) => /周末安排/u.test(t), { label: "ask-multi answer", timeoutMs: 240_000 }).catch(() => null);
    const t = allText(chatId, since);
    return { questionShown: Boolean(asked), ...view(chatId, since), continued: /周末安排[^\n]*爬山[^\n]*读书|周末安排[^\n]*读书[^\n]*爬山/u.test(t) };
  },
  secret: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用）。如果没法索取，就只回复 SECRET_UNAVAILABLE。" });
    await settle(chatId, since, (t) => /SECRET_|凭据|🔑/u.test(t) && finished(chatId, since).length > 0, { label: "secret", quietMs: 10_000, timeoutMs: 240_000 }).catch(() => null);
    return view(chatId, since);
  },
  background: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试，请严格照做，不要等待任何结果。第一步：调用 sessions_spawn 启动一个子 agent，task 写：`用 exec 运行 sleep 40，然后回复 CHILD_DONE。` 第二步：工具返回后，立刻只回复 BG_OK。" });
    await settle(chatId, since, (t) => /BG_OK/u.test(t) && finished(chatId, since).length > 0, { label: "background reply", quietMs: 4000 });
    const atAnswer = view(chatId, since);
    await sleep(75_000);
    const t = allText(chatId, since);
    return { atAnswer, after75s: view(chatId, since), sawBackgroundLine: /后台 \d+ 项进行中/u.test(t), sawBackgroundDone: /后台任务已结束/u.test(t) };
  },
};

try {
  await waitFor(() => fake.authenticated(), 600_000, "WeCom socket authentication");
  await sleep(3000);
  for (const name of SCENARIO_NAMES) {
    const started = Date.now();
    try { report.scenarios[name] = { ...(await SCENARIOS[name]()), secs: Math.round((Date.now() - started) / 1000) }; }
    catch (error) { report.scenarios[name] = { error: redact(String(error?.message ?? error)).slice(0, 1500), secs: Math.round((Date.now() - started) / 1000) }; }
  }
  report.frameCommands = [...new Set(fake.frames.map((f) => f.cmd))];
  report.experienceLog = lines.filter((l) => /v-experience/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-40);
  report.wecomErrors = lines.filter((l) => /wecom/iu.test(l.line) && /error|failed|threw/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-25);
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

fs.writeFileSync(path.join(scratch, "wecom-experience-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

if (EXPECT === "patched") {
  const s = report.scenarios;
  if (s.progress) {
    assert.equal(s.progress.error, undefined, s.progress.error);
    assert(s.progress.sawWorkWhileRunning, "no work lines while the turn ran");
    assert(s.progress.sawChecklist && s.progress.sawCheckedStep, "progress_card checklist missing");
    assert(s.progress.finalIsAnswerOnly, "finished reply still shows working state");
  }
  for (const name of ["ask-single", "ask-multi"]) if (s[name]) {
    assert(s[name].questionShown, `${name}: question never reached the chat`);
    assert(s[name].continued, `${name}: chat answer did not reach the agent`);
  }
  if (s.background) assert(s.background.sawBackgroundLine && s.background.sawBackgroundDone, "background line missing");
}
