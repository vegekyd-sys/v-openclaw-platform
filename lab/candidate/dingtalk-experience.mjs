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
// The model-roles scenario also patches the core command-auth and sets the
// command roles (lab/candidate/model-roles.mjs).
// `tool-only` (a group, as on V 2026-10-15) has the agent send its answer and a
// file with the message tool and end with an empty final; it records what the
// reply card that was created at the start of the turn shows at the end.
// `secret-link` and `handoff-card` run the services behind V's link cards
// (lab/candidate/channel-cards-support.mjs) and check the actionCard the
// robot sends; `handoff-card` checks the Worker config the Gateway derives
// carries the handoff plugin (the tool runs there).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createFakeDingTalkOpenApi } from "./dingtalk-fake-open-api.mjs";
import { assertModelRoles, configureRoles, patchCoreCommandAuth, ROLES_CONFIGURED, runModelRoles } from "./model-roles.mjs";
import { linkToken, startHandoff, startSecretEntry, widenCoreSecretEntry } from "./channel-cards-support.mjs";

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
// V sets this (both configs); the connector's empty-group placeholder says it is missing.
config.messages = { ...(config.messages ?? {}), groupChat: { ...(config.messages?.groupChat ?? {}), visibleReplies: "automatic" } };
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
const ROLE_USERS = { owner: "candowner", nonOwner: "candguest" };
if (SCENARIO_NAMES.includes("model-roles")) {
  report.coreCommandAuth = patchCoreCommandAuth(runtime);
  report.roles = configureRoles(config, "dingtalk-connector", [ROLE_USERS.owner]);
}
if (SCENARIO_NAMES.includes("secret-link")) report.secretEntryCorePatch = await widenCoreSecretEntry(dist);
const handoff = SCENARIO_NAMES.some((n) => n.startsWith("handoff-")) ? await startHandoff({ dir: path.join(scratch, "desktop-handoff"), config, runtime, dist }) : undefined;
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

