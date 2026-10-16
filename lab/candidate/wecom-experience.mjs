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
// The model-roles scenario also patches the core command-auth and sets the
// command roles (lab/candidate/model-roles.mjs).
// `tool-only` (a group) has the agent send its answer and a file with the
// message tool and end with an empty final; it records how the reply closes.
// `secret-link` and `handoff-card` run the services behind V's link cards
// (lab/candidate/channel-cards-support.mjs) and check the text_notice template
// card the robot sends; `handoff-card` checks the Worker config the Gateway derives
// carries the handoff plugin (the tool runs there).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeWeComAibot } from "./wecom-fake-aibot.mjs";
import { assertModelRoles, configureRoles, patchCoreCommandAuth, ROLES_CONFIGURED, runModelRoles } from "./model-roles.mjs";
import { linkToken, startHandoff, startSecretEntry, widenCoreSecretEntry } from "./channel-cards-support.mjs";

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
const ROLE_USERS = { owner: "candowner", nonOwner: "candguest" };
if (SCENARIO_NAMES.includes("model-roles")) {
  report.coreCommandAuth = patchCoreCommandAuth(runtime);
  report.roles = configureRoles(config, "wecom", [ROLE_USERS.owner]);
}
if (SCENARIO_NAMES.includes("secret-link")) report.secretEntryCorePatch = await widenCoreSecretEntry(dist);
// WC_HANDOFF_PUBLIC_BASE=loopback: the service's links name 127.0.0.1 (like VLab's tailnet
// address, not reachable by WeCom), so the card picture is uploaded over the socket instead.
const HANDOFF_PUBLIC_BASE = process.env.WC_HANDOFF_PUBLIC_BASE === "loopback" ? "http://127.0.0.1:9" : "https://openclaw.example.test";
const handoff = SCENARIO_NAMES.some((n) => n.startsWith("handoff-")) ? await startHandoff({ dir: path.join(scratch, "desktop-handoff"), config, runtime, dist, publicBaseUrl: HANDOFF_PUBLIC_BASE }) : undefined;
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
const secretEntry = SCENARIO_NAMES.includes("secret-link")
  ? await startSecretEntry({ dir: path.join(scratch, "secret-entry"), dist, env, configPath, stateDir, publicBaseUrl: "https://openclaw.example.test" })
  : undefined;
if (secretEntry) Object.assign(env, secretEntry.gatewayEnv);
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

