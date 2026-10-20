import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { A as resolveSessionAuthProfileOverrideSource, E as hasSessionAutoModelFallbackProvenance } from "./agent-scope-CSlN0kZb.js";
import { d as loadSessionEntry } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { i as preserveCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import "./session-accessor-K0XuW6ln.js";
import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";
import { t as clearAllCliSessions } from "./cli-session-binding-Aa6nlDa8.js";
import { d as resolveSessionLifecycleTimestamps, f as resolveSessionWorkStartError } from "./lifecycle-CKz-1QIz.js";
import { n as resolveSessionResetPolicy, t as evaluateSessionFreshness } from "./reset-policy-Bcf937ne.js";
import { r as clearBootstrapSnapshotOnSessionRollover } from "./bootstrap-cache-3uOvqmbO.js";
import { t as hasProviderOwnedSession } from "./entry-freshness-F3oj9sjv.js";
import "./cli-session-Cjwu0-eF.js";
import crypto from "node:crypto";
//#region src/cron/isolated-agent/session.ts
/** Resolves session rollover and carried state for isolated cron runs. */
const FRESH_CRON_CARRIED_PREFERENCE_FIELDS = [
	"chatType",
	"thinkingLevel",
	"fastMode",
	"verboseLevel",
	"traceLevel",
	"reasoningLevel",
	"ttsAuto",
	"responseUsage",
	"pinnedAt",
	"label",
	"displayName"
];
const AMBIENT_SESSION_CONTEXT_FIELDS = [
	"elevatedLevel",
	"groupActivation",
	"groupActivationNeedsSystemIntro",
	"sendPolicy",
	"queueMode",
	"queueDebounceMs",
	"queueCap",
	"queueDrop",
	"groupId",
	"subject",
	"groupChannel",
	"space",
	"acp"
];
function cloneSessionField(value) {
	return globalThis.structuredClone(value);
}
function copySessionFields(target, entry, fields) {
	for (const field of fields) if (entry[field] !== void 0) target[field] = cloneSessionField(entry[field]);
}
function preserveNonAutoModelOverride(target, entry) {
	const recoveredAutoFallbackOverride = entry.modelOverrideSource === void 0 && hasSessionAutoModelFallbackProvenance(entry);
	if (entry.modelOverrideSource !== "auto" && !recoveredAutoFallbackOverride) {
		let preservedModelSelection = false;
		if (entry.modelOverride !== void 0) {
			target.modelOverride = entry.modelOverride;
			preservedModelSelection = true;
		}
		if (entry.providerOverride !== void 0) target.providerOverride = entry.providerOverride;
		if (entry.modelOverrideSource !== void 0) target.modelOverrideSource = entry.modelOverrideSource;
		if (entry.modelOverrideRouteResolution !== void 0) target.modelOverrideRouteResolution = entry.modelOverrideRouteResolution;
		if (preservedModelSelection && entry.agentRuntimeOverride !== void 0) target.agentRuntimeOverride = entry.agentRuntimeOverride;
	}
}
function preserveUserAuthOverride(target, entry) {
	const source = resolveSessionAuthProfileOverrideSource(entry);
	if (source === "user") {
		if (entry.authProfileOverride !== void 0) target.authProfileOverride = entry.authProfileOverride;
		target.authProfileOverrideSource = source;
		if (entry.authProfileOverrideCompactionCount !== void 0) target.authProfileOverrideCompactionCount = entry.authProfileOverrideCompactionCount;
	}
}
function sanitizeFreshCronSessionEntry(entry, options) {
	const next = {};
	copySessionFields(next, entry, FRESH_CRON_CARRIED_PREFERENCE_FIELDS);
	if (entry.skillLibrarySelections) next.skillLibrarySelections = entry.skillLibrarySelections.map((selection) => ({ ...selection }));
	if (options.preserveAmbientContext) copySessionFields(next, entry, AMBIENT_SESSION_CONTEXT_FIELDS);
	preserveNonAutoModelOverride(next, entry);
	preserveUserAuthOverride(next, entry);
	return next;
}
/**
* Reads the current cron session row without an in-process cache snapshot.
* Lifecycle admission guards compare this against the run's initial entry, so
* the read must bypass cached store snapshots (accessor readConsistency
* "latest"). Cron keys are canonicalized before use, so accessor key
* resolution selects the same row the cron persist path writes.
*/
function loadCronSessionEntryLatest(storePath, sessionKey) {
	return loadSessionEntry({
		sessionKey,
		storePath,
		readConsistency: "latest"
	});
}
/** Resolves or rolls over the cron session entry for one isolated-agent run. */
function resolveCronSession(params) {
	const sessionCfg = params.cfg.session;
	const storePath = resolveSessionStorePathCore(sessionCfg?.store, { agentId: params.agentId });
	const store = params.store ?? Object.fromEntries(listSessionEntriesCore({
		agentId: params.agentId,
		storePath
	}).map(({ sessionKey, entry }) => [sessionKey, entry]));
	const sourceSessionKey = params.sourceSessionKey?.trim();
	const sourceSessionDiffers = Boolean(sourceSessionKey && sourceSessionKey !== params.sessionKey);
	const targetEntry = store[params.sessionKey];
	const entry = store[sourceSessionKey || params.sessionKey];
	const canRollArchivedHeartbeat = params.forceNew === true && targetEntry?.archivedAt !== void 0 && targetEntry.initializationPending !== true && Boolean(targetEntry.heartbeatIsolatedBaseSessionKey?.trim());
	const sessionWorkStartError = resolveSessionWorkStartError(params.sessionKey, targetEntry);
	if (sessionWorkStartError && !canRollArchivedHeartbeat) throw new Error(sessionWorkStartError);
	let sessionId;
	let isNewSession;
	let systemSent;
	let resetBoundaryPending;
	if (!params.forceNew && entry?.sessionId) {
		const resetPolicy = resolveSessionResetPolicy({
			sessionCfg,
			resetType: "direct"
		});
		if ((resetPolicy.configured !== true && hasProviderOwnedSession(entry) ? { fresh: true } : evaluateSessionFreshness({
			updatedAt: entry.updatedAt,
			...resolveSessionLifecycleTimestamps({
				entry,
				agentId: params.agentId,
				sessionKey: params.sessionKey,
				storePath
			}),
			now: params.nowMs,
			policy: resetPolicy
		})).fresh) {
			sessionId = entry.sessionId;
			isNewSession = false;
			systemSent = entry.systemSent ?? false;
		} else {
			sessionId = sourceSessionDiffers ? crypto.randomUUID() : entry.sessionId;
			isNewSession = true;
			systemSent = false;
			if (!sourceSessionDiffers) resetBoundaryPending = {
				reason: "cron-stale",
				sessionFile: params.sessionKey
			};
		}
	} else {
		sessionId = crypto.randomUUID();
		isNewSession = true;
		systemSent = false;
	}
	const previousSessionId = isNewSession && !sourceSessionDiffers && !resetBoundaryPending ? entry?.sessionId : void 0;
	clearBootstrapSnapshotOnSessionRollover({
		sessionKey: params.sessionKey,
		previousSessionId
	});
	const baseEntry = entry ? isNewSession ? sanitizeFreshCronSessionEntry(entry, { preserveAmbientContext: !params.forceNew }) : entry : void 0;
	const lifecycleRevision = crypto.randomUUID();
	const sessionEntry = {
		...baseEntry,
		skillLibrarySelections: structuredClone(targetEntry?.skillLibrarySelections ?? params.skillLibrarySelections ?? baseEntry?.skillLibrarySelections),
		sessionId,
		lifecycleRevision,
		updatedAt: params.nowMs,
		sessionStartedAt: isNewSession ? params.nowMs : baseEntry?.sessionStartedAt ?? resolveSessionLifecycleTimestamps({
			entry,
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			storePath
		}).sessionStartedAt,
		lastInteractionAt: isNewSession ? params.nowMs : baseEntry?.lastInteractionAt,
		...params.hookExternalContentSource ? { hookExternalContentSource: params.hookExternalContentSource } : {},
		systemSent
	};
	if (resetBoundaryPending) {
		clearAllCliSessions(sessionEntry);
		sessionEntry.agentHarnessId = void 0;
		sessionEntry.compactionCount = 0;
	}
	return {
		storePath,
		store,
		sessionEntry: preserveCreationStamp(sessionEntry, targetEntry),
		lifecycleRevision,
		systemSent,
		isNewSession,
		previousSessionId,
		resetBoundaryPending,
		initialSessionEntry: targetEntry
	};
}
//#endregion
export { resolveCronSession as n, loadCronSessionEntryLatest as t };
