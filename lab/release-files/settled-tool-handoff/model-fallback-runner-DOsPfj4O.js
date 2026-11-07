import { C as parseStrictNonNegativeInteger } from "./number-coercion-CLj0HTDM.js";
import { t as sanitizeForLog } from "./ansi-DrXAcdMD.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { i as emitFailoverEvent } from "./diagnostic-events-D_BPObBj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import "./model-ref-shared-Dz7QU0Lx.js";
import { t as modelKey } from "./model-key-CMdQNkZf.js";
import { t as hasAnyAuthProfileStoreSource } from "./source-check-dXMlw_Sl.js";
import { r as resolveSubscriptionAuthModeForProfiles } from "./profile-list-sI6O2eVg.js";
import { r as isActiveUnusableWindow } from "./usage-state-C0QBjJnZ.js";
import { s as isLikelyContextOverflowError } from "./classify-Dm9sTbZz.js";
import { r as resolveModelCandidateChain } from "./model-fallback-candidates-B-mHEN3S.js";
import { i as externalCliDiscoveryScoped } from "./external-cli-discovery-BD6kS6OB.js";
import { a as isFailoverError, t as FailoverError } from "./error-Crg6nsju.js";
import { c as isNonProviderRuntimeCoordinationError, g as isMissingAgentHarnessError, h as isAgentHarnessPreflightError, i as describeFailoverError, n as buildProviderReauthCommand, r as coerceToFailoverError, s as hasProviderRequestSizeCeiling, v as resolveAgentHarnessPreflightOwner } from "./failover-error-B46Ke6VT.js";
import { _ as logModelFallbackDecision, a as recordFailedCandidateAttempt, c as resolveLiveSessionModelSwitchRedirectIndex, d as resolveNextFallbackCandidateIndex, f as runFallbackAttempt, g as isModelFallbackDecisionLogEnabled, h as throwFallbackFailureSummary, i as isTranscriptNotContinuableError, l as resolveModelFallbackCandidateAgentRuntime, m as shouldDiscardDeferredSessionSuspension, n as hasDifferentLiveSessionRuntimeSelection, o as resolveFallbackAuthScope, p as sameModelCandidate, s as resolveFallbackSoonestCooldownExpiry, t as appendFailedCandidateAttempt, u as resolveModelFallbackCandidateHarnessAuthPrecheck } from "./model-fallback-attempt-C1x1isxV.js";
import { o as suspendSession, r as resolveSessionSuspensionReason } from "./session-suspension-CB3NOJMt.js";
//#region src/agents/live-model-switch-error.ts
/** Control-flow error used to request a live session model switch. */
var LiveSessionModelSwitchError = class extends Error {
	constructor(selection) {
		super(`Live session model switch requested: ${selection.provider}/${selection.model}`);
		this.name = "LiveSessionModelSwitchError";
		this.provider = selection.provider;
		this.model = selection.model;
		this.agentRuntimeOverride = selection.agentRuntimeOverride;
		this.authProfileId = selection.authProfileId;
		this.authProfileIdSource = selection.authProfileIdSource;
	}
};
//#endregion
//#region src/agents/failover-policy.ts
/** Returns true when a failed model can be probed during cooldown. */
function shouldAllowCooldownProbeForReason(reason) {
	return reason === "rate_limit" || reason === "overloaded" || reason === "billing" || reason === "unknown" || reason === "empty_response" || reason === "no_error_details" || reason === "unclassified" || reason === "timeout";
}
/** Returns true when a transient failure should consume a cooldown probe slot. */
function shouldUseTransientCooldownProbeSlot(reason) {
	return reason === "rate_limit" || reason === "overloaded" || reason === "unknown" || reason === "empty_response" || reason === "no_error_details" || reason === "unclassified" || reason === "timeout";
}
/** Returns true when a non-transient failure should leave transient probe budget intact. */
function shouldPreserveTransientCooldownProbeSlot(reason) {
	return reason === "model_not_found" || reason === "format" || reason === "auth" || reason === "auth_permanent" || reason === "session_expired" || reason === "tls_certificate";
}
//#endregion
//#region src/agents/fallback-skip-cache.ts
/**
* Session-scoped "known-bad candidate" cache for the model fallback chain.
*
* When explicitly enabled and a fallback candidate fails with a non-transient
* credential error (`auth` / `auth_permanent`), the chain can avoid retrying
* the same candidate on every subsequent turn until the user fixes their auth.
*
* This module records skip markers per `(sessionId, provider, model, authScope)`
* with a short TTL. The cache is intentionally in-memory only: a process
* restart clears it so a freshly-restarted gateway always tries every
* candidate at least once before deciding to skip again.
*
* The cache is global, not per-config, so any caller running fallbacks for the
* same `sessionId` shares the same skip set.
*/
/**
* Default time-to-live for a skip marker. Disabled by default so existing
* fallback retry behavior stays unchanged unless an operator opts in with
* OPENCLAW_FALLBACK_SKIP_TTL_MS.
*/
const DEFAULT_FALLBACK_SKIP_TTL_MS = 0;
const FALLBACK_SKIP_TTL_ENV = "OPENCLAW_FALLBACK_SKIP_TTL_MS";
const FALLBACK_SKIP_TTL_MIN_MS = 1e3;
const FALLBACK_SKIP_TTL_MAX_MS = 6e5;
function resolveConfiguredSkipTtlMs(env = process.env) {
	const raw = env[FALLBACK_SKIP_TTL_ENV];
	if (!raw) return DEFAULT_FALLBACK_SKIP_TTL_MS;
	const trimmed = raw.trim();
	if (!trimmed) return DEFAULT_FALLBACK_SKIP_TTL_MS;
	const parsed = parseStrictNonNegativeInteger(trimmed);
	if (parsed === void 0) return DEFAULT_FALLBACK_SKIP_TTL_MS;
	if (parsed === 0) return 0;
	return Math.min(FALLBACK_SKIP_TTL_MAX_MS, Math.max(FALLBACK_SKIP_TTL_MIN_MS, parsed));
}
/**
* Minimum interval between two opportunistic global prunes. Keeps the
* worst-case cost of a hot write/check path amortized: even if a gateway
* tracks thousands of sessions, the cache is only walked every
* `GLOBAL_PRUNE_INTERVAL_MS`, not on every call.
*/
const GLOBAL_PRUNE_INTERVAL_MS = 5e3;
function getState() {
	const globalStore = globalThis;
	if (!globalStore.openclawFallbackSkipCacheState) {
		const buckets = globalStore.openclawFallbackSkipCache ?? /* @__PURE__ */ new Map();
		globalStore.openclawFallbackSkipCacheState = {
			buckets,
			lastGlobalPruneAtMs: 0
		};
		globalStore.openclawFallbackSkipCache = buckets;
	}
	return globalStore.openclawFallbackSkipCacheState;
}
function getBuckets() {
	return getState().buckets;
}
function sessionBucket(sessionId, create) {
	const buckets = getBuckets();
	let bucket = buckets.get(sessionId);
	if (!bucket && create) {
		bucket = /* @__PURE__ */ new Map();
		buckets.set(sessionId, bucket);
	}
	return bucket;
}
function candidateKey(provider, model, authScope) {
	return JSON.stringify([modelKey(provider, model), authScope?.trim() || null]);
}
function pruneExpired(bucket, now) {
	for (const [key, entry] of bucket.entries()) if (entry.expiresAtMs <= now) bucket.delete(key);
}
/**
* Walk every session bucket, drop expired markers, and remove buckets that
* end up empty. Called opportunistically from the hot write/check paths so
* stale buckets left behind by one-off sessions cannot accumulate across the
* gateway's lifetime — the per-bucket prune only fires when the same session
* is queried again, which is not guaranteed for short-lived sessions.
*/
function pruneAllExpired(now) {
	const state = getState();
	if (now - state.lastGlobalPruneAtMs < GLOBAL_PRUNE_INTERVAL_MS) return;
	state.lastGlobalPruneAtMs = now;
	for (const [sessionId, bucket] of state.buckets.entries()) {
		pruneExpired(bucket, now);
		if (bucket.size === 0) state.buckets.delete(sessionId);
	}
}
/**
* Record that `(sessionId, provider, model)` should be skipped for the
* configured TTL. Safe to call with falsy `sessionId` — the call becomes a
* no-op so callers do not need to guard themselves.
*/
function markFallbackCandidateSkipped(params) {
	if (!params.sessionId || !params.provider || !params.model) return;
	const now = params.now ?? Date.now();
	const ttlMs = params.ttlMs ?? resolveConfiguredSkipTtlMs();
	if (ttlMs <= 0) return;
	pruneAllExpired(now);
	const bucket = sessionBucket(params.sessionId, true);
	if (!bucket) return;
	bucket.set(candidateKey(params.provider, params.model, params.authScope), {
		expiresAtMs: now + ttlMs,
		reason: params.reason
	});
}
/**
* Returns true when `(sessionId, provider, model)` has an unexpired skip
* marker. Expired entries are pruned as a side-effect so the cache does not
* grow unbounded.
*/
function isFallbackCandidateSkipped(params) {
	if (!params.sessionId || !params.provider || !params.model) return false;
	const now = params.now ?? Date.now();
	pruneAllExpired(now);
	const bucket = sessionBucket(params.sessionId, false);
	if (!bucket) return false;
	pruneExpired(bucket, now);
	if (bucket.size === 0) {
		getBuckets().delete(params.sessionId);
		return false;
	}
	const entry = bucket.get(candidateKey(params.provider, params.model, params.authScope));
	return Boolean(entry && entry.expiresAtMs > now);
}
/**
* Look up the recorded skip reason for a `(sessionId, provider, model)`
* triple. Returns `undefined` when no unexpired marker exists. Used by the
* fallback chain to surface the original failure reason in observation logs.
*/
function getFallbackCandidateSkipReason(params) {
	if (!params.sessionId || !params.provider || !params.model) return;
	const bucket = sessionBucket(params.sessionId, false);
	if (!bucket) return;
	const now = params.now ?? Date.now();
	const entry = bucket.get(candidateKey(params.provider, params.model, params.authScope));
	if (!entry || entry.expiresAtMs <= now) return;
	return entry.reason;
}
//#endregion
//#region src/agents/model-fallback-cooldown.ts
/** Decides when cooldowned model candidates may be skipped, probed, or suspended. */
const lastProbeAttempt = /* @__PURE__ */ new Map();
const MIN_PROBE_INTERVAL_MS = 3e4;
const PROBE_MARGIN_MS = 12e4;
const PROBE_SCOPE_DELIMITER = "::";
const PROBE_STATE_TTL_MS = 864e5;
const MAX_PROBE_KEYS = 256;
function resolveProbeThrottleKey(provider, agentDir) {
	const scope = normalizeOptionalString(agentDir) ?? "";
	return scope ? `${scope}${PROBE_SCOPE_DELIMITER}${provider}` : provider;
}
function pruneProbeState(now) {
	for (const [key, ts] of lastProbeAttempt) if (!Number.isFinite(ts) || ts <= 0 || now - ts > PROBE_STATE_TTL_MS) lastProbeAttempt.delete(key);
}
function enforceProbeStateCap() {
	while (lastProbeAttempt.size > MAX_PROBE_KEYS) {
		let oldestKey = null;
		let oldestTs = Number.POSITIVE_INFINITY;
		for (const [key, ts] of lastProbeAttempt) if (ts < oldestTs) {
			oldestKey = key;
			oldestTs = ts;
		}
		if (!oldestKey) break;
		lastProbeAttempt.delete(oldestKey);
	}
}
function isProbeThrottleOpen(now, throttleKey) {
	pruneProbeState(now);
	return now - (lastProbeAttempt.get(throttleKey) ?? 0) >= MIN_PROBE_INTERVAL_MS;
}
function markProbeAttempt(now, throttleKey) {
	pruneProbeState(now);
	lastProbeAttempt.set(throttleKey, now);
	enforceProbeStateCap();
}
function hasActiveProviderRateLimitResetWindow(params) {
	return params.profileIds.some((profileId) => {
		const stats = params.authStore.usageStats?.[profileId];
		if (!stats || !isActiveUnusableWindow(stats.blockedUntil, params.now)) return false;
		if (stats.blockedReason !== "subscription_limit" || !stats.blockedSource) return false;
		return !stats.blockedModel || stats.blockedModel === params.model;
	});
}
function shouldProbePrimaryDuringCooldown(params) {
	if (!params.isPrimary || !isProbeThrottleOpen(params.now, params.throttleKey)) return false;
	if (!params.hasFallbackCandidates) return true;
	const soonest = params.authRuntime.getSoonestCooldownExpiry(params.authStore, params.profileIds, {
		now: params.now,
		forModel: params.model
	});
	if (params.reason === "rate_limit" && !hasActiveProviderRateLimitResetWindow({
		authStore: params.authStore,
		profileIds: params.profileIds,
		now: params.now,
		model: params.model
	})) return true;
	if (soonest === null || !Number.isFinite(soonest)) return true;
	return params.now >= soonest - PROBE_MARGIN_MS;
}
function resolveCooldownDecision(params) {
	const inferredReason = params.authRuntime.resolveProfilesUnavailableReason({
		store: params.authStore,
		profileIds: params.profileIds,
		now: params.now
	}) ?? "unknown";
	const shouldProbe = shouldProbePrimaryDuringCooldown({
		isPrimary: params.isPrimary,
		hasFallbackCandidates: params.hasFallbackCandidates,
		reason: inferredReason,
		now: params.now,
		throttleKey: params.probeThrottleKey,
		authRuntime: params.authRuntime,
		authStore: params.authStore,
		profileIds: params.profileIds,
		model: params.candidate.model
	});
	if (inferredReason === "auth" || inferredReason === "auth_permanent") return {
		type: "skip",
		reason: inferredReason,
		error: `Provider ${params.candidate.provider} has ${inferredReason} issue (skipping all models)`
	};
	if (inferredReason === "billing") {
		if (params.isPrimary && shouldProbe) return {
			type: "attempt",
			reason: inferredReason,
			markProbe: true
		};
		return {
			type: "suspend_session",
			reason: inferredReason,
			leaderCandidate: params.candidate
		};
	}
	if (!(params.isPrimary && (!params.requestedModel || shouldProbe) || !params.isPrimary && shouldUseTransientCooldownProbeSlot(inferredReason))) return {
		type: "suspend_session",
		reason: inferredReason,
		leaderCandidate: params.candidate
	};
	return {
		type: "attempt",
		reason: inferredReason,
		markProbe: params.isPrimary && shouldProbe
	};
}
//#endregion
//#region src/agents/model-fallback-runner.ts
/** Runs the ordered model fallback execution state machine. */
const log = createSubsystemLogger("model-fallback");
const modelFallbackAuthRuntimeLoader = createLazyImportLoader(() => import("./agents/auth-profiles.runtime.js"));
function flushDeferredSessionSuspension(state) {
	const pending = state.pending;
	if (!pending) return;
	state.pending = void 0;
	suspendSession(pending);
}
async function runWithModelFallback(params) {
	const deferredSuspension = {};
	try {
		const result = await runWithModelFallbackInternal(params, deferredSuspension);
		if (result.outcome === "exhausted") flushDeferredSessionSuspension(deferredSuspension);
		return result;
	} catch (err) {
		if (!shouldDiscardDeferredSessionSuspension({
			error: err,
			abortSignal: params.abortSignal
		})) flushDeferredSessionSuspension(deferredSuspension);
		throw err;
	}
}
async function runWithModelFallbackInternal(params, deferredSuspension) {
	const candidates = resolveModelCandidateChain({
		cfg: params.cfg,
		agentId: params.agentId,
		provider: params.provider,
		model: params.model,
		fallbacksOverride: params.fallbacksOverride,
		requestedRouteResolution: params.requestedRouteResolution,
		manifestPlugins: params.manifestPlugins
	});
	await params.prepareCandidateChain?.(candidates);
	const userLockedAuthProfileId = params.userLockedAuthProfileId?.trim() || void 0;
	const authRuntime = !params.skipAuthProfileRuntime && params.cfg && hasAnyAuthProfileStoreSource(params.agentDir) ? await modelFallbackAuthRuntimeLoader.load() : null;
	const authStore = authRuntime ? authRuntime.ensureAuthProfileStore(params.agentDir, { externalCli: externalCliDiscoveryScoped({
		config: params.cfg,
		allowKeychainPrompt: false,
		providerIds: candidates.map((candidate) => candidate.provider),
		...userLockedAuthProfileId ? { profileIds: [userLockedAuthProfileId] } : {}
	}) }) : null;
	const attempts = [];
	let lastError;
	let latestClassifiedResult;
	let exhaustionResult;
	const cooldownProbeUsedProviders = /* @__PURE__ */ new Set();
	const tlsFailedProviders = /* @__PURE__ */ new Set();
	const notifyFallbackStep = async (step) => {
		try {
			await params.onFallbackStep?.(step);
		} catch {
			log.warn("Model fallback observer failed; preserving execution outcome.");
		}
	};
	const observeDecision = async (decision) => {
		if (!params.onFallbackStep && !isModelFallbackDecisionLogEnabled()) return;
		const fallbackStep = logModelFallbackDecision(decision);
		if (fallbackStep) await notifyFallbackStep(fallbackStep);
	};
	const observeFailedCandidate = async (failedAttempt) => {
		if (!params.onFallbackStep && !isModelFallbackDecisionLogEnabled()) appendFailedCandidateAttempt(failedAttempt);
		else {
			const fallbackStep = recordFailedCandidateAttempt(failedAttempt);
			if (fallbackStep) await notifyFallbackStep(fallbackStep);
		}
		if (params.sessionId && failedAttempt.nextCandidate) {
			const described = describeFailoverError(failedAttempt.error);
			emitFailoverEvent({
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				lane: params.lane,
				fromProvider: failedAttempt.candidate.provider,
				fromModel: failedAttempt.candidate.model,
				toProvider: failedAttempt.nextCandidate.provider,
				toModel: failedAttempt.nextCandidate.model,
				reason: described.reason ?? "unknown",
				cascadeDepth: failedAttempt.attempt - 1,
				suspended: false
			});
		}
	};
	const hasFallbackCandidates = candidates.length > 1;
	const requestedCandidate = candidates.find((candidate) => candidate.routeOrigin === "requested");
	const runAttribution = {
		sessionId: params.sessionId,
		lane: params.lane
	};
	const runObs = {
		runId: params.runId,
		...runAttribution,
		requestedProvider: params.provider,
		requestedModel: params.model,
		fallbackConfigured: hasFallbackCandidates
	};
	for (let i = 0; i < candidates.length; i += 1) {
		const candidate = candidates.at(i);
		if (!candidate) throw new Error(`Missing model fallback candidate at index ${i}`);
		if (tlsFailedProviders.has(candidate.provider)) continue;
		const candidateRef = {
			provider: candidate.provider,
			model: candidate.model
		};
		const nextCandidate = candidates[resolveNextFallbackCandidateIndex({
			candidates,
			currentIndex: i,
			excludedProviders: tlsFailedProviders
		})];
		const hasRemainingCandidate = nextCandidate !== void 0;
		const candidateHarnessAuth = await resolveModelFallbackCandidateHarnessAuthPrecheck({
			cfg: params.cfg,
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			resolveAgentHarnessRuntimeOverride: params.resolveAgentHarnessRuntimeOverride,
			prepareAgentHarnessRuntime: params.prepareAgentHarnessRuntime,
			...candidate
		});
		const isPrimary = candidate.routeOrigin === "requested";
		const requestedModel = requestedCandidate ? sameModelCandidate(candidate, requestedCandidate) : false;
		const attemptContext = {
			attempt: i + 1,
			total: candidates.length
		};
		const candObs = {
			...runObs,
			candidate,
			...attemptContext,
			nextCandidate,
			isPrimary,
			requestedModelMatched: requestedModel
		};
		const observeCandidateDecision = (decision, extra = {}) => observeDecision({
			decision,
			...candObs,
			...extra
		});
		const pushAttempt = (error, reason, auth) => attempts.push({
			...candidateRef,
			error,
			reason,
			...auth
		});
		let candidateAuthProfileIds;
		let userLockedAuthProfileEligible = false;
		if (authRuntime && authStore) {
			userLockedAuthProfileEligible = userLockedAuthProfileId !== void 0 && authRuntime.resolveAuthProfileEligibility({
				cfg: params.cfg,
				store: authStore,
				provider: candidate.provider,
				profileId: userLockedAuthProfileId
			}).eligible;
			if (!candidateHarnessAuth.skipsProviderAuthCooldown) {
				const orderedProfileIds = authRuntime.resolveAuthProfileOrder({
					cfg: params.cfg,
					store: authStore,
					provider: candidate.provider,
					forModel: candidate.model
				});
				candidateAuthProfileIds = userLockedAuthProfileEligible && userLockedAuthProfileId ? [userLockedAuthProfileId, ...orderedProfileIds.filter((profileId) => profileId !== userLockedAuthProfileId)] : orderedProfileIds;
				authRuntime.maybeReprobeWhamBlockedProfiles({
					store: authStore,
					profileIds: candidateAuthProfileIds,
					agentDir: params.agentDir,
					forModel: candidate.model
				});
			}
		}
		const candidateAuthScope = resolveFallbackAuthScope({
			userLockedAuthProfileId: userLockedAuthProfileEligible ? userLockedAuthProfileId : void 0,
			profileIds: candidateAuthProfileIds
		});
		if (!isPrimary && params.sessionId) {
			if (isFallbackCandidateSkipped({
				sessionId: params.sessionId,
				...candidateRef,
				authScope: candidateAuthScope
			})) {
				const skipReason = getFallbackCandidateSkipReason({
					sessionId: params.sessionId,
					...candidateRef,
					authScope: candidateAuthScope
				}) ?? "auth";
				const reauthCommand = buildProviderReauthCommand(candidate.provider);
				const reauthHint = reauthCommand ? `run \`${reauthCommand}\` to re-authenticate` : "re-authenticate that provider";
				const error = `Skipping ${candidate.provider}/${candidate.model}: recent ${skipReason} failure in this session (${reauthHint})`;
				pushAttempt(error, skipReason);
				await observeCandidateDecision("skip_candidate", {
					reason: skipReason,
					error
				});
				continue;
			}
		}
		let runOptions;
		let attemptedDuringCooldown = false;
		let transientProbeProviderForAttempt = null;
		if (authRuntime && authStore && candidateAuthProfileIds && !candidateHarnessAuth.skipsProviderAuthCooldown) {
			const profileIds = candidateAuthProfileIds;
			const isAnyProfileAvailable = profileIds.some((id) => !authRuntime.isProfileInCooldown(authStore, id, void 0, candidate.model));
			if (profileIds.length > 0 && !isAnyProfileAvailable) {
				const now = Date.now();
				const probeThrottleKey = resolveProbeThrottleKey(candidate.provider, params.agentDir);
				const decision = resolveCooldownDecision({
					candidate,
					isPrimary,
					requestedModel,
					hasFallbackCandidates,
					now,
					probeThrottleKey,
					authRuntime,
					authStore,
					profileIds
				});
				const authMode = decision.reason === "billing" || decision.reason === "auth" || decision.reason === "auth_permanent" || decision.reason === "session_expired" ? resolveSubscriptionAuthModeForProfiles({
					store: authStore,
					profileIds
				}) : void 0;
				if (decision.type === "suspend_session") {
					const error = `Provider ${candidate.provider} is in cooldown`;
					pushAttempt(error, decision.reason, { authMode });
					const hasRemainingCandidates = hasRemainingCandidate;
					if (params.sessionId) {
						emitFailoverEvent({
							sessionId: params.sessionId,
							lane: params.lane,
							fromProvider: candidate.provider,
							fromModel: candidate.model,
							reason: decision.reason,
							suspended: !hasRemainingCandidates
						});
						if (!hasRemainingCandidates) {
							deferredSuspension.pending = void 0;
							suspendSession({
								cfg: params.cfg,
								agentId: params.agentId,
								agentDir: params.agentDir,
								sessionId: params.sessionId,
								reason: resolveSessionSuspensionReason(decision.reason),
								failedProvider: candidate.provider,
								failedModel: candidate.model
							});
						}
					}
					await observeCandidateDecision("skip_candidate", {
						reason: decision.reason,
						error,
						profileCount: profileIds.length
					});
					continue;
				}
				if (decision.type === "skip") {
					pushAttempt(decision.error, decision.reason, { authMode });
					await observeCandidateDecision("skip_candidate", {
						reason: decision.reason,
						error: decision.error,
						profileCount: profileIds.length
					});
					continue;
				}
				if (decision.markProbe) markProbeAttempt(now, probeThrottleKey);
				if (shouldAllowCooldownProbeForReason(decision.reason)) {
					const isTransientCooldownReason = shouldUseTransientCooldownProbeSlot(decision.reason);
					if (isTransientCooldownReason && cooldownProbeUsedProviders.has(candidate.provider)) {
						const error = `Provider ${candidate.provider} is in cooldown (probe already attempted this run)`;
						pushAttempt(error, decision.reason, { authMode });
						await observeCandidateDecision("skip_candidate", {
							reason: decision.reason,
							error,
							profileCount: profileIds.length
						});
						continue;
					}
					runOptions = { allowTransientCooldownProbe: true };
					if (isTransientCooldownReason) transientProbeProviderForAttempt = candidate.provider;
				}
				attemptedDuringCooldown = true;
				await observeCandidateDecision("probe_cooldown_candidate", {
					reason: decision.reason,
					allowTransientCooldownProbe: runOptions?.allowTransientCooldownProbe,
					profileCount: profileIds.length
				});
			}
		}
		const attemptRun = await runFallbackAttempt({
			run: params.run,
			...candidate,
			attempts,
			captureHarnessPreflight: true,
			options: {
				...runOptions,
				isFinalFallbackAttempt: !hasRemainingCandidate,
				modelRoutingProvenance: {
					requestedProvider: params.provider,
					requestedModel: params.model,
					stage: isPrimary ? "initial" : "fallback",
					fallbackReason: isPrimary ? void 0 : attempts.at(-1)?.reason
				}
			},
			deferSessionSuspension: hasRemainingCandidate,
			onDeferredSessionSuspension: (suspension) => {
				deferredSuspension.pending = suspension;
			},
			classifyResult: params.classifyResult,
			...attemptContext,
			attribution: runAttribution,
			abortSignal: params.abortSignal
		});
		if ("success" in attemptRun) {
			if (i > 0 || attempts.length > 0 || attemptedDuringCooldown) await observeCandidateDecision("candidate_succeeded", { previousAttempts: attempts });
			const notFoundAttempt = i > 0 ? attempts.find((a) => a.reason === "model_not_found") : void 0;
			if (notFoundAttempt) log.warn(`Model "${sanitizeForLog(notFoundAttempt.provider)}/${sanitizeForLog(notFoundAttempt.model)}" not found. Fell back to "${sanitizeForLog(candidate.provider)}/${sanitizeForLog(candidate.model)}".`);
			return attemptRun.success;
		}
		const err = attemptRun.error;
		// pi-settled-tool-handoff-v1: this candidate failed after the turn's tools settled; the next one continues the transcript
		const vSettledHandoffState = globalThis[Symbol.for("openclaw.v.settledToolHandoff")] ??= { pending: new Map(), continuing: new Map(), continuations: new Map() };
		const vSettledHandoff = params.runId ? vSettledHandoffState.pending.get(params.runId) : void 0;
		if (vSettledHandoff && hasRemainingCandidate) {
			vSettledHandoffState.pending.delete(params.runId);
			vSettledHandoffState.continuing.set(params.runId, { ...vSettledHandoff, at: Date.now() });
			log.warn(`[pi-settled-tool-handoff-v1] ${sanitizeForLog(candidate.provider)}/${sanitizeForLog(candidate.model)} failed after settled tools (${vSettledHandoff.reason}); next candidate continues the transcript runId=${params.runId}`);
		}
		if (isAgentHarnessPreflightError(err)) {
			const failedHarnessId = resolveAgentHarnessPreflightOwner(err);
			if (!failedHarnessId) throw err;
			let nextEligibleIndex = candidates.length;
			for (let index = i + 1; index < candidates.length; index += 1) {
				const next = candidates[index];
				if (!next || tlsFailedProviders.has(next.provider)) continue;
				if (resolveModelFallbackCandidateAgentRuntime({
					cfg: params.cfg,
					agentId: params.agentId,
					sessionKey: params.sessionKey,
					resolveAgentHarnessRuntimeOverride: params.resolveAgentHarnessRuntimeOverride,
					...next
				}).runtime !== failedHarnessId) {
					nextEligibleIndex = index;
					break;
				}
			}
			const nextEligibleCandidate = candidates[nextEligibleIndex];
			if (!nextEligibleCandidate) throw err;
			lastError = err;
			await observeFailedCandidate({
				attempts,
				...candObs,
				error: err,
				nextCandidate: nextEligibleCandidate
			});
			await params.onError?.({
				...candidateRef,
				error: err,
				...attemptContext
			});
			i = nextEligibleIndex - 1;
			continue;
		}
		if (!(vSettledHandoff && hasRemainingCandidate) && !attemptRun.classifiedResult && params.canFallbackAfterError && !await params.canFallbackAfterError({
			...candidateRef,
			error: err,
			...attemptContext
		})) throw err;
		if (attemptRun.classifiedResult) latestClassifiedResult = attemptRun.classifiedResult;
		if (attemptRun.exhaustionResult && (!exhaustionResult || attemptRun.exhaustionResult.priority >= exhaustionResult.priority)) exhaustionResult = attemptRun.exhaustionResult;
		if (isNonProviderRuntimeCoordinationError(err)) throw err;
		if (isTranscriptNotContinuableError(err)) throw err;
		if (transientProbeProviderForAttempt) {
			const probeFailureReason = describeFailoverError(err).reason;
			if (!shouldPreserveTransientCooldownProbeSlot(probeFailureReason)) cooldownProbeUsedProviders.add(transientProbeProviderForAttempt);
		}
		const errMessage = formatErrorMessage(err);
		if (isLikelyContextOverflowError(errMessage) && !hasProviderRequestSizeCeiling(err)) throw err;
		if (isMissingAgentHarnessError(err)) throw err;
		const normalized = coerceToFailoverError(err, {
			...candidateRef,
			...runAttribution
		}) ?? err;
		if (err instanceof LiveSessionModelSwitchError) {
			if (hasDifferentLiveSessionRuntimeSelection({
				error: err,
				currentAgentHarnessRuntimeOverride: candidateHarnessAuth.agentHarnessRuntimeOverride
			})) throw err;
			const liveSwitchTargetIndex = resolveLiveSessionModelSwitchRedirectIndex({
				error: err,
				candidates,
				currentIndex: i
			});
			if (liveSwitchTargetIndex !== null) {
				i = liveSwitchTargetIndex - 1;
				continue;
			}
			const switchMsg = err.message;
			const switchNormalized = new FailoverError(switchMsg, {
				reason: "unknown",
				...candidateRef,
				...runAttribution
			});
			lastError = switchNormalized;
			await observeFailedCandidate({
				attempts,
				...candObs,
				error: switchNormalized
			});
			continue;
		}
		const isKnownFailover = isFailoverError(normalized);
		if (!isKnownFailover && !hasRemainingCandidate) throw err;
		if (isKnownFailover && !isPrimary && params.sessionId && (normalized.reason === "auth" || normalized.reason === "auth_permanent")) markFallbackCandidateSkipped({
			sessionId: params.sessionId,
			...candidateRef,
			authScope: normalized.profileId?.trim() || candidateAuthScope,
			reason: normalized.reason
		});
		if (isKnownFailover && normalized.reason === "tls_certificate") tlsFailedProviders.add(candidate.provider);
		const failedNextCandidateIndex = resolveNextFallbackCandidateIndex({
			candidates,
			currentIndex: i,
			excludedProviders: tlsFailedProviders
		});
		lastError = isKnownFailover ? normalized : err;
		await observeFailedCandidate({
			attempts,
			...candObs,
			error: normalized,
			nextCandidate: candidates[failedNextCandidateIndex]
		});
		await params.onError?.({
			...candidateRef,
			error: isKnownFailover ? normalized : err,
			...attemptContext
		});
		if (failedNextCandidateIndex > i + 1) i = failedNextCandidateIndex - 1;
	}
	if (exhaustionResult) {
		if (latestClassifiedResult && params.mergeExhaustedResult) return {
			outcome: "exhausted",
			result: params.mergeExhaustedResult({
				latestResult: latestClassifiedResult.result,
				preferredResult: exhaustionResult.result
			}),
			provider: latestClassifiedResult.provider,
			model: latestClassifiedResult.model,
			attempts
		};
		return {
			outcome: "exhausted",
			result: exhaustionResult.result,
			provider: exhaustionResult.provider,
			model: exhaustionResult.model,
			attempts
		};
	}
	return throwFallbackFailureSummary({
		attempts,
		candidates,
		lastError,
		label: "models",
		formatAttempt: (attempt) => `${attempt.provider}/${attempt.model}: ${attempt.error}${attempt.reason ? ` (${attempt.reason})` : ""}`,
		soonestCooldownExpiry: resolveFallbackSoonestCooldownExpiry({
			authRuntime,
			authStore,
			agentDir: params.agentDir,
			cfg: params.cfg,
			candidates
		}),
		attribution: {
			sessionId: params.sessionId,
			lane: params.lane
		},
		cfg: params.cfg,
		agentId: params.agentId,
		agentDir: params.agentDir
	});
}
//#endregion
export { shouldUseTransientCooldownProbeSlot as n, LiveSessionModelSwitchError as r, runWithModelFallback as t };
