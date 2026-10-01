// Shared helpers for the 9.6 patch regression on the shared VLab.
// Read-only toward the instance: discovers the Gateway from its systemd unit,
// reads the token straight from the config (never printed), and keeps its own
// scratch HOME/TMPDIR under the suite directory so nothing is written into the
// instance. Every session it creates carries "regress96-" in its key.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const SUITE = path.dirname(new URL(import.meta.url).pathname);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const run = (cmd, args, timeout = 60_000) =>
  execFileSync(cmd, args, { encoding: "utf8", timeout, maxBuffer: 256 * 1024 * 1024 }).trim();
export const nonce = () => crypto.randomBytes(3).toString("hex").toUpperCase();

assert.equal(os.hostname(), "VM-0-4-ubuntu", "suite only runs on vlab91");
export const UNIT = process.env.VERSA_UNIT ?? "openclaw-vlab-production-mirror-v8.service";
if (/versa-mirror95/.test(UNIT)) throw new Error("refusing: this suite never touches versa-mirror95");

// Gateway discovery ------------------------------------------------------------
const SAFE_ENV = /^(OPENCLAW_[A-Z0-9_]+|HOME|TMPDIR|XDG_CACHE_HOME|CODEX_HOME|VLAB_OPENCLAW_AGENT_RUNTIME)$/;
const SECRETISH = /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH/;
export function discoverGateway() {
  const pid = Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"]));
  assert(pid > 1, `${UNIT} not running`);
  const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
  const cli = cmdline.find((v) => v.endsWith("/openclaw/dist/index.js"));
  assert(cli, "no openclaw dist/index.js in cmdline");
  const core = cli.slice(0, -"/dist/index.js".length);
  // Only whitelisted, non-secret variable NAMES and values are read.
  const env = {};
  const envNames = [];
  for (const e of fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")) {
    const i = e.indexOf("=");
    if (i <= 0) continue;
    const k = e.slice(0, i);
    envNames.push(k);
    if (SAFE_ENV.test(k) && !SECRETISH.test(k)) env[k] = e.slice(i + 1);
  }
  const version = JSON.parse(fs.readFileSync(`${core}/package.json`, "utf8")).version;
  const startedAt = run("systemctl", ["show", UNIT, "-p", "ExecMainStartTimestamp", "--value"]);
  const configPath = env.OPENCLAW_CONFIG_PATH;
  const instance = env.OPENCLAW_HOME;
  return { pid, cmdline, core, version, env, envNames: envNames.sort(), startedAt, configPath, instance };
}

export function readConfig(gw) {
  return JSON.parse(fs.readFileSync(gw.configPath, "utf8"));
}

