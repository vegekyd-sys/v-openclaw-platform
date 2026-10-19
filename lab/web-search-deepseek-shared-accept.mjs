// Shared VLab acceptance for lab/release-files/web-search-deepseek (run on the VLab host as root,
// with the integration lease held by --owner).
//
//   node web-search-deepseek-shared-accept.mjs backup  --owner O   # exact bytes of both live configs
//   node web-search-deepseek-shared-accept.mjs apply   --owner O   # plugin to /opt/v-deepseek-web/plugin, config.mjs on both, validate
//   node web-search-deepseek-shared-accept.mjs restart --owner O   # only when no Worker is busy
//   node web-search-deepseek-shared-accept.mjs run     --owner O   # real turns, deliver:false, checked in the session database
//   node web-search-deepseek-shared-accept.mjs restore --owner O   # byte-for-byte from backup, then restart
//
// The plugin goes to the same path as on V so both configs end up identical; config stays applied
// after acceptance so shared VLab matches V once V is switched (otherwise run restore).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { useDeepSeekWeb, PRODUCTION_PLUGIN_PATH } from "./release-files/web-search-deepseek/config.mjs";

const LAB = "/srv/vlab-production-mirror/labs";
const BASE = `${LAB}/instances/db91-parity`;
const UNIT = "openclaw-vlab-production-mirror-v8.service";
const NODE = "/opt/vlab/node-v22.23.1-linux-x64/bin/node";
const PORT = 24993;
const WORK = `${LAB}/shared-workflow/web-search-deepseek-20261017`;
const PLUGIN_SOURCE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../apps/v-deepseek-web/plugin");
const PLUGIN_FILES = ["index.js", "core/deepseek.js", "openclaw.plugin.json", "package.json"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => execFileSync("sha256sum", [f], { encoding: "utf8" }).slice(0, 16);

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const owner = opt("owner");
assert(owner, "--owner required");
assert.equal(JSON.parse(fs.readFileSync(`${LAB}/control/integration.json`, "utf8")).owner, owner, "integration lease belongs to another task");
assert.equal(process.getuid(), 0, "run as root on the VLab host");
fs.mkdirSync(`${WORK}/backup`, { recursive: true, mode: 0o700 });
const log = (o) => { const line = JSON.stringify(o); console.log(line); fs.appendFileSync(`${WORK}/log.jsonl`, `${line}\n`); };

const gatewayPid = () => Number(execFileSync("systemctl", ["show", UNIT, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
function gatewayEnv() {
  const pid = gatewayPid();
  assert(pid > 1, "Gateway is not running");
  return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
}
// The live configs are wherever the running Gateway says, and the Worker config that one names.
const CONFIG = gatewayEnv().OPENCLAW_CONFIG_PATH;
assert(CONFIG, "Gateway has no OPENCLAW_CONFIG_PATH");
const WORKER_CONFIG = JSON.parse(fs.readFileSync(CONFIG, "utf8")).plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath;
const STATE = gatewayEnv().OPENCLAW_STATE_DIR ?? `${BASE}/state`;

function replaceKeepingOwner(file, content) {
  const st = fs.statSync(file);
  const tmp = `${file}.wsd-tmp`;
  fs.writeFileSync(tmp, content, { flag: "wx", mode: st.mode & 0o777 });
  fs.chownSync(tmp, st.uid, st.gid);
  fs.renameSync(tmp, file);
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
      url: `ws://127.0.0.1:${PORT}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      onEvent(e) {
        const p = e.payload;
        const r = runs.get(p?.runId);
        if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) {
          r.terminal = p.state; r.endAt = Date.now();
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
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 400_000 });
  const deadline = Date.now() + 420_000;
  while (!r.terminal && Date.now() < deadline) await sleep(250);
  r.secs = Math.round(((r.endAt ?? Date.now()) - r.sentAt) / 100) / 10;
  return r;
}

// What the turn really did, from the session database (read-only).
function observe(sessionKey, sinceMs) {
  const db = new DatabaseSync(`${STATE}/agents/makaron/agent/openclaw-agent.sqlite`, { readOnly: true });
  try {
    const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
    const events = windows.length ? db.prepare(`SELECT event_json, created_at FROM transcript_events
      WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs) : [];
    const calls = new Map(); const searches = []; const fetches = []; let reply = ""; let model = null;
    for (const e of events) {
      const j = JSON.parse(e.event_json);
      const m = j.type === "message" ? j.message : null;
      if (m?.role === "assistant") {
        for (const c of Array.isArray(m.content) ? m.content : []) {
          if (c.type === "toolCall") calls.set(c.id, { name: c.name, args: c.arguments, at: e.created_at });
          if (c.type === "text" && String(c.text ?? "").trim()) { reply = String(c.text); model = `${m.provider}/${m.model}`; }
        }
      } else if (m?.role === "toolResult") {
        const call = calls.get(m.toolCallId) ?? {};
        const text = Array.isArray(m.content) ? m.content.map((c) => (typeof c === "string" ? c : c?.text ?? "")).join("") : String(m.content ?? "");
        const name = m.toolName ?? call.name;
        if (name === "web_search") searches.push({ ms: call.at ? e.created_at - call.at : null, chars: text.length,
          provider: text.match(/"provider"\s*:\s*"([a-z-]+)"/u)?.[1] ?? null, error: m.isError === true || /"kind"\s*:\s*"error"/u.test(text) });
        if (name === "web_fetch") fetches.push({ url: call.args?.url, ms: call.at ? e.created_at - call.at : null, chars: text.length,
          extractor: text.match(/"extractor"\s*:\s*"([a-z-]+)"/u)?.[1] ?? null, error: m.isError === true || /Web fetch (failed|extraction failed)/u.test(text.slice(0, 800)) });
      }
    }
    return { model, reply: reply.slice(0, 300), replyChars: reply.length, tools: [...calls.values()].map((c) => c.name), searches, fetches };
  } finally { db.close(); }
}

async function waitReady(timeoutMs = 30 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listening = await new Promise((resolve) => {
      const sock = net.connect({ host: "127.0.0.1", port: PORT });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (listening) { try { await connect(); await call("health", {}); client.stop?.(); return; } catch { /* starting */ } }
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

const SEARCH_PROMPTS = [
  "（共享 VLab 验收）帮我查一下扬州小盘谷的地址、开放时间和门票价格。",
  "（共享 VLab 验收）Feishu 开放平台发送消息接口的 HTTP 路径和必填的查询参数是什么？请搜索官方文档后回答。",
  "（共享 VLab 验收）OpenAI DevDay 2026 是哪天举办的？发布了什么？请联网搜索后回答。",
];
const FETCH_BLOCKED = "（共享 VLab 验收）不要搜索。请直接用 web_fetch 读取 https://baike.baidu.com/item/%E4%B8%8A%E6%B5%B7%E8%BF%AA%E5%A3%AB%E5%B0%BC%E4%B9%90%E5%9B%AD ，告诉我上海迪士尼乐园的开园日期。";
const FETCH_DIRECT = "（共享 VLab 验收）不要搜索。请直接用 web_fetch 读取 https://api-docs.deepseek.com/guides/search/ ，告诉我 Search API 的请求地址和计费价格。";

if (command === "backup") {
  for (const [src, name] of [[CONFIG, "live-openclaw.json"], [WORKER_CONFIG, "live-worker-openclaw.json"]]) {
    const dst = `${WORK}/backup/${name}`;
    if (!fs.existsSync(dst)) execFileSync("cp", ["-a", src, dst]);
    assert.equal(sha(dst), sha(src), `${name} already backed up with different bytes`);
  }
  log({ backup: `${WORK}/backup`, config: CONFIG, worker: WORKER_CONFIG, files: fs.readdirSync(`${WORK}/backup`).map((f) => [f, sha(`${WORK}/backup/${f}`)]) });
} else if (command === "apply") {
  assert(fs.existsSync(`${WORK}/backup/live-openclaw.json`), "run backup first");
  for (const f of PLUGIN_FILES) {
    const dst = `${PRODUCTION_PLUGIN_PATH}/${f}`;
    fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o755 });
    fs.copyFileSync(`${PLUGIN_SOURCE}/${f}`, dst); fs.chmodSync(dst, 0o644);
    fs.chownSync(dst, 0, 0); // OpenClaw blocks plugin files owned by anyone but root or the service user
    fs.chownSync(path.dirname(dst), 0, 0);
  }
  log({ plugin: PRODUCTION_PLUGIN_PATH, files: PLUGIN_FILES.map((f) => [f, sha(`${PRODUCTION_PLUGIN_PATH}/${f}`)]) });
  for (const [file, name] of [[CONFIG, "openclaw.wsd.json"], [WORKER_CONFIG, "worker-openclaw.wsd.json"]]) {
    const { config, changed, reason } = useDeepSeekWeb(JSON.parse(fs.readFileSync(file, "utf8")));
    const candidate = `${WORK}/${name}`;
    fs.rmSync(candidate, { force: true });
    fs.writeFileSync(candidate, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    fs.chownSync(candidate, fs.statSync(file).uid, fs.statSync(file).gid);
    const v = spawnSync("sudo", ["-u", "lab-db91-parity", "--preserve-env", NODE, `${BASE}/runtime/openclaw/dist/index.js`, "config", "validate", "--json"],
      { env: { ...gatewayEnv(), OPENCLAW_CONFIG_PATH: candidate }, encoding: "utf8", cwd: "/tmp", timeout: 180_000, maxBuffer: 16 << 20 });
    log({ validate: name, changed, reason, status: v.status, out: redact((v.stdout || "") + (v.stderr || "")).slice(-500) });
    assert.equal(v.status, 0, `${name} validate failed; shared config untouched`);
    if (changed) replaceKeepingOwner(file, fs.readFileSync(candidate));
    log({ applied: file, sha: sha(file) });
  }
} else if (command === "restart") {
  await restart();
} else if (command === "run") {
  await connect();
  const stamp = Date.now();
  const rows = [];
  const turn = async (label, message) => {
    const key = `agent:makaron:explicit:vlab-dev-wsd-${label}-${stamp}`;
    const pre = await send(key, "/deepseek");
    const since = Date.now();
    const r = await send(key, message);
    const seen = observe(key, since);
    const row = { label, key, switch: pre.terminal, terminal: r.terminal, error: r.error, secs: r.secs, ...seen };
    log(row);
    rows.push(row);
    return row;
  };
  for (const [i, p] of SEARCH_PROMPTS.entries()) await turn(`search${i}`, p);
  const blocked = await turn("fetch-blocked", FETCH_BLOCKED);
  const direct = await turn("fetch-direct", FETCH_DIRECT);
  client.stop?.();
  const errors = spawnSync("journalctl", ["-u", UNIT, "--since", `@${Math.floor(stamp / 1000)}`, "--no-pager", "-o", "cat"], { encoding: "utf8", maxBuffer: 256 << 20 }).stdout
    .split("\n").filter((l) => /v-deepseek-web|deepseek (search|fetch)|tools\/(search|fetch)|web_search|web_fetch/iu.test(l) && /error|fail|429|402|not registered|disabled/iu.test(l)).map((l) => redact(l).slice(0, 240)).slice(-15);
  log({ journalErrors: errors });
  const failures = [];
  for (const r of rows.slice(0, 3)) {
    if (r.terminal !== "final" || r.replyChars < 20) failures.push(`${r.label}: no final reply (${r.terminal} ${r.error ?? ""})`);
    if (!r.model?.startsWith("deepseek/")) failures.push(`${r.label}: answered by ${r.model}, not deepseek`);
    if (!r.searches.length || !r.searches.every((s) => s.provider === "deepseek" && !s.error)) failures.push(`${r.label}: searches ${JSON.stringify(r.searches)}`);
    if (r.searches.some((s) => s.chars >= 10000)) failures.push(`${r.label}: result over 10,000 characters`);
  }
  if (!blocked.fetches.some((f) => f.extractor === "deepseek" && !f.error) || !/2016/u.test(blocked.reply)) failures.push(`fetch-blocked: ${JSON.stringify(blocked.fetches)} ${blocked.reply.slice(0, 80)}`);
  if (!direct.fetches.length || direct.fetches.some((f) => f.extractor === "deepseek" || f.error)) failures.push(`fetch-direct: ${JSON.stringify(direct.fetches)}`);
  log({ result: failures.length ? "FAIL" : "PASS", failures,
    searchMs: rows.slice(0, 3).flatMap((r) => r.searches.map((s) => s.ms)), turnSecs: rows.map((r) => r.secs),
    fallback: blocked.fetches.map((f) => `${f.extractor}:${f.ms}ms`), direct: direct.fetches.map((f) => `${f.extractor}:${f.ms}ms`) });
  process.exitCode = failures.length ? 1 : 0;
} else if (command === "restore") {
  for (const [dst, name] of [[CONFIG, "live-openclaw.json"], [WORKER_CONFIG, "live-worker-openclaw.json"]]) execFileSync("cp", ["-a", `${WORK}/backup/${name}`, dst]);
  log({ restored: [CONFIG, WORKER_CONFIG].map((f) => [f, sha(f)]) });
  await restart();
} else {
  throw new Error(`unknown command ${command}`);
}
