import { o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import "./session-accessor-K0XuW6ln.js";
import { t as formatDurationCompact } from "./format-duration-Dhk0Yxqe.js";
import { n as resolveSubagentLabel } from "./subagents-utils-BdwmOKvm.js";
import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead } from "./subagent-registry-read-UaDFTyfW.js";
import { w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { a as shouldKeepSubagentRunChildLink, c as resolveSubagentDisplayStatus, o as getSubagentSessionRuntimeMs, s as getSubagentSessionStartedAt } from "./subagent-run-liveness-CrhVXF5Y.js";
import { t as buildSubagentRunView } from "./subagent-run-view-BqhTqM1D.js";
import { n as resolveModelDisplayRef, t as resolveModelDisplayName } from "./model-selection-display-Bi55ID0l.js";
//#region src/shared/subagents-format.ts
/** Formats token counts using compact k/m suffixes for subagent summaries. */
function formatTokenShort(value) {
	if (!value || !Number.isFinite(value) || value <= 0) return;
	const n = Math.floor(value);
	if (n < 1e3) return `${n}`;
	if (n < 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
	if (n < 1e6) {
		const thousands = Math.round(n / 1e3);
		if (thousands < 1e3) return `${thousands}k`;
	}
	return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}m`;
}
/** Truncates a single-line display string without preserving trailing whitespace. */
function truncateLine(value, maxLength) {
	const limit = Math.max(0, Math.floor(maxLength));
	const trimmed = value.trimEnd();
	if (trimmed.length <= limit) return trimmed;
	const marker = "...";
	if (limit <= 3) return marker.slice(0, limit);
	return `${truncateUtf16Safe(trimmed, limit - 3).trimEnd()}${marker}`;
}
/** Resolves total token usage, falling back to input+output when no explicit total exists. */
function resolveTotalTokens(entry) {
	if (!entry || typeof entry !== "object") return;
	if (typeof entry.totalTokens === "number" && Number.isFinite(entry.totalTokens) && entry.totalTokensFresh === true && entry.totalTokensVersion === 1) return entry.totalTokens;
	const total = (typeof entry.inputTokens === "number" ? entry.inputTokens : 0) + (typeof entry.outputTokens === "number" ? entry.outputTokens : 0);
	return total > 0 ? total : void 0;
}
/** Resolves finite input/output token usage and the derived total. */
function resolveIoTokens(entry) {
	if (!entry || typeof entry !== "object") return;
	const input = typeof entry.inputTokens === "number" && Number.isFinite(entry.inputTokens) ? entry.inputTokens : 0;
	const output = typeof entry.outputTokens === "number" && Number.isFinite(entry.outputTokens) ? entry.outputTokens : 0;
	const total = input + output;
	if (total <= 0) return;
	return {
		input,
		output,
		total
	};
}
/** Formats token usage for compact subagent list/detail displays. */
function formatTokenUsageDisplay(entry) {
	const io = resolveIoTokens(entry);
	const promptCache = resolveTotalTokens(entry);
	const parts = [];
	if (io) {
		const input = formatTokenShort(io.input) ?? "0";
		const output = formatTokenShort(io.output) ?? "0";
		parts.push(`tokens ${formatTokenShort(io.total)} (in ${input} / out ${output})`);
	} else if (typeof promptCache === "number" && promptCache > 0) parts.push(`tokens ${formatTokenShort(promptCache)} prompt/cache`);
	if (typeof promptCache === "number" && io && promptCache > io.total) parts.push(`prompt/cache ${formatTokenShort(promptCache)}`);
	return parts.join(", ");
}
//#endregion
//#region src/agents/subagents/registry/subagent-list.ts
/**
* Subagent list builder.
*
* Combines live registry runs and persisted session metadata for sessions_list/subagents views.
*/
function resolveStorePathForKey(cfg, parsed) {
	return resolveSessionStorePathCore(cfg.session?.store, { agentId: parsed?.agentId });
}
/** Resolve persisted session metadata for a session key, caching per store path. */
function resolveSessionEntryForKey(params) {
	const parsed = parseAgentSessionKey(params.key);
	const storePath = resolveStorePathForKey(params.cfg, parsed);
	let store = params.cache.get(storePath);
	if (!store) {
		store = Object.fromEntries(listSessionEntriesReadOnly({
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		params.cache.set(storePath, store);
	}
	return {
		storePath,
		entry: store[params.key]
	};
}
/** Build child-session indexes from the latest run associated with each child key. */
function buildLatestSubagentRunIndex(runs, options) {
	const now = options?.now ?? Date.now();
	const readIndex = buildSubagentRunReadIndexFromRuns({
		runs,
		now
	});
	const childSessionsByController = /* @__PURE__ */ new Map();
	for (const [childSessionKey, entry] of readIndex.latestRunsByChildSessionKey) {
		const controllerSessionKey = entry.controllerSessionKey?.trim() || entry.requesterSessionKey?.trim();
		if (!controllerSessionKey) continue;
		if (!shouldKeepSubagentRunChildLink(entry, {
			activeDescendants: readIndex.countActiveDescendantRuns(childSessionKey),
			now
		})) continue;
		const existing = childSessionsByController.get(controllerSessionKey);
		if (existing) {
			existing.push(childSessionKey);
			continue;
		}
		childSessionsByController.set(controllerSessionKey, [childSessionKey]);
	}
	for (const [controllerSessionKey, childSessions] of childSessionsByController) childSessionsByController.set(controllerSessionKey, childSessions.toSorted());
	return {
		childSessionsByController,
		readIndex
	};
}
function resolveModelRef(entry, fallbackModel) {
	return resolveModelDisplayRef({
		runtimeProvider: entry?.modelProvider,
		runtimeModel: entry?.model,
		overrideProvider: entry?.providerOverride,
		overrideModel: entry?.modelOverride,
		fallbackModel
	});
}
function resolveModelDisplay(entry, fallbackModel) {
	return resolveModelDisplayName({
		runtimeProvider: entry?.modelProvider,
		runtimeModel: entry?.model,
		overrideProvider: entry?.providerOverride,
		overrideModel: entry?.modelOverride,
		fallbackModel
	});
}
function buildListText(params) {
	const lines = [];
	lines.push("active subagents:");
	if (params.active.length === 0) lines.push("(none)");
	else lines.push(...params.active.map((entry) => entry.line));
	lines.push("");
	lines.push(`recent (last ${params.recentMinutes}m):`);
	if (params.recent.length === 0) lines.push("(none)");
	else lines.push(...params.recent.map((entry) => entry.line));
	return lines.join("\n");
}
/** Build structured and text views for active and recent subagent runs. */
function buildSubagentList(params) {
	const now = Date.now();
	const cache = /* @__PURE__ */ new Map();
	const { childSessionsByController, readIndex } = buildLatestSubagentRunIndex(getSubagentRunsSnapshotForRead(subagentRuns));
	const pendingDescendantCount = (sessionKey) => readIndex.countPendingDescendantRuns(sessionKey);
	const runView = buildSubagentRunView({
		runs: params.runs,
		recentMinutes: params.recentMinutes,
		countPendingDescendantRuns: pendingDescendantCount,
		now
	});
	let index = 1;
	const buildListEntry = (entry, runtimeMs) => {
		const sessionEntry = resolveSessionEntryForKey({
			cfg: params.cfg,
			key: entry.childSessionKey,
			cache
		}).entry;
		const totalTokens = resolveTotalTokens(sessionEntry);
		const usageText = formatTokenUsageDisplay(sessionEntry);
		const pendingDescendants = pendingDescendantCount(entry.childSessionKey);
		const status = resolveSubagentDisplayStatus(entry, pendingDescendants);
		const childSessions = childSessionsByController.get(entry.childSessionKey) ?? [];
		const runtime = formatDurationCompact(runtimeMs) ?? "n/a";
		const label = truncateLine(resolveSubagentLabel(entry), 48);
		const task = truncateLine(entry.task.trim(), params.taskMaxChars ?? 72);
		const taskName = entry.taskName?.trim();
		const taskNamePrefix = taskName ? `${taskName}: ` : "";
		const line = `${index}. ${taskNamePrefix}${label} (${resolveModelDisplay(sessionEntry, entry.model)}, ${runtime}${usageText ? `, ${usageText}` : ""}) ${status}${normalizeLowercaseStringOrEmpty(task) !== normalizeLowercaseStringOrEmpty(label) ? ` - ${task}` : ""}`;
		const view = {
			index,
			line,
			runId: entry.runId,
			sessionKey: entry.childSessionKey,
			...taskName ? { taskName } : {},
			label,
			task,
			status,
			pendingDescendants,
			runtime,
			runtimeMs,
			...childSessions.length > 0 ? { childSessions } : {},
			model: resolveModelRef(sessionEntry, entry.model),
			totalTokens,
			startedAt: getSubagentSessionStartedAt(entry),
			...entry.execution.endedAt ? { endedAt: entry.execution.endedAt } : {}
		};
		index += 1;
		return view;
	};
	const active = runView.active.map((entry) => buildListEntry(entry, getSubagentSessionRuntimeMs(entry, now) ?? 0));
	const recent = runView.recent.map((entry) => buildListEntry(entry, getSubagentSessionRuntimeMs(entry, entry.execution.endedAt ?? now) ?? 0));
	return {
		total: runView.latest.length,
		active,
		recent,
		text: buildListText({
			active,
			recent,
			recentMinutes: params.recentMinutes
		})
	};
}
//#endregion
export { buildSubagentList as t };
