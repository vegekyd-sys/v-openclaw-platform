import assert from 'node:assert/strict';

// Count skills that Codex reads through its own shell as skill usage (V 2026-11-10).
//
// Since the default model moved to the Codex harness (/vds, 2026-11-09 12:23) the skill_usage table
// has had no new row (last write 11/09 11:49 CST). Codex reads SKILL.md with exec_command, e.g.
//   sed -n 1,120p /home/openclaw/makaron-openclaw/.openclaw-local/workspace/skills/video-text-removal/SKILL.md
//   cd /home/openclaw/makaron-openclaw/.openclaw-local/workspace && sed -n 1,60p skills/cdn-upload/SKILL.md
// while usage is recognized only in OpenClaw's before-tool-call wrapper for its own `read` tool.
// Consequences: usage statistics stop, the experience review's "Skills used" receipt is empty, and a
// foreground skill_workshop patch (which requires the run to have used the skill) is refused.
//
// codex-skill-usage-v1 adds recordNativeCommandSkillUsage next to findSkillUsageMatch in the core
// before-tool-call chunk (same skillUsageByRun map that consumeRunSkillUsage drains at agent end, and
// the same trusted skill.used diagnostic that the curator writes to skill_usage), exports it through
// plugin-sdk/agent-harness-runtime, and calls it from the Codex projector for completed
// commandExecution items. Only read-only printers (cat, sed without -i, head, tail, nl, less, more,
// awk, bat) of SKILL.md paths that match the run's skill snapshot count.
// OPENCLAW_NATIVE_SKILL_USAGE=0 turns the recording off.
//
// Source: openclaw-versa versa/port-codex-skill-usage-20261110 @ 1cd93260ce7.

