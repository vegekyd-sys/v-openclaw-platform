#!/opt/vlab/node-v22.23.1-linux-x64/bin/node
// A stand-in for Claude Code's stream-json mode, for testing OpenClaw's claude-cli plumbing on
// VLab, which has no Claude subscription of its own. It reproduces the three behaviours probed on
// V's real Claude Code (2.1.x with Agent SDK 0.3.241, 2026-11-06):
//   - a user message that arrives while a "tool" runs is absorbed into the same turn (one result);
//   - one that arrives while the final answer is produced runs as a follow-on turn (second result);
//   - with --replay-user-messages each consumed user message is echoed with its uuid
//     (isReplay: true), before the result in the first case and after it in the second.
// A prompt containing SLOW:<ms> runs a "tool" for <ms> ms, then answers for ANSWER_MS ms.
// Every reply lists the prompts the turn consumed, so the test can tell where a steer landed.
// Installed for candidates behind a native claude.exe (fake-claude-exe.c); see vcc-steer.mjs.
// It logs each stdin record (truncated) to $FAKE_CLAUDE_LOG when set.
import fs from "node:fs";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("2.1.280 (Claude Code)"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }));
  process.exit(0);
}
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const replay = args.includes("--replay-user-messages");
const sessionId = flag("--session-id") ?? flag("--resume") ?? randomUUID();
const model = flag("--model") ?? "claude-fake";
const ANSWER_MS = Number(process.env.FAKE_CLAUDE_ANSWER_MS ?? 2500);
const log = (record) => { if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...record })}\n`); };
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textOf = (m) => typeof m.message?.content === "string" ? m.message.content
  : (Array.isArray(m.message?.content) ? m.message.content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");

const queue = [];
let phase = "idle"; // idle | tool | answer
let absorbed = [];
let wake;

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  log({ in: m.type, subtype: m.request?.subtype, uuid: m.uuid, priority: m.priority, text: m.type === "user" ? textOf(m).slice(-120) : undefined, phase });
  if (m.type === "control_request") {
    const response = m.request?.subtype === "initialize"
      ? { commands: [], agents: [], output_style: "default", available_output_styles: ["default"], models: [], account: {}, fast_mode_state: "off" }
      : {};
    emit({ type: "control_response", response: { subtype: "success", request_id: m.request_id, response } });
    return;
  }
  if (m.type === "control_response" || m.type === "keep_alive") return;
  if (m.type !== "user") return;
  if (phase === "tool") absorbed.push(m); // consumed at the next tool boundary
  else queue.push(m);                     // idle, or answering: becomes the next turn
  wake?.();
});
rl.on("close", () => { log({ event: "stdin-closed" }); process.exit(0); });

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
async function runTurn(first) {
  const started = Date.now();
  emit({ type: "system", subtype: "init", session_id: sessionId, model, tools: ["Bash"], mcp_servers: [], cwd: process.cwd(), permissionMode: "default", apiKeySource: "none", slash_commands: [], uuid: randomUUID() });
  const consumed = [first];
  if (replay) emit({ ...first, isReplay: true, session_id: sessionId });
  const slow = /SLOW:(\d+)/u.exec(textOf(first));
  let turns = 1;
  if (slow) {
    phase = "tool";
    const toolId = `toolu_fake_${randomUUID().slice(0, 8)}`;
    emit({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content: [{ type: "tool_use", id: toolId, name: "Bash", input: { command: `sleep ${Number(slow[1]) / 1000}` } }], stop_reason: "tool_use", usage }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    await sleep(Number(slow[1]));
    emit({ type: "user", message: { role: "user", content: [{ tool_use_id: toolId, type: "tool_result", content: "TOOL-DONE", is_error: false }] }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    for (const m of absorbed) { consumed.push(m); if (replay) emit({ ...m, isReplay: true, session_id: sessionId }); }
    absorbed = [];
    turns = 2;
  }
  phase = "answer";
  await sleep(ANSWER_MS);
  const text = `FAKE-REPLY consumed=${consumed.length}: ${consumed.map((m) => textOf(m).split(/\s+/u).filter((w) => /^(STEER|MAIN)-/u.test(w)).join(",") || "prompt").join(" | ")}`;
  emit({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
  emit({ type: "result", subtype: "success", is_error: false, duration_ms: Date.now() - started, duration_api_ms: 1, num_turns: turns, result: text, session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [], uuid: randomUUID() });
  log({ event: "result", text });
  phase = "idle";
}

for (;;) {
  if (queue.length === 0) await new Promise((resolve) => { wake = resolve; });
  wake = undefined;
  while (queue.length > 0) await runTurn(queue.shift());
}
