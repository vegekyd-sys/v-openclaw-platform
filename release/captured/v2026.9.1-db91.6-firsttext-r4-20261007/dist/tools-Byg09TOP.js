import { i as extractErrorCode } from "./error-coercion-CwcmpTBO.js";
import { o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { t as runTasksWithConcurrency } from "./run-with-concurrency-B6LtW2cN.js";
import { C as resolveMemoryDreamingPluginConfig, S as resolveMemoryDreamingConfig, x as resolveMemoryDeepDreamingConfig } from "./dreaming-DIS78cO9.js";
import { t as jsonResult } from "./tool-results-BCM3fdVS.js";
import { c as readFiniteNumberParam, d as readPositiveIntegerParam, h as readToolStringParam, t as asToolParamsRecord } from "./common-BhOX6DcU.js";
import { l as listMemoryCorpusSupplements } from "./memory-state-D4Yq0L6U.js";
import { i as resolveMemoryIndexIdentityDiagnostic, o as resolveMemorySearchStaleness, t as formatMemoryIndexRebuildGuidance } from "./types-BTd4wVMl.js";
import { i as stripMemoryAnnotationCarriers } from "./curated-annotations-mTWgerpx.js";
import "./error-runtime-BmBsU1OI.js";
import "./string-coerce-runtime-GQa0ehRA.js";
import "./concurrency-runtime-FCrMdNix.js";
import "./memory-core-host-engine-storage-BNZxTLNx.js";
import "./memory-core-host-status-BqyOIWIU.js";
import "./memory-core-host-runtime-core-C9t6AAay.js";
import { i as resolveMemoryToolContext, n as MEMORY_SEARCH_TOOL_CONTRACT, t as MEMORY_GET_TOOL_CONTRACT } from "./memory-tool-contract-eof3DmSN.js";
import { f as recordShortTermRecalls } from "./short-term-promotion-xOxshjOW.js";
import { t as filterMemorySearchHitsBySessionVisibility } from "./session-search-visibility-H6aL2Pcb.js";
//#region extensions/memory-core/src/memory/search-deadline.ts
const DEFAULT_MEMORY_SEARCH_TIMEOUT_MS = 25e3;
const DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS = 15e3;
function resolveMemorySearchAbortError(signal) {
	const { reason } = signal;
	if (reason instanceof Error) return reason;
	return new Error(typeof reason === "string" ? reason : "memory search aborted");
}
const memorySearchDeadlineErrors = /* @__PURE__ */ new WeakSet();
function createMemorySearchDeadlineError(message) {
	const error = new Error(message);
	memorySearchDeadlineErrors.add(error);
	return error;
}
function createMemorySearchTimeoutError(timeoutMs) {
	return createMemorySearchDeadlineError(`memory_search timed out after ${Math.round(timeoutMs / 1e3)}s`);
}
function isMemorySearchDeadlineError(error) {
	return typeof error === "object" && error !== null && memorySearchDeadlineErrors.has(error);
}
async function runMemorySearchWithDeadline(params) {
	if (params.parentSignal?.aborted) throw resolveMemorySearchAbortError(params.parentSignal);
	const controller = new AbortController();
	const timeoutError = createMemorySearchTimeoutError(params.timeoutMs);
	const timeoutOutcome = { type: "timeout" };
	const parentAbortOutcome = { type: "parent-abort" };
	let timer;
	const deadlineStartedAt = Date.now();
	let removeParentAbort;
	let resolveTimeout;
	const timeoutPromise = new Promise((resolve) => {
		resolveTimeout = resolve;
	});
	const reachDefaultDeadline = () => {
		resolveTimeout(timeoutOutcome);
		controller.abort(timeoutError);
	};
	timer = setTimeout(() => {
		timer = void 0;
		reachDefaultDeadline();
	}, params.timeoutMs);
	timer.unref?.();
	const parentSignal = params.parentSignal;
	const parentAbortPromise = parentSignal ? new Promise((resolve) => {
		const onAbort = () => {
			resolve(parentAbortOutcome);
			controller.abort(resolveMemorySearchAbortError(parentSignal));
		};
		parentSignal.addEventListener("abort", onAbort, { once: true });
		removeParentAbort = () => parentSignal.removeEventListener("abort", onAbort);
	}) : void 0;
	const task = Promise.resolve().then(() => params.run(controller.signal));
	task.catch(() => void 0);
	try {
		const result = await Promise.race(parentAbortPromise ? [
			task,
			timeoutPromise,
			parentAbortPromise
		] : [task, timeoutPromise]);
		if (result === parentAbortOutcome) throw resolveMemorySearchAbortError(parentSignal);
		if (result === timeoutOutcome) throw timeoutError;
		if (parentSignal?.aborted) throw resolveMemorySearchAbortError(parentSignal);
		if (timer !== void 0 && Date.now() - deadlineStartedAt >= params.timeoutMs) {
			reachDefaultDeadline();
			throw timeoutError;
		}
		return result;
	} finally {
		if (timer) clearTimeout(timer);
		removeParentAbort?.();
	}
}
//#endregion
//#region extensions/memory-core/src/memory-corpus.ts
/**
* Flattening the failure to a string is where provenance would be lost: a
* provider is free to emit the very text this tool uses for its own timeout, so
* the deadline is carried across the boundary as a flag taken from the error
* object while it is still here. Callers that already hold a flattened error
* pass the flag they were given.
*/
function unavailableMemoryCorpus(corpus, value, error, deadline = isMemorySearchDeadlineError(error)) {
	const code = extractErrorCode(error);
	return {
		corpus,
		outcome: "unavailable",
		value,
		error: formatErrorMessage(error),
		deadline,
		...code ? { code } : {}
	};
}
async function raceMemoryCorpusSignal(signal, task) {
	if (signal.aborted) throw resolveMemorySearchAbortError(signal);
	let removeAbort = () => {};
	const aborted = new Promise((_resolve, reject) => {
		const onAbort = () => reject(resolveMemorySearchAbortError(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbort = () => signal.removeEventListener("abort", onAbort);
	});
	try {
		return await Promise.race([task, aborted]);
	} finally {
		removeAbort();
	}
}
async function attemptMemoryCorpus(params) {
	try {
		return {
			corpus: params.corpus,
			outcome: "ok",
			value: await raceMemoryCorpusSignal(params.signal, params.run())
		};
	} catch (error) {
		return unavailableMemoryCorpus(params.corpus, params.unavailableValue, error);
	}
}
async function runMemoryCorpusDeadline(params) {
	const timeoutMs = params.operation === "memory_search" ? DEFAULT_MEMORY_SEARCH_TIMEOUT_MS : DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS;
	if (params.parentSignal?.aborted) throw resolveMemorySearchAbortError(params.parentSignal);
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(createMemorySearchDeadlineError(`${params.operation} timed out after ${timeoutMs / 1e3}s`));
	}, timeoutMs);
	timer.unref?.();
	const onParentAbort = () => controller.abort(resolveMemorySearchAbortError(params.parentSignal));
	params.parentSignal?.addEventListener("abort", onParentAbort, { once: true });
	try {
		const result = await params.run(controller.signal);
		if (params.parentSignal?.aborted) throw resolveMemorySearchAbortError(params.parentSignal);
		return result;
	} finally {
		clearTimeout(timer);
		params.parentSignal?.removeEventListener("abort", onParentAbort);
	}
}
function composeMemoryCorpusMetadata(attempts, extraWarnings = []) {
	const ordered = attempts.toSorted((left, right) => Number(left.corpus === "wiki") - Number(right.corpus === "wiki"));
	const warnings = ordered.flatMap((attempt) => {
		const label = attempt.corpus === "memory" ? "Memory" : "Wiki";
		if (attempt.outcome === "unavailable") return [`${label} corpus unavailable: ${attempt.error}`];
		return attempt.outcome === "not-registered" && ordered.length === 1 ? [`${label} corpus is not registered; results do not cover that requested corpus.`] : [];
	});
	warnings.push(...extraWarnings);
	const errors = ordered.flatMap((attempt) => attempt.outcome === "unavailable" ? [attempt.error] : []);
	return {
		corpora: ordered.map((attempt) => attempt.outcome === "unavailable" ? {
			corpus: attempt.corpus,
			outcome: attempt.outcome,
			error: attempt.error
		} : {
			corpus: attempt.corpus,
			outcome: attempt.outcome
		}),
		...warnings.length > 0 ? { warning: warnings.join(" ") } : {},
		...errors.length > 0 ? { error: errors.join("; ") } : {}
	};
}
async function settleMemorySupplements(params) {
	const supplements = listMemoryCorpusSupplements().toSorted((left, right) => left.pluginId.localeCompare(right.pluginId));
	if (supplements.length === 0) return {
		corpus: "wiki",
		outcome: "not-registered"
	};
	const failures = [];
	const completed = Array.from({ length: supplements.length });
	try {
		await raceMemoryCorpusSignal(params.signal, runTasksWithConcurrency({
			tasks: supplements.map((registration, index) => async () => {
				const result = await params.run(registration);
				completed[index] = result;
				return result;
			}),
			limit: Math.min(4, supplements.length),
			onTaskError: (error, index) => {
				failures.push({
					pluginId: supplements[index].pluginId,
					error: formatErrorMessage(error)
				});
			}
		}));
	} catch (error) {
		return unavailableMemoryCorpus("wiki", params.merge(completed.filter((result) => result !== void 0)), error);
	}
	const value = params.merge(completed.filter((result) => result !== void 0));
	if (failures.length === 0) return {
		corpus: "wiki",
		outcome: "ok",
		value
	};
	const orderedFailures = failures.toSorted((left, right) => left.pluginId.localeCompare(right.pluginId));
	return {
		corpus: "wiki",
		outcome: "unavailable",
		value,
		error: orderedFailures.length === 1 ? orderedFailures[0].error : orderedFailures.map((entry) => `${entry.pluginId}: ${entry.error}`).join("; "),
		deadline: false
	};
}
async function searchMemoryCorpusSupplements(params) {
	const { signal, ...query } = params;
	return await settleMemorySupplements({
		signal,
		run: async ({ supplement }) => await supplement.search(query),
		merge: (results) => results.flat().toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, Math.max(1, params.maxResults ?? 10))
	});
}
async function readMemoryCorpusSupplements(params) {
	const { signal, ...query } = params;
	return await settleMemorySupplements({
		signal,
		run: async ({ supplement }) => {
			const result = await supplement.get(query);
			if (!result) return null;
			const { content, ...details } = result;
			return {
				...details,
				status: "ok",
				text: content
			};
		},
		merge: (results) => results.find((result) => result !== null) ?? null
	});
}
//#endregion
//#region extensions/memory-core/src/memory-read-tool.ts
function readWiki(params, signal) {
	return readMemoryCorpusSupplements({
		lookup: params.relPath,
		fromLine: params.from,
		lineCount: params.lines,
		agentId: params.agentId,
		agentSessionKey: params.agentSessionKey,
		sandboxed: params.sandboxed,
		signal
	});
}
function attemptValue(attempt) {
	return attempt.outcome === "not-registered" ? null : attempt.value;
}
async function executeWikiMemoryReadResult(params) {
	return await runMemoryCorpusDeadline({
		operation: "memory_get",
		parentSignal: params.signal,
		run: async (signal) => {
			const wiki = await readWiki(params, signal);
			const result = attemptValue(wiki) ?? (wiki.outcome === "ok" ? {
				status: "not_found",
				path: params.relPath,
				text: ""
			} : {
				path: params.relPath,
				text: ""
			});
			return jsonResult({
				...result,
				...composeMemoryCorpusMetadata([wiki])
			});
		}
	});
}
async function executeMemoryReadResult(params) {
	if (params.requestedCorpus !== "all") try {
		return jsonResult(await params.read());
	} catch (error) {
		return jsonResult({
			path: params.relPath,
			text: "",
			disabled: true,
			error: formatErrorMessage(error)
		});
	}
	return await runMemoryCorpusDeadline({
		operation: "memory_get",
		parentSignal: params.signal,
		run: async (signal) => {
			const [memory, wiki] = await Promise.all([attemptMemoryCorpus({
				corpus: "memory",
				signal,
				unavailableValue: null,
				run: params.read
			}), readWiki(params, signal)]);
			const memoryResult = attemptValue(memory);
			const wikiResult = attemptValue(wiki);
			const result = memoryResult?.status !== "not_found" && memoryResult !== null ? memoryResult : wikiResult ?? (memory.outcome === "ok" || wiki.outcome === "ok" ? {
				status: "not_found",
				path: params.relPath,
				text: ""
			} : {
				path: params.relPath,
				text: "",
				disabled: true
			});
			return jsonResult({
				...result,
				...composeMemoryCorpusMetadata([memory, wiki])
			});
		}
	});
}
//#endregion
//#region extensions/memory-core/src/tools.shared.ts
const SESSION_CANONICAL_KEY_MIGRATION_REQUIRED = "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED";
const SESSION_CANONICAL_KEY_MIGRATION_WARNING = "Memory search is unavailable because the session catalog requires canonical-key migration.";
const SESSION_CANONICAL_KEY_MIGRATION_ACTION = "Stop the Gateway and run openclaw doctor --fix, then restart the Gateway and retry memory_search.";
const loadMemoryToolRuntime = createLazyRuntimeModule(() => import("./tools.runtime.js"));
async function getMemoryManagerContextWithPurpose(params) {
	const { getMemorySearchManager } = await loadMemoryToolRuntime();
	const startedAt = Date.now();
	const { manager, debug, error } = await getMemorySearchManager({
		cfg: params.cfg,
		agentId: params.agentId,
		purpose: params.purpose,
		...params.acquireLocalService ? { acquireLocalService: params.acquireLocalService } : {}
	});
	return manager ? {
		manager,
		debug: {
			backend: debug?.backend ?? "builtin",
			purpose: debug?.purpose ?? params.purpose ?? "default",
			managerMs: debug?.managerMs ?? Math.max(0, Date.now() - startedAt)
		}
	} : { error };
}
function createMemoryTool(params) {
	const ctx = resolveMemoryToolContext(params.options);
	if (!ctx) return null;
	return {
		label: params.contract.label,
		name: params.contract.name,
		description: params.contract.describe(ctx.sources),
		parameters: params.contract.parameters,
		execute: async (toolCallId, toolParams, signal, onUpdate) => {
			const latestCtx = params.options.getConfig ? resolveMemoryToolContext(params.options) : ctx;
			if (!latestCtx) throw new Error("Memory is disabled for this agent. Enable memory search for this agent, then retry.");
			return await params.execute(latestCtx)(toolCallId, toolParams, signal, onUpdate);
		}
	};
}
function buildMemorySearchUnavailableResult(error, overrides) {
	const reason = (error ?? "memory search unavailable").trim() || "memory search unavailable";
	const normalizedReason = normalizeLowercaseStringOrEmpty(reason);
	const isQuotaError = /insufficient_quota|quota|429/.test(normalizedReason);
	const isMissingNodeSqlite = /missing node:sqlite|no such built-?in module: node:sqlite/.test(normalizedReason);
	const isSearchDeadline = overrides?.deadline === true;
	const deadlineAction = overrides?.agentId ? `Retry memory_search after a short wait: a memory-corpus timeout pauses retries for up to a minute. If memory-corpus timeouts persist, run: openclaw memory status --deep --agent ${overrides.agentId}, and rebuild with openclaw memory index --force --agent ${overrides.agentId} only if it reports the index dirty or incomplete` : "Retry memory_search after a short wait. If memory-corpus timeouts persist, inspect this agent's memory index before rebuilding it.";
	const warning = overrides?.warning ?? (overrides?.code === SESSION_CANONICAL_KEY_MIGRATION_REQUIRED ? SESSION_CANONICAL_KEY_MIGRATION_WARNING : isQuotaError ? "Memory search is unavailable because the embedding provider quota is exhausted." : isMissingNodeSqlite ? "Memory search is unavailable because this OpenClaw Node runtime does not provide SQLite support." : isSearchDeadline ? "Memory search did not finish within its time limit." : "Memory search is unavailable due to an embedding/provider error.");
	const action = overrides?.action ?? (overrides?.code === SESSION_CANONICAL_KEY_MIGRATION_REQUIRED ? SESSION_CANONICAL_KEY_MIGRATION_ACTION : isQuotaError ? "Top up or switch embedding provider, then retry memory_search." : isMissingNodeSqlite ? "Run OpenClaw with a Node runtime that includes node:sqlite, then retry memory_search." : isSearchDeadline ? deadlineAction : "Check embedding provider configuration and retry memory_search.");
	return {
		results: [],
		disabled: true,
		unavailable: true,
		error: reason,
		warning,
		action,
		debug: {
			warning,
			action,
			error: reason
		}
	};
}
//#endregion
//#region extensions/memory-core/src/memory-search-tool-query.ts
const MEMORY_SEARCH_POST_FILTER_MAX_CANDIDATES = 200;
function buildPausedMemoryIndexUnavailableResult(diagnostic, params) {
	const cause = diagnostic.owner === "configuration" ? `the current memory configuration no longer matches the index (${diagnostic.reason})` : diagnostic.code === "metadata_missing" ? `the memory index metadata is missing (${diagnostic.reason}); no configuration change is needed` : `this OpenClaw version changed the memory index format (${diagnostic.reason}); no configuration change is needed`;
	return buildMemorySearchUnavailableResult(diagnostic.reason, {
		warning: `Tell the user: memory search is paused because ${cause}.`,
		action: `Tell the user to run: ${formatMemoryIndexRebuildGuidance(params.status, params.agentId)}`
	});
}
function isClosedMemoryStoreError(error) {
	const message = formatErrorMessage(error).toLowerCase();
	return message.includes("database is not open") || message.includes("database connection is not open") || message.includes("database handle is closed") || message.includes("memory search manager is closed");
}
async function executeMemorySearchToolQuery(params) {
	const startedAt = Date.now();
	const runtimeDebug = [];
	let active = params.initialManager;
	const { query, signal, visibility } = params;
	const searchSources = query.explicitSources ?? (query.requestedCorpus === "sessions" ? query.defaultSources : query.requestedCorpus == null || query.requestedCorpus === "all" ? query.conversationRecall?.corpus === "configured" ? query.indexedSources : query.defaultSources : void 0);
	const searchOnce = async () => {
		const allowedSources = searchSources ? new Set(searchSources) : void 0;
		const searchesSessions = searchSources?.includes("sessions") === true;
		const indexedCandidateCount = searchesSessions ? (active.manager.status().sourceCounts ?? []).filter((entry) => allowedSources?.has(entry.source)).reduce((total, entry) => total + entry.chunks, 0) : query.resultLimit;
		const searchWindow = searchesSessions ? Math.min(MEMORY_SEARCH_POST_FILTER_MAX_CANDIDATES, indexedCandidateCount > 0 ? indexedCandidateCount : MEMORY_SEARCH_POST_FILTER_MAX_CANDIDATES) : query.resultLimit;
		return {
			candidates: await active.manager.search(query.text, {
				maxResults: searchWindow,
				minScore: query.minScore,
				sessionKey: query.sessionKey,
				activeProjectKeys: query.activeProjectKeys ? [...query.activeProjectKeys] : void 0,
				signal,
				onDebug: (debug) => runtimeDebug.push(debug),
				...searchSources ? { sources: searchSources } : {}
			}),
			searchWindow
		};
	};
	let searched;
	try {
		searched = await searchOnce();
	} catch (error) {
		if (!isClosedMemoryStoreError(error)) throw error;
		const refreshed = await params.refreshManager();
		if (!refreshed) throw error;
		active = refreshed;
		searched = await searchOnce();
	}
	const status = active.manager.status();
	const pausedIndexIdentity = resolveMemoryIndexIdentityDiagnostic(status);
	if (pausedIndexIdentity) return {
		status,
		rawResults: [],
		pausedIndexIdentity,
		searchMode: void 0,
		debug: void 0
	};
	let filtered = await filterMemorySearchHitsBySessionVisibility({
		cfg: visibility.cfg,
		agentId: visibility.agentId,
		requesterSessionKey: query.sessionKey,
		sandboxed: visibility.sandboxed,
		hits: searched.candidates,
		conversationRecall: query.conversationRecall
	});
	if (searchSources) {
		const allowedSources = new Set(searchSources);
		filtered = filtered.filter((hit) => allowedSources.has(hit.source));
	}
	if (query.requestedCorpus === "sessions") filtered = filtered.filter((hit) => hit.source === "sessions");
	else if (query.requestedCorpus === "memory") filtered = filtered.filter((hit) => hit.source === "memory");
	const postFilterHits = filtered.length;
	const rawResults = filtered.slice(0, query.resultLimit);
	const latestDebug = runtimeDebug.at(-1);
	return {
		status,
		rawResults,
		pausedIndexIdentity: void 0,
		searchMode: latestDebug?.effectiveMode,
		debug: {
			backend: status.backend,
			configuredMode: latestDebug?.configuredMode,
			effectiveMode: "n/a",
			fallback: latestDebug?.fallback,
			managerMs: active.managerMs,
			searchMs: Math.max(0, Date.now() - startedAt),
			embeddingBootstrap: runtimeDebug.findLast((entry) => entry.embeddingBootstrap)?.embeddingBootstrap,
			hits: rawResults.length,
			candidateHits: searched.candidates.length,
			withheldHits: Math.max(0, searched.candidates.length - postFilterHits),
			searchWindow: searched.searchWindow
		}
	};
}
//#endregion
//#region extensions/memory-core/src/tools.citations.ts
function resolveMemoryCitationsMode(cfg) {
	const mode = cfg.memory?.citations;
	if (mode === "on" || mode === "off" || mode === "auto") return mode;
	return "auto";
}
function decorateCitations(results, include) {
	if (!include) return results.map((entry) => ({
		...entry,
		citation: void 0
	}));
	return results.map((entry) => {
		const citation = formatCitation(entry);
		const snippet = `${entry.snippet.trim()}\n\nSource: ${citation}`;
		return {
			...entry,
			citation,
			snippet
		};
	});
}
function formatCitation(entry) {
	const lineRange = entry.startLine === entry.endLine ? `#L${entry.startLine}` : `#L${entry.startLine}-L${entry.endLine}`;
	return `${entry.path}${lineRange}`;
}
function shouldIncludeCitations(params) {
	if (params.mode === "on") return true;
	if (params.mode === "off") return false;
	return deriveChatTypeFromSessionKey(params.sessionKey) === "direct";
}
function deriveChatTypeFromSessionKey(sessionKey) {
	const parsed = parseAgentSessionKey(sessionKey);
	if (!parsed?.rest) return "direct";
	const tokens = new Set(normalizeLowercaseStringOrEmpty(parsed.rest).split(":").filter(Boolean));
	if (tokens.has("channel")) return "channel";
	if (tokens.has("group")) return "group";
	return "direct";
}
//#endregion
//#region extensions/memory-core/src/tools.ts
const MEMORY_SEARCH_TOOL_COOLDOWN_MS = 6e4;
const memorySearchToolCooldowns = /* @__PURE__ */ new Map();
/**
* Validate the model-authored corpus argument against the tool's closed enum.
* Provider tool schemas do not guarantee enum enforcement; an unknown corpus
* must fail closed instead of falling through to an unrestricted search that
* could surface recall-only indexed transcripts.
*/
function readCorpusParam(rawParams, allowed) {
	const raw = readToolStringParam(rawParams, "corpus");
	if (raw === void 0) return;
	if (allowed.includes(raw)) return raw;
	throw new Error(`corpus must be one of: ${allowed.join(", ")}`);
}
function resolveMemorySearchToolCooldownKey(options) {
	return options.agentId ?? options.agentSessionKey ?? "default";
}
function readMemorySearchToolCooldown(key) {
	const entry = memorySearchToolCooldowns.get(key);
	if (!entry) return;
	if (entry.until <= Date.now()) {
		memorySearchToolCooldowns.delete(key);
		return;
	}
	return {
		error: entry.error,
		deadline: entry.deadline,
		...entry.code ? { code: entry.code } : {}
	};
}
function recordMemorySearchToolCooldown(key, failure) {
	memorySearchToolCooldowns.set(key, {
		until: Date.now() + MEMORY_SEARCH_TOOL_COOLDOWN_MS,
		...failure
	});
}
const testing = { resetMemorySearchToolCooldowns() {
	memorySearchToolCooldowns.clear();
} };
function isActiveMemoryManagerContext(context) {
	return context !== null && "manager" in context;
}
async function closeMemoryManagers(managers, parentSignal) {
	const pending = Array.from(managers, async (manager) => await manager.close?.());
	if (pending.length === 0) return;
	try {
		await runMemorySearchWithDeadline({
			timeoutMs: DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS,
			parentSignal,
			run: async () => {
				await Promise.allSettled(pending);
			}
		});
	} catch (error) {
		if (parentSignal?.aborted) throw error;
	}
}
function mergeRankedMemorySearchToolStreams(memoryResults, supplementResults) {
	const merged = [];
	let memoryIndex = 0;
	let supplementIndex = 0;
	while (memoryIndex < memoryResults.length && supplementIndex < supplementResults.length) {
		const memory = memoryResults[memoryIndex];
		const supplement = supplementResults[supplementIndex];
		if ((memory?.score ?? 0) >= (supplement?.score ?? 0)) {
			if (memory) merged.push(memory);
			memoryIndex += 1;
		} else {
			if (supplement) merged.push(supplement);
			supplementIndex += 1;
		}
	}
	merged.push(...memoryResults.slice(memoryIndex), ...supplementResults.slice(supplementIndex));
	return merged;
}
function mergeMemorySearchCorpusResults(params) {
	const { memoryResults, supplementResults } = params;
	if (!params.balanceCorpora || memoryResults.length === 0 || supplementResults.length === 0) return mergeRankedMemorySearchToolStreams(memoryResults, supplementResults).slice(0, params.maxResults);
	const perCorpusCap = Math.ceil(params.maxResults / 2);
	let memoryTake = Math.min(perCorpusCap, memoryResults.length);
	let supplementTake = Math.min(perCorpusCap, supplementResults.length);
	while (memoryTake + supplementTake < params.maxResults) {
		const memory = memoryResults[memoryTake];
		const supplement = supplementResults[supplementTake];
		if (!memory && !supplement) break;
		if (!supplement || memory && memory.score >= supplement.score) memoryTake += 1;
		else supplementTake += 1;
	}
	return mergeRankedMemorySearchToolStreams(memoryResults.slice(0, memoryTake), supplementResults.slice(0, supplementTake)).slice(0, params.maxResults);
}
function buildRecallKey(result) {
	return `${result.source}:${result.path}:${result.startLine}:${result.endLine}`;
}
function resolveRecallTrackingResults(rawResults, surfacedResults) {
	if (surfacedResults.length === 0 || rawResults.length === 0) return surfacedResults;
	const rawByKey = /* @__PURE__ */ new Map();
	for (const raw of rawResults) {
		const key = buildRecallKey(raw);
		if (!rawByKey.has(key)) rawByKey.set(key, raw);
	}
	return surfacedResults.map((surfaced) => rawByKey.get(buildRecallKey(surfaced)) ?? surfaced);
}
function queueShortTermRecallTracking(params) {
	const trackingResults = resolveRecallTrackingResults(params.rawResults, params.surfacedResults);
	recordShortTermRecalls({
		workspaceDir: params.workspaceDir,
		query: params.query,
		results: trackingResults,
		timezone: params.timezone
	}).catch(() => {});
}
function createMemorySearchTool(options) {
	return createMemoryTool({
		options,
		contract: MEMORY_SEARCH_TOOL_CONTRACT,
		execute: ({ cfg, agentId, settings }) => async (_toolCallId, params, callerSignal) => {
			const rawParams = asToolParamsRecord(params);
			if (callerSignal?.aborted) throw resolveMemorySearchAbortError(callerSignal);
			const query = readToolStringParam(rawParams, "query", { required: true });
			const maxResults = readPositiveIntegerParam(rawParams, "maxResults");
			const minScore = readFiniteNumberParam(rawParams, "minScore");
			const modelRequestedCorpus = readCorpusParam(rawParams, [
				"memory",
				"wiki",
				"all",
				"sessions"
			]);
			const requestedCorpus = options.conversationRecall?.corpus === "sessions" ? "sessions" : modelRequestedCorpus;
			if (requestedCorpus === "sessions" && !options.conversationRecall && !settings.searchSources.includes("sessions")) return jsonResult(buildMemorySearchUnavailableResult("Session transcript search is not enabled.", {
				warning: "Session transcript search is unavailable for this agent.",
				action: "Enable memory.search.experimental.sessionMemory and add \"sessions\" to memory.search.sources, then retry memory_search."
			}));
			const cooldownKey = resolveMemorySearchToolCooldownKey({
				agentId,
				agentSessionKey: options.agentSessionKey
			});
			const cooldown = requestedCorpus === "wiki" ? void 0 : readMemorySearchToolCooldown(cooldownKey);
			const toolStartedAt = Date.now();
			const searchesMemory = requestedCorpus !== "wiki";
			const searchesWiki = requestedCorpus === "wiki" || requestedCorpus === "all";
			const memoryManagerPurpose = options.oneShotCliRun ? "cli" : "search";
			const memoryManagersToClose = /* @__PURE__ */ new Set();
			let cleanupStarted = false;
			const trackMemoryManager = (context) => {
				if (isActiveMemoryManagerContext(context)) {
					if (cleanupStarted) closeMemoryManagers([context.manager]);
					else memoryManagersToClose.add(context.manager);
				}
				return context;
			};
			const searchMemory = async (signal) => {
				if (cooldown) return {
					corpus: "memory",
					outcome: "unavailable",
					value: null,
					...cooldown
				};
				const attempted = await attemptMemoryCorpus({
					corpus: "memory",
					signal,
					unavailableValue: null,
					run: async () => {
						const memory = trackMemoryManager(await getMemoryManagerContextWithPurpose({
							cfg,
							agentId,
							purpose: memoryManagerPurpose,
							acquireLocalService: options.acquireLocalService
						}));
						if ("error" in memory) throw new Error(memory.error ?? "memory search unavailable");
						const explicitSources = requestedCorpus === "sessions" && (options.conversationRecall || settings.searchSources.includes("sessions")) ? ["sessions"] : requestedCorpus === "memory" ? ["memory"] : void 0;
						return await executeMemorySearchToolQuery({
							initialManager: {
								manager: memory.manager,
								managerMs: memory.debug?.managerMs
							},
							refreshManager: async () => {
								const refreshed = trackMemoryManager(await getMemoryManagerContextWithPurpose({
									cfg,
									agentId,
									purpose: memoryManagerPurpose,
									acquireLocalService: options.acquireLocalService
								}));
								return "error" in refreshed ? null : {
									manager: refreshed.manager,
									managerMs: refreshed.debug?.managerMs
								};
							},
							query: {
								text: query,
								resultLimit: maxResults ?? settings.query.maxResults,
								minScore,
								explicitSources,
								defaultSources: settings.searchSources,
								indexedSources: settings.sources,
								requestedCorpus,
								sessionKey: options.agentSessionKey,
								activeProjectKeys: options.activeProjectKeys,
								conversationRecall: options.conversationRecall
							},
							visibility: {
								cfg,
								agentId,
								sandboxed: options.sandboxed === true
							},
							signal
						});
					}
				});
				if (attempted.outcome !== "ok") {
					if (callerSignal?.aborted) throw resolveMemorySearchAbortError(callerSignal);
					const failure = attempted.outcome === "unavailable" ? {
						error: attempted.error,
						deadline: attempted.deadline,
						...attempted.code ? { code: attempted.code } : {}
					} : {
						error: "memory search unavailable",
						deadline: false
					};
					recordMemorySearchToolCooldown(cooldownKey, failure);
					return {
						corpus: "memory",
						outcome: "unavailable",
						value: null,
						...failure
					};
				}
				const executed = attempted.value;
				if (executed.pausedIndexIdentity) return unavailableMemoryCorpus("memory", {
					results: [],
					unavailableResult: buildPausedMemoryIndexUnavailableResult(executed.pausedIndexIdentity, {
						agentId,
						status: executed.status
					})
				}, executed.pausedIndexIdentity.reason);
				const includeCitations = shouldIncludeCitations({
					mode: resolveMemoryCitationsMode(cfg),
					sessionKey: options.agentSessionKey
				});
				const rawResults = executed.rawResults;
				const memoryResults = decorateCitations(rawResults.map((result) => ({
					...result,
					snippet: stripMemoryAnnotationCarriers(result.snippet)
				})), includeCitations);
				const status = executed.status;
				if (resolveMemoryDreamingConfig({
					pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
					cfg
				}).enabled) queueShortTermRecallTracking({
					workspaceDir: status.workspaceDir,
					query,
					rawResults,
					surfacedResults: memoryResults,
					timezone: resolveMemoryDeepDreamingConfig({
						pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
						cfg
					}).timezone
				});
				return {
					corpus: "memory",
					outcome: "ok",
					value: {
						results: memoryResults.map((result) => Object.assign(result, { corpus: result.source })),
						provider: status.provider,
						model: status.model,
						fallback: status.fallback,
						mode: executed.searchMode,
						staleness: resolveMemorySearchStaleness(status, agentId) ?? void 0,
						debug: executed.debug
					}
				};
			};
			try {
				return await runMemoryCorpusDeadline({
					operation: "memory_search",
					parentSignal: callerSignal,
					run: async (signal) => {
						const [memory, wiki] = await Promise.all([searchesMemory ? searchMemory(signal) : Promise.resolve(null), searchesWiki ? searchMemoryCorpusSupplements({
							query,
							maxResults,
							agentId,
							agentSessionKey: options.agentSessionKey,
							sandboxed: options.sandboxed,
							signal
						}) : Promise.resolve(null)]);
						const memoryValue = memory?.outcome === "not-registered" ? null : memory?.value;
						if (searchesMemory && !searchesWiki && memory?.outcome === "unavailable") return jsonResult(memoryValue?.unavailableResult ?? buildMemorySearchUnavailableResult(memory.error, {
							agentId,
							deadline: memory.deadline,
							code: memory.code
						}));
						const wikiResults = wiki?.outcome === "not-registered" ? [] : wiki?.value ?? [];
						const results = searchesWiki ? mergeMemorySearchCorpusResults({
							memoryResults: memoryValue?.results ?? [],
							supplementResults: wikiResults,
							maxResults: maxResults ?? 10,
							balanceCorpora: requestedCorpus === "all"
						}) : memoryValue?.results ?? [];
						const attempts = [...requestedCorpus === "all" && memory ? [memory] : [], ...wiki ? [wiki] : []];
						const staleness = memoryValue?.staleness;
						const recoveryAction = memoryValue?.unavailableResult?.action;
						const metadata = composeMemoryCorpusMetadata(attempts, staleness?.warning ? [staleness.warning] : []);
						const elapsed = Math.max(0, Date.now() - toolStartedAt);
						const debug = memoryValue?.debug ? {
							...memoryValue.debug,
							toolMs: elapsed,
							outsideSearchMs: Math.max(0, elapsed - memoryValue.debug.searchMs)
						} : void 0;
						return jsonResult({
							results,
							provider: memoryValue?.provider,
							model: memoryValue?.model,
							fallback: memoryValue?.fallback,
							citations: resolveMemoryCitationsMode(cfg),
							mode: memoryValue?.mode,
							...attempts.length > 0 ? metadata : {},
							...recoveryAction ? { action: recoveryAction } : {},
							...staleness,
							debug
						});
					}
				});
			} catch (error) {
				if (callerSignal?.aborted) throw resolveMemorySearchAbortError(callerSignal);
				const failed = unavailableMemoryCorpus("memory", null, error);
				if (requestedCorpus !== "wiki") recordMemorySearchToolCooldown(cooldownKey, failed);
				return jsonResult(buildMemorySearchUnavailableResult(failed.error, {
					agentId,
					deadline: failed.deadline,
					code: failed.code
				}));
			} finally {
				cleanupStarted = true;
				await closeMemoryManagers(memoryManagersToClose, callerSignal);
			}
		}
	});
}
function createMemoryGetTool(options) {
	return createMemoryTool({
		options,
		contract: MEMORY_GET_TOOL_CONTRACT,
		execute: ({ cfg, agentId }) => async (_toolCallId, params, callerSignal) => {
			const rawParams = asToolParamsRecord(params);
			const relPath = readToolStringParam(rawParams, "path", { required: true });
			const from = readPositiveIntegerParam(rawParams, "from");
			const lines = readPositiveIntegerParam(rawParams, "lines");
			const requestedCorpus = readCorpusParam(rawParams, [
				"memory",
				"wiki",
				"all"
			]);
			const { readAgentMemoryFile } = await loadMemoryToolRuntime();
			if (requestedCorpus === "wiki") return await executeWikiMemoryReadResult({
				relPath,
				from: from ?? void 0,
				lines: lines ?? void 0,
				agentId,
				agentSessionKey: options.agentSessionKey,
				sandboxed: options.sandboxed,
				requestedCorpus,
				signal: callerSignal
			});
			return await executeMemoryReadResult({
				read: async () => await readAgentMemoryFile({
					cfg,
					agentId,
					relPath,
					from: from ?? void 0,
					lines: lines ?? void 0
				}),
				requestedCorpus,
				relPath,
				from: from ?? void 0,
				lines: lines ?? void 0,
				agentId,
				agentSessionKey: options.agentSessionKey,
				sandboxed: options.sandboxed,
				signal: callerSignal
			});
		}
	});
}
//#endregion
export { createMemoryGetTool, createMemorySearchTool, testing };