export const MARKER = 'codex-skill-usage-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// Compiled from src/agents/native-command-skill-usage.ts (1cd93260ce7); path, os,
// findSkillUsageMatch, emitSkillUsedDiagnostic and recordRunSkillUsage are this chunk's own bindings.
const CORE_HELPER = `//#region src/agents/native-command-skill-usage.ts
// ${MARKER}: Codex reads SKILL.md through its own shell; count those reads like an OpenClaw read.
const NATIVE_SKILL_READ_COMMANDS = new Set([
	"cat",
	"sed",
	"head",
	"tail",
	"nl",
	"less",
	"more",
	"awk",
	"bat",
	"batcat"
]);
const NATIVE_SKILL_PREFIX_COMMANDS = new Set([
	"sudo",
	"command",
	"exec",
	"nice",
	"ionice",
	"env",
	"time"
]);
const NATIVE_SKILL_SHELL_WRAPPER = /^\\s*(?:\\S*\\/)?(?:bash|sh|zsh|dash)\\s+-[a-z]*c[a-z]*\\s+([\\s\\S]+)$/;
const NATIVE_SKILL_FILE_TOKEN = /(?:^|[\\s'"\`=(<])((?:~|\\.{1,2})?\\/?[^\\s'"\`;|&<>()$*?]*SKILL\\.md)(?=$|[\\s'"\`;|&<>)])/g;
const NATIVE_SKILL_MAX_COMMAND_CHARS = 16384;
function nativeSkillUnquote(value) {
	const trimmed = value.trim();
	if (trimmed.length >= 2 && (trimmed[0] === "'" || trimmed[0] === "\\"") && trimmed.at(-1) === trimmed[0]) return trimmed.slice(1, -1);
	return trimmed;
}
function nativeSkillUnwrapShell(command) {
	let current = command;
	for (let depth = 0; depth < 3; depth++) {
		const match = NATIVE_SKILL_SHELL_WRAPPER.exec(current);
		if (!match?.[1]) break;
		current = nativeSkillUnquote(match[1]);
	}
	return current;
}
function nativeSkillExpandHome(value) {
	if (value === "~") return os.homedir();
	return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
function nativeSkillCommandWords(segment) {
	return segment.trim().split(/\\s+/).map((word) => nativeSkillUnquote(word)).filter(Boolean);
}
function nativeSkillSegmentProgram(words) {
	let index = 0;
	while (index < words.length) {
		const word = words[index];
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
			index++;
			continue;
		}
		const name = path.basename(word);
		if (NATIVE_SKILL_PREFIX_COMMANDS.has(name)) {
			index++;
			while (index < words.length && words[index].startsWith("-")) {
				const option = words[index];
				index++;
				if (/^-[a-z]$/i.test(option) && index < words.length && !words[index].startsWith("-")) index++;
			}
			continue;
		}
		return {
			name,
			args: words.slice(index + 1)
		};
	}
}
function nativeSkillIsReadOnlyFilePrinter(program) {
	if (!NATIVE_SKILL_READ_COMMANDS.has(program.name)) return false;
	return !program.args.some((arg) => /^-(?:i|-in-place)/.test(arg) || arg === "inplace");
}
function extractSkillFileReads(params) {
	const command = params.command;
	if (!command || command.length > NATIVE_SKILL_MAX_COMMAND_CHARS || !command.includes("SKILL.md")) return [];
	const shellText = nativeSkillUnwrapShell(command).split(/<<-?\\s*['"]?[A-Za-z_]+['"]?/)[0] ?? "";
	let cwd = params.cwd && path.isAbsolute(params.cwd) ? params.cwd : void 0;
	const reads = [];
	for (const segment of shellText.split(/&&|\\|\\||[;|\\n]/)) {
		const words = nativeSkillCommandWords(segment);
		if (words[0] === "cd") {
			const target = words[1] ? nativeSkillExpandHome(words[1]) : os.homedir();
			cwd = path.isAbsolute(target) ? path.resolve(target) : cwd && path.resolve(cwd, target);
			continue;
		}
		if (!segment.includes("SKILL.md")) continue;
		const program = nativeSkillSegmentProgram(words);
		if (!program || !nativeSkillIsReadOnlyFilePrinter(program)) continue;
		for (const match of segment.matchAll(NATIVE_SKILL_FILE_TOKEN)) {
			const tokenStart = match.index + match[0].length - match[1].length;
			if (/>\\s*['"]?$/.test(segment.slice(0, tokenStart))) continue;
			const token = nativeSkillExpandHome(match[1]);
			if (path.isAbsolute(token)) reads.push(path.resolve(token));
			else if (cwd) reads.push(path.resolve(cwd, token));
		}
	}
	return [...new Set(reads)];
}
function recordNativeCommandSkillUsage(params) {
	if (process.env.OPENCLAW_NATIVE_SKILL_USAGE === "0") return 0;
	if (typeof params.command !== "string" || !params.ctx.runId) return 0;
	if (!params.ctx.skillsSnapshot?.resolvedSkills?.length && !params.ctx.skillUsagePaths?.length) return 0;
	const reads = extractSkillFileReads({
		command: params.command,
		cwd: typeof params.cwd === "string" ? params.cwd : params.ctx.workspaceDir
	});
	let recorded = 0;
	const seen = /* @__PURE__ */ new Set();
	for (const filePath of reads) {
		const match = findSkillUsageMatch({
			toolName: "read",
			toolParams: { path: filePath },
			ctx: params.ctx
		});
		if (!match) continue;
		const key = \`\${match.skillSource}\\u0000\${match.skillName}\\u0000\${match.skillFile ?? ""}\`;
		if (seen.has(key)) continue;
		seen.add(key);
		recordRunSkillUsage({
			runId: params.ctx.runId,
			name: match.skillName,
			source: match.skillSource,
			activation: match.activation,
			...match.skillFile ? { skillFile: match.skillFile } : {}
		});
		emitSkillUsedDiagnostic({
			ctx: params.ctx,
			match,
			toolName: params.toolName ?? "exec",
			...params.toolCallId ? { toolCallId: params.toolCallId } : {}
		});
		recorded++;
	}
	return recorded;
}
//#endregion
`;

