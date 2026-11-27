#!/usr/bin/env node
// A stand-in `claude` for candidate tests that need no Claude login (shared VLab has none).
//
// Speaks what OpenClaw's claude-cli harness uses: `--version`, `auth status --json`, and a stream-json
// session (Agent SDK control protocol: control_request initialize -> control_response success). For each
// user turn it replays a foreground Agent call the way Claude Code streams one: an Agent tool_use, then the
// subagent's own records carrying parent_tool_use_id (a Bash tool_use, FAKE_SLEEP seconds of silence, its
// tool_result, ... FAKE_TICKS times), then the Agent tool_result, a final text and a result envelope.
// FAKE_LOG (JSONL) records every step with a timestamp, including the signal or stdin close that ends it.

import fs from "node:fs";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

const argv = process.argv.slice(2);
const VERSION = process.env.FAKE_CLAUDE_VERSION ?? "2.1.280";
if (argv.includes("--version") || argv.includes("-v")) { console.log(`${VERSION} (Claude Code)`); process.exit(0); }
if (argv[0] === "auth" && argv[1] === "status") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "fake", apiProvider: "firstParty" }));
  process.exit(0);
}

const TICKS = Number(process.env.FAKE_TICKS ?? 8);
const SLEEP_MS = Number(process.env.FAKE_SLEEP ?? 140) * 1000;
const logFile = process.env.FAKE_LOG;
const started = Date.now();
const log = (event, extra = {}) => {
  if (!logFile) return;
  try { fs.appendFileSync(logFile, `${JSON.stringify({ at: Date.now(), sinceStartSec: Math.round((Date.now() - started) / 1000), pid: process.pid, event, ...extra })}\n`); } catch {}
};
log("spawn", { argv: argv.filter((a) => !/token|key|secret/iu.test(a)).slice(0, 40) });

const sessionId = randomUUID();
const model = (() => { const i = argv.indexOf("--model"); return i >= 0 ? argv[i + 1] : "claude-opus-5-5"; })();
const out = (msg) => { process.stdout.write(`${JSON.stringify({ session_id: sessionId, uuid: randomUUID(), ...msg })}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usage = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const message = (content, extra = {}) => ({ id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content, stop_reason: null, stop_sequence: null, usage, ...extra });

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => { log("signal", { sig }); process.exit(143); });
process.on("exit", (code) => log("exit", { code }));

const pending = new Map();
let nextRequest = 0;
function controlRequest(request) {
  const request_id = `fake_req_${++nextRequest}`;
  out({ type: "control_request", request_id, request });
  return new Promise((resolve) => pending.set(request_id, resolve));
}

let turnRunning = false;
let interrupted = false;
async function runTurn(prompt) {
  turnRunning = true;
  interrupted = false;
  log("turn_start", { promptChars: String(prompt).length });
  out({ type: "system", subtype: "init", cwd: process.cwd(), tools: ["Agent", "Bash"], mcp_servers: [], model, permissionMode: "default", slash_commands: [], apiKeySource: "none", claude_code_version: VERSION, output_style: "default", agents: ["general-purpose"], skills: [], plugins: [] });
  const agentId = `toolu_fake_agent_${randomUUID().slice(0, 8)}`;
  const agentInput = { description: "fake foreground subagent", prompt: "run the ticks", subagent_type: "general-purpose" };
  out({ type: "assistant", parent_tool_use_id: null, message: message([{ type: "tool_use", id: agentId, name: "Agent", input: agentInput }], { stop_reason: "tool_use" }) });
  log("agent_tool_use", { agentId });
  if (argv.includes("--permission-prompt-tool")) {
    const decision = await controlRequest({ subtype: "can_use_tool", tool_name: "Agent", input: agentInput, tool_use_id: agentId, permission_suggestions: [] });
    log("can_use_tool", { behavior: decision?.response?.behavior ?? decision?.behavior ?? decision?.subtype });
  }
  let subRecords = 0;
  for (let n = 1; n <= TICKS; n += 1) {
    if (interrupted) break;
    const bashId = `toolu_fake_bash_${n}`;
    out({ type: "assistant", parent_tool_use_id: agentId, message: message([{ type: "tool_use", id: bashId, name: "Bash", input: { command: `python3 -c "import time; time.sleep(${SLEEP_MS / 1000})"`, timeout: SLEEP_MS + 120_000 } }], { stop_reason: "tool_use" }) });
    subRecords += 1;
    log("sub_tool_use", { n, subRecords });
    await sleep(SLEEP_MS);
    if (interrupted) break;
    out({ type: "user", parent_tool_use_id: agentId, message: { role: "user", content: [{ type: "tool_result", tool_use_id: bashId, content: "tick" }] } });
    subRecords += 1;
    log("sub_tool_result", { n, subRecords });
  }
  if (interrupted) {
    log("turn_interrupted", { subRecords });
    out({ type: "result", subtype: "error_during_execution", is_error: true, duration_ms: Date.now() - started, duration_api_ms: 0, num_turns: 1, stop_reason: null, total_cost_usd: 0, usage, permission_denials: [], errors: ["interrupted"] });
    turnRunning = false;
    return;
  }
  out({ type: "assistant", parent_tool_use_id: agentId, message: message([{ type: "text", text: "SUB-DONE" }], { stop_reason: "end_turn" }) });
  out({ type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: agentId, content: [{ type: "text", text: "SUB-DONE" }] }] } });
  const text = "完成 SUB-DONE";
  out({ type: "assistant", parent_tool_use_id: null, message: message([{ type: "text", text }], { stop_reason: "end_turn" }) });
  out({ type: "result", subtype: "success", is_error: false, duration_ms: Date.now() - started, duration_api_ms: 1000, num_turns: 2, result: text, stop_reason: "end_turn", total_cost_usd: 0, usage, permission_denials: [] });
  log("turn_done", { subRecords });
  turnRunning = false;
}

const promptFromArgs = (() => { const i = argv.findIndex((a) => a === "-p" || a === "--print"); const v = i >= 0 ? argv[i + 1] : undefined; return v && !v.startsWith("-") ? v : undefined; })();
let gotUserTurn = false;
if (promptFromArgs) { gotUserTurn = true; void runTurn(promptFromArgs); }

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch {
    if (!gotUserTurn && line.trim()) { gotUserTurn = true; log("plain_stdin_prompt"); void runTurn(line); }
    return;
  }
  if (msg.type === "control_request") {
    const sub = msg.request?.subtype;
    log("control_request", { subtype: sub });
    let response = {};
    if (sub === "initialize") response = { commands: [], agents: [], models: [{ value: model, displayName: model, description: "fake" }], account: {}, output_style: "default", available_output_styles: ["default"] };
    if (sub === "interrupt") interrupted = true;
    out({ type: "control_response", response: { subtype: "success", request_id: msg.request_id, response } });
    return;
  }
  if (msg.type === "control_response") {
    const resolve = pending.get(msg.response?.request_id);
    pending.delete(msg.response?.request_id);
    resolve?.(msg.response);
    return;
  }
  if (msg.type === "user") {
    gotUserTurn = true;
    const content = msg.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((b) => b.text ?? "").join("") : "";
    if (turnRunning) { log("user_while_running", { chars: text.length }); return; }
    void runTurn(text);
  }
});
rl.on("close", () => { log("stdin_closed", { turnRunning }); if (!turnRunning) process.exit(0); });
