// The before_tool_call handler. It only blocks; it never rewrites parameters (Codex refuses
// rewritten parameters, memory codex-refuses-hook-param-rewrite). Any internal error lets
// the call through: the hook runner treats a throw as a block (fail-closed), and a bug here
// must not stop every shell command on V.
//
// Tool names seen here (OpenClaw 9.1):
//   exec     OpenClaw exec (Worker, PI harness, Codex dynamic tool `exec`) and Codex's native
//            exec_command, which the native hook relay renames to `exec` and whose `cmd`
//            it copies to `command` (native-hook-relay-codec.ts).
//   process  OpenClaw process write / paste / send-keys: text typed into a running shell.
// Codex's native write_stdin never reaches a PreToolUse hook (2026-10-31 harness
// comparison); that path is not covered. See README.

import { DEFAULT_FIND_MAX_DEPTH, DEFAULT_HOME, DEFAULT_PROTECTED_ROOTS, compileRoots, findForbiddenScan } from "./scan.js";

export const MATCHER = Object.freeze(["exec", "process"]);
const EXEC_TOOLS = new Set(["exec", "bash", "shell", "exec_command", "local_shell"]);
const PROCESS_TEXT_ACTIONS = new Set(["write", "paste", "send-keys"]);

/** The shell text of an exec-like call (string or argv). */
export function commandText(params) {
  const p = params && typeof params === "object" ? params : {};
  const parts = [];
  for (const key of ["command", "cmd", "script", "commandLine"]) {
    const v = p[key];
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === "string").map(shellQuote).join(" "));
  }
  return parts.join("\n");
}

function shellQuote(s) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/u.test(s) ? s : `'${s.replace(/'/gu, `'\\''`)}'`;
}

/** Text typed into a running process by `process write|paste|send-keys`. */
export function processText(params) {
  const p = params && typeof params === "object" ? params : {};
  if (!PROCESS_TEXT_ACTIONS.has(String(p.action ?? ""))) return "";
  return ["data", "text", "literal"].map((k) => p[k]).filter((v) => typeof v === "string").join("\n");
}

export function resolveConfig(raw = {}) {
  const c = raw && typeof raw === "object" ? raw : {};
  const roots = Array.isArray(c.protectedRoots) && c.protectedRoots.length ? c.protectedRoots : DEFAULT_PROTECTED_ROOTS;
  const extra = Array.isArray(c.extraProtectedRoots) ? c.extraProtectedRoots : [];
  return {
    mode: c.mode === "warn" ? "warn" : "block",
    home: typeof c.home === "string" && c.home.startsWith("/") ? c.home : DEFAULT_HOME,
    findMaxDepth: Number.isInteger(c.findMaxDepth) && c.findMaxDepth >= 0 ? c.findMaxDepth : DEFAULT_FIND_MAX_DEPTH,
    compiled: compileRoots([...roots, ...extra]),
  };
}

export function blockText(hit, { findMaxDepth = DEFAULT_FIND_MAX_DEPTH } = {}) {
  return [
    `V blocked this command: \`${hit.tool}\` over ${hit.root} would read tens of GB (Night Shift videos, agent databases, session logs) and freeze the Gateway for every chat. Do not retry it with another spelling, another tool, or a parent directory.`,
    "Ask the owning interface instead, or search one small directory you already know:",
    "- Scheduled jobs: `openclaw automations list --all --json | jq -r '.jobs[]|[.id,.name]|@tsv' | grep -i <word>`, then `openclaw automations get <id>`. Job names are usually Chinese; a script name may not appear in them.",
    "- Night Shift: `nightshiftctl` (on PATH; engine at NIGHTSHIFT_URL=http://127.0.0.1:24879). If it prints `fetch failed`, the exec proxy is in the way: run it as `NO_PROXY=127.0.0.1,localhost nightshiftctl …`. `nightshiftctl projects get|handoff|deliverables|artifact <instance-id>`, `nightshiftctl cards get <card-id>`. A card's own files are in /home/openclaw/.openclaw/nightshift/instances/<instance-id>/content-items/<item-id>/. For `operations reserve --request-hash`, hash the exact request you are about to send (for example `sha256sum` of the request.json you write); it does not have to match another card's hash.",
    "- Sessions and chat history: the sessions_list / sessions_history tools.",
    "- Skills: /home/openclaw/makaron-openclaw/.openclaw-local/workspace/skills/<name>/SKILL.md and /home/openclaw/.agents/skills/<name>/SKILL.md; list those two directories.",
    `- Files: search your workspace or one instance directory; give find/rg/tree a depth limit of ${findMaxDepth} or less.`,
  ].join("\n");
}

/**
 * Build the handler. `log` receives one line per decision that blocks or would block.
 */
export function createScanGuard({ config, log = () => {} } = {}) {
  const cfg = resolveConfig(config);
  return function scanGuard(event, ctx) {
    try {
      const tool = String(event?.toolName ?? ctx?.toolName ?? "").toLowerCase();
      const params = event?.params;
      let text = "";
      if (EXEC_TOOLS.has(tool)) text = commandText(params);
      else if (tool === "process") text = processText(params);
      else return undefined;
      if (!text) return undefined;
      const workdir = typeof params?.workdir === "string" && params.workdir.startsWith("/") ? params.workdir : undefined;
      const cwd = workdir ?? (typeof ctx?.cwd === "string" ? ctx.cwd : undefined) ?? (typeof ctx?.workspaceDir === "string" ? ctx.workspaceDir : undefined);
      const hit = findForbiddenScan(text, { cwd, home: cfg.home, compiled: cfg.compiled, findMaxDepth: cfg.findMaxDepth });
      if (!hit) return undefined;
      log(`${cfg.mode === "warn" ? "would block" : "blocked"} ${hit.tool} over ${hit.root} (operand ${hit.operand}) tool=${tool} session=${ctx?.sessionKey ?? "?"} run=${ctx?.runId ?? "?"} cmd=${JSON.stringify(text.slice(0, 200))}`);
      if (cfg.mode === "warn") return undefined;
      return { block: true, blockReason: blockText(hit, cfg) };
    } catch (error) {
      try { log(`error, letting the call through: ${error?.stack ?? error}`); } catch { /* ignore */ }
      return undefined;
    }
  };
}
