// No-worker provider checks on the upgrade mirror (the two providers that moved
// from the Worker plugin to versa-runtime-providers):
//   1. talk.catalog lists volcengine-rtc-agent as a configured realtime provider;
//      talk.client.create on a fresh session resolves it and returns a managed
//      room (real StartVoiceChat, no audio); talk.client.close stops it.
//   2. A session is grown with long turns, then sessions.compact runs LLM
//      compaction; the caller checks the journal for which compaction provider
//      ran (no "Compaction provider ... failed / falling back").
// Prints only ids, booleans, sizes and timings (never tokens or room URLs).
//   node talk-compact-check.mjs <label> <outDir> [--skip-talk] [--skip-compact]
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { runtimeMode } from "./runtime-mode.mjs";

const [label, outDir, ...flags] = process.argv.slice(2);
assert.equal(os.hostname(), "VM-0-4-ubuntu");
assert(label && /^[a-z0-9-]+$/.test(label) && outDir && fs.existsSync(outDir));
const unit = process.env.VERSA_UNIT ?? "versa-mirror95-gateway.service";
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 10_000 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(pid > 1, "gateway not running");
const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
const core = argv.find((v) => v.endsWith("/openclaw/dist/index.js")).slice(0, -"/dist/index.js".length);
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((e) => e.includes("="))
  .map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]));
Object.assign(process.env, env);
const config = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
const mode = runtimeMode(config);
const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
const model = "deepseek/deepseek-v4-flash";
const terminal = new Map();
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
  client = new GatewayClient({
    url: `ws://127.0.0.1:${config.gateway.port}`,
    token: config.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]),
    deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
    scopes: ["operator.read", "operator.write", "operator.admin"],
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(e) { clearTimeout(timer); reject(e); },
    onEvent(event) {
      if (event.event === "chat" && ["final", "error", "aborted"].includes(event.payload?.state)) {
        terminal.set(event.payload.runId, event.payload.state);
      }
    },
  });
  client.start();
});
const out = { label, mode, at: new Date().toISOString(), talk: null, compaction: null };
const errText = (e) => String(e?.message ?? e).slice(0, 300);

if (!flags.includes("--skip-talk")) {
  const talk = (out.talk = { configuredProvider: config.talk?.realtime?.provider ?? null });
  try {
    const catalog = await client.request("talk.catalog", {}, { timeoutMs: 30_000 });
    const rt = catalog?.realtime ?? {};
    const providers = rt.providers ?? [];
    const p = providers.find((x) => x.id === "volcengine-rtc-agent");
    talk.catalog = { realtimeProviders: providers.map((x) => x.id), volcListed: Boolean(p), volcConfigured: p?.configured ?? null, activeProvider: rt.activeProvider ?? null };
  } catch (e) { talk.catalogError = errText(e); }
  const sessionKey = `agent:makaron:explicit:talk-${label}-${Date.now()}`;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model }, { timeoutMs: 20_000 });
  const t0 = Date.now();
  try {
    const s = await client.request("talk.client.create", { sessionKey }, { timeoutMs: 60_000 });
    talk.create = { ok: true, ms: Date.now() - t0, provider: s.provider, transport: s.transport, hasRoomUrl: typeof s.roomUrl === "string" && s.roomUrl.startsWith("vertc://managed-room/"), hasToken: Boolean(s.token), voiceSessionId: Boolean(s.voiceSessionId), model: s.model, voice: s.voice, hasExpiry: typeof s.expiresAt === "number" };
    await sleep(3000);
    const t1 = Date.now();
    try {
      if (s.voiceSessionId) {
        await client.request("talk.client.close", { sessionKey, voiceSessionId: s.voiceSessionId }, { timeoutMs: 60_000 });
        talk.close = { ok: true, ms: Date.now() - t1, via: "talk.client.close" };
      } else talk.close = { ok: false, reason: "no voiceSessionId returned" };
    } catch (e) { talk.close = { ok: false, ms: Date.now() - t1, error: errText(e) }; }
  } catch (e) { talk.create = { ok: false, ms: Date.now() - t0, error: errText(e) }; }
  talk.pass = talk.create?.ok === true && talk.create.provider === "volcengine-rtc-agent" && talk.create.transport === "managed-room" && talk.create.hasRoomUrl && talk.close?.ok === true;
  console.error(`talk: ${talk.pass ? "PASS" : "FAIL"} ${JSON.stringify({ catalog: talk.catalog, create: talk.create && { ok: talk.create.ok, provider: talk.create.provider, transport: talk.create.transport, ms: talk.create.ms, error: talk.create.error }, close: talk.close })}`);
}

if (!flags.includes("--skip-compact")) {
  const c = (out.compaction = { provider: config.agents?.defaults?.compaction?.provider ?? null, turns: [] });
  const sessionKey = `agent:makaron:explicit:compact-${label}-${Date.now()}`;
  c.sessionKey = sessionKey;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model }, { timeoutMs: 20_000 });
  await client.request("sessions.messages.subscribe", { agentId: "makaron", key: sessionKey }, { timeoutMs: 20_000 });
  const topics = ["光合作用的完整过程", "TCP 拥塞控制的演进", "文艺复兴时期佛罗伦萨的艺术赞助", "SQLite WAL 模式的工作原理", "上海的城市规划历史", "机器学习中的正则化方法"];
  for (const [i, topic] of topics.entries()) {
    const runId = crypto.randomUUID(); const t0 = Date.now();
    await client.request("chat.send", { agentId: "makaron", sessionKey, message: `不要调用任何工具。请用中文写一篇约 1500 字的文章介绍：${topic}。第 ${i + 1} 篇。`, deliver: false, idempotencyKey: runId, timeoutMs: 600_000 }, { timeoutMs: 60_000 });
    const deadline = Date.now() + 5 * 60_000;
    while (!terminal.has(runId) && Date.now() < deadline) await sleep(500);
    c.turns.push({ i, state: terminal.get(runId) ?? "timeout", s: Math.round((Date.now() - t0) / 1000) });
  }
  const before = await client.request("sessions.list", { limit: 200 }, { timeoutMs: 30_000 }).catch(() => null);
  const row = before?.sessions?.find((s) => s.key === sessionKey);
  c.beforeTokens = row?.totalTokens ?? row?.contextTokens ?? null;
  c.startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const r = await client.request("sessions.compact", { key: sessionKey, agentId: "makaron" }, { timeoutMs: 600_000 });
    c.result = { ok: r?.ok, compacted: r?.compacted, reason: r?.reason ?? null, ms: Date.now() - t0, keys: Object.keys(r ?? {}) };
  } catch (e) { c.result = { ok: false, ms: Date.now() - t0, error: errText(e) }; }
  c.endedAt = new Date().toISOString();
  console.error(`compaction: ${JSON.stringify(c.result)} turns=${c.turns.map((t) => `${t.state}/${t.s}s`).join(",")}`);
}
client.stop();
const file = `${outDir}/talk-compact-${label}-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ out: file, talk: out.talk?.pass ?? null, compaction: out.compaction?.result ?? null }));
