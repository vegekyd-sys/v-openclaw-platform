#!/opt/vlab/node-v22.23.1-linux-x64/bin/node
// A stand-in for Claude Code's stream-json mode, for testing which native tools OpenClaw lets a
// claude-cli cron run use. VLab has no Claude subscription of its own.
//
// A prompt containing WRITE-PROOF:<absolute path> makes the fake do what real Claude Code does
// before running Bash: ask its host for permission with a can_use_tool control request. OpenClaw's
// answer (allow or deny, with its message) is what this test is about. On allow, the fake writes
// the file itself, as Claude Code would by running the command. Every reply says which happened.
// The launch argv's tool options are logged too. Logs go to $FAKE_CLAUDE_LOG (or, when the Gateway
// did not pass it, to fake-claude.jsonl next to the proof path).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("2.1.280 (Claude Code)"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }));
  process.exit(0);
}
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const sessionId = flag("--session-id") ?? flag("--resume") ?? randomUUID();
const model = flag("--model") ?? "claude-fake";
let logFile = process.env.FAKE_CLAUDE_LOG;
const pendingLog = [];
const log = (record) => {
  const line = `${JSON.stringify({ at: Date.now(), pid: process.pid, ...record })}\n`;
  if (logFile) fs.appendFileSync(logFile, line); else pendingLog.push(line);
};
log({ event: "argv", tools: flag("--tools"), allowedTools: flag("--allowedTools"), disallowedTools: flag("--disallowedTools"), permissionPromptTool: flag("--permission-prompt-tool") });
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const textOf = (m) => typeof m.message?.content === "string" ? m.message.content
  : (Array.isArray(m.message?.content) ? m.message.content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");

const queue = [];
const pending = new Map();
let wake;
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.type === "control_request") {
    const response = m.request?.subtype === "initialize"
      ? { commands: [], agents: [], output_style: "default", available_output_styles: ["default"], models: [], account: {}, fast_mode_state: "off" }
      : {};
    emit({ type: "control_response", response: { subtype: "success", request_id: m.request_id, response } });
    return;
  }
  if (m.type === "control_response") {
    const id = m.response?.request_id;
    pending.get(id)?.(m.response);
    pending.delete(id);
    return;
  }
  if (m.type === "user") { queue.push(m); wake?.(); }
});
rl.on("close", () => { log({ event: "stdin-closed" }); process.exit(0); });

function askPermission(toolName, input, toolUseId) {
  const requestId = `req_${randomUUID()}`;
  emit({ type: "control_request", request_id: requestId, request: { subtype: "can_use_tool", tool_name: toolName, input, tool_use_id: toolUseId, permission_suggestions: [] } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve({ subtype: "timeout" }); }, 120_000);
    pending.set(requestId, (r) => { clearTimeout(timer); resolve(r); });
  });
}

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
async function runTurn(first) {
  const started = Date.now();
  emit({ type: "system", subtype: "init", session_id: sessionId, model, tools: ["Bash", "Read", "Write", "Edit"], mcp_servers: [], cwd: process.cwd(), permissionMode: "default", apiKeySource: "none", slash_commands: [], uuid: randomUUID() });
  const prompt = textOf(first);
  let text = "FAKE-REPLY no proof requested";
  let turns = 1;
  const proof = /WRITE-PROOF:(\/\S+)/u.exec(prompt)?.[1];
  if (proof) {
    logFile ??= path.join(path.dirname(proof), "fake-claude.jsonl");
    for (const line of pendingLog.splice(0)) fs.appendFileSync(logFile, line);
    const toolId = `toolu_fake_${randomUUID().slice(0, 8)}`;
    const input = { command: `printf ok > ${proof}`, description: "Write the proof file" };
    emit({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content: [{ type: "tool_use", id: toolId, name: "Bash", input }], stop_reason: "tool_use", usage }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    const answer = await askPermission("Bash", input, toolId);
    const decision = answer?.response ?? {};
    log({ event: "permission", subtype: answer?.subtype, behavior: decision.behavior, message: decision.message });
    let result;
    if (answer?.subtype === "success" && decision.behavior === "allow") {
      fs.writeFileSync(proof, "ok");
      result = "written";
      text = `NATIVE-ALLOWED wrote ${proof}`;
    } else {
      result = `denied: ${decision.message ?? answer?.subtype ?? "unknown"}`;
      text = `NATIVE-DENIED ${decision.message ?? answer?.subtype ?? "unknown"}`;
    }
    emit({ type: "user", message: { role: "user", content: [{ tool_use_id: toolId, type: "tool_result", content: result, is_error: result !== "written" }] }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    turns = 2;
  }
  emit({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
  emit({ type: "result", subtype: "success", is_error: false, duration_ms: Date.now() - started, duration_api_ms: 1, num_turns: turns, result: text, session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [], uuid: randomUUID() });
  log({ event: "result", text });
}

for (;;) {
  if (queue.length === 0) await new Promise((resolve) => { wake = resolve; });
  wake = undefined;
  while (queue.length > 0) await runTurn(queue.shift());
}
