// Backport to OpenClaw 2026.9.1 of how 2026.9.8 reports loopback MCP tool calls:
// after a tool called through the Gateway's MCP loopback (Claude Code / claude-cli
// harness) finishes, plugins' after_tool_call hooks run, like for every other
// harness. 9.1 only ran before_tool_call there, so a plugin could see a claude-cli
// turn start a sessions_send but never what it returned. Drop on 2026.9.8.
import fs from "node:fs";

export const MARKER = "v-mcp-after-tool-call-v1";
export const FILE = "mcp-http-BL3X6y4w.js";

const IMPORT_ANCHOR = 'import { x as runBeforeToolCallHook } from "./agent-tools.before-tool-call-g2OT63u5.js";\n';
const ID_ANCHOR = "\t\t\tconst toolCallId = `mcp-${crypto.randomUUID()}`;\n";
const REPORT_ANCHOR = "\t\t\tconst reportToolCallResult = (outcome) => {\n";

function once(source, anchor, label) {
  const parts = source.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: expected exactly one anchor, found ${parts.length - 1}`);
  }
  return parts;
}

export function patchMcpAfterToolCall(source) {
  if (source.includes(MARKER)) {
    throw new Error("already patched");
  }
  let [a, b] = once(source, IMPORT_ANCHOR, "import");
  let out = `${a}${IMPORT_ANCHOR}import { t as runAgentHarnessAfterToolCallHook } from "./hook-helpers-D11aAm0B.js";\n${b}`;
  [a, b] = once(out, ID_ANCHOR, "toolCallId");
  out = `${a}${ID_ANCHOR}\t\t\tconst startedAt = Date.now();\n${b}`;
  [a, b] = once(out, REPORT_ANCHOR, "reportToolCallResult");
  out = `${a}${REPORT_ANCHOR}\t\t\t\t// ${MARKER}
\t\t\t\tvoid runAgentHarnessAfterToolCallHook({
\t\t\t\t\ttoolName,
\t\t\t\t\ttoolCallId,
\t\t\t\t\trunId: params.hookContext?.runId,
\t\t\t\t\tagentId: params.hookContext?.agentId,
\t\t\t\t\tsessionId: params.hookContext?.sessionId,
\t\t\t\t\tsessionKey: params.hookContext?.sessionKey,
\t\t\t\t\tchannelId: params.hookContext?.channelId,
\t\t\t\t\tstartArgs: executedToolArgs,
\t\t\t\t\tresult: outcome?.outcome === "completed" ? outcome.result : void 0,
\t\t\t\t\terror: outcome?.outcome === "completed" ? void 0 : String(outcome?.deniedReason ?? outcome?.outcome ?? "failed"),
\t\t\t\t\tstartedAt
\t\t\t\t}).catch(() => {});
${b}`;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, patchMcpAfterToolCall(fs.readFileSync(input, "utf8")));
}
