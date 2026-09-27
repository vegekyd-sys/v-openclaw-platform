// Candidate end-to-end for the three handoff layers on a private Gateway:
//
//   A. desktop   — start-desktop.sh brings up Xtigervnc + XFCE on a free display
//   B. service   — v-desktop-handoff talks to that real Xtigervnc (VncAuth, ServerInit 1280x800)
//   C. visible   — the Gateway's browser tool opens a page and the Chrome window is on that display
//   D. control   — an observer's keystrokes never reach the page; the controller's do;
//                  the Gateway's native desktop.observe works against the same display
//   E. agent     — a real agent turn calls desktop_handoff_request and replies with the link;
//                  while a human holds control, the agent's browser writes are blocked, reads pass
//   F. metrics   — RSS of the desktop stack and bytes streamed to one viewer
//
// Every scenario asserts the positive behaviour and, where there is a failure
// path, that the failure path was actually exercised.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { openViewer } from "../../apps/v-desktop-handoff/service/tests/rfb-client.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const inputs = process.cwd();
const APP = path.join(inputs, "apps", "v-desktop-handoff");
const only = (process.env.DESKTOP_HANDOFF_SCENARIOS ?? "desktop,service,visible,control,native-observe,agent-request,agent-blocked,metrics").split(",").map((s) => s.trim()).filter(Boolean);
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), scenarios: {}, notes: [] };
const children = [];

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function freeDisplay() {
  for (let n = 150; n < 200; n += 1) {
    if (!fs.existsSync(`/tmp/.X${n}-lock`) && !fs.existsSync(`/tmp/.X11-unix/X${n}`)) {
      const probe = spawnSync("xdpyinfo", ["-display", `:${n}`], { stdio: "ignore" });
      if (probe.status !== 0) return n;
    }
  }
  throw new Error("no free X display between :150 and :199");
}
function rss(pid) {
  try {
    return Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/u)?.[1] ?? 0);
  } catch { return 0; }
}
function environOf(pid) {
  try {
    return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
  } catch { return {}; }
}
function pgrep(pattern) {
  const r = spawnSync("pgrep", ["-af", pattern], { encoding: "utf8" });
  return r.stdout.split("\n").filter(Boolean).map((line) => ({ pid: Number(line.split(" ")[0]), cmd: line.slice(line.indexOf(" ") + 1) }));
}
function xwindows(display) {
  const r = spawnSync("xwininfo", ["-root", "-tree", "-display", `:${display}`], { encoding: "utf8" });
  const out = [];
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^\s*0x[0-9a-f]+ "([^"]*)": \(("[^"]*")?\s*("[^"]*")?\)\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+\+(-?\d+)\+(-?\d+)/u);
    if (m) out.push({ title: m[1], klass: m[3]?.replaceAll('"', "") ?? "", w: Number(m[4]), h: Number(m[5]), x: Number(m[8]), y: Number(m[9]) });
  }
  return out;
}

