// Candidate end-to-end: V Browser on every agent harness.
//
// Production 2026-10-01 10:32: on the Codex harness every browser call after
// v_browser_acquire failed with "OpenClaw tool policy rewrote Codex app-server
// approval params". The V Browser plugin routed by rewriting browser params in
// before_tool_call; Codex relays that hook through PreToolUse and refuses any
// rewrite. Plugin 0.4.7 never rewrites: acquire returns browserParams, the hook
// passes calls that carry them and blocks others with the exact fix.
//
// One private Gateway on the candidate config copy hosts the extension relay.
// A private Broker (production's server.js) routes a real V Browser extension,
// loaded into headless Chrome and paired like a user would, to that relay.
// Each harness gets its own direct Session and must read a secret that exists
// only in the rendered page, so the reply proves the browser tool reached the
// device. VB_EXPECT=fixed asserts every harness passes with zero rewrite
// refusals; VB_EXPECT=baseline asserts the Codex refusal is reproduced.
//
// Harnesses: worker (vlab-worker, DeepSeek), vds (Codex app-server + DeepSeek),
// vcc (Claude Code). vcodex (Codex + ChatGPT) is the same Codex path with a
// different model; it is not run here because the candidate's copied ChatGPT
// refresh token is stale and refreshing it can revoke the account's token chain.
//
// VB_SCENARIO=blocked-user replays production 2026-10-06 17:44: a group member
// with no authorized device asked V to use Tianyi's browser, v_browser_devices
// returned [], and the agent fell back to browser profile="user" (an
// existing-session Chrome on V's own host), which can never connect and is
// reported as "enable remote debugging on your computer". Plugin 0.4.8 blocks
// that profile with the V Browser path; the sender here has no device either.
// VB_EXPECT=fixed asserts the block reached the model and no existing-session
// attach ran; VB_EXPECT=baseline asserts the attach failure is reproduced.
//
// Inputs (support files outside the repo, found by basename):
//   v-browser-plugin.tgz  `git archive <commit> openclaw-plugin` from the v-browser repo
//                         (baseline: same tree with core/session-lease-manager.js and
//                         index.js from the deployed 0.4.6, which still rewrite)
//   v-browser-src.tgz     broker/ + extension/ from v-browser 2f4a2a0 (production's
//                         broker server.js, sha256 2544ee7e…) plus node_modules/ws
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const expect = process.env.VB_EXPECT ?? "fixed";
assert(["fixed", "baseline"].includes(expect));
const scenario = process.env.VB_SCENARIO ?? "route";
assert(["route", "blocked-user"].includes(scenario), `unknown VB_SCENARIO ${scenario}`);
const HARNESSES = {
  worker: { model: "deepseek/deepseek-v4-flash", harness: /vlab-worker/u },
  // Shared VLab renamed the /vds key on 2026-10; deepseek/deepseek-flash now runs on the Worker.
  vds: { model: "deepseek/vds-deepseek-flash", harness: /codex/u },
  vcc: { model: "anthropic/claude-opus-5", harness: /claude-cli/u },
};
const only = (process.env.VB_HARNESSES ?? Object.keys(HARNESSES).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
for (const h of only) assert(HARNESSES[h], `unknown harness ${h}`);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const RELAY_HOST = "100.75.190.64"; // VLab's own tailnet address, as production borrows the relay by address
const OWNER = "vbx-owner";
const DEVICE_LABEL = "VB cross-harness probe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), scenario, expect, harnesses: only, turns: {}, notes: [] };
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]");
  return out;
};
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
function freePort(host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, host, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function waitFor(probe, timeout, what) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try { const v = await probe(); if (v) return v; } catch (e) { last = e; }
    await sleep(250);
  }
  throw new Error(`${what} did not become ready${last ? `: ${last.message}` : ""}`);
}
function findInput(name) {
  const hits = spawnSync("find", [process.cwd(), "-name", name, "-type", "f"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  assert.equal(hits.length, 1, `expected exactly one input ${name}, found ${hits.length}`);
  return hits[0];
}

// ---------------------------------------------------------------- inputs
const vb = path.join(data, "vb");
fs.rmSync(vb, { recursive: true, force: true });
fs.mkdirSync(vb, { recursive: true });
const pluginTgz = findInput(process.env.VB_PLUGIN_TGZ ?? "v-browser-plugin.tgz");
const srcTgz = findInput(process.env.VB_SRC_TGZ ?? "v-browser-src.tgz");
for (const tgz of [pluginTgz, srcTgz]) assert.equal(spawnSync("tar", ["xzf", tgz, "-C", vb]).status, 0, `extract ${tgz}`);
const pluginDir = path.join(vb, "openclaw-plugin");
const pluginPkg = JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf8"));
summary.plugin = { version: pluginPkg.version, tgzSha256: crypto.createHash("sha256").update(fs.readFileSync(pluginTgz)).digest("hex") };
fs.mkdirSync(path.join(pluginDir, "node_modules"), { recursive: true });
fs.symlinkSync(path.join(runtime, "openclaw", "node_modules", "typebox"), path.join(pluginDir, "node_modules", "typebox"));
const brokerServerJs = path.join(vb, "broker", "server.js");
summary.broker = { serverSha256: crypto.createHash("sha256").update(fs.readFileSync(brokerServerJs)).digest("hex") };
const extensionDir = path.join(vb, "extension");
assert(fs.existsSync(path.join(extensionDir, "manifest.json")), "extension source missing");

// ---------------------------------------------------------------- page with a secret only the rendered DOM shows
const secretsServed = new Map();
const page = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const h = url.searchParams.get("h") ?? "";
  if (url.pathname === "/fixture") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(`<!doctype html><title>VB fixture ${h}</title><body><h1>VB fixture ${h}</h1><p id="s">loading</p><script>
fetch('/secret?h=${encodeURIComponent(h)}').then(r=>r.text()).then(t=>{document.getElementById('s').textContent='Secret: '+t;});</script></body>`);
    return;
  }
  if (url.pathname === "/secret") {
    // Served once per harness: a model that fetches the page itself never sees it.
    if (secretsServed.has(h)) { res.writeHead(410).end("gone"); return; }
    const value = `VBX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    secretsServed.set(h, value);
    res.writeHead(200, { "content-type": "text/plain" }).end(value);
    return;
  }
  res.writeHead(404).end();
});
page.listen(0, "127.0.0.1");
await once(page, "listening");
const pageBase = `http://127.0.0.1:${page.address().port}`;

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(config.gateway?.auth?.token);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const relayPort = await freePort();
const proxyPort = await freePort(RELAY_HOST);
const relayToken = crypto.randomBytes(32).toString("hex");
const adminToken = crypto.randomBytes(32).toString("hex");
secrets.add(relayToken); secrets.add(adminToken);
fs.mkdirSync(path.join(stateDir, "credentials"), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(stateDir, "credentials", "browser-extension-relay.secret"), relayToken, { mode: 0o600 });
const adminTokenFile = path.join(vb, "broker-admin-token");
fs.writeFileSync(adminTokenFile, adminToken, { mode: 0o600 });

const runId = Date.now().toString(36);
const senders = Object.fromEntries(only.map((h) => [h, `ou_vbx_${h}_${runId}`]));
const pluginEntry = (brokerUrl) => ({
  enabled: true,
  hooks: { allowConversationAccess: true },
  config: {
    brokerUrl, adminTokenFile, profilePrefix: "vbrowser-", leaseTtlMs: 300_000, autoAcquireSingleDevice: false,
    // `openclaw agent --session-key` runs carry no sender; real Feishu turns do.
    sessionKeyActorFallback: true,
    // blocked-user: like the production group member, the sender owns no device.
    principalAliases: scenario === "blocked-user" ? {} : Object.fromEntries(Object.values(senders).map((s) => [`feishu:${s}`, OWNER])),
    traceLifecycle: true,
  },
});
const isOldPlugin = (p) => /\/v-browser\/releases\/[^/]+\/openclaw-plugin$/u.test(p);
function wirePlugin(cfg, brokerUrl) {
  cfg.plugins ??= {};
  cfg.plugins.load ??= {};
  const before = cfg.plugins.load.paths ?? [];
  cfg.plugins.load.paths = [...before.filter((p) => !isOldPlugin(p)), pluginDir];
  if (Array.isArray(cfg.plugins.allow) && !cfg.plugins.allow.includes("v-browser-device")) cfg.plugins.allow.push("v-browser-device");
  cfg.plugins.entries ??= {};
  cfg.plugins.entries["v-browser-device"] = pluginEntry(brokerUrl);
  return before.filter(isOldPlugin);
}
// Main Gateway hosts the relay (production: a separate Browser Gateway); the Worker
// borrows it by address exactly like production's main config does.
const ssrf = (cfg) => ({ ...(cfg.browser?.ssrfPolicy ?? {}), allowedHostnames: [...new Set([...(cfg.browser?.ssrfPolicy?.allowedHostnames ?? []), "127.0.0.1", "localhost", RELAY_HOST])] });
const brokerAdminPort = await freePort();
const brokerPublicPort = await freePort();
const brokerUrl = `http://127.0.0.1:${brokerAdminPort}`;
summary.notes.push(`replaced plugin load paths: ${JSON.stringify(wirePlugin(config, brokerUrl))}`);
config.browser = { ...(config.browser ?? {}), enabled: true, ssrfPolicy: ssrf(config), profiles: { ...(config.browser?.profiles ?? {}), "vbrowser-01": { driver: "extension", cdpPort: relayPort, attachOnly: true } } };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const h of only) if (!allow.includes(HARNESSES[h].model)) allow.push(HARNESSES[h].model);
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
// The Worker child reads its own config copy (memory: v-worker-config-second-file).
const workerJson = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
wirePlugin(workerJson, brokerUrl);
workerJson.browser = { ...(workerJson.browser ?? {}), enabled: true, ssrfPolicy: ssrf(workerJson), profiles: { ...(workerJson.browser?.profiles ?? {}), "vbrowser-01": { cdpUrl: `http://vbrowser:${relayToken}@${RELAY_HOST}:${proxyPort}`, attachOnly: true } } };
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerJson, null, 2)}\n`, { mode: 0o600 });

// /vds on production V runs the Codex plugin with three DeepSeek patches (provider allow-list,
// code mode off, direct dynamic tools). Shared VLab state has them; the candidate state copy may
// not, so apply the identical anchors idempotently (same as vds-codex-switch).
if (only.includes("vds")) {
  // The main Gateway resolves its managed npm plugins (Codex among them) under the state dir.
  // The candidate state copy has none, so it would fall back to the shared runtime's unpatched
  // generation. Give it a private copy of the shared state's install instead.
  const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
  if (!fs.existsSync(path.join(stateDir, "npm")) && fs.existsSync(sharedNpm)) {
    assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
    summary.notes.push("copied shared state npm plugins into the candidate state");
  }
  const codexDists = [path.join(stateDir, "npm", "projects"), path.join(runtime, "npm", "projects")]
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => fs.readdirSync(dir).filter((d) => d.startsWith("openclaw-codex-")).map((d) => path.join(dir, d, "node_modules", "@openclaw", "codex", "dist")))
    .filter((dir) => fs.existsSync(dir))
    // Only generations that carry the Codex harness module (V runs g-b42d646e…).
    .filter((dir) => fs.readdirSync(dir).some((f) => /^harness-[^/]+\.js$/u.test(f) && fs.readFileSync(path.join(dir, f), "utf8").includes("DEFAULT_CODEX_HARNESS_PROVIDER_IDS = ")));
  assert(codexDists.length > 0, "candidate Codex plugin install not found");
  const patchOnce = (codexDist, re, pairs) => {
    const file = fs.readdirSync(codexDist).map((f) => path.join(codexDist, f)).find((f) => re.test(f) && pairs.some(([from, to]) => { const t = fs.readFileSync(f, "utf8"); return t.includes(from) || t.includes(to); }));
    assert(file, `codex module ${re} not found in ${codexDist}`);
    let src = fs.readFileSync(file, "utf8");
    let applied = 0;
    for (const [from, to] of pairs) {
      if (src.includes(to)) continue;
      assert.equal(src.split(from).length, 2, `patch anchor must match exactly once: ${from.slice(0, 60)}`);
      src = src.replace(from, to); applied += 1;
    }
    fs.writeFileSync(file, src);
    return `${path.relative(path.dirname(path.dirname(path.dirname(path.dirname(codexDist)))), file)}:+${applied}`;
  };
  summary.codexPatches = codexDists.flatMap((d) => [
    patchOnce(d, /\/harness-[^/]+\.js$/u, [
      ['new Set(["codex", "openai"]);', 'new Set(["codex", "openai", "deepseek"]);'],
      ['} else if (ctx.modelProvider && provider !== "codex" && !nativeAccountOwnsUnobservedModel) return {', '} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {'],
      ['if (ctx.modelProvider?.requestTransportOverrides === "present") return {', 'if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {'],
    ]),
    patchOnce(d, /\/run-attempt-[^/]+\.js$/u, [["nativeCodeModeEnabled: params.nativeToolSurfaceEnabled,", 'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",']]),
    patchOnce(d, /\/thread-lifecycle-[^/]+\.js$/u, [['return normalizeCodexModelId(modelId) === "gpt-5.4-nano";', 'const normalizedId = normalizeCodexModelId(modelId); return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");']]),
  ]);
}
// Codex app-server home for /vds: agent-scoped, DeepSeek provider (same as vds-codex-switch).
const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
if (only.includes("vds")) {
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- relay proxy (loopback CDP would be treated as local Chrome)
const proxySockets = new Set();
const proxy = http.createServer((request, response) => {
  const upstream = http.request({ host: "127.0.0.1", port: relayPort, path: request.url, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${relayPort}` } }, (result) => {
    const chunks = [];
    result.on("data", (c) => chunks.push(c));
    result.on("end", () => {
      const body = Buffer.concat(chunks).toString().replaceAll(`ws://127.0.0.1:${relayPort}/`, `ws://${RELAY_HOST}:${proxyPort}/`);
      const headers = { ...result.headers }; delete headers["transfer-encoding"]; headers["content-length"] = Buffer.byteLength(body);
      response.writeHead(result.statusCode, headers); response.end(body);
    });
  });
  upstream.on("error", () => { response.writeHead(502); response.end(); });
  request.pipe(upstream);
});
proxy.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(relayPort, "127.0.0.1", () => {
    const headers = { ...request.headers, host: `127.0.0.1:${relayPort}` };
    upstream.write(`GET ${request.url} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  for (const s of [socket, upstream]) { proxySockets.add(s); s.on("close", () => proxySockets.delete(s)); s.on("error", () => { socket.destroy(); upstream.destroy(); }); }
});
proxy.listen(proxyPort, RELAY_HOST);
await once(proxy, "listening");

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.vbx-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey; secrets.add(deepseekKey);
const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}

let broker, chrome, api;
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit").catch(() => {});
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(8_000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}
function connectPipe(child) {
  let sequence = 0, buffer = "";
  const pending = new Map();
  child.stdio[4].on("data", (chunk) => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf("\0")) >= 0;) {
      const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      const request = pending.get(value.id);
      if (!request) continue;
      pending.delete(value.id); clearTimeout(request.timer);
      if (value.error) request.reject(new Error(value.error.message)); else request.resolve(value.result);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`bootstrap CDP deadline: ${method}`)); }, 15_000);
        pending.set(id, { resolve, reject, timer });
        child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
      });
    },
  };
}

// Async on purpose: the Broker and the Chrome pipe live in this process.
function runTurn(h, prompt, timeoutSecs = 480) {
  const sessionKey = `agent:makaron:feishu:direct:${senders[h]}`;
  const mark = lines.length;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", HARNESSES[h].model, "--message", prompt, "--json", "--timeout", String(timeoutSecs)], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    const kill = setTimeout(() => child.kill("SIGKILL"), (timeoutSecs + 90) * 1000);
    child.on("exit", (code) => {
      clearTimeout(kill);
      let meta;
      try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { /* not json */ }
      const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
      resolve({
        sessionKey, exit: code, secs: Math.round((Date.now() - started) / 1000), startedAt: started,
        ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime ?? (agentMeta.provider === "claude-cli" ? "claude-cli" : undefined) } : null,
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 800),
        log: lines.slice(mark).map((l) => redact(l.line)),
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
// Codex keeps its own transcript: count the browser calls and what came back.
function codexBrowserCalls(since) {
  const out = [];
  const files = spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(codexHome, "sessions"))} -name 'rollout-*.jsonl' -newermt @${Math.floor(since / 1000) - 1} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const f of files) {
    const ids = new Map();
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      if (p.type === "function_call" && /browser/u.test(p.name ?? "")) ids.set(p.call_id, { name: p.name, args: String(p.arguments ?? "").slice(0, 200) });
      else if (p.type === "function_call_output" && ids.has(p.call_id)) out.push({ ...ids.get(p.call_id), output: redact(String(p.output ?? "")).slice(0, 240) });
    }
  }
  return out;
}

const PROMPT = (h) => [
  "这是一次自动化测试，请严格按步骤执行，只用下面提到的工具，不要用 exec、web_fetch、curl 或其他工具。",
  `1. 调用 v_browser_devices，找到 label 为「${DEVICE_LABEL}」的在线设备。`,
  `2. 调用 v_browser_tabs，找到标题为「VB fixture ${h}」的标签页。`,
  "3. 用这个 deviceId 和 tabId 调用 v_browser_acquire。",
  "4. 按 v_browser_acquire 返回的说明调用 browser 工具（先 action=tabs，再对这个页面 snapshot），读出页面正文里 “Secret:” 后面的那串字符。",
  "5. 调用 v_browser_release。",
  "6. 只回复一行：VB_OK <那串字符>。任何一步失败就回复 VB_FAIL 加上原样的错误信息。",
].join("\n");

const BLOCKED_PROMPT = (h) => [
  "这是一次自动化测试，请严格按步骤执行，只用下面提到的工具，不要用 exec、web_fetch、curl 或其他工具。",
  "1. 调用 v_browser_devices。",
  `2. 调用 browser 工具，参数 action="open"、profile="user"、url="${pageBase}/fixture?h=${h}"。`,
  "3. 不要重试，不要换别的 profile 或工具。",
  "4. 只回复一行：VB_RESULT 加上第 2 步 browser 返回内容的第一句话原文（报错就写报错原文）。",
].join("\n");
const BLOCKED_TEXT = /is disabled on V/gu;
const EXISTING_SESSION = /Chrome MCP existing-session attach|DevToolsActivePort|Enable remote debugging/gu;

const startedAt = Date.now();
startGateway();
try {
  await waitFor(async () => {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l.line))) { startGateway(); return false; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    return (await fetch(`http://127.0.0.1:${port}/health`)).ok;
  }, 900_000, "candidate Gateway");
  summary.gatewayReadyMs = Date.now() - startedAt;
  summary.envRoots = { HOME: process.env.HOME, OPENCLAW_HOME: process.env.OPENCLAW_HOME, stateDir, configDir: path.dirname(configPath) };
  summary.codexLoadLines = lines.filter((l) => /codex/iu.test(l.line)).slice(0, 15).map((l) => redact(l.line).slice(0, 300));
  summary.pluginLoadLines = lines.filter((l) => /v-browser|vBrowserTrace|plugins? \(|blocked plugin/iu.test(l.line)).slice(0, 12).map((l) => redact(l.line).slice(0, 300));

  // -------------------------------------------------------------- Broker + real extension
  const { createBrokerServer } = await import(brokerServerJs);
  const moduleDir = path.join(dist, "extensions", "browser", "chrome-extension", "modules");
  broker = createBrokerServer({
    host: "127.0.0.1", port: brokerPublicPort, adminPort: brokerAdminPort, adminToken,
    upstreamBaseUrl: `ws://127.0.0.1:${port}/browser/extension`, upstreamRelayToken: relayToken,
    upstreamRelayAuthModuleDir: fs.existsSync(moduleDir) ? moduleDir : null,
    slots: ["vbrowser-01"], statePath: path.join(vb, "broker.json"),
    logger: { warn: (m, v) => summary.notes.push(`broker warn: ${redact(m)} ${redact(v?.message ?? v?.reason ?? "")}`.slice(0, 300)), error: (m) => summary.notes.push(`broker error: ${redact(m)}`.slice(0, 300)), info: () => {}, log: () => {} },
  });
  const address = await broker.listen();
  api = async (route, method = "GET", body) => {
    const response = await fetch(address.adminHttpUrl + route, { method, headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(35_000) });
    const value = await response.json();
    assert(response.ok, `Broker ${response.status}: ${value.message ?? value.error}`);
    return value;
  };
  chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    `--user-data-dir=${path.join(vb, "chrome-profile")}`, "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { env: { ...process.env, TMPDIR: shortTmp }, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const pipe = connectPipe(chrome);
  const installed = await pipe.send("Extensions.loadUnpacked", { path: extensionDir });
  assert(installed.id, "extension did not load");
  // One tab per harness, created before pairing so a whole-browser grant covers them.
  for (const h of only) await pipe.send("Target.createTarget", { url: `${pageBase}/fixture?h=${h}` });
  const pairing = await api("/v1/pairings", "POST", { ownerUserId: OWNER });
  secrets.add(pairing.pairingString);
  const popup = await pipe.send("Target.createTarget", { url: `chrome-extension://${installed.id}/popup.html` });
  const session = await pipe.send("Target.attachToTarget", { targetId: popup.targetId, flatten: true });
  await waitFor(async () => (await pipe.send("Runtime.evaluate", { expression: "typeof chrome !== 'undefined' && !!chrome.runtime?.id", returnByValue: true }, session.sessionId)).result?.value === true, 20_000, "extension popup");
  const paired = await pipe.send("Runtime.evaluate", {
    expression: `chrome.runtime.sendMessage(${JSON.stringify({ type: "pair", pairingString: pairing.pairingString, consentScope: "browser", deviceLabel: DEVICE_LABEL })})`,
    awaitPromise: true, returnByValue: true,
  }, session.sessionId);
  assert.equal(paired.result?.value?.ok, true, `extension pairing failed: ${redact(JSON.stringify(paired.result?.value ?? paired.exceptionDetails ?? {})).slice(0, 300)}`);
  await pipe.send("Target.detachFromTarget", { sessionId: session.sessionId });
  await pipe.send("Target.closeTarget", { targetId: popup.targetId });
  const device = await waitFor(() => broker.deviceRegistry.listDevices({ actorUserId: OWNER }).find((d) => d.online), 30_000, "paired device");
  await waitFor(async () => {
    const { tabs } = await api(`/v1/devices/${device.deviceId}/tabs?actorUserId=${OWNER}`);
    return only.every((h) => tabs.some((t) => t.title === `VB fixture ${h}`));
  }, 30_000, "fixture tabs on the device");
  summary.device = { deviceId: device.deviceId, label: device.label, extensionId: installed.id };

  // -------------------------------------------------------------- one Session per harness
  for (const h of only) {
    const auditBefore = (await api("/v1/audit")).events.length;
    const turn = await runTurn(h, scenario === "blocked-user" ? BLOCKED_PROMPT(h) : PROMPT(h));
    const audit = (await api("/v1/audit")).events.slice(auditBefore).map((e) => ({ type: e.type, actorUserId: e.actorUserId, profile: e.profile }));
    const health = await waitFor(async () => { const x = await api("/health"); return x.activeRoutes === 0 && x; }, 60_000, "idle broker").catch(() => null);
    const want = secretsServed.get(h);
    const joined = turn.log.join("\n");
    // agentMeta names the provider, not always the runtime: take the runtime from the run itself.
    const runtimeSeen = turn.ran?.harness ?? (/\[vlab-worker:\d+\]/u.test(joined) ? "vlab-worker" : null);
    const result = {
      exit: turn.exit, secs: turn.secs, ran: turn.ran, runtimeSeen, reply: turn.reply, stderr: turn.stderr,
      secretServed: Boolean(want), replyHasSecret: Boolean(want && turn.reply.includes(want)),
      audit, brokerIdleAfter: Boolean(health),
      rewriteRefusals: (joined.match(/rewrote Codex app-server approval params/gu) ?? []).length,
      routeInstructionBlocks: (joined.match(/This Session controls a V Browser device/gu) ?? []).length,
      identityDenied: /no trusted Channel sender identity/u.test(joined) || /no trusted Channel sender identity/u.test(turn.reply),
      trace: turn.log.filter((l) => /vBrowserTrace/u.test(l)).slice(-6).map((l) => l.slice(0, 240)),
      blockedProfileHits: (joined.match(BLOCKED_TEXT) ?? []).length + (turn.reply.match(BLOCKED_TEXT) ?? []).length,
      existingSessionAttempts: (joined.match(EXISTING_SESSION) ?? []).length,
    };
    if (/codex/u.test(String(turn.ran?.harness)) || h === "vds") {
      result.codexBrowserCalls = codexBrowserCalls(turn.startedAt);
      if (result.codexBrowserCalls.length > 0) result.runtimeSeen = "codex"; // Codex's own transcript holds the calls
      result.rewriteRefusals += result.codexBrowserCalls.filter((c) => /rewrote Codex app-server/u.test(c.output)).length;
      result.routeInstructionBlocks += result.codexBrowserCalls.filter((c) => /This Session controls a V Browser device/u.test(c.output)).length;
      result.blockedProfileHits += result.codexBrowserCalls.filter((c) => /is disabled on V/u.test(c.output)).length;
      result.existingSessionAttempts += result.codexBrowserCalls.filter((c) => /existing-session attach|DevToolsActivePort|Enable remote debugging/u.test(c.output)).length;
    }
    if (scenario === "blocked-user" && result.existingSessionAttempts === 0 && /existing-session|remote debugging/iu.test(turn.reply)) result.existingSessionAttempts += 1;
    if (turn.exit !== 0 || (scenario === "route" && !result.replyHasSecret) || scenario === "blocked-user") result.logTail = turn.log.filter((l) => /browser|v_browser|hook|block|error|denied/iu.test(l)).slice(-20).map((l) => l.slice(0, 300));
    summary.turns[h] = result;
  }

  // -------------------------------------------------------------- verdict
  for (const h of only) {
    const t = summary.turns[h];
    assert.match(String(t.runtimeSeen), HARNESSES[h].harness, `${h}: ran on the wrong harness ${JSON.stringify(t.ran)}`);
    if (scenario === "blocked-user") {
      assert.equal(t.exit, 0, `${h}: agent turn failed: ${t.stderr}`);
      assert.equal(t.audit.filter((e) => e.type === "lease_acquired").length, 0, `${h}: a device was leased for a sender with no device`);
      if (expect === "fixed") {
        assert(t.blockedProfileHits > 0, `${h}: the profile block never reached the model: ${t.reply}`);
        assert.equal(t.existingSessionAttempts, 0, `${h}: an existing-session attach still ran`);
      } else {
        assert(t.existingSessionAttempts > 0, `${h}: baseline did not reproduce the existing-session failure: ${t.reply}`);
        assert.equal(t.blockedProfileHits, 0, `${h}: baseline plugin should not know the block`);
      }
      continue;
    }
    if (expect === "fixed") {
      assert.equal(t.exit, 0, `${h}: agent turn failed: ${t.stderr}`);
      assert.equal(t.rewriteRefusals, 0, `${h}: Codex refused a rewritten call`);
      assert(t.replyHasSecret, `${h}: reply does not carry the page secret: ${t.reply}`);
      assert(t.audit.some((e) => e.type === "lease_acquired" && e.actorUserId === OWNER), `${h}: no lease acquired for the owner`);
      assert(t.audit.some((e) => e.type === "lease_released"), `${h}: lease was not released`);
      assert(t.brokerIdleAfter, `${h}: broker still routing after the turn`);
    }
  }
  if (expect === "baseline" && scenario === "route") {
    // The rewriting plugin must reproduce the production refusal on the Codex harness.
    assert(only.includes("vds"), "baseline needs the vds harness");
    assert(summary.turns.vds.rewriteRefusals > 0, "baseline did not reproduce the Codex rewrite refusal");
  }
  summary.verdict = "pass";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-60).map((l) => l.line).join("\n")).slice(-6000);
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  await stopChild(chrome);
  await broker?.close().catch(() => {});
  for (const s of proxySockets) s.destroy();
  await new Promise((resolve) => proxy.close(resolve));
  page.close();
  await stopChild(gateway);
  fs.rmSync(path.join(vb, "chrome-profile"), { recursive: true, force: true });
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