// The 「电脑」 card: wait for it, open its link, tap 完成 or 跳过 (a template_card_event).
const HANDOFF_ASK = "这是自动化测试，请严格照做。立即调用 desktop_handoff_request 工具，参数 reason 填「需要你登录测试站点」。工具返回后按它返回的 instruction 只回复一句话，然后结束，不要做别的事。收到 /v-handback 或 /v-skip 之后，只回复一句「收到，继续」。";
const handoffScenario = async (command) => {
  const u = nextUser(); const since = Date.now();
  const chatId = u;
  // The model sometimes answers without calling the tool: ask once more in that case.
  const replies = [];
  let card;
  for (let attempt = 0; attempt < 2 && !card; attempt += 1) {
    const at = Date.now();
    fake.sendUserText({ userId: u, text: HANDOFF_ASK });
    const found = await waitFor(() => proactiveSince(chatId, at).find((m) => m.templateCard?.card_type === "button_interaction")
      ?? (finished(chatId, at).length > 0 && Date.now() - lastActivity(chatId, at) > 20_000 ? "no-card" : null), 300_000, "handoff button card");
    if (found === "no-card") replies.push(allText(chatId, at).slice(-300));
    else card = found;
  }
  if (!card) throw new Error(`no handoff card; replies: ${JSON.stringify(replies)}`);
  await settle(chatId, since, () => finished(chatId, since).length > 0, { label: "handoff reply", quietMs: 6000, timeoutMs: 240_000 }).catch(() => null);
  const sent = proactiveSince(chatId, since).filter((m) => m.at <= card.at + 1 && (m.templateCard || m.msgtype === "image")).map((m) => ({ msgtype: m.msgtype, cardType: m.templateCard?.card_type, mediaId: m.mediaId }));
  const news = proactiveSince(chatId, since).find((m) => m.templateCard?.card_type === "news_notice");
  const link = linkToken(card.templateCard.button_list.find((b) => b.type === 1)?.url, "/desktop-handoff");
  const id = handoff.issued().at(-1)?.id;
  const claimStatus = link ? await handoff.claim(link.token) : null;
  const before = await handoff.status(id);
  const key = card.templateCard.button_list.find((b) => b.key?.startsWith(`vcmd:${command}:`))?.key;
  const pressedAt = Date.now();
  const tap = key ? fake.pressCard({ userId: u, taskId: card.templateCard.task_id, eventKey: key }) : null;
  const update = tap ? await waitFor(() => fake.cardUpdates.find((c) => c.reqId === tap.reqId), 15_000, "card update").catch(() => null) : null;
  let status = null;
  const expected = command === "v-handback" ? "done" : "skipped";
  for (const until = Date.now() + 60_000; Date.now() < until;) {
    status = await handoff.status(id);
    if (status?.card?.state === expected) break;
    await sleep(500);
  }
  await settle(chatId, pressedAt, (t) => /收到|继续/u.test(t), { label: "after the tap", quietMs: 8000, timeoutMs: 240_000 }).catch(() => null);
  const redactLink = (value) => (link ? JSON.parse(JSON.stringify(value ?? null).replaceAll(link.token, "[token]")) : value);
  return {
    retriedAsk: replies,
    sent,
    news: redactLink(news?.templateCard ?? null),
    picture: news ? await handoff.picture(news.templateCard.card_image.url) : null,
    media: fake.media.filter((m) => m.at >= since).map((m) => ({ type: m.type, totalSize: m.totalSize, received: m.received, filename: m.filename })),
    cover: handoff.cover,
    card: redactLink(card.templateCard),
    handoffId: id,
    claimStatus,
    before: { cardState: before?.card?.state, cardChannel: before?.card?.channel, ended: before?.ended },
    tapped: key,
    update: update ? { afterMs: update.at - pressedAt, inTime: update.inTime, userids: update.userids, card: redactLink(update.templateCard) } : null,
    after: { cardState: status?.card?.state, ended: status?.ended, endReason: status?.endReason },
    afterTap: [...streamsSince(chatId, pressedAt).map((s) => s.content), ...proactiveSince(chatId, pressedAt).map((m) => m.text)].map((t) => String(t).slice(0, 300)),
    urlInReply: [...streamsSince(chatId, since).map((s) => s.content)].some((t) => /desktop-handoff/u.test(t)),
    handoffLog: lines.filter((l) => /desktop.handoff|v-desktop-handoff|v-experience\] card/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-12),
  };
};
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
    return { questionShown: Boolean(asked), questionInFinished: finished(chatId, since).some((m) => /饺子/u.test(m.content)), ...view(chatId, since), continued: /午饭定了[：:]\s*饺子/u.test(t), continuedAfterSecs: Number.isFinite(continuedAt) ? Math.round((continuedAt - answerAt) / 1000) : null };
  },
  "ask-multi": async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请调用 ask_user 工具问我一个多选题（允许多选）：「周末想做什么？」选项为 爬山、看电影、读书、做饭。拿到答案后只回复「周末安排：<答案>」。" });
    const asked = await waitFor(() => /看电影/u.test(allText(chatId, since)) && allText(chatId, since), 240_000, "multi question shown").catch(() => null);
    await sleep(2000);
    fake.sendUserText({ userId: u, text: "1、3" });
    await settle(chatId, since, (t) => /周末安排/u.test(t), { label: "ask-multi answer", timeoutMs: 240_000 }).catch(() => null);
    const t = allText(chatId, since);
    return { questionShown: Boolean(asked), questionInFinished: finished(chatId, since).some((m) => /看电影/u.test(m.content)), ...view(chatId, since), continued: /周末安排[^\n]*爬山[^\n]*读书|周末安排[^\n]*读书[^\n]*爬山/u.test(t) };
  },
  // The live acceptance message from 2026-10-04 (plan + exec + ask_user), sent by a non-owner and answered by number.
  "ask-combo": async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "验收测试：1) 用 progress_card 建 2 步计划「了解偏好」「给建议」，第 1 步进行中；2) 先用一句话说你要做什么，再用 exec 运行 sleep 5；3) 调用 ask_user 问我一个单选题「去哪个城市？」选项 杭州、苏州、南京；4) 拿到答案后 progress_card 全部完成，再用两句话推荐一个景点。" });
    const asked = await waitFor(() => /南京/u.test(allText(chatId, since)) && allText(chatId, since), 240_000, "combo question shown").catch(() => null);
    await sleep(2000);
    fake.sendUserText({ userId: u, text: "2" });
    await settle(chatId, since, (t) => /已选择[：:]\s*苏州/u.test(t) && /苏州/u.test(t.split(/已选择[：:]\s*苏州/u).pop() ?? ""), { label: "ask-combo answer", timeoutMs: 240_000 }).catch(() => null);
    const t = allText(chatId, since);
    return { questionShown: Boolean(asked), questionInFinished: finished(chatId, since).some((m) => /南京/u.test(m.content)), agentError: /couldn't generate a response|request failed/iu.test(t), continued: /已选择[：:]\s*苏州/u.test(t), ...view(chatId, since) };
  },
  // C2: a message sent while V is replying steers the running turn.
  steer: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "测试 steer：用 exec 执行 sleep 40，然后只回复 STEER_A" });
    await waitFor(() => /Exec|运行命令/u.test(allText(chatId, since)), 120_000, "steer tool start").catch(() => null);
    await sleep(5000);
    fake.sendUserText({ userId: u, text: "改成只回复 STEER_B" });
    await settle(chatId, since, (t) => /STEER_B/u.test(t), { label: "steer reply", timeoutMs: 240_000, quietMs: 15_000 }).catch(() => null);
    const finals = [...finished(chatId, since).map((m) => m.content), ...proactiveSince(chatId, since).map((m) => m.text)];
    return { finals: finals.map((t) => t.slice(0, 200)), steered: finals.some((t) => /STEER_B/u.test(t)), answeredA: finals.some((t) => /STEER_A/u.test(t) && !/STEER_B/u.test(t)) };
  },
  secret: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用）。如果没法索取，就只回复 SECRET_UNAVAILABLE。" });
    await settle(chatId, since, (t) => /SECRET_|凭据|🔑/u.test(t) && finished(chatId, since).length > 0, { label: "secret", quietMs: 10_000, timeoutMs: 240_000 }).catch(() => null);
    return view(chatId, since);
  },
  // A3: the credential link as a text_notice card with one 填写凭据 link; the value is typed on the page.
  "secret-link": async () => {
    const u = nextUser(); const since = Date.now();
    const value = `vsl-${crypto.randomBytes(12).toString("hex")}`;
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用，可以随便填）。拿到后只回复 SECRET_SAVED；如果没法索取，就回复 SECRET_UNAVAILABLE 并说明原因。" });
    const cardMsg = await waitFor(() => proactiveSince(chatId, since).find((m) => linkToken(m.templateCard?.card_action?.url, "/secret-entry")), 300_000, "credential card");
    const card = cardMsg.templateCard;
    const link = linkToken(card.card_action.url, "/secret-entry");
    const { reuse, ...page } = await secretEntry.use(link.token, value);
    await settle(chatId, since, (t) => /SECRET_(SAVED|UNAVAILABLE)/u.test(t), { label: "secret-link reply", quietMs: 8000, timeoutMs: 240_000 }).catch(() => null);
    const t = allText(chatId, since);
    const chat = JSON.stringify([fake.streams(), fake.proactive]);
    return {
      card: JSON.parse(JSON.stringify(card).replaceAll(link.token, "[token]")),
      page, reuse: await reuse(), saved: /SECRET_SAVED/u.test(t), cancelled: /不能安全地输入凭据/u.test(t),
      linkInText: proactiveSince(chatId, since).some((m) => m.msgtype !== "template_card" && /secret-entry/u.test(m.text ?? "")),
      leaks: { gatewayLog: lines.filter((l) => l.line.includes(value)).length, serviceLog: secretEntry.lines.filter((l) => l.includes(value)).length, chat: chat.includes(value), audit: JSON.stringify(secretEntry.audit()).includes(value) },
      ...JSON.parse(JSON.stringify(view(chatId, since)).replaceAll(link.token, "[token]")),
    };
  },
  // A4: V's 「电脑」 card: the desktop picture (news_notice with the service's public snapshot url, or
  // an uploaded image when the service has no public address) + a button_interaction card with
  // 接管 (link) / 完成 / 跳过 (card events). 完成 is tapped; the card must change within 5 s.
  "handoff-card": () => handoffScenario("v-handback"),
  // The same card, 跳过 tapped: the handoff ends.
  "handoff-skip": () => handoffScenario("v-skip"),
  // Diagnostics only: what the Worker config carries for the tool.
  "handoff-worker": async () => {
    return {
      issued: handoff.issued(),
      // The tool runs in a Worker: its config must carry this plugin and the fake channel.
      workerConfig: (() => {
        try {
          const w = JSON.parse(fs.readFileSync(workerPlugin.workerConfigPath, "utf8"));
          return { handoffPlugin: String(w.plugins?.entries?.["v-desktop-handoff"]?.config?.adminUrl ?? "").endsWith(`:${handoff.ports.adminPort}`), channels: Object.keys(w.channels ?? {}), loadPaths: (w.plugins?.load?.paths ?? []).filter((p) => /handoff|dingtalk|wecom/u.test(p)) };
        } catch (error) { return { error: String(error?.message ?? error) }; }
      })(),
      handoffLog: lines.filter((l) => /desktop.handoff|v-desktop-handoff|message\.action/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-10),
    };
  },
  // C1: the owner keeps every command; a non-owner may only switch their own session's model.
  "model-roles": () => runModelRoles({
    dist, port, token: config.gateway?.auth?.token, config,
    transport: {
      ...ROLE_USERS,
      send: (user, text) => fake.sendUserText({ userId: user, text }),
      text: (user, since) => allText(user, since),
      connections: () => fake.frames.filter((f) => f.cmd === "aibot_subscribe").length,
    },
  }),
  background: async () => {
    const u = nextUser(); const since = Date.now();
    const { chatId } = fake.sendUserText({ userId: u, text: "这是自动化测试，请严格照做，不要等待任何结果。第一步：调用 sessions_spawn 启动一个子 agent，task 写：`用 exec 运行 sleep 40，然后回复 CHILD_DONE。` 第二步：工具返回后，立刻只回复 BG_OK。" });
    await settle(chatId, since, (t) => /BG_OK/u.test(t) && finished(chatId, since).length > 0, { label: "background reply", quietMs: 4000 });
    const atAnswer = view(chatId, since);
    await sleep(75_000);
    const t = allText(chatId, since);
    return { atAnswer, after75s: view(chatId, since), sawBackgroundLine: /后台 \d+ 项进行中/u.test(t), sawBackgroundDone: /后台任务已结束/u.test(t) };
  },
  // The DingTalk case of 2026-10-15 on WeCom: the answer and a file go out with the
  // message tool and the final is empty. The reply used to close with 「✅ 已收到」.
  "tool-only": async () => {
    const u = nextUser();
    const ask = [
      "这是自动化测试，请严格照做，不要解释。",
      "1) 用 exec 运行：printf 'name,score\\nA,1\\n' > tool-only-table.csv",
      "2) 调用 message 工具（action=send）把这句话发到当前群：「TOOL_ONLY_TEXT 对比表做好了」，并把 tool-only-table.csv 作为附件一起发出（media 填这个文件路径）。",
      "3) message 工具返回后，你的最终回复只输出 NO_REPLY，不要再输出其他任何文字。",
    ].join("\n");
    const attempts = [];
    let since; let chatId;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      since = Date.now();
      ({ chatId } = fake.sendUserText({ userId: u, text: ask, group: true }));
      await settle(chatId, since, (t) => /TOOL_ONLY_TEXT/u.test(t), { label: "tool-only turn", quietMs: 15_000, timeoutMs: 300_000 }).catch(() => null);
      const sentText = proactiveSince(chatId, since).some((m) => /TOOL_ONLY_TEXT/u.test(m.text ?? ""));
      attempts.push({ sentText, proactive: proactiveSince(chatId, since).length });
      if (sentText) break;
    }
    const others = proactiveSince(chatId, since).filter((m) => !/TOOL_ONLY_TEXT/u.test(m.text ?? "") && m.msgtype !== "file");
    const streamFinals = finished(chatId, since).map((x) => x.content ?? "");
    return {
      attempts,
      ...view(chatId, since),
      toolTextSent: proactiveSince(chatId, since).some((m) => /TOOL_ONLY_TEXT/u.test(m.text ?? "")),
      fileSent: fake.media.some((m) => m.at >= since) || proactiveSince(chatId, since).some((m) => m.msgtype === "file"),
      streamFinals,
      otherMessages: others.map((m) => ({ msgtype: m.msgtype, text: String(m.text ?? "").slice(0, 200) })),
      saidReceived: /✅ 已收到/u.test(allText(chatId, since)),
      saysSent: streamFinals.some((t) => /✅ 已发送/u.test(t)),
    };
  },
};

