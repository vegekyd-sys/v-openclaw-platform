// A real V Browser device for shared-VLab acceptance: headless Chrome with the
// real extension, paired to the VLab Broker as the given owner, one tab per
// harness. Each tab shows a secret only after its script runs, served once, so a
// reply that contains it proves the agent read the rendered page through the
// browser tool. Runs until SIGTERM, then revokes the device.
//
//   systemd-run --uid=vlab-browser --unit=vbx-acceptance-device \
//     -E OWNER=feishu:ou_... -E EXT_DIR=... -E OUT_DIR=... -E HARNESSES=worker,vcodex,vds,vcc \
//     /opt/vlab/node-v22.23.1-linux-x64/bin/node <dir>/v-browser-acceptance-device.mjs
//
// Writes OUT_DIR/state.json: { deviceId, label, pageBase, secrets: { harness: secret } }.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";

const OWNER = process.env.OWNER;
const EXT_DIR = process.env.EXT_DIR;
const OUT_DIR = process.env.OUT_DIR;
const ADMIN = process.env.BROKER_ADMIN ?? "http://127.0.0.1:24891";
const TOKEN_FILE = process.env.ADMIN_TOKEN_FILE ?? "/srv/vlab-browser/state/broker-admin-token";
const LABEL = process.env.DEVICE_LABEL ?? "VLab acceptance Chrome";
const HARNESSES = (process.env.HARNESSES ?? "worker,vcodex,vds,vcc").split(",").map((s) => s.trim()).filter(Boolean);
if (!OWNER || !EXT_DIR || !OUT_DIR) throw new Error("OWNER, EXT_DIR and OUT_DIR are required");
const adminToken = fs.readFileSync(TOKEN_FILE, "utf8").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { owner: OWNER, label: LABEL, secrets: {}, startedAt: new Date().toISOString() };
const save = () => fs.writeFileSync(path.join(OUT_DIR, "state.json"), `${JSON.stringify(state, null, 1)}\n`, { mode: 0o600 });

async function api(route, method = "GET", body) {
  const res = await fetch(ADMIN + route, { method, headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const value = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Broker ${res.status} ${route}: ${value.message ?? value.error ?? ""}`);
  return value;
}
async function waitFor(probe, ms, what) {
  const until = Date.now() + ms;
  while (Date.now() < until) { try { const v = await probe(); if (v) return v; } catch { /* retry */ } await sleep(300); }
  throw new Error(`${what} not ready`);
}

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
    if (state.secrets[h]) { res.writeHead(410).end("gone"); return; }
    state.secrets[h] = `VBX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    save();
    res.writeHead(200, { "content-type": "text/plain" }).end(state.secrets[h]);
    return;
  }
  res.writeHead(404).end();
});
page.listen(0, "127.0.0.1");
await once(page, "listening");
state.pageBase = `http://localhost:${page.address().port}`; // V's ssrf allow-list names localhost

const tmp = fs.mkdtempSync("/tmp/.vbx-dev-");
const chrome = spawn("/usr/bin/google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
  `--user-data-dir=${path.join(OUT_DIR, "chrome-profile")}`, "--no-first-run", "--no-default-browser-check", "about:blank",
], { env: { ...process.env, TMPDIR: tmp }, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
let seq = 0, buf = "";
const pending = new Map();
chrome.stdio[4].on("data", (chunk) => {
  buf += chunk.toString();
  for (let end; (end = buf.indexOf("\0")) >= 0;) {
    const v = JSON.parse(buf.slice(0, end)); buf = buf.slice(end + 1);
    const p = pending.get(v.id);
    if (!p) continue;
    pending.delete(v.id); clearTimeout(p.timer);
    if (v.error) p.reject(new Error(v.error.message)); else p.resolve(v.result);
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline ${method}`)); }, 15_000);
  pending.set(id, { resolve, reject, timer });
  chrome.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
});

let deviceId;
async function stop() {
  if (deviceId) await api(`/v1/devices/${deviceId}`, "DELETE", { ownerUserId: OWNER }).catch((e) => console.error(`revoke: ${e.message}`));
  chrome.kill("SIGTERM");
  page.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  state.stoppedAt = new Date().toISOString(); save();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

try {
  // Earlier runs that died before revoking leave offline devices with this label.
  for (const d of (await api(`/v1/devices?actorUserId=${encodeURIComponent(OWNER)}`)).devices ?? []) {
    if (d.label === LABEL && d.access === "owner") await api(`/v1/devices/${d.deviceId}`, "DELETE", { ownerUserId: OWNER }).catch(() => {});
  }
  const installed = await cdp("Extensions.loadUnpacked", { path: EXT_DIR });
  for (const h of HARNESSES) await cdp("Target.createTarget", { url: `${state.pageBase}/fixture?h=${h}` });
  const pairing = await api("/v1/pairings", "POST", { ownerUserId: OWNER });
  const popup = await cdp("Target.createTarget", { url: `chrome-extension://${installed.id}/popup.html` });
  const session = await cdp("Target.attachToTarget", { targetId: popup.targetId, flatten: true });
  await waitFor(async () => (await cdp("Runtime.evaluate", { expression: "typeof chrome !== 'undefined' && !!chrome.runtime?.id", returnByValue: true }, session.sessionId)).result?.value === true, 20_000, "extension popup");
  const paired = await cdp("Runtime.evaluate", {
    expression: `chrome.runtime.sendMessage(${JSON.stringify({ type: "pair", pairingString: pairing.pairingString, consentScope: "browser", deviceLabel: LABEL })})`,
    awaitPromise: true, returnByValue: true,
  }, session.sessionId);
  if (paired.result?.value?.ok !== true) throw new Error("extension pairing failed");
  await cdp("Target.detachFromTarget", { sessionId: session.sessionId });
  await cdp("Target.closeTarget", { targetId: popup.targetId });
  const devices = await waitFor(async () => {
    const online = (await api(`/v1/devices?actorUserId=${encodeURIComponent(OWNER)}`)).devices?.filter((d) => d.label === LABEL && d.online) ?? [];
    return online.length > 0 ? online : null;
  }, 30_000, "device online");
  deviceId = devices.at(-1).deviceId;
  await waitFor(async () => {
    const { tabs } = await api(`/v1/devices/${deviceId}/tabs?actorUserId=${encodeURIComponent(OWNER)}`);
    return HARNESSES.every((h) => tabs.some((t) => t.title === `VB fixture ${h}`));
  }, 30_000, "fixture tabs");
  Object.assign(state, { deviceId, extensionId: installed.id, ready: true });
  save();
  console.log(JSON.stringify({ ready: true, deviceId, label: LABEL, harnesses: HARNESSES }));
} catch (error) {
  state.error = String(error?.message ?? error); save();
  console.error(state.error);
  await stop();
}