// Client -------------------------------------------------------------------------
export async function connect(gw, { onEvent } = {}) {
  const scratch = path.join(SUITE, ".scratch");
  fs.mkdirSync(path.join(scratch, "tmp"), { recursive: true });
  // Keep the client's own writes (logs, caches) out of the instance.
  process.env.HOME = scratch;
  process.env.TMPDIR = path.join(scratch, "tmp");
  process.env.OPENCLAW_STATE_DIR = path.join(scratch, "state");
  process.env.OPENCLAW_HOME = scratch;
  delete process.env.OPENCLAW_CONFIG_PATH;
  const config = readConfig(gw);
  const rawToken = config.gateway?.auth?.token;
  assert(typeof rawToken === "string" && rawToken.length > 8, "gateway token not in config");
  const { GatewayClient } = await import(`${gw.core}/dist/plugin-sdk/gateway-runtime.js`);
  const listeners = new Set(onEvent ? [onEvent] : []);
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${config.gateway.port}`,
      token: rawToken,
      deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
      onHelloOk(hello) { clearTimeout(timer); client.hello = hello; resolve(); },
      onConnectError(e) { clearTimeout(timer); reject(e); },
      onEvent(event) { for (const l of listeners) { try { l(event); } catch {} } },
    });
    client.start();
  });
  client.listeners = listeners;
  client.config = config;
  return client;
}

export async function rpc(client, method, params = {}, timeoutMs = 60_000) {
  const at = Date.now();
  try {
    const result = await client.request(method, params, { timeoutMs });
    return { method, ok: true, ms: Date.now() - at, result };
  } catch (error) {
    return { method, ok: false, ms: Date.now() - at, error: String(error?.message ?? error).slice(0, 400) };
  }
}

// Chat scenario -------------------------------------------------------------------
export const assistantText = (h) => (h?.messages ?? []).filter((m) => m.role === "assistant")
  .map((m) => (Array.isArray(m.content) ? m.content : typeof m.content === "string" ? [{ type: "text", text: m.content }] : [])
    .filter((p) => p.type === "text").map((p) => p.text).join("\n")).join("\n");
export function toolNamesOf(history, extra = []) {
  const names = new Set(extra);
  for (const m of history?.messages ?? []) {
    if (m.role === "toolResult" && m.toolName) names.add(m.toolName);
    for (const p of Array.isArray(m.content) ? m.content : [])
      if ((p.type === "toolCall" || p.type === "tool_use") && p.name) {
        names.add(p.name);
        const a = typeof p.arguments === "string" ? (() => { try { return JSON.parse(p.arguments); } catch { return {}; } })() : (p.arguments ?? p.input ?? {});
        if ((p.name === "tool_call" || p.name === "tool_describe") && typeof a?.id === "string") names.add(a.id.split(":").at(-1));
      }
  }
  return [...names];
}

/**
 * Runs one chat turn in its own regress96- session and waits for a terminal state.
 * s: { id, agentId="makaron", model="deepseek/deepseek-v4-flash", prompt, marker, tools[], followUpMs, markerTest(body) }
 */
export async function chatScenario(client, label, s) {
  const agentId = s.agentId ?? "makaron";
  const runId = crypto.randomUUID();
  const sessionKey = s.sessionKey ?? `agent:${agentId}:explicit:regress96-${label}-${s.id}-${Date.now()}`;
  assert(sessionKey.includes("regress96-"));
  const row = { id: s.id, agentId, runId, sessionKey, marker: s.marker, expectTools: s.tools ?? [], model: s.model === null ? null : (s.model ?? "deepseek/deepseek-v4-flash"),
    startedAtIso: new Date().toISOString(), events: { counts: {}, toolNames: [], tool: [], lifecycle: [], errors: [] } };
  const toolEvents = new Set();
  const listener = (event) => {
    const p = event.payload ?? {};
    if (p.runId !== runId && p.sessionKey !== sessionKey) return;
    const k = `${event.event}:${p.stream ?? p.state ?? ""}`;
    row.events.counts[k] = (row.events.counts[k] ?? 0) + 1;
    if (event.event === "agent" && p.stream === "tool") {
      const name = p.data?.name ?? p.data?.toolName;
      if (name) toolEvents.add(name);
      if (row.events.tool.length < 40) row.events.tool.push({ phase: p.data?.phase, name, isError: p.data?.isError ?? undefined });
    }
    if (event.event === "agent" && p.stream === "lifecycle" && row.events.lifecycle.length < 20) row.events.lifecycle.push(p.data?.phase ?? p.data);
    if (event.event === "chat" && p.runId === runId && ["final", "error", "aborted"].includes(p.state)) {
      row.terminal = p.state; row.totalMs = Date.now() - row.sentAtMs;
      if (p.errorMessage) row.errorMessage = String(p.errorMessage).slice(0, 600);
    }
    if (s.onEvent) s.onEvent(event, row);
  };
  client.listeners.add(listener);
  try {
    if (row.model) row.patch = await rpc(client, "sessions.patch", { key: sessionKey, agentId, model: row.model, ...(s.patch ?? {}) }, 180_000);
    row.subscribe = await rpc(client, "sessions.messages.subscribe", { agentId, key: sessionKey }, 30_000);
    row.sentAtMs = Date.now();
    row.send = await rpc(client, "chat.send", { agentId, sessionKey, message: s.prompt, deliver: false,
      idempotencyKey: runId, timeoutMs: s.runTimeoutMs ?? 600_000, ...(s.sendExtra ?? {}) }, 60_000);
    if (!row.send.ok) { row.terminal = "send-failed"; }
    else row.send = { ok: true, ms: row.send.ms, status: row.send.result?.status };
    const deadline = Date.now() + (s.waitMs ?? 6 * 60_000);
    while (!row.terminal && Date.now() < deadline) await sleep(500);
    const readHistory = async () => { const r = await rpc(client, "chat.history", { agentId, sessionKey, limit: 80 }, 60_000); if (!r.ok) row.historyError = r.error; return r.result; };
    let history = await readHistory();
    const hasMarker = (h) => (s.markerTest ? s.markerTest(assistantText(h)) : assistantText(h).includes(s.marker));
    const followUntil = Date.now() + (s.followUpMs ?? 0);
    while (!hasMarker(history) && Date.now() < followUntil) { await sleep(3_000); history = await readHistory(); }
    row.endedAtIso = new Date().toISOString();
    const body = assistantText(history).trim();
    row.tools = toolNamesOf(history, toolEvents);
    row.bodyHasMarker = hasMarker(history);
    const matches = (want) => want.endsWith("*") ? row.tools.some((n) => n.startsWith(want.slice(0, -1))) : row.tools.includes(want);
    row.toolOk = (s.tools ?? []).length === 0 ? (s.noTools === false ? true : row.tools.length === 0) : s.tools.some(matches);
    row.pass = row.terminal === "final" && row.bodyHasMarker && row.toolOk;
    row.bodyTail = body.slice(-400);
    row.messageCount = history?.messages?.length ?? 0;
    row.history = history;
    return row;
  } finally {
    client.listeners.delete(listener);
  }
}

// Logs -----------------------------------------------------------------------------
export function journal(since, until, unit = UNIT) {
  const args = ["-u", unit, "--no-pager", "-o", "short-iso-precise", "--since", since];
  if (until) args.push("--until", until);
  return run("journalctl", args, 120_000);
}
export function jsonLogLines(gw, sinceIso) {
  // The unit runs with PrivateTmp, so the file log lives in the Gateway's own /tmp namespace.
  const dirs = [`/proc/${gw.pid}/root/tmp/openclaw`, path.join(gw.env.TMPDIR ?? path.join(gw.instance, "tmp"), `openclaw-${fs.statSync(`/proc/${gw.pid}`).uid}`)];
  const out = [];
  const since = Date.parse(sinceIso);
  const dir = dirs.find((d) => { try { return fs.readdirSync(d).some((n) => /^openclaw-\d{4}-\d{2}-\d{2}\.log$/.test(n)); } catch { return false; } });
  if (!dir) return out;
  for (const f of fs.readdirSync(dir).filter((n) => /^openclaw-\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort()) {
    const day = Date.parse(f.slice(9, 19) + "T23:59:59+08:00");
    if (day < since) continue;
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line) continue;
      try { const j = JSON.parse(line); if (Date.parse(j.time) >= since) out.push(j); } catch {}
    }
  }
  return out;
}
export const isoCst = (ms) => new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace(" ", "T");
export function countMatches(text, re) { return (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length; }
export function firstMatches(text, re, n = 3, width = 300) {
  const out = [];
  for (const line of text.split("\n")) { if (re.test(line)) { out.push(line.slice(0, width)); if (out.length >= n) break; } }
  return out;
}

export function writeReceipt(outDir, name, data) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return file;
}

// History helpers -------------------------------------------------------------------
export const textOf = (m) => (Array.isArray(m?.content) ? m.content : typeof m?.content === "string" ? [{ type: "text", text: m.content }] : [])
  .filter((p) => p.type === "text").map((p) => p.text).join("\n");
// Tool results by tool name. Under tool search the model calls "tool_call" {id, args} and the
// result is a JSON envelope {tool:{name}, result:{content}}; unwrap those too.
export function toolResults(history, name) {
  const out = [];
  const callTarget = new Map(); // toolCallId -> inner tool id for tool_call wrappers
  for (const m of history?.messages ?? []) for (const p of Array.isArray(m.content) ? m.content : []) {
    if (p.type !== "toolCall" || p.name !== "tool_call") continue;
    const a = typeof p.arguments === "string" ? (() => { try { return JSON.parse(p.arguments); } catch { return {}; } })() : (p.arguments ?? {});
    if (typeof a?.id === "string") callTarget.set(p.id, a.id.split(":").at(-1));
  }
  // Harness runtimes (claude-cli) keep tool results inside assistant messages as
  // {type:"tool_result", name, content} blocks.
  for (const m of history?.messages ?? []) for (const p of Array.isArray(m.content) ? m.content : []) {
    if (m.role === "toolResult" || p?.type !== "tool_result") continue;
    const text = typeof p.content === "string" ? p.content : Array.isArray(p.content) ? p.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : JSON.stringify(p.content ?? "");
    const tn = String(p.name ?? "");
    const bare = tn.replace(/^mcp__openclaw__/, "");
    if (!name || tn === name || bare === name || (name.endsWith("*") && bare.startsWith(name.slice(0, -1))))
      out.push({ toolName: tn, via: "harness-block", isError: Boolean(p.isError ?? p.is_error), text });
  }
  for (const m of history?.messages ?? []) {
    if (m.role !== "toolResult") continue;
    const text = textOf(m);
    if (m.toolName === "tool_call" || m.toolName === "tool_describe") {
      let env; try { env = JSON.parse(text); } catch {}
      const inner = env?.tool?.name ?? env?.tool?.id?.split?.(":")?.at?.(-1) ?? callTarget.get(m.toolCallId);
      if (m.toolName === "tool_call" && inner && (!name || inner === name || (name.endsWith("*") && inner.startsWith(name.slice(0, -1))))) {
        const r = env?.result ?? {};
        const innerText = Array.isArray(r.content) ? r.content.filter((p) => p.type === "text").map((p) => p.text).join("\n") : (env?.error ? String(env.error) : env ? JSON.stringify(r).slice(0, 4000) : text);
        out.push({ toolName: inner, via: "tool_call", isError: Boolean(m.isError || r.isError || env?.error), text: innerText || text, details: r.details });
        continue;
      }
      if (!name) out.push({ toolName: m.toolName, isError: m.isError, text, details: m.details });
      continue;
    }
    if (!name || m.toolName === name || (name.endsWith("*") && String(m.toolName).startsWith(name.slice(0, -1))))
      out.push({ toolName: m.toolName, isError: m.isError, text, details: m.details });
  }
  return out;
}
export function userTexts(history) { return (history?.messages ?? []).filter((m) => m.role === "user").map(textOf); }

// vlab.workers.status counters we diff around scenarios.
export function workerCounters(status) {
  const i = status?.integration ?? {};
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));
  const gw = (i.gatewayOwnedToolIsolation?.workers ?? []).reduce((a, w) => {
    const s = w?.status ?? {}; a.calls += s.calls ?? 0; a.succeeded += s.succeeded ?? 0; a.failed += s.failed ?? 0; if (s.lastTool) a.lastTools.push(s.lastTool); return a;
  }, { calls: 0, succeeded: 0, failed: 0, lastTools: [] });
  return {
    workerAttempts: i.nativeHarnessStats?.workerAttempts,
    lastSessionKey: i.nativeHarnessStats?.lastSessionKey,
    subagentRelay: pick(i.nativeHarnessStats?.subagentCompletionRelay, ["received", "delivered", "failed", "unconfirmed"]),
    mediaRelay: pick(i.mediaCompletionRelay, ["received", "delivered", "failed"]),
    gatewayOwnedTools: gw,
  };
}
export function diffNum(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (typeof a?.[k] === "number" || typeof b?.[k] === "number") out[k] = (b?.[k] ?? 0) - (a?.[k] ?? 0);
    else if (a?.[k] && typeof a[k] === "object" && !Array.isArray(a[k])) out[k] = diffNum(a[k], b?.[k]);
  }
  return out;
}
