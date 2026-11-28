// Candidate test for browser-lifecycle-unwedge-v1 on the VLab runtime (V's 9.1 bytes), with a real
// managed Chrome and the browser_fill_secret path (apps/v-browser-fill's fillSecret + native bindings, the
// same in-process dispatcher the tool uses in the Gateway).
//
// 1. control: open a local login page on the managed "openclaw" profile, snapshot it, store a LOGIN_ secret,
//    fill it with fillSecret, click 登录; the site must receive the stored value.
// 2. wedge, as on V 2026-11-27: one admitted operation on the profile ignores cancellation (it never
//    settles) and a "managed Chrome restart required" transition begins - what ensureBrowserAvailable does
//    when the running Chrome looks unreachable, e.g. during a Gateway event-loop stall.
// 3. every later request gets browser.request's 45 s deadline: GET /profiles, GET / (status), GET /tabs.
//    EXPECT=wedge (base bytes): they all time out and still do a minute later.
//    EXPECT=recover (patched): they answer, and the whole fill flow of step 1 works again.
// No model, no Gateway; secrets are random test values and never printed.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath, "candidate runtime environment is required");
const EXPECT = process.env.EXPECT ?? "recover";
assert(["wedge", "recover"].includes(EXPECT), `EXPECT=${EXPECT}`);
const dist = path.join(runtime, "openclaw", "dist");
const SITE = "fill.localhost";
const PROFILE = "openclaw";
const DEADLINE_MS = 45_000; // browser.request's deadline on V
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
const log = (msg, extra) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);

// ---- configuration: only the managed profile, headless, the test site allowed ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.browser = {
  enabled: true, defaultProfile: PROFILE, headless: true, noSandbox: true, tabCleanup: { enabled: false },
  ssrfPolicy: { allowedHostnames: [SITE, "127.0.0.1", "localhost"] },
};
if (config.plugins?.entries?.browser) config.plugins.entries.browser.enabled = true;
if (Array.isArray(config.plugins?.deny)) config.plugins.deny = config.plugins.deny.filter((id) => id !== "browser");
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- the test site ----
const received = [];
const site = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/login")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Fill Test 登录</title><h1>Fill Test 登录</h1>
<form method="post" action="/session"><label>账号 <input name="username" value="tianyi"></label><br>
<label>密码 <input name="password" type="password" aria-label="密码" autocomplete="current-password"></label><br>
<button type="submit">登录</button></form>`);
    return;
  }
  if (req.method === "POST" && req.url === "/session") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const form = new URLSearchParams(body);
      received.push({ username: form.get("username"), password: form.get("password") ?? "" });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>已登录</title><h1>登录成功：欢迎 tianyi</h1>");
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
const loginUrl = `http://${SITE}:${site.address().port}/login`;

// ---- the runtime's own modules (same URLs the browser plugin and v-browser-fill load) ----
const imp = (name) => import(pathToFileURL(path.join(dist, name)).href);
const { dispatchBrowserControlRequest } = await imp("local-dispatch.runtime.js");
const { getBrowserControlState } = await imp("browser-control-state-BXwfdI2_.js");
const lifecycleModule = await imp("server-context.lifecycle-D0RhNtWT.js");
const lifecycle = { lease: lifecycleModule.h, transition: lifecycleModule.r, actor: lifecycleModule.o };
const patched = fs.readFileSync(path.join(dist, "server-context.lifecycle-D0RhNtWT.js"), "utf8").includes("browser-lifecycle-unwedge-v1");
const secretStore = await imp(fs.readdirSync(dist).find((n) => /^secret-store-[\w-]+\.js$/u.test(n) && /function writeSecretStoreEntry\(/u.test(fs.readFileSync(path.join(dist, n), "utf8"))));
const writeSecret = Object.values(secretStore).find((fn) => typeof fn === "function" && fn.name === "writeSecretStoreEntry");
assert(writeSecret, "writeSecretStoreEntry not found");
const { fillSecret } = await import(path.resolve("apps/v-browser-fill/plugin/core/fill.js"));
const { nativeDeps } = await import(path.resolve("apps/v-browser-fill/plugin/core/native.js"));
const deps = await nativeDeps(dist);

/** One browser.request-shaped call: the route dispatcher under a 45 s abort deadline. */
async function request(method, reqPath, { query = {}, body, timeoutMs = DEADLINE_MS } = {}) {
  const controller = new AbortController();
  const started = Date.now();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error("browser request timed out"); controller.abort(e); reject(e); }, timeoutMs);
  });
  try {
    const res = await Promise.race([dispatchBrowserControlRequest({ method, path: reqPath, query: { profile: PROFILE, ...query }, body, signal: controller.signal }), expired]);
    return { ok: res.status < 400, status: res.status, body: res.body, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), ms: Date.now() - started };
  } finally { clearTimeout(timer); }
}

function refFor(snapshot, role, name) {
  const line = String(snapshot).split("\n").find((l) => l.includes(role) && l.includes(name) && /\[ref=[^\]]+\]/u.test(l));
  return line ? /\[ref=([^\]]+)\]/u.exec(line)[1] : null;
}

