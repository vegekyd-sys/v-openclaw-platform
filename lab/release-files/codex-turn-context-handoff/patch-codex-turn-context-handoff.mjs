#!/usr/bin/env node
// OpenClaw 2026.9.1 (V), Codex plugin: deliver SOUL/IDENTITY/USER/MEMORY and the OpenClaw memory and
// skills instructions as a thread developer message, not as collaboration-mode developer_instructions.
//
//   node patch-codex-turn-context-handoff.mjs --codex-dist <@openclaw/codex dist> [--check]
//
// Why (README.md): Codex 0.159.2 replaces collaboration-mode developer_instructions with the model
// catalog's Default-mode text whenever the catalog has one (core/src/context/world_state/
// collaboration_mode.rs, `catalog_override()` wins over `settings.developer_instructions`). Every
// gpt-6.x entry in V's catalog has one, so since 2026-09-05 /vcodex never saw any of that context.
// DeepSeek and gpt-5.x have no override and kept receiving it.
//
// thread-lifecycle: deliverCodexTurnContextHandoff() injects the context with thread/inject_items
// when its hash differs from the last delivery recorded for the thread
// (<agentDir>/codex-turn-context/<threadId>.json). The injected item lands at the end of the
// history, so the cached prefix is untouched; an unchanged context is not re-sent.
// run-attempt: turn/start no longer carries the context in collaborationMode (it falls back to the
// old carrier only when the injection fails); after an in-turn compaction the context is
// re-delivered, because compaction drops client developer messages.
// compact: a standalone compaction forgets the thread's delivery record.
//
// Idempotent: a module that already carries the marker is left alone; otherwise every anchor
// must match exactly once.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexDist = option("--codex-dist");
const checkOnly = args.includes("--check");
assert(codexDist, "usage: patch-codex-turn-context-handoff.mjs --codex-dist <dist> [--check]");
const MARK = "v-codex-turn-context-handoff-v1";

const HELPERS = `//#region ${MARK}
// Codex replaces collaboration-mode developer_instructions with the model catalog's Default-mode
// text when the catalog has one (every gpt-6.x model), so OpenClaw workspace context rides a
// thread developer message instead: injected once per content change, again after compaction.
const CODEX_TURN_CONTEXT_HANDOFF_DIRNAME = "codex-turn-context";
const deliveredCodexTurnContextWithoutMarker = /* @__PURE__ */ new Map();
function resolveCodexTurnContextHandoffMarker(agentDir, threadId) {
	if (typeof agentDir !== "string" || !agentDir.trim()) return;
	return path.join(path.resolve(agentDir), CODEX_TURN_CONTEXT_HANDOFF_DIRNAME, \`\${threadId.replace(/[^\\w.-]/gu, "_")}.json\`);
}
function renderCodexTurnContextHandoff(instructions) {
	const body = instructions ? "The following OpenClaw workspace context is current as of this message. It replaces any earlier OpenClaw workspace context in this conversation (SOUL.md, IDENTITY.md, USER.md, MEMORY.md, and the OpenClaw memory and skills instructions).\\n\\n" + instructions : "The earlier OpenClaw workspace context in this conversation is withdrawn.";
	return \`<openclaw_workspace_context>\\n\${body}\\n</openclaw_workspace_context>\`;
}
async function readCodexTurnContextHandoffRecord(marker, threadId) {
	if (!marker) return deliveredCodexTurnContextWithoutMarker.get(threadId);
	try {
		const record = JSON.parse(await fs.readFile(marker, "utf8"));
		return typeof record?.sha256 === "string" ? record : void 0;
	} catch {
		return;
	}
}
/** Forgets the delivery record so the next turn delivers the context again. */
async function invalidateCodexTurnContextHandoff(params) {
	if (!params.threadId) return;
	deliveredCodexTurnContextWithoutMarker.delete(params.threadId);
	const marker = resolveCodexTurnContextHandoffMarker(params.agentDir, params.threadId);
	if (marker) await fs.rm(marker, { force: true }).catch(() => void 0);
}
/** Returns "unchanged", "delivered", "empty" or "failed"; on "failed" nothing was recorded. */
async function deliverCodexTurnContextHandoff(params) {
	if (!params.threadId) return "failed";
	const instructions = params.instructions?.trim() ? params.instructions.trim() : void 0;
	const marker = resolveCodexTurnContextHandoffMarker(params.agentDir, params.threadId);
	const previous = await readCodexTurnContextHandoffRecord(marker, params.threadId);
	if (!instructions && !previous?.nonEmpty) return "empty";
	const text = renderCodexTurnContextHandoff(instructions);
	const sha256 = createHash("sha256").update(text).digest("hex");
	if (previous?.sha256 === sha256) return "unchanged";
	try {
		await params.client.request("thread/inject_items", {
			threadId: params.threadId,
			items: [{
				type: "message",
				role: "developer",
				content: [{
					type: "input_text",
					text
				}]
			}]
		}, {
			timeoutMs: params.timeoutMs,
			signal: params.signal
		});
	} catch (error) {
		embeddedAgentLog.warn("failed to deliver OpenClaw workspace context to the Codex thread", {
			threadId: params.threadId,
			error: coerceErrorMessage(error)
		});
		return "failed";
	}
	const record = {
		sha256,
		nonEmpty: Boolean(instructions),
		chars: text.length,
		deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	if (!marker) {
		deliveredCodexTurnContextWithoutMarker.set(params.threadId, record);
		return "delivered";
	}
	try {
		await fs.mkdir(path.dirname(marker), { recursive: true });
		const temporary = \`\${marker}.\${process.pid}.\${Date.now()}.tmp\`;
		await fs.writeFile(temporary, JSON.stringify(record), "utf8");
		await fs.rename(temporary, marker);
	} catch (error) {
		// Delivered but unrecorded: the next turn sends it once more rather than never.
		embeddedAgentLog.warn("failed to record OpenClaw workspace context delivery", {
			threadId: params.threadId,
			error: coerceErrorMessage(error)
		});
	}
	return "delivered";
}
//#endregion
`;

