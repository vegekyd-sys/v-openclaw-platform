// v-openclaw91-secret-entry-v1
function vSecretEntryMirrorToFile(name, value) {
	try {
		if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name) || typeof value !== "string") return;
		const fs = process.getBuiltinModule("node:fs");
		const path = process.getBuiltinModule("node:path");
		const dir = path.join((process.env.OPENCLAW_STATE_DIR?.trim() || process.getBuiltinModule("node:path").join(process.env.OPENCLAW_HOME?.trim() || process.getBuiltinModule("node:os").homedir(), ".openclaw")), "secrets", "store");
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		const target = path.join(dir, name);
		const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
		fs.writeFileSync(temp, value, { mode: 0o600, flag: "wx" });
		fs.renameSync(temp, target);
	} catch (error) {
		console.warn(`[secrets] could not mirror ${name} to the state secrets directory: ${error?.code ?? "error"}`);
	}
}
import { n as ENV_SECRET_REF_ID_RE } from "./types.secrets-kC0nOetj.js";
import { i as registerSecretValueForRedaction } from "./secret-redaction-registry-BOLC6DkF.js";
import { Gn as validateQuestionGetParams, Ih as formatValidationErrors, Jn as validateQuestionResolveParams, Kn as validateQuestionListParams, Yn as validateQuestionWaitAnswerParams, qn as validateQuestionRequestParams } from "./src-B9mb84px.js";
import { f as SecretStoreValidationError } from "./secret-store-hidden-github-BLtcE53c.js";
import { i as listSecretStoreEntries } from "./secret-store-CZM8IBOD.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { i as resolveStoredSessionKeyForAgentStore } from "./session-store-key-DVtVp9hU.js";
import { p as registerActiveEmbeddedRunHumanInputWait } from "./run-state-DklzSa7D.js";
import { n as hasOperatorBoundary } from "./operator-role-policy-B_VzZMic.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { n as handleQuestionChannelResolved, t as handleQuestionChannelRequested } from "./question-channel-runtime-BhJ40GDw.js";
import { A as authorizeSessionSharing, P as isGatewayAdmin, R as resolveSessionSharingTarget, j as authorizeSessionSharingTarget, n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";
import { n as QuestionManagerError, r as QuestionManagerErrorCodes } from "./question-manager-C703axOs.js";
//#region src/gateway/server-methods/question.ts
const DEFAULT_QUESTION_TIMEOUT_MS = 9e5;
var QuestionRequestValidationError = class extends Error {};
function validationError(method, errors, respond) {
	respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid ${method} params: ${formatValidationErrors(errors)}`));
}
function managerError(error, respond) {
	if (!(error instanceof QuestionManagerError)) return false;
	respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, error.message, { details: { reason: error.code } }));
	return true;
}
function questionNotFound(id) {
	return errorShape(ErrorCodes.INVALID_REQUEST, `question '${id}' was not found`, { details: { reason: QuestionManagerErrorCodes.NOT_FOUND } });
}
function authorizeQuestionRecord(params) {
	if (isGatewayAdmin(params.client) || !hasOperatorBoundary(params.client, params.cfg) || !params.question.sessionKey) return null;
	const target = resolveSessionSharingTarget({
		cfg: params.cfg,
		sessionKey: params.question.sessionKey,
		agentId: params.question.agentId
	});
	const canSeeSession = target && (createSessionListEntryFilter({
		cfg: params.cfg,
		client: params.client
	})?.(target.canonicalKey, target.entry) ?? true);
	if (!target || !canSeeSession) return questionNotFound(params.question.id);
	return params.access === "mutate" ? authorizeSessionSharingTarget({
		cfg: params.cfg,
		client: params.client,
		target
	}) : null;
}
function normalizeQuestions(params) {
	const ids = /* @__PURE__ */ new Set();
	return params.questions.map((question) => {
		if (ids.has(question.questionId)) throw new QuestionRequestValidationError(`duplicate question id '${question.questionId}'`);
		ids.add(question.questionId);
		if (question.options.length === 1) throw new QuestionRequestValidationError(`question '${question.questionId}' must have either no options or 2 to 4 options`);
		const binding = question.secretStore;
		if (question.isSecret && !binding) throw new QuestionRequestValidationError(`question '${question.questionId}': secret questions are not supported yet`);
		if (binding) {
			if (!question.isSecret) throw new QuestionRequestValidationError(`question '${question.questionId}': secret store binding requires a secret question`);
			if (params.questions.length !== 1 || question.options.length !== 0 || question.multiSelect) throw new QuestionRequestValidationError(`question '${question.questionId}': secret store requests require one free-text, single-select question`);
			if (!ENV_SECRET_REF_ID_RE.test(binding.name)) throw new QuestionRequestValidationError(`question '${question.questionId}': invalid secret store entry name`);
			if (binding.kind !== "secret") throw new QuestionRequestValidationError(`question '${question.questionId}': masked requests require kind "secret"; set environment values in Settings or the CLI`);
			if ((binding.allowedHosts?.length ?? 0) > 128) throw new QuestionRequestValidationError(`question '${question.questionId}': secret store allowed hosts exceed the limit`);
			const existing = listSecretStoreEntries({ scope: { kind: "team" } }).find((entry) => entry.name === binding.name);
			return {
				...question,
				secretStore: {
					...binding,
					allowedHosts: binding.allowedHosts ?? existing?.allowedHosts ?? []
				},
				...existing ? { secretStoreExisting: {
					updatedAtMs: existing.updatedAtMs,
					...existing.updatedBy ? { updatedBy: existing.updatedBy } : {}
				} } : {}
			};
		}
		const optionLabels = /* @__PURE__ */ new Set();
		for (const option of question.options) {
			const normalizedLabel = option.label.trim().toLowerCase();
			if (optionLabels.has(normalizedLabel)) throw new QuestionRequestValidationError(`question '${question.questionId}' has duplicate option label '${option.label}'`);
			optionLabels.add(normalizedLabel);
		}
		return question;
	});
}
/** Creates the lazily loaded question RPC surface for one Gateway lifetime. */
function createQuestionHandlers(manager, storeWriteService) {
	return {
		"question.request": ({ params, respond, context, client }) => {
			if (!validateQuestionRequestParams(params)) {
				validationError("question.request", validateQuestionRequestParams.errors, respond);
				return;
			}
			let request = params;
			const storeBound = request.questions.some((question) => question.secretStore);
			if (storeBound && !isGatewayAdmin(client)) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "secret store questions require an operator.admin client"));
				return;
			}
			const identity = client?.internal?.agentRuntimeIdentity;
			const validateAuthority = context.validateAgentRuntimeApprovalAuthority;
			if (storeBound && (!identity || !validateAuthority)) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "secret store questions require trusted agent runtime authority"));
				return;
			}
			const requester = identity ? structuredClone(identity) : void 0;
			const isRequesterActive = requester && validateAuthority ? () => {
				try {
					return validateAuthority(requester);
				} catch {
					return false;
				}
			} : void 0;
			if (requester) request = {
				...request,
				agentId: requester.agentId,
				sessionKey: requester.sessionKey,
				runId: requester.operationalRunInstance.runId
			};
			try {
				const requestedSession = request.sessionKey ? resolveRequestedSessionAgentId(context.getRuntimeConfig(), request.sessionKey, request.agentId) : void 0;
				if (requestedSession && !requestedSession.ok) {
					respond(false, void 0, requestedSession.error);
					return;
				}
				const sessionKey = request.sessionKey && requestedSession?.ok ? resolveStoredSessionKeyForAgentStore({
					cfg: context.getRuntimeConfig(),
					agentId: requestedSession.agentId,
					sessionKey: request.sessionKey
				}) : void 0;
				if (sessionKey && hasOperatorBoundary(client, context.getRuntimeConfig())) {
					const authorizationError = authorizeSessionSharing({
						cfg: context.getRuntimeConfig(),
						client,
						sessionKey,
						agentId: requestedSession?.ok ? requestedSession.agentId : void 0
					});
					if (authorizationError) {
						respond(false, void 0, authorizationError);
						return;
					}
				}
				const record = manager.request({
					...request.id ? { id: request.id } : {},
					questions: normalizeQuestions(request),
					...requestedSession?.ok ? { agentId: requestedSession.agentId } : request.agentId ? { agentId: request.agentId } : {},
					...sessionKey ? { sessionKey } : {},
					...request.runId ? { runId: request.runId } : {},
					timeoutMs: request.timeoutMs ?? DEFAULT_QUESTION_TIMEOUT_MS,
					isRequesterActive,
					registerHumanInputWait: requester && isRequesterActive ? (isPending) => registerActiveEmbeddedRunHumanInputWait(requester.delegatedAuthority, isPending) : void 0,
					onResolved: (event) => {
						handleQuestionChannelResolved(event);
						if (sessionKey && context.getRuntimeConfig().gateway?.roles) context.broadcast("question.resolved", event, {
							sessionKeys: [sessionKey],
							...requestedSession?.ok ? { agentId: requestedSession.agentId } : {}
						});
						else context.broadcast("question.resolved", event);
					}
				});
				handleQuestionChannelRequested(record);
				if (sessionKey && context.getRuntimeConfig().gateway?.roles) context.broadcast("question.requested", record, {
					sessionKeys: [sessionKey],
					...requestedSession?.ok ? { agentId: requestedSession.agentId } : {}
				});
				else context.broadcast("question.requested", record);
				respond(true, {
					id: record.id,
					expiresAtMs: record.expiresAtMs
				}, void 0);
			} catch (error) {
				if (error instanceof QuestionRequestValidationError) {
					respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, error.message));
					return;
				}
				if (!managerError(error, respond)) {
					if (storeBound) {
						respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "Secret store entry metadata is unavailable."));
						return;
					}
					throw error;
				}
			}
		},
		"question.waitAnswer": async ({ params, respond, client, context }) => {
			if (!validateQuestionWaitAnswerParams(params)) {
				validationError("question.waitAnswer", validateQuestionWaitAnswerParams.errors, respond);
				return;
			}
			const request = params;
			try {
				const question = manager.get(request.id);
				if (question) {
					const authorizationError = authorizeQuestionRecord({
						cfg: context.getRuntimeConfig(),
						client,
						question,
						access: "read"
					});
					if (authorizationError) {
						respond(false, void 0, authorizationError);
						return;
					}
				}
				const answer = await manager.waitAnswer(request.id, request.timeoutMs);
				const resolvedQuestion = manager.get(request.id);
				if (resolvedQuestion) {
					const authorizationError = authorizeQuestionRecord({
						cfg: context.getRuntimeConfig(),
						client,
						question: resolvedQuestion,
						access: "read"
					});
					if (authorizationError) {
						respond(false, void 0, authorizationError);
						return;
					}
				}
				respond(true, answer, void 0);
			} catch (error) {
				if (!managerError(error, respond)) throw error;
			}
		},
		"question.resolve": async ({ params, respond, client, context }) => {
			if (!validateQuestionResolveParams(params)) {
				validationError("question.resolve", validateQuestionResolveParams.errors, respond);
				return;
			}
			const request = params;
			try {
				const question = manager.get(request.id);
				if (question) {
					const authorizationError = authorizeQuestionRecord({
						cfg: context.getRuntimeConfig(),
						client,
						question,
						access: "mutate"
					});
					if (authorizationError) {
						respond(false, void 0, authorizationError);
						return;
					}
				}
				if ("cancel" in request) {
					respond(true, manager.cancel(request.id, request.resolvedBy), void 0);
					return;
				}
				const secretQuestion = question?.questions[0];
				const binding = secretQuestion?.secretStore;
				if (!binding || !question) {
					if (request.secretStoreAllowedHosts !== void 0) {
						respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "Secret store allowed hosts require a store-bound question."));
						return;
					}
					respond(true, manager.resolve(request.id, request.answers, request.resolvedBy), void 0);
					return;
				}
				const submittedAnswers = request.answers.answers;
				const values = Object.hasOwn(submittedAnswers, secretQuestion.questionId) ? submittedAnswers[secretQuestion.questionId] : void 0;
				const value = values?.[0];
				if (Object.keys(submittedAnswers).length !== 1 || values?.length !== 1 || value === void 0) {
					respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `question '${secretQuestion.questionId}' requires exactly one secret value`));
					return;
				}
				registerSecretValueForRedaction(value);
				const allowedHosts = request.secretStoreAllowedHosts ?? binding.allowedHosts;
				let saved = false;
				try {
					const result = manager.resolve(request.id, { answers: { [secretQuestion.questionId]: ["stored"] } }, request.resolvedBy, () => {
						storeWriteService.write({
							name: binding.name,
							value,
							kind: "secret",
							...allowedHosts !== void 0 ? { allowedHosts } : {},
							updatedBy: storeWriteService.resolveUpdatedBy(client)
						});
						saved = true;
						vSecretEntryMirrorToFile(binding.name, value);
					});
					await storeWriteService.reloadReference(binding.name);
					respond(true, result, void 0);
				} catch (error) {
					if (managerError(error, respond)) return;
					respond(false, void 0, errorShape(!saved && error instanceof SecretStoreValidationError ? ErrorCodes.INVALID_REQUEST : ErrorCodes.UNAVAILABLE, saved ? "Secret store entry was saved, but runtime refresh failed. Resolve provider errors and retry secrets.reload; do not resubmit this answer." : error instanceof SecretStoreValidationError ? error.message : "Secret store entry could not be saved."));
				}
			} catch (error) {
				if (!managerError(error, respond)) throw error;
			}
		},
		"question.get": ({ params, respond, client, context }) => {
			if (!validateQuestionGetParams(params)) {
				validationError("question.get", validateQuestionGetParams.errors, respond);
				return;
			}
			const id = params.id;
			const question = manager.get(id);
			if (!question) {
				respond(false, void 0, questionNotFound(id));
				return;
			}
			const authorizationError = authorizeQuestionRecord({
				cfg: context.getRuntimeConfig(),
				client,
				question,
				access: "read"
			});
			if (authorizationError) {
				respond(false, void 0, authorizationError);
				return;
			}
			respond(true, { question }, void 0);
		},
		"question.list": ({ params, respond, client, context }) => {
			if (!validateQuestionListParams(params)) {
				validationError("question.list", validateQuestionListParams.errors, respond);
				return;
			}
			const cfg = context.getRuntimeConfig();
			respond(true, { questions: manager.list().filter((question) => !authorizeQuestionRecord({
				cfg,
				client,
				question,
				access: "read"
			})) }, void 0);
		}
	};
}
//#endregion
export { createQuestionHandlers };