// The 「电脑」 card: wait for it, open its link, press button `press` (2 = 完成, 3 = 跳过) the
// way DingTalk does for a send-message link (the command arrives as the user's message).
const HANDOFF_ASK = "这是自动化测试，请严格照做。立即调用 desktop_handoff_request 工具，参数 reason 填「需要你登录测试站点」。工具返回后按它返回的 instruction 只回复一句话，然后结束，不要做别的事。收到 /v-handback 或 /v-skip 之后，只回复一句「收到，继续」。";
const handoffScenario = async (press) => {
  const u = nextUser(); const since = Date.now();
  const conversationId = `cidDirect${u}`;
  // The model sometimes answers without calling the tool: ask once more in that case.
  const replies = [];
  let sent;
  for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
    const at = Date.now();
    fake.sendUserText({ userId: u, text: HANDOFF_ASK, conversationId });
    const found = await waitFor(() => fake.robotMessages.find((m) => m.at >= at && linkToken(m.msgParam?.actionURL1, "/desktop-handoff"))
      ?? (finishedCards(at).length > 0 && Date.now() - lastActivity(conversationId, at) > 20_000 ? "no-card" : null), 300_000, "handoff card");
    if (found === "no-card") replies.push(allText(conversationId, at).slice(-300));
    else sent = found;
  }
  if (!sent) throw new Error(`no handoff card; replies: ${JSON.stringify(replies)}`);
  await settle(conversationId, since, () => finishedCards(since).length > 0, { label: "handoff reply", quietMs: 6000, timeoutMs: 240_000 }).catch(() => null);
  const link = linkToken(sent.msgParam.actionURL1, "/desktop-handoff");
  const id = handoff.issued().at(-1)?.id;
  const buttons = [1, 2, 3].map((i) => {
    const target = sent.msgParam[`actionURL${i}`] ?? "";
    const parsed = (() => { try { return new URL(target); } catch { return null; } })();
    return { title: sent.msgParam[`actionTitle${i}`], scheme: parsed?.protocol, opens: parsed?.searchParams.get("url")?.replace(link.token, "[token]") ?? null, pcSlide: parsed?.searchParams.get("pc_slide") ?? null, sends: parsed?.protocol === "dtmd:" ? parsed.searchParams.get("content") : null };
  });
  const claimStatus = await handoff.claim(link.token);
  const before = await handoff.status(id);
  const command = buttons[press - 1].sends;
  const pressedAt = Date.now();
  if (command) fake.sendUserText({ userId: u, text: command, conversationId });
  const expected = press === 2 ? "done" : "skipped";
  let status = null;
  for (const until = Date.now() + 90_000; Date.now() < until;) {
    status = await handoff.status(id);
    if (status?.card?.state === expected) break;
    await sleep(500);
  }
  await settle(conversationId, pressedAt, (t) => /收到|继续/u.test(t), { label: "after the press", quietMs: 8000, timeoutMs: 240_000 }).catch(() => null);
  // Every state a card showed (a command reply and the next answer may share one AI card).
  const afterPress = [...new Set([
    ...messagesSince(conversationId, pressedAt).map((m) => String(m.text ?? "")),
    ...cardsSince(pressedAt).flatMap((c) => c.history.map((h) => h.content)),
    ...fake.robotMessages.filter((m) => m.at >= pressedAt).map((m) => String(m.msgParam?.content ?? m.msgParam?.text ?? JSON.stringify(m.msgParam))),
  ].filter(Boolean))];
  return {
    retriedAsk: replies,
    card: { path: sent.path, msgKey: sent.msgKey, userIds: sent.userIds, title: sent.msgParam.title, text: sent.msgParam.text, buttons },
    uploads: fake.mediaUploads.filter((m) => m.at >= since),
    cover: handoff.cover,
    handoffId: id,
    claimStatus,
    before: { cardState: before?.card?.state, cardChannel: before?.card?.channel, ended: before?.ended },
    pressed: command,
    after: { cardState: status?.card?.state, ended: status?.ended, endReason: status?.endReason, claims: status?.claims },
    afterPress: afterPress.map((t) => t.slice(0, 300)),
    urlInReply: /desktop-handoff/u.test(allText(conversationId, since)),
    handoffLog: lines.filter((l) => /desktop.handoff|v-desktop-handoff/iu.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(-10),
  };
};
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
  // A3: the credential link as an actionCard with one 填写凭据 button; the value is typed on the page.
  "secret-link": async () => {
    const u = nextUser(); const since = Date.now();
    const value = `vsl-${crypto.randomBytes(12).toString("hex")}`;
    const { conversationId } = fake.sendUserText({ userId: u, text: "这是自动化测试。请用 secrets 工具的 request 动作，向我索取一个名为 V_CANDIDATE_DEMO_TOKEN 的凭据（说明写：测试用，可以随便填）。拿到后只回复 SECRET_SAVED；如果没法索取，就回复 SECRET_UNAVAILABLE 并说明原因。" });
    const cardMsg = await waitFor(() => messagesSince(conversationId, since).find((m) => linkToken(m.actionCard?.singleURL, "/secret-entry")), 300_000, "credential card");
    const link = linkToken(cardMsg.actionCard.singleURL, "/secret-entry");
    const { reuse, ...page } = await secretEntry.use(link.token, value);
    await settle(conversationId, since, (t) => /SECRET_(SAVED|UNAVAILABLE)/u.test(t), { label: "secret-link reply", quietMs: 8000, timeoutMs: 240_000 }).catch(() => null);
    const t = allText(conversationId, since);
    const chat = JSON.stringify([fake.webhookMessages, fake.robotMessages, fake.cards()]);
    return {
      card: { ...cardMsg.actionCard, singleURL: cardMsg.actionCard.singleURL.replace(link.token, "[token]"), opens: link.url.replace(link.token, "[token]"), pcSlide: new URL(cardMsg.actionCard.singleURL).searchParams.get("pc_slide") },
      page, reuse: await reuse(), saved: /SECRET_SAVED/u.test(t), cancelled: /不能安全地输入凭据/u.test(t),
      linkInText: messagesSince(conversationId, since).some((m) => /secret-entry/u.test(m.text ?? "")),
      leaks: { gatewayLog: lines.filter((l) => l.line.includes(value)).length, serviceLog: secretEntry.lines.filter((l) => l.includes(value)).length, chat: chat.includes(value), audit: JSON.stringify(secretEntry.audit()).includes(value) },
      ...JSON.parse(JSON.stringify(view(conversationId, since)).replaceAll(link.token, "[token]")),
    };
  },
  // A4: V's 「电脑」 card as an actionCard: the desktop picture (robot media) and 接管 / 完成 / 跳过;
  // 完成 is pressed (its send-message link posts /v-handback <id> as the user).
  "handoff-card": () => handoffScenario(2),
  // The same card, 跳过 pressed: /v-skip <id> ends the handoff.
  "handoff-skip": () => handoffScenario(3),
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
  // C1: the owner keeps every command; a non-owner may only switch their own session's model.
  "model-roles": () => runModelRoles({
    dist, port, token: config.gateway?.auth?.token, config,
    transport: {
      ...ROLE_USERS,
      send: (user, text) => fake.sendUserText({ userId: user, text }),
      text: (user, since) => [
        ...cardsSince(since).filter((c) => !c.delivered || c.delivered.openSpaceId?.includes(user)).flatMap((c) => c.history.map((h) => h.content)),
        ...messagesSince(`cidDirect${user}`, since).map((m) => m.text),
      ].filter(Boolean).join("\n\n"),
      connections: () => fake.calls.filter((c) => c.path === "/v1.0/gateway/connections/open").length,
    },
  }),
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
  // V 2026-10-15 20:30: the answer and an xlsx went out with the message tool, the
  // final was empty, and the reply card from the start of the turn ended with the
  // connector's「暂未收到模型回复内容…visibleReplies」placeholder above them.
  "tool-only": async () => {
    const u = nextUser();
    const conversationId = `cidGroup${u}`;
    const ask = [
      "这是自动化测试，请严格照做，不要解释。",
      "1) 用 exec 运行：printf 'name,score\\nA,1\\n' > tool-only-table.csv",
      "2) 调用 message 工具（action=send）把这句话发到当前群：「TOOL_ONLY_TEXT 对比表做好了」，并把 tool-only-table.csv 作为附件一起发出（media 填这个文件路径）。",
      "3) message 工具返回后，你的最终回复只输出 NO_REPLY，不要再输出其他任何文字。",
    ].join("\n");
    const attempts = [];
    let since;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      since = Date.now();
      fake.sendUserText({ userId: u, text: ask, group: true, conversationId });
      await settle(conversationId, since, () => finishedCards(since).length > 0 || fake.robotMessages.some((m) => m.at >= since && /TOOL_ONLY_TEXT/u.test(JSON.stringify(m.msgParam))), { label: "tool-only turn", quietMs: 15_000, timeoutMs: 300_000 }).catch(() => null);
      const toolSent = fake.robotMessages.filter((m) => m.at >= since && m.openConversationId === conversationId);
      attempts.push({ toolSends: toolSent.length });
      if (toolSent.some((m) => /TOOL_ONLY_TEXT/u.test(JSON.stringify(m.msgParam)))) break;
    }
    const toolSent = fake.robotMessages.filter((m) => m.at >= since && m.openConversationId === conversationId);
    const shown = view(conversationId, since);
    const cardFinals = finishedCards(since).map((c) => c.content ?? "");
    const everything = [...cardsSince(since).flatMap((c) => c.history.map((h) => h.content)), ...messagesSince(conversationId, since).map((m) => m.text ?? "")].join("\n");
    return {
      attempts,
      toolSends: toolSent.map((m) => ({ msgKey: m.msgKey, text: String(m.msgParam?.content ?? m.msgParam?.text ?? m.msgParam?.fileName ?? JSON.stringify(m.msgParam)).slice(0, 200) })),
      toolTextSent: toolSent.some((m) => /TOOL_ONLY_TEXT/u.test(JSON.stringify(m.msgParam))),
      fileSent: toolSent.some((m) => /file|File/u.test(String(m.msgKey ?? ""))),
      ...shown,
      cardFinals,
      placeholder: /暂未收到模型回复内容|visibleReplies|有其他问题随时找我/u.test(everything),
      cardSaysSent: cardFinals.some((t) => /✅ 已发送/u.test(t)),
      log: lines.filter((l) => l.at >= since && /closeStreaming|final 响应无文本|idleNudge|SendMedia|sendMedia/u.test(l.line)).map((l) => redact(l.line).slice(0, 240)).slice(-12),
    };
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
  if (handoff) report.agentErrors = lines.filter((l) => /error|failed|denied|exception/iu.test(l.line) && !/DingTalk|dingtalk|onStatusChange/u.test(l.line)).map((l) => redact(l.line).slice(0, 500)).slice(-30);
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
  if (s["model-roles"]) {
    assert.equal(s["model-roles"].error, undefined, s["model-roles"].error);
    if (ROLES_CONFIGURED) assertModelRoles(s["model-roles"]);
  }
  if (s["secret-link"]) {
    const r = s["secret-link"];
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.card.title, "🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN");
    assert.equal(r.card.singleTitle, "填写凭据");
    assert.match(r.card.text, /^### 🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN\n\n[\s\S]*链接只能用一次、\d+ 分钟内有效；值不会出现在聊天记录里。$/u);
    assert.match(r.card.singleURL, /^dingtalk:\/\/dingtalkclient\/page\/link\?url=/u);
    assert.equal(r.card.pcSlide, "false");
    assert.match(r.card.opens, /^https:\/\/openclaw\.example\.test\/secret-entry\/#\[token\]$/u);
    assert(!r.linkInText, "the link must only be behind the button");
    assert(r.page.pageHasPasswordInput && r.page.info.status === 200, "entry page");
    assert.equal(r.page.submit.status, 200, `submit failed: ${JSON.stringify(r.page.submit)}`);
    assert.equal(r.reuse, 410, "the link worked twice");
    assert(r.saved && !r.cancelled, "agent did not get the value");
    assert.deepEqual(r.leaks, { gatewayLog: 0, serviceLog: 0, chat: false, audit: false }, "value leaked");
  }
  for (const name of ["handoff-card", "handoff-skip"]) if (s[name]) {
    const r = s[name];
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.card.msgKey, "sampleActionCard3", "three buttons");
    assert.equal(r.card.title, "电脑 · 需要操作");
    assert.match(r.card.text, /^### 电脑 · 需要操作\n\n需要你登录测试站点\n\n点「接管」打开 V 的电脑直接操作，做完点「完成」，V 接着做；不需要就点「跳过」。\d+ 分钟内打开有效。\n\n!\[V 的电脑\]\(@lADPcandidate\d+\)$/u);
    assert(r.uploads.length >= 1 && r.uploads[0].type === "image" && r.uploads[0].bytes > r.cover.bytes && r.uploads[0].token, `the desktop picture was not uploaded as robot media: ${JSON.stringify(r.uploads)}`);
    assert.deepEqual(r.card.buttons.map((b) => b.title), ["接管", "完成", "跳过"]);
    assert.deepEqual(r.card.buttons[0], { title: "接管", scheme: "dingtalk:", opens: "https://openclaw.example.test/desktop-handoff/#[token]", pcSlide: "false", sends: null });
    assert.equal(r.card.buttons[1].sends, `/v-handback ${r.handoffId}`);
    assert.equal(r.card.buttons[2].sends, `/v-skip ${r.handoffId}`);
    assert.equal(r.claimStatus, 200, "the card's link does not open the handoff");
    assert.deepEqual(r.before, { cardState: "pending", cardChannel: "dingtalk-connector", ended: false });
    assert(!r.urlInReply, "the url was also pasted into the reply");
    const after = r.afterPress.join("\n");
    if (name === "handoff-card") {
      assert.equal(r.after.cardState, "done", "完成 did not reach the plugin");
      assert.equal(r.after.ended, false);
      assert.match(after, /电脑已在 V 手里/u, "no status line (a DingTalk card cannot change)");
    } else {
      assert.equal(r.after.cardState, "skipped", "跳过 did not reach the plugin");
      assert.equal(r.after.ended, true, "跳过 did not end the handoff");
      assert.match(after, /已跳过这一步/u, "no status line (a DingTalk card cannot change)");
    }
    assert.match(after, /收到|继续/u, "the agent did not continue after the press");
  }
  if (s["tool-only"]) {
    const r = s["tool-only"];
    assert.equal(r.error, undefined, r.error);
    assert(r.toolTextSent, `the agent did not send with the message tool: ${JSON.stringify(r.attempts)}`);
    assert(!r.placeholder, `an empty-reply placeholder was shown: ${JSON.stringify(r.cards)}`);
    assert(r.cardFinals.length === 0 || r.cardSaysSent, `the reply card does not say the content was sent: ${JSON.stringify(r.cardFinals)}`);
  }
  if (s["ask-card"]) {
    assert(s["ask-card"].questionCard, "no question card was delivered");
    assert(s["ask-card"].cardAnswered, "tapping the card did not answer it");
    assert(s["ask-card"].continued, "the agent did not continue after the tap");
  }
}
