import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { a as resolveSessionFilePathOptions, i as resolveSessionFilePathCore } from "./paths-DDTeIhCT.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { a as hasGatewayClientCap, t as GATEWAY_CLIENT_CAPS } from "./client-info-B1bPgeKr.js";
import { Ei as validateSessionsUsageParams } from "./src-B9mb84px.js";
import { t as runTasksWithConcurrency } from "./run-with-concurrency-B6LtW2cN.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { d as sessionDeliveryChannel, f as sessionDeliveryOrigin } from "./delivery-context.shared-DlcU69m_.js";
import { n as parseSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { i as resolveStoredSessionKeyForAgentStore } from "./session-store-key-DVtVp9hU.js";
import { n as loadCombinedSessionStoreForGatewayCore } from "./combined-store-gateway-BwDhjbIt.js";
import { h as gatewayClientSessionCreator, i as operatorSessionCap } from "./operator-role-policy-B_VzZMic.js";
import { t as listGatewayAgentsBasic } from "./agent-list-CFshms7U.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { i as loadGatewaySessionEntryReadOnly } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import { a as resolveTimezone, i as resolveTimeZoneDayStartMs, t as createTimeZoneDayKeyFormatter } from "./format-datetime-xsAchuLA.js";
import { t as resolvePreferredSessionKeyForSessionIdMatches } from "./session-id-resolution-tHy0h84G.js";
import { P as isGatewayAdmin, n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { r as createEmptyCostUsageTotals, t as addCostUsageTotals } from "./session-cost-usage-totals-D4e-85ui.js";
import { c as mergeSessionCostSummaryInto, l as createUsageAggregateAccumulator, u as resolveExistingUsageSessionFile } from "./session-cost-usage-C_mE_GAE.js";
import { callUsageOffloadRpc, discoverAllSessions, isUsageOffloadEnabled, loadCostUsageSummaryFromCache, loadSessionCostSummariesFromCache, loadSessionLogs, loadSessionUsageTimeSeries } from "./usage-offload-v1.js"; // usage-offload-v1: usage readers run in a child process
import { n as loadUsageStatusStaleWhileRevalidate } from "./models-auth-status-usage-cache-B69k-hu_.js";
import fs from "node:fs";
//#region src/gateway/server-methods/usage-date-range.ts
const MAX_USAGE_DAYS = 36600;
const parseDateParts = (raw) => {
	if (typeof raw !== "string" || !raw.trim()) return;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
	if (!match) return;
	const [, yearStr, monthStr, dayStr] = match;
	const year = Number(yearStr);
	const monthIndex = Number(monthStr) - 1;
	const day = Number(dayStr);
	if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return;
	const probe = new Date(Date.UTC(year, monthIndex, day));
	if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== day) return;
	return {
		year,
		monthIndex,
		day
	};
};
const shiftDateParts = (parts, days) => {
	const shifted = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day + days));
	return {
		year: shifted.getUTCFullYear(),
		monthIndex: shifted.getUTCMonth(),
		day: shifted.getUTCDate()
	};
};
const datePartsToStartMs = (parts, interpretation) => {
	const { year, monthIndex, day } = parts;
	if (interpretation.mode === "gateway") return new Date(year, monthIndex, day).getTime();
	if (interpretation.mode === "time-zone") return resolveTimeZoneDayStartMs(formatDateParts(year, monthIndex, day), interpretation.timeZone);
	if (interpretation.mode === "utc-offset") return Date.UTC(year, monthIndex, day) - interpretation.utcOffsetMinutes * 60 * 1e3;
	return Date.UTC(year, monthIndex, day);
};
const datePartsToEndMs = (parts, interpretation) => {
	const lookaheadDays = interpretation.mode === "time-zone" ? 2 : 1;
	for (let daysAhead = 1; daysAhead <= lookaheadDays; daysAhead += 1) {
		const nextDayStartMs = datePartsToStartMs(shiftDateParts(parts, daysAhead), interpretation);
		if (nextDayStartMs !== void 0) return nextDayStartMs - 1;
	}
};
const findInvalidExplicitDate = (params) => {
	for (const field of ["startDate", "endDate"]) {
		const raw = params[field];
		if (raw === void 0 || raw === null || typeof raw === "string" && raw.trim() === "") continue;
		if (parseDateParts(raw) === void 0) return field;
	}
};
/**
* Parse a UTC offset string in the format UTC+H, UTC-H, UTC+HH, UTC-HH, UTC+H:MM, UTC-HH:MM.
* Returns the UTC offset in minutes (east-positive), or undefined if invalid.
*/
const parseUtcOffsetToMinutes = (raw) => {
	if (typeof raw !== "string" || !raw.trim()) return;
	const match = /^UTC([+-])(\d{1,2})(?::([0-5]\d))?$/.exec(raw.trim());
	if (!match) return;
	const sign = match[1] === "+" ? 1 : -1;
	const hours = Number(match[2]);
	const minutes = Number(match[3] ?? "0");
	const totalMinutes = sign * (hours * 60 + minutes);
	if (totalMinutes < -720 || totalMinutes > 840) return;
	return totalMinutes;
};
const resolveDateInterpretation = (params) => {
	if (params.mode === "gateway") return {
		ok: true,
		value: { mode: "gateway" }
	};
	if (params.mode === "specific") {
		const utcOffsetMinutes = parseUtcOffsetToMinutes(params.utcOffset);
		if (params.timeZone !== void 0 && params.timeZone !== null) {
			const requestedTimeZone = normalizeOptionalString(params.timeZone);
			const timeZone = requestedTimeZone ? resolveTimezone(requestedTimeZone) : void 0;
			if (!timeZone) {
				if (utcOffsetMinutes !== void 0) return {
					ok: true,
					value: {
						mode: "utc-offset",
						utcOffsetMinutes
					}
				};
				return {
					ok: false,
					error: "invalid timeZone: expected a valid IANA time zone"
				};
			}
			return {
				ok: true,
				value: {
					mode: "time-zone",
					timeZone,
					formatDayKey: createTimeZoneDayKeyFormatter(timeZone)
				}
			};
		}
		if (utcOffsetMinutes !== void 0) return {
			ok: true,
			value: {
				mode: "utc-offset",
				utcOffsetMinutes
			}
		};
		if (params.utcOffset != null && (typeof params.utcOffset !== "string" || params.utcOffset.trim() !== "")) return {
			ok: false,
			error: "invalid utcOffset: expected UTC-12:00 through UTC+14:00"
		};
	}
	return {
		ok: true,
		value: { mode: "utc" }
	};
};
const resolveDayBucket = (interpretation) => {
	if (interpretation.mode === "gateway") return;
	if (interpretation.mode === "time-zone") return {
		mode: "time-zone",
		timeZone: interpretation.timeZone
	};
	return {
		mode: "utc-offset",
		utcOffsetMinutes: interpretation.mode === "utc-offset" ? interpretation.utcOffsetMinutes : 0
	};
};
const getDateParts = (date, interpretation) => {
	if (interpretation.mode === "gateway") return {
		year: date.getFullYear(),
		monthIndex: date.getMonth(),
		day: date.getDate()
	};
	if (interpretation.mode === "time-zone") {
		const parts = parseDateParts(interpretation.formatDayKey(date));
		if (!parts) throw new Error("timezone formatter returned an invalid calendar day");
		return parts;
	}
	if (interpretation.mode === "utc-offset") {
		const shifted = new Date(date.getTime() + interpretation.utcOffsetMinutes * 60 * 1e3);
		return {
			year: shifted.getUTCFullYear(),
			monthIndex: shifted.getUTCMonth(),
			day: shifted.getUTCDate()
		};
	}
	return {
		year: date.getUTCFullYear(),
		monthIndex: date.getUTCMonth(),
		day: date.getUTCDate()
	};
};
const formatDateLabel = (ms, interpretation) => {
	const parts = getDateParts(new Date(ms), interpretation);
	return formatDateParts(parts.year, parts.monthIndex, parts.day);
};
const formatDateParts = (year, monthIndex, day) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const parseDays = (raw) => {
	const fromFinite = (n) => {
		if (!Number.isFinite(n)) return;
		return Math.min(Math.floor(n), MAX_USAGE_DAYS);
	};
	if (typeof raw === "number") return fromFinite(raw);
	if (typeof raw === "string" && raw.trim() !== "") return fromFinite(Number(raw));
};
const resolveRangeDays = (raw) => {
	if (raw === "all") return "all";
	if (raw === "7d") return 7;
	if (raw === "30d") return 30;
	if (raw === "90d") return 90;
	if (raw === "1y") return 365;
};
const resolveTrailingDays = (endDateParts, days, interpretation) => {
	const startMs = datePartsToStartMs(shiftDateParts(endDateParts, -(days - 1)), interpretation);
	const endMs = datePartsToEndMs(endDateParts, interpretation);
	if (startMs === void 0 || endMs === void 0) return {
		ok: false,
		error: "calendar day does not exist in requested time zone"
	};
	return {
		ok: true,
		value: {
			startMs,
			endMs
		}
	};
};
/**
* Get date range from params (startDate/endDate or days).
* Falls back to last 30 days if not provided.
*/
const resolveDateRange = (params, resolvedInterpretation) => {
	const invalidDate = findInvalidExplicitDate(params);
	if (invalidDate) return {
		ok: false,
		error: `invalid ${invalidDate}: expected a valid YYYY-MM-DD calendar date`
	};
	const now = /* @__PURE__ */ new Date();
	const interpretationResolution = resolvedInterpretation ? {
		ok: true,
		value: resolvedInterpretation
	} : resolveDateInterpretation(params);
	if (!interpretationResolution.ok) return interpretationResolution;
	const interpretation = interpretationResolution.value;
	const todayDateParts = getDateParts(now, interpretation);
	const todayEndMs = datePartsToEndMs(todayDateParts, interpretation);
	if (todayEndMs === void 0) return {
		ok: false,
		error: "calendar day does not exist in requested time zone"
	};
	const startDateParts = parseDateParts(params.startDate);
	const endDateParts = parseDateParts(params.endDate);
	if (startDateParts === void 0 !== (endDateParts === void 0)) return {
		ok: false,
		error: "startDate and endDate must be provided together"
	};
	if (startDateParts && endDateParts) {
		const startMs = datePartsToStartMs(startDateParts, interpretation);
		const endStartMs = datePartsToStartMs(endDateParts, interpretation);
		const endMs = datePartsToEndMs(endDateParts, interpretation);
		if (startMs === void 0 || endStartMs === void 0 || endMs === void 0) return {
			ok: false,
			error: "calendar day does not exist in requested time zone"
		};
		if (startMs > endStartMs) return {
			ok: false,
			error: "startDate must not be after endDate"
		};
		return {
			ok: true,
			value: {
				startMs,
				endMs
			}
		};
	}
	const rangeDays = resolveRangeDays(params.range);
	if (rangeDays === "all") return {
		ok: true,
		value: {
			startMs: 0,
			endMs: todayEndMs,
			includeUntimestamped: true
		}
	};
	if (rangeDays !== void 0) return resolveTrailingDays(todayDateParts, rangeDays, interpretation);
	const days = parseDays(params.days);
	if (days !== void 0) return resolveTrailingDays(todayDateParts, Math.max(1, days), interpretation);
	return resolveTrailingDays(todayDateParts, 30, interpretation);
};
//#endregion
//#region src/gateway/server-methods/usage-session-loading.ts
const USAGE_AGENT_LOAD_CONCURRENCY = 12;
async function runUsageAgentTasks(tasks) {
	const result = await runTasksWithConcurrency({
		tasks,
		limit: USAGE_AGENT_LOAD_CONCURRENCY,
		errorMode: "stop"
	});
	if (result.hasError) throw result.firstError;
	return result.results;
}
async function discoverAllSessionsForUsage(params) {
	const requestedAgentId = normalizeOptionalString(params.agentId);
	return (await runUsageAgentTasks((requestedAgentId ? [{ id: normalizeAgentId(requestedAgentId) }] : listGatewayAgentsBasic(params.config).agents).map((agent) => async () => {
		const agentId = normalizeAgentId(agent.id);
		return (await discoverAllSessions({
			agentId,
			startMs: params.startMs,
			endMs: params.endMs,
			includeFirstUserMessage: false
		})).map((session) => Object.assign({}, session, { agentId }));
	}))).flat().toSorted((a, b) => b.mtime - a.mtime);
}
function mergeUsageCacheStatus(target, source) {
	if (!target) return { ...source };
	const statusRank = {
		fresh: 0,
		partial: 1,
		stale: 2,
		refreshing: 3
	};
	return {
		status: statusRank[source.status] > statusRank[target.status] ? source.status : target.status,
		cachedFiles: target.cachedFiles + source.cachedFiles,
		pendingFiles: target.pendingFiles + source.pendingFiles,
		staleFiles: target.staleFiles + source.staleFiles,
		refreshedAt: target.refreshedAt === void 0 ? source.refreshedAt : source.refreshedAt === void 0 ? target.refreshedAt : Math.max(target.refreshedAt, source.refreshedAt)
	};
}
async function loadUsageSessionSummaries(params) {
	const { entries: mergedEntries, config, startMs, endMs, includeUntimestamped, dayBucket } = params;
	let cacheStatus;
	const usageByEntryIndex = Array.from({ length: mergedEntries.length }, () => null);
	const sessionsByAgent = /* @__PURE__ */ new Map();
	for (const [entryIndex, merged] of mergedEntries.entries()) for (const { sessionId, sessionFile } of merged.instances) {
		const agentSessions = sessionsByAgent.get(merged.agentId) ?? [];
		agentSessions.push({
			entryIndex,
			sessionId,
			sessionFile
		});
		sessionsByAgent.set(merged.agentId, agentSessions);
	}
	const agentLoads = await runUsageAgentTasks(Array.from(sessionsByAgent.entries()).map(([agentId, agentSessions]) => async () => ({
		agentSessions,
		loaded: await loadSessionCostSummariesFromCache({
			sessions: agentSessions,
			config,
			agentId,
			startMs,
			endMs,
			includeUntimestamped,
			dayBucket
		})
	})));
	for (const { agentSessions, loaded } of agentLoads) {
		cacheStatus = mergeUsageCacheStatus(cacheStatus, loaded.cacheStatus);
		for (const [index, summary] of loaded.summaries.entries()) {
			if (!summary) continue;
			const session = expectDefined(agentSessions[index], "agent sessions entry at index");
			const merged = expectDefined(mergedEntries[session.entryIndex], "merged entries entry at session.entry index");
			const usage = usageByEntryIndex[session.entryIndex] ?? createEmptyCostUsageTotals();
			usage.sessionId = merged.sessionId;
			usage.sessionFile = merged.sessionFile;
			mergeSessionCostSummaryInto(usage, summary);
			usageByEntryIndex[session.entryIndex] = usage;
		}
	}
	return {
		summaries: usageByEntryIndex,
		cacheStatus
	};
}
//#endregion
//#region src/gateway/server-methods/usage-result-cache.ts
const USAGE_CACHE_TTL_MS = 3e4;
const USAGE_CACHE_MAX = 256;
const costUsageCache = /* @__PURE__ */ new Map();
const sessionsUsageCache = /* @__PURE__ */ new Map();
function setUsageCache(cache, cacheKey, entry) {
	if (!cache.has(cacheKey) && cache.size >= USAGE_CACHE_MAX) {
		let evictionKey = cache.keys().next().value;
		for (const [key, candidate] of cache) if (!candidate.inFlight) {
			evictionKey = key;
			break;
		}
		if (evictionKey !== void 0) cache.delete(evictionKey);
	}
	cache.set(cacheKey, entry);
}
async function loadUsageResultCached(params) {
	const { cache, cacheKey, configRef } = params;
	const candidate = cache.get(cacheKey);
	const cached = candidate?.configRef === configRef ? candidate : void 0;
	if (cached?.value && cached.updatedAt && Date.now() - cached.updatedAt < USAGE_CACHE_TTL_MS) return cached.value;
	if (cached?.inFlight) return cached.value && cached.updatedAt ? cached.value : await cached.inFlight;
	const entry = cached ?? { configRef };
	const inFlight = params.load().then((value) => {
		if (cache.get(cacheKey) !== entry) return value;
		if (params.isComplete?.(value) ?? true) {
			entry.value = value;
			entry.updatedAt = Date.now();
		} else if (!entry.value) {
			entry.value = value;
			delete entry.updatedAt;
		}
		return value;
	}).catch((error) => {
		if (entry.value) return entry.value;
		throw error;
	}).finally(() => {
		const current = cache.get(cacheKey);
		if (current === entry && current.inFlight === inFlight) current.inFlight = void 0;
	});
	entry.inFlight = inFlight;
	setUsageCache(cache, cacheKey, entry);
	return entry.value && entry.updatedAt ? entry.value : await inFlight;
}
function usageDayBucketCacheKey(dayBucket) {
	return dayBucket ? dayBucket.mode === "time-zone" ? `time-zone:${dayBucket.timeZone}` : `utc-offset:${dayBucket.utcOffsetMinutes}` : "gateway";
}
function sessionsUsageCacheKey(params) {
	return JSON.stringify([
		params.agentScope === "all" ? "all" : `agent:${params.agentId}`,
		params.startMs,
		params.endMs,
		params.includeUntimestamped === true,
		usageDayBucketCacheKey(params.dayBucket),
		params.limit,
		params.groupingMode,
		params.specificKey,
		params.includeContextWeight,
		...params.visibilityIdentity ? [params.visibilityIdentity] : []
	]);
}
async function loadSessionsUsageResultCached(params) {
	return await loadUsageResultCached({
		cache: sessionsUsageCache,
		cacheKey: sessionsUsageCacheKey(params),
		configRef: params.configRef,
		load: params.load,
		isComplete: (result) => !result.cacheStatus || result.cacheStatus.status === "fresh"
	});
}
async function loadCostUsageSummaryCached(params) {
	const allAgents = params.agentScope === "all";
	const agentId = allAgents ? void 0 : normalizeAgentId(params.agentId ?? resolveSessionAgentId({ config: params.config }));
	const dayBucketKey = usageDayBucketCacheKey(params.dayBucket);
	const cacheKey = `${allAgents ? "all" : `agent:${agentId}`}:${params.startMs}-${params.endMs}:${dayBucketKey}`;
	return await loadUsageResultCached({
		cache: costUsageCache,
		cacheKey,
		configRef: params.config,
		load: () => allAgents ? loadAllAgentCostUsageSummary({
			startMs: params.startMs,
			endMs: params.endMs,
			dayBucket: params.dayBucket,
			config: params.config
		}) : loadCostUsageSummaryFromCache({
			startMs: params.startMs,
			endMs: params.endMs,
			dayBucket: params.dayBucket,
			config: params.config,
			agentId: expectDefined(agentId, "non-aggregate usage agent id"),
			requestRefresh: true,
			refreshMode: "background"
		})
	});
}
async function loadAllAgentCostUsageSummary(params) {
	const summaries = await runUsageAgentTasks(listGatewayAgentsBasic(params.config).agents.map((agent) => normalizeAgentId(agent.id)).map((agentId) => () => loadCostUsageSummaryFromCache({
		startMs: params.startMs,
		endMs: params.endMs,
		dayBucket: params.dayBucket,
		config: params.config,
		agentId,
		requestRefresh: true,
		refreshMode: "background"
	})));
	const dailyByDate = /* @__PURE__ */ new Map();
	const totals = createEmptyCostUsageTotals();
	let cacheStatus;
	let updatedAt = 0;
	let days = 0;
	for (const summary of summaries) {
		updatedAt = Math.max(updatedAt, summary.updatedAt);
		days = Math.max(days, summary.days);
		addCostUsageTotals(totals, summary.totals);
		if (summary.cacheStatus) cacheStatus = mergeUsageCacheStatus(cacheStatus, summary.cacheStatus);
		for (const day of summary.daily) {
			const entry = dailyByDate.get(day.date) ?? {
				date: day.date,
				...createEmptyCostUsageTotals()
			};
			addCostUsageTotals(entry, day);
			dailyByDate.set(day.date, entry);
		}
	}
	return {
		updatedAt,
		days,
		daily: Array.from(dailyByDate.values()).toSorted((a, b) => a.date.localeCompare(b.date)),
		totals,
		...cacheStatus ? { cacheStatus } : {}
	};
}
//#endregion
//#region src/gateway/server-methods/usage-session-selection.ts
var UsageSessionInvalidRequestError = class extends Error {};
function resolveSessionUsageTarget(key, config, agentIdHint) {
	const { canonicalKey, entry, storePath } = loadGatewaySessionEntryReadOnly(key, agentIdHint ? { agentId: agentIdHint } : void 0);
	const parsed = parseAgentSessionKey(key);
	const agentId = parsed?.agentId ?? agentIdHint ?? resolveSessionAgentId({
		config,
		sessionKey: key
	});
	const sessionId = entry?.sessionId ?? parsed?.rest ?? key;
	const sessionFile = entry ? resolveExistingUsageSessionFile({
		agentId,
		sessionId,
		sessionTarget: {
			agentId,
			sessionId,
			sessionKey: canonicalKey,
			storePath
		}
	}) : resolveExistingUsageSessionFile({
		agentId,
		sessionId,
		sessionFile: resolveSessionFilePathCore(sessionId, void 0, resolveSessionFilePathOptions({
			storePath,
			agentId
		}))
	});
	return sessionFile ? {
		entry,
		agentId,
		sessionId,
		sessionFile
	} : void 0;
}
function usageSessionIdentity(agentId, sessionId) {
	return `${agentId}\0${sessionId}`;
}
function buildStoreBySessionIdentity(store, agentIdBySessionKey) {
	const matchesByIdentity = /* @__PURE__ */ new Map();
	for (const [key, entry] of Object.entries(store)) {
		if (!entry?.sessionId) continue;
		const identity = usageSessionIdentity(expectDefined(agentIdBySessionKey.get(key), "stored session owner"), entry.sessionId);
		const matches = matchesByIdentity.get(identity) ?? [];
		matches.push([key, entry]);
		matchesByIdentity.set(identity, matches);
	}
	const storeByIdentity = /* @__PURE__ */ new Map();
	for (const [identity, matches] of matchesByIdentity) {
		const sessionId = expectDefined(matches[0], "stored session match")[1].sessionId;
		const preferredKey = resolvePreferredSessionKeyForSessionIdMatches(matches, sessionId);
		if (!preferredKey) continue;
		const preferredEntry = store[preferredKey];
		if (preferredEntry) storeByIdentity.set(identity, {
			key: preferredKey,
			entry: preferredEntry
		});
	}
	const familyMatches = /* @__PURE__ */ new Map();
	for (const { key, entry } of storeByIdentity.values()) {
		const agentId = expectDefined(agentIdBySessionKey.get(key), "stored session owner");
		for (const sessionId of entry.usageFamilySessionIds ?? []) {
			const identity = usageSessionIdentity(agentId, sessionId);
			if (!storeByIdentity.has(identity)) {
				const candidates = familyMatches.get(identity) ?? {
					sessionId,
					matches: []
				};
				candidates.matches.push([key, entry]);
				familyMatches.set(identity, candidates);
			}
		}
	}
	const familyOwners = new Map(storeByIdentity);
	for (const [identity, { sessionId, matches }] of familyMatches) {
		const key = resolvePreferredSessionKeyForSessionIdMatches(matches, sessionId);
		if (key) familyOwners.set(identity, {
			key,
			entry: expectDefined(store[key], "family owner")
		});
	}
	return {
		storeByIdentity,
		familyOwners
	};
}
function withUsageGrouping(base, groupingMode, familyOwners, discoveredByIdentity) {
	const currentInstance = {
		sessionId: base.sessionId,
		sessionFile: base.sessionFile
	};
	if (groupingMode !== "family") return {
		...base,
		instances: [currentInstance]
	};
	const includedSessionIds = [...new Set([base.sessionId, ...base.storeEntry?.usageFamilySessionIds ?? []].map(normalizeOptionalString).filter((id) => Boolean(id)))].filter((id) => id === base.sessionId || familyOwners.get(usageSessionIdentity(base.agentId, id))?.entry.sessionId === base.sessionId);
	return {
		...base,
		instances: includedSessionIds.flatMap((id) => {
			const instance = id === base.sessionId ? currentInstance : discoveredByIdentity.get(usageSessionIdentity(base.agentId, id));
			return instance ? [instance] : [];
		}),
		scope: "family",
		sessionFamilyKey: base.storeEntry?.usageFamilyKey ?? base.key,
		currentSessionId: base.sessionId,
		includedSessionIds
	};
}
async function selectUsageSessions(params) {
	const { config, agentId: effectiveAgentId, specificKey, groupingMode, startMs, endMs, visibilityFilter } = params;
	const { store, agentIdBySessionKey } = loadCombinedSessionStoreForGatewayCore(config, effectiveAgentId ? { agentId: effectiveAgentId } : {});
	const scopedStore = Object.fromEntries(Object.entries(store).filter(([key, entry]) => (!effectiveAgentId || agentIdBySessionKey.get(key) === effectiveAgentId) && (!visibilityFilter || visibilityFilter(key, entry))));
	const { storeByIdentity: storeBySessionIdentity, familyOwners } = buildStoreBySessionIdentity(scopedStore, agentIdBySessionKey);
	const discoveredSessions = !specificKey || groupingMode === "family" ? await discoverAllSessionsForUsage({
		config,
		...effectiveAgentId ? { agentId: effectiveAgentId } : {},
		startMs,
		endMs
	}) : [];
	const discoveredByIdentity = new Map(discoveredSessions.map((session) => [usageSessionIdentity(session.agentId, session.sessionId), session]));
	const now = Date.now();
	const mergedEntries = [];
	if (specificKey) {
		const scopedSpecificKey = resolveStoredSessionKeyForAgentStore({
			cfg: config,
			agentId: expectDefined(effectiveAgentId, "specific session owner"),
			sessionKey: specificKey
		});
		const scopedParsed = parseAgentSessionKey(scopedSpecificKey);
		const agentIdFromKey = scopedParsed?.agentId ?? expectDefined(effectiveAgentId, "specific session owner");
		const keyRest = scopedParsed?.rest ?? specificKey;
		const storeMatch = scopedStore[scopedSpecificKey] ? {
			key: scopedSpecificKey,
			entry: scopedStore[scopedSpecificKey]
		} : scopedStore[specificKey] ? {
			key: specificKey,
			entry: scopedStore[specificKey]
		} : null;
		const storeByIdMatch = storeBySessionIdentity.get(usageSessionIdentity(agentIdFromKey, keyRest)) ?? (keyRest !== specificKey ? storeBySessionIdentity.get(usageSessionIdentity(agentIdFromKey, specificKey)) : void 0) ?? null;
		const resolvedStoreKey = storeMatch?.key ?? storeByIdMatch?.key ?? scopedSpecificKey;
		const storeEntry = storeMatch?.entry ?? storeByIdMatch?.entry;
		if (visibilityFilter && !storeEntry) throw new UsageSessionInvalidRequestError(`Invalid session reference: ${specificKey}`);
		const sessionId = storeEntry?.sessionId ?? keyRest;
		let resolved;
		try {
			resolved = resolveSessionUsageTarget(resolvedStoreKey, config, agentIdFromKey);
			if (!resolved || resolved.agentId !== agentIdFromKey || resolved.sessionId !== sessionId) throw new Error("session target mismatch");
		} catch {
			throw new UsageSessionInvalidRequestError(`Invalid session reference: ${specificKey}`);
		}
		const { sessionFile } = resolved;
		let updatedAt;
		if (parseSqliteSessionFileMarker(sessionFile)) updatedAt = storeEntry?.updatedAt ?? now;
		else try {
			const stats = fs.statSync(sessionFile);
			if (stats.isFile()) updatedAt = storeEntry?.updatedAt ?? stats.mtimeMs;
		} catch {}
		if (updatedAt !== void 0) mergedEntries.push(withUsageGrouping({
			key: resolvedStoreKey,
			agentId: agentIdFromKey,
			sessionId,
			sessionFile,
			label: storeEntry?.label,
			updatedAt,
			storeEntry
		}, groupingMode, familyOwners, discoveredByIdentity));
	} else {
		const selectedFamilies = /* @__PURE__ */ new Set();
		for (const discovered of discoveredSessions) {
			const identity = usageSessionIdentity(discovered.agentId, discovered.sessionId);
			const owner = (groupingMode === "family" ? familyOwners : storeBySessionIdentity).get(identity);
			if (!owner) {
				if (!visibilityFilter) mergedEntries.push({
					key: `agent:${discovered.agentId}:${discovered.sessionId}`,
					agentId: discovered.agentId,
					sessionId: discovered.sessionId,
					sessionFile: discovered.sessionFile,
					instances: [discovered],
					updatedAt: discovered.mtime,
					scope: "instance"
				});
				continue;
			}
			const { key, entry } = owner;
			const familyIdentity = usageSessionIdentity(discovered.agentId, key);
			if (selectedFamilies.has(familyIdentity)) continue;
			let sessionFile = discoveredByIdentity.get(usageSessionIdentity(discovered.agentId, entry.sessionId))?.sessionFile;
			if (!sessionFile) {
				const target = resolveSessionUsageTarget(key, config, discovered.agentId);
				if (!target || target.agentId !== discovered.agentId || target.sessionId !== entry.sessionId) throw new UsageSessionInvalidRequestError(`Invalid session reference: ${key}`);
				sessionFile = target.sessionFile;
			}
			mergedEntries.push(withUsageGrouping({
				key,
				agentId: discovered.agentId,
				sessionId: entry.sessionId,
				sessionFile,
				label: entry.label,
				updatedAt: entry.updatedAt ?? discovered.mtime,
				storeEntry: entry
			}, groupingMode, familyOwners, discoveredByIdentity));
			if (groupingMode === "family") selectedFamilies.add(familyIdentity);
		}
	}
	mergedEntries.sort((a, b) => b.updatedAt - a.updatedAt);
	return mergedEntries;
}
//#endregion
//#region src/gateway/server-methods/usage.ts
function resolveSessionUsageFileOrRespond(key, respond, config) {
	const sessionOwner = resolveRequestedSessionAgentId(config, key);
	if (!sessionOwner.ok) {
		respond(false, void 0, sessionOwner.error);
		return null;
	}
	let resolved;
	try {
		resolved = resolveSessionUsageTarget(key, config, sessionOwner.agentId);
	} catch {
		resolved = void 0;
	}
	if (!resolved) {
		respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `Invalid session key: ${key}`));
		return null;
	}
	return {
		config,
		...resolved
	};
}
function resolveUsageDateRangeOrRespond(params, respond) {
	const interpretation = resolveDateInterpretation(params);
	if (!interpretation.ok) {
		respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, interpretation.error));
		return null;
	}
	const range = resolveDateRange(params, interpretation.value);
	if (!range.ok) {
		respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, range.error));
		return null;
	}
	return {
		interpretation: interpretation.value,
		range: range.value
	};
}
const usageHandlersInProcess = {
	"usage.status": async ({ respond, context, client }) => {
		const coldRead = hasGatewayClientCap(client?.connect?.caps, GATEWAY_CLIENT_CAPS.USAGE_REFRESHING) ? "refresh-marker" : void 0;
		respond(true, await loadUsageStatusStaleWhileRevalidate({
			config: context.getRuntimeConfig(),
			coldRead
		}), void 0);
	},
	"usage.cost": async ({ respond, params, context, client }) => {
		const dateRange = resolveUsageDateRangeOrRespond(params ?? {}, respond);
		if (!dateRange) return;
		const { interpretation: dateInterpretation, range } = dateRange;
		const config = context.getRuntimeConfig();
		if (!isGatewayAdmin(client ?? null) && operatorSessionCap(client ?? null, config) === "none") {
			respond(false, void 0, errorShape(ErrorCodes.FORBIDDEN, "Aggregate usage includes sessions hidden by your operator role; ask an administrator to review Gateway-wide usage."));
			return;
		}
		const { startMs, endMs } = range;
		const agentId = normalizeOptionalString(params?.agentId);
		if (params?.agentScope === "all" && agentId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "agentScope=all cannot be combined with agentId"));
			return;
		}
		const agentScope = params?.agentScope === "all" ? "all" : void 0;
		let effectiveAgentId = agentId;
		if (!agentScope && !effectiveAgentId) {
			const requestedAgent = resolveRequestedSessionAgentId(config, "main");
			if (!requestedAgent.ok) {
				respond(false, void 0, requestedAgent.error);
				return;
			}
			effectiveAgentId = requestedAgent.agentId;
		}
		respond(true, await loadCostUsageSummaryCached({
			startMs,
			endMs,
			dayBucket: resolveDayBucket(dateInterpretation),
			config,
			agentId: effectiveAgentId,
			agentScope
		}), void 0);
	},
	"sessions.usage": async ({ respond, params, context, client }) => {
		if (!assertValidParams(params, validateSessionsUsageParams, "sessions.usage", respond)) return;
		const p = params;
		const dateRange = resolveUsageDateRangeOrRespond(p, respond);
		if (!dateRange) return;
		const { interpretation: dateInterpretation, range } = dateRange;
		const config = context.getRuntimeConfig();
		const sessionCap = operatorSessionCap(client ?? null, config);
		const visibilityFilter = sessionCap === "none" ? createSessionListEntryFilter({
			client: client ?? null,
			cfg: config
		}) : void 0;
		const profileId = gatewayClientSessionCreator(client ?? null)?.id;
		const visibilityIdentity = sessionCap && profileId ? `${profileId}:${sessionCap}` : void 0;
		const { startMs, endMs, includeUntimestamped } = range;
		const dayBucket = resolveDayBucket(dateInterpretation);
		const limit = typeof p.limit === "number" && Number.isFinite(p.limit) ? p.limit : 50;
		const includeContextWeight = p.includeContextWeight ?? false;
		const specificKey = normalizeOptionalString(p.key) ?? null;
		const requestedAgentId = normalizeOptionalString(p.agentId);
		const requestedAllAgents = p.agentScope === "all";
		if (requestedAllAgents && (requestedAgentId || specificKey)) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "agentScope=all cannot be combined with key or agentId"));
			return;
		}
		const specificSessionOwner = specificKey ? resolveRequestedSessionAgentId(config, specificKey, requestedAgentId) : void 0;
		if (specificSessionOwner && !specificSessionOwner.ok) {
			respond(false, void 0, specificSessionOwner.error);
			return;
		}
		const implicitAgent = !requestedAllAgents && !specificSessionOwner?.agentId && !requestedAgentId ? resolveRequestedSessionAgentId(config, "main") : void 0;
		if (implicitAgent && !implicitAgent.ok) {
			respond(false, void 0, implicitAgent.error);
			return;
		}
		const effectiveAgentId = requestedAllAgents ? void 0 : normalizeAgentId(specificSessionOwner?.agentId ?? requestedAgentId ?? implicitAgent?.agentId);
		const groupingMode = p.groupBy === "family" || p.includeHistorical === true ? "family" : "instance";
		let result;
		try {
			result = await loadSessionsUsageResultCached({
				configRef: config,
				...effectiveAgentId ? { agentId: effectiveAgentId } : { agentScope: "all" },
				startMs,
				endMs,
				includeUntimestamped,
				dayBucket,
				limit,
				groupingMode,
				specificKey,
				includeContextWeight,
				...visibilityIdentity ? { visibilityIdentity } : {},
				load: async () => {
					const now = Date.now();
					const mergedEntries = await selectUsageSessions({
						config,
						agentId: effectiveAgentId,
						specificKey,
						groupingMode,
						startMs,
						endMs,
						visibilityFilter
					});
					const sessions = [];
					const accumulator = createUsageAggregateAccumulator();
					const { summaries: usageByEntryIndex, cacheStatus } = await loadUsageSessionSummaries({
						entries: mergedEntries,
						config,
						startMs,
						endMs,
						includeUntimestamped,
						dayBucket
					});
					for (const [entryIndex, merged] of mergedEntries.entries()) {
						const agentId = merged.agentId;
						const usage = usageByEntryIndex[entryIndex] ?? null;
						const channel = sessionDeliveryChannel(merged.storeEntry);
						const origin = sessionDeliveryOrigin(merged.storeEntry);
						const chatType = merged.storeEntry?.chatType ?? origin?.chatType;
						accumulator.add({
							usage,
							agentId,
							channel
						});
						if (entryIndex < limit) sessions.push({
							key: merged.key,
							label: merged.label,
							sessionId: merged.sessionId,
							scope: merged.scope ?? "instance",
							sessionFamilyKey: merged.sessionFamilyKey,
							currentSessionId: merged.currentSessionId,
							includedSessionIds: merged.includedSessionIds,
							historicalInstanceCount: merged.includedSessionIds?.length,
							updatedAt: merged.updatedAt,
							agentId,
							channel,
							chatType,
							origin,
							modelOverride: merged.storeEntry?.modelOverride,
							providerOverride: merged.storeEntry?.providerOverride,
							modelProvider: merged.storeEntry?.modelProvider,
							model: merged.storeEntry?.model,
							usage,
							hasContextWeight: Boolean(merged.storeEntry?.systemPromptReport),
							contextWeight: includeContextWeight ? merged.storeEntry?.systemPromptReport ?? null : void 0
						});
					}
					return {
						updatedAt: now,
						startDate: formatDateLabel(startMs, dateInterpretation),
						endDate: formatDateLabel(endMs, dateInterpretation),
						sessions,
						totals: accumulator.totals,
						aggregates: accumulator.finish(),
						cacheStatus
					};
				}
			});
		} catch (err) {
			if (err instanceof UsageSessionInvalidRequestError) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, err.message));
				return;
			}
			throw err;
		}
		respond(true, result, void 0);
	},
	"sessions.usage.timeseries": async ({ respond, params, context }) => {
		const key = normalizeOptionalString(params?.key) ?? null;
		if (!key) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "key is required for timeseries"));
			return;
		}
		const resolved = resolveSessionUsageFileOrRespond(key, respond, context.getRuntimeConfig());
		if (!resolved) return;
		const { config, entry, agentId, sessionId, sessionFile } = resolved;
		const timeseries = await loadSessionUsageTimeSeries({
			sessionId,
			sessionEntry: entry,
			sessionFile,
			config,
			agentId,
			maxPoints: 200
		});
		if (!timeseries) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `No transcript found for session: ${key}`));
			return;
		}
		respond(true, timeseries, void 0);
	},
	"sessions.usage.logs": async ({ respond, params, context }) => {
		const key = normalizeOptionalString(params?.key) ?? null;
		if (!key) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "key is required for logs"));
			return;
		}
		const limit = typeof params?.limit === "number" && Number.isFinite(params.limit) ? Math.min(params.limit, 1e3) : 200;
		const resolved = resolveSessionUsageFileOrRespond(key, respond, context.getRuntimeConfig());
		if (!resolved) return;
		const { config, entry, agentId, sessionId, sessionFile } = resolved;
		respond(true, { logs: await loadSessionLogs({
			sessionId,
			sessionEntry: entry,
			sessionFile,
			config,
			agentId,
			limit
		}) ?? [] }, void 0);
	}
};
//#endregion
//#region usage-offload-v1: usage RPCs run whole in the usage worker (src/gateway/server-methods/usage-offload.ts)
const USAGE_OFFLOAD_RPC_METHODS = [
	"usage.cost",
	"sessions.usage",
	"sessions.usage.timeseries",
	"sessions.usage.logs"
];
function canRunUsageRpcInWorker(method, client, config) {
	if (method === "sessions.usage.timeseries" || method === "sessions.usage.logs") return true;
	return isGatewayAdmin(client) && operatorSessionCap(client, config) !== "none";
}
function offloadUsageRpcHandlers(handlers) {
	const wrapped = { ...handlers };
	for (const method of USAGE_OFFLOAD_RPC_METHODS) {
		const inProcess = handlers[method];
		if (!inProcess) continue;
		wrapped[method] = async (opts) => {
			if (!isUsageOffloadEnabled()) return await inProcess(opts);
			const config = opts.context.getRuntimeConfig();
			if (!canRunUsageRpcInWorker(method, opts.client, config)) return await inProcess(opts);
			let reply;
			try {
				reply = await callUsageOffloadRpc(method, opts.params, config);
			} catch (error) {
				opts.respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, `usage report failed: ${error instanceof Error ? error.message : String(error)}`));
				return;
			}
			opts.respond(reply.ok, reply.payload, reply.error);
		};
	}
	return wrapped;
}
const usageHandlers = offloadUsageRpcHandlers(usageHandlersInProcess);
//#endregion
export { usageHandlers as t, usageHandlersInProcess };