const LIFECYCLE_EDITS = [
  ["function buildTurnStartParams(params, options) {\n", `${HELPERS}function buildTurnStartParams(params, options) {\n`],
  ["\nexport { ", "\nexport { deliverCodexTurnContextHandoff as vDeliverTurnContextHandoff, invalidateCodexTurnContextHandoff as vInvalidateTurnContextHandoff, "],
];

const RUN_ATTEMPT_EDITS = [
  [
    ", z as createCodexNativeHookRelay } from \"./thread-lifecycle-DAcEJ_Om.js\";\n",
    `, z as createCodexNativeHookRelay, vDeliverTurnContextHandoff as deliverCodexTurnContextHandoff, vInvalidateTurnContextHandoff as invalidateCodexTurnContextHandoff } from "./thread-lifecycle-DAcEJ_Om.js"; // ${MARK}\n`,
  ],
  [
    "\t\tconnection.mutable.pluginAppServer = turnAppServer;\n\t\tconst turnStartParams = buildTurnStartParams(runtimeParams, {\n",
    "\t\tconnection.mutable.pluginAppServer = turnAppServer;\n" +
    `\t\t// ${MARK}: catalog-backed models drop collaboration-mode developer_instructions\n` +
    "\t\tconst turnContextInstructions = joinPresentSections(workspaceBootstrapContext.turnScopedDeveloperInstructions, workspaceBootstrapContext.memoryCollaborationInstructions, context.skillsCollaborationInstructions);\n" +
    "\t\tresourceState.vTurnContextHandoff = usesSupervisionConnection ? void 0 : {\n" +
    "\t\t\tagentDir: params.agentDir,\n" +
    "\t\t\tinstructions: turnContextInstructions\n" +
    "\t\t};\n" +
    "\t\tconst turnContextHandoff = usesSupervisionConnection ? \"skipped\" : await deliverCodexTurnContextHandoff({\n" +
    "\t\t\tclient: resourceState.client,\n" +
    "\t\t\tthreadId: resourceState.thread.threadId,\n" +
    "\t\t\t...resourceState.vTurnContextHandoff,\n" +
    "\t\t\ttimeoutMs: appServer.requestTimeoutMs,\n" +
    "\t\t\tsignal: runAbortController.signal\n" +
    "\t\t});\n" +
    "\t\tconst turnContextInCollaboration = turnContextHandoff === \"failed\" || turnContextHandoff === \"skipped\";\n" +
    "\t\tconst turnStartParams = buildTurnStartParams(runtimeParams, {\n",
  ],
  [
    "\t\t\tturnScopedDeveloperInstructions: workspaceBootstrapContext.turnScopedDeveloperInstructions,\n" +
    "\t\t\tskillsCollaborationInstructions: context.skillsCollaborationInstructions,\n" +
    "\t\t\tmemoryCollaborationInstructions: workspaceBootstrapContext.memoryCollaborationInstructions,\n" +
    "\t\t\tpreserveNativeTurnSettings: usesSupervisionConnection,\n",
    "\t\t\tturnScopedDeveloperInstructions: turnContextInCollaboration ? workspaceBootstrapContext.turnScopedDeveloperInstructions : void 0,\n" +
    "\t\t\tskillsCollaborationInstructions: turnContextInCollaboration ? context.skillsCollaborationInstructions : void 0,\n" +
    "\t\t\tmemoryCollaborationInstructions: turnContextInCollaboration ? workspaceBootstrapContext.memoryCollaborationInstructions : void 0,\n" +
    "\t\t\tpreserveNativeTurnSettings: usesSupervisionConnection,\n",
  ],
  [
    "\t\t\t\tembeddedAgentLog.warn(\"failed to restore Codex plan state after compaction\", {\n" +
    "\t\t\t\t\trunId: params.runId,\n" +
    "\t\t\t\t\tthreadId: resourceState.thread.threadId,\n" +
    "\t\t\t\t\terror: formatErrorMessage(error)\n" +
    "\t\t\t\t});\n" +
    "\t\t\t}\n" +
    "\t\t}\n",
    "\t\t\t\tembeddedAgentLog.warn(\"failed to restore Codex plan state after compaction\", {\n" +
    "\t\t\t\t\trunId: params.runId,\n" +
    "\t\t\t\t\tthreadId: resourceState.thread.threadId,\n" +
    "\t\t\t\t\terror: formatErrorMessage(error)\n" +
    "\t\t\t\t});\n" +
    "\t\t\t}\n" +
    `\t\t\t// ${MARK}: compaction drops client developer messages, so the context goes back in\n` +
    "\t\t\tif (resourceState.vTurnContextHandoff) {\n" +
    "\t\t\t\tawait invalidateCodexTurnContextHandoff({\n" +
    "\t\t\t\t\tagentDir: resourceState.vTurnContextHandoff.agentDir,\n" +
    "\t\t\t\t\tthreadId: resourceState.thread.threadId\n" +
    "\t\t\t\t});\n" +
    "\t\t\t\tawait deliverCodexTurnContextHandoff({\n" +
    "\t\t\t\t\tclient: resourceState.client,\n" +
    "\t\t\t\t\tthreadId: resourceState.thread.threadId,\n" +
    "\t\t\t\t\t...resourceState.vTurnContextHandoff,\n" +
    "\t\t\t\t\ttimeoutMs: connection.appServer.requestTimeoutMs,\n" +
    "\t\t\t\t\tsignal: runAbortController.signal\n" +
    "\t\t\t\t});\n" +
    "\t\t\t}\n" +
    "\t\t}\n",
  ],
];

