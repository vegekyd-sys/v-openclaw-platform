// Candidate test: /vcc must auto-compact long before Claude Code's hard window.
//
// Production incident 2026-10-11 12:30 CST: one /vcc Claude Code session had
// been resumed for eight days and reached 976k tokens. The next model call went
// past the 1M window ("Prompt is too long"), and the reactive compaction could
// not fit either ("automatic compaction failed: Request size exceeds model
// context window"). Auto-compaction never ran earlier because OpenClaw hands
// Claude Code the model's full native window, CLAUDE_CODE_AUTO_COMPACT_WINDOW=
// 1000000, so the native threshold sits ~3% below the hard limit.
//
// The fix is a Claude Code setting: an `env` block in the openclaw user's
// ~/.claude/settings.json (OpenClaw always runs claude with --setting-sources
// user) whose CLAUDE_CODE_AUTO_COMPACT_WINDOW overrides the value OpenClaw
// injects; Claude Code still clamps it to the model's window, so 200k runs keep
// 200k. vcc-compact-window-precedence.sh proves that precedence on 2.1.280.
// Here the shared HOME's user settings must not change, so the same env block
// reaches claude as a --settings file through a PATH wrapper, under the real
// OpenClaw spawn and its injected 1M window.
//
// The workload is a screenshot-heavy turn: the model views N generated
// 1200x800 "screenshots" one at a time with Claude Code's Read tool and reports
// the code on each. Like browser/computer screenshots over the MCP loopback,
// each lands in the conversation as an image block in a tool result. (OpenClaw's
// view_image does not: under claude-cli it hands the image to a separate image
// model and returns text.) A small cap makes the threshold reachable inside one
// turn.
//
// VCC_CW_EXPECT=none     baseline: claude gets the 1M window and the turn
//                        never compacts, although it passes the fix threshold
// VCC_CW_EXPECT=midturn  fixed (VCC_CW_TOKENS set): Claude Code compacts inside
//                        the turn, the turn still completes and reads the last
//                        screenshot correctly
//
// Channels and cron are cleared so the private Gateway cannot take Feishu
// events from shared VLab.

import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");

const expect = process.env.VCC_CW_EXPECT ?? "midturn";
assert(["none", "midturn"].includes(expect));
assert.equal(expect === "midturn", process.env.VCC_CW_TOKENS !== undefined, "midturn needs VCC_CW_TOKENS, the baseline must not set it");
const capTokens = process.env.VCC_CW_TOKENS ? Number(process.env.VCC_CW_TOKENS) : undefined; // undefined = production today
const compareTokens = Number(process.env.VCC_CW_COMPARE ?? 150_000); // the fix cap the baseline is compared against
const shots = Number(process.env.VCC_CW_SHOTS ?? 45);
const claudeVersion = process.env.VCC_CLAUDE_VERSION ?? "2.1.280"; // production V
const model = process.env.VCC_MODEL ?? "anthropic/claude-opus-5-5"; // production /vcc
const VAR = "CLAUDE_CODE_AUTO_COMPACT_WINDOW";
// Claude Code reserves the summary output (20k) and a 13k buffer below the window.
const thresholdOf = (window) => window - 33_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache", "claude-cli"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---- the production Claude Code version, private to this run ----
const cliDir = path.join(scratch, "claude-cli");
const npm = path.join(path.dirname(process.execPath), "npm");
const install = spawnSync(npm, ["install", "--prefix", cliDir, "--no-audit", "--no-fund", `@anthropic-ai/claude-code@${claudeVersion}`],
  { encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(scratch, "cache", "npm") }, timeout: 600_000 });
