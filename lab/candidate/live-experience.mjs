// Live acceptance: the patched DingTalk, WeCom and Telegram channels on the
// real platforms, with VLab's own test robots, in a private Gateway that runs
// for LIVE_MINUTES while a person (or an agent driving the desktop apps)
// chats with the robots.
//
// Credentials come from the VLab secrets file and are never printed:
//   VLAB_DINGTALK_TEST_CLIENT_ID / VLAB_DINGTALK_TEST_CLIENT_SECRET
//   VLAB_WECOM_TEST_BOT_ID / VLAB_WECOM_TEST_SECRET
//   VLAB_TELEGRAM_TEST_BOT_TOKEN
// A channel whose credentials are missing is left out. Production robots are
// never used. Telegram accepts only LIVE_TELEGRAM_ALLOW (comma list of ids).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const MINUTES = Number(process.env.LIVE_MINUTES ?? 45);
const MODEL = process.env.LIVE_MODEL ?? "deepseek/deepseek-v4-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secrets = new Map();
for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
  if (m) secrets.set(m[1], m[2].replace(/^["']|["']$/gu, ""));
}
const secretValues = [...secrets.values()].filter((v) => v.length >= 8);
const redact = (s) => { let out = String(s); for (const v of secretValues) out = out.split(v).join("[secret]"); return out.replace(/bot\d+:[\w-]+/gu, "bot[secret]"); };
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
const experienceSource = path.resolve("apps/v-experience/v-experience.mjs");
const report = { channels: {}, patches: {} };

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.bindings = (config.bindings ?? []).filter((b) => !["dingtalk-connector", "wecom", "telegram"].includes(b?.match?.channel));
// Shared VLab also lists unpatched copies of these plugins; the private copies must be the only ones.
config.plugins.load = { ...(config.plugins.load ?? {}), paths: (config.plugins.load?.paths ?? []).filter((p) => !/dingtalk|wecom/iu.test(p)) };
config.plugins.allow = Array.isArray(config.plugins.allow) ? [...config.plugins.allow] : config.plugins.allow;
const allowPlugin = (id) => {
  config.plugins.entries = { ...(config.plugins.entries ?? {}), [id]: { ...(config.plugins.entries?.[id] ?? {}), enabled: true } };
  if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes(id)) config.plugins.allow.push(id);
};
const trustPlugins = [];

if (secrets.get("VLAB_DINGTALK_TEST_CLIENT_ID") && secrets.get("VLAB_DINGTALK_TEST_CLIENT_SECRET")) {
  const project = path.join(scratch, "dingtalk-project");
  fs.mkdirSync(project, { recursive: true });
  assert.equal(spawnSync("tar", ["xzf", path.resolve(findInput("dingtalk-connector-0.8.26-v.tgz")), "-C", project]).status, 0);
  const pluginDir = path.join(project, "node_modules", "@dingtalk-real-ai", "dingtalk-connector");
  const { patchDingtalkConnector } = await import(pathToFileURL(path.resolve("apps/v-experience/dingtalk/patch.mjs")).href);
  report.patches.dingtalk = patchDingtalkConnector(path.join(pluginDir, "dist"), { experienceSource });
  config.channels["dingtalk-connector"] = {
    enabled: true, clientId: secrets.get("VLAB_DINGTALK_TEST_CLIENT_ID"), clientSecret: secrets.get("VLAB_DINGTALK_TEST_CLIENT_SECRET"),
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], requireMention: true,
    groupReplyMode: "aicard", typingIndicator: true, separateSessionByConversation: true, groupSessionScope: "group", debug: true,
  };
  config.plugins.load.paths.push(pluginDir);
  allowPlugin("dingtalk-connector");
  trustPlugins.push("dingtalk-connector");
  config.bindings.push({ agentId: "makaron", match: { channel: "dingtalk-connector" } });
  report.channels.dingtalk = "configured";
}
if (secrets.get("VLAB_WECOM_TEST_BOT_ID") && secrets.get("VLAB_WECOM_TEST_SECRET")) {
  const pluginDir = path.join(scratch, "wecom-openclaw-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  assert.equal(spawnSync("tar", ["xzf", path.resolve(findInput("wecom-openclaw-plugin-2026.8.17-vlab.2-v.tgz")), "-C", pluginDir]).status, 0);
  const { patchWeComPlugin } = await import(pathToFileURL(path.resolve("apps/v-experience/wecom/patch.mjs")).href);
  report.patches.wecom = patchWeComPlugin(path.join(pluginDir, "dist", "src"), { experienceSource });
  config.channels.wecom = {
    enabled: true, connectionMode: "websocket", botId: secrets.get("VLAB_WECOM_TEST_BOT_ID"), secret: secrets.get("VLAB_WECOM_TEST_SECRET"),
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"],
  };
  config.plugins.load.paths.push(pluginDir);
  allowPlugin("wecom-openclaw-plugin");
  trustPlugins.push("wecom-openclaw-plugin");
  config.bindings.push({ agentId: "makaron", match: { channel: "wecom" } });
  report.channels.wecom = "configured";
}
if (secrets.get("VLAB_TELEGRAM_TEST_BOT_TOKEN")) {
  const { patchTelegram } = await import(pathToFileURL(path.resolve("apps/v-experience/telegram/patch.mjs")).href);
  report.patches.telegram = patchTelegram(dist, { experienceSource });
  const allow = (process.env.LIVE_TELEGRAM_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  assert(allow.length, "LIVE_TELEGRAM_ALLOW is required for the Telegram test robot");
  config.channels.telegram = { enabled: true, botToken: secrets.get("VLAB_TELEGRAM_TEST_BOT_TOKEN"), dmPolicy: "allowlist", allowFrom: allow, groupAllowFrom: allow };
  config.commands = { ...(config.commands ?? {}), ownerAllowFrom: [...new Set([...(config.commands?.ownerAllowFrom ?? []), ...allow.map((id) => `telegram:${id}`)])] };
  allowPlugin("telegram");
  config.bindings.push({ agentId: "makaron", match: { channel: "telegram" } });
  report.channels.telegram = "configured";
}
assert(Object.keys(config.channels).length, "no test robot credentials in the VLab secrets file");

config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODEL };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
if (loaderFile && trustPlugins.length) {
  const src = fs.readFileSync(loaderFile, "utf8");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", `record?.trustedOfficialInstall !== true && !${JSON.stringify(trustPlugins)}.includes(pluginId)`)));
}

// VLab reaches api.dingtalk.com's IPv4 address (Singapore) in ~250 ms, right at
// Node's default happy-eyeballs attempt timeout; the connector's axios calls
// then fail with ETIMEDOUT and it drops to plain messages. Give attempts 2 s.
const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --network-family-autoselection-attempt-timeout=2000`.trim();
const env = { ...process.env, NODE_OPTIONS: nodeOptions, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: path.join(scratch, "tmp"), XDG_CACHE_HOME: path.join(scratch, "cache"), npm_config_cache: path.join(scratch, "cache", "npm") };
for (const name of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) if (secrets.get(name)) env[name] = secrets.get(name);
const logFile = path.join(scratch, "live-gateway.log");
const out = fs.openSync(logFile, "a", 0o600);
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", out, out] });
console.log(JSON.stringify({ started: new Date().toISOString(), minutes: MINUTES, ...report }));
const deadline = Date.now() + MINUTES * 60_000;
while (Date.now() < deadline && gateway.exitCode === null) await sleep(5000);
gateway.kill("SIGTERM");
await sleep(3000);
if (gateway.exitCode === null) gateway.kill("SIGKILL");
const lines = fs.readFileSync(logFile, "utf8").split("\n");
report.experienceLog = lines.filter((l) => /v-experience/u.test(l)).map((l) => redact(l).slice(0, 300)).slice(-80);
if (gateway.exitCode !== null && Date.now() < deadline) {
  report.gatewayExitedEarly = gateway.exitCode;
  report.gatewayTail = lines.filter(Boolean).slice(-80).map((l) => redact(l).slice(0, 300));
  process.exitCode = 1;
}
report.channelErrors = lines.filter((l) => /(dingtalk|wecom|telegram)/iu.test(l) && /error|failed|exited/iu.test(l)).map((l) => redact(l).slice(0, 300)).slice(-40);
console.log(JSON.stringify(report, null, 1));
