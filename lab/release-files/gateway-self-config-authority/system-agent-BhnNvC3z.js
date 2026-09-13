import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { r as defaultRuntime } from "./runtime-V1VdbWVS.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import "./utils-D3A1hGii.js";
import { i as getRuntimeConfigAppliedHash, u as hashRuntimeConfigValue } from "./runtime-snapshot-BVoUH4MI.js";
import { t as createSqliteAuditRecordStore } from "./sqlite-audit-record-store-8NDr1GrQ.js";
import { n as CONFIG_AUDIT_SCOPE, t as CONFIG_AUDIT_MAX_ENTRIES } from "./io.audit-Cz9mdMXa.js";
import { $i as validateSystemAgentSetupActivateParams, D_ as buildSystemAgentInferenceUnavailableErrorDetails, O_ as buildSystemAgentSessionInvalidatedErrorDetails, Qi as validateSystemAgentChatParams, Zi as validateSystemAgentChatHistoryParams, ea as validateSystemAgentSetupActivateStartParams, na as validateSystemAgentSetupDetectParams, ra as validateSystemAgentSetupVerifyParams, ta as validateSystemAgentSetupAuthStartParams } from "./src-B9mb84px.js";
import { t as KeyedAsyncQueue } from "./keyed-async-queue-CTreGrmR.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { t as resolveGatewayPublicOrigin } from "./gateway-public-origin-BcHLka2A.js";
import { t as normalizeControlUiBasePath } from "./control-ui-shared-l0wakFAx.js";
import { T as validateAgentRunDelegatedAuthority, s as getActiveAgentRunDelegatedAuthority } from "./agent-run-registry-D84MDeZl.js";
import { x as runWithGatewayIndependentRootWorkContinuation } from "./gateway-work-admission-3tn4Qiws.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { r as getGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import { g as setCommandLaneConcurrency, r as enqueueCommandInLane } from "./command-queue-oRD7ZANz.js";
import { g as isGatewayClientProfilePending, p as authenticatedProfileUnavailableError } from "./operator-role-policy-B_VzZMic.js";
import { r as describeSystemAgentPersistentOperation } from "./operations-parse-C6y4xCop.js";
import "./operations-CTofDiKh.js";
import { n as isSystemAgentInferenceUnavailableError } from "./inference-error-DvWnwFaO.js";
import { r as formatSystemAgentStartupMessage } from "./overview-BeEslt8w.js";
import { f as formatExecApprovalExpiresIn } from "./exec-approval-reply-DydPy0bt.js";
import { n as SYSTEM_AGENT_APPROVAL_TIMEOUT_MS, t as SYSTEM_AGENT_APPROVAL_DECISIONS } from "./system-agent-approvals-r0J6k0r_.js";
import { v as sameWorkerSessionTurnClaim } from "./placement-record-CFk-vhnB.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { i as buildRequestedApprovalEvent, m as listVisiblePendingApprovalRequests, r as broadcastApprovalResolvedEvent, s as handlePendingApprovalRequest } from "./approval-shared-COFbqpM_.js";
import { t as getUpdateAvailable } from "./update-startup-BUxaEXu_.js";
import { n as getHealthCache } from "./health-state-D1_igxji.js";
import { n as SystemAgentChatEngine, r as SystemAgentWizardAnswerError, t as buildOnboardingWelcome } from "./onboarding-welcome-n6nqb6Kf.js";
import { t as WizardSession } from "./session-Y-iuZlK1.js";
import { i as runExclusiveSystemAgentSetupActivation, n as createAdmittedWizardSession, r as respondSetupAdmissionBusy, t as SetupAdmissionBusyError } from "./setup-admission-Cvpi4eBJ.js";
import { createHash, randomUUID } from "node:crypto";
//#region src/system-agent/greeting.ts
const SYSTEM_AGENT_GREETING_SCOPE = "system-agent-greeting";
const SYSTEM_AGENT_GREETING_KEY = "latest";
const SYSTEM_AGENT_GREETING_TIMEOUT_MS = 2e4;
const SYSTEM_AGENT_GREETING_FAILURE_RETRY_MS = 6e4;
const SYSTEM_AGENT_GREETING_MAX_CHARS = 700;
const SYSTEM_AGENT_GREETING_MAX_LINES = 5;
const CONFIG_AUDIT_PAGE_SIZE = 5;
const GREETING_STATE_CAS_ATTEMPTS = 4;
const greetingFlights = /* @__PURE__ */ new WeakMap();
const greetingFailures = /* @__PURE__ */ new WeakMap();
let defaultGreetingCache;
function openGreetingCache(env) {
	return createSqliteAuditRecordStore({
		scope: SYSTEM_AGENT_GREETING_SCOPE,
		maxEntries: 1,
		...env ? { env } : {}
	});
}
function getDefaultGreetingCache() {
	defaultGreetingCache ??= openGreetingCache();
	return defaultGreetingCache;
}
function openConfigAuditStore(env) {
	return createSqliteAuditRecordStore({
		scope: CONFIG_AUDIT_SCOPE,
		maxEntries: CONFIG_AUDIT_MAX_ENTRIES,
		...env ? { env } : {}
	});
}
function tryOr(fallback, read) {
	try {
		return read();
	} catch {
		return fallback;
	}
}
function readGreetingCache(store) {
	return store.latest({ limit: 1 })[0]?.value ?? null;
}
function mutateGreetingState(store, mutate, createdAt = Date.now()) {
	for (let attempt = 0; attempt < GREETING_STATE_CAS_ATTEMPTS; attempt += 1) {
		const current = readGreetingCache(store);
		const next = mutate(current);
		if (next === current || store.compareAndSet(SYSTEM_AGENT_GREETING_KEY, current, next, createdAt)) return;
	}
	throw new Error("system-agent greeting state changed too often");
}
function accountLooksDegraded(account) {
	if (account.configured === false || account.enabled === false) return false;
	const healthState = typeof account.healthState === "string" ? account.healthState.trim().toLowerCase() : "";
	const probe = account.probe && typeof account.probe === "object" ? account.probe : null;
	return healthState !== "" && healthState !== "healthy" || probe?.ok === false || account.linked === false || account.running === false || account.running === true && account.connected === false || account.connected !== true && typeof account.lastError === "string" && account.lastError.trim().length > 0;
}
/** Extract only degraded channel labels from the gateway's existing cached health aggregate. */
function systemAgentGreetingChannelHealth(health) {
	if (!health) return {
		available: false,
		degraded: []
	};
	const degraded = /* @__PURE__ */ new Set();
	for (const [channelId, channel] of Object.entries(health.channels)) if ((channel.accounts ? Object.values(channel.accounts) : [channel]).some((account) => accountLooksDegraded(account))) degraded.add(health.channelLabels[channelId] ?? channelId);
	return {
		available: true,
		degraded: [...degraded].toSorted((a, b) => a.localeCompare(b))
	};
}
function readConfigAuditFacts(store, lastSeenAuditSequence) {
	let auditSequence = 0;
	let beforeSequence;
	let recentExternalEdit = false;
	while (true) {
		const page = store.latest({
			limit: CONFIG_AUDIT_PAGE_SIZE,
			...beforeSequence === void 0 ? {} : { beforeSequence }
		});
		if (beforeSequence === void 0) auditSequence = page[0]?.sequence ?? 0;
		if (page.length === 0) break;
		let reachedWatermark = false;
		for (const entry of page) {
			if (entry.sequence <= lastSeenAuditSequence) {
				reachedWatermark = true;
				break;
			}
			if (entry.value.event === "config.external") recentExternalEdit = true;
		}
		if (reachedWatermark || page.length < CONFIG_AUDIT_PAGE_SIZE) break;
		const nextBeforeSequence = page.at(-1)?.sequence;
		if (nextBeforeSequence === void 0 || nextBeforeSequence === beforeSequence) break;
		beforeSequence = nextBeforeSequence;
	}
	return {
		auditSequence,
		recentExternalEdit
	};
}
/** Read free facts from process/SQLite snapshots; this function never starts a probe. */
function loadSystemAgentGreetingFacts(opts = {}) {
	const cache = tryOr(null, () => readGreetingCache(opts.cacheStore ?? opts.openCache?.() ?? openGreetingCache(opts.env)));
	const auditFacts = tryOr({
		auditSequence: 0,
		recentExternalEdit: false
	}, () => readConfigAuditFacts(opts.configAuditStore ?? openConfigAuditStore(opts.env), cache?.lastSeenAuditSequence ?? 0));
	const update = tryOr(null, () => (opts.getUpdateAvailable ?? getUpdateAvailable)());
	const health = tryOr(null, () => (opts.getHealthCache ?? getHealthCache)());
	return {
		updateAvailable: update?.latestVersion ?? null,
		channelHealth: systemAgentGreetingChannelHealth(health),
		...auditFacts
	};
}
/** SHA-256 over greeting decisions only; paths, errors, timestamps, and tool probes stay out. */
function systemAgentGreetingFactsHash(overview, facts) {
	const decisionFacts = {
		config: {
			exists: overview.config.exists,
			valid: overview.config.valid
		},
		defaultAgentId: overview.defaultAgentId,
		defaultModel: overview.defaultModel ?? null,
		gateway: {
			reachable: overview.gateway.reachable,
			url: overview.gateway.url
		},
		agents: overview.agents.map((agent) => ({
			id: agent.id,
			name: agent.name ?? null,
			isDefault: agent.isDefault,
			model: agent.model ?? null
		})).toSorted((a, b) => a.id.localeCompare(b.id)),
		updateAvailable: facts.updateAvailable,
		channelHealthAvailable: facts.channelHealth.available,
		degradedChannels: [...facts.channelHealth.degraded].toSorted((a, b) => a.localeCompare(b))
	};
	return createHash("sha256").update(JSON.stringify(decisionFacts)).digest("hex");
}
function normalizeGreetingText(text) {
	const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, SYSTEM_AGENT_GREETING_MAX_LINES);
	if (lines.length === 0 || lines.some((line) => /^#{1,6}\s/.test(line))) return null;
	if (lines.some((line) => /^[[{]/.test(line) || line.startsWith("```"))) return null;
	return truncateUtf16Safe(lines.join("\n"), SYSTEM_AGENT_GREETING_MAX_CHARS).trim() || null;
}
/**
* The external-edit alert is host-owned: delivery acknowledges the audit
* cursor, so a model phrasing miss would silently lose the notification.
* Appending deterministically removes that class instead of validating it.
*/
const SYSTEM_AGENT_EXTERNAL_EDIT_ALERT = "Heads up: the config was edited outside OpenClaw while I was away — open History to review it.";
function withHostOwnedAlerts(text, facts) {
	if (!facts.recentExternalEdit) return text;
	return `${text}\n${SYSTEM_AGENT_EXTERNAL_EDIT_ALERT}`;
}
/**
* Positive-presence grounding only: exceptional facts the model was given must
* appear in its text. Deliberately no negative-claim screening — keyword
* blacklists false-reject phrasing like "no channels are degraded", and the
* greeting is advisory chat text; chips, History, and health stay host-owned.
* A hallucinated outage is bounded by the prompt, the 5-line cap, and template
* fallback on the next facts change. Accepted tradeoff, not an oversight.
*/
function modelGreetingCoversFacts(text, facts) {
	const normalized = text.toLocaleLowerCase();
	if (facts.updateAvailable && !normalized.includes(facts.updateAvailable.toLocaleLowerCase())) return false;
	if (facts.channelHealth.degraded.some((label) => !normalized.includes(label.toLocaleLowerCase()))) return false;
	if (!facts.channelHealth.available && !(normalized.includes("channel health") && normalized.includes("unavailable"))) return false;
	return true;
}
function requiresDeterministicGreeting(overview) {
	return !overview.config.exists || !overview.config.valid || !overview.defaultModel || !overview.gateway.reachable;
}
function formatSystemAgentGreetingFallback(overview, facts) {
	const alerts = [];
	if (facts.updateAvailable) alerts.push(`Update ${facts.updateAvailable} is available.`);
	if (facts.channelHealth.degraded.length > 0) alerts.push(`Channels needing attention: ${facts.channelHealth.degraded.join(", ")}.`);
	else if (!facts.channelHealth.available) alerts.push("Channel health is not available yet.");
	return [formatSystemAgentStartupMessage(overview), alerts.join(" ") || void 0].filter((line) => line !== void 0).join("\n");
}
async function withGreetingTimeout(promise, timeoutMs) {
	let timer;
	try {
		return await Promise.race([promise, new Promise((_resolve, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error("system-agent greeting timed out")), timeoutMs);
			if (typeof timer === "object" && "unref" in timer) timer.unref();
		})]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
async function resolveUncachedSystemAgentGreeting(params) {
	const timeoutMs = params.timeoutMs ?? SYSTEM_AGENT_GREETING_TIMEOUT_MS;
	let plan = null;
	try {
		plan = await withGreetingTimeout(params.planner({
			overview: params.overview,
			facts: params.facts,
			timeoutMs
		}), timeoutMs);
	} catch {
		plan = null;
	}
	const text = plan ? normalizeGreetingText(plan.text) : null;
	const groundedText = text && modelGreetingCoversFacts(text, params.facts) ? text : null;
	if (!groundedText || !plan?.modelRef.trim()) {
		greetingFailures.set(params.cacheStore, {
			factsHash: params.factsHash,
			retryAfter: params.at + SYSTEM_AGENT_GREETING_FAILURE_RETRY_MS
		});
		return {
			text: formatSystemAgentGreetingFallback(params.overview, params.facts),
			source: "template"
		};
	}
	greetingFailures.delete(params.cacheStore);
	try {
		mutateGreetingState(params.cacheStore, (current) => {
			if (current?.factsHash && current.factsHash !== params.factsHash && (current.at ?? Number.NEGATIVE_INFINITY) >= params.at) return current;
			return {
				...current,
				lastSeenAuditSequence: current?.lastSeenAuditSequence ?? 0,
				factsHash: params.factsHash,
				text: groundedText,
				modelRef: plan.modelRef.trim(),
				at: params.at
			};
		}, params.at);
	} catch {}
	return {
		text: groundedText,
		source: "model"
	};
}
async function resolveSystemAgentGreeting(params) {
	const resolution = await resolveSystemAgentGreetingText(params);
	return {
		...resolution,
		text: withHostOwnedAlerts(resolution.text, params.facts)
	};
}
async function resolveSystemAgentGreetingText(params) {
	if (requiresDeterministicGreeting(params.overview)) return {
		text: formatSystemAgentGreetingFallback(params.overview, params.facts),
		source: "template"
	};
	let cacheStore;
	try {
		cacheStore = params.cacheStore ?? params.openCache?.() ?? getDefaultGreetingCache();
	} catch {
		return {
			text: formatSystemAgentGreetingFallback(params.overview, params.facts),
			source: "template"
		};
	}
	const factsHash = systemAgentGreetingFactsHash(params.overview, params.facts);
	let cached;
	try {
		cached = readGreetingCache(cacheStore);
	} catch {
		return {
			text: formatSystemAgentGreetingFallback(params.overview, params.facts),
			source: "template"
		};
	}
	if (typeof cached?.text === "string" && cached.text.trim() && cached.factsHash === factsHash && typeof cached.modelRef === "string" && typeof cached.at === "number") return {
		text: cached.text,
		source: "cache"
	};
	if (params.allowInference === false) return {
		text: formatSystemAgentGreetingFallback(params.overview, params.facts),
		source: "template"
	};
	const at = (params.now ?? Date.now)();
	const failure = greetingFailures.get(cacheStore);
	if (failure?.factsHash === factsHash && failure.retryAfter > at) return {
		text: formatSystemAgentGreetingFallback(params.overview, params.facts),
		source: "template"
	};
	if (failure && failure.retryAfter <= at) greetingFailures.delete(cacheStore);
	let flights = greetingFlights.get(cacheStore);
	if (!flights) {
		flights = /* @__PURE__ */ new Map();
		greetingFlights.set(cacheStore, flights);
	}
	const existingFlight = flights.get(factsHash);
	if (existingFlight) return existingFlight;
	const flight = resolveUncachedSystemAgentGreeting({
		...params,
		cacheStore,
		factsHash,
		at
	});
	flights.set(factsHash, flight);
	try {
		return await flight;
	} finally {
		if (flights.get(factsHash) === flight) flights.delete(factsHash);
	}
}
/** Persist the config-audit cursor only after the host has delivered the greeting. */
function acknowledgeSystemAgentGreetingDelivery(params) {
	if (!Number.isSafeInteger(params.auditSequence) || params.auditSequence < 0) return;
	try {
		mutateGreetingState(params.cacheStore ?? params.openCache?.() ?? getDefaultGreetingCache(), (current) => {
			const lastSeenAuditSequence = Math.max(current?.lastSeenAuditSequence ?? 0, params.auditSequence);
			if (current?.lastSeenAuditSequence === lastSeenAuditSequence) return current;
			return {
				...current,
				lastSeenAuditSequence
			};
		}, (params.now ?? Date.now)());
	} catch {}
}
function addQuickAction(options, option) {
	if (options.length >= 4 || options.some((candidate) => candidate.reply === option.reply)) return;
	options.push(option);
}
/** Quick actions are host-derived so model wording can never invent executable replies. */
function buildSystemAgentGreetingQuestion(overview, facts) {
	const exceptional = [];
	if (!overview.config.exists) addQuickAction(exceptional, {
		label: "Set up OpenClaw",
		reply: "setup"
	});
	else if (!overview.config.valid) addQuickAction(exceptional, {
		label: "Inspect config",
		reply: "doctor"
	});
	else if (!overview.defaultModel) addQuickAction(exceptional, {
		label: "Set up inference",
		reply: "setup"
	});
	if (!overview.gateway.reachable) {
		addQuickAction(exceptional, {
			label: "Run gateway status",
			reply: "gateway status"
		});
		addQuickAction(exceptional, {
			label: "Restart gateway",
			reply: "restart gateway"
		});
	}
	if (!facts.channelHealth.available || facts.channelHealth.degraded.length > 0) addQuickAction(exceptional, {
		label: "Check channel health",
		reply: "health"
	});
	if (facts.updateAvailable) addQuickAction(exceptional, {
		label: "Show update",
		reply: "status"
	});
	const options = exceptional.slice(0, 2);
	if (overview.defaultModel) addQuickAction(options, {
		label: "Talk to my agent",
		reply: "talk to agent",
		recommended: exceptional.length === 0 && !facts.recentExternalEdit && facts.channelHealth.available && overview.config.exists && overview.config.valid && overview.gateway.reachable
	});
	addQuickAction(options, {
		label: facts.recentExternalEdit ? "Review recent changes" : "Show recent changes",
		reply: "audit"
	});
	return {
		id: "system-agent-quick-actions",
		header: "Quick actions",
		question: "What would you like me to do?",
		options
	};
}
//#endregion
//#region src/system-agent/new-agent-welcome.ts
function buildNewAgentWelcome(params) {
	const welcome = "Let's hatch a new agent. What should it be called, and what kind of work is it for? I'll use that context to settle its name, then propose creation for your approval. The new agent will learn its role during hatch.";
	params.engine.noteAssistantMessage(welcome);
	return welcome;
}
//#endregion
//#region src/system-agent/transcript-store.ts
const SYSTEM_AGENT_TRANSCRIPT_SCOPE = "system-agent-transcript";
const SYSTEM_AGENT_TRANSCRIPT_MAX_ENTRIES = 1e3;
function openTranscriptStore(env) {
	return createSqliteAuditRecordStore({
		scope: SYSTEM_AGENT_TRANSCRIPT_SCOPE,
		maxEntries: SYSTEM_AGENT_TRANSCRIPT_MAX_ENTRIES,
		...env ? { env } : {}
	});
}
/** Append one already-sanitized engine history turn to the rolling logbook. */
function appendTranscriptTurn(turn, opts = {}) {
	openTranscriptStore(opts.env).register(`${turn.at}:${randomUUID()}`, turn, turn.at);
}
/** Mark a durable context boundary without deleting earlier logbook rows. */
function appendTranscriptReset(opts = {}) {
	appendTranscriptTurn({
		role: "reset",
		text: "",
		at: Date.now()
	}, opts);
}
/**
* Read the newest window in conversational (oldest-first) order. Markers are
* never exposed; seeding may additionally start after the newest marker.
*/
function readTranscriptTail(limit, opts = {}) {
	const entries = openTranscriptStore(opts.env).latest({ limit }).toReversed().map((entry) => entry.value);
	const resetIndex = opts.afterLastReset ? entries.findLastIndex((turn) => turn.role === "reset") : -1;
	return (opts.afterLastReset ? entries.slice(resetIndex + 1) : entries).filter((turn) => turn.role !== "reset");
}
//#endregion
//#region src/gateway/server-methods/system-agent-execution.ts
const SYSTEM_AGENT_GATEWAY_EXECUTION_KEY = "gateway";
const systemAgentGatewayExecutionQueue = new KeyedAsyncQueue();
async function runSystemAgentGatewayTask(task) {
	setCommandLaneConcurrency("system-agent", Number.MAX_SAFE_INTEGER);
	return await enqueueCommandInLane("system-agent", () => systemAgentGatewayExecutionQueue.enqueue(SYSTEM_AGENT_GATEWAY_EXECUTION_KEY, task));
}
async function verifyGatewaySetupInference(params) {
	const [{ readConfigFileSnapshot }, { verifySetupInference }] = await Promise.all([import("./config/config.js"), import("./system-agent/setup-inference.js")]);
	const runtimeConfig = params.context.getRuntimeConfig();
	const appliedHash = getRuntimeConfigAppliedHash();
	const isCurrent = () => appliedHash !== null && params.context.isConfigReloadSettled() && params.context.getRuntimeConfig() === runtimeConfig && getRuntimeConfigAppliedHash() === appliedHash;
	const isApplied = async () => {
		if (!isCurrent()) return false;
		const snapshot = await readConfigFileSnapshot();
		return snapshot.exists && snapshot.valid && hashRuntimeConfigValue(snapshot.sourceConfig) === appliedHash && isCurrent();
	};
	const unavailable = {
		ok: false,
		status: "unavailable",
		error: "Gateway settings are saved but not active yet. Wait for application or restart to finish, then retry verification."
	};
	if (!await isApplied()) return unavailable;
	const verification = await verifySetupInference({
		runtime: params.runtime,
		...params.agentId ? { agentId: params.agentId } : {}
	});
	return await isApplied() ? verification : unavailable;
}
async function activateGatewaySetupInference(params) {
	let application;
	let applied;
	let result;
	try {
		result = await runSystemAgentGatewayTask(async () => {
			const { activateSetupInference } = await import("./system-agent/setup-inference.js");
			return activateSetupInference({
				...params,
				onRuntimeApplication: (receipt) => {
					application = receipt;
				}
			});
		});
	} finally {
		if (application) applied = application.claimed ? await application.result : "unclaimed";
	}
	if (!result.ok || applied === void 0 || applied === "applied") return result;
	if (applied === "applied-restart-required" || applied === "restart-pending") return {
		...result,
		gatewayRestartRequired: true
	};
	throw new Error(applied === "superseded" ? "AI access was saved, but newer settings replaced it before activation finished. Review Model Setup and try again." : "AI access was saved, but the Gateway could not apply it. Restart the Gateway before chatting.");
}
//#endregion
//#region src/gateway/server-methods/system-agent-approval.ts
function sameApprovalAuthority(left, right) {
	if (left.kind !== right.kind || left.claimId !== right.claimId || left.lifecycleGeneration !== right.lifecycleGeneration || left.operationalRunInstance.instanceId !== right.operationalRunInstance.instanceId || left.operationalRunInstance.runId !== right.operationalRunInstance.runId) return false;
	return left.kind === "worker" && right.kind === "worker" ? sameWorkerSessionTurnClaim(left.turnClaim, right.turnClaim) : true;
}
function resolveDelegatedOwnerDirectMessage(params) {
	const delegation = params.delegation;
	const callerIdentity = params.callerIdentity;
	if (!delegation || !callerIdentity) return;
	const agentId = typeof delegation.agentId === "string" ? delegation.agentId.trim() : "";
	const sessionKey = typeof delegation.sessionKey === "string" ? delegation.sessionKey.trim() : "";
	const channel = typeof delegation.turnSourceChannel === "string" ? delegation.turnSourceChannel.trim().toLowerCase() : "";
	if (!agentId || !sessionKey || !channel) return;
	if (agentId !== callerIdentity.agentId) return;
	const directPrefix = `agent:${agentId}:${channel}:direct:`;
	if (!sessionKey.startsWith(directPrefix)) return;
	const senderId = sessionKey.slice(directPrefix.length).trim();
	if (!senderId || senderId.includes(":")) return;
	const ownerAllowFrom = params.cfg?.commands?.ownerAllowFrom;
	const ownerIdentity = `${channel}:${senderId}`;
	if (!Array.isArray(ownerAllowFrom) || !ownerAllowFrom.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === ownerIdentity.toLowerCase())) return;
	return ownerIdentity;
}
function queueDelegatedApproval(params) {
	const manager = params.context.systemAgentApprovalManager;
	if (!manager) throw new Error("OpenClaw approval registry unavailable");
	const transportIdentity = params.client?.internal?.agentRuntimeIdentity;
	const callerIdentity = getGatewayToolCallerIdentity() ?? transportIdentity;
	const runtimeDelegatedAuthority = callerIdentity?.delegatedAuthority;
	const approvalAuthority = callerIdentity?.approvalAuthority ?? runtimeDelegatedAuthority ?? (callerIdentity?.operationalRunInstance ? getActiveAgentRunDelegatedAuthority(callerIdentity.operationalRunInstance) : void 0);
	if (!approvalAuthority) throw new Error("delegated OpenClaw approval requires an active run authority");
	const workerTurnClaim = callerIdentity?.workerTurnClaim ?? (runtimeDelegatedAuthority?.kind === "worker" ? runtimeDelegatedAuthority.turnClaim : void 0);
	const runtimeApprovalAuthority = workerTurnClaim ? {
		kind: "worker",
		...approvalAuthority,
		turnClaim: workerTurnClaim
	} : {
		kind: "local",
		...approvalAuthority
	};
	const ownerDirectMessage = resolveDelegatedOwnerDirectMessage({
		cfg: params.context.getRuntimeConfig?.() ?? {},
		delegation: params.delegation,
		callerIdentity
	});
	const pendingApproval = params.session.pendingApproval;
	if (pendingApproval && pendingApproval.proposalHash === params.proposal.hash) {
		const closed = manager.forceDenyIfRuntimeAuthorityClosed(pendingApproval.id);
		const existing = manager.getSnapshot(pendingApproval.id);
		if (!closed && existing) {
			if (!ownerDirectMessage && existing.resolvedAtMs === void 0 && existing.agentRuntimeDelegatedAuthority && sameApprovalAuthority(existing.agentRuntimeDelegatedAuthority, runtimeApprovalAuthority)) return { id: pendingApproval.id };
		}
		if (ownerDirectMessage && existing?.resolvedAtMs === void 0) manager.expire(pendingApproval.id, "owner-direct-retry");
		params.session.pendingApproval = void 0;
	}
	const description = describeSystemAgentPersistentOperation(params.proposal.operation);
	const request = {
		title: "OpenClaw change",
		description,
		command: description,
		proposalHash: params.proposal.hash,
		allowedDecisions: SYSTEM_AGENT_APPROVAL_DECISIONS,
		agentId: params.delegation?.agentId ?? null,
		sessionKey: params.delegation?.sessionKey ?? null,
		sessionId: params.sessionId,
		turnSourceChannel: params.delegation?.turnSourceChannel ?? null,
		turnSourceTo: params.delegation?.turnSourceTo ?? null,
		turnSourceAccountId: params.delegation?.turnSourceAccountId ?? null,
		turnSourceThreadId: params.delegation?.turnSourceThreadId ?? null,
		runId: callerIdentity?.operationalRunInstance?.runId ?? null
	};
	const record = manager.create(request, SYSTEM_AGENT_APPROVAL_TIMEOUT_MS, `system-agent:${randomUUID()}`);
	if (callerIdentity?.approvalAuthorityCheck) record.approvalAuthority = callerIdentity.approvalAuthorityCheck;
	record.agentRuntimeDelegatedAuthority = runtimeApprovalAuthority;
	const approvalAuthorityCheck = record.approvalAuthority;
	record.approvalAuthority = () => {
		if (!validateAgentRunDelegatedAuthority(approvalAuthority) || approvalAuthorityCheck?.() === false) return false;
		if (runtimeApprovalAuthority.kind === "local") return true;
		if (!callerIdentity) return false;
		return params.context.validateAgentRuntimeApprovalAuthority?.({
			kind: "agentRuntime",
			agentId: callerIdentity.agentId,
			sessionKey: callerIdentity.sessionKey,
			operationalRunInstance: runtimeApprovalAuthority.operationalRunInstance,
			delegatedAuthority: runtimeApprovalAuthority
		}) === true;
	};
	if (callerIdentity?.approvalSignals?.length) record.approvalSignals = callerIdentity.approvalSignals;
	const decisionPromise = manager.register(record, SYSTEM_AGENT_APPROVAL_TIMEOUT_MS);
	params.session.pendingApproval = {
		id: record.id,
		proposalHash: params.proposal.hash
	};
	const requestEvent = buildRequestedApprovalEvent(record, "system-agent");
	const publishApplicationResult = (decision, applicationStatus) => {
		const resolvedEvent = {
			id: record.id,
			decision,
			resolvedBy: record.resolvedBy ?? null,
			ts: Date.now(),
			request,
			applicationStatus
		};
		broadcastApprovalResolvedEvent({
			approvalKind: "system-agent",
			context: params.context,
			record,
			event: resolvedEvent
		});
		params.context.approvalEvents?.publishResolved("system-agent", resolvedEvent);
	};
	let resolveOwnerApplication;
	let rejectOwnerApplication;
	const ownerApplication = ownerDirectMessage ? new Promise((resolve, reject) => {
		resolveOwnerApplication = resolve;
		rejectOwnerApplication = reject;
	}) : void 0;
	handlePendingApprovalRequest({
		manager,
		record,
		decisionPromise,
		respond: () => void 0,
		context: params.context,
		requestEventName: "openclaw.approval.requested",
		requestEvent,
		twoPhase: true,
		approvalKind: "system-agent",
		deliverRequest: () => false,
		keepPendingWithoutRoute: true,
		requireDeliveryRoute: false,
		afterDecision: async (decision) => {
			if (!decision) {
				resolveOwnerApplication?.(null);
				return;
			}
			try {
				const reply = await runWithGatewayIndependentRootWorkContinuation(() => runSystemAgentGatewayTask(async () => {
					const assertLiveApprovalAuthority = () => {
						if (decision !== "deny" && (!record.approvalAuthority || record.approvalAuthority() === false)) throw new Error("system-agent approval authority is no longer active");
					};
					assertLiveApprovalAuthority();
					if (params.sessions.get(params.sessionId) !== params.session) return null;
					if (params.session.pendingApproval?.id === record.id) params.session.pendingApproval = void 0;
					return await params.session.engine.resolveOperatorApproval(decision, params.proposal.hash, assertLiveApprovalAuthority);
				}), "system-agent:task");
				publishApplicationResult(decision, reply?.applied === true ? "applied" : "not-applied");
				resolveOwnerApplication?.(reply);
			} catch (error) {
				publishApplicationResult(decision, "not-applied");
				rejectOwnerApplication?.(error);
				throw error;
			}
		},
		afterDecisionErrorLabel: "OpenClaw approval apply failed"
	});
	if (ownerDirectMessage && !manager.resolveAutoReview(record.id, `owner-direct:${ownerDirectMessage}`)) throw new Error("delegated owner OpenClaw approval could not be resolved while the run was active");
	return {
		id: record.id,
		...ownerApplication ? { ownerApplication } : {}
	};
}
const systemAgentSessionQueues = /* @__PURE__ */ new WeakMap();
function getSystemAgentSessionQueue(sessions) {
	let queue = systemAgentSessionQueues.get(sessions);
	if (!queue) {
		queue = new KeyedAsyncQueue();
		systemAgentSessionQueues.set(sessions, queue);
	}
	return queue;
}
//#endregion
//#region src/gateway/server-methods/system-agent-chat-params.ts
const SYSTEM_AGENT_UI_CONTEXT_PAGE_PATTERN = /^[A-Za-z0-9/_-]{1,64}$/u;
function sanitizeSystemAgentChatParams(params) {
	if (!params || typeof params !== "object" || Array.isArray(params)) return params;
	const record = params;
	const context = record.context;
	if (context === void 0) return params;
	if (record.delegation !== void 0 || !context || typeof context !== "object" || Array.isArray(context)) {
		const { context: _droppedContext, ...rest } = record;
		return rest;
	}
	const contextRecord = context;
	const page = typeof contextRecord.page === "string" ? contextRecord.page.trim() : "";
	if (!SYSTEM_AGENT_UI_CONTEXT_PAGE_PATTERN.test(page)) {
		const { context: _droppedContext, ...rest } = record;
		return rest;
	}
	return {
		...record,
		context: { page }
	};
}
//#endregion
//#region src/gateway/server-methods/system-agent-chat-turn.ts
/**
* Build the welcome-only result for rejoining an existing session. A
* reconnecting client must re-render the live wizard/question controls the
* session still awaits; the stale welcome question only fills in when no live
* interaction exists.
*/
function buildSystemAgentRejoinResult(params) {
	const rejoin = params.engine.decorateRejoinReply({
		text: params.welcome,
		action: "none"
	});
	return {
		sessionId: params.sessionId,
		reply: rejoin.text || params.welcome,
		action: "none",
		...rejoin.sensitive === true ? { sensitive: true } : {},
		...rejoin.wizardInputPending === true ? { wizardInputPending: true } : {},
		...rejoin.step ? { step: rejoin.step } : {},
		...rejoin.question ? { question: rejoin.question } : params.welcomeQuestion ? { question: params.welcomeQuestion } : {}
	};
}
function getSystemAgentChatInputError(params) {
	if (params.message !== void 0 && params.wizardAnswer !== void 0) return "Send either message or wizardAnswer, not both.";
	if (params.wizardAnswer !== void 0 && params.delegation !== void 0) return "Delegated OpenClaw sessions cannot submit structured wizard answers.";
	if (params.wizardAnswer !== void 0 && params.reset === true) return "A wizard answer cannot reset its OpenClaw chat session.";
	if (params.wizardCancel !== void 0 && (params.message !== void 0 || params.wizardAnswer !== void 0)) return "Send wizardCancel without a message or wizardAnswer.";
	if (params.wizardCancel !== void 0 && params.delegation !== void 0) return "Delegated OpenClaw sessions cannot cancel hosted wizards.";
	if (params.wizardCancel !== void 0 && params.reset === true) return "A wizard cancel cannot reset its OpenClaw chat session.";
}
async function runSystemAgentChatInput(params) {
	if (params.input.wizardAnswer !== void 0) return await params.engine.answerWizard(params.input.wizardAnswer);
	if (params.input.wizardCancel !== void 0) return await params.engine.cancelWizard(params.input.wizardCancel);
	if (params.input.message === void 0) return;
	return params.input.delegation === void 0 && params.input.context ? await params.engine.handle(params.input.message, { uiContext: params.input.context }) : await params.engine.handle(params.input.message);
}
function buildSystemAgentChatResult(params) {
	const action = params.reply.action === "open-tui" ? "open-agent" : params.reply.action === "open-setup" ? "none" : params.reply.action;
	return {
		sessionId: params.sessionId,
		reply: params.reply.text || (action === "open-agent" ? "Setup here is done — continue with your agent." : "Nothing to change."),
		action,
		...action === "open-agent" && params.reply.agentDraft ? { agentDraft: params.reply.agentDraft } : {},
		...action === "open-agent" && params.reply.handoff?.kind === "open-tui" && params.reply.handoff.agentId ? { agentId: params.reply.handoff.agentId } : {},
		...params.reply.sensitive === true ? { sensitive: true } : {},
		...params.reply.wizardInputPending === true ? { wizardInputPending: true } : {},
		...params.reply.question ? { question: params.reply.question } : {},
		...params.reply.step ? { step: params.reply.step } : {},
		...params.proposalId ? {
			needsApproval: true,
			proposalId: params.proposalId
		} : {}
	};
}
function buildDelegatedApprovalPendingReply(params) {
	const snapshot = params.manager.getSnapshot(params.approvalId);
	if (!snapshot) throw new Error("system-agent approval snapshot unavailable after registration");
	const origin = resolveGatewayPublicOrigin(params.cfg);
	const reviewUrl = origin && params.cfg.gateway?.controlUi?.enabled !== false ? `${origin}${normalizeControlUiBasePath(params.cfg.gateway?.controlUi?.basePath)}/approve/${encodeURIComponent(params.approvalId)}` : void 0;
	return [
		`OpenClaw change pending approval: ${snapshot.request.description}.`,
		...reviewUrl ? [`Review: ${reviewUrl}.`] : [],
		"No change has been made.",
		`Expires in ${formatExecApprovalExpiresIn(snapshot.expiresAtMs, params.nowMs ?? Date.now())}.`
	].join(" ");
}
//#endregion
//#region src/system-agent/delegation-session.ts
function resolveSystemAgentDelegationKey(delegation) {
	return delegation ? JSON.stringify([delegation.agentId ?? null, delegation.sessionKey ?? null]) : void 0;
}
//#endregion
//#region src/gateway/server-methods/system-agent-session-owner.ts
function resolveSystemAgentSessionOwnerKey(params) {
	const delegationKey = resolveSystemAgentDelegationKey(params.delegation);
	if (delegationKey !== void 0) return delegationKey;
	const profileId = params.client?.authenticatedUserProfile?.profileId.trim();
	if (profileId) return `user:${profileId}`;
	if (isGatewayClientProfilePending(params.client)) return;
	const userId = params.client?.authenticatedUserId?.trim();
	if (userId) return `user:${userId}`;
	const deviceId = params.client?.connect.device?.id.trim();
	if (deviceId) return `device:${deviceId}`;
	const connId = params.client?.connId?.trim();
	return connId ? `connection:${connId}` : void 0;
}
//#endregion
//#region src/gateway/server-methods/system-agent-setup-wizard.ts
function rejectExistingSetupWizardSession(params) {
	if (!params.context.wizardSessions.has(params.sessionId)) return false;
	params.respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "wizard session already exists"));
	return true;
}
async function startSetupActivationWizard(params) {
	if (rejectExistingSetupWizardSession(params)) return;
	const session = await createAdmittedWizardSession(() => new WizardSession(async (prompter, signal, runnerSession) => {
		const result = await activateGatewaySetupInference({
			...params.activation,
			surface: "gateway",
			runtime: {
				...defaultRuntime,
				exit: (code) => {
					throw new Error(`setup step exited with code ${String(code)}`);
				}
			},
			prompter,
			signal,
			isCancelled: () => signal.aborted,
			beforePersistentEffect: () => runnerSession.lockCancellation(),
			onCommitStarted: () => runnerSession.lockCancellation()
		});
		if (!result.ok) throw new Error(result.error);
		runnerSession.setModelActivation({
			modelRef: result.modelRef,
			...result.gatewayRestartRequired ? { gatewayRestartRequired: true } : {}
		});
	}, { timeoutMs: params.timeoutMs }));
	if (!session) {
		respondSetupAdmissionBusy(params.respond);
		return;
	}
	params.context.wizardSessions.set(params.sessionId, session);
	params.respond(true, {
		sessionId: params.sessionId,
		done: false,
		status: "running"
	}, void 0);
}
//#endregion
//#region src/gateway/server-methods/system-agent.ts
/**
* `openclaw.chat` lets clients (macOS app onboarding, future UIs) run the
* same conversational setup as `openclaw setup`. Structured setup owns
* the pre-inference phase; a new chat session starts only after a live model
* turn succeeds.
*
* The bounded session map owns only in-flight wizard and approval state. The
* sanitized conversation is a durable machine-wide logbook; `reset: true`
* replaces the in-memory session without deleting that transcript.
*/
const MAX_SYSTEM_AGENT_SESSIONS = 8;
const SYSTEM_AGENT_SEED_HISTORY_LIMIT = 30;
const DEFAULT_SYSTEM_AGENT_HISTORY_LIMIT = 100;
const ACTIVATION_SESSION_TIMEOUT_MS = 48e4;
const PROVIDER_AUTH_SESSION_TIMEOUT_MS = 15e5;
const PROVIDER_PREPARE_SESSION_TIMEOUT_MS = 72e5;
function acknowledgeDeliveredSystemAgentWelcome(session) {
	const auditSequence = session.welcomeAuditSequence;
	if (auditSequence === void 0) return;
	acknowledgeSystemAgentGreetingDelivery({ auditSequence });
	delete session.welcomeAuditSequence;
}
async function evictOldestSession(sessions, context) {
	if (sessions.size < MAX_SYSTEM_AGENT_SESSIONS) return;
	let oldestKey;
	let oldestAt = Number.POSITIVE_INFINITY;
	for (const [key, session] of sessions) if (session.lastUsedAt < oldestAt) {
		oldestAt = session.lastUsedAt;
		oldestKey = key;
	}
	if (oldestKey !== void 0) {
		const oldest = sessions.get(oldestKey);
		if (oldest?.pendingApproval) context.systemAgentApprovalManager?.expire(oldest.pendingApproval.id, "session-evicted");
		await oldest?.engine.dispose();
		sessions.delete(oldestKey);
	}
}
function persistEngineHistory(engine, startIndex) {
	const at = Date.now();
	for (const turn of engine.historySince(startIndex)) appendTranscriptTurn({
		...turn,
		at
	});
}
const systemAgentHandlers = {
	"openclaw.approval.list": async ({ respond, client, context }) => {
		const manager = context.systemAgentApprovalManager;
		respond(true, manager ? listVisiblePendingApprovalRequests({
			manager,
			client,
			...client?.authenticatedUserProfile ? { cfg: context.getRuntimeConfig() } : {}
		}) : [], void 0);
	},
	"openclaw.chat.history": ({ params, respond }) => {
		if (!assertValidParams(params, validateSystemAgentChatHistoryParams, "openclaw.chat.history", respond)) return;
		respond(true, { turns: readTranscriptTail(params.limit ?? DEFAULT_SYSTEM_AGENT_HISTORY_LIMIT) }, void 0);
	},
	/** Structured onboarding: list reusable AI access on this host. */
	"openclaw.setup.detect": async ({ params, respond }) => {
		if (!assertValidParams(params, validateSystemAgentSetupDetectParams, "openclaw.setup.detect", respond)) return;
		const { detectSetupInferenceIsolated } = await import("./setup-inference-detection-BPPYzRNV.js");
		respond(true, await detectSetupInferenceIsolated(params), void 0);
	},
	/** Re-run the exact current default-agent inference route without mutating setup. */
	"openclaw.setup.verify": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSystemAgentSetupVerifyParams, "openclaw.setup.verify", respond)) return;
		await runSystemAgentGatewayTask(async () => {
			respond(true, await verifyGatewaySetupInference({
				runtime: defaultRuntime,
				context,
				...params
			}), void 0);
		});
	},
	/** Start one provider-owned OAuth/device-code login over the shared wizard transport. */
	"openclaw.setup.auth.start": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSystemAgentSetupAuthStartParams, "openclaw.setup.auth.start", respond)) return;
		const { sessionId, ...activation } = params;
		await startSetupActivationWizard({
			sessionId,
			activation: {
				...activation,
				kind: "provider-auth"
			},
			timeoutMs: PROVIDER_AUTH_SESSION_TIMEOUT_MS,
			context,
			respond
		});
	},
	/** Activate a detected or manual route with server-owned capability review. */
	"openclaw.setup.activate.start": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSystemAgentSetupActivateStartParams, "openclaw.setup.activate.start", respond)) return;
		const { sessionId, ...activation } = params;
		await startSetupActivationWizard({
			sessionId,
			activation,
			timeoutMs: ACTIVATION_SESSION_TIMEOUT_MS,
			context,
			respond
		});
	},
	/** Run one provider-owned prepare flow over the shared wizard transport. */
	"openclaw.setup.prepare.start": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSystemAgentSetupAuthStartParams, "openclaw.setup.prepare.start", respond)) return;
		const sessionId = params.sessionId;
		if (rejectExistingSetupWizardSession({
			sessionId,
			context,
			respond
		})) return;
		const session = await createAdmittedWizardSession(() => new WizardSession(async (prompter, signal, runnerSession) => {
			await runSystemAgentGatewayTask(async () => {
				const [{ applyAuthChoiceLoadedPluginProvider }, setupShared] = await Promise.all([import("./provider-auth-choice-BhQLF2XI.js"), import("./setup.shared-CuSDWA23.js")]);
				const snapshot = await setupShared.readSetupConfigFileSnapshot();
				if (!snapshot.valid) throw new Error("Config is invalid. Run `openclaw doctor` before preparing a model.");
				const baseConfig = snapshot.exists ? snapshot.sourceConfig : {};
				const workspaceDir = params.workspace?.trim() ? resolveUserPath(params.workspace.trim()) : void 0;
				const applied = await applyAuthChoiceLoadedPluginProvider({
					authChoice: params.authChoice,
					...params.agentId ? { agentId: params.agentId } : {},
					config: baseConfig,
					prompter,
					runtime: {
						...defaultRuntime,
						exit: (code) => {
							throw new Error(`setup step exited with code ${String(code)}`);
						}
					},
					setDefaultModel: false,
					preserveExistingDefaultModel: true,
					...workspaceDir ? { workspaceDir } : {},
					signal,
					isRemote: true,
					beforePersistentEffect: () => {
						signal.throwIfAborted();
						runnerSession.lockCancellation();
					}
				});
				if (!applied || applied.retrySelection) throw new Error(`Provider setup resolution failed for "${params.authChoice}". Run \`openclaw doctor --fix\`, restart the Gateway, and try again.`);
				signal.throwIfAborted();
				runnerSession.lockCancellation();
				await setupShared.writeWizardConfigFile(applied.config, {
					allowConfigSizeDrop: false,
					baseSnapshot: snapshot,
					...snapshot.hash ? { baseHash: snapshot.hash } : {}
				});
				if (applied.agentModelOverride) runnerSession.setPreparedModelRef(applied.agentModelOverride);
			});
		}, { timeoutMs: PROVIDER_PREPARE_SESSION_TIMEOUT_MS }));
		if (!session) {
			respondSetupAdmissionBusy(respond);
			return;
		}
		context.wizardSessions.set(sessionId, session);
		respond(true, {
			sessionId,
			done: false,
			status: "running"
		}, void 0);
	},
	/**
	* Structured onboarding: live-test one candidate and persist it on success.
	* Single-flight per gateway process because testing and persistence span
	* multiple config/plugin mutations. Concurrent callers fail fast instead of
	* queueing work that could outlive their RPC timeout. Verification failures never
	* commit a broken model; post-commit application failures explain the saved state.
	*/
	"openclaw.setup.activate": async ({ params, respond }) => {
		if (!assertValidParams(params, validateSystemAgentSetupActivateParams, "openclaw.setup.activate", respond)) return;
		try {
			await runExclusiveSystemAgentSetupActivation(async () => {
				const runtime = {
					...defaultRuntime,
					exit: (code) => {
						throw new Error(`setup step exited with code ${String(code)}`);
					}
				};
				respond(true, await activateGatewaySetupInference({
					kind: params.kind,
					...params.agentId ? { agentId: params.agentId } : {},
					...params.modelRef !== void 0 ? { modelRef: params.modelRef } : {},
					...params.authChoice !== void 0 ? { authChoice: params.authChoice } : {},
					...params.apiKey !== void 0 ? { apiKey: params.apiKey } : {},
					...params.workspace !== void 0 ? { workspace: params.workspace } : {},
					surface: "gateway",
					runtime
				}), void 0);
			});
		} catch (error) {
			if (!(error instanceof SetupAdmissionBusyError)) throw error;
			respondSetupAdmissionBusy(respond);
		}
	},
	"openclaw.chat": async ({ params: rawParams, respond, client, context }) => {
		const params = sanitizeSystemAgentChatParams(rawParams);
		if (!assertValidParams(params, validateSystemAgentChatParams, "openclaw.chat", respond)) return;
		const inputError = getSystemAgentChatInputError(params);
		if (inputError) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, inputError));
			return;
		}
		await runSystemAgentGatewayTask(async () => {
			const sessions = context.systemAgentSessions;
			const sessionId = params.sessionId;
			await getSystemAgentSessionQueue(sessions).enqueue(sessionId, async () => {
				const ownerKey = resolveSystemAgentSessionOwnerKey({
					delegation: params.delegation,
					client
				});
				if (!ownerKey) {
					if (isGatewayClientProfilePending(client)) {
						respond(false, void 0, authenticatedProfileUnavailableError());
						return;
					}
					respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "OpenClaw caller identity unavailable."));
					return;
				}
				const boundSession = sessions.get(sessionId);
				if (boundSession && boundSession.ownerKey !== ownerKey) {
					respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "OpenClaw session belongs to another caller.", { details: buildSystemAgentSessionInvalidatedErrorDetails() }));
					return;
				}
				if (params.reset) {
					const existing = sessions.get(sessionId);
					appendTranscriptReset();
					sessions.delete(sessionId);
					if (existing?.pendingApproval) context.systemAgentApprovalManager?.expire(existing.pendingApproval.id, "session-reset");
					await existing?.engine.dispose();
				}
				let session = sessions.get(sessionId);
				if ((params.wizardAnswer !== void 0 || params.wizardCancel !== void 0) && !session) {
					respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, params.wizardCancel !== void 0 ? "No active OpenClaw chat session is awaiting that wizard cancel." : "No active OpenClaw chat session is awaiting that wizard answer.", { details: buildSystemAgentSessionInvalidatedErrorDetails() }));
					return;
				}
				let greetingAuditSequence;
				const welcomeOnly = params.wizardAnswer === void 0 && params.wizardCancel === void 0 && (params.message === void 0 || !params.message.trim());
				if (!session) {
					const { verifySystemAgentInferenceWithFallback } = await import("./inference-fallback-CkoS7pcB.js");
					const inference = await verifySystemAgentInferenceWithFallback({
						...params.delegation ? { requestingAgentId: params.delegation.agentId } : {},
						runtime: defaultRuntime
					});
					if (!inference.ok) {
						respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, `OpenClaw requires working inference: ${inference.error}`, { details: buildSystemAgentInferenceUnavailableErrorDetails() }));
						return;
					}
					const engine = new SystemAgentChatEngine({
						surface: "gateway",
						verifiedInference: inference.binding,
						operatorApprovalOnly: params.delegation !== void 0,
						...params.delegation?.agentId ? { requesterAgentId: params.delegation.agentId } : {}
					});
					if (!params.reset) engine.seedHistory(readTranscriptTail(SYSTEM_AGENT_SEED_HISTORY_LIMIT, { afterLastReset: true }).map(({ role, text }) => ({
						role,
						text
					})));
					const welcomeHistoryStart = engine.historyLength();
					let persistWelcome = !welcomeOnly;
					let welcome;
					let welcomeQuestion;
					try {
						if (params.welcomeVariant === "onboarding") {
							const onboardingWelcome = await buildOnboardingWelcome({ engine });
							welcome = onboardingWelcome.text;
							welcomeQuestion = onboardingWelcome.question;
						} else if (params.welcomeVariant === "new-agent") welcome = buildNewAgentWelcome({ engine });
						else {
							const overview = await engine.loadOverview();
							const facts = loadSystemAgentGreetingFacts();
							greetingAuditSequence = facts.auditSequence;
							persistWelcome ||= facts.recentExternalEdit;
							welcome = (await resolveSystemAgentGreeting({
								overview,
								facts,
								planner: (plannerParams) => engine.planGreeting(plannerParams),
								allowInference: welcomeOnly
							})).text;
							welcomeQuestion = buildSystemAgentGreetingQuestion(overview, facts);
							engine.noteAssistantMessage(welcome);
						}
					} catch (error) {
						await engine.dispose().catch(() => void 0);
						if (!isSystemAgentInferenceUnavailableError(error)) throw error;
						respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, error.message));
						return;
					}
					if (persistWelcome) persistEngineHistory(engine, welcomeHistoryStart);
					await evictOldestSession(sessions, context);
					session = {
						engine,
						welcome,
						...welcomeQuestion ? { welcomeQuestion } : {},
						...greetingAuditSequence !== void 0 ? { welcomeAuditSequence: greetingAuditSequence } : {},
						lastUsedAt: Date.now(),
						ownerKey
					};
					sessions.set(sessionId, session);
					if (welcomeOnly) {
						respond(true, {
							sessionId,
							reply: session.welcome,
							action: "none",
							...session.welcomeQuestion ? { question: session.welcomeQuestion } : {}
						}, void 0);
						acknowledgeDeliveredSystemAgentWelcome(session);
						return;
					}
				}
				session.lastUsedAt = Date.now();
				if (params.wizardAnswer === void 0 && params.wizardCancel === void 0 && (params.message === void 0 || !params.message.trim())) {
					respond(true, buildSystemAgentRejoinResult({
						sessionId,
						welcome: session.welcome,
						...session.welcomeQuestion ? { welcomeQuestion: session.welcomeQuestion } : {},
						engine: session.engine
					}), void 0);
					acknowledgeDeliveredSystemAgentWelcome(session);
					return;
				}
				const historyStart = session.engine.historyLength();
				let reply;
				try {
					const turnReply = await runSystemAgentChatInput({
						engine: session.engine,
						input: params
					});
					if (!turnReply) {
						respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "OpenClaw chat input is missing."));
						return;
					}
					reply = turnReply;
				} catch (error) {
					persistEngineHistory(session.engine, historyStart);
					if (error instanceof SystemAgentWizardAnswerError) {
						respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, error.message));
						return;
					}
					if (!isSystemAgentInferenceUnavailableError(error)) throw error;
					if (sessions.get(sessionId)?.engine === session.engine) sessions.delete(sessionId);
					try {
						await session.engine.dispose();
					} catch {}
					respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, error.message, { details: buildSystemAgentSessionInvalidatedErrorDetails() }));
					return;
				}
				persistEngineHistory(session.engine, historyStart);
				const delegation = params.delegation;
				let proposalId;
				if (delegation) {
					const proposal = session.engine.getPendingOperatorProposal();
					if (proposal) {
						const queuedApproval = queueDelegatedApproval({
							context,
							client,
							sessions,
							session,
							sessionId,
							delegation,
							proposal
						});
						proposalId = queuedApproval.id;
						if (queuedApproval.ownerApplication) {
							const appliedReply = await queuedApproval.ownerApplication;
							if (!appliedReply?.applied) throw new Error("delegated owner OpenClaw change was approved but not applied");
							reply = appliedReply;
							proposalId = void 0;
						}
					}
				}
				const pendingReply = proposalId ? buildDelegatedApprovalPendingReply({
					cfg: context.getRuntimeConfig?.() ?? {},
					manager: context.systemAgentApprovalManager,
					approvalId: proposalId
				}) : void 0;
				respond(true, buildSystemAgentChatResult({
					sessionId,
					reply: pendingReply ? {
						...reply,
						text: pendingReply
					} : reply,
					proposalId
				}), void 0);
			});
		});
	}
};
//#endregion
export { systemAgentHandlers };