// ---------------------------------------------------------------- A. desktop
const display = freeDisplay();
const rfbPort = await freePort();
const desktopState = path.join(data, "desktop");
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(data, dir), { recursive: true, mode: 0o700 });
const desktopLog = [];
const desktop = spawn("bash", [path.join(APP, "desktop", "start-desktop.sh")], {
  env: { ...process.env, DESKTOP_STATE_DIR: desktopState, DESKTOP_DISPLAY: String(display), DESKTOP_RFB_PORT: String(rfbPort), DESKTOP_NAME: "V candidate", HOME: process.env.HOME ?? data },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
children.push(desktop);
for (const s of [desktop.stdout, desktop.stderr]) s.setEncoding("utf8"), s.on("data", (c) => desktopLog.push(...c.split("\n").filter(Boolean)));
{
  const deadline = Date.now() + 30_000;
  while (!desktopLog.some((l) => l.startsWith("desktop ready"))) {
    assert(desktop.exitCode === null, `desktop script exited: ${desktopLog.slice(-10).join("\n")}`);
    assert(Date.now() < deadline, `desktop not ready: ${desktopLog.slice(-10).join("\n")}`);
    await sleep(250);
  }
  await sleep(3_000); // let xfwm4 and the panel map
  const windows = xwindows(display);
  const xpid = pgrep(`Xtigervnc :${display} `)[0]?.pid;
  summary.scenarios.desktop = {
    display: `:${display}`, rfbPort, xtigervncPid: xpid,
    xfwm4: windows.some((w) => w.klass === "Xfwm4"), panel: windows.some((w) => w.klass === "Xfce4-panel"),
    lockerRunning: pgrep("light-locker").filter((p) => environOf(p.pid).DISPLAY === `:${display}`).length > 0,
  };
  assert(xpid, "Xtigervnc is not running");
  assert(summary.scenarios.desktop.xfwm4 && summary.scenarios.desktop.panel, "XFCE session did not come up");
  assert.equal(summary.scenarios.desktop.lockerRunning, false, "light-locker must not run on the headless desktop");
}

// ---------------------------------------------------------------- B. service
const serviceState = path.join(data, "handoff-service");
fs.mkdirSync(serviceState, { recursive: true, mode: 0o700 });
const adminTokenFile = path.join(serviceState, "admin-token");
fs.writeFileSync(adminTokenFile, `${Buffer.from(String(Math.random())).toString("base64url")}${Date.now()}\n`, { mode: 0o600 });
const serviceConfig = path.join(serviceState, "config.json");
fs.writeFileSync(serviceConfig, JSON.stringify({
  bind: "127.0.0.1", publicPort: 0, adminPort: 0, publicBaseUrl: "http://127.0.0.1", pathPrefix: "/desktop-handoff",
  novncDir: "/usr/share/novnc", stateDir: path.join(serviceState, "state"), adminTokenFile, title: "V candidate 桌面",
  vnc: { host: "127.0.0.1", port: rfbPort, passwordFile: path.join(desktopState, "vnc-password.txt") },
  limits: { claimTtlMs: 600_000, sessionTtlMs: 1_800_000, idleControlMs: 300_000, maxViewers: 4, maxClaims: 5 },
}, null, 2));
const serviceLog = [];
const service = spawn(process.execPath, [path.join(APP, "service", "server.mjs"), serviceConfig], { stdio: ["ignore", "pipe", "pipe"] });
children.push(service);
for (const s of [service.stdout, service.stderr]) s.setEncoding("utf8"), s.on("data", (c) => serviceLog.push(...c.split("\n").filter(Boolean)));
let ports;
{
  const deadline = Date.now() + 10_000;
  while (!ports) {
    const line = serviceLog.find((l) => l.includes('"listening"'));
    if (line) ports = JSON.parse(line);
    assert(service.exitCode === null, `service exited: ${serviceLog.join("\n")}`);
    assert(Date.now() < deadline, "service did not start");
    await sleep(100);
  }
}
const adminToken = fs.readFileSync(adminTokenFile, "utf8").trim();
const admin = async (method, route, body) => {
  const res = await fetch(`http://127.0.0.1:${ports.adminPort}${route}`, { method, headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const pub = async (method, route, body) => {
  const res = await fetch(`http://127.0.0.1:${ports.publicPort}/desktop-handoff${route}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const tokenOf = (url) => new URL(url).hash.slice(1);
const wsUrl = (viewer) => `ws://127.0.0.1:${ports.publicPort}/desktop-handoff/ws?viewer=${encodeURIComponent(viewer)}`;
async function readServerMessage(client) {
  // Consume one FramebufferUpdate (raw / CopyRect / DesktopSize rects only: we only advertise those).
  const first = await client.read(1);
  let bytes = 1;
  if (first[0] === 2) return { type: 2, bytes }; // Bell
  if (first[0] === 3) { // ServerCutText
    const rest = await client.read(7);
    const len = rest.readUInt32BE(3);
    await client.read(len);
    return { type: 3, bytes: bytes + 7 + len };
  }
  if (first[0] !== 0) throw new Error(`unexpected server message ${first[0]}`);
  const head = await client.read(3);
  bytes += 3;
  const rects = head.readUInt16BE(1);
  for (let i = 0; i < rects; i += 1) {
    const rect = await client.read(12);
    bytes += 12;
    const w = rect.readUInt16BE(4), h = rect.readUInt16BE(6), enc = rect.readInt32BE(8);
    if (enc === 0) { await client.read(w * h * 4); bytes += w * h * 4; }
    else if (enc === 1) { await client.read(4); bytes += 4; }
    else if (enc === -223 || enc === -224) { /* no payload */ }
    else throw new Error(`unexpected encoding ${enc}`);
  }
  return { type: 0, rects, bytes };
}
{
  const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "candidate:probe", reason: "service probe" });
  assert.equal(issued.status, 201);
  const claim = await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) });
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  const viewer = await openViewer(wsUrl(claim.body.viewer));
  const init = await viewer.handshake();
  viewer.setEncodings([0, 1, -223]);
  viewer.requestUpdate();
  const first = await readServerMessage(viewer);
  summary.scenarios.service = { ports, serverInit: init, firstUpdateRects: first.rects, firstUpdateBytes: first.bytes };
  assert.equal(init.width, 1280);
  assert.equal(init.height, 800);
  assert.equal(init.name, "V candidate");
  assert(first.rects >= 1, "no framebuffer update from the real Xtigervnc");
  const page = await fetch(`http://127.0.0.1:${ports.publicPort}/desktop-handoff/`);
  const rfbjs = await fetch(`http://127.0.0.1:${ports.publicPort}/desktop-handoff/novnc/core/rfb.js`);
  summary.scenarios.service.viewerPage = page.status;
  summary.scenarios.service.novncServed = rfbjs.status;
  assert.equal(page.status, 200);
  assert.equal(rfbjs.status, 200, "noVNC must be served from /usr/share/novnc");
  viewer.close();
  await viewer.closed;
  await admin("DELETE", `/v1/handoffs/${issued.body.id}`);
}

// ---------------------------------------------------------------- test web page
const typed = [];
const hits = [];
const web = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  hits.push(url.pathname);
  if (url.pathname === "/typed") {
    typed.push({ at: Date.now(), value: url.searchParams.get("v") ?? "" });
    res.writeHead(204).end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><title>V handoff test</title><body style="margin:0"><input id="login" autofocus placeholder="type here" style="position:fixed;inset:0;width:100%;height:100%;font-size:48px;border:0;background:#fff8dc"><script>
const i=document.getElementById('login');i.focus();i.addEventListener('input',()=>fetch('/typed?v='+encodeURIComponent(i.value)));document.addEventListener('click',()=>i.focus());</script></body>`);
});
await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
const webUrl = `http://127.0.0.1:${web.address().port}/login.html`;

// ---------------------------------------------------------------- private Gateway config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
workerPlugin.gatewayConfigPath = configPath;
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const ref of ["deepseek/deepseek-v4-flash"]) if (!allow.includes(ref)) allow.push(ref);

// Layer A wiring: the desktop is attached, the browser is headed on that display.
config.desktop = { host: { enabled: true, port: rfbPort, passwordFile: path.join(desktopState, "vncpasswd") } };
config.browser = {
  ...(config.browser ?? {}),
  enabled: true,
  defaultProfile: "openclaw",
  headless: false,
  noSandbox: true,
  extraArgs: ["--window-position=0,0", "--window-size=1280,760", "--no-first-run", "--no-default-browser-check", "--enable-logging", `--log-file=${path.join(data, "chrome.log")}`, "--v=0"],
  // The test page is served on loopback; the default SSRF policy blocks it (same key V uses for its CDP hosts).
  ssrfPolicy: { ...(config.browser?.ssrfPolicy ?? {}), allowedHostnames: [...new Set([...(config.browser?.ssrfPolicy?.allowedHostnames ?? []), "127.0.0.1", "localhost"])] },
};
// The managed "openclaw" profile is built in: declaring it under profiles is rejected
// (it would need cdpPort/cdpUrl and forbids userDataDir). Its user data lives under the
// candidate's private state dir.
delete config.browser.profiles?.openclaw;
// Layer C wiring: the plugin, loaded from the candidate inputs.
const pluginDir = path.join(APP, "plugin");
fs.mkdirSync(path.join(pluginDir, "node_modules"), { recursive: true });
const typebox = path.join(runtime, "openclaw", "node_modules", "typebox");
if (!fs.existsSync(path.join(pluginDir, "node_modules", "typebox"))) fs.symlinkSync(typebox, path.join(pluginDir, "node_modules", "typebox"));
config.plugins.load ??= {};
config.plugins.load.paths = [...(config.plugins.load.paths ?? []), pluginDir];
if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("v-desktop-handoff")) config.plugins.allow.push("v-desktop-handoff");
const handoffPluginEntry = {
  enabled: true,
  hooks: { allowConversationAccess: true },
  config: { adminUrl: `http://127.0.0.1:${ports.adminPort}`, adminTokenFile, cliActorUserId: "cli:candidate", trustCliAsDirect: true, sessionKeyActorFallback: true },
};
config.plugins.entries["v-desktop-handoff"] = handoffPluginEntry;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
// The worker child reads its own config copy (memory: v-worker-config-second-file), so the
// tool and the before_tool_call hook must be declared there too, plus the headed browser.
const workerJson = JSON.parse(workerConfig);
workerJson.plugins ??= {};
workerJson.plugins.load ??= {};
workerJson.plugins.load.paths = [...new Set([...(workerJson.plugins.load.paths ?? []), pluginDir])];
if (Array.isArray(workerJson.plugins.allow) && !workerJson.plugins.allow.includes("v-desktop-handoff")) workerJson.plugins.allow.push("v-desktop-handoff");
workerJson.plugins.entries ??= {};
workerJson.plugins.entries["v-desktop-handoff"] = handoffPluginEntry;
workerJson.desktop = config.desktop;
workerJson.browser = config.browser;
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerJson, null, 2)}\n`, { mode: 0o600 });
summary.notes.push(`worker config declares the plugin: ${workerPlugin.workerConfigPath}`);

// Chrome puts its SingletonSocket under TMPDIR; unix socket paths are capped at
// 108 bytes and the candidate data dir alone is ~95, so Chrome would exit at once.
const shortTmp = `/tmp/.v-desktop-cand-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: shortTmp,
  XDG_CACHE_HOME: path.join(data, "cache"),
  DISPLAY: `:${display}`,
};
for (const name of ["DEEPSEEK_API_KEY"]) {
  const value = secret(name);
  if (value) env[name] = value;
}

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(gateway);
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timeout); resolve(); }, onConnectError: (error) => { clearTimeout(timeout); reject(error); } });
        client.start();
      });
      return;
    } catch (error) {
      lastError = error;
      client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
function browserCli(...args) {
  const r = spawnSync(process.execPath, [`${dist}/index.js`, "browser", "--browser-profile", "openclaw", ...args], { env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status, stdout: redact(r.stdout).slice(-1500), stderr: redact(r.stderr).slice(-1500) };
}
function chromeProcesses() {
  return pgrep("google-chrome|chrome/chrome|/opt/google/chrome").filter((p) => !/--type=/u.test(p.cmd));
}
function runTurn(name, prompt, { timeout = 420 } = {}) {
  const sessionKey = `agent:makaron:feishu:direct:ou_handoff_${name.replace(/\W/gu, "_")}_${Date.now()}`;
  const mark = lines.length;
  const started = Date.now();
  const r = spawnSync(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", "deepseek/deepseek-v4-flash", "--message", prompt, "--json", "--timeout", String(timeout)], { env, encoding: "utf8", timeout: (timeout + 60) * 1000, maxBuffer: 64 * 1024 * 1024 });
  let meta;
  try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { /* not json */ }
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  return {
    name, sessionKey, exit: r.status, secs: Math.round((Date.now() - started) / 1000),
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime } : null,
    reply: redact(String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 600),
    log: lines.slice(mark).map((l) => redact(l.line)),
    stderr: r.status === 0 ? undefined : redact(`${r.stderr}`).slice(-800),
  };
}

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  summary.gatewayReadyMs = Date.now() - startedAt;

  // -------------------------------------------------------------- C. visible
  if (only.includes("visible")) {
    const opened = browserCli("open", webUrl);
    await sleep(4_000);
    const windows = xwindows(display).filter((w) => /chrome/iu.test(w.klass) || /handoff test/iu.test(w.title));
    const chromes = chromeProcesses().map((p) => ({ pid: p.pid, display: environOf(p.pid).DISPLAY, headless: /--headless/u.test(p.cmd), userDataDir: p.cmd.match(/--user-data-dir=(\S+)/u)?.[1] ?? null }));
    let chromeLog = null;
    try { chromeLog = fs.readFileSync(path.join(data, "chrome.log"), "utf8").split("\n").slice(-40); } catch { /* no log */ }
    const allChrome = pgrep("chrome").map((p) => ({ pid: p.pid, cmd: redact(p.cmd).slice(0, 400), display: environOf(p.pid).DISPLAY ?? null }));
    summary.scenarios.visible = { open: opened, chromeWindows: windows, chromeProcesses: chromes, pageHits: hits.filter((h) => h === "/login.html").length, chromeLog, allChrome, gatewayDisplay: environOf(gateway.pid).DISPLAY ?? null, gatewayBrowserLog: lines.filter((l) => /browser|chrome/iu.test(l.line)).slice(-12).map((l) => redact(l.line).slice(0, 400)) };
    assert.equal(opened.status, 0, `browser open failed: ${opened.stderr}`);
    assert(windows.length > 0, "no Chrome window on the desktop display");
    assert(chromes.some((c) => c.display === `:${display}` && !c.headless), "Chrome is not a headed process on the candidate display");
    assert(hits.includes("/login.html"), "the test page was never loaded");
  }

  // -------------------------------------------------------------- D. control
  if (only.includes("control")) {
    const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "candidate:tianyi", sessionKey: "agent:makaron:feishu:direct:candidate", reason: "login test" });
    const claim = await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) });
    const viewer = await openViewer(wsUrl(claim.body.viewer));
    await viewer.handshake();
    viewer.setEncodings([0, 1, -223]);
    const win = xwindows(display).find((w) => /chrome/iu.test(w.klass) && w.w > 200);
    assert(win, "Chrome window geometry not found");
    const cx = win.x + Math.floor(win.w / 2), cy = win.y + Math.floor(win.h / 2);
    const typeText = (text) => { for (const ch of text) { viewer.key(ch.charCodeAt(0), true); viewer.key(ch.charCodeAt(0), false); } };
    const clickAt = (x, y) => { viewer.pointer(x, y, 0); viewer.pointer(x, y, 1); viewer.pointer(x, y, 0); };
    typed.length = 0;
    clickAt(cx, cy); typeText("obs");
    await sleep(2_000);
    const observerTyped = typed.map((t) => t.value);
    const take = await pub("POST", "/api/control", { viewer: claim.body.viewer, take: true });
    assert.equal(take.body.role, "controller");
    clickAt(cx, cy); typeText("ok1");
    await sleep(3_000);
    const controllerTyped = typed.map((t) => t.value);
    const state = await admin("GET", "/v1/state");
    const release = await pub("POST", "/api/control", { viewer: claim.body.viewer, take: false });
    typeText("zz");
    await sleep(1_500);
    const afterRelease = typed.map((t) => t.value);
    summary.scenarios.control = { handoffId: issued.body.id, clickAt: [cx, cy], observerTyped, controllerTyped, afterRelease, controlActiveWhileHeld: state.body.controlActive, releaseRole: release.body.role };
    assert.deepEqual(observerTyped, [], "observer keystrokes reached the page");
    assert(controllerTyped.some((v) => v.includes("ok1")), `controller keystrokes did not reach the page: ${JSON.stringify(controllerTyped)}`);
    assert.equal(state.body.controlActive, true);
    assert(!afterRelease.some((v) => v.includes("zz")), "keystrokes after release reached the page");
    viewer.close();
    await viewer.closed;
    await admin("DELETE", `/v1/handoffs/${issued.body.id}`);
  }

  // -------------------------------------------------------------- D2. native observe
  if (only.includes("native-observe")) {
    let observe;
    let error;
    try {
      observe = await client.request("desktop.observe", { source: { kind: "host" }, control: false }, { timeoutMs: 15_000 });
    } catch (e) {
      error = String(e?.message ?? e);
    }
    summary.scenarios.nativeObserve = observe ? { transport: observe.transport, wsPath: String(observe.wsPath).replace(/token=.*/u, "token=[redacted]"), auth: observe.auth, control: observe.control } : { error };
    assert(observe?.wsPath, `desktop.observe failed: ${error}`);
  }

  // -------------------------------------------------------------- E. agent
  if (only.includes("agent-request")) {
    const before = (await admin("GET", "/v1/audit?limit=1000")).body.entries.length;
    const turn = runTurn("request", "这是一次自动化测试，请严格照做。第一步：立即调用 desktop_handoff_request 工具，参数 reason 填 \"需要你登录测试站点\"。第二步：把工具返回的 url 原样写在回复里，然后只补一句“请打开后接管”。不要做别的事。");
    const audit = (await admin("GET", "/v1/audit?limit=1000")).body.entries.slice(before);
    const issued = audit.filter((e) => e.event === "issued");
    summary.scenarios.agentRequest = { ...turn, log: turn.log.filter((l) => /desktop_handoff|handoff/iu.test(l)).slice(-8), issued: issued.map((e) => ({ ownerId: e.ownerId, kind: e.kind, sessionKey: e.sessionKey })) };
    assert.equal(turn.exit, 0, `agent turn failed: ${turn.stderr}`);
    assert(issued.length >= 1, "the agent turn did not issue a handoff");
    assert.equal(issued[0].ownerId, `feishu:${turn.sessionKey.split(":").at(-1)}`, "owner must come from the trusted actor, not the model");
    assert.equal(issued[0].sessionKey, turn.sessionKey);
    assert(/\/desktop-handoff\/#[A-Za-z0-9_-]{20,}/u.test(turn.reply), `reply does not carry the link: ${turn.reply}`);
    for (const e of issued) await admin("DELETE", `/v1/handoffs/${e.id}`).catch(() => {});
  }
  if (only.includes("agent-blocked")) {
    const issued = await admin("POST", "/v1/handoffs", { kind: "control", ownerId: "candidate:tianyi", reason: "block test" });
    const claim = await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) });
    const viewer = await openViewer(wsUrl(claim.body.viewer));
    await viewer.handshake();
    assert.equal((await pub("POST", "/api/control", { viewer: claim.body.viewer, take: true })).body.role, "controller");
    const hitsBefore = hits.length;
    const blocked = runTurn("blocked", `这是一次自动化测试，请严格照做。第一步：调用 browser 工具，action 为 open，url 为 ${webUrl}?from=agent 。第二步：如果工具被拒绝，把拒绝原因原样写在回复里；如果成功，回复 OPENED。不要做别的事。`);
    const blockedLog = blocked.log.filter((l) => /handoff|blocked|block/iu.test(l)).slice(-8);
    const stillControlled = (await admin("GET", "/v1/state")).body.controlActive;
    const readOnly = runTurn("readonly", "这是一次自动化测试，请严格照做。调用 browser 工具，action 为 tabs。成功后只回复 TABS_OK 并附上标签页数量；被拒绝则原样写出拒绝原因。");
    viewer.close();
    await viewer.closed;
    await admin("DELETE", `/v1/handoffs/${issued.body.id}`);
    const unblocked = runTurn("unblocked", `这是一次自动化测试，请严格照做。调用 browser 工具，action 为 open，url 为 ${webUrl}?from=agent-after 。成功后只回复 OPENED；被拒绝则原样写出拒绝原因。`);
    summary.scenarios.agentBlocked = {
      whileControlled: { exit: blocked.exit, reply: blocked.reply, log: blockedLog, pageOpenedByAgent: hits.slice(hitsBefore).includes("/login.html") },
      readOnlyWhileControlled: { exit: readOnly.exit, reply: readOnly.reply },
      afterRelease: { exit: unblocked.exit, reply: unblocked.reply },
      stillControlled,
    };
    assert.equal(stillControlled, true, "control was lost during the blocked turn");
    assert(/controlling V's desktop|handoff/iu.test(blocked.reply) || blockedLog.some((l) => /controlling V's desktop/u.test(l)), `browser write was not blocked while a human controls: ${blocked.reply}`);
    assert.equal(summary.scenarios.agentBlocked.whileControlled.pageOpenedByAgent, false, "the agent opened the page although a human held control");
    assert(/TABS_OK/u.test(readOnly.reply), `read-only browser action failed while controlled: ${readOnly.reply}`);
    assert(/OPENED/u.test(unblocked.reply), `browser write still blocked after release: ${unblocked.reply}`);
  }

  // -------------------------------------------------------------- F. metrics
  if (only.includes("metrics")) {
    const stack = [...pgrep(`Xtigervnc :${display} `), ...pgrep("xfce4-session|xfwm4|xfce4-panel|xfdesktop|xfsettingsd").filter((p) => environOf(p.pid).DISPLAY === `:${display}`)];
    const chromes = pgrep("google-chrome|chrome/chrome").filter((p) => environOf(p.pid).DISPLAY === `:${display}`);
    const issued = await admin("POST", "/v1/handoffs", { kind: "watch", ownerId: "candidate:metrics" });
    const claim = await pub("POST", "/api/claim", { token: tokenOf(issued.body.url) });
    const viewer = await openViewer(wsUrl(claim.body.viewer));
    await viewer.handshake();
    viewer.setEncodings([0, 1, -223]);
    // Incremental requests only get an answer when the screen changes, so a
    // static desktop can block forever: race every read against the deadline.
    let bytes = 0;
    let updates = 0;
    const until = Date.now() + 20_000;
    viewer.requestUpdate();
    while (Date.now() < until) {
      const msg = await Promise.race([readServerMessage(viewer), sleep(until - Date.now()).then(() => null)]);
      if (!msg) break;
      bytes += msg.bytes;
      if (msg.type === 0) { updates += 1; viewer.requestUpdate(); }
    }
    viewer.close();
    await viewer.closed;
    await admin("DELETE", `/v1/handoffs/${issued.body.id}`);
    summary.scenarios.metrics = {
      desktopRssKb: stack.map((p) => ({ cmd: p.cmd.split(" ")[0], rssKb: rss(p.pid) })),
      desktopRssTotalMb: Math.round(stack.reduce((n, p) => n + rss(p.pid), 0) / 1024),
      chromeRssTotalMb: Math.round(chromes.reduce((n, p) => n + rss(p.pid), 0) / 1024),
      chromeProcesses: chromes.length,
      viewerBytesPer20sIdle: bytes,
      viewerUpdatesPer20sIdle: updates,
      serviceRssMb: Math.round(rss(service.pid) / 1024),
    };
  }
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
} catch (error) {
  summary.error = String(error?.stack ?? error);
  summary.gatewayTail = redact(lines.slice(-80).map((l) => l.line).join("\n"));
  summary.serviceTail = serviceLog.slice(-30).map(redact);
  summary.desktopTail = desktopLog.slice(-20);
  console.log(JSON.stringify(summary, null, 1));
  throw error;
} finally {
  client?.stop();
  web.close();
  for (const p of chromeProcesses()) { try { process.kill(p.pid, "SIGTERM"); } catch { /* gone */ } }
  gateway?.kill("SIGTERM");
  service.kill("SIGTERM");
  try { process.kill(-desktop.pid, "SIGTERM"); } catch { /* gone */ }
  await sleep(3_000);
  for (const c of children) if (c.exitCode === null) { try { c.kill("SIGKILL"); } catch { /* gone */ } }
  try { process.kill(-desktop.pid, "SIGKILL"); } catch { /* gone */ }
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
