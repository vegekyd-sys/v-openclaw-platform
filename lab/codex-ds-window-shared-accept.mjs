// Shared VLab acceptance for lab/release-files/codex-ds-window (run on the VLab host as root,
// holding the integration lease).
//
//   node codex-ds-window-shared-accept.mjs procs     --owner O                      # Codex app-servers and their window arguments
//   node codex-ds-window-shared-accept.mjs seed      --owner O --label L [--seeds 7 --words 22000]
//   node codex-ds-window-shared-accept.mjs continue  --owner O --label L --key K [--turns 3]
//   node codex-ds-window-shared-accept.mjs firsttext --owner O --label L            # small /vds session, 4 turns
//   node codex-ds-window-shared-accept.mjs gpt       --owner O --label L            # small /vcodex session, 2 turns
//   node codex-ds-window-shared-accept.mjs sync      --owner O --src <dir> --backup <dir>
//   node codex-ds-window-shared-accept.mjs unsync    --owner O --backup <dir>
//
// `seed` runs before the release (V's bytes): one owner /vds session padded with salted filler.
// After the release, `continue` on the same key: the binding rotates once (the app-server start
// arguments are part of its runtime fingerprint), the new thread replays the transcript, and from
// then on the thread must report a 950,000 window and not compact. The Gateway loads the Codex
// plugin from state/npm, outside the release channel; `sync` copies the release files there
// (backup first) and `unsync` puts the backup back. Test turns use deliver:false.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LAB = "/srv/vlab-production-mirror/labs";
const BASE = `${LAB}/instances/db91-parity`;
const UNIT = "openclaw-vlab-production-mirror-v8.service";
const PORT = 24993;
const WORK = `${LAB}/shared-workflow/codex-ds-window-20261013`;
const CODEX_HOME = `${BASE}/state/agents/makaron/agent/codex-home`;
const CODEX_DIST = `${BASE}/state/npm/projects/openclaw-codex-8902d781d4/node_modules/@openclaw/codex/dist`;
const FILES = ["run-attempt-D1hJO4fX.js", "v-deepseek-model-catalog.json", "v-deepseek-base-instructions.md"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => execFileSync("sha256sum", [f], { encoding: "utf8" }).slice(0, 16);

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const owner = opt("owner");
assert(owner, "--owner required");
assert.equal(JSON.parse(fs.readFileSync(`${LAB}/control/integration.json`, "utf8")).owner, owner, "integration lease belongs to another task");
assert.equal(process.getuid(), 0, "run as root on the VLab host");
fs.mkdirSync(WORK, { recursive: true, mode: 0o700 });
const log = (o) => { const line = JSON.stringify(o); console.log(line); fs.appendFileSync(`${WORK}/log.jsonl`, `${line}\n`); };

const gatewayPid = () => Number(execFileSync("systemctl", ["show", UNIT, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
function gatewayEnv() {
  const pid = gatewayPid();
  assert(pid > 1, "Gateway is not running");
  return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
}

let client;
const runs = new Map();
async function connect(scopes = ["operator.read", "operator.write", "operator.admin"]) {
  const env = gatewayEnv();
  const cfg = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
  const token = String(cfg.gateway.auth.token).replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? "");
  const { GatewayClient } = await import(`${BASE}/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${PORT}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes,
      onEvent(e) {
        const p = e.payload;
        const r = runs.get(p?.runId);
        if (!r) return;
        const at = Date.now();
        if (e.event === "agent" && p.stream === "assistant" && String(p.data?.text ?? p.data?.delta ?? "").trim() && !r.firstBodyAt) r.firstBodyAt = at;
        if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) {
          r.terminal = p.state;
          r.endAt = at;
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
  await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 });
  const deadline = Date.now() + 630_000;
  while (!r.terminal && Date.now() < deadline) await sleep(250);
  return r;
}
const text = (m) => (typeof m.content === "string" ? m.content : (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
async function lastReply(key) {
  let h;
  // Right after a restart the Gateway answers chat.history with UNAVAILABLE while it rebuilds.
  for (let i = 0; ; i += 1) {
    try { h = await call("chat.history", { agentId: "makaron", sessionKey: key, limit: 4 }); break; } catch (error) {
      if (error?.retryable !== true || i >= 120) throw error;
      await sleep(Math.max(500, error.retryAfterMs ?? 500));
    }
  }
  const a = (h.messages ?? []).filter((m) => m.role === "assistant").at(-1);
  return a ? { text: text(a).trim().slice(0, 120), provider: a.provider, model: a.model } : {};
}
function journal(sinceMs, re) {
  const out = spawnSync("journalctl", ["-u", UNIT, "--since", `@${Math.floor(sinceMs / 1000)}`, "--no-pager", "-o", "cat"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).stdout;
  return out.split("\n").filter((l) => re.test(l)).map((l) => redact(l).replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 260));
}
// Every Codex thread touched since sinceMs: provider, window, compactions, per-request input(cached).
function threads(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    let provider = null, model = null, compactions = 0, last;
    const windows = new Set(), requests = [];
    for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "session_meta") provider = p.model_provider;
      if (e.type === "turn_context") model = p.model;
      if (e.type === "compacted") { compactions += 1; requests.push("C"); }
      if (e.type === "event_msg" && p.type === "token_count" && p.info?.last_token_usage) {
        windows.add(p.info.model_context_window);
        const u = p.info.last_token_usage;
        const k = `${u.input_tokens}/${u.cached_input_tokens}`;
        if (k !== last && u.input_tokens) requests.push(`${Math.round(u.input_tokens / 1000)}k(${Math.round((u.cached_input_tokens ?? 0) / 1000)}k)`);
        last = k;
      }
    }
    return { thread: path.basename(f).slice(-41, -28), provider, model, rolloutMB: +(fs.statSync(f).size / 1048576).toFixed(1), windows: [...windows], compactions, requests };
  });
}
const row = (label, scenario, r, extra = {}) => ({ label, scenario, terminal: r.terminal, error: r.error, firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null, totalMs: r.endAt ? r.endAt - r.sentAt : null, ...extra });
const filler = (salt, words) => Array.from({ length: words }, (_, i) => `${salt}w${i % 997}`).join(" ");
const LOG_RE = /DeepSeek model catalog|runtime identity changed|auto-compaction|compaction_succeeded|exceeded active|starting a (fresh|new) thread|413|payload too large/iu;

if (command === "procs") {
  const out = [];
  for (const pid of spawnSync("pgrep", ["-f", "codex.*app-server"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) {
    let args;
    try { args = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean); } catch { continue; }
    if (!args.some((a) => a === "app-server")) continue;
    const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    const home = env.find((x) => x.startsWith("CODEX_HOME="))?.slice(11);
    const opened = spawnSync("bash", ["-c", `ls -l /proc/${pid}/fd 2>/dev/null | grep -o '/[^ ]*rollout-[^ ]*jsonl' | sort -u`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)
      .map((f) => { try { return fs.readFileSync(f, "utf8").slice(0, 4000).match(/"model_provider":"([^"]+)"/u)?.[1]; } catch { return null; } });
    const catalog = args.find((a) => a.startsWith("model_catalog_json="));
    const instructions = args.find((a) => a.startsWith("instructions="));
    out.push({ pid: Number(pid), home: home?.replace(BASE, "<base>"), providers: [...new Set(opened)], catalog: catalog?.replace(BASE, "<base>") ?? null,
      instructions: instructions ? { chars: JSON.parse(instructions.slice("instructions=".length)).length } : null,
      otherArgs: args.slice(1).filter((a) => a !== catalog && a !== instructions) });
  }
  log({ procs: out });
} else if (command === "sync" || command === "unsync") {
  const backup = opt("backup");
  assert(backup, "--backup <dir> required");
  if (command === "sync") {
    const src = opt("src");
    assert(src, "--src <dir with the release files> required");
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    const manifest = {};
    for (const f of FILES) {
      const dst = `${CODEX_DIST}/${f}`;
      manifest[f] = fs.existsSync(dst) ? sha(dst) : null;
      if (fs.existsSync(dst) && !fs.existsSync(`${backup}/${f}`)) execFileSync("cp", ["-a", dst, `${backup}/${f}`]);
    }
    if (!fs.existsSync(`${backup}/manifest.json`)) fs.writeFileSync(`${backup}/manifest.json`, JSON.stringify(manifest));
    const ref = fs.statSync(`${CODEX_DIST}/run-attempt-D1hJO4fX.js`);
    for (const f of FILES) {
      const dst = `${CODEX_DIST}/${f}`;
      const tmp = `${dst}.dswin-tmp`;
      fs.copyFileSync(`${src}/${f}`, tmp);
      fs.chownSync(tmp, ref.uid, ref.gid);
      fs.chmodSync(tmp, ref.mode & 0o777);
      fs.renameSync(tmp, dst);
    }
    execFileSync("/opt/vlab/node-v22.23.1-linux-x64/bin/node", ["--check", `${CODEX_DIST}/run-attempt-D1hJO4fX.js`]);
    log({ sync: CODEX_DIST.replace(BASE, "<base>"), before: manifest, after: Object.fromEntries(FILES.map((f) => [f, sha(`${CODEX_DIST}/${f}`)])) });
  } else {
    const manifest = JSON.parse(fs.readFileSync(`${backup}/manifest.json`, "utf8"));
    for (const f of FILES) {
      if (manifest[f] === null) fs.rmSync(`${CODEX_DIST}/${f}`, { force: true });
      else execFileSync("cp", ["-a", `${backup}/${f}`, `${CODEX_DIST}/${f}`]);
    }
    log({ unsync: Object.fromEntries(FILES.map((f) => [f, fs.existsSync(`${CODEX_DIST}/${f}`) ? sha(`${CODEX_DIST}/${f}`) : null])) });
  }
} else if (command === "seed") {
  await connect();
  const label = opt("label") ?? "seed";
  const key = `agent:makaron:explicit:vlab-dev-dswin-${label}-${Date.now().toString(36)}`;
  const salt = `s${randomUUID().slice(0, 6)}`;
  const t0 = Date.now();
  await send(key, "/vds");
  const seeds = Number(opt("seeds") ?? 7);
  for (let i = 0; i < seeds; i += 1) {
    const r = await send(key, `${i === 0 ? "Remember the code word OTTER-4 and this list" : `Part ${i + 1} of the list`} for later; do not repeat it, just reply OK. ${filler(salt, Number(opt("words") ?? 22000))}`);
    log(row(label, "seed", r, { reply: (await lastReply(key)).text }));
  }
  log({ label, scenario: "seed", key, threads: threads(t0), journal: journal(t0, LOG_RE).slice(-8) });
  client.stop?.();
} else if (command === "continue") {
  await connect();
  const label = opt("label") ?? "continue";
  const key = opt("key");
  assert(key, "--key required");
  const t0 = Number(opt("since") ?? Date.now());
  const prompts = [
    "Do not use any tools. From our conversation only: what code word was given at the start? One line.",
    "Do not use any tools. Remember a second code word LARCH-7 and reply with one short sentence.",
    "Do not use any tools. From our conversation only: list every code word given so far. One line.",
    "Do not use any tools. In one sentence: how many parts did the list have?",
  ].slice(0, Number(opt("turns") ?? 3));
  for (const msg of prompts) {
    const r = await send(key, msg);
    log(row(label, "continue", r, { reply: (await lastReply(key)).text }));
  }
  log({ label, scenario: "continue", threads: threads(t0), journal: journal(t0, LOG_RE).slice(-12) });
  client.stop?.();
} else if (command === "firsttext") {
  await connect();
  const label = opt("label") ?? "firsttext";
  const key = `agent:makaron:explicit:vlab-dev-dswin-${label}-ft-${Date.now().toString(36)}`;
  const t0 = Date.now();
  await send(key, "/vds");
  for (const msg of [
    "Without using any tools, write about 150 words on how bees navigate. Start with ALPHA.",
    "Without using any tools, write about 150 words on why the sky is blue. Start with BRAVO.",
    "Without using any tools, write about 150 words on how glaciers move. Start with CHARLIE.",
    "Without using any tools, in one sentence: which topics have we covered so far?",
  ]) {
    const r = await send(key, msg);
    log(row(label, "firsttext", r, { reply: (await lastReply(key)).text?.slice(0, 60) }));
  }
  log({ label, scenario: "firsttext", threads: threads(t0) });
  client.stop?.();
} else if (command === "gpt") {
  await connect();
  const label = opt("label") ?? "gpt";
  const key = `agent:makaron:explicit:vlab-dev-dswin-${label}-gpt-${Date.now().toString(36)}`;
  const t0 = Date.now();
  await send(key, "/vcodex");
  for (const msg of ["Do not use any tools or read files. Remember the code word KIWI-3 and reply with one short sentence.", "Do not use any tools or read files. From our conversation only: what code word did I give you? One line."]) {
    const r = await send(key, msg);
    const reply = await lastReply(key);
    log(row(label, "gpt", r, { reply: reply.text, provider: reply.provider, model: reply.model }));
  }
  log({ label, scenario: "gpt", threads: threads(t0), journal: journal(t0, LOG_RE).slice(-6) });
  client.stop?.();
} else {
  throw new Error(`unknown command ${command}`);
}
process.exit(0);
