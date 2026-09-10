import { I as resolveTimestampMsToIsoString, o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { t as parseBoolean } from "./boolean-coercion-1HZNNkFl.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { y as resolveDefaultAgentId } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, T as isSubagentSessionKey } from "./session-key-CRjxKW0X.js";
import { n as normalizeAccountId } from "./account-id-CETVCrTz.js";
import { ct as validateCronGetParams, dt as validateCronRunParams, ft as validateCronRunsParams, gt as validateCronUpdateParams, ht as validateCronStatusParams, lt as validateCronListParams, mt as validateCronScratchSetParams, pt as validateCronScratchGetParams, st as validateCronAddParams, ut as validateCronRemoveParams, yo as validateWakeParams } from "./src-B9mb84px.js";
import { n as GatewayErrorDetailCodes, t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { a as isAgentHarnessSessionKey, d as resolveAgentHarnessSessionStoreEntryError, n as AGENT_HARNESS_SESSION_ID_LOCKED_MESSAGE, r as AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE } from "./agent-harness-session-key-CLRQddqz.js";
import { a as validateTargetProviderPrefix, t as resolveTargetPrefixedChannel } from "./channel-target-prefix-CCF7M7EQ.js";
import { t as cronStoreKey } from "./key-BBZ40bDq.js";
import { a as normalizeCronJobPatch, r as normalizeCronJobCreate } from "./pacing-DTlKwJhL.js";
import { n as createTrustedCronScheduledToolPolicy, t as createAccountCronScheduledToolPolicy } from "./scheduled-tool-policy-WcH3cpLk.js";
import { t as parseAbsoluteTimeMs } from "./parse-tlCSjrTr.js";
import { a as resolveCronDeliverySessionKey, r as isInvalidCronSessionTargetIdError, s as resolveCronSessionTargetSessionKey } from "./session-target-DJsUULzX.js";
import { n as cronJobUsesToolRuntime } from "./tools-allow-BSqnFkMT.js";
import { n as resolveNormalizedAccountEntry } from "./account-lookup-CvFhSs3G.js";
import { f as resolveOperatorSessionCreation, i as operatorSessionCap, t as authorizeGatewaySessionCreation } from "./operator-role-policy-B_VzZMic.js";
import { t as CRON_JOB_SCRATCH_MAX_BYTES } from "./scratch-contract-B-Laspel.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { i as loadGatewaySessionEntryReadOnly } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import { t as assertCronDeliveryInputNonBlankFields } from "./delivery-target-validation-D5dmr1ev.js";
import { t as consumeCronCreatorAuthorityGrant } from "./cron-creator-authority-grant-BWlTi1gr.js";
import { n as listConfiguredMessageChannels } from "./channel-selection-cs_ikGB-.js";
import { n as resolveCronDeliveryPlan, t as hasExplicitCronDeliveryTarget } from "./delivery-plan-BVGDwgsx.js";
import { D as toPublicCronJob, c as readCronTaskRunHistoryPage, f as resolveFailureAlert, o as isInvalidCronTaskRunJobIdError, r as applyJobPatch, t as resolveCronListSnapshotRevision } from "./list-snapshot-revision-B919xtbt.js";
import { t as resolveCronJobConfigRevision } from "./config-revision-B_P6W-B9.js";
import { n as resolveCronJobEffectiveAgentId } from "./agent-id-KnPjqPdM.js";
import { n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { r as hasActiveAgentRuntimeAuthority, t as assertActiveAgentRuntimeAuthority } from "./agent-runtime-authority-D5jGv3i3.js";
import { n as resolvedDeliveryTargetsExternalChannel, t as resolveDeliveryTarget } from "./delivery-target-JX6OFX49.js";
import { t as getGatewayProcessInstanceId } from "./process-instance-CwB3RMsz.js";
//#region src/cron/delivery-channel-validation.ts
function hasExplicitChannelConfigEntry(cfg) {
	const channels = cfg.channels;
	if (!channels || typeof channels !== "object" || Array.isArray(channels)) return false;
	return Object.entries(channels).some(([channelId, entry]) => {
		if (channelId === "defaults" || channelId === "modelByChannel") return false;
		return Boolean(entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length > 0);
	});
}
async function assertConfiguredAnnounceChannel(params) {
	if (params.channel === "last") return;
	const normalizedChannel = normalizeMessageChannel(params.channel);
	if (!normalizedChannel && params.field === "delivery.channel") return;
	const configuredChannels = (await listConfiguredMessageChannels(params.cfg)).toSorted();
	if (!normalizedChannel) {
		if (configuredChannels.length <= 1) return;
		throw new Error(`${params.field} is required when multiple channels are configured: ${configuredChannels.join(", ")}`);
	}
	if (configuredChannels.length === 0) {
		if (!hasExplicitChannelConfigEntry(params.cfg)) {
			if (!isDeliverableMessageChannel(normalizedChannel)) throw new Error(`${params.field} is not a known channel: ${normalizedChannel}`);
			return;
		}
		throw new Error(`${params.field} is not configured: ${normalizedChannel}`);
	}
	if (!configuredChannels.includes(normalizedChannel)) throw new Error(`${params.field} must be one of: ${configuredChannels.join(", ")}`);
}
/**
* Rejects an announce account the operator has turned off in config, so a job is
* not scheduled against a route its owner already disabled - the same late failure
* this file prevents for `channel` (see `assertValidCronFailureAlert`).
*
* Scoped to a matching `accounts.<id>.enabled: false` entry, and nothing else.
* Cron delivery ids are not always operator-typed (`delivery-context.ts` copies
* the current context account into inferred jobs); channel `isEnabled` adapters
* report unlisted or credential-suppressed accounts as not enabled; and a
* top-level `channels.<id>.enabled: false` is not uniformly channel-wide - twitch
* resolves named accounts from `accounts` alone. Only the account entry itself is
* an unambiguous statement about this route.
*/
function assertEnabledAnnounceAccount(params) {
	if (!params.accountId || !params.channel || params.channel === "last") return;
	const channel = normalizeMessageChannel(params.channel) ?? params.channel;
	const channelConfig = params.cfg.channels?.[channel];
	if (!channelConfig || typeof channelConfig !== "object" || Array.isArray(channelConfig)) return;
	const accounts = channelConfig.accounts;
	if (resolveNormalizedAccountEntry(accounts, params.accountId, normalizeAccountId)?.enabled !== false) return;
	throw new Error(`${params.field}: account "${params.accountId}" is disabled for channel ${channel}`);
}
function resolveAnnounceValidationChannel(params) {
	return params.channel && params.channel !== "last" ? params.channel : resolveTargetPrefixedChannel(params.to) ?? params.channel;
}
function assertCompatibleAnnounceTarget(params) {
	if (!params.channel || params.channel === "last") return;
	const error = validateTargetProviderPrefix({
		channel: params.channel,
		to: params.to
	});
	if (error) throw new Error(`${params.field}: ${error.message}`);
}
async function assertValidCronAnnounceDelivery(params) {
	if (params.delivery && (params.delivery.mode ?? "announce") === "announce") {
		assertCompatibleAnnounceTarget({
			channel: params.delivery.channel,
			to: params.delivery.to,
			field: "delivery.channel"
		});
		await assertConfiguredAnnounceChannel({
			cfg: params.cfg,
			channel: resolveAnnounceValidationChannel(params.delivery),
			field: "delivery.channel"
		});
		assertEnabledAnnounceAccount({
			cfg: params.cfg,
			channel: resolveAnnounceValidationChannel(params.delivery),
			accountId: params.delivery.accountId,
			field: "delivery.accountId"
		});
	}
	const failureDestination = params.delivery?.failureDestination;
	if (failureDestination && (failureDestination.mode ?? "announce") === "announce") {
		if (failureDestination.channel === void 0 && failureDestination.to === void 0 && failureDestination.accountId === void 0 && failureDestination.mode === void 0) return;
		assertCompatibleAnnounceTarget({
			channel: failureDestination.channel,
			to: failureDestination.to,
			field: "delivery.failureDestination.channel"
		});
		await assertConfiguredAnnounceChannel({
			cfg: params.cfg,
			channel: resolveAnnounceValidationChannel(failureDestination),
			field: "delivery.failureDestination.channel"
		});
	}
}
/**
* Validates the per-job `failureAlert` channel the same way announce delivery is
* validated. `failureAlert` is a distinct field from `delivery.failureDestination`
* (its own store columns and delivery path), so it needs its own check - otherwise
* an explicit unknown channel (e.g. a Slack `C0...` id passed to
* `--failure-alert-channel`) is stored and only fails later as `channel_not_found`.
*/
async function assertValidCronFailureAlert(params) {
	const failureAlert = resolveFailureAlert({ deps: { cronConfig: params.cfg.cron } }, {
		delivery: params.delivery,
		failureAlert: params.failureAlert
	});
	if (!failureAlert || failureAlert.mode === "webhook") return;
	assertCompatibleAnnounceTarget({
		channel: failureAlert.channel,
		to: failureAlert.to,
		field: "failureAlert.channel"
	});
	await assertConfiguredAnnounceChannel({
		cfg: params.cfg,
		channel: failureAlert.channel,
		field: "failureAlert.channel"
	});
}
async function assertValidCronCreateDelivery(cfg, job) {
	await assertValidCronAnnounceDelivery({
		cfg,
		delivery: job.delivery
	});
	await assertValidCronFailureAlert({
		cfg,
		failureAlert: job.failureAlert,
		delivery: job.delivery
	});
}
//#endregion
//#region src/cron/delivery-preview.ts
/** Builds dry-run cron delivery labels for CLI/UI list surfaces. */
function formatTarget(channel, to) {
	if (!channel) return "last";
	if (to) return `${channel}:${to}`;
	return channel;
}
function formatDeliveryDetail(params) {
	if (params.requestedChannel === "last" || !params.requestedChannel) {
		if (!params.resolved) return params.error ? `last -> no route, will fail-closed: ${params.error}` : "last -> no route, will fail-closed";
		return params.sessionKey ? `resolved from last, session ${params.sessionKey}` : "resolved from last, main session";
	}
	return params.resolved ? "explicit" : params.error ?? "unresolved";
}
/** Builds the user-visible cron delivery preview for one job without sending anything. */
async function resolveCronDeliveryPreview(params) {
	const plan = resolveCronDeliveryPlan(params.job);
	if (plan.mode === "none" && !hasExplicitCronDeliveryTarget(plan)) return {
		label: "not requested",
		detail: "not requested"
	};
	if (plan.mode === "webhook") return {
		label: plan.to ? `webhook:${plan.to}` : "webhook",
		detail: plan.to ? "webhook" : "webhook target missing"
	};
	const requestedChannel = plan.channel ?? "last";
	const agentId = params.job.agentId?.trim() || params.defaultAgentId || resolveDefaultAgentId(params.cfg);
	const deliverySessionKey = resolveCronDeliverySessionKey(params.job);
	const resolved = await resolveDeliveryTarget(params.cfg, agentId, {
		channel: requestedChannel,
		to: plan.to,
		threadId: plan.threadId,
		accountId: plan.accountId,
		sessionKey: deliverySessionKey
	}, { dryRun: true });
	if (!resolved.ok) {
		if (params.job.sessionTarget === "current" && plan.mode === "announce" && !resolvedDeliveryTargetsExternalChannel(resolved)) return {
			label: "announce -> current session",
			detail: "commits to this conversation (no external channel route)"
		};
		return {
			label: `${plan.mode} -> ${formatTarget(requestedChannel, plan.to ?? null)}`,
			detail: plan.mode === "none" ? `message tool target unresolved: ${resolved.error.message}` : formatDeliveryDetail({
				requestedChannel,
				resolved: false,
				sessionKey: deliverySessionKey,
				error: resolved.error.message
			})
		};
	}
	return {
		label: `${plan.mode} -> ${formatTarget(resolved.channel, resolved.to)}`,
		detail: formatDeliveryDetail({
			requestedChannel,
			resolved: true,
			sessionKey: deliverySessionKey
		})
	};
}
/** Builds cron delivery previews keyed by job id. */
async function resolveCronDeliveryPreviews(params) {
	const entries = await Promise.all(params.jobs.map(async (job) => [job.id, await resolveCronDeliveryPreview({
		cfg: params.cfg,
		defaultAgentId: params.defaultAgentId,
		job
	})]));
	return Object.fromEntries(entries);
}
//#endregion
//#region src/cron/validate-timestamp.ts
/** Validates user-supplied one-shot cron timestamps before scheduling. */
const ONE_MINUTE_MS = 6e4;
const TEN_YEARS_MS = 315576e6;
/**
* Validates one-shot cron timestamps with a small past grace window and far-future cap.
*/
function validateScheduleTimestamp(schedule, nowMs = Date.now()) {
	if (schedule.kind !== "at") return { ok: true };
	const atRaw = normalizeOptionalString(schedule.at) ?? "";
	const atMs = atRaw ? parseAbsoluteTimeMs(atRaw) : null;
	if (atMs === null || !Number.isFinite(atMs)) return {
		ok: false,
		message: `Invalid schedule.at: expected ISO-8601 timestamp (got ${schedule.at})`
	};
	const referenceNowMs = asDateTimestampMs(nowMs) ?? asDateTimestampMs(Date.now()) ?? 0;
	const diffMs = atMs - referenceNowMs;
	if (diffMs < -6e4) {
		const nowDate = resolveTimestampMsToIsoString(referenceNowMs);
		return {
			ok: false,
			message: `schedule.at is in the past: ${resolveTimestampMsToIsoString(atMs)} (${Math.floor(-diffMs / ONE_MINUTE_MS)} minutes ago). Current time: ${nowDate}`
		};
	}
	if (diffMs > TEN_YEARS_MS) return {
		ok: false,
		message: `schedule.at is too far in the future: ${resolveTimestampMsToIsoString(atMs)} (${Math.floor(diffMs / 315576e5)} years ahead). Maximum allowed: 10 years`
	};
	return { ok: true };
}
//#endregion
//#region src/gateway/server-methods/cron-caller-scope.ts
function readCronCallerScope(client) {
	const identity = client?.internal?.agentRuntimeIdentity;
	if (!identity?.agentId) return;
	const cronSelfManagementContext = identity.cronSelfManagementContext;
	const currentJobId = cronSelfManagementContext && Date.now() < cronSelfManagementContext.expiresAtMs ? cronSelfManagementContext.jobId.trim() || void 0 : void 0;
	const sourceChannel = identity.turnSourceChannel?.trim().toLowerCase();
	const callerOrigin = sourceChannel ? {
		kind: "external",
		channel: sourceChannel
	} : identity.turnSourceLocal === true ? { kind: "local" } : { kind: "unknown" };
	return {
		kind: "agentTool",
		agentId: normalizeAgentId(identity.agentId),
		sessionKey: identity.sessionKey?.trim() || void 0,
		accountId: normalizeAccountId(identity.turnSourceAccountId),
		currentJobId,
		...identity.cronToolsAllowCapture === "final-executable-surface" ? {
			toolsAllowProvenance: {
				version: 1,
				source: "final-executable-surface",
				callerOrigin
			},
			...identity.cronExecToolTarget?.host === "gateway" ? { toolsAllowExecTarget: {
				version: 1,
				...identity.cronExecToolTarget
			} } : {}
		} : {},
		...identity.cronCreatorAuthorityGrant ? { cronCreatorAuthorityGrant: identity.cronCreatorAuthorityGrant } : {}
	};
}
/** Converts the authenticated gateway caller into server-only scheduled authority provenance. */
function resolveCronScheduledToolPolicyForCaller(callerScope) {
	if (!callerScope) return createTrustedCronScheduledToolPolicy();
	const policy = callerScope.sessionKey ? createAccountCronScheduledToolPolicy({
		ownerSessionKey: callerScope.sessionKey,
		ownerAccountId: callerScope.accountId
	}) : void 0;
	if (!policy) throw new TypeError("agent-runtime cron mutations require an authenticated session identity");
	return policy;
}
function parseAgentIdFromSessionRef(value, fallbackAgentId) {
	const trimmed = value?.trim();
	return trimmed ? parseAgentSessionKey(trimmed)?.agentId ?? fallbackAgentId : void 0;
}
function parseAgentIdFromCronSessionTarget(value, fallbackAgentId) {
	const trimmed = value?.trim();
	return trimmed?.startsWith("session:") ? parseAgentIdFromSessionRef(trimmed.slice(8), fallbackAgentId) : void 0;
}
function cronJobSessionRefsMatchCaller(job, callerScope) {
	const sessionAgentId = parseAgentIdFromSessionRef(job.sessionKey, callerScope.agentId);
	if (sessionAgentId && normalizeAgentId(sessionAgentId) !== callerScope.agentId) return false;
	const sessionTargetAgentId = parseAgentIdFromCronSessionTarget(job.sessionTarget, callerScope.agentId);
	return !sessionTargetAgentId || normalizeAgentId(sessionTargetAgentId) === callerScope.agentId;
}
function resolveCronJobOwnerAgentId(job) {
	const ownerAgentId = job.owner?.agentId?.trim() || parseAgentIdFromSessionRef(job.owner?.sessionKey);
	return ownerAgentId ? normalizeAgentId(ownerAgentId) : void 0;
}
function isOperatorCommandCronJob(job) {
	return job.payload.kind === "command" || job.schedule.kind === "on-exit" || job.schedule.kind === "stream";
}
function cronJobScheduledAuthorityMatchesCaller(job, callerScope) {
	const policy = job.scheduledToolPolicy;
	if (!policy) return true;
	if (policy.mode === "trusted") return false;
	return callerScope.sessionKey?.trim() === policy.ownerSessionKey && job.owner?.sessionKey?.trim() === policy.ownerSessionKey && callerScope.accountId === normalizeAccountId(policy.ownerAccountId);
}
function cronJobMatchesCurrentJobCapability(params) {
	if (params.callerScope.currentJobId !== params.job.id || resolveCronJobEffectiveAgentId(params.job, params.defaultAgentId) !== params.callerScope.agentId) return false;
	const policy = params.job.scheduledToolPolicy;
	return policy?.mode !== "account" || normalizeAccountId(policy.ownerAccountId) === params.callerScope.accountId;
}
function cronJobMatchesCallerScope(params) {
	if (!params.callerScope) return true;
	if (isOperatorCommandCronJob(params.job)) return false;
	if (params.allowCurrentJob === true && cronJobMatchesCurrentJobCapability({
		job: params.job,
		callerScope: params.callerScope,
		defaultAgentId: params.defaultAgentId
	})) return true;
	if (!cronJobScheduledAuthorityMatchesCaller(params.job, params.callerScope)) return false;
	const ownerAccountId = params.job.owner?.accountId;
	if (ownerAccountId && normalizeAccountId(ownerAccountId) !== params.callerScope.accountId) return false;
	const ownerAgentId = resolveCronJobOwnerAgentId(params.job);
	if (ownerAgentId) {
		if (ownerAgentId !== params.callerScope.agentId) return false;
		return true;
	}
	if (resolveCronJobEffectiveAgentId(params.job, params.defaultAgentId) !== params.callerScope.agentId) return false;
	return cronJobSessionRefsMatchCaller(params.job, params.callerScope);
}
function cronJobMatchesDeclarationScope(params) {
	if (params.callerScope) return cronJobMatchesCallerScope(params);
	if (normalizeAccountId(params.job.owner?.accountId) !== normalizeAccountId(params.input.owner?.accountId)) return false;
	const inputOwnerSessionKey = params.input.owner?.sessionKey;
	const inputOwnerAgentId = params.input.owner?.agentId?.trim() || parseAgentIdFromSessionRef(inputOwnerSessionKey);
	if (inputOwnerSessionKey && !inputOwnerAgentId) return params.job.owner?.sessionKey === inputOwnerSessionKey;
	const inputAgentId = inputOwnerAgentId ? normalizeAgentId(inputOwnerAgentId) : resolveCronJobEffectiveAgentId(params.input, params.defaultAgentId);
	const jobOwnerAgentId = resolveCronJobOwnerAgentId(params.job);
	return (jobOwnerAgentId ? normalizeAgentId(jobOwnerAgentId) : resolveCronJobEffectiveAgentId(params.job, params.defaultAgentId)) === inputAgentId;
}
function cronCreateMatchesCallerScope(params) {
	if (!params.callerScope) return true;
	if (resolveCronJobEffectiveAgentId(params.job, params.defaultAgentId) !== params.callerScope.agentId) return false;
	const sessionAgentId = parseAgentIdFromSessionRef(params.job.sessionKey, params.callerScope.agentId);
	if (sessionAgentId && normalizeAgentId(sessionAgentId) !== params.callerScope.agentId) return false;
	const sessionTargetAgentId = parseAgentIdFromCronSessionTarget(params.job.sessionTarget, params.callerScope.agentId);
	return !sessionTargetAgentId || normalizeAgentId(sessionTargetAgentId) === params.callerScope.agentId;
}
function applyCronCreateCallerScopeDefault(job, callerScope) {
	if (!callerScope) return job;
	return {
		...job,
		agentId: job.agentId?.trim() ? job.agentId : callerScope.agentId,
		owner: {
			agentId: callerScope.agentId,
			...callerScope.sessionKey ? { sessionKey: callerScope.sessionKey } : {},
			accountId: callerScope.accountId
		}
	};
}
function cronPatchSessionRefsMatchCaller(patch, callerScope) {
	if (!callerScope) return true;
	const sessionAgentId = "sessionKey" in patch && typeof patch.sessionKey === "string" ? parseAgentIdFromSessionRef(patch.sessionKey, callerScope.agentId) : void 0;
	if (sessionAgentId && normalizeAgentId(sessionAgentId) !== callerScope.agentId) return false;
	const sessionTargetAgentId = "sessionTarget" in patch && typeof patch.sessionTarget === "string" ? parseAgentIdFromCronSessionTarget(patch.sessionTarget, callerScope.agentId) : void 0;
	return !sessionTargetAgentId || normalizeAgentId(sessionTargetAgentId) === callerScope.agentId;
}
//#endregion
//#region src/gateway/server-methods/cron-error-classification.ts
function isCronInvalidRequestError(err) {
	const message = formatErrorMessage(err);
	return message.startsWith("unknown cron job id:") || message.startsWith("cron job already exists:") || message.includes("cron job id must not be blank") || message.includes("cron declarationKey") || message.includes("cron displayName") || message.includes("cron announce delivery requires an explicit channel") || message.includes("cron script payload has a syntax error") || message.includes("cron trigger script has a syntax error") || message.includes("cron script payload must not be empty") || message.includes("cron script payloads cannot be combined") || message.includes("cron script payloads are disabled") || message.includes("cron triggers are disabled") || message.includes("cron triggers require") || message.includes("cron trigger every interval") || message.includes("cron job is missing sessionTarget") || message.includes("invalid cron sessionTarget session id") || message.includes("main cron jobs require payload.kind=\"systemEvent\"") || message.includes("isolated/current/session cron jobs require payload.kind=\"agentTurn\"") || message.includes("has no upcoming run time and would never fire") || message.includes("sessionTarget \"main\" is only valid for the default agent") || message.includes("cron.update payload.kind=\"systemEvent\" requires text") || message.includes("cron.update payload.kind=\"agentTurn\" requires message") || message.includes("cron webhook delivery requires") || message.includes("delivery.channel") || message.includes("delivery.accountId") || message.includes("delivery.failureDestination.channel") || message.includes("failureAlert.channel") || message.includes("cron completion destination webhook requires") || message.includes("cron failure destination webhook requires") || message.includes("cron channel delivery config is only supported") || message.includes("cron delivery.failureDestination is only supported");
}
//#endregion
//#region src/gateway/server-methods/cron-list-caller-scope.ts
const CRON_LIST_SCOPED_SNAPSHOT_MAX_ATTEMPTS = 3;
async function listCronPageForCallerScope({ callerScope, context, options }) {
	let stableScopedJobs;
	for (let attempt = 0; attempt < CRON_LIST_SCOPED_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
		const scopedJobs = [];
		let offset = 0;
		let snapshotRevision;
		let snapshotChanged = false;
		for (;;) {
			const sourcePage = await context.cron.listPage({
				...options,
				agentId: void 0,
				limit: 200,
				offset
			});
			if (snapshotRevision && sourcePage.snapshotRevision !== snapshotRevision) {
				snapshotChanged = true;
				break;
			}
			snapshotRevision = sourcePage.snapshotRevision;
			scopedJobs.push(...sourcePage.jobs.filter((job) => cronJobMatchesCallerScope({
				job,
				callerScope,
				defaultAgentId: context.cron.getDefaultAgentId(),
				allowCurrentJob: true
			})));
			if (!sourcePage.hasMore || sourcePage.nextOffset === null || sourcePage.nextOffset <= offset) break;
			offset = sourcePage.nextOffset;
		}
		if (!snapshotChanged && snapshotRevision) {
			stableScopedJobs = scopedJobs;
			break;
		}
	}
	if (!stableScopedJobs) throw new Error("cron.list changed repeatedly while applying caller scope");
	const total = stableScopedJobs.length;
	const pageOffset = Math.max(0, Math.min(total, Math.floor(options.offset ?? 0)));
	const defaultLimit = total === 0 ? 50 : total;
	const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? defaultLimit)));
	const jobs = stableScopedJobs.slice(pageOffset, pageOffset + limit);
	const nextOffset = pageOffset + jobs.length;
	return {
		jobs,
		snapshotRevision: resolveCronListSnapshotRevision(stableScopedJobs),
		total,
		offset: pageOffset,
		limit,
		hasMore: nextOffset < total,
		nextOffset: nextOffset < total ? nextOffset : null
	};
}
//#endregion
//#region src/gateway/server-methods/cron-run-log-filters.ts
function filterCronRunLogJobsByAgent(jobs, agentId, defaultAgentId) {
	if (!agentId) return [...jobs];
	const normalizedAgentId = normalizeAgentId(agentId);
	return jobs.filter((job) => resolveCronJobEffectiveAgentId(job, defaultAgentId) === normalizedAgentId);
}
function cronRunLogPageFilters(params) {
	return {
		limit: params.limit,
		offset: params.offset,
		statuses: params.statuses,
		status: params.status,
		runId: params.runId,
		deliveryStatuses: params.deliveryStatuses,
		deliveryStatus: params.deliveryStatus,
		query: params.query,
		sortDir: params.sortDir
	};
}
//#endregion
//#region src/gateway/server-methods/cron.ts
function resolveCronCreatorAuthorityCapture(callerScope) {
	const grant = callerScope?.cronCreatorAuthorityGrant;
	if (!grant) return;
	if (!callerScope.toolsAllowProvenance) throw new TypeError("cron creator authority grant is missing tool-surface provenance");
	return () => consumeCronCreatorAuthorityGrant(grant);
}
function resolveCronMutationCommitGuard(client, context, jobScope) {
	const validatesAuthority = client?.internal?.agentRuntimeIdentity && context.validateAgentRuntimeApprovalAuthority;
	if (!validatesAuthority && !jobScope?.callerScope) return;
	return () => {
		if (validatesAuthority) assertActiveAgentRuntimeAuthority(client, context);
		if (!jobScope?.callerScope) return;
		const callerScope = readCronCallerScope(client);
		const job = context.cron.getJob(jobScope.jobId);
		if (!callerScope || !job || jobScope.expectedConfigRevision !== void 0 && resolveCronJobConfigRevision(job) !== jobScope.expectedConfigRevision || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId(),
			allowCurrentJob: jobScope.allowCurrentJob
		})) throw new TypeError(`unknown cron job id: ${jobScope.jobId}`);
	};
}
function ensureActiveAgentRuntimeAuthority(params) {
	if (hasActiveAgentRuntimeAuthority(params.client, params.context)) return true;
	respondInvalidCronParams(params.respond, params.method, "agent runtime authority is no longer active");
	return false;
}
var CronJobConfigRevisionConflictError = class extends Error {
	constructor(expectedConfigRevision, actualConfigRevision) {
		super("cron job definition no longer matches the loaded version");
		this.expectedConfigRevision = expectedConfigRevision;
		this.actualConfigRevision = actualConfigRevision;
	}
};
function publicCronScratch(scratch) {
	if (!scratch) return null;
	return {
		content: scratch.content,
		revision: scratch.revision,
		updatedAtMs: scratch.updatedAtMs
	};
}
function cronJobReadView(job) {
	return {
		...toPublicCronJob(job),
		configRevision: resolveCronJobConfigRevision(job),
		nextRunAtMs: job.state.nextRunAtMs,
		lastRunAtMs: job.state.lastRunAtMs,
		lastRunStatus: job.state.lastRunStatus ?? job.state.lastStatus,
		lastRunError: job.state.lastError,
		lastDelivered: job.state.lastDelivered,
		lastDeliveryStatus: job.state.lastDeliveryStatus,
		lastDeliveryError: job.state.lastDeliveryError,
		deliverySuppressionReason: job.state.deliverySuppressionReason,
		lastFailureNotificationDelivered: job.state.lastFailureNotificationDelivered,
		lastFailureNotificationDeliveryStatus: job.state.lastFailureNotificationDeliveryStatus,
		lastFailureNotificationDeliveryError: job.state.lastFailureNotificationDeliveryError
	};
}
function cronAddPayloadWithDeliveryPreview(params) {
	const job = "job" in params.result ? params.result.job : params.result;
	if ("job" in params.result) return {
		created: params.result.created,
		...params.result.updated === void 0 ? {} : { updated: params.result.updated },
		job: cronJobReadView(job),
		deliveryPreview: params.deliveryPreview
	};
	return {
		...cronJobReadView(job),
		deliveryPreview: params.deliveryPreview
	};
}
function compactCronListJob(job) {
	return {
		id: job.id,
		name: job.name,
		...job.declarationKey ? { declarationKey: job.declarationKey } : {},
		...job.displayName ? { displayName: job.displayName } : {},
		...job.owner ? { owner: job.owner } : {},
		enabled: job.enabled,
		nextRunAtMs: job.state.nextRunAtMs ?? null,
		scheduleKind: job.schedule.kind,
		...job.trigger ? { trigger: true } : {},
		lastRunAtMs: job.state.lastRunAtMs ?? null,
		lastRunStatus: job.state.lastRunStatus ?? job.state.lastStatus ?? null,
		lastRunError: job.state.lastError ?? null,
		...job.state.lastDelivered !== void 0 ? { lastDelivered: job.state.lastDelivered } : {},
		...job.state.lastDeliveryStatus !== void 0 ? { lastDeliveryStatus: job.state.lastDeliveryStatus } : {},
		...job.state.lastDeliveryError !== void 0 ? { lastDeliveryError: job.state.lastDeliveryError } : {},
		...job.state.deliverySuppressionReason !== void 0 ? { deliverySuppressionReason: job.state.deliverySuppressionReason } : {},
		...job.state.lastFailureNotificationDelivered !== void 0 ? { lastFailureNotificationDelivered: job.state.lastFailureNotificationDelivered } : {},
		...job.state.lastFailureNotificationDeliveryStatus !== void 0 ? { lastFailureNotificationDeliveryStatus: job.state.lastFailureNotificationDeliveryStatus } : {},
		...job.state.lastFailureNotificationDeliveryError !== void 0 ? { lastFailureNotificationDeliveryError: job.state.lastFailureNotificationDeliveryError } : {}
	};
}
async function assertValidCronUpdatePatch(params) {
	const nextJob = structuredClone(params.currentJob);
	applyJobPatch(nextJob, params.patch, {
		defaultAgentId: params.defaultAgentId,
		cronConfig: params.cfg.cron
	});
	if ("agentId" in params.patch || "sessionTarget" in params.patch || "sessionKey" in params.patch) assertCronDoesNotTargetAgentHarness(nextJob);
	const effectiveDelivery = params.patch.delivery?.channel === null && nextJob.delivery && (nextJob.delivery.mode ?? "announce") === "announce" && nextJob.delivery.channel === void 0 && resolveTargetPrefixedChannel(nextJob.delivery.to) === void 0 ? {
		...nextJob.delivery,
		channel: "last"
	} : nextJob.delivery;
	if ("delivery" in params.patch) await assertValidCronAnnounceDelivery({
		cfg: params.cfg,
		delivery: effectiveDelivery
	});
	const failureAlertPatch = params.patch.failureAlert;
	const failureAlertRoutingPatched = failureAlertPatch && ("channel" in failureAlertPatch || "to" in failureAlertPatch || "mode" in failureAlertPatch);
	const currentAlert = resolveFailureAlert({ deps: { cronConfig: params.cfg.cron } }, params.currentJob);
	const nextAlert = resolveFailureAlert({ deps: { cronConfig: params.cfg.cron } }, {
		...nextJob,
		delivery: effectiveDelivery
	});
	const alertNewlyEnabled = currentAlert === null && nextAlert !== null;
	const alertRouteChanged = currentAlert?.mode !== nextAlert?.mode || currentAlert?.channel !== nextAlert?.channel || currentAlert?.to !== nextAlert?.to || currentAlert?.accountId !== nextAlert?.accountId || currentAlert?.threadId !== nextAlert?.threadId;
	if (failureAlertRoutingPatched || alertNewlyEnabled || alertRouteChanged && (params.patch.delivery !== void 0 || failureAlertPatch === null)) await assertValidCronFailureAlert({
		cfg: params.cfg,
		failureAlert: nextJob.failureAlert,
		delivery: effectiveDelivery
	});
	return nextJob;
}
function requiresExplicitAgentRuntimeToolsAllow(params) {
	return params.callerScope !== void 0 && cronJobUsesToolRuntime(params.job) && params.job.payload.toolsAllow === void 0;
}
function cronPatchTouchesToolRuntime(patch) {
	return patch.payload !== void 0 || Object.hasOwn(patch, "trigger");
}
function assertCronDoesNotTargetAgentHarness(input) {
	const targetSessionKey = resolveCronSessionTargetSessionKey(input.sessionTarget) ?? (input.sessionTarget === "current" ? input.sessionKey?.trim() : void 0);
	if (!targetSessionKey) return;
	const loaded = loadGatewaySessionEntryReadOnly(targetSessionKey, input.agentId?.trim() ? { agentId: input.agentId.trim() } : {});
	const reservedKey = isAgentHarnessSessionKey(targetSessionKey) || isAgentHarnessSessionKey(loaded.canonicalKey);
	if (loaded.entry?.modelSelectionLocked === true) throw new Error(reservedKey ? AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE : AGENT_HARNESS_SESSION_ID_LOCKED_MESSAGE);
	if (!reservedKey || loaded.entry) return;
	throw new Error(AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE);
}
function resolveCronJobId(params) {
	return normalizeOptionalString(params.id ?? params.jobId);
}
function respondInvalidCronParams(respond, method, reason) {
	respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid ${method} params: ${reason}`));
}
function respondMissingCronJobId(respond, method) {
	respondInvalidCronParams(respond, method, "missing id");
}
function respondCronJobNotFound(respond, jobId, options = {}) {
	const message = options.preserveCronGetWireMessage ? `cron job not found: ${jobId}. List automations and retry with a current job id.` : `Automation not found: ${jobId}. List automations and retry with a current job id.`;
	respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, message, { details: {
		code: GatewayErrorDetailCodes.CRON_JOB_NOT_FOUND,
		jobId
	} }));
}
function resolveCronSessionVisibility(client, cfg) {
	if (operatorSessionCap(client, cfg) !== "none") return;
	const entryFilter = createSessionListEntryFilter({
		client,
		cfg
	});
	if (!entryFilter) return;
	return (sessionKey, agentId) => {
		const loaded = loadGatewaySessionEntryReadOnly(sessionKey, agentId ? { agentId } : void 0);
		return loaded.entry !== void 0 && entryFilter(loaded.canonicalKey, loaded.entry);
	};
}
function cronJobIsVisible(job, visibility, defaultAgentId) {
	if (!visibility) return true;
	const sessionKey = job.owner?.sessionKey ?? resolveCronSessionTargetSessionKey(job.sessionTarget) ?? job.sessionKey;
	return Boolean(sessionKey && visibility(sessionKey, job.owner?.agentId ?? job.agentId ?? defaultAgentId));
}
/** Gateway request handlers for cron jobs and cron run-log access. */
const cronHandlers = {
	wake: async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateWakeParams, "wake", respond)) return;
		const p = params;
		const sessionKey = p.sessionKey?.trim() || void 0;
		const agentId = p.agentId?.trim() || void 0;
		const callerScope = readCronCallerScope(client);
		const requestedOwner = sessionKey ? resolveRequestedSessionAgentId(context.getRuntimeConfig(), sessionKey, agentId ?? callerScope?.agentId) : void 0;
		if (requestedOwner && !requestedOwner.ok) {
			respond(false, void 0, requestedOwner.error);
			return;
		}
		const resolvedAgentId = requestedOwner?.agentId ?? callerScope?.agentId ?? agentId;
		if (sessionKey && isAgentHarnessSessionKey(sessionKey)) {
			const loaded = loadGatewaySessionEntryReadOnly(sessionKey, resolvedAgentId ? { agentId: resolvedAgentId } : {});
			const harnessSessionError = loaded.entry ? resolveAgentHarnessSessionStoreEntryError(loaded.canonicalKey, loaded.entry) : AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE;
			if (harnessSessionError) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, harnessSessionError));
				return;
			}
		}
		if (sessionKey && isSubagentSessionKey(sessionKey)) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "wake sessionKey cannot target a subagent session"));
			return;
		}
		const sessionKeyAgentId = sessionKey ? parseAgentSessionKey(sessionKey)?.agentId?.trim().toLowerCase() : void 0;
		if (callerScope && agentId && normalizeAgentId(agentId) !== callerScope.agentId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "wake agentId outside caller scope"));
			return;
		}
		if (callerScope && sessionKeyAgentId && normalizeAgentId(sessionKeyAgentId) !== callerScope.agentId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "wake sessionKey outside caller scope"));
			return;
		}
		if (agentId && sessionKeyAgentId && agentId.toLowerCase() !== sessionKeyAgentId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "wake agentId contradicts the agent that owns sessionKey; pass a single canonical wake target"));
			return;
		}
		const wakeConfig = context.getRuntimeConfig();
		if (wakeConfig.gateway?.roles) {
			const knownWakeAgentId = resolvedAgentId ?? context.cron.getDefaultAgentId();
			const wakeAgent = knownWakeAgentId ? {
				ok: true,
				agentId: knownWakeAgentId
			} : resolveRequestedSessionAgentId(wakeConfig, sessionKey ?? "main");
			if (!wakeAgent.ok) {
				respond(false, void 0, wakeAgent.error);
				return;
			}
			const wakeAccessError = authorizeGatewaySessionCreation({
				cfg: wakeConfig,
				client,
				agentId: wakeAgent.agentId
			});
			if (wakeAccessError) {
				respond(false, void 0, wakeAccessError);
				return;
			}
		}
		await context.cron.prepareWake?.();
		if (!ensureActiveAgentRuntimeAuthority({
			client,
			context,
			method: "wake",
			respond
		})) return;
		respond(true, context.cron.wake({
			mode: p.mode,
			text: p.text,
			...sessionKey ? { sessionKey } : {},
			...resolvedAgentId ? { agentId: resolvedAgentId } : {}
		}), void 0);
	},
	"cron.list": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronListParams, "cron.list", respond)) return;
		const p = params;
		const callerScope = readCronCallerScope(client);
		const requestedAgentId = p.agentId ? normalizeAgentId(p.agentId) : void 0;
		if (callerScope && requestedAgentId && requestedAgentId !== callerScope.agentId) {
			respondInvalidCronParams(respond, "cron.list", "agentId outside caller scope");
			return;
		}
		const listOptions = {
			includeDisabled: p.includeDisabled,
			limit: p.limit,
			offset: p.offset,
			query: p.query,
			enabled: p.enabled,
			scheduleKind: p.scheduleKind,
			lastRunStatus: p.lastRunStatus,
			trigger: p.trigger,
			sortBy: p.sortBy,
			sortDir: p.sortDir,
			agentId: callerScope?.agentId ?? p.agentId
		};
		let page = callerScope ? await listCronPageForCallerScope({
			callerScope,
			context,
			options: listOptions
		}) : await context.cron.listPage(listOptions);
		const cronVisibility = resolveCronSessionVisibility(client, context.getRuntimeConfig());
		if (cronVisibility) {
			const visibleJobs = [];
			let sourceOffset = 0;
			for (;;) {
				const sourceOptions = {
					...listOptions,
					offset: sourceOffset,
					limit: 200
				};
				const sourcePage = callerScope ? await listCronPageForCallerScope({
					callerScope,
					context,
					options: sourceOptions
				}) : await context.cron.listPage(sourceOptions);
				visibleJobs.push(...sourcePage.jobs.filter((job) => cronJobIsVisible(job, cronVisibility, context.cron.getDefaultAgentId())));
				if (!sourcePage.hasMore || sourcePage.nextOffset === null) break;
				sourceOffset = sourcePage.nextOffset;
			}
			const total = visibleJobs.length;
			const offset = Math.max(0, Math.min(total, Math.floor(p.offset ?? 0)));
			const limit = Math.max(1, Math.min(200, Math.floor(p.limit ?? (total || 50))));
			const jobs = visibleJobs.slice(offset, offset + limit);
			const nextOffset = offset + jobs.length;
			page = {
				...page,
				jobs,
				snapshotRevision: resolveCronListSnapshotRevision(visibleJobs),
				total,
				offset,
				limit,
				hasMore: nextOffset < total,
				nextOffset: nextOffset < total ? nextOffset : null
			};
		}
		if (p.compact === true) {
			respond(true, {
				...page,
				jobs: page.jobs.map(compactCronListJob)
			}, void 0);
			return;
		}
		const jobs = page.jobs.map(cronJobReadView);
		if (p.includeDeliveryPreviews === false) {
			respond(true, {
				...page,
				jobs
			}, void 0);
			return;
		}
		const deliveryPreviews = await resolveCronDeliveryPreviews({
			cfg: context.getRuntimeConfig(),
			defaultAgentId: context.cron.getDefaultAgentId(),
			jobs: page.jobs
		});
		respond(true, {
			...page,
			jobs,
			deliveryPreviews
		}, void 0);
	},
	"cron.status": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateCronStatusParams, "cron.status", respond)) return;
		respond(true, await context.cron.status(), void 0);
	},
	"cron.get": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronGetParams, "cron.get", respond)) return;
		const jobId = resolveCronJobId(params);
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.get");
			return;
		}
		const callerScope = readCronCallerScope(client);
		const job = await context.cron.readJob(jobId);
		const cronVisibility = resolveCronSessionVisibility(client, context.getRuntimeConfig());
		if (!job || !cronJobIsVisible(job, cronVisibility, context.cron.getDefaultAgentId()) || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId(),
			allowCurrentJob: true
		})) {
			respondCronJobNotFound(respond, jobId, { preserveCronGetWireMessage: true });
			return;
		}
		respond(true, cronJobReadView(job), void 0);
	},
	"cron.scratch.get": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronScratchGetParams, "cron.scratch.get", respond)) return;
		const jobId = resolveCronJobId(params);
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.scratch.get");
			return;
		}
		const callerScope = readCronCallerScope(client);
		const job = await context.cron.readJob(jobId);
		if (!job || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		})) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		const state = await context.cron.readScratch(jobId);
		respond(true, {
			scratch: publicCronScratch(state.scratch),
			currentRevision: state.currentRevision,
			maxBytes: CRON_JOB_SCRATCH_MAX_BYTES
		}, void 0);
	},
	"cron.scratch.set": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronScratchSetParams, "cron.scratch.set", respond)) return;
		const p = params;
		const jobId = resolveCronJobId(p);
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.scratch.set");
			return;
		}
		const callerScope = readCronCallerScope(client);
		const job = await context.cron.readJob(jobId);
		if (!job || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		})) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		try {
			if (!ensureActiveAgentRuntimeAuthority({
				client,
				context,
				method: "cron.scratch.set",
				respond
			})) return;
			const commitGuard = resolveCronMutationCommitGuard(client, context, {
				callerScope,
				jobId
			});
			const result = await context.cron.writeScratch(jobId, {
				content: p.content,
				expectedRevision: p.expectedRevision,
				...commitGuard ? { commitGuard } : {}
			});
			if (!result.ok) {
				respond(true, result, void 0);
				return;
			}
			respond(true, {
				ok: true,
				scratch: publicCronScratch(result.scratch),
				currentRevision: result.currentRevision,
				maxBytes: CRON_JOB_SCRATCH_MAX_BYTES
			}, void 0);
		} catch (error) {
			respondInvalidCronParams(respond, "cron.scratch.set", formatErrorMessage(error));
		}
	},
	"cron.add": async ({ params, respond, context, client }) => {
		const rawParams = params;
		if (typeof rawParams?.declarationKey === "string" && rawParams.declarationKey.trim().length === 0) {
			respondInvalidCronParams(respond, "cron.add", "declarationKey must not be blank");
			return;
		}
		if (typeof rawParams?.displayName === "string" && rawParams.displayName.trim().length === 0) {
			respondInvalidCronParams(respond, "cron.add", "displayName must not be blank");
			return;
		}
		const hasEnabled = Boolean(rawParams && Object.hasOwn(rawParams, "enabled"));
		const parsedEnabled = hasEnabled ? parseBoolean(rawParams?.enabled) : void 0;
		if (hasEnabled && parsedEnabled === void 0) {
			respondInvalidCronParams(respond, "cron.add", "enabled must be a boolean");
			return;
		}
		const enabledExplicit = parsedEnabled !== void 0;
		const sessionKey = typeof params?.sessionKey === "string" ? params.sessionKey : void 0;
		let normalized;
		try {
			assertCronDeliveryInputNonBlankFields(params?.delivery);
			normalized = normalizeCronJobCreate(params, { sessionContext: { sessionKey } }) ?? params;
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.add params: ${formatErrorMessage(err)}`));
			return;
		}
		const candidate = normalized;
		if (!assertValidParams(candidate, validateCronAddParams, "cron.add", respond)) return;
		const callerScope = readCronCallerScope(client);
		const operatorActor = callerScope ? void 0 : resolveOperatorSessionCreation(client).actor;
		const creatorSession = callerScope?.sessionKey ? loadGatewaySessionEntryReadOnly(callerScope.sessionKey, { agentId: callerScope.agentId }).entry : void 0;
		const actor = operatorActor ?? creatorSession?.createdActor;
		const actorId = normalizeOptionalString(actor?.id);
		const createdActor = actor ? {
			...actor,
			...actorId ? { id: actorId } : {}
		} : void 0;
		let captureRuntimeAuthority;
		try {
			captureRuntimeAuthority = resolveCronCreatorAuthorityCapture(callerScope);
		} catch (err) {
			respondInvalidCronParams(respond, "cron.add", formatErrorMessage(err));
			return;
		}
		const assertMutationCurrent = resolveCronMutationCommitGuard(client, context);
		const selectionIdentity = JSON.stringify(creatorSession?.skillLibrarySelections);
		const commitGuard = () => {
			assertMutationCurrent?.();
			if (creatorSession && callerScope?.sessionKey) {
				const latest = loadGatewaySessionEntryReadOnly(callerScope.sessionKey, { agentId: callerScope.agentId }).entry;
				if (latest?.sessionId !== creatorSession.sessionId || latest.lifecycleRevision !== creatorSession.lifecycleRevision || JSON.stringify(latest.skillLibrarySelections) !== selectionIdentity) throw new Error("Creator session changed before scheduling; retry from the current turn.");
			}
		};
		const jobCreate = applyCronCreateCallerScopeDefault(candidate, callerScope);
		const cfg = context.getRuntimeConfig();
		try {
			assertCronDoesNotTargetAgentHarness(jobCreate);
		} catch (err) {
			respondInvalidCronParams(respond, "cron.add", formatErrorMessage(err));
			return;
		}
		if (!cronCreateMatchesCallerScope({
			job: jobCreate,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		})) {
			respondInvalidCronParams(respond, "cron.add", "job agentId outside caller scope");
			return;
		}
		if (requiresExplicitAgentRuntimeToolsAllow({
			job: jobCreate,
			callerScope
		})) {
			respondInvalidCronParams(respond, "cron.add", "agent-runtime tool jobs require an explicit payload.toolsAllow cap");
			return;
		}
		const timestampValidation = validateScheduleTimestamp(jobCreate.schedule);
		if (!timestampValidation.ok) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, timestampValidation.message));
			return;
		}
		try {
			await assertValidCronCreateDelivery(cfg, jobCreate);
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.add params: ${formatErrorMessage(err)}`));
			return;
		}
		const deliveryPreview = await resolveCronDeliveryPreview({
			cfg,
			defaultAgentId: context.cron.getDefaultAgentId(),
			job: jobCreate
		});
		let result;
		try {
			result = await context.cron.add(jobCreate, {
				enabledExplicit,
				...createdActor ? { createdActor } : {},
				...creatorSession?.skillLibrarySelections ? { skillLibrarySelections: creatorSession.skillLibrarySelections } : {},
				commitGuard,
				...captureRuntimeAuthority ? { captureRuntimeAuthority } : {},
				matchesExisting: (job) => cronJobMatchesDeclarationScope({
					job,
					input: jobCreate,
					callerScope,
					defaultAgentId: context.cron.getDefaultAgentId()
				}),
				...cronJobUsesToolRuntime(jobCreate) ? {
					scheduledToolPolicy: resolveCronScheduledToolPolicyForCaller(callerScope),
					...callerScope?.toolsAllowProvenance ? { toolsAllowProvenance: callerScope.toolsAllowProvenance } : {},
					...callerScope?.toolsAllowExecTarget ? { toolsAllowExecTarget: callerScope.toolsAllowExecTarget } : {}
				} : {}
			});
		} catch (err) {
			if (!(err instanceof TypeError) && !(err instanceof RangeError) && !isCronInvalidRequestError(err)) throw err;
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.add params: ${formatErrorMessage(err)}`));
			return;
		}
		const job = "job" in result ? result.job : result;
		context.logGateway.info("cron: job added", {
			jobId: job.id,
			declarationKey: job.declarationKey,
			schedule: jobCreate.schedule
		});
		respond(true, cronAddPayloadWithDeliveryPreview({
			result,
			deliveryPreview
		}), void 0);
	},
	"cron.update": async ({ params, respond, context, client }) => {
		let normalizedPatch;
		try {
			const rawPatch = params?.patch;
			const rawDisplayName = rawPatch && typeof rawPatch === "object" ? rawPatch.displayName : void 0;
			if (typeof rawDisplayName === "string" && rawDisplayName.trim().length === 0) throw new Error("displayName must not be blank");
			assertCronDeliveryInputNonBlankFields(rawPatch && typeof rawPatch === "object" ? rawPatch.delivery : void 0);
			normalizedPatch = normalizeCronJobPatch(rawPatch);
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.update params: ${formatErrorMessage(err)}`));
			return;
		}
		const candidate = normalizedPatch && typeof params === "object" && params !== null ? {
			...params,
			patch: normalizedPatch
		} : params;
		if (!assertValidParams(candidate, validateCronUpdateParams, "cron.update", respond)) return;
		if (!normalizedPatch) {
			respondInvalidCronParams(respond, "cron.update", "patch did not normalize");
			return;
		}
		const p = candidate;
		const callerScope = readCronCallerScope(client);
		let captureRuntimeAuthority;
		try {
			captureRuntimeAuthority = resolveCronCreatorAuthorityCapture(callerScope);
		} catch (err) {
			respondInvalidCronParams(respond, "cron.update", formatErrorMessage(err));
			return;
		}
		const commitGuard = resolveCronMutationCommitGuard(client, context);
		const jobId = resolveCronJobId(p);
		if (!jobId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.update params: missing id"));
			return;
		}
		const patch = normalizedPatch;
		const cfg = context.getRuntimeConfig();
		const currentJob = await context.cron.readJob(jobId);
		if (!currentJob || !cronJobMatchesCallerScope({
			job: currentJob,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		})) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		if (callerScope && "agentId" in patch) {
			respondInvalidCronParams(respond, "cron.update", "agentId cannot be changed by caller scope");
			return;
		}
		if (!cronPatchSessionRefsMatchCaller(patch, callerScope)) {
			respondInvalidCronParams(respond, "cron.update", "session target outside caller scope");
			return;
		}
		if (patch.schedule) {
			const timestampValidation = validateScheduleTimestamp(patch.schedule);
			if (!timestampValidation.ok) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, timestampValidation.message));
				return;
			}
		}
		try {
			const nextJob = await assertValidCronUpdatePatch({
				cfg,
				defaultAgentId: context.cron.getDefaultAgentId(),
				currentJob,
				patch
			});
			if (cronPatchTouchesToolRuntime(patch) && requiresExplicitAgentRuntimeToolsAllow({
				job: nextJob,
				callerScope
			})) throw new TypeError("agent-runtime tool jobs require an explicit payload.toolsAllow cap");
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.update params: ${formatErrorMessage(err)}`));
			return;
		}
		let job;
		try {
			job = await context.cron.updateWithPrecondition(jobId, patch, async (lockedJob) => {
				if (!cronJobMatchesCallerScope({
					job: lockedJob,
					callerScope,
					defaultAgentId: context.cron.getDefaultAgentId()
				})) throw new Error(`unknown cron job id: ${jobId}`);
				if (p.expectedConfigRevision !== void 0) {
					const actualConfigRevision = resolveCronJobConfigRevision(lockedJob);
					if (actualConfigRevision !== p.expectedConfigRevision) throw new CronJobConfigRevisionConflictError(p.expectedConfigRevision, actualConfigRevision);
				}
				const nextJob = await assertValidCronUpdatePatch({
					cfg,
					defaultAgentId: context.cron.getDefaultAgentId(),
					currentJob: lockedJob,
					patch
				});
				if (cronPatchTouchesToolRuntime(patch) && requiresExplicitAgentRuntimeToolsAllow({
					job: nextJob,
					callerScope
				})) throw new TypeError("agent-runtime tool jobs require an explicit payload.toolsAllow cap");
			}, cronPatchTouchesToolRuntime(patch) ? {
				scheduledToolPolicy: resolveCronScheduledToolPolicyForCaller(callerScope),
				...callerScope?.toolsAllowProvenance ? { toolsAllowProvenance: callerScope.toolsAllowProvenance } : {},
				...callerScope?.toolsAllowExecTarget ? { toolsAllowExecTarget: callerScope.toolsAllowExecTarget } : {},
				...commitGuard ? { commitGuard } : {},
				...captureRuntimeAuthority ? { captureRuntimeAuthority } : {}
			} : commitGuard || captureRuntimeAuthority ? {
				...commitGuard ? { commitGuard } : {},
				...captureRuntimeAuthority ? { captureRuntimeAuthority } : {}
			} : void 0);
		} catch (err) {
			if (err instanceof CronJobConfigRevisionConflictError) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "cron job definition no longer matches the loaded version; review the latest version before retrying", { details: {
					code: "CRON_JOB_CHANGED",
					expectedConfigRevision: err.expectedConfigRevision,
					actualConfigRevision: err.actualConfigRevision
				} }));
				return;
			}
			if (!(err instanceof TypeError) && !(err instanceof RangeError) && !isCronInvalidRequestError(err)) throw err;
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid cron.update params: ${formatErrorMessage(err)}`));
			return;
		}
		context.logGateway.info("cron: job updated", { jobId });
		respond(true, cronJobReadView(job), void 0);
	},
	"cron.remove": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronRemoveParams, "cron.remove", respond)) return;
		const jobId = resolveCronJobId(params);
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.remove");
			return;
		}
		const callerScope = readCronCallerScope(client);
		const job = await context.cron.readJob(jobId);
		if (!job || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId(),
			allowCurrentJob: true
		})) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		if (!ensureActiveAgentRuntimeAuthority({
			client,
			context,
			method: "cron.remove",
			respond
		})) return;
		const usesCurrentJobCapability = !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		});
		const expectedConfigRevision = usesCurrentJobCapability ? resolveCronJobConfigRevision(job) : void 0;
		let result;
		try {
			const commitGuard = resolveCronMutationCommitGuard(client, context, {
				callerScope,
				jobId,
				allowCurrentJob: usesCurrentJobCapability,
				expectedConfigRevision
			});
			result = commitGuard ? await context.cron.remove(jobId, { commitGuard }) : await context.cron.remove(jobId);
		} catch (error) {
			if (error instanceof TypeError) {
				respondInvalidCronParams(respond, "cron.remove", formatErrorMessage(error));
				return;
			}
			throw error;
		}
		if (!result.removed) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		context.logGateway.info("cron: job removed", { jobId });
		respond(true, result, void 0);
	},
	"cron.run": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronRunParams, "cron.run", respond)) return;
		const p = params;
		const callerScope = readCronCallerScope(client);
		const jobId = resolveCronJobId(p);
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.run");
			return;
		}
		const job = await context.cron.readJob(jobId);
		if (!job || !cronJobMatchesCallerScope({
			job,
			callerScope,
			defaultAgentId: context.cron.getDefaultAgentId()
		})) {
			respondCronJobNotFound(respond, jobId);
			return;
		}
		if (p.expectedProcessInstanceId && p.expectedProcessInstanceId !== getGatewayProcessInstanceId()) {
			respondInvalidCronParams(respond, "cron.run", "Gateway process changed after preflight");
			return;
		}
		if (!ensureActiveAgentRuntimeAuthority({
			client,
			context,
			method: "cron.run",
			respond
		})) return;
		let result;
		try {
			const commitGuard = resolveCronMutationCommitGuard(client, context, {
				callerScope,
				jobId
			});
			result = commitGuard ? await context.cron.enqueueRun(jobId, p.mode ?? "force", { commitGuard }) : await context.cron.enqueueRun(jobId, p.mode ?? "force");
		} catch (error) {
			if (error instanceof TypeError) {
				respondInvalidCronParams(respond, "cron.run", formatErrorMessage(error));
				return;
			}
			if (isInvalidCronSessionTargetIdError(error)) {
				respond(true, {
					ok: true,
					ran: false,
					reason: "invalid-spec"
				}, void 0);
				return;
			}
			if (isCronInvalidRequestError(error)) {
				respondInvalidCronParams(respond, "cron.run", formatErrorMessage(error));
				return;
			}
			throw error;
		}
		respond(true, {
			...result,
			processInstanceId: getGatewayProcessInstanceId()
		}, void 0);
	},
	"cron.runs": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateCronRunsParams, "cron.runs", respond)) return;
		const p = params;
		const callerScope = readCronCallerScope(client);
		const explicitScope = p.scope;
		const hasJobSelector = p.id !== void 0 || p.jobId !== void 0;
		const jobId = resolveCronJobId(p);
		const scope = explicitScope ?? (hasJobSelector ? "job" : "all");
		const cronVisibility = resolveCronSessionVisibility(client, context.getRuntimeConfig());
		if (scope === "all") {
			if (callerScope) {
				respondInvalidCronParams(respond, "cron.runs", "scope all is not allowed by caller scope");
				return;
			}
			const jobs = filterCronRunLogJobsByAgent(await context.cron.list({ includeDisabled: true }), p.agentId, context.cron.getDefaultAgentId()).filter((job) => cronJobIsVisible(job, cronVisibility, context.cron.getDefaultAgentId()));
			const jobNameById = Object.fromEntries(jobs.filter((job) => typeof job.id === "string" && typeof job.name === "string").map((job) => [job.id, job.name]));
			const visibleJobIds = new Set(jobs.map((job) => job.id));
			respond(true, readCronTaskRunHistoryPage({
				storeKey: cronStoreKey(context.cronStorePath),
				...cronRunLogPageFilters(p),
				agentId: p.agentId,
				jobNameById,
				entryFilter: cronVisibility ? (entry) => visibleJobIds.has(entry.jobId) && (!entry.sessionKey || cronVisibility(entry.sessionKey, p.agentId)) : void 0
			}), void 0);
			return;
		}
		if (!jobId) {
			respondMissingCronJobId(respond, "cron.runs");
			return;
		}
		try {
			const job = await context.cron.readJob(jobId);
			const defaultAgentId = context.cron.getDefaultAgentId();
			const matchedJob = job && filterCronRunLogJobsByAgent([job], p.agentId, defaultAgentId).length > 0 && cronJobIsVisible(job, cronVisibility, defaultAgentId) && cronJobMatchesCallerScope({
				job,
				callerScope,
				defaultAgentId,
				allowCurrentJob: true
			}) ? job : void 0;
			const storeKey = cronStoreKey(context.cronStorePath);
			if ((callerScope || p.agentId || cronVisibility) && !matchedJob || !job && readCronTaskRunHistoryPage({
				storeKey,
				jobId,
				limit: 1
			}).total === 0) {
				respondCronJobNotFound(respond, jobId);
				return;
			}
			const jobNameById = matchedJob && typeof matchedJob.name === "string" ? { [jobId]: matchedJob.name } : void 0;
			respond(true, readCronTaskRunHistoryPage({
				storeKey,
				jobId,
				...cronRunLogPageFilters(p),
				jobNameById,
				entryFilter: cronVisibility ? (entry) => !entry.sessionKey || cronVisibility(entry.sessionKey, matchedJob?.agentId) : void 0
			}), void 0);
		} catch (err) {
			if (!isInvalidCronTaskRunJobIdError(err)) throw err;
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.runs params: invalid id"));
		}
	}
};
//#endregion
export { cronHandlers as t };