// core/dist/agent-tools.before-tool-call-g2OT63u5.js
export function patchBeforeToolCallChunk(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `function emitToolBlockedSecurityEvent(params) {`,
    `${CORE_HELPER}function emitToolBlockedSecurityEvent(params) {`,
    'emitToolBlockedSecurityEvent anchor');
  out = replaceExactlyOnce(out,
    `getBeforeToolCallPolicyDiagnosticState as y, bindAuthorizedClientVoiceConfirmation as z };`,
    `getBeforeToolCallPolicyDiagnosticState as y, bindAuthorizedClientVoiceConfirmation as z, recordNativeCommandSkillUsage as codexSkillUsageV1 };`,
    'chunk export list');
  return out;
}

// core/dist/plugin-sdk/agent-harness-runtime.js
export function patchAgentHarnessRuntime(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `x as runBeforeToolCallHook, y as getBeforeToolCallPolicyDiagnosticState } from "../agent-tools.before-tool-call-g2OT63u5.js";`,
    `x as runBeforeToolCallHook, y as getBeforeToolCallPolicyDiagnosticState, codexSkillUsageV1 as recordNativeCommandSkillUsage } from "../agent-tools.before-tool-call-g2OT63u5.js";
// ${MARKER}: native shell reads of SKILL.md count as skill usage.`,
    'before-tool-call import');
  out = replaceExactlyOnce(out,
    ` runBeforeToolCallHook, runHarnessContextEngineMaintenance,`,
    ` recordNativeCommandSkillUsage, runBeforeToolCallHook, runHarnessContextEngineMaintenance,`,
    'runtime export list');
  return out;
}

// codex dist/run-attempt-D1hJO4fX.js (V bytes include v-codex-turn-end-terminals-v1)
export function patchCodexRunAttempt(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    ` runAgentHarnessAfterCompactionHook,`,
    ` recordNativeCommandSkillUsage, runAgentHarnessAfterCompactionHook,`,
    'agent-harness-runtime import');
  out = replaceExactlyOnce(out,
    `	async handleItemCompleted(params) {
		const item = readItem(params.item);
		this.diagnostics.warnUnknownItemStatus(item);
		this.recordNativeToolOutcome(item);
		this.clearTerminalPresentationForNativeItem(item);
`,
    `	async handleItemCompleted(params) {
		const item = readItem(params.item);
		this.diagnostics.warnUnknownItemStatus(item);
		this.recordNativeToolOutcome(item);
		this.clearTerminalPresentationForNativeItem(item);
		// ${MARKER}: Codex reads skills with its own shell; count those reads like an OpenClaw read.
		if (item?.type === "commandExecution" && itemStatus(item) === "completed") try {
			recordNativeCommandSkillUsage({
				command: item.command,
				cwd: item.cwd,
				toolCallId: item.id,
				ctx: {
					runId: this.params.runId,
					agentId: this.options.agentHookContext?.agentId ?? this.params.agentId,
					sessionKey: this.options.agentHookContext?.sessionKey ?? this.params.sessionKey,
					sessionId: this.params.sessionId,
					workspaceDir: this.params.workspaceDir,
					skillsSnapshot: this.params.skillsSnapshot
				}
			});
		} catch {}
`,
    'handleItemCompleted');
  return out;
}

const CODEX_DIST = 'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist';

export const FILES = [
  { name: 'agent-tools.before-tool-call-g2OT63u5.js', base: 'core/dist', target: 'openclaw/dist', before: '618ab46aa1b398a0815c461fd7af3b721272968ed3652e77639171604bb5f9e9', patch: patchBeforeToolCallChunk },
  { name: 'agent-harness-runtime.js', base: 'core/dist/plugin-sdk', target: 'openclaw/dist/plugin-sdk', before: '4024aeb4ff992994a176675b5288826c5491dd195c126a350a0a8898c5126c07', patch: patchAgentHarnessRuntime },
  { name: 'run-attempt-D1hJO4fX.js', base: 'codex/dist', target: CODEX_DIST, before: '23705af0ceb5a879284ed04206cfba97be80bc872bfaf8cab21f601b3551d5cb', patch: patchCodexRunAttempt },
];