assert.equal(install.status, 0, `claude-code install failed: ${redact(install.stderr).slice(-600)}`);
const cliBin = path.join(cliDir, "node_modules", ".bin");
const home = process.env.HOME;
const baseEnv = {
  ...process.env,
  PATH: `${cliBin}:${process.env.PATH}`,
  DISABLE_AUTOUPDATER: "1",
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  npm_config_cache: path.join(scratch, "cache", "npm"),
  // production V runs claude with background tasks off (PR #74)
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
};
for (const k of [VAR, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "DISABLE_AUTO_COMPACT", "DISABLE_COMPACT"]) delete baseEnv[k];
const version = execFileSync(path.join(cliBin, "claude"), ["--version"], { env: baseEnv, encoding: "utf8" }).trim();
assert(version.startsWith(claudeVersion), `expected Claude Code ${claudeVersion}, got ${version}`);
const auth = JSON.parse(execFileSync(path.join(cliBin, "claude"), ["auth", "status", "--json"], { env: baseEnv, encoding: "utf8" }));
assert.equal(auth.loggedIn, true, `claude is not logged in under HOME=${home}`);

// ---- the fix: a settings env block overriding OpenClaw's injected window ----
const claudePath = path.join(cliBin, "claude");
let settingsFile = null;
if (capTokens !== undefined) {
  const wrapDir = path.join(scratch, "claude-wrap");
  fs.mkdirSync(wrapDir, { recursive: true });
  settingsFile = path.join(scratch, "claude-settings.json");
  fs.writeFileSync(settingsFile, `${JSON.stringify({ env: { [VAR]: String(capTokens) } })}\n`);
  fs.writeFileSync(path.join(wrapDir, "claude"), `#!/bin/sh\nexec ${JSON.stringify(claudePath)} "$@" --settings ${JSON.stringify(settingsFile)}\n`, { mode: 0o755 });
  baseEnv.PATH = `${wrapDir}:${baseEnv.PATH}`;
}

// ---- private config: no channels, no cron, production /vcc entry ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
// the claude-cli turn does not need the Codex harness, whose npm copy would be reinstalled
if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs
    .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.agents.entries.makaron.models ??= {};
config.agents.entries.makaron.models[model] = { alias: "vcc", params: { thinking: "high" }, agentRuntime: { id: "claude-cli" } };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(model)) allow.push(model);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const workspace = config.agents.entries.makaron.workspace ?? config.agents.defaults.workspace;
assert(workspace && fs.existsSync(workspace), `makaron workspace missing: ${workspace}`);

// ---- screenshots: 1200x800 PNGs, a frame number and a four-digit code each ----
const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
let seed = Date.now() % 2147483647;
const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
function screenshot(frame, code) {
  const W = 1200, H = 800, px = Buffer.alloc(W * H * 3, 0xee);
  const rect = (x0, y0, w, h, [r, g, b]) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) { const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; }
  };
  rect(0, 0, W, 48, [60, 64, 72]); // a title bar
  for (let i = 0; i < 14; i++) rect(Math.floor(rand() * W), 60 + Math.floor(rand() * (H - 60)), 60 + Math.floor(rand() * 260), 20 + Math.floor(rand() * 90),
    [200 + Math.floor(rand() * 50), 200 + Math.floor(rand() * 50), 200 + Math.floor(rand() * 50)]);
  const text = (s, x0, y0, scale, color) => {
    [...s].forEach((ch, k) => FONT[ch].forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === "1") rect(x0 + (k * 6 + x) * scale, y0 + y * scale, scale, scale, color);
    })));
  };
  rect(300, 260, 600, 300, [255, 255, 255]);
  text(String(frame).padStart(2, "0"), 16, 8, 4, [255, 255, 255]);
  text(code, 340, 300, 30, [20, 20, 20]);
  return png(W, H, px);
}
const marker = `VCCCW-${Date.now()}`;
const shotDir = path.join(workspace, "tmp", marker.toLowerCase());
fs.mkdirSync(shotDir, { recursive: true });
const codes = Array.from({ length: shots }, () => String(1000 + Math.floor(rand() * 9000)));
codes.forEach((code, i) => fs.writeFileSync(path.join(shotDir, `shot-${String(i + 1).padStart(2, "0")}.png`), screenshot(i + 1, code)));

// OpenClaw's startup PATH bootstrap would put /usr/bin ahead of the private CLI.
const env = { ...baseEnv, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_PATH_BOOTSTRAPPED: "1" };