const COMPACT_EDITS = [
  [
    "import { AsyncLocalStorage } from \"node:async_hooks\";\n",
    "import { AsyncLocalStorage } from \"node:async_hooks\";\n" +
    `import fsTurnContextHandoff from "node:fs/promises"; // ${MARK}\n` +
    `import pathTurnContextHandoff from "node:path"; // ${MARK}\n`,
  ],
  [
    "\t\t\t\t\t\telse await client.request(\"thread/compact/start\", { threadId: binding.threadId }, { timeoutMs: guardedRequestTimeoutMs });\n" +
    "\t\t\t\t\t\treturn {\n",
    "\t\t\t\t\t\telse await client.request(\"thread/compact/start\", { threadId: binding.threadId }, { timeoutMs: guardedRequestTimeoutMs });\n" +
    `\t\t\t\t\t\t// ${MARK}: compaction drops the injected workspace context; the next turn re-delivers it\n` +
    "\t\t\t\t\t\tif (typeof params.agentDir === \"string\" && params.agentDir.trim()) await fsTurnContextHandoff.rm(pathTurnContextHandoff.join(pathTurnContextHandoff.resolve(params.agentDir), \"codex-turn-context\", `${binding.threadId.replace(/[^\\w.-]/gu, \"_\")}.json`), { force: true }).catch(() => void 0);\n" +
    "\t\t\t\t\t\treturn {\n",
  ],
];

function findOne(dir, pattern, definition) {
  const hits = fs.readdirSync(dir).filter((f) => pattern.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(definition));
  assert.equal(hits.length, 1, `expected one ${pattern} in ${dir} defining ${definition}, found ${hits.length}`);
  return hits[0];
}

function patchFile(file, edits) {
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(MARK)) {
    console.log(`already patched: ${file}`);
    return;
  }
  for (const [before, after] of edits) {
    const count = source.split(before).length - 1;
    assert.equal(count, 1, `${path.basename(file)}: anchor matched ${count} times: ${before.slice(0, 120)}`);
    source = source.replace(before, () => after);
  }
  if (checkOnly) {
    console.log(`would patch: ${file}`);
    return;
  }
  fs.writeFileSync(file, source);
  console.log(`patched: ${file}`);
}

patchFile(findOne(codexDist, /^thread-lifecycle-[\w-]+\.js$/u, "function buildTurnStartParams(params, options) {"), LIFECYCLE_EDITS);
patchFile(findOne(codexDist, /^run-attempt-[\w-]+\.js$/u, "const startCodexTurn = async () => {"), RUN_ATTEMPT_EDITS);
patchFile(findOne(codexDist, /^compact-[\w-]+\.js$/u, "async function maybeCompactCodexAppServerSession(params, options) {"), COMPACT_EDITS);