/** Steps 1 and 4: read the login page and fill it the way browser_fill_secret does. */
async function fillFlow(label) {
  const before = received.length;
  const opened = await request("POST", "/tabs/open", { body: { url: loginUrl } });
  assert(opened.ok, `${label}: open failed ${JSON.stringify(opened).slice(0, 400)}`);
  const targetId = opened.body.targetId;
  let snap;
  for (let i = 0; i < 10; i += 1) {
    snap = await request("GET", "/snapshot", { query: { targetId, format: "ai" } });
    if (snap.ok && refFor(snap.body?.snapshot, "textbox", "密码")) break;
    await sleep(500);
  }
  const passwordRef = refFor(snap.body?.snapshot, "textbox", "密码");
  const buttonRef = refFor(snap.body?.snapshot, "button", "登录");
  assert(passwordRef && buttonRef, `${label}: login form not in snapshot ${JSON.stringify(snap).slice(0, 600)}`);
  const name = `LOGIN_UNWEDGE_${label.toUpperCase()}_PASSWORD`;
  const value = `Unwedge-${randomBytes(9).toString("base64url")}`;
  writeSecret({ name, value, kind: "secret", allowedHosts: [SITE], updatedBy: "candidate:browser-lifecycle-unwedge" });
  const filled = await fillSecret({ name, ref: passwordRef, targetId, profile: PROFILE }, deps);
  assert.equal(filled.filled, true, `${label}: fill result ${JSON.stringify(filled)}`);
  const clicked = await request("POST", "/act", { body: { kind: "click", ref: buttonRef, targetId } });
  assert(clicked.ok, `${label}: click failed ${JSON.stringify(clicked).slice(0, 400)}`);
  for (let i = 0; i < 40 && received.length === before; i += 1) await sleep(250);
  const post = received[received.length - 1];
  const result = { label, opened: opened.ms, snapshot: snap.ms, filled: { removed: filled.removed, host: filled.host }, siteGotStoredValue: received.length > before && post.password === value, storeRowLeft: deps.entry(name) !== null };
  log(`fill flow ${label}`, result);
  assert(result.siteGotStoredValue, `${label}: the site did not receive the stored value`);
  assert.equal(result.storeRowLeft, false, `${label}: the store row is still there`);
  await request("POST", "/tabs/action", { body: { action: "close", targetId } }).catch(() => {});
  return result;
}

const summary = { expect: EXPECT, patched };
const chromePids = new Set();
let exitCode = 0;
try {
  log(`runtime patched=${patched}, expecting ${EXPECT}`);
  summary.control = await fillFlow("control");

  // ---- the wedge ----
  const state = getBrowserControlState();
  const profileRuntime = state.profiles.get(PROFILE);
  assert(profileRuntime?.running, "managed Chrome is not running after the control flow");
  const chromePid = profileRuntime.running.pid;
  chromePids.add(chromePid);
  const actor = lifecycle.actor(profileRuntime);
  let stuckSignal;
  void lifecycle.lease({ state, runtime: profileRuntime, configRevision: actor.configRevision, run: async (signal) => { stuckSignal = signal; return await new Promise(() => {}); } }).catch(() => {});
  await sleep(50);
  void lifecycle.transition({ state, runtime: profileRuntime, reason: "managed Chrome restart required" }).catch((e) => log(`transition rejected: ${e.message}`));
  log("wedge injected", { stuckLeaseAborted: stuckSignal?.aborted === true, chromePid });

  const probes = [];
  for (const [method, p] of [["GET", "/profiles"], ["GET", "/"], ["GET", "/tabs"]]) {
    const r = await request(method, p);
    probes.push({ route: `${method} ${p}`, ok: r.ok, ms: r.ms, error: r.error });
    log(`probe ${method} ${p}`, probes[probes.length - 1]);
  }
  summary.probes = probes;
  summary.chromeReplaced = profileRuntime.running?.pid !== chromePid || state.profiles.get(PROFILE)?.running?.pid !== chromePid;

  if (EXPECT === "wedge") {
    assert(probes.every((p) => !p.ok && /timed out/u.test(p.error ?? "")), "base bytes did not reproduce the wedge");
    await sleep(60_000);
    const later = await request("GET", "/tabs");
    summary.after60s = { ok: later.ok, ms: later.ms, error: later.error };
    log("probe GET /tabs again after 60 s", summary.after60s);
    assert(!later.ok, "the profile recovered on its own");
    let chromeAlive = true;
    try { process.kill(chromePid, 0); } catch { chromeAlive = false; }
    summary.oldChromeStillAlive = chromeAlive;
    console.log(`PASS (wedge reproduced): every request for "${PROFILE}" timed out for 2+ minutes while its Chrome (pid ${chromePid}) stayed up=${chromeAlive}`);
  } else {
    assert(probes.every((p) => p.ok), `the profile did not recover: ${JSON.stringify(probes)}`);
    summary.afterRecovery = await fillFlow("recovered");
    console.log(`PASS (recovered): status/tabs/profiles answered within ${Math.max(...probes.map((p) => p.ms))} ms after the wedge; browser_fill_secret read the page and logged in again`);
  }
  console.log(JSON.stringify(summary, null, 1));
} catch (error) {
  exitCode = 1;
  console.log(JSON.stringify(summary, null, 1));
  console.error(error?.stack ?? error);
} finally {
  site.close();
  // A wedged profile cannot be stopped through its lifecycle; end the process and its Chrome.
  const pid = getBrowserControlState()?.profiles.get(PROFILE)?.running?.pid;
  if (pid) chromePids.add(pid);
  for (const p of chromePids) { try { process.kill(p, "SIGKILL"); } catch {} }
  setTimeout(() => process.exit(exitCode), 500);
}
