import { l as asNonNegativeFiniteNumber, u as asPositiveFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import "./utils-D3A1hGii.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { lt as stripInboundMetadata } from "./openclaw-state-db-Bh3Bq87y.js";
import { D as tryResolveLegacyCompatibilityAgentId, o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { C as isCronRunSessionKey, E as normalizeSessionKeyPreservingOpaquePeerIds, M as parseThreadSessionSuffix, O as parseAgentSessionKey, S as isAcpSessionKey, T as isSubagentSessionKey, j as parseSessionDeliveryRoute, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { n as withPinnedActivePluginRegistryWorkspaceDir } from "./runtime-workspace-state-kLYmgwOl.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import "./legacy.default-agent-owner-BMzvJbjU.js";
import { b as findModelCatalogEntry } from "./model-selection-shared-BUMiYTyL.js";
import "./defaults-CdX9UGcX.js";
import { k as resolveSessionModelOverrideSource } from "./agent-scope-CSlN0kZb.js";
import { d as resolveEffectiveResponseUsage } from "./thinking.shared-bHYuuc1L.js";
import { s as looksLikeAvatarPath } from "./avatar-policy-DrVRhyKM.js";
import { t as normalizeControlUiBasePath } from "./control-ui-shared-l0wakFAx.js";
import { c as getAgentEventLifecycleGeneration, l as isAgentEventLifecycleGenerationCurrent } from "./agent-events-Con5xUCM.js";
import { t as SESSION_AGENT_ATTENTION_ICON_IDS } from "./session-agent-status-Dd63sexE.js";
import { t as INTERNAL_MESSAGE_CHANNEL } from "./message-channel-constants-2zSoJXQC.js";
import { d as sessionDeliveryChannel, f as sessionDeliveryOrigin, u as projectSessionDeliveryFields } from "./delivery-context.shared-DlcU69m_.js";
import "./model-catalog-CIpnqiiW.js";
import { E as sessionEntryForkedFromParent } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { n as buildGroupDisplayTitle, t as buildGroupDisplayName } from "./group-rofV1-qp.js";
import { a as sessionCreatorProfileId } from "./session-entry-provenance-Ch9ZRplR.js";
import { n as isTerminalSessionStatus, o as resolveFreshSessionTotalTokens } from "./types-BHV0IaPK.js";
import { A as resolveConcreteSessionStorePath, T as isSessionTranscriptProjectionUnavailableError, l as readSessionTranscriptMessageEventPage, n as readSessionTranscriptWatermarkBatch, r as readSessionTranscriptTitleProbeBatch, t as readSessionTranscriptWatermark } from "./session-accessor-K0XuW6ln.js";
import { r as resolveAgentMainSessionKey } from "./main-session-TZQkcBLs.js";
import { i as resolveStoredSessionKeyForAgentStore, n as resolveSessionStoreAgentId } from "./session-store-key-DVtVp9hU.js";
import "./thinking-DxxV8Ztb.js";
import { l as normalizeStoredOverrideModel } from "./model-selection-DG2dN6VK.js";
import { t as classifySessionKind } from "./classify-session-kind-cZkOMXQc.js";
import { t as renderUserFacingText } from "./user-facing-text-BQgPNsCa.js";
import { i as readAcpSessionMetaBatch } from "./session-meta-CMnopLdV.js";
import { s as resolveCronSessionTargetSessionKey } from "./session-target-DJsUULzX.js";
import { v as resolveSessionGoalDisplayState } from "./sessions-eI69vxPt.js";
import { t as resolveProjectedSessionContextTokens } from "./context-token-provenance-CAdnGN1p.js";
import { n as resolveAgentIdentity } from "./identity-Dit6aFLf.js";
import { a as resolveModelCostConfig, t as estimateAggregateUsageCost } from "./usage-format-G8w2sGOz.js";
import { a as hasInterSessionUserProvenance } from "./input-provenance-CCQsDhUy.js";
import { a as projectPluginSessionExtensionsSync } from "./host-hook-state-CqMIyt2W.js";
import { c as getSessionDisplaySubagentRunByChildSessionKey, d as isSubagentRunLive, f as isSubagentRunQueued, h as listSubagentRunsForController, i as countActiveDescendantRuns, r as buildSubagentSessionListReadIndex } from "./subagent-registry-read-UaDFTyfW.js";
import { a as shouldKeepSubagentRunChildLink, l as resolveSubagentSessionStatus, o as getSubagentSessionRuntimeMs, s as getSubagentSessionStartedAt } from "./subagent-run-liveness-CrhVXF5Y.js";
import { S as resolveCurrentUserProfileDisplay, d as sqliteMessageEventWithSeq, f as toTranscriptReadScope, j as projectSessionDisplayMessage, r as readRecentSessionUsageFromTranscript, u as resolveTranscriptReadTarget } from "./session-transcript-readers-Bry9KBsD.js";
import { n as buildControlUiChannelAvatarUrl, r as buildControlUiResourcePath } from "./control-ui-contract-CgrOMhfo.js";
import { n as resolveSessionModelRef, t as resolveSessionModelIdentityRef } from "./session-model-ref-D-J6mcaq.js";
import { a as resolveGatewaySessionThinkingProjectionInternal, o as resolveSessionDisplayModelIdentityRefCached, s as createSessionRowModelCacheKey, t as getSessionDefaults } from "./session-utils-model-CsFM0F10.js";
import { c as resolveAuthoredModelContextTokens } from "./context-resolution-D7NN8z52.js";
import { a as resolveContextTokensForModel } from "./context-vpECvDcG.js";
import { t as resolveModelContextWindowProfile } from "./model-context-window-CoR3Uyg1.js";
import { t as projectWorkerPlacementAgentRuntime } from "./placement-session-runtime-CRRdyhxB.js";
import { a as parseGroupKey, i as loadGatewaySessionEntryReadOnly, t as isGroupOrChannelDisplaySession } from "./session-utils-store-Dlphca2N.js";
import { t as resolveFastModeState } from "./fast-mode-CGDySgLE.js";
import { t as resolveQueueSettingsCore } from "./settings-B6dacI0n.js";
import { t as resolveCronAgentSessionKey } from "./session-key-U_mu0r_L.js";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
//#region src/gateway/session-utils-core.ts
const DERIVED_TITLE_MAX_LEN = 60;
function truncateTitle(text, maxLen) {
	if (text.length <= maxLen) return text;
	const cut = truncateUtf16Safe(text, maxLen - 1);
	const lastSpace = cut.lastIndexOf(" ");
	if (lastSpace > maxLen * .6) return cut.slice(0, lastSpace) + "…";
	return cut + "…";
}
function deriveSessionTitle(entry, firstUserMessage, externalDisplayName) {
	if (!entry) return;
	const label = normalizeOptionalString(entry.label);
	if (label) return label;
	const displayName = normalizeOptionalString(externalDisplayName) ?? normalizeOptionalString(entry.displayName);
	if (displayName) return displayName;
	const subject = normalizeOptionalString(entry.subject);
	if (subject) return subject;
	const normalized = firstUserMessage ? stripInboundMetadata(firstUserMessage).replace(/\s+/g, " ").trim() : "";
	if (normalized) return truncateTitle(normalized, DERIVED_TITLE_MAX_LEN);
}
function resolvePositiveNumber(value) {
	return asPositiveFiniteNumber(value);
}
function deriveSessionUnread(entry) {
	const unreadBaselineAt = entry?.lastReadAt ?? entry?.createdAt;
	return entry?.markedUnreadAt !== void 0 || unreadBaselineAt !== void 0 && Math.max(entry?.lastInteractionAt ?? 0, entry?.lastActivityAt ?? 0) > unreadBaselineAt;
}
function isProjectableCompactionCheckpoint(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const checkpoint = value;
	return Boolean(normalizeOptionalString(checkpoint.checkpointId)) && typeof checkpoint.createdAt === "number" && Number.isFinite(checkpoint.createdAt) && (checkpoint.reason === "manual" || checkpoint.reason === "auto-threshold" || checkpoint.reason === "overflow-retry" || checkpoint.reason === "timeout-retry");
}
function resolveProjectableCompactionCheckpoints(entry) {
	const checkpoints = entry?.compactionCheckpoints;
	if (!Array.isArray(checkpoints) || checkpoints.length === 0) return [];
	return checkpoints.filter(isProjectableCompactionCheckpoint);
}
function resolveLatestCompactionCheckpoint(checkpoints) {
	return checkpoints.reduce((latest, checkpoint) => !latest || checkpoint.createdAt > latest.createdAt ? checkpoint : latest, void 0);
}
function buildCompactionCheckpointPreview(checkpoint) {
	if (!checkpoint) return;
	const checkpointId = normalizeOptionalString(checkpoint.checkpointId);
	const createdAt = checkpoint.createdAt;
	const reason = checkpoint.reason;
	if (!checkpointId || typeof createdAt !== "number" || !Number.isFinite(createdAt)) return;
	if (reason !== "manual" && reason !== "auto-threshold" && reason !== "overflow-retry" && reason !== "timeout-retry") return;
	return {
		checkpointId,
		createdAt,
		reason
	};
}
function resolveModelCostConfigCached(provider, model, cfg, rowContext) {
	if (!rowContext) return resolveModelCostConfig({
		provider,
		model,
		config: cfg
	});
	const key = createSessionRowModelCacheKey(provider, model);
	if (rowContext.modelCostConfigByModelRef.has(key)) return rowContext.modelCostConfigByModelRef.get(key);
	const value = resolveModelCostConfig({
		provider,
		model,
		config: cfg
	});
	rowContext.modelCostConfigByModelRef.set(key, value);
	return value;
}
function resolveEstimatedSessionCostUsd(params) {
	const explicitCostUsd = asNonNegativeFiniteNumber(params.explicitCostUsd ?? params.entry?.estimatedCostUsd);
	if (explicitCostUsd !== void 0) return explicitCostUsd;
	const input = resolvePositiveNumber(params.entry?.inputTokens);
	const output = resolvePositiveNumber(params.entry?.outputTokens);
	const cacheRead = resolvePositiveNumber(params.entry?.cacheRead);
	const cacheWrite = resolvePositiveNumber(params.entry?.cacheWrite);
	if (input === void 0 && output === void 0 && cacheRead === void 0 && cacheWrite === void 0) return;
	const cost = resolveModelCostConfigCached(params.provider, params.model, params.cfg, params.rowContext);
	if (!cost) return;
	const estimated = estimateAggregateUsageCost({
		usage: {
			...input !== void 0 ? { input } : {},
			...output !== void 0 ? { output } : {},
			...cacheRead !== void 0 ? { cacheRead } : {},
			...cacheWrite !== void 0 ? { cacheWrite } : {}
		},
		cost
	});
	return asNonNegativeFiniteNumber(estimated);
}
const STALE_STORE_ONLY_CHILD_LINK_MS = 36e5;
function isFinitePositiveTimestamp(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function shouldKeepStoreOnlyChildLink(entry, now) {
	if (isTerminalSessionStatus(entry.status) || isFinitePositiveTimestamp(entry.endedAt)) {
		const endedAt = isFinitePositiveTimestamp(entry.endedAt) ? entry.endedAt : entry.updatedAt;
		return isFinitePositiveTimestamp(endedAt) && now - endedAt <= 18e5;
	}
	if (entry.status === "running" || isFinitePositiveTimestamp(entry.startedAt)) return true;
	return isFinitePositiveTimestamp(entry.updatedAt) && now - entry.updatedAt <= STALE_STORE_ONLY_CHILD_LINK_MS;
}
function buildStoreChildSessionCandidateIndex(store, selectedParents) {
	const childSessionsByKey = /* @__PURE__ */ new Map();
	for (const [key, entry] of Object.entries(store)) {
		if (!entry) continue;
		const parentKeys = [normalizeOptionalString(entry.spawnedBy), normalizeOptionalString(entry.parentSessionKey)].filter((value) => Boolean(value) && value !== key);
		for (const parentKey of parentKeys) if (selectedParents.has(parentKey)) addChildSessionKey(childSessionsByKey, parentKey, key);
	}
	return childSessionsByKey;
}
function resolveRuntimeChildSessionKeys(controllerSessionKey, now = Date.now(), subagentRuns) {
	const childSessionKeys = /* @__PURE__ */ new Set();
	const controllerKey = controllerSessionKey.trim();
	const runs = subagentRuns ? subagentRuns.runsByControllerSessionKey.get(controllerKey) ?? [] : listSubagentRunsForController(controllerSessionKey);
	for (const entry of runs) {
		const childSessionKey = normalizeOptionalString(entry.childSessionKey);
		if (!childSessionKey) continue;
		const latest = subagentRuns ? subagentRuns.getDisplaySubagentRun(childSessionKey) : getSessionDisplaySubagentRunByChildSessionKey(childSessionKey);
		if (!latest) continue;
		if ((normalizeOptionalString(latest?.controllerSessionKey) || normalizeOptionalString(latest?.requesterSessionKey)) !== controllerSessionKey) continue;
		if (!shouldKeepSubagentRunChildLink(latest, {
			activeDescendants: subagentRuns ? subagentRuns.countActiveDescendantRuns(childSessionKey) : countActiveDescendantRuns(childSessionKey),
			now
		})) continue;
		childSessionKeys.add(childSessionKey);
	}
	const childSessions = Array.from(childSessionKeys);
	return childSessions.length > 0 ? childSessions : void 0;
}
function addChildSessionKey(childSessionsByKey, parentKey, childKey) {
	const current = childSessionsByKey.get(parentKey);
	if (current) {
		if (!current.includes(childKey)) current.push(childKey);
		return;
	}
	childSessionsByKey.set(parentKey, [childKey]);
}
function isCurrentSessionChildOwner(params) {
	return params.controllerSessionKey === params.ownerSessionKey || normalizeOptionalString(params.entry.parentSessionKey) === params.ownerSessionKey;
}
function buildStoreChildSessionIndex(params) {
	const children = /* @__PURE__ */ new Map();
	if (params.keys.length === 0) return children;
	const candidates = buildStoreChildSessionCandidateIndex(params.store, new Set(params.keys));
	for (const key of params.keys) {
		const childKeys = resolveStoreChildSessionKeysFromCandidates({
			...params,
			key,
			candidates
		});
		if (childKeys) children.set(key, childKeys);
	}
	return children;
}
function resolveStoreChildSessionKeysFromCandidates(params) {
	const childSessionKeys = [];
	for (const childKey of params.candidates.get(params.key) ?? []) {
		if (params.excludedChildKeys?.has(childKey)) continue;
		const entry = params.store[childKey];
		if (!entry) continue;
		const latest = params.subagentRuns ? params.subagentRuns.getDisplaySubagentRun(childKey) : getSessionDisplaySubagentRunByChildSessionKey(childKey);
		if (latest) {
			const latestControllerSessionKey = normalizeOptionalString(latest.controllerSessionKey) || normalizeOptionalString(latest.requesterSessionKey);
			const matchesOwner = isCurrentSessionChildOwner({
				entry,
				ownerSessionKey: params.key,
				controllerSessionKey: latestControllerSessionKey
			});
			if (params.requireCurrentController && !matchesOwner) continue;
			if (!shouldKeepSubagentRunChildLink(latest, {
				activeDescendants: params.subagentRuns ? params.subagentRuns.countActiveDescendantRuns(childKey) : countActiveDescendantRuns(childKey),
				now: params.now
			}) || latestControllerSessionKey && !matchesOwner) continue;
			childSessionKeys.push(childKey);
			continue;
		}
		if (!shouldKeepStoreOnlyChildLink(entry, params.now)) continue;
		childSessionKeys.push(childKey);
	}
	return childSessionKeys.length > 0 ? childSessionKeys : void 0;
}
//#endregion
//#region src/sessions/session-agent-status.ts
const SESSION_AGENT_STATUS_NOTE_MAX_CHARS = 120;
const SESSION_AGENT_STATUS_DEFAULT_TTL_MINUTES = 30;
const ATTENTION_ICON_IDS = new Set(SESSION_AGENT_ATTENTION_ICON_IDS);
function isSessionAgentAttentionIconId(value) {
	return typeof value === "string" && ATTENTION_ICON_IDS.has(value);
}
function sanitizeSessionAgentStatusNote(value) {
	const normalized = renderUserFacingText(value, { errorContext: true }).replace(/\s+/g, " ").trim();
	return truncateUtf16Safe(normalized, SESSION_AGENT_STATUS_NOTE_MAX_CHARS).trimEnd();
}
function resolveActiveSessionAgentStatus(status, now) {
	if (!status || !status.note.trim() || !Number.isFinite(status.expiresAt) || status.expiresAt <= now) return;
	if (status.attention !== void 0 && !isSessionAgentAttentionIconId(status.attention)) return;
	return status;
}
function sessionAgentStatusExpiresAt(now, ttlMinutes) {
	return now + (ttlMinutes ?? SESSION_AGENT_STATUS_DEFAULT_TTL_MINUTES) * 6e4;
}
//#endregion
//#region src/cron/job-session-bindings.ts
/**
* Resolves every canonical session key a job is bound to: the session the run
* joins (main/isolated/session:<key>) plus the explicit wake/delivery lane in
* job.sessionKey. Keys use the same canonicalization as cron run/session
* creation, so they compare equal to gateway session-store row keys.
*/
function resolveCronJobBoundSessionKeys(job, opts) {
	const agentId = normalizeAgentId(job.agentId ?? opts.defaultAgentId);
	const keys = /* @__PURE__ */ new Set();
	const add = (sessionKey) => {
		const trimmed = sessionKey?.trim();
		if (!trimmed) return;
		keys.add(resolveCronAgentSessionKey({
			sessionKey: trimmed,
			agentId,
			mainKey: opts.cfg.session?.mainKey,
			cfg: opts.cfg
		}));
	};
	try {
		if (job.sessionTarget === "main") add("main");
		else if (job.sessionTarget === "isolated" || job.sessionTarget === "current") add(`cron:${job.id}`);
		else add(resolveCronSessionTargetSessionKey(job.sessionTarget));
		add(job.sessionKey);
	} catch {
		keys.clear();
	}
	return keys;
}
/** Signals a locked re-check found the job no longer bound; a per-job no-op. */
var CronJobBindingStaleError = class extends Error {
	constructor() {
		super("cron job binding changed concurrently");
	}
};
/** Disables enabled jobs bound to any archived session with one job-list scan. */
async function disableCronJobsBoundToSessions(params) {
	const sessionKeys = [...new Set(params.sessionKeys.map((key) => key.trim()).filter(Boolean))];
	const disabledBySession = new Map(sessionKeys.map((sessionKey) => [sessionKey, []]));
	if (sessionKeys.length === 0) return disabledBySession;
	const targetKeys = new Set(sessionKeys);
	const jobs = await params.cron.list();
	const defaultAgentId = params.cron.getDefaultAgentId();
	const matchingSessionKeys = (job) => {
		if (!job.enabled) return [];
		return [...resolveCronJobBoundSessionKeys(job, {
			cfg: params.cfg,
			defaultAgentId
		})].filter((sessionKey) => targetKeys.has(sessionKey));
	};
	const failures = [];
	for (const job of jobs) {
		if (matchingSessionKeys(job).length === 0) continue;
		try {
			let lockedMatches = [];
			await params.cron.updateWithPrecondition(job.id, { enabled: false }, (currentJob) => {
				lockedMatches = matchingSessionKeys(currentJob);
				if (lockedMatches.length === 0) throw new CronJobBindingStaleError();
			});
			for (const sessionKey of lockedMatches) disabledBySession.get(sessionKey)?.push(job.id);
		} catch (error) {
			if (error instanceof CronJobBindingStaleError) continue;
			failures.push(error);
		}
	}
	if (failures.length > 0) {
		const subject = sessionKeys.length === 1 ? `bound to ${sessionKeys[0]}` : `bound to ${sessionKeys.length} archived sessions`;
		throw new AggregateError(failures, `failed to disable ${failures.length} cron job(s) ${subject}`);
	}
	return disabledBySession;
}
//#endregion
//#region src/gateway/session-automation-index.ts
let source = null;
let sourceVersion = 0;
let epochCounter = 0;
let registeredEpoch = 0;
let memo = null;
/**
* Claimed at cron service build time so registration authority follows build
* order: a stale service whose start resolves after a config reload cannot
* clobber the replacement's registration.
*/
function claimSessionAutomationEpoch() {
	return ++epochCounter;
}
/** Registered by the gateway cron owner; newer epochs win over stale services. */
function registerSessionAutomationSource(next, epoch) {
	const effectiveEpoch = epoch ?? claimSessionAutomationEpoch();
	if (effectiveEpoch < registeredEpoch) return;
	registeredEpoch = effectiveEpoch;
	source = next;
	memo = null;
	sourceVersion += 1;
}
/**
* Owner-compare unregistration: a stopped cron service must not clear a
* replacement's registration when config reloads race the lazy service build.
*/
function unregisterSessionAutomationSource(owner) {
	if (source !== owner) return;
	source = null;
	memo = null;
	sourceVersion += 1;
}
/** Called from the cron onEvent hook after any job/store change. */
function bumpSessionAutomationVersion() {
	sourceVersion += 1;
}
/** sessions.list cache fence input: hasAutomation is projected per row from
* this index, so cached lists are stale the moment a binding changes. */
function readSessionAutomationVersion() {
	return sourceVersion;
}
function buildAutomationKeys(jobs, cfg, defaultAgentId) {
	const keys = /* @__PURE__ */ new Set();
	for (const job of jobs) {
		if (!job.enabled) continue;
		for (const key of resolveCronJobBoundSessionKeys(job, {
			cfg,
			defaultAgentId
		})) {
			const agentId = job.owner?.agentId ?? defaultAgentId;
			if (parseAgentSessionKey(key)) keys.add(key);
			else if (agentId) keys.add(`${normalizeAgentId(agentId)}\0${key}`);
		}
	}
	return keys;
}
/** True when an enabled cron job is bound to the canonical session key. */
function sessionHasAutomation(sessionKey, cfg, agentId) {
	const jobs = source?.getJobs();
	if (!source || !jobs || jobs.length === 0) return false;
	if (!memo || memo.jobs !== jobs || memo.version !== sourceVersion || memo.cfg !== cfg) memo = {
		jobs,
		version: sourceVersion,
		cfg,
		keys: buildAutomationKeys(jobs, cfg, source.getDefaultAgentId())
	};
	const identity = parseAgentSessionKey(sessionKey) ? sessionKey : agentId ? `${normalizeAgentId(agentId)}\0${sessionKey}` : void 0;
	return identity ? memo.keys.has(identity) : false;
}
//#endregion
//#region src/gateway/session-classification.ts
/** Builds non-sensitive, client-useful classification facts for Gateway session rows. */
const BACKGROUND_CLASSIFICATIONS = /* @__PURE__ */ new Set([
	"acp",
	"cron",
	"dreaming",
	"harness",
	"heartbeat",
	"hook",
	"subagent",
	"system"
]);
function classifyRest(rest) {
	const normalized = normalizeLowercaseStringOrEmpty(rest);
	if (normalized.startsWith("dashboard:")) return "dashboard";
	if (normalized.startsWith("tui-")) return "tui";
	if (normalized.startsWith("explicit:")) return "explicit";
	if (normalized.startsWith("hook:")) return "hook";
	if (normalized.startsWith("node-") || normalized.startsWith("node:")) return "node";
	if (normalized.startsWith("harness:")) return "harness";
	if (normalized.startsWith("voice:")) return "voice";
	if (normalized.startsWith("dreaming-narrative-")) return "dreaming";
	if (normalized === "boot" || normalized.startsWith("boot:") || normalized.startsWith("internal-session-effects:")) return "system";
	return "custom";
}
/**
* Derive portable facts without exposing peer ids, transcript text, absolute
* paths, or other data that is not already a session-list field.
*/
function sessionClassificationForRow(cfg, key, agentId, entry) {
	const canonicalKey = normalizeSessionKeyPreservingOpaquePeerIds(key);
	const isMain = canonicalKey === "global" ? cfg.session?.scope === "global" : canonicalKey === resolveAgentMainSessionKey({
		cfg,
		agentId
	});
	const parsedAgent = parseAgentSessionKey(canonicalKey);
	const resolvedAgentId = parsedAgent?.agentId ?? normalizeOptionalString(agentId);
	const rest = parsedAgent?.rest ?? canonicalKey;
	const parsedThread = parseThreadSessionSuffix(canonicalKey);
	const route = parseSessionDeliveryRoute(canonicalKey);
	const hasLegacyDirectPeer = /^(?:direct|dm):.+$/i.test(parseAgentSessionKey(parsedThread.baseSessionKey)?.rest ?? "");
	const hasDirectPeer = route?.peerKind === "direct" || route?.peerKind === "dm" || hasLegacyDirectPeer || entry?.chatType === "direct";
	let classification;
	if (canonicalKey === "global") classification = "global";
	else if (canonicalKey === "unknown") classification = "unknown";
	else if (entry?.heartbeatIsolatedBaseSessionKey) classification = "heartbeat";
	else if (isMain) classification = "main";
	else if (entry?.spawnedBy) classification = "subagent";
	else if (isSubagentSessionKey(canonicalKey)) classification = "subagent";
	else if (isAcpSessionKey(canonicalKey)) classification = "acp";
	else if (isCronSessionKey(canonicalKey)) classification = "cron";
	else if (parsedThread.threadId) classification = "thread";
	else if (route?.peerKind === "group") classification = "group";
	else if (route?.peerKind === "channel") classification = "channel";
	else if (hasDirectPeer) classification = "direct";
	else if (entry?.chatType === "direct" || entry?.chatType === "group" || entry?.chatType === "channel") classification = entry.chatType;
	else classification = classifyRest(rest);
	const peerKind = route?.peerKind === "dm" || hasLegacyDirectPeer ? "direct" : route?.peerKind;
	return {
		classification,
		...resolvedAgentId ? { agentId: resolvedAgentId } : {},
		...route?.accountId ? { accountId: route.accountId } : {},
		...peerKind ? { peerKind } : {},
		isMain,
		isBackground: BACKGROUND_CLASSIFICATIONS.has(classification)
	};
}
//#endregion
//#region src/gateway/session-identity-projection.ts
function projectSessionParticipant(identity, profiles, cfg) {
	if (identity.type === "agent" && cfg) {
		const agent = resolveAgentIdentity(cfg, identity.id);
		const label = normalizeOptionalString(agent?.name);
		const avatar = normalizeOptionalString(agent?.avatar);
		return {
			identity,
			...label ? { label } : {},
			...avatar && looksLikeAvatarPath(avatar) ? { avatarUrl: buildControlUiResourcePath("agentAvatar", normalizeControlUiBasePath(cfg.gateway?.controlUi?.basePath), identity.id) } : {}
		};
	}
	if (identity.type !== "profile") return { identity };
	if (!profiles.has(identity.id)) {
		const display = resolveCurrentUserProfileDisplay(identity.id);
		profiles.set(identity.id, display.kind === "resolved" ? display : void 0);
	}
	const profile = profiles.get(identity.id);
	return {
		identity: {
			type: "profile",
			id: profile?.profileId ?? identity.id
		},
		...profile?.label ? { label: profile.label } : {},
		...profile?.hasUploadedAvatar ? { avatarUrl: profile.avatarUrl } : {}
	};
}
function projectSessionActor(actor, profiles = /* @__PURE__ */ new Map(), cfg, profileProvenance = true) {
	if (!actor) return;
	const id = normalizeOptionalString(actor.id);
	if (!id) return { type: actor.type };
	const identity = actor.type === "agent" ? {
		type: "agent",
		id
	} : actor.type === "human" && profileProvenance ? {
		type: "profile",
		id
	} : {
		type: "legacy",
		actorType: actor.type,
		source: null,
		id
	};
	return {
		type: actor.type,
		id,
		...projectSessionParticipant(identity, profiles, cfg)
	};
}
/** Projects an identity only when it can own a session durably. */
function projectAssignableSessionOwner(actor, userProfileIdentityById, cfg, configuredAgentIds, profileProvenance = true) {
	if (!actor || actor.type !== "human" && actor.type !== "agent") return;
	const rawId = normalizeOptionalString(actor.id);
	if (!rawId) return;
	const id = actor.type === "agent" ? normalizeAgentId(rawId) : rawId;
	if (actor.type === "agent" && !(configuredAgentIds ?? new Set(listAgentIds(cfg))).has(id)) return;
	if (actor.type === "human" && !profileProvenance) return;
	const projected = projectSessionActor({
		type: actor.type,
		id
	}, userProfileIdentityById, cfg);
	if (!projected?.id || actor.type === "human" && userProfileIdentityById.get(id) === void 0) return;
	return {
		...projected,
		type: actor.type,
		id
	};
}
function projectSessionOwner(entry, userProfileIdentityById, cfg, configuredAgentIds) {
	const persisted = entry?.owner;
	const identities = userProfileIdentityById ?? /* @__PURE__ */ new Map();
	const actor = projectAssignableSessionOwner(persisted?.actor ?? entry?.createdActor, identities, cfg, configuredAgentIds, Boolean(persisted?.actor || sessionCreatorProfileId(entry?.createdActor)));
	if (!actor) return;
	const assignedBy = projectSessionActor(persisted?.assignedBy, identities, cfg);
	return {
		actor,
		...assignedBy ? { assignedBy } : {},
		...persisted?.assignedAt !== void 0 ? { assignedAt: persisted.assignedAt } : {}
	};
}
function projectSessionParticipants(entry, userProfileIdentityById, cfg) {
	const identities = userProfileIdentityById ?? /* @__PURE__ */ new Map();
	const participants = /* @__PURE__ */ new Map();
	for (const { identity } of entry?.participants ?? []) {
		const participant = projectSessionParticipant(identity, identities, cfg);
		participants.set(JSON.stringify(participant.identity), participant);
	}
	return participants;
}
/** Participation, creation, and responsibility are associations, never access grants. */
function projectSessionPeople(entry, identities, cfg, owner) {
	const participants = projectSessionParticipants(entry, identities, cfg);
	const actors = [owner, projectSessionActor(entry.createdActor, identities, cfg, Boolean(sessionCreatorProfileId(entry.createdActor)))];
	const people = /* @__PURE__ */ new Map();
	for (const participant of [...participants.values(), ...actors]) {
		const identity = participant?.identity;
		if (identity?.type === "profile") people.set(identity.id, {
			identity,
			label: participant?.label,
			avatarUrl: participant?.avatarUrl,
			sessionCount: 1
		});
	}
	return [...people.values()];
}
function projectSessionPeopleFacet(people, selectedProfileId) {
	const sortedPeople = [...people].toSorted((a, b) => b.sessionCount - a.sessionCount || (a.label ?? a.identity.id).localeCompare(b.label ?? b.identity.id) || a.identity.id.localeCompare(b.identity.id));
	const visiblePeople = sortedPeople.slice(0, 60);
	const selected = selectedProfileId ? sortedPeople.find((person) => person.identity.id === selectedProfileId) : void 0;
	if (selected && !visiblePeople.includes(selected)) visiblePeople.splice(-1, 1, selected);
	return {
		people: visiblePeople,
		selected,
		overflow: sortedPeople.length > visiblePeople.length
	};
}
function addSessionOwnerFacetIdentity(ownerFacet, actor) {
	const existing = ownerFacet.get(actor.id);
	if (!existing || existing.type === "human" && actor.type === "agent") ownerFacet.set(actor.id, actor);
}
function sortSessionOwnerFacet(ownerFacet) {
	return [...ownerFacet.values()].toSorted((a, b) => {
		return (a.label ?? a.id).localeCompare(b.label ?? b.id) || a.id.localeCompare(b.id);
	});
}
//#endregion
//#region src/gateway/session-permission-change.ts
const pendingChanges = resolveGlobalSingleton(Symbol.for("openclaw.sessionPermissionChanges"), () => /* @__PURE__ */ new Map());
function beginSessionPermissionChange(sessionId) {
	const owner = { generation: getAgentEventLifecycleGeneration() };
	pendingChanges.set(sessionId, owner);
	return () => {
		if (pendingChanges.get(sessionId) === owner) pendingChanges.delete(sessionId);
	};
}
function isSessionPermissionChangePending(sessionId) {
	const pending = sessionId === void 0 ? void 0 : pendingChanges.get(sessionId);
	return pending !== void 0 && isAgentEventLifecycleGenerationCurrent(pending.generation);
}
//#endregion
//#region src/gateway/session-transcript-title-reader.ts
const EMPTY_SESSION_TITLE_FIELDS = {
	firstUserMessage: null,
	lastMessagePreview: null
};
let sessionTitleProjectionUnavailableVersion = 0;
function readSessionTitleProjectionUnavailableVersion() {
	return sessionTitleProjectionUnavailableVersion;
}
const SQLITE_TITLE_PROBE_INITIAL_MESSAGES = 20;
const SQLITE_TITLE_PROBE_MAX_MESSAGES = 100;
const SQLITE_TITLE_FIELD_CACHE_MAX_ENTRIES = 256;
const sqliteTitleFieldCache = /* @__PURE__ */ new Map();
function sqliteTitleFieldCacheKey(target) {
	return `${target.agentId ?? ""}\0${target.sessionId}\0${target.storePath ?? ""}`;
}
function setSqliteTitleFieldCache(key, entry) {
	sqliteTitleFieldCache.delete(key);
	sqliteTitleFieldCache.set(key, entry);
	pruneMapToMaxSize(sqliteTitleFieldCache, SQLITE_TITLE_FIELD_CACHE_MAX_ENTRIES);
}
function readSqliteTitleProbeRange(scope, totalMessages, start, endExclusive) {
	const end = Math.min(totalMessages, endExclusive);
	const boundedStart = Math.min(Math.max(0, start), end);
	if (boundedStart === end) return [];
	return readSessionTranscriptMessageEventPage(scope, {
		maxMessages: end - boundedStart,
		offset: totalMessages - end
	}).events;
}
function findFirstTitleUserText(entries, includeInterSession) {
	for (const entry of entries) {
		const message = sqliteMessageEventWithSeq(entry);
		const projected = projectSessionDisplayMessage(message);
		if (projected?.role === "user" && (includeInterSession || !hasInterSessionUserProvenance(message))) return projected.text;
	}
	return null;
}
function findLastMessageText(entries) {
	let text = null;
	entries.findLast((entry) => {
		const message = sqliteMessageEventWithSeq(entry);
		text = projectSessionDisplayMessage(message, { flattenMarkdown: true })?.text ?? null;
		return text !== null;
	});
	return text;
}
function copySessionTitleText(text) {
	return text === null ? null : Buffer.from(text, "utf16le").toString("utf16le");
}
function hydrateSqliteTitleFields(target, opts, probe) {
	try {
		const scope = toTranscriptReadScope(target);
		const cacheKey = sqliteTitleFieldCacheKey(target);
		const watermark = probe ?? readSessionTranscriptWatermark(scope);
		const variant = opts?.includeInterSession === true ? "includeInterSession" : "default";
		const cached = sqliteTitleFieldCache.get(cacheKey);
		const current = cached?.generation === watermark.generation && cached.maxSeq === watermark.maxSeq;
		const cachedFields = current ? cached.fields[variant] : void 0;
		if (cached && cachedFields) {
			setSqliteTitleFieldCache(cacheKey, cached);
			return { ...cachedFields };
		}
		const tail = probe ? {
			events: probe.tail,
			totalMessages: probe.totalMessages
		} : readSessionTranscriptMessageEventPage(scope, {
			maxMessages: SQLITE_TITLE_PROBE_INITIAL_MESSAGES,
			offset: 0
		});
		let lastText = findLastMessageText(tail.events);
		if (!lastText && tail.totalMessages > SQLITE_TITLE_PROBE_INITIAL_MESSAGES) lastText = findLastMessageText(readSqliteTitleProbeRange(scope, tail.totalMessages, tail.totalMessages - SQLITE_TITLE_PROBE_MAX_MESSAGES, tail.totalMessages - SQLITE_TITLE_PROBE_INITIAL_MESSAGES));
		let firstText = findFirstTitleUserText(probe?.head ?? (tail.totalMessages <= SQLITE_TITLE_PROBE_INITIAL_MESSAGES ? tail.events : readSqliteTitleProbeRange(scope, tail.totalMessages, 0, SQLITE_TITLE_PROBE_INITIAL_MESSAGES)), opts?.includeInterSession === true);
		if (!firstText && tail.totalMessages > SQLITE_TITLE_PROBE_INITIAL_MESSAGES) firstText = findFirstTitleUserText(readSqliteTitleProbeRange(scope, tail.totalMessages, SQLITE_TITLE_PROBE_INITIAL_MESSAGES, SQLITE_TITLE_PROBE_MAX_MESSAGES), opts?.includeInterSession === true);
		const fields = {
			firstUserMessage: copySessionTitleText(firstText),
			lastMessagePreview: copySessionTitleText(lastText)
		};
		const fieldsByVariant = current ? cached.fields : {};
		fieldsByVariant[variant] = fields;
		setSqliteTitleFieldCache(cacheKey, {
			generation: watermark.generation,
			maxSeq: watermark.maxSeq,
			fields: fieldsByVariant
		});
		return { ...fields };
	} catch (error) {
		if (!isSessionTranscriptProjectionUnavailableError(error)) throw error;
		sessionTitleProjectionUnavailableVersion += 1;
		return { ...EMPTY_SESSION_TITLE_FIELDS };
	}
}
/** Batch-hydrates titles while isolating a rebuilding projection to its session. */
function readSessionTitleFieldsFromTranscriptBatch(scopes, opts) {
	try {
		const variant = opts?.includeInterSession === true ? "includeInterSession" : "default";
		const reads = scopes.map((scope) => {
			const target = resolveTranscriptReadTarget(scope);
			const cacheKey = sqliteTitleFieldCacheKey(target);
			const cached = sqliteTitleFieldCache.get(cacheKey);
			return {
				target,
				cacheKey,
				cached,
				fields: cached?.fields[variant]
			};
		});
		const cachedReads = reads.filter((read) => read.fields);
		const watermarks = readSessionTranscriptWatermarkBatch(cachedReads.map((read) => toTranscriptReadScope(read.target)));
		for (const [index, read] of cachedReads.entries()) {
			const watermark = watermarks[index];
			if (watermark && read.cached && read.fields && read.cached.generation === watermark.generation && read.cached.maxSeq === watermark.maxSeq) {
				setSqliteTitleFieldCache(read.cacheKey, read.cached);
				read.fields = { ...read.fields };
			} else read.fields = void 0;
		}
		const misses = reads.filter((read) => !read.fields);
		const probes = misses.length > 0 ? readSessionTranscriptTitleProbeBatch(misses.map((read) => toTranscriptReadScope(read.target))) : [];
		for (const [index, read] of misses.entries()) read.fields = hydrateSqliteTitleFields(read.target, opts, probes[index]);
		return reads.map((read) => expectDefined(read.fields, `title fields for session ${read.target.sessionId}`));
	} catch (error) {
		if (!isSessionTranscriptProjectionUnavailableError(error)) throw error;
		return scopes.map((scope) => hydrateSqliteTitleFields(resolveTranscriptReadTarget(scope), opts));
	}
}
/** Reads title and preview text from one transcript. */
function readSessionTitleFieldsFromTranscript(scope, opts) {
	return hydrateSqliteTitleFields(resolveTranscriptReadTarget(scope), opts);
}
//#endregion
//#region src/gateway/session-utils-projection.ts
function buildSessionListRowMetadataContext(params) {
	return {
		subagentRuns: buildSubagentSessionListReadIndex(params.now),
		selectedModelByOverrideRef: /* @__PURE__ */ new Map(),
		thinkingMetadataByModelRef: /* @__PURE__ */ new Map(),
		displayModelIdentityByKey: /* @__PURE__ */ new Map(),
		modelCostConfigByModelRef: /* @__PURE__ */ new Map(),
		userProfileIdentityById: params.userProfileIdentityById ?? /* @__PURE__ */ new Map(),
		acpSessionMetaByEntry: /* @__PURE__ */ new Map()
	};
}
function buildSingleRowStoreChildSessionsByKey(params) {
	return buildStoreChildSessionIndex({
		store: params.store,
		keys: [params.key],
		now: params.now,
		requireCurrentController: true
	});
}
function resolveSessionSelectedModelRef(params) {
	const override = normalizeStoredOverrideModel({
		providerOverride: params.entry?.providerOverride,
		modelOverride: params.entry?.modelOverride
	});
	if (!params.rowContext) return resolveSessionModelRef(params.cfg, params.entry, params.agentId, { allowPluginNormalization: params.allowPluginNormalization });
	const key = [
		normalizeAgentId(params.agentId),
		override.providerOverride ?? "",
		override.modelOverride ?? ""
	].join("\0");
	const cached = params.rowContext.selectedModelByOverrideRef.get(key);
	if (cached) return cached;
	const selected = resolveSessionModelRef(params.cfg, params.entry, params.agentId, { allowPluginNormalization: params.allowPluginNormalization });
	params.rowContext.selectedModelByOverrideRef.set(key, selected);
	return selected;
}
function mergeChildSessionKeys(runtimeChildSessions, storeChildSessions) {
	if (!runtimeChildSessions?.length) return storeChildSessions?.length ? storeChildSessions : void 0;
	if (!storeChildSessions?.length) return runtimeChildSessions;
	return uniqueStrings([...runtimeChildSessions, ...storeChildSessions]);
}
function resolveChildSessionKeys(controllerSessionKey, store, now = Date.now(), subagentRuns) {
	return mergeChildSessionKeys(resolveRuntimeChildSessionKeys(controllerSessionKey, now, subagentRuns), buildStoreChildSessionIndex({
		store,
		keys: [controllerSessionKey],
		now,
		subagentRuns
	}).get(controllerSessionKey));
}
function resolveTranscriptUsageFallback(params) {
	const { entry, agentId } = params;
	if (!entry?.sessionId) return null;
	const resolvedModel = resolveSessionModelIdentityRef(params.cfg, entry, agentId, params.fallbackModelRef, { allowPluginNormalization: params.allowPluginNormalization });
	if (params.freshTotalTokens !== void 0 && resolveEstimatedSessionCostUsd({
		cfg: params.cfg,
		provider: resolvedModel.provider,
		model: resolvedModel.model,
		entry,
		rowContext: params.rowContext
	}) !== void 0) return null;
	const storePath = resolveConcreteSessionStorePath(params.storePath) ?? resolveSessionStorePathCore(params.cfg.session?.store, { agentId });
	let snapshot;
	try {
		snapshot = readRecentSessionUsageFromTranscript({
			agentId,
			sessionEntry: entry,
			sessionId: entry.sessionId,
			sessionKey: params.key,
			storePath
		}, typeof params.maxTranscriptBytes === "number" ? params.maxTranscriptBytes : 262144);
	} catch {
		return null;
	}
	if (!snapshot) return null;
	const estimatedCostUsd = resolveEstimatedSessionCostUsd({
		cfg: params.cfg,
		provider: snapshot.modelProvider ?? resolvedModel.provider,
		model: snapshot.model ?? resolvedModel.model,
		explicitCostUsd: snapshot.costUsd,
		entry: {
			inputTokens: snapshot.inputTokens,
			outputTokens: snapshot.outputTokens,
			cacheRead: snapshot.cacheRead,
			cacheWrite: snapshot.cacheWrite
		},
		rowContext: params.rowContext
	});
	return {
		totalTokens: resolvePositiveNumber(snapshot.totalTokens),
		totalTokensFresh: snapshot.totalTokensFresh === true,
		estimatedCostUsd
	};
}
//#endregion
//#region src/gateway/session-utils-row.ts
/** Opaque cache-busting revision for the channel-avatar route; never leaks the reference. */
function channelAvatarRevision(reference) {
	return createHash("sha256").update(reference).digest("base64url").slice(0, 12);
}
function buildGatewaySessionRow(params) {
	const { cfg, storePath, store, key, entry } = params;
	const lightweight = params.lightweightListRow === true;
	const now = params.now ?? Date.now();
	const agentStatus = resolveActiveSessionAgentStatus(entry?.agentStatus, now);
	const owner = projectSessionOwner(entry, params.rowContext?.userProfileIdentityById, cfg, params.configuredAgentIds);
	const participants = projectSessionParticipants(entry, params.rowContext?.userProfileIdentityById, cfg);
	if (owner?.actor.identity) participants.delete(JSON.stringify(owner.actor.identity));
	const observerDigest = entry?.observerDigest && (entry.startedAt === void 0 || entry.observerDigest.updatedAt > entry.startedAt) ? entry.observerDigest : void 0;
	const updatedAt = entry?.updatedAt ?? null;
	const parsed = parseGroupKey(key);
	const sessionKind = classifySessionKind(key, entry);
	const gatewayKind = sessionKind === "cron" || sessionKind === "spawn-child" ? "direct" : sessionKind;
	const deliveryFields = projectSessionDeliveryFields(entry?.delivery);
	const channel = deliveryFields.channel ?? parsed?.channel;
	const subject = entry?.subject;
	const groupChannel = entry?.groupChannel;
	const space = entry?.space;
	const id = parsed?.id;
	const storedOrigin = deliveryFields.origin;
	const avatar = normalizeOptionalString(storedOrigin?.avatar);
	const origin = storedOrigin ? (({ avatar: _avatar, ...safeOrigin }) => safeOrigin)(storedOrigin) : void 0;
	const originLabel = origin?.label;
	const controlUiBasePath = normalizeControlUiBasePath(cfg.gateway?.controlUi?.basePath);
	const channelAvatarUrl = avatar ? buildControlUiChannelAvatarUrl(controlUiBasePath, key, channelAvatarRevision(avatar)) : void 0;
	const parsedAgent = parseAgentSessionKey(key);
	const isDashboardSession = parsedAgent?.rest.startsWith("dashboard:") === true;
	const isGroupSession = isGroupOrChannelDisplaySession(entry, parsed);
	const displayName = entry?.label ?? (isGroupSession ? buildGroupDisplayTitle({
		subject,
		groupChannel,
		space
	}) : void 0) ?? entry?.displayName ?? (isGroupSession && channel ? buildGroupDisplayName({
		provider: channel,
		subject,
		groupChannel,
		space,
		id,
		key
	}) : void 0) ?? (isDashboardSession ? void 0 : originLabel);
	const sessionAgentId = normalizeAgentId(parsedAgent?.agentId ?? params.agentId ?? resolveSessionStoreAgentId(cfg, key));
	const skipTranscriptUsage = params.skipTranscriptUsageFallback === true;
	const rowContext = params.rowContext;
	const subagentRun = rowContext ? rowContext.subagentRuns.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);
	const subagentOwner = normalizeOptionalString(subagentRun?.controllerSessionKey) || normalizeOptionalString(subagentRun?.requesterSessionKey);
	const liveSubagentRunActive = isSubagentRunLive(subagentRun) || isSubagentRunQueued(subagentRun);
	const hasActiveSubagentRun = liveSubagentRunActive || (rowContext?.subagentRuns.countActiveDescendantRuns(key) ?? countActiveDescendantRuns(key)) > 0;
	const persistedSessionStatus = entry?.status;
	const persistedSessionEndedAt = entry?.endedAt;
	const persistedSessionStartedAt = entry?.startedAt;
	const persistedSessionRuntimeMs = entry?.runtimeMs;
	const subagentRunState = subagentRun ? liveSubagentRunActive ? "active" : typeof subagentRun.execution.endedAt === "number" || persistedSessionStatus === "done" || persistedSessionStatus === "failed" || persistedSessionStatus === "killed" || persistedSessionStatus === "timeout" || typeof persistedSessionEndedAt === "number" ? "historical" : "interrupted" : void 0;
	const subagentStatus = subagentRun ? liveSubagentRunActive ? resolveSubagentSessionStatus(subagentRun) : persistedSessionStatus === "running" ? void 0 : persistedSessionStatus ?? (typeof subagentRun.execution.endedAt === "number" ? resolveSubagentSessionStatus(subagentRun) : void 0) : void 0;
	const subagentStartedAt = subagentRun ? liveSubagentRunActive ? getSubagentSessionStartedAt(subagentRun) : persistedSessionStartedAt ?? getSubagentSessionStartedAt(subagentRun) : void 0;
	const subagentEndedAt = subagentRun ? liveSubagentRunActive ? subagentRun.execution.endedAt : persistedSessionEndedAt ?? subagentRun.execution.endedAt : void 0;
	const subagentRuntimeMs = subagentRun ? liveSubagentRunActive ? getSubagentSessionRuntimeMs(subagentRun, now) : persistedSessionRuntimeMs ?? (typeof subagentRun.execution.endedAt === "number" ? getSubagentSessionRuntimeMs(subagentRun, now) : void 0) : void 0;
	const selectedModel = resolveSessionSelectedModelRef({
		cfg,
		entry,
		agentId: sessionAgentId,
		rowContext,
		allowPluginNormalization: !lightweight
	});
	const freshSessionTotalTokens = asNonNegativeFiniteNumber(resolveFreshSessionTotalTokens(entry));
	const transcriptUsage = !skipTranscriptUsage ? resolveTranscriptUsageFallback({
		cfg,
		key,
		entry,
		storePath,
		freshTotalTokens: freshSessionTotalTokens,
		fallbackModelRef: subagentRun?.model,
		allowPluginNormalization: !lightweight,
		maxTranscriptBytes: params.transcriptUsageMaxBytes,
		rowContext: params.rowContext,
		agentId: sessionAgentId
	}) : null;
	const totalTokens = freshSessionTotalTokens ?? asNonNegativeFiniteNumber(transcriptUsage?.totalTokens);
	const totalTokensFresh = freshSessionTotalTokens !== void 0 || typeof totalTokens === "number" && Number.isFinite(totalTokens) && totalTokens > 0 ? true : transcriptUsage?.totalTokensFresh === true;
	const goal = entry?.goal ? resolveSessionGoalDisplayState({
		goal: entry.goal,
		totalTokens,
		totalTokensFresh,
		totalTokensVersion: totalTokensFresh ? 1 : void 0
	}, now, { adoptFreshBaseline: false }) : void 0;
	const childSessions = params.storeChildSessionsByKey ? mergeChildSessionKeys(resolveRuntimeChildSessionKeys(key, now, rowContext?.subagentRuns), params.storeChildSessionsByKey.get(key)) : resolveChildSessionKeys(key, store, now, rowContext?.subagentRuns);
	const compactionCheckpoints = resolveProjectableCompactionCheckpoints(entry);
	const compactionCheckpointCount = Array.isArray(entry?.compactionCheckpoints) ? compactionCheckpoints.length : void 0;
	const latestCompactionCheckpoint = buildCompactionCheckpointPreview(resolveLatestCompactionCheckpoint(compactionCheckpoints));
	const selectedModelProvider = selectedModel.provider;
	const selectedModelId = selectedModel.model;
	const rowModelIdentity = lightweight ? {
		provider: selectedModelProvider,
		model: selectedModelId
	} : resolveSessionDisplayModelIdentityRefCached({
		cfg,
		agentId: sessionAgentId,
		provider: selectedModelProvider,
		model: selectedModelId,
		rowContext: params.rowContext
	});
	const rowModelProvider = rowModelIdentity.provider;
	const rowModel = rowModelIdentity.model;
	const acpSessionKey = resolveStoredSessionKeyForAgentStore({
		cfg,
		agentId: sessionAgentId,
		sessionKey: key
	});
	const estimatedCostUsd = lightweight ? asNonNegativeFiniteNumber(entry?.estimatedCostUsd) : resolveEstimatedSessionCostUsd({
		cfg,
		provider: rowModelProvider,
		model: rowModel,
		entry,
		rowContext: params.rowContext
	}) ?? asNonNegativeFiniteNumber(transcriptUsage?.estimatedCostUsd);
	let derivedTitle;
	let lastMessagePreview;
	if (entry?.sessionId && (params.includeDerivedTitles || params.includeLastMessage)) {
		const fields = readSessionTitleFieldsFromTranscript({
			agentId: sessionAgentId,
			sessionEntry: entry,
			sessionId: entry.sessionId,
			sessionKey: key,
			storePath
		});
		if (params.includeDerivedTitles) derivedTitle = deriveSessionTitle(entry, fields.firstUserMessage, displayName);
		if (params.includeLastMessage && fields.lastMessagePreview) lastMessagePreview = fields.lastMessagePreview;
	}
	const thinkingProvider = rowModelProvider ?? "openai";
	const thinkingModel = rowModel ?? "gpt-5.6-sol";
	const preparedCatalog = params.modelCatalog instanceof Map ? params.modelCatalog.get(sessionAgentId) : void 0;
	const rowModelCatalog = params.modelCatalog instanceof Map ? preparedCatalog?.entries : params.modelCatalog;
	const thinkingProjection = resolveGatewaySessionThinkingProjectionInternal({
		cfg,
		agentId: sessionAgentId,
		provider: thinkingProvider,
		model: thinkingModel,
		sessionKey: acpSessionKey,
		entry,
		modelCatalog: rowModelCatalog ?? (lightweight ? [] : void 0),
		rowContext,
		providerPolicySource: preparedCatalog?.pluginRegistry ?? (lightweight ? "active" : void 0)
	});
	const catalogEntry = rowModelCatalog && rowModelProvider && rowModel ? findModelCatalogEntry(rowModelCatalog, {
		provider: rowModelProvider,
		modelId: rowModel
	}) : void 0;
	const contextWindowProfile = resolveModelContextWindowProfile({
		catalogEntry,
		selected: entry?.contextWindow
	});
	const resolvedModelContextTokens = resolvePositiveNumber(resolveContextTokensForModel({
		cfg,
		provider: rowModelProvider,
		model: rowModel,
		modelContextTokens: catalogEntry?.contextTokens,
		modelContextWindow: contextWindowProfile.contextTokens,
		allowAsyncLoad: false
	}));
	const resolvedCurrentContextTokens = contextWindowProfile.contextTokens ? Math.min(resolvedModelContextTokens ?? contextWindowProfile.contextTokens, contextWindowProfile.contextTokens) : resolvedModelContextTokens;
	const authoredContextTokens = resolvePositiveNumber(resolveAuthoredModelContextTokens({
		cfg,
		provider: rowModelProvider,
		model: rowModel
	}));
	const contextTokens = resolveProjectedSessionContextTokens({
		entry,
		provider: rowModelProvider,
		model: rowModel,
		agentHarnessId: thinkingProjection.agentRuntime.id,
		resolvedContextTokens: resolvedCurrentContextTokens,
		authoredContextTokens
	});
	const fastModeState = resolveFastModeState({
		cfg,
		provider: selectedModelProvider,
		model: selectedModelId,
		agentId: sessionAgentId,
		sessionEntry: entry?.fastMode !== void 0 ? { fastMode: entry.fastMode } : void 0
	});
	const pluginExtensions = !lightweight && entry ? projectPluginSessionExtensionsSync({
		sessionKey: key,
		entry
	}) : [];
	return {
		key,
		visibility: entry ? entry.visibility ?? "shared" : void 0,
		incognito: entry?.incognito,
		spawnedBy: subagentOwner || entry?.spawnedBy,
		controlOwnerSessionKey: subagentOwner || entry?.spawnedBy,
		swarmGroupId: entry?.swarmGroupId,
		spawnedWorkspaceDir: entry?.spawnedWorkspaceDir,
		spawnedCwd: entry?.spawnedCwd,
		permissionMode: entry?.permissionMode,
		permissionModePending: isSessionPermissionChangePending(entry?.sessionId),
		...entry?.permissionMode !== void 0 && entry.sessionRoot !== void 0 ? { sessionRoot: entry.sessionRoot } : {},
		worktree: entry?.worktree,
		execNode: entry?.execNode,
		execCwd: entry?.execCwd,
		forkedFromParent: sessionEntryForkedFromParent(entry) ? true : void 0,
		spawnDepth: entry?.spawnDepth,
		subagentRole: entry?.subagentRole,
		subagentControlScope: entry?.subagentControlScope,
		createdVia: entry?.createdVia,
		createdActor: projectSessionActor(entry?.createdActor, rowContext?.userProfileIdentityById, cfg, Boolean(sessionCreatorProfileId(entry?.createdActor))),
		owner,
		participants: participants.size ? [...participants.values()].slice(0, 4) : void 0,
		participantCount: participants.size || void 0,
		createdAt: entry?.createdAt,
		forkSource: entry?.forkSource,
		previousSessionId: entry?.previousSessionId,
		kind: gatewayKind,
		label: entry?.label,
		icon: entry?.icon,
		color: entry?.color,
		channelAvatarUrl,
		category: entry?.category,
		boardFace: entry?.boardFace,
		...sessionClassificationForRow(cfg, key, sessionAgentId, entry),
		displayName,
		derivedTitle,
		lastMessagePreview,
		channel,
		subject,
		groupChannel,
		space,
		chatType: entry?.chatType,
		origin,
		updatedAt,
		archived: entry?.archivedAt !== void 0,
		archivedAt: entry?.archivedAt,
		archivedBy: projectSessionActor(entry?.archivedBy, rowContext?.userProfileIdentityById, cfg),
		pinned: entry?.pinnedAt !== void 0,
		pinnedAt: entry?.pinnedAt,
		unread: deriveSessionUnread(entry),
		lastReadAt: entry?.lastReadAt,
		markedUnreadAt: entry?.markedUnreadAt,
		agentStatus,
		observerDigest: observerDigest ? {
			...observerDigest.agentId ? { agentId: observerDigest.agentId } : {},
			runId: observerDigest.runId,
			headline: observerDigest.headline,
			health: observerDigest.health,
			updatedAt: observerDigest.updatedAt,
			revision: observerDigest.revision
		} : void 0,
		lastInteractionAt: entry?.lastInteractionAt,
		lastActivityAt: entry?.lastActivityAt,
		sessionId: entry?.sessionId,
		systemSent: entry?.systemSent,
		abortedLastRun: entry?.abortedLastRun,
		restartRecoveryStatus: entry?.mainRestartRecovery?.tombstone ? "tombstoned" : void 0,
		thinkingLevel: thinkingProjection.thinkingLevel,
		contextWindow: contextWindowProfile.contextWindow,
		contextWindows: contextWindowProfile.contextWindows,
		contextWindowDefault: contextWindowProfile.contextWindowDefault,
		thinkingLevels: thinkingProjection.thinkingLevels,
		thinkingOptions: thinkingProjection.thinkingOptions,
		thinkingDefault: thinkingProjection.thinkingDefault,
		fastMode: entry?.fastMode,
		toolOverrides: entry?.toolOverrides,
		effectiveFastMode: fastModeState.mode,
		effectiveFastModeSource: fastModeState.source,
		fastAutoOnSeconds: fastModeState.fastAutoOnSeconds,
		verboseLevel: entry?.verboseLevel,
		traceLevel: entry?.traceLevel,
		reasoningLevel: entry?.reasoningLevel,
		elevatedLevel: entry?.elevatedLevel,
		sendPolicy: entry?.sendPolicy,
		inputTokens: entry?.inputTokens,
		outputTokens: entry?.outputTokens,
		totalTokens,
		totalTokensFresh,
		goal,
		estimatedCostUsd,
		status: subagentRun ? subagentStatus : entry?.status,
		lastRunError: entry?.lastRunError,
		lastRunId: entry?.lastRunId,
		hasAutomation: sessionHasAutomation(key, cfg, sessionAgentId) ? true : void 0,
		subagentRunState,
		hasActiveSubagentRun: subagentRun || hasActiveSubagentRun ? hasActiveSubagentRun : void 0,
		startedAt: subagentRun ? subagentStartedAt : entry?.startedAt,
		endedAt: subagentRun ? subagentEndedAt : entry?.endedAt,
		runtimeMs: subagentRun ? subagentRuntimeMs : entry?.runtimeMs,
		parentSessionKey: entry?.parentSessionKey,
		childSessions,
		responseUsage: entry?.responseUsage,
		effectiveResponseUsage: resolveEffectiveResponseUsage(entry?.responseUsage, cfg.messages?.responseUsage, channel),
		queueMode: entry?.queueMode,
		effectiveQueueMode: resolveQueueSettingsCore({
			cfg,
			channel: INTERNAL_MESSAGE_CHANNEL,
			sessionEntry: entry
		}).mode,
		modelProvider: rowModelProvider,
		model: rowModel,
		modelOverrideSource: resolveSessionModelOverrideSource(entry),
		modelSelectionLocked: entry?.modelSelectionLocked,
		agentRuntime: projectWorkerPlacementAgentRuntime(thinkingProjection.agentRuntime),
		contextTokens,
		contextBudgetStatus: entry?.contextBudgetStatus,
		deliveryContext: deliveryFields.deliveryContext,
		lastChannel: deliveryFields.lastChannel,
		lastTo: deliveryFields.lastTo,
		lastAccountId: deliveryFields.lastAccountId,
		lastThreadId: deliveryFields.lastThreadId,
		compactionCheckpointCount,
		latestCompactionCheckpoint,
		pluginExtensions: pluginExtensions.length > 0 ? pluginExtensions : void 0
	};
}
//#endregion
//#region src/gateway/session-utils-search.ts
function resolveSessionListSearchDisplayName(key, entry) {
	if (entry?.displayName) return entry.displayName;
	const parsed = parseGroupKey(key);
	const channel = sessionDeliveryChannel(entry) ?? parsed?.channel;
	if (isGroupOrChannelDisplaySession(entry, parsed) && channel) return buildGroupDisplayName({
		provider: channel,
		subject: entry?.subject,
		groupChannel: entry?.groupChannel,
		space: entry?.space,
		id: parsed?.id,
		key
	});
	return entry?.label ?? sessionDeliveryOrigin(entry)?.label;
}
function addSessionListSearchModelFields(fields, identity) {
	const provider = normalizeOptionalString(identity.provider);
	const model = normalizeOptionalString(identity.model);
	fields.push(provider, model);
	if (provider && model) fields.push(`${provider}/${model}`);
}
function matchesSessionListSearch(fields, search) {
	return fields.some((field) => typeof field === "string" && normalizeLowercaseStringOrEmpty(field).includes(search));
}
function appendStoredSessionModelSearchFields(fields, entry) {
	const provider = normalizeOptionalString(entry?.modelProvider);
	const model = normalizeOptionalString(entry?.model);
	fields.push(provider, model);
	if (provider && model) fields.push(`${provider}/${model}`);
}
function shouldResolveDerivedSessionModelSearchFields(search) {
	return !search.startsWith("agent:");
}
function resolveSessionListRowContext(params) {
	return params.rowContext ?? params.getRowContext?.();
}
function resolveSessionListSearchModelFields(params) {
	const parsedAgent = parseAgentSessionKey(params.key);
	const agentId = normalizeAgentId(parsedAgent?.agentId ?? params.agentId ?? resolveSessionStoreAgentId(params.cfg, params.key));
	const subagentRun = params.rowContext ? params.rowContext.subagentRuns.getDisplaySubagentRun(params.key) : getSessionDisplaySubagentRunByChildSessionKey(params.key);
	const selectedModel = resolveSessionSelectedModelRef({
		cfg: params.cfg,
		entry: params.entry,
		agentId,
		rowContext: params.rowContext,
		allowPluginNormalization: false
	});
	const resolvedModel = resolveSessionModelIdentityRef(params.cfg, params.entry, agentId, subagentRun?.model, { allowPluginNormalization: false });
	const displayModelIdentity = resolveSessionDisplayModelIdentityRefCached({
		cfg: params.cfg,
		agentId,
		provider: selectedModel.provider,
		model: selectedModel.model,
		rowContext: params.rowContext
	});
	const fields = [];
	addSessionListSearchModelFields(fields, {
		provider: params.entry?.modelProvider,
		model: params.entry?.model
	});
	addSessionListSearchModelFields(fields, resolvedModel);
	addSessionListSearchModelFields(fields, selectedModel);
	addSessionListSearchModelFields(fields, displayModelIdentity);
	return fields;
}
function loadGatewaySessionSnapshot(sessionKey, options, lightweight = false) {
	const now = options?.now ?? Date.now();
	const { cfg, storePath, store, entry, canonicalKey } = loadGatewaySessionEntryReadOnly(sessionKey, {
		clone: false,
		includeStoreChildEntries: true,
		...options?.agentId ? { agentId: options.agentId } : {}
	});
	if (!entry) return { row: null };
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store,
		key: canonicalKey,
		now
	});
	const lifecycleRunId = entry.lifecycleRunId;
	return {
		...lifecycleRunId === void 0 ? {} : { lifecycleRunId },
		row: buildGatewaySessionRow({
			cfg,
			storePath,
			store,
			key: canonicalKey,
			entry,
			now,
			includeDerivedTitles: options?.includeDerivedTitles,
			includeLastMessage: options?.includeLastMessage,
			transcriptUsageMaxBytes: options?.transcriptUsageMaxBytes,
			storeChildSessionsByKey,
			skipTranscriptUsageFallback: lightweight,
			lightweightListRow: lightweight,
			...options?.agentId ? { agentId: options.agentId } : {}
		})
	};
}
function loadGatewaySessionLifecycleSnapshot(sessionKey, options) {
	return loadGatewaySessionSnapshot(sessionKey, options, true);
}
function loadGatewaySessionRow(sessionKey, options) {
	return loadGatewaySessionSnapshot(sessionKey, options).row;
}
function buildGatewaySessionInfo(params) {
	const now = params.now ?? Date.now();
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store: params.store,
		key: params.key,
		now
	});
	return buildGatewaySessionRow({
		cfg: params.cfg,
		storePath: params.storePath,
		store: params.store,
		key: params.key,
		entry: params.entry,
		agentId: params.agentId,
		modelCatalog: params.modelCatalog,
		now,
		storeChildSessionsByKey,
		skipTranscriptUsageFallback: true,
		lightweightListRow: true
	});
}
//#endregion
//#region src/gateway/session-list-order.ts
const SESSIONS_LIST_TOP_N_LIMIT = 200;
function compareSessionEntryPairs(a, b, sortBy = "updatedAt") {
	if (sortBy !== "lastInteractionAt") {
		const aPinnedAt = a[1]?.pinnedAt ?? 0;
		const bPinnedAt = b[1]?.pinnedAt ?? 0;
		if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
	}
	const aTimestamp = sortBy === "lastInteractionAt" ? a[1]?.lastInteractionAt : a[1]?.updatedAt;
	const byTimestamp = ((sortBy === "lastInteractionAt" ? b[1]?.lastInteractionAt : b[1]?.updatedAt) ?? 0) - (aTimestamp ?? 0);
	if (byTimestamp !== 0) return byTimestamp;
	return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}