const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (c) => {
      for (const line of c.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
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
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) {
        startGateway();
        continue;
      }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
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

// ---- the claude child the Gateway spawns: binary and the window it was given ----
function claudeChildren() {
  const out = [];
  const walk = (pid) => {
    let kids = "";
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8"); } catch { return; }
    for (const k of kids.trim().split(/\s+/u).filter(Boolean)) {
      let args = [];
      try { args = fs.readFileSync(`/proc/${k}/cmdline`, "utf8").split("\0"); } catch { continue; }
      if (args.includes("--output-format") && args.some((a) => /claude/u.test(a))) {
        let window = null;
        try {
          const hit = fs.readFileSync(`/proc/${k}/environ`, "utf8").split("\0").find((e) => e.startsWith(`${VAR}=`));
          window = hit ? hit.slice(VAR.length + 1) : null;
        } catch {}
        out.push({ pid: Number(k), exe: args[0], window, settings: args.filter((a, i) => args[i - 1] === "--settings") });
      }
      walk(k);
    }
  };
  walk(gateway.pid);
  return out;
}

// ---- Claude Code's own transcript for this turn ----
function transcriptFor(text, since) {
  const root = path.join(home, ".claude", "projects");
  const files = [];
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const d = path.join(root, dir);
    let names = [];
    try { names = fs.readdirSync(d).filter((n) => n.endsWith(".jsonl")); } catch { continue; }
    for (const f of names) {
      const p = path.join(d, f);
      if (fs.statSync(p).mtimeMs >= since && fs.readFileSync(p, "utf8").includes(text)) files.push(p);
    }
  }
  return files;
}

function analyse(file) {
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const r = { calls: 0, maxContext: 0, imageResults: 0, tools: {}, viewSeq: [], compactions: [], finalText: "" };
  rows.forEach((row, i) => {
    if (row.type === "system" && row.subtype === "compact_boundary") {
      const m = row.compactMetadata ?? {};
      r.compactions.push({ row: i, trigger: m.trigger, preTokens: m.preTokens, postTokens: m.postTokens, durationMs: m.durationMs, viewsBefore: r.viewSeq.length });
    }
    const content = row.message?.content;
    if (!Array.isArray(content)) return;
    if (row.type === "assistant") {
      const u = row.message?.usage;
      if (u) {
        r.calls += 1;
        r.maxContext = Math.max(r.maxContext, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
      }
      const t = content.filter((b) => b.type === "text").map((b) => b.text).join("");
      if (t) r.finalText = t;
    }
    for (const b of content) {
      if (b.type === "tool_use") {
        r.tools[b.name] = (r.tools[b.name] ?? 0) + 1;
        if (b.name === "Read") r.viewSeq.push({ row: i, tool: b.name, input: JSON.stringify(b.input).slice(0, 160) });
      }
      if (b.type === "tool_result" && JSON.stringify(b.content ?? "").includes('"type":"image"')) r.imageResults += 1;
    }
  });
  return r;
}

const last = String(shots).padStart(2, "0");
const PROMPT = [
  `这是一次自动化测试（${marker}），请严格照做。`,
  `目录 ${shotDir} 里有 shot-01.png 到 shot-${last}.png 共 ${shots} 张截图，每张中间有一个四位数字暗号，左上角是编号。`,
  "用 Read 工具按编号从小到大逐张直接查看图片，一次只调用一次、只看一张，不要并行，不要跳过，不要用脚本、view_image 或其他工具读图。",
  "每看完一张，用一句话写出「第N张=暗号」，然后继续看下一张。",
  `全部看完后，最后单独回复一行：FIRST=<第1张暗号> LAST=<第${shots}张暗号> COUNT=<实际查看的张数>`,
].join("");

async function runTurn() {
  const sessionKey = `agent:makaron:feishu:direct:ou_vcccw_${Date.now()}`;
  const started = Date.now();
  const child = spawn(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", model, "--message", PROMPT, "--json", "--timeout", "2400",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const seen = new Map();
  const poll = setInterval(() => { for (const c of claudeChildren()) seen.set(c.pid, c); }, 1_000);
  const exit = await new Promise((resolve) => child.on("close", resolve));
  clearInterval(poll);
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
  const files = transcriptFor(marker, started);
  return {
    sessionKey, exit, secs: Math.round((Date.now() - started) / 1000),
    ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model } : null,
    reply: String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "").slice(-400),
    claude: [...seen.values()],
    transcript: files.length ? analyse(files[0]) : null,
    transcriptFiles: files,
    stderr: exit === 0 ? undefined : redact(stderr).slice(-800),
  };
}

