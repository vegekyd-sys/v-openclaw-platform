#!/opt/vlab/node-v22.23.1-linux-x64/bin/node
// A stand-in for Claude Code's stream-json mode that calls OpenClaw's own `exec` over the MCP
// loopback, the way /vcc does when its grant has an explicit tool list (V's 十二家 cron 0a46c5c9).
// VLab has no Claude subscription of its own.
//
// A prompt containing MCP-EXEC:<absolute path> makes the fake read the --mcp-config file OpenClaw
// passed, expand ${VAR} headers from its environment (as Claude Code does), and POST one JSON-RPC
// tools/call for `exec` with `printf ok > <path>`. The reply says MCP-EXEC-OK or MCP-EXEC-ERROR
// with the tool's text. Logs go to $FAKE_CLAUDE_LOG.
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
const sessionId = flag("--session-id") ?? flag("--resume") ?? randomUUID();
const model = flag("--model") ?? "claude-fake";
const logFile = process.env.FAKE_CLAUDE_LOG;
const log = (record) => { if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...record })}\n`); };
const mcpConfigArg = flag("--mcp-config");
log({ event: "argv", mcpConfig: Boolean(mcpConfigArg), tools: flag("--tools"), allowedTools: flag("--allowedTools") });
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const textOf = (m) => typeof m.message?.content === "string" ? m.message.content
  : (Array.isArray(m.message?.content) ? m.message.content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");

const queue = [];
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
  if (m.type === "user") { queue.push(m); wake?.(); }
});
rl.on("close", () => { log({ event: "stdin-closed" }); process.exit(0); });

function loadOpenClawServer() {
  const raw = mcpConfigArg.trim().startsWith("{") ? mcpConfigArg : fs.readFileSync(mcpConfigArg, "utf8");
  const server = JSON.parse(raw).mcpServers?.openclaw;
  if (!server?.url) throw new Error("no openclaw MCP server in --mcp-config");
  const expand = (v) => String(v).replace(/\$\{([A-Z0-9_]+)\}/gu, (_, name) => process.env[name] ?? "");
  return { url: server.url, headers: Object.fromEntries(Object.entries(server.headers ?? {}).map(([k, v]) => [k, expand(v)])) };
}

async function callExec(command) {
  const { url, headers } = loadOpenClawServer();
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "exec", arguments: { command } } }),
  });
  const body = await res.text();
  const json = body.trim().startsWith("{") ? JSON.parse(body)
    : JSON.parse(body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() ?? "{}");
  const text = (json.result?.content ?? []).map((c) => c.text ?? "").join("\n") || json.error?.message || body.slice(0, 300);
  return { status: res.status, isError: json.result?.isError === true || Boolean(json.error), text };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
async function runTurn(first) {
  const started = Date.now();
  emit({ type: "system", subtype: "init", session_id: sessionId, model, tools: ["mcp__openclaw__exec"], mcp_servers: [{ name: "openclaw", status: "connected" }], cwd: process.cwd(), permissionMode: "default", apiKeySource: "none", slash_commands: [], uuid: randomUUID() });
  const proof = /MCP-EXEC:(\/\S+)/u.exec(textOf(first))?.[1];
  let text = "FAKE-REPLY no exec requested";
  let turns = 1;
  if (proof) {
    const toolId = `toolu_fake_${randomUUID().slice(0, 8)}`;
    const input = { command: `printf ok > ${proof}` };
    emit({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content: [{ type: "tool_use", id: toolId, name: "mcp__openclaw__exec", input }], stop_reason: "tool_use", usage }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    let outcome;
    try { outcome = await callExec(input.command); } catch (error) { outcome = { status: 0, isError: true, text: String(error?.message ?? error) }; }
    log({ event: "exec", ...outcome, text: outcome.text.slice(0, 400) });
    emit({ type: "user", message: { role: "user", content: [{ tool_use_id: toolId, type: "tool_result", content: outcome.text, is_error: outcome.isError }] }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
    text = outcome.isError ? `MCP-EXEC-ERROR ${outcome.text.slice(0, 200)}` : `MCP-EXEC-OK ${proof}`;
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