function selectNewestLimitedEntries(entries, limit, sortBy) {
	const selected = [];
	for (const entry of entries) {
		const first = selected[0];
		const beforeFirst = first && compareSessionEntryPairs(entry, first, sortBy) < 0;
		const worst = selected[limit - 1];
		if (!beforeFirst && worst && compareSessionEntryPairs(entry, worst, sortBy) >= 0) continue;
		const insertAt = beforeFirst ? 0 : selected.findIndex((candidate, index) => index > 0 && compareSessionEntryPairs(entry, candidate, sortBy) < 0);
		if (insertAt >= 0) {
			selected.splice(insertAt, 0, entry);
			if (selected.length > limit) selected.pop();
		} else if (selected.length < limit) selected.push(entry);
	}
	return selected;
}
function sortAndLimitSessionEntries(entries, limit, sortBy) {
	if (limit !== void 0 && limit <= SESSIONS_LIST_TOP_N_LIMIT) return selectNewestLimitedEntries(entries, limit, sortBy);
	const sorted = entries.toSorted((a, b) => compareSessionEntryPairs(a, b, sortBy));
	return limit === void 0 ? sorted : sorted.slice(0, limit);
}
//#endregion
//#region src/gateway/session-utils-list.ts
const SESSIONS_LIST_YIELD_INTERVAL_MS = 12;
const SESSIONS_LIST_ROW_CONTEXT_THRESHOLD = 10;
const SESSIONS_LIST_DEFAULT_LIMIT = 100;
const SESSIONS_LIST_TRANSCRIPT_FIELD_ROWS = 100;
function populateSessionListAcpMetadata(params) {
	if (!params.rowContext || params.entries.length === 0) return;
	const entries = params.entries.map(([key, entry]) => {
		const parsed = parseAgentSessionKey(key);
		const agentId = normalizeAgentId(parsed?.agentId ?? params.opts.agentId ?? resolveSessionStoreAgentId(params.cfg, key));
		return {
			sessionKey: resolveStoredSessionKeyForAgentStore({
				cfg: params.cfg,
				agentId,
				sessionKey: key
			}),
			agentId,
			entry
		};
	});
	params.rowContext.acpSessionMetaByEntry = readAcpSessionMetaBatch({
		entries,
		cfg: params.cfg
	});
}
function resolveSessionsListLimit(opts, defaultLimit) {
	if (typeof opts.limit !== "number" || !Number.isFinite(opts.limit)) return defaultLimit;
	return Math.max(1, Math.floor(opts.limit));
}
function resolveSessionsListOffset(opts) {
	if (typeof opts.offset !== "number" || !Number.isFinite(opts.offset)) return 0;
	return Math.max(0, Math.floor(opts.offset));
}
function resolveSessionsListWindowLimit(limit, offset) {
	if (limit === void 0) return;
	const windowLimit = offset + limit;
	return Number.isFinite(windowLimit) ? Math.min(windowLimit, Number.MAX_SAFE_INTEGER) : void 0;
}
function filterSessionEntries(params) {
	const { cfg, store, opts, now } = params;
	const requestedSessionKeys = opts.sessionKeys === void 0 ? null : new Set(opts.sessionKeys);
	const includeGlobal = opts.includeGlobal === true;
	const includeUnknown = opts.includeUnknown === true;
	const spawnedBy = typeof opts.spawnedBy === "string" ? opts.spawnedBy : "";
	const label = normalizeOptionalString(opts.label) ?? "";
	const boardFace = opts.boardFace;
	const agentId = typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : "";
	const search = normalizeLowercaseStringOrEmpty(opts.search);
	const activeMinutes = typeof opts.activeMinutes === "number" && Number.isFinite(opts.activeMinutes) ? Math.max(1, Math.floor(opts.activeMinutes)) : void 0;
	const creatorId = normalizeOptionalString(opts.creatorId);
	const ownerId = normalizeOptionalString(opts.ownerId);
	const involvingActorId = normalizeOptionalString(params.involvingActorId);
	const ownerFirstActorId = normalizeOptionalString(params.ownerFirstActorId);
	const activeCutoff = activeMinutes === void 0 ? void 0 : now - activeMinutes * 6e4;
	const entries = [];
	const ownerEntries = [];
	const ownerFacet = /* @__PURE__ */ new Map();
	const people = /* @__PURE__ */ new Map();
	let peopleSessionCount = 0;
	let peopleIncomplete = false;
	let selectedProfileId;
	const configuredAgentIds = params.configuredAgentIds ?? new Set(listAgentIds(cfg));
	const identities = params.userProfileIdentityById ?? /* @__PURE__ */ new Map();
	for (const [key, entry] of Object.entries(store)) {
		if (requestedSessionKeys && !requestedSessionKeys.has(key)) continue;
		if (params.entryFilter && !params.entryFilter(key, entry)) continue;
		if (isCronRunSessionKey(key) || !includeGlobal && key === "global" || !includeUnknown && key === "unknown") continue;
		if (agentId) {
			if (key === "global") {
				if (!includeGlobal) continue;
			} else if (key === "unknown") continue;
			else {
				const parsed = parseAgentSessionKey(key);
				if (!parsed || normalizeAgentId(parsed.agentId) !== agentId) continue;
			}
		}
		if (isPhantomAgentStoreListEntry(key, entry)) continue;
		if (spawnedBy) {
			if (key === "unknown" || key === "global") continue;
			const filterRowContext = resolveSessionListRowContext(params);
			const latest = filterRowContext ? filterRowContext.subagentRuns.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);
			if (!(latest ? isCurrentSessionChildOwner({
				entry,
				ownerSessionKey: spawnedBy,
				controllerSessionKey: normalizeOptionalString(latest.controllerSessionKey) || normalizeOptionalString(latest.requesterSessionKey)
			}) && shouldKeepSubagentRunChildLink(latest, {
				activeDescendants: filterRowContext ? filterRowContext.subagentRuns.countActiveDescendantRuns(key) : countActiveDescendantRuns(key),
				now
			}) : shouldKeepStoreOnlyChildLink(entry, now) && (entry.spawnedBy === spawnedBy || entry.parentSessionKey === spawnedBy))) continue;
		}
		if (opts.archived !== "all") {
			const archived = entry.archivedAt !== void 0;
			if (opts.archived === true ? !archived : archived) continue;
		}
		if (opts.requireLastInteraction === true && (!isFinitePositiveTimestamp(entry.lastInteractionAt) || normalizeOptionalString(entry.heartbeatIsolatedBaseSessionKey))) continue;
		if (label && entry.label !== label || boardFace && entry.boardFace !== boardFace) continue;
		if (search) {
			const cheapFields = [
				resolveSessionListSearchDisplayName(key, entry),
				entry.label,
				entry.subject,
				entry.sessionId,
				entry.category,
				key
			];
			appendStoredSessionModelSearchFields(cheapFields, entry);
			const cheapMatch = matchesSessionListSearch(cheapFields, search);
			const derivedMatch = !cheapMatch && shouldResolveDerivedSessionModelSearchFields(search) && matchesSessionListSearch(resolveSessionListSearchModelFields({
				...agentId ? { agentId } : {},
				cfg,
				key,
				entry,
				rowContext: resolveSessionListRowContext(params)
			}), search);
			if (!cheapMatch && !derivedMatch) continue;
		}
		if (activeCutoff !== void 0 && (entry.updatedAt ?? 0) < activeCutoff) continue;
		const effectiveOwner = projectSessionOwner(entry, identities, cfg, configuredAgentIds)?.actor;
		if (effectiveOwner) addSessionOwnerFacetIdentity(ownerFacet, effectiveOwner);
		if (creatorId && entry.createdActor?.id !== creatorId) continue;
		if (ownerId && effectiveOwner?.id !== ownerId) continue;
		if (involvingActorId) {
			const viewerOwns = effectiveOwner?.identity?.type === "profile" && effectiveOwner.identity.id === involvingActorId;
			const viewerParticipates = projectSessionParticipants(entry, identities, cfg).has(JSON.stringify({
				type: "profile",
				id: involvingActorId
			}));
			if (!viewerOwns && !viewerParticipates) continue;
		}
		if (opts.includePeople || opts.involvingProfileId) {
			const associated = projectSessionPeople(entry, identities, cfg, effectiveOwner);
			peopleSessionCount += 1;
			peopleIncomplete ||= (entry.participantCount ?? entry.participants?.length ?? 0) >= 32 || entry.participants?.some((participant) => participant.identity.type === "legacy") === true;
			for (const person of associated) {
				const existing = people.get(person.identity.id);
				people.set(person.identity.id, {
					...person,
					sessionCount: (existing?.sessionCount ?? 0) + 1
				});
			}
			if (opts.involvingProfileId) {
				selectedProfileId ??= projectSessionActor({
					type: "human",
					id: opts.involvingProfileId
				}, identities, cfg)?.identity?.id;
				if (!associated.some((person) => person.identity.id === selectedProfileId)) continue;
			}
		}
		if (effectiveOwner?.identity?.type === "profile" && effectiveOwner.identity.id === ownerFirstActorId) ownerEntries.push([key, entry]);
		entries.push([key, entry]);
	}
	const { people: visiblePeople, selected, overflow } = projectSessionPeopleFacet(people.values(), selectedProfileId);
	return {
		entries,
		ownerEntries,
		ownerFacet: sortSessionOwnerFacet(ownerFacet),
		involvingProfileId: selected?.identity.id,
		...opts.includePeople ? {
			people: visiblePeople,
			peopleIncomplete: peopleIncomplete || overflow,
			peopleSessionCount
		} : {}
	};
}
function isPhantomAgentStoreListEntry(key, entry) {
	return parseAgentSessionKey(key)?.rest === "sessions" && !normalizeOptionalString(entry?.sessionId) && entry?.updatedAt == null;
}
function selectSessionEntries(params) {
	const { ownerEntries, entries: filtered, ...facets } = filterSessionEntries(params);
	const limit = resolveSessionsListLimit(params.opts, params.defaultLimit);
	const offset = resolveSessionsListOffset(params.opts);
	const sortedWindow = sortAndLimitSessionEntries(filtered, resolveSessionsListWindowLimit(limit, offset), params.opts.sortBy);
	const sharedEntries = limit === void 0 ? sortedWindow.slice(offset) : sortedWindow.slice(offset, offset + limit);
	let entries = sharedEntries;
	let ownerCount = 0;
	if (params.ownerFirstActorId && offset === 0) {
		const owned = sortAndLimitSessionEntries(ownerEntries, Math.min(limit ?? 60, 60), params.opts.sortBy);
		ownerCount = owned.length;
		const ownedKeys = new Set(owned.map(([key]) => key));
		entries = [...owned, ...sharedEntries.filter(([key]) => !ownedKeys.has(key))];
	}
	const nextOffset = offset + sharedEntries.length;
	const hasMore = nextOffset < filtered.length;
	return {
		...facets,
		entries,
		ownerCount,
		totalCount: filtered.length,
		limitApplied: limit,
		offset,
		nextOffset: hasMore ? nextOffset : null,
		hasMore
	};
}
function prepareSessionList(params) {
	const { cfg, store, opts } = params;
	const now = Date.now();
	const userProfileIdentityById = /* @__PURE__ */ new Map();
	const configuredAgentIds = new Set(listAgentIds(cfg));
	let rowContext;
	const getRowContext = () => {
		rowContext ??= buildSessionListRowMetadataContext({
			now,
			userProfileIdentityById
		});
		return rowContext;
	};
	const hasSpawnedByFilter = typeof opts.spawnedBy === "string" && opts.spawnedBy.length > 0;
	const filteredSessionKeys = /* @__PURE__ */ new Set();
	let hasIncognito = false;
	const entryFilter = (key, entry) => {
		if (params.entryFilter && !params.entryFilter(key, entry)) {
			filteredSessionKeys.add(key);
			return false;
		}
		hasIncognito ||= entry.incognito === true || isIncognitoSessionKey(key);
		return true;
	};
	const selection = selectSessionEntries({
		cfg,
		store,
		opts,
		now,
		entryFilter,
		defaultLimit: SESSIONS_LIST_DEFAULT_LIMIT,
		getRowContext: hasSpawnedByFilter || Boolean(normalizeOptionalString(opts.search)) ? getRowContext : void 0,
		userProfileIdentityById,
		configuredAgentIds,
		involvingActorId: params.involvingActorId,
		ownerFirstActorId: params.ownerFirstActorId
	});
	const usePreparedChildReads = Boolean(rowContext) || hasSpawnedByFilter || filteredSessionKeys.size > 0 || selection.entries.length > SESSIONS_LIST_ROW_CONTEXT_THRESHOLD;
	const sharedRowContext = usePreparedChildReads || selection.entries.length > 0 ? getRowContext() : void 0;
	const storePath = hasIncognito ? params.storePath : params.durableStorePath ?? params.storePath;
	const storeChildSessionsByKey = buildStoreChildSessionIndex({
		store,
		keys: selection.entries.map(([key]) => key),
		now,
		subagentRuns: usePreparedChildReads ? sharedRowContext?.subagentRuns : void 0,
		excludedChildKeys: filteredSessionKeys,
		requireCurrentController: !usePreparedChildReads
	});
	populateSessionListAcpMetadata({
		cfg,
		entries: selection.entries,
		opts,
		rowContext: sharedRowContext
	});
	return {
		...selection,
		includeDerivedTitles: opts.includeDerivedTitles === true,
		includeLastMessage: opts.includeLastMessage === true,
		transcriptFieldRows: SESSIONS_LIST_TRANSCRIPT_FIELD_ROWS + selection.ownerCount,
		now,
		configuredAgentIds,
		rowContext: sharedRowContext,
		storeChildSessionsByKey,
		storePath
	};
}
function buildSessionsListResult(params, list, sessions) {
	const { cfg, opts, modelCatalog } = params;
	const preparedDefaultsCatalog = modelCatalog instanceof Map ? modelCatalog.get(resolveSessionsListDefaultsAgentId(cfg, opts.agentId)) : void 0;
	const defaultsCatalog = modelCatalog instanceof Map ? preparedDefaultsCatalog?.entries : modelCatalog;
	return {
		ts: list.now,
		path: list.storePath,
		count: sessions.length,
		totalCount: list.totalCount,
		limitApplied: list.limitApplied,
		offset: list.offset > 0 ? list.offset : void 0,
		nextOffset: list.nextOffset,
		hasMore: list.hasMore,
		owners: list.ownerFacet,
		involvingProfileId: list.involvingProfileId,
		...list.people ? {
			people: list.people,
			peopleIncomplete: list.peopleIncomplete,
			peopleSessionCount: list.peopleSessionCount
		} : {},
		defaults: getSessionDefaults(cfg, defaultsCatalog, {
			...opts.agentId ? { agentId: opts.agentId } : {},
			allowPluginNormalization: false,
			providerPolicySource: preparedDefaultsCatalog?.pluginRegistry
		}),
		sessions
	};
}
function resolveSessionsListDefaultsAgentId(cfg, requestedAgentId) {
	return requestedAgentId ? normalizeAgentId(requestedAgentId) : normalizeAgentId(tryResolveLegacyCompatibilityAgentId(cfg) ?? "main");
}
function filterAndSortSessionEntries(params) {
	return selectSessionEntries(params).entries;
}
/** Projects lightweight list rows while sharing the event loop with other requests. */
async function listSessionsFromStoreAsync(params) {
	return withPinnedActivePluginRegistryWorkspaceDir(async () => {
		let workStartedAt = performance.now();
		const { cfg, store, opts } = params;
		const list = prepareSessionList(params);
		const sessions = [];
		const transcriptFields = readSessionTitleFieldsFromTranscriptBatch(list.entries.slice(0, list.transcriptFieldRows).flatMap(([key, entry]) => {
			if (!entry.sessionId || !list.includeDerivedTitles && !list.includeLastMessage) return [];
			const parsed = parseAgentSessionKey(key);
			return [{
				agentId: normalizeAgentId(parsed?.agentId ?? opts.agentId ?? resolveSessionStoreAgentId(cfg, key)),
				sessionEntry: entry,
				sessionId: entry.sessionId,
				sessionKey: key,
				storePath: list.storePath
			}];
		}));
		let transcriptFieldIndex = 0;
		for (let i = 0; i < list.entries.length; i++) {
			const [key, entry] = expectDefined(list.entries[i], "entries entry at i");
			const includeTranscriptFields = i < list.transcriptFieldRows;
			const rowAgentId = !parseAgentSessionKey(key) && typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : void 0;
			const row = buildGatewaySessionRow({
				cfg,
				storePath: list.storePath,
				store,
				key,
				entry,
				agentId: rowAgentId,
				modelCatalog: params.modelCatalog,
				now: list.now,
				includeDerivedTitles: false,
				includeLastMessage: false,
				storeChildSessionsByKey: list.storeChildSessionsByKey,
				rowContext: list.rowContext,
				configuredAgentIds: list.configuredAgentIds,
				skipTranscriptUsageFallback: true,
				lightweightListRow: true
			});
			if (entry?.sessionId && includeTranscriptFields && (list.includeDerivedTitles || list.includeLastMessage)) {
				const fields = expectDefined(transcriptFields[transcriptFieldIndex], "batched transcript fields at transcriptFieldIndex");
				transcriptFieldIndex += 1;
				if (list.includeDerivedTitles) row.derivedTitle = deriveSessionTitle(entry, fields.firstUserMessage, row.displayName);
				if (list.includeLastMessage && fields.lastMessagePreview) row.lastMessagePreview = fields.lastMessagePreview;
			}
			sessions.push(row);
			if (i + 1 < list.entries.length && performance.now() - workStartedAt >= SESSIONS_LIST_YIELD_INTERVAL_MS) {
				await new Promise((resolve) => {
					setImmediate(resolve);
				});
				workStartedAt = performance.now();
			}
		}
		return buildSessionsListResult(params, list, sessions);
	});
}
//#endregion
export { resolveActiveSessionAgentStatus as C, deriveSessionTitle as E, isSessionAgentAttentionIconId as S, sessionAgentStatusExpiresAt as T, readSessionAutomationVersion as _, loadGatewaySessionLifecycleSnapshot as a, disableCronJobsBoundToSessions as b, buildSessionListRowMetadataContext as c, beginSessionPermissionChange as d, projectAssignableSessionOwner as f, claimSessionAutomationEpoch as g, bumpSessionAutomationVersion as h, buildGatewaySessionInfo as i, readSessionTitleFieldsFromTranscript as l, projectSessionParticipant as m, listSessionsFromStoreAsync as n, loadGatewaySessionRow as o, projectSessionActor as p, resolveSessionsListDefaultsAgentId as r, buildGatewaySessionRow as s, filterAndSortSessionEntries as t, readSessionTitleProjectionUnavailableVersion as u, registerSessionAutomationSource as v, sanitizeSessionAgentStatusNote as w, resolveCronJobBoundSessionKeys as x, unregisterSessionAutomationSource as y };