try {
  await waitFor(() => fake.authenticated(), 600_000, "WeCom socket authentication");
  await sleep(3000);
  for (const name of SCENARIO_NAMES) {
    const started = Date.now();
    try { report.scenarios[name] = { ...(await SCENARIOS[name.split("#")[0]]()), secs: Math.round((Date.now() - started) / 1000) }; }
    catch (error) { report.scenarios[name] = { error: redact(String(error?.message ?? error)).slice(0, 1500), secs: Math.round((Date.now() - started) / 1000) }; }
  }
  report.frameCommands = [...new Set(fake.frames.map((f) => f.cmd))];
  report.experienceLog = lines.filter((l) => /v-experience/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-40);
  report.queueLog = lines.filter((l) => /steer|followup|queued|deferred|active-run|activeRun/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-60);
  report.wecomErrors = lines.filter((l) => /wecom/iu.test(l.line) && /error|failed|threw/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-25);
  if (handoff) report.agentErrors = lines.filter((l) => /error|failed|denied|exception/iu.test(l.line) && !/onStatusChange/u.test(l.line)).map((l) => redact(l.line).slice(0, 500)).slice(-30);
} catch (error) {
  report.fatal = redact(String(error?.message ?? error)).slice(0, 3000);
  report.gatewayTail = lines.slice(-120).map((l) => redact(l.line).slice(0, 400));
  process.exitCode = 1;
} finally {
  gateway.kill("SIGTERM");
  secretEntry?.stop();
  await handoff?.close();
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
    // The WeCom desktop client shows a stream only once it is finished.
    assert(s[name].questionInFinished, `${name}: question only inside an unfinished stream`);
    assert(s[name].continued, `${name}: chat answer did not reach the agent`);
  }
  // "ask-combo#2" repeats a scenario; each run is checked on its own.
  for (const name of Object.keys(s).filter((n) => n.split("#")[0] === "ask-combo")) {
    assert(!s[name].agentError, `${name}: agent turn failed`);
    assert(s[name].questionInFinished && s[name].continued, `${name}: question or answer missing`);
  }
  if (s.steer) assert(s.steer.steered && !s.steer.answeredA, "steer: second message did not steer the running reply");
  if (s.background) assert(s.background.sawBackgroundLine && s.background.sawBackgroundDone, "background line missing");
  if (s["tool-only"]) {
    const r = s["tool-only"];
    assert.equal(r.error, undefined, r.error);
    assert(r.toolTextSent, `the agent did not send with the message tool: ${JSON.stringify(r.attempts)}`);
    assert(!r.saidReceived, `the reply closed with 「✅ 已收到」: ${JSON.stringify({ streams: r.streams, other: r.otherMessages })}`);
    assert.deepEqual(r.otherMessages, [], "an extra message went out after the tool's own");
    assert(r.streamFinals.length === 0 || r.saysSent, `the reply stream does not say the content was sent: ${JSON.stringify(r.streamFinals)}`);
  }
  if (s["secret-link"]) {
    const r = s["secret-link"];
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.card.card_type, "text_notice");
    assert.equal(r.card.main_title.title, "🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN");
    assert.match(r.card.sub_title_text, /链接只能用一次、\d+ 分钟内有效；值不会出现在聊天记录里。$/u);
    assert.deepEqual(r.card.jump_list.map((j) => [j.type, j.title, j.url]), [[1, "填写凭据", "https://openclaw.example.test/secret-entry/#[token]"]]);
    assert.deepEqual(r.card.card_action, { type: 1, url: "https://openclaw.example.test/secret-entry/#[token]" });
    assert(!r.linkInText, "the link must only be on the card");
    assert(r.page.pageHasPasswordInput && r.page.info.status === 200, "entry page");
    assert.equal(r.page.submit.status, 200, `submit failed: ${JSON.stringify(r.page.submit)}`);
    assert.equal(r.reuse, 410, "the link worked twice");
    assert(r.saved && !r.cancelled, "agent did not get the value");
    assert.deepEqual(r.leaks, { gatewayLog: 0, serviceLog: 0, chat: false, audit: false }, "value leaked");
  }
  for (const name of ["handoff-card", "handoff-skip"]) if (s[name]) {
    const r = s[name];
    assert.equal(r.error, undefined, r.error);
    const takeover = `${HANDOFF_PUBLIC_BASE}/desktop-handoff/#[token]`;
    if (HANDOFF_PUBLIC_BASE.startsWith("https://")) {
      // The picture as a news_notice whose image the handoff service serves publicly.
      assert.deepEqual(r.sent.map((m) => m.cardType ?? m.msgtype), ["news_notice", "button_interaction"]);
      assert.equal(r.news.main_title.title, "电脑");
      assert.match(r.news.card_image.url, /^https:\/\/openclaw\.example\.test\/desktop-handoff\/snapshot\/[\w-]{32}\.jpg$/u);
      assert.deepEqual(r.news.card_action, { type: 1, url: takeover });
      assert.deepEqual({ status: r.picture.status, type: r.picture.type, sameAsCover: r.picture.sameAsCover }, { status: 200, type: "image/jpeg", sameAsCover: true }, "the card picture is not served");
    } else {
      // No public address: the picture is uploaded over the robot socket and sent as an image.
      assert.deepEqual(r.sent.map((m) => m.cardType ?? m.msgtype), ["image", "button_interaction"]);
      assert.equal(r.media.length, 1);
      assert.deepEqual({ type: r.media[0].type, received: r.media[0].received }, { type: "image", received: r.cover.bytes });
    }
    assert.deepEqual(r.card.main_title, { title: "电脑", desc: "需要操作" });
    assert.match(r.card.sub_title_text, /^需要你登录测试站点\n点「接管」打开 V 的电脑直接操作，做完点「完成」，V 接着做；不需要就点「跳过」。\d+ 分钟内打开有效。$/u);
    assert.deepEqual(r.card.button_list, [
      { text: "接管", style: 1, type: 1, url: takeover },
      { text: "完成", style: 4, key: `vcmd:v-handback:${r.handoffId}` },
      { text: "跳过", style: 2, key: `vcmd:v-skip:${r.handoffId}` },
    ]);
    assert.equal(r.claimStatus, 200, "the card's link does not open the handoff");
    assert.deepEqual(r.before, { cardState: "pending", cardChannel: "wecom", ended: false });
    assert(r.update, "the tapped card was not updated");
    assert(r.update.inTime, `card updated after ${r.update.afterMs} ms (WeCom allows 5 s)`);
    assert.equal(r.update.card.task_id, r.card.task_id);
    assert(!r.urlInReply, "the url was also pasted into the reply");
    if (name === "handoff-card") {
      assert.equal(r.after.cardState, "done", "完成 did not reach the plugin");
      assert.equal(r.after.ended, false);
      assert.deepEqual(r.update.card.main_title, { title: "电脑", desc: "已完成" });
      assert.deepEqual(r.update.card.button_list, [{ text: "已完成", style: 2, key: "vnoop" }]);
    } else {
      assert.equal(r.after.cardState, "skipped", "跳过 did not reach the plugin");
      assert.equal(r.after.ended, true, "跳过 did not end the handoff");
      assert.deepEqual(r.update.card.main_title, { title: "电脑", desc: "已跳过" });
    }
    assert.match(r.afterTap.join("\n"), /收到|继续/u, "the agent did not continue after the tap");
  }
  if (s["model-roles"]) {
    assert.equal(s["model-roles"].error, undefined, s["model-roles"].error);
    if (ROLES_CONFIGURED) assertModelRoles(s["model-roles"]);
  }
}