startGateway();
let result;
try {
  await connectGateway();
  result = await runTurn();
  const t = result.transcript;
  const replyLast = /LAST=(\d{4})/u.exec(result.reply)?.[1] ?? /LAST=(\d{4})/u.exec(t?.finalText ?? "")?.[1] ?? null;
  const replyFirst = /FIRST=(\d{4})/u.exec(result.reply)?.[1] ?? /FIRST=(\d{4})/u.exec(t?.finalText ?? "")?.[1] ?? null;
  const summary = {
    expect, capTokens: capTokens ?? null, claudeVersion: version, model, shots,
    result: { ...result, transcriptFiles: undefined, transcript: t && { ...t, viewSeq: t.viewSeq.length, finalText: t.finalText.slice(-200) } },
    codes: { first: codes[0], last: codes.at(-1), replyFirst, replyLast, firstOk: replyFirst === codes[0], lastOk: replyLast === codes.at(-1) },
  };
  console.log(JSON.stringify(summary, null, 1));

  assert.equal(result.exit, 0, "openclaw agent failed");
  assert.equal(result.ran?.provider, "claude-cli", `turn did not run on the claude-cli harness: ${JSON.stringify(result.ran)}`);
  assert(result.claude.length > 0, "no claude child was observed under the Gateway");
  assert(result.claude.every((c) => c.exe.startsWith(cliDir)),
    `Gateway spawned ${result.claude.map((c) => c.exe).join(", ")}, not the Claude Code ${claudeVersion} under test`);
  // OpenClaw injects the native window either way; only the settings layer differs
  assert(result.claude.every((c) => c.window === "1000000"), `OpenClaw injected ${VAR}=${result.claude.map((c) => c.window).join(",")}`);
  assert(result.claude.every((c) => JSON.stringify(c.settings) === JSON.stringify(settingsFile ? [settingsFile] : [])),
    `unexpected --settings on claude: ${JSON.stringify(result.claude.map((c) => c.settings))}`);
  assert(t, "Claude Code transcript for this turn was not found");

  // the workload must actually be a screenshot-heavy turn, or this proves nothing
  assert(t.viewSeq.length >= shots, `model viewed ${t.viewSeq.length}/${shots} screenshots`);
  assert(t.viewSeq.every((v) => v.tool === "Read"), `screenshots were not all viewed with Read: ${JSON.stringify(t.tools)}`);
  assert(t.imageResults >= shots, `only ${t.imageResults} image tool results`);
  assert.equal(replyLast, codes.at(-1), "the last screenshot was not read correctly");
  if (expect === "none") {
    assert.equal(t.compactions.length, 0, "baseline compacted; it should run on the 1M window");
    assert(t.maxContext > thresholdOf(compareTokens),
      `baseline peaked at ${t.maxContext} tokens, below the ${compareTokens} cap's threshold; the comparison would be vacuous`);
  }
  if (expect === "midturn") {
    assert(t.compactions.length >= 1, "no compaction inside the turn");
    assert(t.compactions.every((c) => c.trigger === "auto"), `unexpected compaction trigger ${JSON.stringify(t.compactions)}`);
    assert(t.compactions.some((c) => c.viewsBefore > 0 && c.viewsBefore < shots), "compaction did not happen between screenshots");
    assert(t.maxContext < capTokens, `context reached ${t.maxContext} with a ${capTokens} cap`);
  }
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  // this turn's transcripts live in the shared HOME; leave nothing behind
  for (const f of result?.transcriptFiles ?? []) { try { fs.rmSync(f); } catch {} }
  fs.rmSync(shotDir, { recursive: true, force: true });
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
