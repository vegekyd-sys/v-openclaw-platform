// versa-cron-shared-management-v1
import { R as timestampMsToIsoString, t as MAX_DATE_TIMESTAMP_MS } from "./number-coercion-CLj0HTDM.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { o as normalizeLowercaseStringOrEmpty, t as hasNonEmptyString } from "./string-coerce-CIXf7egm.js";
import { i as truncateWithMarker } from "./utf16-slice-D_ngcYKd.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import "./utils-D3A1hGii.js";
import { t as parseDurationMs } from "./parse-duration-CuuCHKpt.js";
import { t as isStringOption } from "./string-readers-e58-jh1A.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { r as CRON_TOOL_DISPLAY_SUMMARY } from "./tool-description-presets-C6exCTZo.js";
import { t as AUTOMATIONS_TOOL_NAME } from "./automations-tool-name-DBMZPbPL.js";
import { a as expandToolGroups, c as normalizeToolPolicyName } from "./tool-policy-shared-D_3SrG-g.js";
import { n as createToolPolicyMatcher } from "./tool-policy-match-DS7InkLt.js";
import { o as expandPolicyWithPluginGroups, r as buildPluginToolGroups } from "./tool-policy-De2653Mj.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import "./config-Cv60gBux.js";
import "./client-D8eBb67K.js";
import { t as GatewayClientRequestError } from "./request-error-BSFClQsA.js";
import { m as recordCronNextCheckProposal } from "./agent-run-registry-D84MDeZl.js";
import { d as readCanonicalCronListPage, f as resolveCronListPageNextOffset } from "./loader-UHuBXZwI.js";
import { t as jsonResult } from "./tool-results-BCM3fdVS.js";
import { d as readPositiveIntegerParam, h as readToolStringParam, l as readNonNegativeIntegerParam } from "./common-BhOX6DcU.js";
import { n as extractTextFromChatContent } from "./chat-content-DNdfeXZh.js";
import { a as normalizeCronJobPatch, r as normalizeCronJobCreate, t as parseCronPacingBounds } from "./pacing-DTlKwJhL.js";
import { s as setToolTerminalPresentation } from "./agent-tool-metadata-CkrU8K-F.js";
import { i as readCronScheduledToolProjection } from "./exec-tool-target-pinning-Cmt_TOc5.js";
import { a as withGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import { n as readGatewayCallOptions, t as callGatewayTool } from "./gateway-DVu5Urba.js";
import { a as optionalPositiveIntegerSchema, i as optionalNonNegativeIntegerSchema, o as optionalStringEnum, r as optionalFiniteNumberSchema, s as stringEnum } from "./typebox-Bvn7UKUB.js";
import { t as gatewayCallOptionSchemaProperties } from "./gateway-schema-BA2JRoHo.js";
import { m as resolveMainSessionAlias, p as resolveInternalSessionKey } from "./sessions-helpers-Bn_vDNby.js";
import { t as resolveCronCreationDelivery } from "./delivery-context-0ofuwS0X.js";
import { t as assertCronDeliveryInputNonBlankFields } from "./delivery-target-validation-D5dmr1ev.js";
import { t as normalizeHttpWebhookUrl } from "./webhook-url-AutetAqs.js";
import { Type } from "typebox";
//#region src/agents/tools/cron-tool-caller-scope.ts
function resolveCronToolCallerScope(opts, cfg) {
	const sessionKey = opts?.agentSessionKey?.trim();
	if (!sessionKey) return;
	return {
		kind: "agentTool",
		agentId: resolveSessionAgentId({
			sessionKey,
			config: cfg,
			agentId: opts?.agentId
		})
	};
}
function readCronToolAgentId(value) {
	return typeof value === "string" && value.trim() ? normalizeAgentId(value) : void 0;
}
function readAgentIdFromCronToolSessionRef(value) {
	return typeof value === "string" && value.trim() ? parseAgentSessionKey(value.trim())?.agentId : void 0;
}
function readAgentIdFromCronToolSessionTarget(value) {
	if (typeof value !== "string") return;
	const trimmed = value.trim();
	if (!trimmed.startsWith("session:")) return;
	return readAgentIdFromCronToolSessionRef(trimmed.slice(8));
}
function assertCronToolAgentFieldMatchesScope(params) {
	if (params.value === void 0) return;
	const agentId = readCronToolAgentId(params.value);
	if (agentId && agentId === params.callerScope.agentId) return;
	throw new Error(`${params.field} must match the calling agent`);
}
function assertCronToolSessionRefsMatchScope(value, callerScope) {
	const sessionAgentId = readAgentIdFromCronToolSessionRef(value.sessionKey);
	if (sessionAgentId && normalizeAgentId(sessionAgentId) !== callerScope.agentId) throw new Error("automations sessionKey must match the calling agent");
	const sessionTargetAgentId = readAgentIdFromCronToolSessionTarget(value.sessionTarget);
	if (sessionTargetAgentId && normalizeAgentId(sessionTargetAgentId) !== callerScope.agentId) throw new Error("automations sessionTarget must match the calling agent");
}
//#endregion
//#region src/agents/tools/cron-tool-canonicalize.ts
/**
* Cron tool argument canonicalization.
*
* Recovers flat or partial model/tool inputs into the structured cron job/patch shape.
*/
const CRON_SCHEDULE_KINDS$1 = [
	"at",
	"every",
	"cron",
	"on-exit",
	"stream"
];
const CRON_FLAT_PAYLOAD_KEYS = [
	"message",
	"text",
	"script",
	"model",
	"fallbacks",
	"toolsAllow",
	"thinking",
	"timeoutSeconds",
	"toolBudget",
	"lightContext",
	"allowUnsafeExternalContent"
];
const CRON_FLAT_SCHEDULE_KEYS = [
	"kind",
	"at",
	"atMs",
	"every",
	"everyMs",
	"anchorMs",
	"cron",
	"expr",
	"tz",
	"stagger",
	"staggerMs",
	"exact",
	"command",
	"cwd",
	"mode",
	"match",
	"batchMs",
	"maxBatchBytes"
];
const CRON_RECOVERABLE_OBJECT_KEYS = /* @__PURE__ */ new Set([
	"name",
	"declarationKey",
	"displayName",
	"owner",
	"schedule",
	"pacing",
	"trigger",
	"sessionTarget",
	"wakeMode",
	"payload",
	"delivery",
	"enabled",
	"description",
	"deleteAfterRun",
	"agentId",
	"sessionKey",
	"failureAlert",
	"namePayload",
	"scheduleKind",
	"sessionTargetName",
	...CRON_FLAT_PAYLOAD_KEYS,
	...CRON_FLAT_SCHEDULE_KEYS
]);
function isCronScheduleKind(value) {
	return isStringOption(value, CRON_SCHEDULE_KINDS$1);
}
function isCronPayloadKind(value) {
	return value === "systemEvent" || value === "agentTurn" || value === "script";
}
function isStringArrayOrNull(value) {
	return value === null || Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function moveDefinedField(params) {
	if (params.source[params.from] === void 0) return false;
	params.target[params.to ?? params.from] = params.source[params.from];
	delete params.source[params.from];
	return true;
}
function repairConcatenatedCronToolKeys(value) {
	if (!isRecord(value.payload) && isRecord(value.namePayload)) value.payload = { ...value.namePayload };
	const rawScheduleKind = value.scheduleKind;
	if (!isRecord(value.schedule)) {
		if (isRecord(rawScheduleKind)) value.schedule = { ...rawScheduleKind };
		else if (isCronScheduleKind(rawScheduleKind)) value.schedule = { kind: rawScheduleKind };
	} else if (isCronScheduleKind(rawScheduleKind) && !isCronScheduleKind(value.schedule.kind)) value.schedule = {
		...value.schedule,
		kind: rawScheduleKind
	};
	if (!hasNonEmptyString(value.name) && hasNonEmptyString(value.sessionTargetName)) value.name = value.sessionTargetName;
	delete value.namePayload;
	delete value.scheduleKind;
	delete value.sessionTargetName;
}
function setScheduleAtMs(schedule, value) {
	const atMs = typeof value === "number" ? value : Number(value);
	schedule.at = Number.isFinite(atMs) ? timestampMsToIsoString(Math.floor(atMs)) ?? value : value;
}
function canonicalizeCronToolSchedule(value) {
	const schedule = isRecord(value.schedule) ? { ...value.schedule } : {};
	let hasSchedule = isRecord(value.schedule);
	if (schedule.atMs !== void 0) {
		setScheduleAtMs(schedule, schedule.atMs);
		delete schedule.atMs;
		if (!isCronScheduleKind(schedule.kind)) schedule.kind = "at";
	}
	if (schedule.everyMs === void 0 && schedule.every !== void 0) {
		schedule.everyMs = schedule.every;
		delete schedule.every;
	}
	if (schedule.expr === void 0 && schedule.cron !== void 0) {
		schedule.expr = schedule.cron;
		delete schedule.cron;
	}
	if (schedule.staggerMs === void 0 && schedule.stagger !== void 0) {
		schedule.staggerMs = schedule.stagger;
		delete schedule.stagger;
	}
	if (schedule.exact === true && schedule.staggerMs === void 0) schedule.staggerMs = 0;
	delete schedule.exact;
	if (isCronScheduleKind(value.kind) && !isCronScheduleKind(schedule.kind)) {
		schedule.kind = value.kind;
		delete value.kind;
		hasSchedule = true;
	}
	if (moveDefinedField({
		source: value,
		target: schedule,
		from: "at"
	}) && !isCronScheduleKind(schedule.kind)) schedule.kind = "at";
	if (value.atMs !== void 0) {
		setScheduleAtMs(schedule, value.atMs);
		delete value.atMs;
		if (!isCronScheduleKind(schedule.kind)) schedule.kind = "at";
		hasSchedule = true;
	}
	if ((moveDefinedField({
		source: value,
		target: schedule,
		from: "everyMs"
	}) || moveDefinedField({
		source: value,
		target: schedule,
		from: "every",
		to: "everyMs"
	})) && !isCronScheduleKind(schedule.kind)) schedule.kind = "every";
	if ((moveDefinedField({
		source: value,
		target: schedule,
		from: "cron",
		to: "expr"
	}) || moveDefinedField({
		source: value,
		target: schedule,
		from: "expr"
	})) && !isCronScheduleKind(schedule.kind)) schedule.kind = "cron";
	if (moveDefinedField({
		source: value,
		target: schedule,
		from: "command"
	}) && !isCronScheduleKind(schedule.kind)) schedule.kind = "on-exit";
	for (const key of [
		"anchorMs",
		"tz",
		"staggerMs",
		"cwd",
		"mode",
		"match",
		"batchMs",
		"maxBatchBytes"
	]) hasSchedule = moveDefinedField({
		source: value,
		target: schedule,
		from: key
	}) || hasSchedule;
	hasSchedule = moveDefinedField({
		source: value,
		target: schedule,
		from: "stagger",
		to: "staggerMs"
	}) || hasSchedule;
	if (value.exact === true && schedule.staggerMs === void 0) {
		schedule.staggerMs = 0;
		hasSchedule = true;
	}
	delete value.exact;
	if (!isCronScheduleKind(schedule.kind)) {
		if (schedule.at !== void 0) schedule.kind = "at";
		else if (schedule.everyMs !== void 0) schedule.kind = "every";
		else if (schedule.expr !== void 0) schedule.kind = "cron";
		else if (schedule.command !== void 0) schedule.kind = "on-exit";
	}
	if (hasSchedule || Object.keys(schedule).length > 0) value.schedule = schedule;
}
function canonicalizeCronToolPayload(value) {
	const payload = isRecord(value.payload) ? { ...value.payload } : {};
	let hasPayload = isRecord(value.payload);
	for (const key of CRON_FLAT_PAYLOAD_KEYS) hasPayload = moveDefinedField({
		source: value,
		target: payload,
		from: key
	}) || hasPayload;
	if (isCronPayloadKind(value.kind) && !isCronPayloadKind(payload.kind)) {
		payload.kind = value.kind;
		delete value.kind;
		hasPayload = true;
	}
	if (!isCronPayloadKind(payload.kind)) {
		if (hasNonEmptyString(payload.script)) payload.kind = "script";
		else if (hasNonEmptyString(payload.message) || hasNonEmptyString(payload.model) || payload.model === null || hasNonEmptyString(payload.thinking) || typeof payload.timeoutSeconds === "number" || typeof payload.lightContext === "boolean" || typeof payload.allowUnsafeExternalContent === "boolean" || payload.fallbacks !== void 0 && isStringArrayOrNull(payload.fallbacks)) payload.kind = "agentTurn";
		else if (hasNonEmptyString(payload.text)) payload.kind = "systemEvent";
	}
	if (hasPayload || Object.keys(payload).length > 0) value.payload = payload;
}
/**
* Normalizes whitespace-padded cron object keys. Some tool-call
* extraction/serialization pipelines can produce keys with trailing spaces
* (e.g. "schedule " instead of "schedule"), which causes strict gateway
* validation to reject the job with "unexpected property" errors.
*
* Only recognized CRON_RECOVERABLE_OBJECT_KEYS are trimmed — arbitrary keys
* (including special ones like "__proto__") are never mutated.
*
* If both the padded and canonical form of a key exist (e.g. "schedule " and
* "schedule"), the padded key is preserved so strict gateway validation
* rejects the ambiguous input rather than silently picking one value.
*/
function repairPaddedCronKeys(value) {
	for (const key of Object.keys(value)) {
		const trimmed = key.trim();
		if (trimmed !== key && CRON_RECOVERABLE_OBJECT_KEYS.has(trimmed)) {
			if (!(trimmed in value)) {
				value[trimmed] = value[key];
				delete value[key];
			}
		}
	}
}
/** Converts model-friendly cron tool shorthands into the nested gateway job/patch shape. */
function canonicalizeCronToolObject(value) {
	const next = { ...isRecord(value.data) ? value.data : isRecord(value.job) ? value.job : value };
	repairPaddedCronKeys(next);
	repairConcatenatedCronToolKeys(next);
	canonicalizeCronToolSchedule(next);
	canonicalizeCronToolPayload(next);
	return next;
}
const CRON_CREATE_NULLABLE_TOP_LEVEL_KEYS = /* @__PURE__ */ new Set(["agentId", "sessionKey"]);
function deleteNullFields(record, keep) {
	for (const [key, entry] of Object.entries(record)) if (entry === null && !keep?.has(key)) delete record[key];
	else if (isRecord(entry)) deleteNullFields(entry);
}
/**
* Drops null-valued fields from a create job in place. The model-facing job
* schema is shared with update, where null means "clear this field"; on create
* there is nothing to clear, and the strict gateway cron.add contract rejects
* the nulls its update patch accepts.
*/
function stripCronCreateNullClears(value) {
	deleteNullFields(value, CRON_CREATE_NULLABLE_TOP_LEVEL_KEYS);
	return value;
}
/** Detects recovered update patches that contain no meaningful cron fields after normalization. */
function isEmptyRecoveredCronPatch(value) {
	if (!isRecord(value)) return true;
	const keys = Object.keys(value);
	return keys.length === 0 || keys.length === 1 && keys[0] === "payload" && isRecord(value.payload) && Object.keys(value.payload).length === 0;
}
/** Recovers cron job or patch fields that a model flattened beside the action arguments. */
function recoverCronObjectFromFlatParams(params) {
	const value = {};
	let found = false;
	for (const key of Object.keys(params)) if (CRON_RECOVERABLE_OBJECT_KEYS.has(key) && params[key] !== void 0) {
		value[key] = params[key];
		found = true;
	}
	return {
		found,
		value: canonicalizeCronToolObject(value)
	};
}
/** Checks whether a recovered flat object has enough schedule/payload signal to create a job. */
function hasCronCreateSignal(value) {
	return value.schedule !== void 0 || value.at !== void 0 || value.atMs !== void 0 || value.everyMs !== void 0 || value.cron !== void 0 || value.expr !== void 0 || value.payload !== void 0 || value.message !== void 0 || value.text !== void 0;
}
const CRON_ACTIONS = [
	"status",
	"list",
	"get",
	"add",
	"update",
	"remove",
	"run",
	"runs",
	"next_check",
	"wake"
];
const CRON_SCHEDULE_KINDS = [
	"at",
	"every",
	"cron",
	"stream"
];
const CRON_SCHEDULE_KINDS_TRIGGERS_DISABLED = [
	"at",
	"every",
	"cron"
];
const CRON_WAKE_MODES = ["now", "next-heartbeat"];
const CRON_PAYLOAD_KINDS = [
	"systemEvent",
	"agentTurn",
	"script"
];
const CRON_PAYLOAD_KINDS_TRIGGERS_DISABLED = ["systemEvent", "agentTurn"];
const CRON_DELIVERY_MODES = [
	"none",
	"announce",
	"webhook"
];
const CRON_RUN_MODES = ["due", "force"];
function nullableStringSchema(description) {
	return Type.Optional(Type.Union([Type.String(), Type.Null()], { description }));
}
function nullableStringArraySchema(description) {
	return Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()], { description }));
}
function deliveryStringSchema(description) {
	return nullableStringSchema(`${description}, or null to clear`);
}
function createCronScheduleSchema(params) {
	return Type.Optional(Type.Object({
		kind: optionalStringEnum(params.triggersEnabled ? CRON_SCHEDULE_KINDS : CRON_SCHEDULE_KINDS_TRIGGERS_DISABLED, { description: "Schedule kind" }),
		at: Type.Optional(Type.String({ description: "ISO-8601 time (kind=at)" })),
		everyMs: optionalPositiveIntegerSchema({
			description: "Interval ms (kind=every)",
			maximum: MAX_DATE_TIMESTAMP_MS
		}),
		anchorMs: optionalNonNegativeIntegerSchema({
			description: "Start anchor ms (kind=every)",
			maximum: MAX_DATE_TIMESTAMP_MS
		}),
		expr: Type.Optional(Type.String({ description: "Cron wall-time expr; never UTC-convert. Missing tz=Gateway local. Example \"0 18 * * *\", \"Asia/Shanghai\"." })),
		tz: Type.Optional(Type.String({ description: "IANA timezone for wall-clock fields; missing=Gateway host local timezone. Example \"Asia/Shanghai\"." })),
		staggerMs: optionalNonNegativeIntegerSchema({
			description: "Jitter ms (kind=cron)",
			maximum: MAX_DATE_TIMESTAMP_MS
		}),
		...params.triggersEnabled ? {
			command: Type.Optional(Type.Array(Type.String({ minLength: 1 }), {
				minItems: 1,
				description: "Supervised source argv (kind=stream; disabled when cron.triggers.enabled=false)"
			})),
			cwd: Type.Optional(Type.String({ description: "Working directory (kind=stream)" })),
			mode: optionalStringEnum(["line", "match"]),
			match: Type.Optional(Type.String({ description: "Regex source (stream match mode)" })),
			batchMs: optionalNonNegativeIntegerSchema(),
			maxBatchBytes: optionalNonNegativeIntegerSchema()
		} : {}
	}, { additionalProperties: true }));
}
function createCronPacingSchema() {
	const pacing = Type.Object({
		min: Type.Optional(Type.String({ description: "Minimum dynamic delay" })),
		max: Type.Optional(Type.String({ description: "Maximum dynamic delay" }))
	}, {
		additionalProperties: false,
		description: "Dynamic-cadence bounds; at least one of min or max is required"
	});
	return Type.Optional(Type.Union([pacing, Type.Null()]));
}
function assertCronPacingInput(value) {
	if (value === void 0 || value === null) return;
	if (!isRecord(value)) throw new Error("cron pacing must be an object");
	parseCronPacingBounds(value);
}
function createCronPayloadSchema(params) {
	return Type.Optional(Type.Object({
		kind: optionalStringEnum(params.triggersEnabled ? CRON_PAYLOAD_KINDS : CRON_PAYLOAD_KINDS_TRIGGERS_DISABLED, { description: "Payload kind" }),
		text: Type.Optional(Type.String({ description: "systemEvent text" })),
		message: Type.Optional(Type.String({ description: "agentTurn prompt" })),
		...params.triggersEnabled ? { script: Type.Optional(Type.String({ description: "Headless code-mode script" })) } : {},
		model: nullableStringSchema("Model override, or null to clear"),
		thinking: Type.Optional(Type.String({ description: "Thinking override" })),
		timeoutSeconds: optionalFiniteNumberSchema({ minimum: 0 }),
		...params.triggersEnabled ? { toolBudget: optionalPositiveIntegerSchema({ description: "Maximum script tool calls" }) } : {},
		lightContext: Type.Optional(Type.Boolean({ description: "Lightweight bootstrap context (skip full workspace context)" })),
		allowUnsafeExternalContent: Type.Optional(Type.Boolean({ description: "Allow untrusted external content in prompt" })),
		fallbacks: nullableStringArraySchema("Fallback models, or null to clear"),
		toolsAllow: nullableStringArraySchema("Allowed tool ids, or null to clear")
	}, { additionalProperties: true }));
}
function createCronTriggerSchema() {
	const trigger = Type.Object({
		script: Type.String({
			minLength: 1,
			maxLength: 65536
		}),
		once: Type.Optional(Type.Boolean())
	}, { additionalProperties: false });
	return Type.Optional(Type.Union([trigger, Type.Null()]));
}
function createCronDeliverySchema() {
	const failureDestinationObject = Type.Object({
		channel: deliveryStringSchema("Failure delivery channel"),
		to: deliveryStringSchema("Failure delivery target"),
		accountId: deliveryStringSchema("Failure delivery account"),
		mode: Type.Optional(Type.Union([
			Type.Literal("announce"),
			Type.Literal("webhook"),
			Type.Null()
		]))
	}, { additionalProperties: true });
	const completionDestinationObject = Type.Object({
		mode: Type.Literal("webhook"),
		to: Type.String({
			minLength: 1,
			description: "Completion webhook target; only valid with delivery.mode=announce"
		})
	}, { additionalProperties: true });
	return Type.Optional(Type.Object({
		mode: optionalStringEnum(CRON_DELIVERY_MODES, { description: "Delivery mode" }),
		channel: deliveryStringSchema("Delivery channel"),
		to: deliveryStringSchema("Delivery target"),
		threadId: Type.Optional(Type.Union([
			Type.String(),
			Type.Number(),
			Type.Null()
		], { description: "Thread/topic id" })),
		bestEffort: Type.Optional(Type.Boolean({ description: "Omitted/false requires requested delivery for successful completion; true lets successful execution complete and delete a one-shot despite failed/unknown delivery. Intentional silence succeeds in either mode." })),
		accountId: deliveryStringSchema("Delivery account"),
		failureDestination: Type.Optional(Type.Union([failureDestinationObject, Type.Null()], { description: "Failure-alert route override; required-delivery failures bypass after but share the execution-alert cooldown; null clears." })),
		completionDestination: Type.Optional(Type.Union([completionDestinationObject, Type.Null()], { description: "Completion webhook; requires delivery.mode=announce; null clears." }))
	}, { additionalProperties: true }));
}
function createCronFailureAlertSchema() {
	return Type.Optional(Type.Unsafe({
		type: "object",
		properties: {
			after: optionalPositiveIntegerSchema({ description: "Consecutive execution failures before alert; delivery failures bypass this threshold" }),
			channel: Type.Optional(Type.String({ description: "Alert channel" })),
			to: Type.Optional(Type.String({ description: "Alert target" })),
			cooldownMs: optionalNonNegativeIntegerSchema({ description: "Alert cooldown ms" }),
			includeSkipped: Type.Optional(Type.Boolean({ description: "Count skipped runs." })),
			mode: optionalStringEnum(["announce", "webhook"]),
			accountId: Type.Optional(Type.String())
		},
		additionalProperties: true,
		description: "Failure alert policy/route override. Route-backed jobs default to after=2 for execution failures and cooldownMs=3600000 for all failure alerts; false disables execution/delivery alerts but not the auto-disable safety notice."
	}));
}
function createCronToolSchema(options) {
	const triggersEnabled = options?.triggersEnabled !== false;
	const job = Type.Optional(Type.Object({
		name: Type.Optional(Type.String({ description: "Job name" })),
		declarationKey: Type.Optional(Type.String({
			description: "Idempotent declaration key (add only).",
			minLength: 1,
			maxLength: 200
		})),
		displayName: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()], { description: "Human-readable label; null clears it" })),
		owner: Type.Optional(Type.Object({
			agentId: Type.Optional(Type.String()),
			sessionKey: Type.Optional(Type.String())
		}, { additionalProperties: false })),
		schedule: createCronScheduleSchema({ triggersEnabled }),
		pacing: createCronPacingSchema(),
		...triggersEnabled ? { trigger: createCronTriggerSchema() } : {},
		sessionTarget: Type.Optional(Type.String({ description: "main | isolated | current (agentTurn default) | session:<id>" })),
		wakeMode: optionalStringEnum(CRON_WAKE_MODES, { description: "Wake timing" }),
		payload: createCronPayloadSchema({ triggersEnabled }),
		delivery: createCronDeliverySchema(),
		...!options?.agentSessionKey?.trim() ? { agentId: nullableStringSchema("Agent id, or null to clear it") } : {},
		description: Type.Optional(Type.String({ description: "Human description" })),
		enabled: Type.Optional(Type.Boolean()),
		deleteAfterRun: Type.Optional(Type.Boolean({ description: "Delete one-shot after successful completion: delivery confirmed, not requested, intentionally silent, or explicitly bestEffort. Failed/unknown required delivery retains it disabled." })),
		sessionKey: nullableStringSchema("Explicit session key, or null to clear it"),
		failureAlert: createCronFailureAlertSchema()
	}, {
		additionalProperties: true,
		description: "Job fields. action=\"add\": full job. action=\"update\": partial patch — only supplied fields change; null clears."
	}));
	return Type.Object({
		action: stringEnum(CRON_ACTIONS),
		...gatewayCallOptionSchemaProperties(),
		includeDisabled: Type.Optional(Type.Boolean()),
		limit: optionalPositiveIntegerSchema({
			maximum: 200,
			description: "Maximum jobs returned by action=\"list\""
		}),
		offset: optionalNonNegativeIntegerSchema({ description: "Job offset for action=\"list\"; use nextOffset to load the next page" }),
		job,
		jobId: Type.Optional(Type.String()),
		id: Type.Optional(Type.String()),
		in: Type.Optional(Type.String({ description: "Relative duration for action=\"next_check\" (for example, \"15m\")" })),
		text: Type.Optional(Type.String({ description: "systemEvent text for action=\"wake\"" })),
		mode: optionalStringEnum(CRON_WAKE_MODES, { description: "Wake mode for action=\"wake\" (default next-heartbeat)" }),
		runMode: optionalStringEnum(CRON_RUN_MODES, { description: "Run mode for action=\"run\": omitted defaults to \"due\"; use \"force\" to trigger now." }),
		contextMessages: Type.Optional(Type.Integer({
			minimum: 0,
			maximum: 10
		})),
		agentId: Type.Optional(Type.String({ description: "List filter for `action: \"list\"`; wake target override for `action: \"wake\"` (defaults to the calling agent when omitted on wake)" })),
		sessionKey: Type.Optional(Type.String({ description: "Wake target override for `action: \"wake\"`: route the event to another session owned by the calling agent. Defaults to the resolved calling-session key when omitted." }))
	}, { additionalProperties: true });
}
//#endregion
//#region src/agents/tools/cron-tool-context.ts
/** Reminder-context projection for cron tool job creation. */
const REMINDER_CONTEXT_PER_MESSAGE_MAX = 220;
const REMINDER_CONTEXT_TOTAL_MAX = 700;
const REMINDER_CONTEXT_MARKER = "\n\nRecent context:\n";
function stripExistingContext(text) {
	const index = text.indexOf(REMINDER_CONTEXT_MARKER);
	if (index === -1) return text;
	return text.slice(0, index).trim();
}
function truncateText(input, maxLen) {
	return truncateWithMarker(input, maxLen, {
		marker: "...",
		reserve: 3,
		trimEnd: true
	});
}
function extractMessageText(message) {
	const role = typeof message.role === "string" ? message.role : "";
	if (role !== "user" && role !== "assistant") return null;
	const text = extractTextFromChatContent(message.content);
	return text ? {
		role,
		text
	} : null;
}
async function buildReminderContextLines(params) {
	const maxMessages = Math.min(10, Math.max(0, Math.floor(params.contextMessages)));
	if (maxMessages <= 0) return [];
	const sessionKey = params.agentSessionKey?.trim();
	if (!sessionKey) return [];
	const cfg = getRuntimeConfig();
	const { mainKey, alias } = resolveMainSessionAlias(cfg);
	const resolvedKey = resolveInternalSessionKey({
		key: sessionKey,
		alias,
		mainKey
	});
	try {
		const res = await params.callGatewayTool("chat.history", params.gatewayOpts, {
			sessionKey: resolvedKey,
			agentId: params.agentId,
			limit: maxMessages
		});
		const recent = (Array.isArray(res?.messages) ? res.messages : []).map((msg) => extractMessageText(msg)).filter((msg) => Boolean(msg)).slice(-maxMessages);
		if (recent.length === 0) return [];
		const lines = [];
		let total = 0;
		for (const entry of recent) {
			const line = `- ${entry.role === "user" ? "User" : "Assistant"}: ${truncateText(entry.text, REMINDER_CONTEXT_PER_MESSAGE_MAX)}`;
			total += line.length;
			if (total > REMINDER_CONTEXT_TOTAL_MAX) break;
			lines.push(line);
		}
		return lines;
	} catch {
		return [];
	}
}
//#endregion
//#region src/agents/tools/cron-tool-creator-cap.ts
const CRON_CREATOR_AUTHORITY_RECOVERY_MESSAGE = "Retry from a fresh authenticated direct-local operator turn, or create/edit via the CLI or Gateway with an explicit finite toolsAllow list containing only currently visible tools; no automation changes were saved.";
const INCOMPLETE_CRON_CREATOR_AUTHORITY_MESSAGE = `Configured MCP authority is unavailable because this turn did not capture the complete model-callable tool surface. ${CRON_CREATOR_AUTHORITY_RECOVERY_MESSAGE}`;
/** No capture marker means this runtime has no deferred configured-MCP surface. */
function isCronCreatorToolCaptureComplete(captureRef) {
	return captureRef === void 0 || captureRef.value?.source === "final-executable-surface";
}
function assertInheritedCronToolCaptureReady(value, captureRef) {
	if ((isRecord(value) && isRecord(value.payload) ? value.payload : void 0)?.toolsAllowIsDefault !== true || isCronCreatorToolCaptureComplete(captureRef)) return;
	throw new Error(INCOMPLETE_CRON_CREATOR_AUTHORITY_MESSAGE);
}
function replaceWithEffectiveCronCreatorToolAllowlist(target, tools, toolMeta) {
	target.length = 0;
	const indexByName = /* @__PURE__ */ new Map();
	for (const tool of tools) {
		const projection = readCronScheduledToolProjection(tool);
		const name = normalizeToolPolicyName(projection ? projection.targetTool : tool.name);
		if (!name) continue;
		const aliasName = projection ? normalizeToolPolicyName(tool.name) : void 0;
		const existingIndex = indexByName.get(name);
		const existing = existingIndex === void 0 ? void 0 : target[existingIndex];
		if (existing !== void 0) {
			if (typeof existing === "string") continue;
			if (aliasName && !existing.aliasName) existing.aliasName = aliasName;
			if (existing.execTarget && !projection?.execTarget) delete existing.execTarget;
			else if (existing.execTarget?.ask === "always" && projection?.execTarget?.ask !== "always") delete existing.execTarget.ask;
			continue;
		}
		const meta = toolMeta?.(tool);
		const pluginId = typeof meta?.pluginId === "string" ? normalizeToolPolicyName(meta.pluginId) : void 0;
		indexByName.set(name, target.length);
		target.push({
			name,
			...pluginId ? { pluginId } : {},
			...aliasName && aliasName !== name ? { aliasName } : {},
			...projection?.execTarget ? { execTarget: { ...projection.execTarget } } : {}
		});
	}
}
/** Records the creator cap only after every runtime policy and schema quarantine has run. */
function captureFinalEffectiveCronCreatorToolAllowlist(target, captureRef, tools, toolMeta) {
	replaceWithEffectiveCronCreatorToolAllowlist(target, tools, toolMeta);
	captureRef.value = {
		version: 1,
		source: "final-executable-surface"
	};
}
function normalizeCronToolsAllow(values) {
	const normalized = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of expandToolGroups([...values])) {
		const toolName = normalizeToolPolicyName(entry);
		if (!toolName || seen.has(toolName)) continue;
		seen.add(toolName);
		normalized.push(toolName);
	}
	return normalized;
}
function normalizeCronCreatorToolsAllow(values) {
	const normalized = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of values) {
		const name = normalizeToolPolicyName(typeof entry === "string" ? entry : entry.name);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const pluginId = typeof entry === "string" || typeof entry.pluginId !== "string" ? void 0 : normalizeToolPolicyName(entry.pluginId);
		const aliasName = typeof entry === "string" || typeof entry.aliasName !== "string" ? void 0 : normalizeToolPolicyName(entry.aliasName);
		const execTarget = typeof entry !== "string" && entry.execTarget?.host === "gateway" ? {
			host: "gateway",
			...entry.execTarget.ask === "always" ? { ask: "always" } : {}
		} : void 0;
		normalized.push({
			name,
			...pluginId ? { pluginId } : {},
			...aliasName && aliasName !== name ? { aliasName } : {},
			...execTarget ? { execTarget } : {}
		});
	}
	return normalized;
}
/** Restrict-only exec target present only when the creator's exec grant is host-pinned. */
function resolveCronCreatorExecToolTarget(entries) {
	const execEntry = normalizeCronCreatorToolsAllow(entries ?? []).find((tool) => tool.name === "exec");
	return execEntry?.execTarget ? { ...execEntry.execTarget } : void 0;
}
function hasCronTriggerScript(value) {
	return isRecord(value) && typeof value.script === "string" && value.script.trim().length > 0;
}
function classifyExplicitToolsAllow(payload) {
	if (!payload || !Object.hasOwn(payload, "toolsAllow")) return "absent";
	if (!Array.isArray(payload.toolsAllow)) return "resolved";
	const values = payload.toolsAllow.filter((entry) => typeof entry === "string");
	if (values.length === 0) return "empty";
	return values.some((entry) => {
		const normalized = normalizeToolPolicyName(entry);
		return normalized === "*" || normalized.startsWith("group:");
	}) ? "resolved" : "finite";
}
function explicitFiniteToolsNeedResolution(payload, creatorToolAllowlist) {
	if (classifyExplicitToolsAllow(payload) !== "finite") return false;
	const toolsAllow = payload?.toolsAllow;
	if (!Array.isArray(toolsAllow)) return false;
	const creatorNames = new Set(normalizeCronCreatorToolsAllow(creatorToolAllowlist ?? []).flatMap((tool) => tool.aliasName ? [tool.name, tool.aliasName] : [tool.name]));
	return normalizeCronToolsAllow(toolsAllow.filter((entry) => typeof entry === "string")).some((name) => !creatorNames.has(name));
}
/** Whether an add needs the creator's complete authority rather than an explicit empty cap. */
function cronCreateRequiresCreatorAuthority(value, creatorToolAllowlist) {
	if (!isRecord(value)) return false;
	const payload = isRecord(value.payload) ? value.payload : void 0;
	const explicitToolsAllow = classifyExplicitToolsAllow(payload);
	if (explicitToolsAllow === "empty") return false;
	if (explicitToolsAllow === "finite") return explicitFiniteToolsNeedResolution(payload, creatorToolAllowlist);
	return hasCronTriggerScript(value.trigger) || payload?.kind === "agentTurn" || payload?.kind === "script" || explicitToolsAllow === "resolved";
}
function capCronJobToolsAllow(params) {
	const writesToolsAllow = Object.hasOwn(params.payload, "toolsAllow");
	if (params.payload.kind !== "agentTurn" && params.payload.kind !== "script" && !hasCronTriggerScript(params.trigger) && !writesToolsAllow) return;
	const creatorToolsAllow = normalizeCronCreatorToolsAllow(params.creatorToolAllowlist);
	const creatorToolNames = creatorToolsAllow.map((tool) => tool.name);
	const requestedRaw = Object.hasOwn(params.payload, "toolsAllow") ? params.payload.toolsAllow : params.defaultToolsAllow;
	if (!Array.isArray(requestedRaw)) {
		params.payload.toolsAllow = creatorToolNames;
		params.payload.toolsAllowIsDefault = true;
		return;
	}
	const requestedToolsAllow = normalizeCronToolsAllow(requestedRaw.filter((entry) => typeof entry === "string"));
	if (requestedToolsAllow.includes("*")) {
		params.payload.toolsAllow = creatorToolNames;
		params.payload.toolsAllowIsDefault = true;
		return;
	}
	if (requestedToolsAllow.length === 0 || creatorToolsAllow.length === 0) {
		params.payload.toolsAllow = [];
		delete params.payload.toolsAllowIsDefault;
		return;
	}
	const pluginGroups = buildPluginToolGroups({
		tools: creatorToolsAllow,
		toolMeta: (tool) => tool.pluginId ? { pluginId: tool.pluginId } : void 0
	});
	const requestedPolicy = expandPolicyWithPluginGroups({ allow: requestedToolsAllow }, pluginGroups);
	const matches = createToolPolicyMatcher(requestedPolicy);
	params.payload.toolsAllow = creatorToolsAllow.filter((tool) => matches(tool.name) || tool.aliasName !== void 0 && matches(tool.aliasName)).map((tool) => tool.name);
	delete params.payload.toolsAllowIsDefault;
}
function capCronJobToolsAllowOnCreate(value, creatorToolAllowlist) {
	if (!isRecord(value) || !isRecord(value.payload)) return;
	if (!creatorToolAllowlist) return;
	capCronJobToolsAllow({
		payload: value.payload,
		trigger: value.trigger,
		creatorToolAllowlist
	});
}
function readCronPayloadKind(value) {
	return isRecord(value) && typeof value.kind === "string" ? value.kind : void 0;
}
/** Purely derives the agent-tool patch; current job state is requested only when required. */
function planCronJobUpdatePatch(params) {
	const patch = structuredClone(params.patch);
	const payload = isRecord(patch.payload) ? patch.payload : void 0;
	const explicitPayloadKind = readCronPayloadKind(payload);
	const explicitToolsAllow = classifyExplicitToolsAllow(payload);
	if (payload === void 0 && !Object.hasOwn(patch, "trigger")) return {
		kind: "ready",
		patch
	};
	if (explicitPayloadKind !== void 0 && explicitToolsAllow === "absent" && params.creatorAuthorityComplete !== false && !params.creatorToolAllowlist && !Object.hasOwn(patch, "trigger")) return {
		kind: "ready",
		patch
	};
	if (params.creatorAuthorityComplete === false && explicitFiniteToolsNeedResolution(payload, params.creatorToolAllowlist)) return { kind: "needs-creator-authority" };
	if (params.creatorToolAllowlist && (explicitToolsAllow === "empty" || explicitToolsAllow === "finite") && explicitPayloadKind !== void 0) {
		capCronJobToolsAllow({
			payload,
			trigger: patch.trigger,
			creatorToolAllowlist: params.creatorToolAllowlist
		});
		return {
			kind: "ready",
			patch
		};
	}
	if (!params.currentJob) return { kind: "needs-current-job" };
	const existingPayload = params.currentJob.payload;
	const existingPayloadRecord = isRecord(existingPayload) ? existingPayload : void 0;
	const existingPayloadKind = readCronPayloadKind(existingPayload);
	const payloadKind = explicitPayloadKind ?? readCronPayloadKind(existingPayload);
	if (payload && payloadKind !== void 0) {
		payload.kind = payloadKind;
		patch.payload = payload;
	}
	const trigger = Object.hasOwn(patch, "trigger") ? patch.trigger : params.currentJob.trigger;
	const startsToolPayload = explicitPayloadKind !== void 0 && explicitPayloadKind !== existingPayloadKind && (payloadKind === "agentTurn" || payloadKind === "script");
	const startsToolTrigger = Object.hasOwn(patch, "trigger") && hasCronTriggerScript(trigger) && !hasCronTriggerScript(params.currentJob.trigger);
	const reusesDefaultAuthority = explicitToolsAllow === "absent" && (startsToolPayload || startsToolTrigger) && (existingPayloadRecord?.toolsAllowIsDefault === true || !Array.isArray(existingPayloadRecord?.toolsAllow));
	const needsResolvedAuthority = explicitToolsAllow === "resolved" || reusesDefaultAuthority || explicitFiniteToolsNeedResolution(payload, params.creatorToolAllowlist);
	if (needsResolvedAuthority && params.creatorAuthorityComplete === false) return { kind: "needs-creator-authority" };
	if (!needsResolvedAuthority && (explicitToolsAllow === "empty" || explicitToolsAllow === "finite") && params.creatorToolAllowlist) {
		capCronJobToolsAllow({
			payload,
			trigger,
			creatorToolAllowlist: params.creatorToolAllowlist
		});
		return {
			kind: "ready",
			patch
		};
	}
	if (!needsResolvedAuthority || !params.creatorToolAllowlist) return {
		kind: "ready",
		patch
	};
	const nextPayload = payload ?? {};
	if (payloadKind !== void 0) nextPayload.kind = payloadKind;
	patch.payload = nextPayload;
	capCronJobToolsAllow({
		payload: nextPayload,
		trigger,
		creatorToolAllowlist: params.creatorToolAllowlist,
		defaultToolsAllow: existingPayloadRecord && existingPayloadRecord.toolsAllowIsDefault !== true ? existingPayloadRecord.toolsAllow : void 0
	});
	return {
		kind: "ready",
		patch
	};
}
//#endregion
//#region src/agents/tools/cron-tool-self-list.ts
const CRON_SELF_LIST_MAX_PAGES = 50;
const CRON_SELF_LIST_MAX_SNAPSHOT_RESTARTS = 3;
function filterDeliveryPreviewsByJobId(previews, jobId) {
	if (!isRecord(previews)) return previews;
	return Object.hasOwn(previews, jobId) ? { [jobId]: previews[jobId] } : {};
}
function filterCronListResultToJobId(result, jobId) {
	if (!isRecord(result) || !Array.isArray(result.jobs)) throw new Error("cron.list returned an invalid inventory page");
	const jobs = result.jobs.filter((job) => isRecord(job) && job.id === jobId);
	const filteredResult = {
		...result,
		jobs,
		total: jobs.length,
		offset: 0,
		limit: jobs.length,
		hasMore: false,
		nextOffset: null,
		...Object.hasOwn(result, "deliveryPreviews") ? { deliveryPreviews: filterDeliveryPreviewsByJobId(result.deliveryPreviews, jobId) } : {}
	};
	delete filteredResult.snapshotRevision;
	return filteredResult;
}
function cronListPageHasJob(result, jobId) {
	return result.jobs.some((job) => isRecord(job) && job.id === jobId);
}
async function listCronSelfJob(params) {
	for (let restart = 0; restart <= CRON_SELF_LIST_MAX_SNAPSHOT_RESTARTS; restart += 1) {
		let offset = 0;
		let snapshotRevision;
		let total;
		let snapshotChanged = false;
		for (let pageNumber = 0; pageNumber < CRON_SELF_LIST_MAX_PAGES; pageNumber += 1) {
			const page = readCanonicalCronListPage(await params.requestPage({
				limit: params.pageSize,
				offset
			}), params.pageSize);
			if (snapshotRevision !== void 0 && page.snapshotRevision !== snapshotRevision || total !== void 0 && page.total !== total) {
				snapshotChanged = true;
				break;
			}
			snapshotRevision ??= page.snapshotRevision;
			total ??= page.total;
			const nextOffset = resolveCronListPageNextOffset(page, offset);
			if (cronListPageHasJob(page, params.jobId) || nextOffset === null) return filterCronListResultToJobId(page, params.jobId);
			offset = nextOffset;
		}
		if (!snapshotChanged) throw new Error("cron.list pagination exceeded maximum pages while reading current automation");
		if (restart === CRON_SELF_LIST_MAX_SNAPSHOT_RESTARTS) throw new Error("cron.list inventory changed repeatedly while reading current automation");
	}
	throw new Error("cron.list inventory changed repeatedly while reading current automation");
}
//#endregion
//#region src/agents/tools/cron-tool-write.ts
function assertNoCronShellExecution(value) {
	if (!isRecord(value)) return;
	const payload = isRecord(value.payload) ? value.payload : void 0;
	if (normalizeLowercaseStringOrEmpty(payload?.kind) === "command") throw new Error("automation command payloads cannot be created or edited through the agent automations tool; use the CLI or Gateway API.");
	if ((isRecord(value.schedule) ? value.schedule : void 0)?.kind === "on-exit") throw new Error("automation on-exit schedules cannot be created or edited through the agent automations tool; use the CLI or Gateway API.");
}
function assertCronCreatorAuthorityResolutionAvailable(params) {
	if (!params.required || params.resolveCreatorToolAuthority) return;
	if (params.unavailableReason === "queued-local-operator-configured-mcp" || !isCronCreatorToolCaptureComplete(params.creatorToolAllowlistCaptureRef)) throw new Error(params.unavailableReason === "queued-local-operator-configured-mcp" ? `Configured MCP authority is unavailable because this local operator turn was queued. ${CRON_CREATOR_AUTHORITY_RECOVERY_MESSAGE}` : INCOMPLETE_CRON_CREATOR_AUTHORITY_MESSAGE);
}
async function prepareCronJobUpdateForGateway(params) {
	params.operationSignal?.throwIfAborted();
	const initialPlan = planCronJobUpdatePatch({
		patch: params.patch,
		creatorToolAllowlist: params.creatorToolAllowlist,
		creatorAuthorityComplete: params.creatorAuthorityComplete
	});
	if (initialPlan.kind === "ready") return { patch: initialPlan.patch };
	const existing = await params.callGateway("cron.get", params.gatewayOpts, { id: params.id });
	params.operationSignal?.throwIfAborted();
	const existingRecord = isRecord(existing) ? existing : void 0;
	const expectedConfigRevision = existingRecord?.configRevision;
	if (typeof expectedConfigRevision !== "string" || expectedConfigRevision.length === 0) throw new Error("cron.get response is missing configRevision; restart the Gateway before retrying this update");
	let resolvedAuthority;
	let finalPlan = planCronJobUpdatePatch({
		patch: params.patch,
		creatorToolAllowlist: params.creatorToolAllowlist,
		currentJob: existingRecord,
		creatorAuthorityComplete: params.creatorAuthorityComplete
	});
	if (finalPlan.kind === "needs-creator-authority") {
		assertCronCreatorAuthorityResolutionAvailable({
			required: true,
			resolveCreatorToolAuthority: params.resolveCreatorToolAuthority,
			creatorToolAllowlistCaptureRef: params.creatorToolAllowlistCaptureRef,
			unavailableReason: params.creatorAuthorityUnavailableReason
		});
		if (!params.resolveCreatorToolAuthority) throw new Error("cron update requires complete creator tool authority");
		resolvedAuthority = await params.resolveCreatorToolAuthority({ signal: params.operationSignal });
		params.operationSignal?.throwIfAborted();
		finalPlan = planCronJobUpdatePatch({
			patch: params.patch,
			creatorToolAllowlist: resolvedAuthority.tools,
			currentJob: existingRecord,
			creatorAuthorityComplete: true
		});
	}
	if (finalPlan.kind !== "ready") throw new Error("cron update patch planning did not use the loaded job");
	return {
		patch: finalPlan.patch,
		expectedConfigRevision,
		resolvedAuthority
	};
}
function isCronJobConfigRevisionConflict(error) {
	if (!(error instanceof Error) || error.name !== "GatewayClientRequestError") return false;
	return (isRecord(error.details) ? error.details : void 0)?.code === "CRON_JOB_CHANGED";
}
async function updateCronJobFromAgentTool(params) {
	const callerIncludedPayloadPatch = isRecord(params.patch.payload);
	let creatorAuthorityPromise;
	const resolveCreatorToolAuthority = params.resolveCreatorToolAuthority ? (options) => creatorAuthorityPromise ??= params.resolveCreatorToolAuthority(options) : void 0;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		params.operationSignal?.throwIfAborted();
		const prepared = await prepareCronJobUpdateForGateway({
			...params,
			creatorAuthorityComplete: isCronCreatorToolCaptureComplete(params.creatorToolAllowlistCaptureRef) && resolveCreatorToolAuthority === void 0 && params.creatorAuthorityUnavailableReason === void 0,
			resolveCreatorToolAuthority,
			operationSignal: params.operationSignal
		});
		if (callerIncludedPayloadPatch) assertNoCronShellExecution(prepared.patch);
		const payload = isRecord(prepared.patch.payload) ? prepared.patch.payload : void 0;
		const captureSource = prepared.resolvedAuthority ? prepared.resolvedAuthority.provenance.source : params.creatorToolAllowlistCaptureRef?.value?.source;
		if (payload?.toolsAllowIsDefault === true && (prepared.resolvedAuthority || params.creatorToolAllowlistCaptureRef) && captureSource !== "final-executable-surface") throw new Error(INCOMPLETE_CRON_CREATOR_AUTHORITY_MESSAGE);
		if (prepared.resolvedAuthority && !params.withCreatorAuthorityProvenance) throw new Error("fresh configured MCP cron authority requires an authenticated local agent run");
		try {
			const write = async () => {
				params.operationSignal?.throwIfAborted();
				return await params.callGateway("cron.update", params.gatewayOpts, {
					id: params.id,
					patch: prepared.patch,
					...prepared.expectedConfigRevision ? { expectedConfigRevision: prepared.expectedConfigRevision } : {}
				});
			};
			return prepared.resolvedAuthority && params.withCreatorAuthorityProvenance ? await params.withCreatorAuthorityProvenance(prepared.resolvedAuthority, write) : await write();
		} catch (error) {
			if (attempt === 0 && isCronJobConfigRevisionConflict(error)) continue;
			throw error;
		}
	}
	throw new Error("cron update retry exhausted");
}
//#endregion
//#region src/agents/tools/cron-tool.ts
/**
* cron built-in tool.
*
* Manages scheduled jobs, wake/run actions, delivery context, and reminder-style payload normalization.
*/
function isMissingOrEmptyObject(value) {
	return !value || isRecord(value) && Object.keys(value).length === 0;
}
function readCronJobIdParam(params) {
	return readToolStringParam(params, "jobId") ?? readToolStringParam(params, "id");
}
const CRON_SELF_REMOVE_SCOPE_ERROR = "Automations tool is restricted to the current automation.";
function readCronSelfRemoveOnlyJobId(opts) {
	return opts?.selfRemoveOnlyJobId?.trim() || void 0;
}
function isCronSelfIntrospectionAction(action) {
	return action === "status" || action === "list";
}
function assertCronSelfRemoveScope(opts, action, params) {
	const selfRemoveOnlyJobId = readCronSelfRemoveOnlyJobId(opts);
	if (!selfRemoveOnlyJobId || isCronSelfIntrospectionAction(action)) return;
	if (action === "next_check") {
		const id = readCronJobIdParam(params);
		if (!id || id === selfRemoveOnlyJobId) return;
	}
	if (action === "get" || action === "remove" || action === "runs") {
		const id = readCronJobIdParam(params);
		if (id && id === selfRemoveOnlyJobId) return;
	}
	throw new Error(CRON_SELF_REMOVE_SCOPE_ERROR);
}
function filterCronStatusResultForSelfScope(result) {
	return { enabled: isRecord(result) && result.enabled === true };
}
function formatCronTerminalPresentation(params, result) {
	if (!isRecord(params) || !isRecord(result) || !isRecord(result.details)) return;
	switch (params.action) {
		case "status": return { text: `Automations scheduler status.\nEnabled: ${result.details.enabled === true ? "yes" : "no"}` };
		case "list": {
			const count = (typeof result.details.total === "number" && Number.isFinite(result.details.total) && result.details.total >= 0 ? Math.floor(result.details.total) : void 0) ?? (Array.isArray(result.details.jobs) ? result.details.jobs.length : void 0);
			return count === void 0 ? { text: "Automations listed." } : { text: `Automations listed.\nCount: ${count}` };
		}
		case "get": return { text: "Automation loaded." };
		case "runs": {
			const entries = Array.isArray(result.details.entries) ? result.details.entries.length : void 0;
			return entries === void 0 ? { text: "Automation run history loaded." } : { text: `Automation run history loaded.\nCount: ${entries}` };
		}
		default: return;
	}
}
function isOlderGatewayWithoutCompactCronList(error) {
	return error instanceof GatewayClientRequestError && error.gatewayCode === "INVALID_REQUEST" && error.message.includes("invalid cron.list params") && error.message.includes("unexpected property 'compact'");
}
function buildCronToolDescription(params) {
	const addFields = params.triggersEnabled ? "{name?,schedule,payload,sessionTarget?,pacing?,trigger?,delivery?,enabled?}" : "{name?,schedule,payload,sessionTarget?,pacing?,delivery?,enabled?}";
	const streamScheduleLine = params.triggersEnabled ? "\n- {kind:\"stream\",command:[argv],mode?:\"line\"|\"match\",match?}: fires on supervised process output; disabled only when cron.triggers.enabled=false." : "";
	const scriptPayloadLine = params.triggersEnabled ? "\n- script {kind:\"script\",script,timeoutSeconds?,toolBudget?}: main|isolated only; disabled only when cron.triggers.enabled=false." : "";
	const triggerSection = params.triggersEnabled ? `TRIGGER (condition watcher on every/cron): {script,once?}; available unless cron.triggers.enabled=false — if off, say so; never model-poll instead. Quiet headless check, no model; 30s/5 tool calls/16KB state. Read frozen trigger.state, return json({fire,message?,state?}) with NEW state; dedupe via state, never memory. fire:false saves state only. fire:true runs payload; message is that run's entire context — self-contained. Fire on failures/timeouts too; success-only watchers look healthy when broken. Script stays read-only; actions belong in payload. once:true disables after first fire. Code Mode: await exec({command:"..."}).` : `TRIGGERS DISABLED (cron.triggers.enabled=false): condition triggers, script payloads, and stream schedules are unavailable here. Omit trigger; use plain time-based schedules. If the user asks for a conditional watcher, say it is unsupported — never model-poll instead, and never silently create an unconditional job in its place.`;
	const silentWatcherCue = params.triggersEnabled ? " Silent watcher=>mode:\"none\"." : "";
	return `Gateway scheduler: reminders, delayed self-wakeups, loops, recurring work${params.triggersEnabled ? ", event watchers" : ""}. Never exec sleep/poll as timer.

ACTIONS: status | list [includeDisabled,limit?,offset?] (use nextOffset for the next page) | get jobId | add job | update jobId job (partial: only supplied fields change; null clears) | remove jobId | run jobId (runMode "force"=now) | runs jobId = history | next_check in:"30m" (own paced run only) | wake text mode?:"now"|"next-heartbeat"(default) nudges a caller-owned lane (sessionKey/agentId to pick another).

ADD: ${addFields}. Required: schedule+payload.

SCHEDULE:
- {kind:"at",at:"ISO-8601"} one-shot; no tz=UTC; auto-deletes after successful completion: delivery confirmed, not requested, intentionally silent, or explicitly bestEffort. Failed/unknown required delivery retains it disabled.
- {kind:"every",everyMs}.
- {kind:"cron",expr,tz?:"IANA"}: expr is wall time in tz; never pre-convert to UTC; no tz=gateway host local. 18:00 Shanghai => {expr:"0 18 * * *",tz:"Asia/Shanghai"}.${streamScheduleLine}

TARGET+PAYLOAD:
- "current" (agentTurn default) = this conversation: the run stays detached, reads bounded chat context, then commits its final visible assistant result to this conversation's durable history. Self-wakeup/"continue later"/loop = at|every + agentTurn + current.
- "isolated" = fresh detached session (shows in \`openclaw tasks\`); standalone background work.
- "main" = heartbeat lane; payload {kind:"systemEvent",text} (systemEvent default target).
- "session:<key>" = named session.
- agentTurn {kind:"agentTurn",message,model?,thinking?,timeoutSeconds?}; timeoutSeconds 0=none.
- Inherited configured MCP authority includes only model-callable tools; interactive app-view-only capabilities are excluded from headless jobs.${scriptPayloadLine}

PACED LOOP: recurring job + pacing{min?,max?} durations ("15m","4h"; at least one). Inside its run, job calls next_check in:"<dur>" to set the next delay (clamped to bounds, measured from run end; failed runs keep normal backoff). Adaptive polling: tighten when active, back off when quiet.

${triggerSection}

DELIVERY {mode:"none"|"announce"|"webhook",channel?,to?,threadId?,bestEffort?,completionDestination?}: where detached run output goes. Omitted=announce (current=>canonical session commit, plus one normal channel send for external chats; isolated=>last route; set channel/to for a specific chat — no messaging tool inside the run). A current announce succeeds only after its history commit; WebChat observes that commit live and after reconnect without another user message.${silentWatcherCue} webhook posts finished-run event (successful empty summary is intentional silence, no POST) to URL in \`to\`. To keep announce delivery and also POST completion, use mode:"announce" with completionDestination:{mode:"webhook",to:"https://..."}.

FAILURE ALERTS: jobs with a failure route default to alerting after 2 consecutive execution failures with a 1h cooldown. Route order: job failureAlert fields, delivery.failureDestination over global cron.failureAlert destination fields, then primary announce. failureAlert:false disables execution/delivery alerts, not the auto-disable safety notice; a failureAlert object activates/tunes. bestEffort suppresses inherited execution alerts. Required completion-delivery failure uses only an alternate route, bypasses after, and shares the execution-alert cooldown from the first failure; it does not increment the execution streak.

Job wakeMode (main jobs): "now"(default)|"next-heartbeat". Restricted automation-run sessions: self status/list/get/runs/remove + own next_check only. jobId canonical (id=compat). contextMessages 0-10 embeds recent chat lines into reminder text.`;
}
function createCronTool(opts, deps) {
	const callGateway = deps?.callGatewayTool ?? callGatewayTool;
	const triggersEnabled = opts?.config?.cron?.triggers?.enabled !== false;
	const tool = {
		label: "Automations",
		name: AUTOMATIONS_TOOL_NAME,
		displaySummary: CRON_TOOL_DISPLAY_SUMMARY,
		description: buildCronToolDescription({ triggersEnabled }),
		parameters: createCronToolSchema({
			agentSessionKey: opts?.agentSessionKey,
			triggersEnabled
		}),
		execute: async (_toolCallId, args, operationSignal) => {
			operationSignal?.throwIfAborted();
			const params = args;
			const action = readToolStringParam(params, "action", { required: true });
			assertCronSelfRemoveScope(opts, action, params);
			const parsedGatewayOpts = readGatewayCallOptions(params);
			const gatewayOpts = {
				...parsedGatewayOpts,
				timeoutMs: parsedGatewayOpts.timeoutMs ?? 6e4
			};
			const runtimeConfig = getRuntimeConfig();
			const callerScope = resolveCronToolCallerScope(opts, runtimeConfig);
			const creatorExecToolTarget = resolveCronCreatorExecToolTarget(opts?.creatorToolAllowlist);
			const callerIdentity = callerScope && opts?.agentSessionKey?.trim() ? {
				agentId: callerScope.agentId,
				sessionKey: opts.agentSessionKey.trim(),
				cronManagementPrincipal: opts.cronManagementPrincipal,
				turnSourceAccountId: opts.agentAccountId,
				...readCronSelfRemoveOnlyJobId(opts) ? { cronSelfManagementJobId: readCronSelfRemoveOnlyJobId(opts) } : {},
				...opts?.creatorToolAllowlistCaptureRef?.value?.version === 1 && opts.creatorToolAllowlistCaptureRef.value.source === "final-executable-surface" ? {
					cronToolsAllowCapture: "final-executable-surface",
					...creatorExecToolTarget ? { cronExecToolTarget: creatorExecToolTarget } : {}
				} : {}
			} : void 0;
			return await withGatewayToolCallerIdentity(callerIdentity, async () => {
				switch (action) {
					case "status": {
						const result = await callGateway("cron.status", gatewayOpts, {});
						return jsonResult(readCronSelfRemoveOnlyJobId(opts) ? filterCronStatusResultForSelfScope(result) : result);
					}
					case "list": {
						const selfRemoveOnlyJobId = readCronSelfRemoveOnlyJobId(opts);
						const explicitAgentId = readCronToolAgentId(params.agentId);
						if (callerScope && explicitAgentId && explicitAgentId !== callerScope.agentId) throw new Error("cron list agentId must match the calling agent");
						const listAgentId = callerScope?.agentId ?? explicitAgentId;
						const includeDisabled = Boolean(params.includeDisabled);
						const requestedLimit = selfRemoveOnlyJobId ? void 0 : readPositiveIntegerParam(params, "limit", {
							max: 200,
							message: `limit must be a positive integer no greater than 200`
						});
						const requestedOffset = selfRemoveOnlyJobId ? void 0 : readNonNegativeIntegerParam(params, "offset");
						let useCompactList = true;
						const requestListPage = async (pageParams) => {
							for (;;) try {
								return await callGateway("cron.list", gatewayOpts, {
									includeDisabled,
									...useCompactList ? { compact: true } : {},
									...listAgentId ? { agentId: listAgentId } : {},
									...pageParams
								});
							} catch (error) {
								if (!useCompactList || !isOlderGatewayWithoutCompactCronList(error)) throw error;
								useCompactList = false;
							}
						};
						if (!selfRemoveOnlyJobId) {
							const result = await requestListPage({
								...requestedLimit !== void 0 ? { limit: requestedLimit } : {},
								...requestedOffset !== void 0 ? { offset: requestedOffset } : {}
							});
							return jsonResult(result);
						}
						return jsonResult(await listCronSelfJob({
							jobId: selfRemoveOnlyJobId,
							pageSize: 200,
							requestPage: requestListPage
						}));
					}
					case "get": {
						const id = readCronJobIdParam(params);
						if (!id) throw new Error("jobId required (id accepted for backward compatibility)");
						return jsonResult(await callGateway("cron.get", gatewayOpts, { id }));
					}
					case "add": {
						if (isMissingOrEmptyObject(params.job)) {
							const synthetic = recoverCronObjectFromFlatParams(params);
							if (synthetic.found && hasCronCreateSignal(synthetic.value)) params.job = synthetic.value;
						}
						if (!params.job || typeof params.job !== "object") throw new Error("job required");
						const canonicalJob = stripCronCreateNullClears(canonicalizeCronToolObject(params.job));
						assertNoCronShellExecution(canonicalJob);
						assertCronDeliveryInputNonBlankFields(canonicalJob.delivery);
						assertCronPacingInput(canonicalJob.pacing);
						if (typeof canonicalJob.declarationKey === "string" && canonicalJob.declarationKey.trim().length === 0) throw new Error("declarationKey must be a non-empty string");
						if (typeof canonicalJob.displayName === "string" && canonicalJob.displayName.trim().length === 0) throw new Error("displayName must be a non-empty string");
						const enabledExplicit = typeof canonicalJob.enabled === "boolean";
						const job = normalizeCronJobCreate(canonicalJob, { sessionContext: { sessionKey: opts?.agentSessionKey } }) ?? canonicalJob;
						if (typeof job.declarationKey === "string" && job.declarationKey.length > 0 && !enabledExplicit) delete job.enabled;
						const requiresCreatorAuthority = cronCreateRequiresCreatorAuthority(job, opts?.creatorToolAllowlist);
						assertCronCreatorAuthorityResolutionAvailable({
							required: requiresCreatorAuthority,
							resolveCreatorToolAuthority: opts?.resolveCreatorToolAuthority,
							creatorToolAllowlistCaptureRef: opts?.creatorToolAllowlistCaptureRef,
							unavailableReason: opts?.creatorAuthorityUnavailableReason
						});
						const resolvedAuthority = requiresCreatorAuthority && opts?.resolveCreatorToolAuthority ? await opts.resolveCreatorToolAuthority({ signal: operationSignal }) : void 0;
						operationSignal?.throwIfAborted();
						const creatorToolAllowlist = resolvedAuthority?.tools ?? opts?.creatorToolAllowlist;
						const creatorToolAllowlistCaptureRef = resolvedAuthority ? { value: resolvedAuthority.provenance } : opts?.creatorToolAllowlistCaptureRef;
						capCronJobToolsAllowOnCreate(job, creatorToolAllowlist);
						assertInheritedCronToolCaptureReady(job, creatorToolAllowlistCaptureRef);
						if (job && typeof job === "object") {
							const { mainKey, alias } = resolveMainSessionAlias(runtimeConfig);
							const resolvedSessionKey = opts?.agentSessionKey ? resolveInternalSessionKey({
								key: opts.agentSessionKey,
								alias,
								mainKey
							}) : void 0;
							if (callerScope) {
								assertCronToolAgentFieldMatchesScope({
									value: job.agentId,
									field: "automation agentId",
									callerScope
								});
								job.agentId = callerScope.agentId;
								assertCronToolSessionRefsMatchScope(job, callerScope);
							}
							const sessionTarget = normalizeLowercaseStringOrEmpty(job.sessionTarget);
							if (!("sessionKey" in job) && resolvedSessionKey && sessionTarget !== "isolated") job.sessionKey = resolvedSessionKey;
						}
						if ((opts?.agentSessionKey || opts?.currentDeliveryContext) && job && typeof job === "object" && "payload" in job && job.payload?.kind === "agentTurn") {
							const deliveryValue = job.delivery;
							const delivery = isRecord(deliveryValue) ? deliveryValue : void 0;
							const modeRaw = typeof delivery?.mode === "string" ? delivery.mode : "";
							const mode = normalizeLowercaseStringOrEmpty(modeRaw);
							if (mode === "webhook") {
								const webhookUrl = normalizeHttpWebhookUrl(delivery?.to);
								if (!webhookUrl) throw new Error("delivery.mode=\"webhook\" requires delivery.to to be a valid http(s) URL");
								if (delivery) delivery.to = webhookUrl;
							}
							const hasTarget = typeof delivery?.channel === "string" && delivery.channel.trim() || typeof delivery?.to === "string" && delivery.to.trim();
							if ((deliveryValue == null || delivery) && (mode === "" || mode === "announce") && !hasTarget) {
								const inferred = resolveCronCreationDelivery({
									cfg: runtimeConfig,
									currentDeliveryContext: opts.currentDeliveryContext,
									agentSessionKey: opts.agentSessionKey
								});
								if (inferred) job.delivery = {
									...inferred,
									...delivery
								};
							}
						}
						const contextMessages = readNonNegativeIntegerParam(params, "contextMessages") ?? 0;
						if (job && typeof job === "object" && "payload" in job && job.payload?.kind === "systemEvent") {
							const payload = job.payload;
							if (typeof payload.text === "string" && payload.text.trim()) {
								const contextLines = await buildReminderContextLines({
									agentSessionKey: opts?.agentSessionKey,
									agentId: callerScope?.agentId,
									gatewayOpts,
									contextMessages,
									callGatewayTool: callGateway
								});
								if (contextLines.length > 0) payload.text = `${stripExistingContext(payload.text)}${REMINDER_CONTEXT_MARKER}${contextLines.join("\n")}`;
							}
						}
						const resolvedExecToolTarget = resolveCronCreatorExecToolTarget(resolvedAuthority?.tools);
						const writeCallerIdentity = resolvedAuthority && callerIdentity ? {
							...callerIdentity,
							cronToolsAllowCapture: "final-executable-surface",
							...resolvedExecToolTarget ? { cronExecToolTarget: resolvedExecToolTarget } : {},
							cronCreatorAuthorityGrant: resolvedAuthority.grant
						} : callerIdentity;
						if (resolvedAuthority && (!writeCallerIdentity || !("cronCreatorAuthorityGrant" in writeCallerIdentity))) throw new Error("fresh configured MCP cron authority requires an authenticated local agent run");
						return jsonResult(await withGatewayToolCallerIdentity(writeCallerIdentity, async () => await callGateway("cron.add", gatewayOpts, { ...job })));
					}
					case "update": {
						const id = readCronJobIdParam(params);
						if (!id) throw new Error("jobId required (id accepted for backward compatibility)");
						let recoveredFlatPatch = false;
						if (isMissingOrEmptyObject(params.job)) {
							const synthetic = recoverCronObjectFromFlatParams(params);
							if (synthetic.found) {
								params.job = synthetic.value;
								recoveredFlatPatch = true;
							}
						}
						if (!params.job || typeof params.job !== "object") throw new Error("job required");
						const canonicalPatch = canonicalizeCronToolObject(params.job);
						assertNoCronShellExecution(canonicalPatch);
						assertCronDeliveryInputNonBlankFields(canonicalPatch.delivery);
						assertCronPacingInput(canonicalPatch.pacing);
						if (typeof canonicalPatch.displayName === "string" && canonicalPatch.displayName.trim().length === 0) throw new Error("displayName must be a non-empty string or null");
						const patch = normalizeCronJobPatch(canonicalPatch) ?? canonicalPatch;
						if (recoveredFlatPatch && isEmptyRecoveredCronPatch(patch)) throw new Error("job required");
						if (callerScope && "agentId" in patch) throw new Error("automation patch agentId cannot be changed by the automations tool");
						if (callerScope) assertCronToolSessionRefsMatchScope(patch, callerScope);
						return jsonResult(await updateCronJobFromAgentTool({
							id,
							patch,
							creatorToolAllowlist: opts?.creatorToolAllowlist,
							creatorToolAllowlistCaptureRef: opts?.creatorToolAllowlistCaptureRef,
							resolveCreatorToolAuthority: opts?.resolveCreatorToolAuthority,
							withCreatorAuthorityProvenance: callerIdentity ? async (authority, run) => {
								const authorityExecToolTarget = resolveCronCreatorExecToolTarget(authority.tools);
								return await withGatewayToolCallerIdentity({
									...callerIdentity,
									cronToolsAllowCapture: "final-executable-surface",
									...authorityExecToolTarget ? { cronExecToolTarget: authorityExecToolTarget } : {},
									cronCreatorAuthorityGrant: authority.grant
								}, run);
							} : void 0,
							gatewayOpts,
							callGateway,
							operationSignal,
							creatorAuthorityUnavailableReason: opts?.creatorAuthorityUnavailableReason
						}));
					}
					case "remove": {
						const id = readCronJobIdParam(params);
						if (!id) throw new Error("jobId required (id accepted for backward compatibility)");
						return jsonResult(await callGateway("cron.remove", gatewayOpts, { id }));
					}
					case "run": {
						const id = readCronJobIdParam(params);
						if (!id) throw new Error("jobId required (id accepted for backward compatibility)");
						const runMode = params.runMode === "due" || params.runMode === "force" ? params.runMode : "due";
						return jsonResult(await callGateway("cron.run", gatewayOpts, {
							id,
							mode: runMode
						}));
					}
					case "runs": {
						const id = readCronJobIdParam(params);
						if (!id) throw new Error("jobId required (id accepted for backward compatibility)");
						return jsonResult(await callGateway("cron.runs", gatewayOpts, { id }));
					}
					case "next_check": {
						const jobId = readCronSelfRemoveOnlyJobId(opts);
						const runId = opts?.runId?.trim();
						if (!jobId || !runId) throw new Error("cron next_check is only available to the currently running job");
						const rawDuration = readToolStringParam(params, "in", { required: true });
						let delayMs;
						try {
							delayMs = parseDurationMs(rawDuration);
						} catch {
							throw new Error("cron next_check in must be a positive duration");
						}
						if (delayMs <= 0) throw new Error("cron next_check in must be a positive duration");
						recordCronNextCheckProposal(runId, jobId, delayMs);
						return jsonResult({
							ok: true,
							delayMs
						});
					}
					case "wake": {
						const text = readToolStringParam(params, "text", { required: true });
						const mode = params.mode === "now" || params.mode === "next-heartbeat" ? params.mode : "next-heartbeat";
						const cfg = getRuntimeConfig();
						const { mainKey, alias } = resolveMainSessionAlias(cfg);
						const explicitSessionKey = readToolStringParam(params, "sessionKey");
						const explicitAgentId = readToolStringParam(params, "agentId");
						if (callerScope) {
							assertCronToolAgentFieldMatchesScope({
								value: explicitAgentId,
								field: "wake agentId",
								callerScope
							});
							assertCronToolSessionRefsMatchScope({ sessionKey: explicitSessionKey }, callerScope);
						}
						const inferredSessionKey = opts?.agentSessionKey ? resolveInternalSessionKey({
							key: opts.agentSessionKey,
							alias,
							mainKey
						}) : void 0;
						const inferredAgentId = opts?.agentSessionKey ? resolveSessionAgentId({
							sessionKey: opts.agentSessionKey,
							config: cfg,
							agentId: opts.agentId
						}) : void 0;
						const sessionKey = explicitSessionKey ?? inferredSessionKey;
						const agentIdFromExplicitSessionKey = explicitSessionKey ? parseAgentSessionKey(explicitSessionKey)?.agentId : void 0;
						if (explicitAgentId && agentIdFromExplicitSessionKey && normalizeLowercaseStringOrEmpty(explicitAgentId) !== normalizeLowercaseStringOrEmpty(agentIdFromExplicitSessionKey)) throw new Error(`wake agentId "${explicitAgentId}" contradicts the agent that owns sessionKey ("${agentIdFromExplicitSessionKey}"); pass a single canonical wake target`);
						const agentId = callerScope?.agentId ?? explicitAgentId ?? (explicitSessionKey ? agentIdFromExplicitSessionKey : inferredAgentId);
						return jsonResult(await callGateway("wake", gatewayOpts, {
							mode,
							text,
							...sessionKey ? { sessionKey } : {},
							...agentId ? { agentId } : {}
						}, { expectFinal: false }));
					}
					default: throw new Error(`Unknown action: ${action}`);
				}
			});
		}
	};
	return setToolTerminalPresentation(tool, formatCronTerminalPresentation);
}
//#endregion
export { captureFinalEffectiveCronCreatorToolAllowlist as n, replaceWithEffectiveCronCreatorToolAllowlist as r, createCronTool as t };
