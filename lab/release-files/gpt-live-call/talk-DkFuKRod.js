// voice-backend-document-talk-v2
const LONG_RESULT_NOTICE="详细方案在屏幕上，需要的话也可以整理成文档发给你。";
function readBackendResult(result) {
  const raw = typeof result === 'string' ? result : result?.result ?? result?.text;
  if (typeof raw !== 'string') return null;
  const pair = /^\s*【语音摘要】\s*\n([\s\S]*?)\n【完整方案】\s*\n([\s\S]+)$/u.exec(raw);
  const text = pair ? pair[2] : raw;
  const supplied = pair ? pair[1].trim() : result?.spokenSummary;
  // A backend that exceeds its summary budget still supplied the summary's
  // source. Extract from that source, rather than accidentally reading a table
  // cell from the full document as the recommendation.
  const candidate = typeof supplied === 'string' && supplied.trim()
    ? supplied.trim().length <= 120 ? supplied.trim() : extractResultSummary(supplied) : null;
  const summary = candidate && candidate.length <= 120 ? candidate : null;
  return {text, summary};
}
function extractResultSummary(text) {
  const clean = text.replace(/```[^\n]*\n[\s\S]*?```/gu, '')
    .replace(/\[([^\]]+)\]\([^\n)]+\)/gu, '$1').replace(/[*_`]/gu, '');
  const allLines = clean.split('\n').map(line => line.trim());
  const conclusion = allLines.findIndex(line => /^#{1,6}\s.*(?:结论|建议|推荐|总结)/u.test(line));
  const lines = (conclusion >= 0 ? allLines.slice(conclusion + 1) : allLines).filter(line => line && !/^#{1,6}\s|^\|?\s*[-:| ]+$/u.test(line));
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !lines[i+1].includes('|')) continue;
    const cells = line => line.replace(/^\||\|$/gu, '').split('|').map(value => value.trim());
    const headers = cells(lines[i]);
    for (let j = i+1; j < lines.length && lines[j].includes('|'); j++) {
      const values = cells(lines[j]);
      if (values.length === headers.length) lines[j] = values.map((value, k) => `${headers[k]}：${value}`).join('，') + '。';
    }
    lines[i] = '';
    break;
  }
  const lead = lines.findIndex(line => /^(?:核心)?(?:结论|建议|推荐)[：:]/u.test(line));
  const candidates = (lead >= 0 ? lines.slice(lead) : lines).flatMap(line => line.match(/[^。！？!?]+[。！？!?]?/gu) ?? []);
  const chosen = [];
  for (const sentence of candidates) {
    const value = sentence.replace(/^[-+]\s+/u, '').trim();
    if (!value || chosen.includes(value) || value.length > 120) continue;
    if ((chosen.join('') + value).length > 120) break;
    chosen.push(value);
    if (chosen.length === 2) break;
  }
  return chosen.join('') || lines.join(' ').slice(0, 110) + '…';
}
function presentBackendResult(result) {
  if (result?.cancelled || result?.error) return null;
  const parsed = readBackendResult(result);
  if (!parsed?.text.trim()) return null;
  const {text} = parsed;
  const long = [...text].length > 300 || text.split('\n').filter(line => line.trim()).length >= 8 ||
    /^\s*```/mu.test(text) || /^\s*\|?.*\|.*\n\s*\|?\s*:?-{3,}/mu.test(text);
  const summary = long ? parsed.summary ?? extractResultSummary(text) : null;
  return {text, long, spokenText: long ? `${summary} ${LONG_RESULT_NOTICE}` : text};
}
// gpt-live-backend-call-control-v1: Talk
function bindGptLiveBackendCallControl({ callControl, continuationIdentity, assertCurrent }) {
  if (callControl === undefined) return;
  const validId = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
  if (!callControl || !validId(callControl.nativeDelegationId) || !validId(callControl.originUserTurnId) ||
      !Number.isSafeInteger(callControl.delegationGeneration) || callControl.delegationGeneration < 1 ||
      callControl.nativeDelegationId !== continuationIdentity?.delegationItemId ||
      callControl.delegationGeneration !== continuationIdentity?.delegationGeneration ||
      typeof callControl.userTurnText !== "string" || !callControl.userTurnText.trim() || callControl.userTurnText.length > 32768 ||
      typeof callControl.isCurrent !== "function" || typeof callControl.accept !== "function" ||
      typeof assertCurrent !== "function" || callControl.tool?.type !== "function" ||
      callControl.tool.function?.name !== "openclaw_end_call" ||
      callControl.tool.function.parameters?.type !== "object" ||
      !callControl.tool.function.parameters.properties ||
      Object.keys(callControl.tool.function.parameters.properties).length !== 0 ||
      callControl.tool.function.parameters.additionalProperties !== false ||
      callControl.tool.function.parameters.required?.length > 0) {
    throw new Error("Invalid host-owned GPT Live call control");
  }
  const original = { nativeDelegationId: callControl.nativeDelegationId, originUserTurnId: callControl.originUserTurnId,
    delegationGeneration: callControl.delegationGeneration, userTurnText: callControl.userTurnText };
  const check = () => {
    assertCurrent();
    if (Object.keys(original).some(key => callControl[key] !== original[key]) || callControl.isCurrent() !== true) {
      throw new Error("GPT Live call control native source is no longer current");
    }
  };
  check();
  // Only JSON schema is sent to Worker. These owner callbacks remain in Talk.
  const tool = Object.freeze({ type: "function", function: Object.freeze({ name: "openclaw_end_call",
    description: typeof callControl.tool.function.description === "string" ? callControl.tool.function.description : "End the current voice call only when the user has clearly requested it. Do not use for a negated, unfinished, or ambiguous request.",
    parameters: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
  }) });
  return Object.freeze({ ...original, tool,
    isCurrent: () => { try { check(); return true; } catch { return false; } },
    accept: proof => { check(); const receipt = callControl.accept(proof); check(); return receipt; },
  });
}
function buildGptLiveBackendCallControlQuestion(prompt, callControl) {
  if (!callControl) return prompt;
  if (callControl.isCurrent() !== true) throw new Error("GPT Live call control source changed before prompt submission");
  return [
    prompt,
    "Original complete latest USER turn, finalized by the current voice host (JSON string):",
    JSON.stringify(callControl.userTurnText),
    "Use this complete utterance to interpret the live request. The available openclaw_end_call client tool takes no arguments and asks the current host to end this call after its farewell plays. Use it only if this complete latest utterance clearly requests ending this call. Do not use it for a negated, unfinished, ambiguous, quoted or hypothetical request; answer the actual request normally in those cases. Do not claim that the call has closed just because you called the tool.",
  ].join("\n\n");
}
// gpt-live-call-lifecycle-talk-v1
import { resolveGptLiveCallInstructions } from "./gpt-live-call-lifecycle.mjs";
// gpt-live-native-confirmation-v1: durable caller affirmation
import { authorizeGptLiveClientVoicePendingConfirmation } from "./agent-tools.before-tool-call-g2OT63u5.js";
// gpt-live-consult-continuation-v1: Talk
import { resolveGptLiveVoiceConsultControl } from "./gpt-live-consult-continuation.js";
import { D as resolveExpiresAtMsFromDurationMs, E as resolveDateTimestampMs, b as parseFiniteNumber, g as isFutureDateTimestampMs, o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { n as resolveGlobalMap } from "./global-singleton-Dc_stLtU.js";
import { a as asOptionalRecord } from "./record-coerce-DItp3I4t.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { s as readConfigFileSnapshot } from "./io.runtime-CKu7Rw0j.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { n as sha256Base64Url } from "./crypto-digest-IGAbV2KW.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { m as resolveAgentWorkspaceDir, t as AgentSelectionRequiredError } from "./agent-scope-config-CUiGBd59.js";
import "./agent-scope-CSlN0kZb.js";
import { i as resolveActiveTalkProviderConfig, r as normalizeTalkSection, t as buildTalkConfigResponse } from "./talk-DyiyFkI6.js";
import { a as READ_SCOPE, s as TALK_SECRETS_SCOPE, t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { Ca as validateTalkSessionCloseParams, Da as validateTalkSpeakParams, Ea as validateTalkSessionSubmitToolResultParams, R_ as UI_APPEARANCE_PREFERENCE_KEYS, Ta as validateTalkSessionSteerParams, ba as validateTalkSessionAppendAudioParams, ca as validateTalkClientCloseParams, fa as validateTalkClientSteerParams, ga as validateTalkConfigParams, ha as validateTalkClientTranscriptParams, la as validateTalkClientCreateParams, pa as validateTalkClientToolCallParams, sa as validateTalkCatalogParams, va as validateTalkModeParams, wa as validateTalkSessionCreateParams, xa as validateTalkSessionCancelOutputParams, ya as validateTalkSessionAcknowledgeMarkParams, z_ as normalizeUiAppearancePreference } from "./src-B9mb84px.js";
import "./config-Cv60gBux.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { l as isAgentEventLifecycleGenerationCurrent } from "./agent-events-Con5xUCM.js";
import { T as tryBeginGatewayRootWorkAdmission, t as GatewayDrainingError, y as runOutsideGatewayRootWorkAdmission } from "./gateway-work-admission-3tn4Qiws.js";
import { d as errorShape, f as missingScopeErrorShape } from "./error-codes-DKSaEjvx.js";
import { r as assertSecretOwnerAvailable, u as isSecretOwnerAvailable } from "./runtime-degraded-state-D5EZZ925.js";
import { A as ensureClientVoiceAgentSessionEntry, C as appendClientVoiceTranscript, D as closeRelayVoiceSessionRecord, E as closeClientVoiceSession, F as resolveOpenClientVoiceSessionId, I as VOICE_TRANSCRIPT_QUEUE_POLICY, L as normalizeVoiceTranscriptText, M as registerClientVoiceConsultRun, N as resolveClientVoiceAgentSessionId, O as closeStaleClientVoiceSessions, P as resolveClientVoiceSessionOrigin, R as authorizeClientVoiceConfirmation, T as assertClientVoiceSessionOpen, j as flushClientVoiceSessionWrites, k as createOrResumeClientVoiceSession, w as appendRelayVoiceTranscript, z as bindAuthorizedClientVoiceConfirmation } from "./agent-tools.before-tool-call-g2OT63u5.js";
import { t as canonicalizeBase64 } from "./base64-Vw7DZYSc.js";
import { C as getUserPreferences, s as resolveUserProfileId } from "./user-profiles-ftXkbNlK.js";
import { a as getVoiceProviderConfig, c as resolveSupportedVoiceModelRefs, o as providerMatchesId } from "./capability-provider-runtime-D-IsNQEm.js";
import { a as getSpeechProvider, i as canonicalizeSpeechProviderId, s as listSpeechProviders } from "./directives-DzQJyZUP.js";
import { S as withSpeakerSelectionFallbackCompat, h as resolveTtsConfig, x as withSpeakerSelectionCompat } from "./tts-settings-Dm7fEGtI.js";
import { t as BoundedSerialQueue } from "./bounded-serial-queue-Dyfy2RP0.js";
import { n as redactConfigObject } from "./redact-snapshot-CGYV5Rse.js";
import { f as resolveOperatorSessionCreation, u as resolveSandboxedSessionCreation } from "./operator-role-policy-B_VzZMic.js";
import { l as readSessionPreviewItemsFromTranscript } from "./session-transcript-readers-Bry9KBsD.js";
import { S as isCodeHeavySpeechText, w as getResolvedSpeechProviderConfig, x as CODE_HEAVY_SPOKEN_FALLBACK, y as synthesizeTalkSpeech } from "./runtime-api-BCJ_2Qtx.js";
import "./tts-CBMNmCpZ.js";
import { s as registerChatAbortController, t as abortChatRunById } from "./chat-abort-B5BrBpQ_.js";
import { t as createPluginRuntime } from "./runtime-C-huom3Y.js";
import { t as formatForLog } from "./ws-log-CFwaDvs6.js";
import { n as getRealtimeTranscriptionProvider, r as listRealtimeTranscriptionProviders, t as canonicalizeRealtimeTranscriptionProviderId } from "./provider-registry-JCVaxaeh.js";
import { n as resolveRealtimeBootstrapContextInstructions } from "./realtime-bootstrap-context-BIfOgO1H.js";
import { $ as REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ, C as REALTIME_VOICE_AGENT_CONSULT_TOOL, E as buildRealtimeVoiceAgentConsultChatMessage, G as recordTalkObservabilityEvent, H as readSpeakableRealtimeVoiceToolResult, I as resolveRealtimeVoiceAgentConsultToolsAllow, N as parseRealtimeVoiceAgentConsultArgs, S as consultRealtimeVoiceAgent, U as createTalkSessionController, _ as listRealtimeVoiceProviders, d as resolveConfiguredRealtimeVoiceProvider, f as resolveRealtimeVoiceProviderCapabilities, h as canonicalizeRealtimeVoiceProviderId, k as buildRealtimeVoiceAgentConsultWorkingResponse, m as resolveInternalRealtimeVoiceGatewayRelayLaunchError, n as handleRealtimeVoiceHarnessBridgeEvent, p as cancelInternalRealtimeVoiceBrowserSession, t as createRealtimeVoiceSessionHarness, u as isRealtimeVoiceProviderConfigured, w as REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME } from "./realtime-session-harness-CEO5kVAJ.js";
import { a as REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME, f as shouldAutoControlRealtimeVoiceAgentText, i as REALTIME_VOICE_AGENT_CONTROL_TOOL, n as controlRealtimeVoiceAgentRun, o as buildRealtimeVoiceAgentCancelProviderResult, s as buildRealtimeVoiceAgentControlSpeechMessage, u as parseRealtimeVoiceAgentControlToolArgs } from "./agent-run-control-BeeIeTBf.js";
import { n as resolveProviderRawConfig } from "./provider-selection-runtime-Cb-SFMF0.js";
import { B as SessionMutationAuthorizationChangedError, a as prepareTalkSessionTarget, d as getUnifiedTalkSession, f as registerTalkConnectionCleanup, m as requireUnifiedTalkSessionConn, o as requirePreparedTalkSessionTarget, p as rememberUnifiedTalkSession, s as resolveTalkSessionAgentId, u as forgetUnifiedTalkSession } from "./session-sharing-BlMqwMBH.js";
import "./server-utils-CT_zAZOY.js";
import { i as handleTrustedInternalChatSend } from "./chat-send-handler-DBjXcn_1.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { t as resolveSessionKeyFromResolveParams } from "./sessions-resolve-_D6BmQTT.js";
import { t as inferSpeechMimeType } from "./speech-mime-DVntQu9L.js";
import { randomBytes, randomUUID } from "node:crypto";
import { Buffer as Buffer$1 } from "node:buffer";
//#region src/gateway/server-methods/talk-client-run-ownership.ts
async function cancelOwnedGptLiveVoiceConsult(params) {
	if (params.mode !== "cancel") return;
	params.assertCurrent?.();
	const voice = resolveGptLiveVoiceConsultControl({ ownerConnId: params.ownerConnId, sessionKey: params.sessionTarget.canonicalKey,
		agentId: params.sessionTarget.agentId });
	if (!voice) return;
	const runtime = params.controlRuntime ?? (await import("./agent-run-control.runtime.js")).realtimeVoiceControlRuntime;
	return await voice.cancelOwnedRuns(async ({ sessionKey, runTarget }, onAccepted) => {
		params.assertCurrent?.();
		const wrap = (candidate) => candidate && ({ ...candidate, abort: () => {
			const accepted = candidate.abort();
			// Notify in the exact abort's synchronous stack, before a Worker
			// rejection can be mistaken for a new speakable backend failure.
			if (accepted === true) onAccepted();
			return accepted;
		} });
		return await controlRealtimeVoiceAgentRun({ sessionKey, runTarget, text: params.text, mode: "cancel" }, {
			...runtime,
			resolveActiveEmbeddedRunOwnerByRunId: (id) => wrap(runtime.resolveActiveEmbeddedRunOwnerByRunId?.(id)),
			resolveActiveReplyRunOwnerForSignal: (signal) => wrap(runtime.resolveActiveReplyRunOwnerForSignal?.(signal))
		});
	});
}
async function controlOwnedGptLiveVoiceConsult(params) {
	if (!["status", "steer", "followup"].includes(params.mode)) return;
	params.assertCurrent?.();
	const voice = resolveGptLiveVoiceConsultControl({ ownerConnId: params.ownerConnId, sessionKey: params.sessionTarget.canonicalKey,
		agentId: params.sessionTarget.agentId });
	if (!voice) return;
	const runtime = params.controlRuntime ?? (await import("./agent-run-control.runtime.js")).realtimeVoiceControlRuntime;
	return await voice.controlOwnedRun({ mode: params.mode, text: params.text,
		resolveRun: (runId, signal) => { params.assertCurrent?.(); return runtime.resolveActiveEmbeddedRunOwnerByRunId?.(runId) ?? runtime.resolveActiveReplyRunOwnerForSignal?.(signal); },
		executeControl: async ({ sessionKey, runTarget }) => {
			params.assertCurrent?.();
			return await controlRealtimeVoiceAgentRun({ sessionKey, runTarget, text: params.text, mode: params.mode }, {
				...runtime,
				queueEmbeddedAgentMessageWithOutcomeAsync: async (sessionId, text, options) => {
					params.assertCurrent?.();
					const actual = runtime.resolveActiveEmbeddedRunOwnerByRunId?.(runTarget.runId) ?? runtime.resolveActiveReplyRunOwnerForSignal?.(runTarget.signal);
					if (!runTarget.isCurrent(sessionId) || actual?.sessionKey !== sessionKey || actual.sessionId !== sessionId) return { queued: false, sessionId, reason: "owner_changed" };
					return await runtime.queueEmbeddedAgentMessageWithOutcomeAsync(sessionId, text, options);
				}
			});
		}
	});
}
function resolveOwnedActiveTalkRunTarget(params) {
	const connId = normalizeOptionalString(params.clientConnId);
	if (!connId) return null;
	const { agentId, sessionKey, canonicalKey } = params.sessionTarget;
	for (const [runId, entry] of params.context.chatAbortControllers) {
		const generation = entry.lifecycleGeneration;
		if (!generation) continue;
		const signal = entry.controller.signal;
		const isCurrent = (resolvedSessionId) => {
			params.assertCurrent?.();
			return params.context.chatAbortControllers.get(runId) === entry && entry.agentId === agentId && (entry.sessionKey === sessionKey || entry.sessionKey === canonicalKey) && entry.ownerConnId === connId && entry.kind !== "agent" && entry.registrationCleanupRequested !== true && (resolvedSessionId === void 0 || entry.sessionId === resolvedSessionId) && entry.controller.signal === signal && !signal.aborted && entry.lifecycleGeneration === generation && isAgentEventLifecycleGenerationCurrent(generation);
		};
		if (isCurrent()) return {
			runId,
			signal,
			isCurrent
		};
	}
	return null;
}
//#endregion
//#region src/gateway/talk-client-gateway-control.ts
const owners = /* @__PURE__ */ new Map();
const pendingOwners = /* @__PURE__ */ new Set();
const REALTIME_VOICE_CONTEXT_MAX_UTF8_BYTES = 8e3;
const REALTIME_CONTROL_MAX_PENDING = 8;
function resolveTalkAgentConsultAuthority(scopes) {
	const senderIsOwner = scopes?.includes(ADMIN_SCOPE) === true;
	if (senderIsOwner || scopes?.includes("operator.write") === true) return { senderIsOwner };
	return {
		senderIsOwner: false,
		toolsAllow: resolveRealtimeVoiceAgentConsultToolsAllow("safe-read-only")
	};
}
const loadTalkAgentExecution = createLazyRuntimeModule(async () => {
	const [embeddedAgent, admission] = await Promise.all([import("./embedded-agent-CC2yIbCA.js"), import("./admitted-run-context-BkVijzZS.js")]);
	return {
		runEmbeddedAgent: embeddedAgent.runEmbeddedAgent,
		createOperationalRunInstanceRef: admission.createOperationalRunInstanceRef,
		prepareAgentRunAdmission: admission.prepareAgentRunAdmission
	};
});
function createRealtimeControlQueue() {
	return new BoundedSerialQueue({
		maxPendingCount: REALTIME_CONTROL_MAX_PENDING,
		maxPendingWeight: REALTIME_CONTROL_MAX_PENDING
	});
}
function createTalkClientAgentRuntime(params) {
	const agentRuntime = createPluginRuntime().agent;
	const runEmbeddedAgent = async (runParams) => {
		runParams.abortSignal?.throwIfAborted();
		const execution = await loadTalkAgentExecution();
		runParams.abortSignal?.throwIfAborted();
		const preparedRunAdmission = execution.prepareAgentRunAdmission({
			cfg: params.config,
			operationalRunInstance: execution.createOperationalRunInstanceRef(runParams.runId),
			facts: {
				runId: runParams.runId,
				agentId: runParams.sessionTarget?.agentId ?? runParams.agentId ?? params.agentId,
				ingress: {
					kind: "gateway-client",
					boundary: "talk-agent-consult",
					state: "present",
					...params.rawSourceRef ? { rawSourceRef: params.rawSourceRef } : {}
				}
			}
		});
		let closed = false;
		const close = () => {
			if (!closed) {
				closed = true;
				preparedRunAdmission.close();
			}
		};
		runParams.abortSignal?.addEventListener("abort", close, { once: true });
		try {
			runParams.abortSignal?.throwIfAborted();
			return await execution.runEmbeddedAgent({
				...runParams,
				preparedRunAdmission
			});
		} finally {
			runParams.abortSignal?.removeEventListener("abort", close);
			close();
		}
	};
	Object.defineProperty(agentRuntime, "runEmbeddedAgent", {
		configurable: true,
		enumerable: true,
		value: runEmbeddedAgent
	});
	return agentRuntime;
}
function createTalkRealtimeRunControlOwner(params) {
	const queue = createRealtimeControlQueue();
	const enqueue = (args, options = {}) => {
		const admission = queue.enqueue(async () => {
			await options.ready;
			try {
				const result = await params.execute(args);
				await options.onResult?.(result);
			} catch (error) {
				if (!options.onError) throw error;
				await options.onError(error);
			}
		});
		if (!admission.accepted) {
			params.warn(`realtime Talk control queue rejected work: ${admission.reason}`);
			return false;
		}
		admission.completion.catch((error) => {
			params.warn(`realtime Talk control failed: ${formatErrorMessage(error)}`);
		});
		return true;
	};
	return {
		enqueue,
		handleSpoken: (text, ready) => {
			if (!params.hasActiveRun() || !shouldAutoControlRealtimeVoiceAgentText(text)) return false;
			enqueue({ text }, {
				ready,
				onResult: (result) => {
					if (result.speak && !result.suppress && result.message.trim()) params.speak(buildRealtimeVoiceAgentControlSpeechMessage(result.message));
				}
			});
			return true;
		},
		close: () => {
			queue.seal();
			return queue.flush();
		}
	};
}
function boundTalkClientRealtimeInitialItems(items) {
	let remainingBytes = REALTIME_VOICE_CONTEXT_MAX_UTF8_BYTES;
	const newestFirst = [];
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (!item) continue;
		const itemBytes = Buffer.byteLength(item.text, "utf8");
		if (itemBytes > remainingBytes) break;
		newestFirst.push(item);
		remainingBytes -= itemBytes;
	}
	return newestFirst.toReversed();
}
function createTalkClientAgentConsultRunner(params) {
	const { agentId, sessionKey, canonicalKey, storePath } = params.sessionTarget;
	const authority = params.authority ?? resolveTalkAgentConsultAuthority(void 0);
	let agentRuntime;
	const runArgs = async (args, signal, onProgress, continuationContext) => {
		const parsedArgs = parseRealtimeVoiceAgentConsultArgs(args);
		const voiceSessionId = params.getVoiceSessionId();
		if (!voiceSessionId) throw new Error("Realtime browser voice session is not ready for agent consult");
		if (!params.registerRun) assertClientVoiceSessionOpen({
			agentId,
			sessionKey,
			voiceSessionId
		});
		const confirmationGrant = parsedArgs.confirmationId ? authorizeClientVoiceConfirmation({
			agentId,
			voiceSessionId,
			confirmationId: parsedArgs.confirmationId
		}) : void 0;
		const runtime = agentRuntime ??= createTalkClientAgentRuntime({
			config: params.config,
			agentId,
			...params.ownerConnId ? { rawSourceRef: params.ownerConnId } : {}
		});
		const talkConfig = normalizeTalkSection(params.config.talk);
		const admission = runOutsideGatewayRootWorkAdmission(tryBeginGatewayRootWorkAdmission);
		if (!admission) throw new GatewayDrainingError();
		let activeRunId;
		const emitAgentLifecycle = (type, runId, final = false) => {
			if (!params.ownerConnId) return;
			params.context.broadcastToConnIds("talk.event", {
				voiceSessionId,
				talkEvent: {
					type,
					callId: runId,
					payload: { name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME },
					...final ? { final: true } : {}
				}
			}, /* @__PURE__ */ new Set([params.ownerConnId]), { dropIfSlow: false });
		};
		return await admission.run(() => consultRealtimeVoiceAgent({
			cfg: params.config,
			agentRuntime: runtime,
			logger: params.context.logGateway,
			agentId,
			sessionKey: canonicalKey,
			storePath,
			messageProvider: "webchat",
			lane: "talk",
			runIdPrefix: params.runIdPrefix ?? "talk-realtime-consult",
			args: parsedArgs,
			transcript: params.initialItems,
			surface: params.surface ?? "a browser Talk session",
			userLabel: "User",
			questionSourceLabel: "user",
			thinkLevel: talkConfig?.consultThinkingLevel,
			fastMode: talkConfig?.consultFastMode,
			provider: params.provider,
			model: params.model,
			...authority,
			abortSignal: signal,
			onProgress,
			continuationContext,
			onResumeExecutionStarted: ({ runId, steeringConsumed }) => {
				try { continuationContext?.onRunStarted?.({ runId, steeringConsumed }); } catch {}
			},
			onResumeRunStarted: ({ runId, sessionId, timeoutMs }) => {
				try { continuationContext?.onRunStarted?.({ runId }); } catch {}
				if (params.registerRun) params.registerRun({ runId });
				else registerClientVoiceConsultRun({ agentId, sessionKey, voiceSessionId, runId, config: params.config });
				if (!params.ownerConnId) return;
				const registration = registerChatAbortController({
					chatAbortControllers: params.context.chatAbortControllers, runId, sessionId, sessionKey: canonicalKey,
					agentId, timeoutMs, ownerConnId: params.ownerConnId, controlUiVisible: false, kind: "chat-send"
				});
				return { abortSignal: registration.controller.signal, cleanup: registration.cleanup };
			},
			onRunStarted: ({ runId, sessionId, timeoutMs }) => {
				activeRunId = runId;
				try { continuationContext?.onRunStarted?.({ runId }); } catch {}
				emitAgentLifecycle("tool.call", runId);
				if (params.registerRun) params.registerRun({ runId });
				else registerClientVoiceConsultRun({
					agentId,
					sessionKey,
					voiceSessionId,
					runId,
					config: params.config
				});
				if (confirmationGrant) bindAuthorizedClientVoiceConfirmation({
					grant: confirmationGrant,
					runId
				});
				if (!params.ownerConnId) return;
				const registration = registerChatAbortController({
					chatAbortControllers: params.context.chatAbortControllers,
					runId,
					sessionId,
					sessionKey: canonicalKey,
					agentId,
					timeoutMs,
					ownerConnId: params.ownerConnId,
					controlUiVisible: false,
					kind: "chat-send"
				});
				return {
					abortSignal: registration.controller.signal,
					cleanup: registration.cleanup
				};
			}
		})).then((result) => {
			if (activeRunId) emitAgentLifecycle("tool.result", activeRunId, true);
			return result;
		}, (error) => {
			if (activeRunId) emitAgentLifecycle("tool.error", activeRunId, true);
			throw error;
		}).finally(admission.release);
	};
	return {
		runArgs,
		runPrompt: async ({ prompt, signal, onProgress, continuationContext }) => await runArgs({ question: prompt }, signal, onProgress, continuationContext)
	};
}
function createTalkClientGatewayControlOwner(params) {
	let callLifecycle;
	let bridge;
	let closeProvider;
	let closing;
	const lifetime = new AbortController();
	const { signal } = lifetime;
	let transcriptSequence = 0;
	const entryPrefix = `gateway-${randomUUID()}`;
	const consultQueue = createRealtimeControlQueue();
	const consultControllers = /* @__PURE__ */ new Map();
	const warn = (message) => params.context.logGateway.warn(message);
	const talkPayload = () => ({ voiceSessionId: params.voiceSessionId });
	const harness = createRealtimeVoiceSessionHarness({
		talk: {
			sessionId: params.voiceSessionId,
			mode: "realtime",
			transport: "webrtc",
			brain: "agent-consult",
			provider: params.providerId
		},
		talkPayloads: {
			turnStarted: talkPayload,
			turnEnded: (reason) => ({
				...talkPayload(),
				reason
			}),
			inputAudioDelta: (audio) => ({
				...talkPayload(),
				byteLength: audio.byteLength
			}),
			outputAudioStarted: talkPayload,
			outputAudioDelta: (audio) => ({
				...talkPayload(),
				byteLength: audio.byteLength
			}),
			outputAudioDone: (reason) => ({
				...talkPayload(),
				reason
			})
		},
		onTalkEvent: (talkEvent) => params.context.broadcastToConnIds("talk.event", {
			voiceSessionId: params.voiceSessionId,
			talkEvent
		}, /* @__PURE__ */ new Set([params.connId]), { dropIfSlow: talkEvent.final !== true }),
		captureBridgeEvents: false
	});
	const submit = async (callId, result) => {
		if (!bridge) throw new Error("OpenAI Realtime Gateway control bridge is not ready");
		await bridge.submitToolResult(callId, result);
	};
	const applyControl = async (args) => {
		const parsed = parseRealtimeVoiceAgentControlToolArgs(args);
		const controlParams = { ...parsed, ownerConnId: params.connId, sessionTarget: params.sessionTarget,
			assertCurrent: () => { owner.assertOpen(); if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active"); } };
		const voiceCancel = await cancelOwnedGptLiveVoiceConsult(controlParams);
		if (voiceCancel) return voiceCancel;
		const voiceControl = await controlOwnedGptLiveVoiceConsult(controlParams);
		if (voiceControl) return voiceControl;
		const runTarget = resolveOwnedActiveTalkRunTarget({
			context: params.context,
			clientConnId: params.connId,
			sessionTarget: params.sessionTarget,
			assertCurrent: () => {
				owner.assertOpen();
				if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
			}
		});
		const result = await (params.controlAgentRun ?? controlRealtimeVoiceAgentRun)({
			sessionKey: params.sessionTarget.canonicalKey,
			runTarget,
			text: parsed.text,
			mode: parsed.mode
		});
		if (result.mode === "cancel" && result.ok) for (const controller of consultControllers.values()) controller.abort(/* @__PURE__ */ new Error("Realtime voice consult cancelled"));
		return result;
	};
	const runConsult = async (event, controller) => {
		try {
			controller.signal.throwIfAborted();
			await params.flushTranscript();
			const result = await params.runAgentConsult(event.args, controller.signal);
			if (signal.aborted) return;
			await submit(event.callId, { result: result.text });
		} catch (error) {
			if (signal.aborted) return;
			const result = controller.signal.aborted ? buildRealtimeVoiceAgentCancelProviderResult() : { error: formatErrorMessage(error) };
			await submit(event.callId, result);
		} finally {
			if (consultControllers.get(event.callId) === controller) consultControllers.delete(event.callId);
		}
	};
	const runControl = createTalkRealtimeRunControlOwner({
		hasActiveRun: () => consultControllers.size > 0,
		execute: applyControl,
		speak: (message) => bridge?.sendUserMessage?.(message),
		warn
	});
	const handleToolCall = (event) => {
		if (signal.aborted) return;
		if (event.name === "openclaw_agent_consult") {
			const controller = new AbortController();
			consultControllers.set(event.callId, controller);
			const admission = consultQueue.enqueue(() => runConsult(event, controller));
			if (!admission.accepted) {
				consultControllers.delete(event.callId);
				submit(event.callId, { error: "Realtime Talk consult queue is full" });
				return;
			}
			admission.completion.catch((error) => {
				warn(`talk Gateway control consult failed: ${formatErrorMessage(error)}`);
			});
			return;
		}
		if (event.name === "openclaw_agent_control") {
			if (!runControl.enqueue(event.args, {
				onResult: (result) => submit(event.callId, result),
				onError: (error) => submit(event.callId, { error: formatErrorMessage(error) })
			})) submit(event.callId, { error: "Realtime Talk control queue is full" });
			return;
		}
		submit(event.callId, { error: `Unsupported realtime Talk tool: ${event.name}` }).catch((error) => {
			warn(`talk Gateway control rejection failed: ${formatErrorMessage(error)}`);
		});
	};
	const handleTranscript = (role, text, final) => {
		if (signal.aborted || !text.trim()) return;
		const turnId = harness.ensureTurn();
		harness.emit({
			type: role === "assistant" ? final ? "output.text.done" : "output.text.delta" : final ? "transcript.done" : "transcript.delta",
			turnId,
			payload: role === "assistant" ? { text } : {
				role,
				text
			},
			final
		});
		if (!final) return;
		transcriptSequence += 1;
		const entryId = `${entryPrefix}-${transcriptSequence}`;
		params.appendTranscript({
			entryId,
			role,
			text
		}).catch((error) => {
			warn(`talk Gateway control transcript failed: ${formatErrorMessage(error)}`);
		});
		if (role === "user") runControl.handleSpoken(text, params.flushTranscript());
	};
	const owner = {
		connId: params.connId,
		sessionTarget: params.sessionTarget,
		voiceSessionId: params.voiceSessionId,
		assertOpen: () => {
			signal.throwIfAborted();
			params.assertConnectionOpen?.();
		},
		runAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress, continuationIdentity, onCanceled, onRunStarted, callerInputAcceptedAt, callControl }) => {
			owner.assertOpen();
			if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
			const continuationContext = continuationIdentity ? {
				identity: continuationIdentity, ownerConnId: params.connId, voiceSessionId: params.voiceSessionId, ownerGeneration: entryPrefix,
				onCanceled, onRunStarted,
				isCurrent: () => { owner.assertOpen(); return owners.get(params.voiceSessionId) === owner; }
			} : void 0;
			// Only the host's durable finalized USER transcript can authorize this.
			// Neither the native prompt nor a model-supplied id is an affirmation.
			await params.flushTranscript();
			owner.assertOpen();
			consultSignal.throwIfAborted();
			if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
			const boundCallControl = bindGptLiveBackendCallControl({ callControl, continuationIdentity,
				assertCurrent: () => {
					owner.assertOpen(); consultSignal.throwIfAborted();
					if (!callLifecycle || owners.get(params.voiceSessionId) !== owner) throw new Error("GPT Live call control owner changed");
				}
			});
			if (boundCallControl) {
				if (!continuationContext) throw new Error("GPT Live call control requires the native delegation owner");
				continuationContext.callControl = boundCallControl;
			}
			const spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({
				agentId: params.sessionTarget.agentId,
				sessionKey: params.sessionTarget.sessionKey,
				voiceSessionId: params.voiceSessionId,
				callerInputAcceptedAt
			});
			// Existing runArgs validates again and binds the exact one-shot grant at
			// actual onRunStarted. Canonical tool params must still match at execution.
			return await params.runAgentConsult({ question: buildGptLiveBackendCallControlQuestion(prompt, boundCallControl),
				...spokenGrant ? { confirmationId: spokenGrant.confirmationId } : {}
			}, AbortSignal.any([consultSignal, signal]), onProgress, continuationContext);
		},
		requestCallReady: () => {
			owner.assertOpen();
			if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
			if (!callLifecycle) throw new Error("GPT Live call lifecycle is not available");
			return callLifecycle.ready();
		},
		control: {
			bindCallLifecycle: (nextLifecycle) => {
				owner.assertOpen();
				if (callLifecycle && callLifecycle !== nextLifecycle) throw new Error("GPT Live call lifecycle is already bound");
				if (typeof nextLifecycle?.ready !== "function" || typeof nextLifecycle?.close !== "function") throw new Error("Invalid GPT Live call lifecycle");
				callLifecycle = nextLifecycle;
			},
			onBackendResult: ({delegationId,text}) => {
				owner.assertOpen();
				if(owners.get(params.voiceSessionId)!==owner)throw new Error("Realtime voice session is not active");
				if(typeof delegationId!=="string"||!delegationId||typeof text!=="string")throw new Error("Invalid backend document identity");
				const document=presentBackendResult(text);
				if(!document?.long)return document?.text!==text?document?.text:undefined;
				harness.emit({type:"tool.result",callId:delegationId,turnId:harness.ensureTurn(),payload:{name:"openclaw_backend_result",text:document.text,...talkPayload()},final:true});
				return document.spokenText;
			},
			onCallLifecycleEvent: (event) => {
				owner.assertOpen();
				if (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
				if (!["tool.call", "tool.result", "tool.error"].includes(event.type) || event.payload?.name !== "openclaw_end_call") throw new Error("Unsupported native call lifecycle event");
				harness.emit({ type: event.type, callId: event.callId, turnId: harness.ensureTurn(),
					payload: { ...event.payload, ...talkPayload() }, final: event.type !== "tool.call" });
			},
			bindBridge: (nextBridge) => {
				bridge = nextBridge;
			},
			onEvent: (event) => {
				if (signal.aborted) return;
				const legacyOutcome = handleRealtimeVoiceHarnessBridgeEvent(harness, event);
				if (legacyOutcome && (legacyOutcome.status === "failed" || legacyOutcome.status === "incomplete")) warn(`talk Gateway control ${legacyOutcome.message}`);
				if (event.direction === "server" && (event.type === "conversation.output_audio.delta" || event.type === "response.audio.delta" || event.type === "response.output_audio.delta")) {
					const turnId = harness.ensureTurn();
					harness.talk.startOutputAudio({
						turnId,
						payload: talkPayload()
					});
				}
			},
			onTranscript: handleTranscript,
			onToolCall: handleToolCall,
			onResponseDone: (outcome) => {
				if (signal.aborted) return;
				if (harness.finishResponse(outcome).ok && (outcome.status === "failed" || outcome.status === "incomplete")) warn(`talk Gateway control ${outcome.message}`);
			},
			onReady: () => {
				if (!signal.aborted) harness.emit({
					type: "session.ready",
					payload: talkPayload()
				});
			},
			onError: (error) => {
				if (signal.aborted) return;
				warn(`talk Gateway control provider error: ${error.message}`);
				harness.emit({
					type: "session.error",
					payload: {
						...talkPayload(),
						message: error.message
					},
					final: true
				});
			},
			onClose: () => {
				if (signal.aborted) return;
				harness.emit({
					type: "session.closed",
					payload: talkPayload(),
					final: true
				});
				harness.close();
				owner.close({ skipProvider: true }).catch((error) => {
					warn(`talk Gateway control close failed: ${formatErrorMessage(error)}`);
				});
			}
		},
		adoptProvider: async (nextCloseProvider) => {
			if (signal.aborted) {
				await nextCloseProvider();
				signal.throwIfAborted();
			}
			closeProvider = nextCloseProvider;
			owner.assertOpen();
		},
		activate: () => {
			owner.assertOpen();
			pendingOwners.delete(owner);
			const previous = owners.get(params.voiceSessionId);
			owners.set(params.voiceSessionId, owner);
			if (previous && previous !== owner) previous.close({
				preserveLogicalSession: true,
				preserveRuns: true
			}).catch((error) => {
				warn(`talk replaced Gateway transport close failed: ${formatErrorMessage(error)}`);
			});
		},
		close: (options) => {
			if (closing) return closing;
			closing = Promise.resolve().then(async () => {
				pendingOwners.delete(owner);
				harness.close();
				if (owners.get(params.voiceSessionId) === owner) owners.delete(params.voiceSessionId);
				if (!options?.preserveRuns) for (const controller of consultControllers.values()) controller.abort(/* @__PURE__ */ new Error("Realtime voice session closed"));
				consultQueue.seal();
				const providerClose = options?.skipProvider ? Promise.resolve() : Promise.resolve().then(() => closeProvider?.());
				const [providerResult] = await Promise.allSettled([
					providerClose,
					params.flushTranscript(),
					runControl.close(),
					consultQueue.flush()
				]);
				if (!options?.preserveLogicalSession) await params.closeLogicalSession();
				if (providerResult?.status === "rejected") throw providerResult.reason;
			});
			callLifecycle?.close();
			lifetime.abort(/* @__PURE__ */ new Error("Realtime voice session closed"));
			return closing;
		}
	};
	owner.assertOpen();
	pendingOwners.add(owner);
	registerTalkConnectionCleanup(params.connId, "browser-control", () => {
		for (const current of [...pendingOwners, ...owners.values()]) if (current.connId === params.connId) current.close().catch((error) => {
			warn(`talk disconnected Gateway control close failed: ${formatErrorMessage(error)}`);
		});
	});
	return owner;
}
async function closeTalkClientGatewayControlSession(params) {
	const matching = [...pendingOwners, ...owners.values()].filter((owner) => owner.voiceSessionId === params.voiceSessionId);
	if (matching.length === 0) return false;
	const owned = matching.filter((owner) => owner.sessionTarget.sessionKey === params.sessionKey.trim() && owner.connId === params.connId);
	if (owned.length === 0) throw new Error("Gateway-controlled voice session is not owned by this client");
	await Promise.all(owned.map((owner) => owner.close()));
	return true;
}
//#endregion
//#region src/gateway/talk-realtime-relay-state.ts
const RELAY_SESSION_TTL_MS = 18e5;
const RELAY_EVENT = "talk.event";
const RELAY_TRANSCRIPT_ECHO_LOOKBACK_MS = 12e3;
const noFallbackRelayOutputFlush = () => {};
var TalkRealtimeRelayOutputOwnership = class {
	constructor(activeTurnId, ensureTurn, fail) {
		this.activeTurnId = activeTurnId;
		this.ensureTurn = ensureTurn;
		this.fail = fail;
		this.mode = "turn-bound";
		this.phase = "unowned";
		this.outputGeneration = 0;
	}
	responseCreated(responseId) {
		const normalizedResponseId = responseId?.trim();
		if (this.phase === "unowned") {
			Object.assign(this, {
				mode: normalizedResponseId ? "exact-response" : "turn-bound",
				phase: "owned",
				turnId: this.ensureTurn(),
				responseId: normalizedResponseId
			});
			return true;
		}
		if (this.phase === "owned" && this.mode === "exact-response" && normalizedResponseId && normalizedResponseId === this.responseId) return true;
		this.fail("Realtime provider output has no live response owner.");
		return false;
	}
	resolve(claim) {
		const activeTurnId = this.activeTurnId();
		if (this.phase !== "cancelling" && activeTurnId && this.mode === "turn-bound" && claim && this.phase === "unowned") Object.assign(this, {
			phase: "owned",
			turnId: activeTurnId
		});
		const turnId = this.phase === "owned" && this.turnId === activeTurnId ? activeTurnId : void 0;
		if (!turnId && (claim || this.phase === "owned")) this.fail("Realtime provider output has no live response owner.");
		return turnId;
	}
	finish(responseId, cancellationEvent = false) {
		const cancelled = this.phase === "cancelling";
		if (cancellationEvent && !cancelled || this.mode === "exact-response" && (this.phase === "unowned" || this.responseId !== responseId)) return "ignore";
		this.drain?.resolve();
		Object.assign(this, {
			mode: "turn-bound",
			phase: "unowned",
			turnId: void 0,
			responseId: void 0
		});
		return cancelled ? "cancelled" : "completed";
	}
	bind(provider, runAgentConsult) {
		return {
			...provider,
			createBridge: (request) => provider.createBridge({
				...request,
				onEvent: (event) => {
					if (event.direction === "server" && event.type === "response.created" && !this.responseCreated(event.responseId)) return;
					request.onEvent?.(event);
				},
				runAgentConsult
			})
		};
	}
};
const relaySessions = /* @__PURE__ */ new Map();
const drainingRelaySessions = /* @__PURE__ */ new Set();
function adoptRelayProviderToolCallId(session, providerCallId) {
	const current = session.relayToolCallIdsByProviderId.get(providerCallId);
	if (current) {
		if (session.toolCalls.isAgentCompleted(current) || session.toolCalls.isProviderCompleted(providerCallId)) return;
		return current;
	}
	const relayCallId = session.toolCalls.isAgentCompleted(providerCallId) ? `relay-${randomUUID()}` : providerCallId;
	if (!session.toolCalls.tryAdmit([providerCallId, relayCallId])) return;
	session.toolCalls.deleteProviderCompleted(providerCallId);
	session.toolCalls.deleteAgentCompleted(relayCallId);
	session.providerToolCallIds.set(relayCallId, providerCallId);
	session.relayToolCallIdsByProviderId.set(providerCallId, relayCallId);
	return relayCallId;
}
function resolveRelayProviderToolCallId(session, relayCallId) {
	return session.providerToolCallIds.get(relayCallId) ?? relayCallId;
}
function broadcastToOwner$1(context, connId, event) {
	const delivery = relayEventDeliveryOptions(event, event.talkEvent);
	context.broadcastToConnIds(RELAY_EVENT, event, /* @__PURE__ */ new Set([connId]), delivery);
}
function relayEventDeliveryOptions(event, talkEvent) {
	switch (event.type) {
		case "audio":
		case "inputAudio": return { dropIfSlow: true };
		case "transcript": return { dropIfSlow: !event.final };
		case "toolProgress":
		case "toolResult": return { dropIfSlow: talkEvent?.final !== true };
		default: return { dropIfSlow: false };
	}
}
function ensureRelayTurn(session) {
	const turn = session.harness.talk.ensureTurn();
	if (turn.event) broadcastToOwner$1(session.context, session.connId, {
		relaySessionId: session.id,
		type: "inputAudio",
		byteLength: 0,
		talkEvent: turn.event
	});
	return turn.turnId;
}
//#endregion
//#region src/gateway/talk-realtime-relay-provider-results.ts
function suppressedToolResultOptions(session) {
	return session.bridge.bridge.supportsToolResultSuppression === false ? void 0 : { suppressResponse: true };
}
function broadcastToolResultToOwner(session, params) {
	const payload = params.forced === true ? {
		result: params.result,
		forced: true
	} : { result: params.result };
	broadcastToOwner$1(session.context, session.connId, {
		relaySessionId: session.id,
		type: "toolResult",
		callId: params.callId,
		talkEvent: session.harness.talk.emit({
			type: "tool.result",
			callId: params.callId,
			turnId: params.turnId,
			payload,
			final: params.final
		})
	});
}
function completeAfterToolResultSubmissions(session, submissions, onAccepted) {
	const pending = submissions.filter((submission) => submission !== void 0);
	const complete = () => {
		if (relaySessions.get(session.id) === session) onAccepted();
	};
	if (pending.length === 0) {
		complete();
		return;
	}
	return Promise.all(pending).then(complete);
}
function trackToolResultCompletion(pending, callId, completion) {
	if (!completion) return;
	const tracked = completion.finally(() => {
		if (pending.get(callId) === tracked) pending.delete(callId);
	});
	pending.set(callId, tracked);
	return tracked;
}
function submitFinalProviderToolResult(params) {
	const epoch = params.session.toolResultEpoch;
	const providerCallId = resolveRelayProviderToolCallId(params.session, params.callId);
	if (params.session.toolCalls.isProviderCompleted(providerCallId)) {
		if (relaySessions.get(params.session.id) === params.session && params.session.toolResultEpoch === epoch) params.onAccepted?.();
		return;
	}
	const pending = params.session.pendingProviderToolResults.get(params.callId);
	if (pending) return pending;
	const submit = () => params.session.bridge.submitToolResult(providerCallId, params.result, params.options);
	const working = params.session.pendingWorkingToolResults.get(params.callId);
	const submitAfterWorking = async () => {
		if (relaySessions.get(params.session.id) !== params.session) return false;
		if (params.session.toolResultEpoch !== epoch) {
			if (!params.session.toolCalls.hasCancelled(params.callId)) return false;
			await params.session.bridge.submitToolResult(providerCallId, buildRealtimeVoiceAgentCancelProviderResult("OpenClaw cancelled this consult before completion. Do not restart it."), suppressedToolResultOptions(params.session));
			if (!params.session.toolCalls.markProviderCompleted([providerCallId]) || !params.session.toolCalls.markAgentCompleted([params.callId])) return false;
			params.session.toolCalls.deleteCancelled(params.callId);
			return false;
		}
		await submit();
		return true;
	};
	const submission = working ? working.then(submitAfterWorking, submitAfterWorking) : submit();
	const accept = () => {
		if (params.session.toolResultEpoch !== epoch) return;
		if (!params.session.toolCalls.markProviderCompleted([providerCallId])) return;
		if (relaySessions.get(params.session.id) === params.session) params.onAccepted?.();
	};
	if (!submission) {
		accept();
		return;
	}
	const completion = submission.then((submitted) => {
		if (submitted !== false) accept();
	});
	return trackToolResultCompletion(params.session.pendingProviderToolResults, params.callId, completion);
}
function trackAgentFinalToolResult(session, callId, completion) {
	return trackToolResultCompletion(session.pendingFinalToolResults, callId, completion);
}
function trackPendingWorkingToolResult(session, callId, completion) {
	return trackToolResultCompletion(session.pendingWorkingToolResults, callId, completion);
}
function clearRelayAgentToolCall(session, callId) {
	const runId = session.activeAgentToolCalls.get(callId);
	session.activeAgentToolCalls.delete(callId);
	if (!runId) return;
	if (![...session.activeAgentToolCalls.values()].includes(runId)) session.activeAgentRuns.delete(runId);
}
//#endregion
//#region src/gateway/talk-realtime-relay-forced-consults.ts
const FORCED_CONSULT_FALLBACK_DELAY_MS = 200;
const FORCED_CONSULT_RESULT_MAX_CHARS = 1800;
function isWorkingToolResult(result) {
	return Boolean(result) && typeof result === "object" && !Array.isArray(result) && result.status === "working";
}
function buildForcedConsultCheckingPrompt() {
	return ["Briefly tell the person that you are checking with OpenClaw.", "Do not answer the request yet. Wait for the OpenClaw result before giving the actual answer."].join(" ");
}
function buildForcedConsultSpeechPrompt(text) {
	return [
		"OpenClaw finished checking. Speak this result naturally and concisely.",
		"Do not mention tool calls, JSON, or internal routing.",
		"",
		text
	].join("\n");
}
function buildAlreadyDeliveredToolResult() {
	return {
		status: "already_delivered",
		message: "OpenClaw already delivered this consult result internally. Do not repeat it."
	};
}
function submitRelayAgentControlProviderResults(session, result, turnId) {
	if (result.mode !== "cancel" || !result.ok || !result.providerResult) return;
	const providerResult = result.providerResult;
	const epoch = session.toolResultEpoch;
	const callIds = [...session.activeAgentToolCalls.keys()];
	const activeCallIds = callIds.filter((callId) => !session.pendingFinalToolResults.has(callId));
	const submissions = callIds.map((callId) => session.pendingFinalToolResults.get(callId)).filter((pending) => pending !== void 0);
	const toolResultOptions = suppressedToolResultOptions(session);
	let providerResponseStarted = toolResultOptions === void 0 && submissions.length > 0;
	const finalizeAgentCall = (callId, forcedConsult) => {
		if (session.toolResultEpoch !== epoch) return;
		if (forcedConsult) session.harness.forcedConsults.markCancelled(forcedConsult);
		broadcastToolResultToOwner(session, {
			callId,
			turnId,
			result: providerResult,
			final: true
		});
		clearRelayAgentToolCall(session, callId);
		session.toolCalls.markAgentCompleted([callId]);
	};
	for (const callId of activeCallIds) {
		const forcedConsult = session.harness.forcedConsults.handles().find((handle) => handle.id === callId);
		if (forcedConsult) {
			const nativeCallIds = session.harness.forcedConsults.nativeCallIds(forcedConsult);
			providerResponseStarted ||= toolResultOptions === void 0 && nativeCallIds.length > 0;
			const terminal = {
				result: providerResult,
				options: toolResultOptions,
				turnId,
				epoch
			};
			session.forcedTerminalProviderResults.set(callId, terminal);
			const clearTerminal = () => {
				if (session.forcedTerminalProviderResults.get(callId) === terminal) session.forcedTerminalProviderResults.delete(callId);
			};
			const tracked = trackAgentFinalToolResult(session, callId, completeAfterToolResultSubmissions(session, [drainForcedTerminalProviderResultsAfterPending(session, forcedConsult, terminal)], () => {
				clearTerminal();
				finalizeAgentCall(callId, forcedConsult);
			})?.finally(clearTerminal));
			submissions.push(tracked);
			continue;
		}
		providerResponseStarted ||= toolResultOptions === void 0;
		const submitted = submitFinalProviderToolResult({
			session,
			callId,
			result: providerResult,
			options: toolResultOptions,
			onAccepted: () => finalizeAgentCall(callId)
		});
		submissions.push(trackAgentFinalToolResult(session, callId, submitted));
	}
	const completion = completeAfterToolResultSubmissions(session, submissions, () => {});
	return {
		...completion ? { completion } : {},
		providerResponseStarted
	};
}
function scheduleForcedAgentConsult(session, question) {
	if (!session || !question.trim()) return;
	if (session.harness.forcedConsults.hasRecentNativeConsult(question)) return;
	session.harness.forcedConsults.clearPending();
	const handle = session.harness.forcedConsults.prepare(question);
	if (!handle) return;
	session.harness.forcedConsults.schedule(handle, FORCED_CONSULT_FALLBACK_DELAY_MS, () => {
		if (!relaySessions.has(session.id)) return;
		if (!session.toolCalls.tryAdmit([handle.id])) return;
		const turnId = ensureRelayTurn(session);
		const callId = handle.id;
		const itemId = `forced-consult-item-${randomUUID()}`;
		session.harness.forcedConsults.markStarted(handle);
		session.harness.handleBargeIn({
			audioPlaybackActive: true,
			force: true
		}, noFallbackRelayOutputFlush);
		broadcastToOwner$1(session.context, session.connId, {
			relaySessionId: session.id,
			type: "toolCall",
			itemId,
			callId,
			name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
			forced: true,
			args: {
				question: handle.question,
				context: "The realtime provider produced a final user transcript without invoking openclaw_agent_consult, so OpenClaw is forcing the consult for realtime Talk.",
				responseStyle: "Reply in a concise spoken tone."
			},
			talkEvent: session.harness.talk.emit({
				type: "tool.call",
				itemId,
				callId,
				turnId,
				payload: {
					name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
					args: { question: handle.question },
					forced: true
				}
			})
		});
	});
}
function submitForcedConsultProviderResult(session, callId, result, options) {
	return submitFinalProviderToolResult({
		session,
		callId,
		result,
		options
	});
}
function drainForcedTerminalProviderResults(session, handle, terminal) {
	const isCurrent = () => relaySessions.get(session.id) === session && session.toolResultEpoch === terminal.epoch && session.forcedTerminalProviderResults.get(handle.id) === terminal;
	if (!isCurrent()) return;
	const callIds = () => terminal.nativeCallIds ?? session.harness.forcedConsults.nativeCallIds(handle);
	const submitPending = () => callIds().filter((callId) => !session.toolCalls.isProviderCompleted(callId)).map((callId) => submitForcedConsultProviderResult(session, callId, terminal.result, terminal.options)).filter((submission) => submission !== void 0);
	if (terminal.nativeCallIds) {
		const submissions = submitPending();
		if (submissions.length === 0) return;
		return Promise.allSettled(submissions).then(async () => {
			if (isCurrent()) await Promise.allSettled(submitPending());
		});
	}
	const drainDynamic = () => {
		if (!isCurrent()) return;
		const submissions = submitPending();
		if (submissions.length === 0) return;
		return Promise.all(submissions).then(drainDynamic);
	};
	return drainDynamic();
}
function drainForcedTerminalProviderResultsAfterPending(session, handle, terminal) {
	const pending = (terminal.nativeCallIds ?? session.harness.forcedConsults.nativeCallIds(handle)).map((callId) => session.pendingProviderToolResults.get(callId)).filter((submission) => submission !== void 0);
	if (pending.length === 0) return drainForcedTerminalProviderResults(session, handle, terminal);
	return Promise.allSettled(pending).then(() => {
		if (relaySessions.get(session.id) === session && session.toolResultEpoch === terminal.epoch) return drainForcedTerminalProviderResults(session, handle, terminal);
	});
}
function submitRealtimeAgentConsultWorkingResponse(session, callId, turnId = ensureRelayTurn(session)) {
	if (!session.bridge.bridge.supportsToolResultContinuation) return;
	const epoch = session.toolResultEpoch;
	return trackPendingWorkingToolResult(session, callId, completeAfterToolResultSubmissions(session, [session.bridge.submitToolResult(resolveRelayProviderToolCallId(session, callId), buildRealtimeVoiceAgentConsultWorkingResponse("person"), { willContinue: true })], () => {
		if (session.toolResultEpoch !== epoch) return;
		broadcastToOwner$1(session.context, session.connId, {
			relaySessionId: session.id,
			type: "toolResult",
			callId,
			talkEvent: session.harness.talk.emit({
				type: "tool.progress",
				callId,
				turnId,
				payload: {
					name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
					status: "working"
				}
			})
		});
	}));
}
function submitForcedTalkRealtimeRelayToolResult(session, forcedConsult, params) {
	const cancelled = session.harness.forcedConsults.isCancelled(forcedConsult);
	const turnId = cancelled ? session.toolCalls.cancelledTurnId(params.callId) ?? session.harness.talk.activeTurnId : ensureRelayTurn(session);
	if (!turnId) throw new Error("Cancelled realtime consult is missing its original turn");
	if (cancelled) {
		const providerResult = buildRealtimeVoiceAgentCancelProviderResult("OpenClaw cancelled this consult before completion. Do not restart it.");
		const existing = session.forcedTerminalProviderResults.get(forcedConsult.id);
		const terminal = existing?.epoch === session.toolResultEpoch ? existing : {
			result: providerResult,
			options: suppressedToolResultOptions(session),
			turnId,
			epoch: session.toolResultEpoch
		};
		session.forcedTerminalProviderResults.set(forcedConsult.id, terminal);
		const clearTerminal = () => {
			if (session.forcedTerminalProviderResults.get(forcedConsult.id) === terminal) session.forcedTerminalProviderResults.delete(forcedConsult.id);
		};
		const completion = completeAfterToolResultSubmissions(session, [drainForcedTerminalProviderResultsAfterPending(session, forcedConsult, terminal)], () => {
			clearTerminal();
			if (session.toolResultEpoch !== terminal.epoch) return;
			session.harness.forcedConsults.markCancelled(forcedConsult);
			clearRelayAgentToolCall(session, params.callId);
			session.toolCalls.deleteCancelled(params.callId);
			if (!session.toolCalls.markAgentCompleted([params.callId])) return;
			broadcastToolResultToOwner(session, {
				callId: params.callId,
				turnId,
				result: providerResult,
				forced: true,
				final: true
			});
		});
		return trackAgentFinalToolResult(session, params.callId, completion?.finally(clearTerminal));
	}
	if (!(params.options?.willContinue !== true)) {
		if (isWorkingToolResult(params.result)) session.bridge.sendUserMessage(buildForcedConsultCheckingPrompt());
		broadcastToolResultToOwner(session, {
			callId: params.callId,
			turnId,
			result: params.result,
			forced: true,
			final: false
		});
		return;
	}
	const text = readSpeakableRealtimeVoiceToolResult(params.result, { maxChars: FORCED_CONSULT_RESULT_MAX_CHARS });
	const providerOptions = suppressedToolResultOptions(session);
	const terminal = {
		result: providerOptions ? buildAlreadyDeliveredToolResult() : params.result,
		options: providerOptions,
		turnId,
		epoch: session.toolResultEpoch
	};
	session.forcedTerminalProviderResults.set(forcedConsult.id, terminal);
	const submission = drainForcedTerminalProviderResults(session, forcedConsult, terminal);
	const clearTerminal = () => {
		if (session.forcedTerminalProviderResults.get(forcedConsult.id) === terminal) session.forcedTerminalProviderResults.delete(forcedConsult.id);
	};
	const trackedCompletion = completeAfterToolResultSubmissions(session, [submission], () => {
		clearTerminal();
		if (session.toolResultEpoch !== terminal.epoch) return;
		session.harness.forcedConsults.markDelivered(forcedConsult);
		clearRelayAgentToolCall(session, params.callId);
		if (!session.toolCalls.markAgentCompleted([params.callId])) return;
		const hasNativeCalls = session.harness.forcedConsults.nativeCallIds(forcedConsult).length > 0;
		if (text && (!hasNativeCalls || providerOptions)) session.bridge.sendUserMessage(buildForcedConsultSpeechPrompt(text));
		broadcastToolResultToOwner(session, {
			callId: params.callId,
			turnId,
			result: params.result,
			forced: true,
			final: true
		});
	})?.finally(clearTerminal);
	return trackAgentFinalToolResult(session, params.callId, trackedCompletion);
}
//#endregion
//#region src/gateway/talk-realtime-relay-issues.ts
function createTalkRealtimeRelayIssue(params) {
	return {
		code: "realtime_unavailable",
		message: params.message,
		provider: params.provider,
		...params.model ? { model: params.model } : {},
		transport: "gateway-relay",
		phase: params.phase
	};
}
function buildTalkRealtimeRelayIssuePayload(relaySessionId, issue) {
	return {
		relaySessionId,
		type: "error",
		message: issue.message,
		code: issue.code,
		provider: issue.provider,
		...issue.model ? { model: issue.model } : {},
		transport: issue.transport,
		phase: issue.phase
	};
}
//#endregion
//#region src/gateway/talk-realtime-relay-voice.ts
const RELAY_TRANSCRIPT_RETRY_DELAYS_MS = [
	0,
	500,
	2e3
];
function logRelayVoiceFailure(session, message, error) {
	session.context.logGateway?.warn(`${message}: ${formatErrorMessage(error)}`);
}
function ensureRelayVoiceSession(session) {
	if (session.voiceSessionCreated) return true;
	const { agentId, sessionKey } = session.sessionTarget;
	try {
		createOrResumeClientVoiceSession({
			agentId,
			sessionKey,
			provider: session.provider,
			origin: "relay",
			voiceSessionId: session.id
		});
		session.voiceSessionCreated = true;
		return true;
	} catch (error) {
		logRelayVoiceFailure(session, "realtime relay voice session create failed", error);
		return false;
	}
}
function enqueueRelayVoiceTranscript(session, role, text) {
	const normalizedText = normalizeVoiceTranscriptText(text);
	if (!normalizedText) return true;
	if (!ensureRelayVoiceSession(session)) return true;
	const transcriptSeq = session.voiceTranscriptSeq + 1;
	const entryId = String(transcriptSeq);
	const { agentId, sessionKey, canonicalKey, storePath } = session.sessionTarget;
	const admission = session.voiceTranscriptQueue.enqueue(async () => {
		let lastError;
		for (const delayMs of RELAY_TRANSCRIPT_RETRY_DELAYS_MS) {
			if (delayMs > 0) await new Promise((resolve) => {
				setTimeout(resolve, delayMs);
			});
			try {
				await appendRelayVoiceTranscript({
					agentId,
					sessionKey,
					sessionTarget: {
						sessionKey: canonicalKey,
						storePath
					},
					voiceSessionId: session.id,
					entryId,
					role,
					text: normalizedText,
					...session.voiceConfig ? { config: session.voiceConfig } : {}
				});
				return;
			} catch (error) {
				lastError = error;
			}
		}
		throw lastError;
	}, { weight: normalizedText.length });
	if (!admission.accepted) {
		if (admission.reason === "overflow") session.failSession(VOICE_TRANSCRIPT_QUEUE_POLICY.overflowMessage);
		return false;
	}
	session.voiceTranscriptSeq = transcriptSeq;
	admission.completion.catch((error) => {
		logRelayVoiceFailure(session, "realtime relay transcript append failed", error);
	});
	return true;
}
function closeRelayVoiceSession(session) {
	if (session.voiceSessionClose) return session.voiceSessionClose;
	session.voiceTranscriptQueue.seal();
	if (!ensureRelayVoiceSession(session)) {
		session.voiceSessionClose = Promise.resolve();
		return session.voiceSessionClose;
	}
	const { agentId, sessionKey } = session.sessionTarget;
	session.voiceSessionClose = session.voiceTranscriptQueue.flush().then(async () => {
		const config = session.voiceConfig ?? session.context.getRuntimeConfig();
		await closeRelayVoiceSessionRecord({
			agentId,
			sessionKey,
			voiceSessionId: session.id,
			config
		});
	}).catch((error) => {
		logRelayVoiceFailure(session, "realtime relay voice session close failed", error);
	});
	drainingRelaySessions.add(session);
	session.voiceSessionClose.finally(() => {
		drainingRelaySessions.delete(session);
	});
	return session.voiceSessionClose;
}
//#endregion
//#region src/gateway/talk-relay-audio-base64.ts
function decodeTalkRelayAudioBase64(base64, label) {
	const canonicalBase64 = canonicalizeBase64(base64.replace(/-/gu, "+").replace(/_/gu, "/"));
	if (!canonicalBase64) throw new Error(`${label} audio frame is invalid base64`);
	const audio = Buffer.from(canonicalBase64, "base64");
	if (audio.toString("base64") !== canonicalBase64) throw new Error(`${label} audio frame is invalid base64`);
	return audio;
}
//#endregion
//#region src/gateway/talk-relay-session-lifecycle.ts
function isExpiredTalkRelaySession(session, validNowMs) {
	const expiresAtMs = asDateTimestampMs(session.expiresAtMs);
	return expiresAtMs === void 0 || validNowMs > expiresAtMs;
}
/** Closes every expired relay session in the provided process-local map. */
function closeExpiredTalkRelaySessions(params) {
	const validNowMs = asDateTimestampMs(params.nowMs ?? Date.now());
	if (validNowMs === void 0) return;
	for (const session of params.sessions) if (isExpiredTalkRelaySession(session, validNowMs)) params.closeSession(session);
}
/** Closes every relay session owned by a disconnected gateway connection. */
function closeTalkRelaySessionsForConnection(params) {
	for (const session of params.sessions) {
		if (session.connId !== params.connId) continue;
		try {
			params.closeSession(session);
		} catch (error) {
			params.onCloseError(error, session);
		}
	}
}
/** Returns the active session only when it belongs to the current connection. */
function requireActiveTalkRelaySession(params) {
	const session = params.sessions.get(params.sessionId);
	const nowMs = asDateTimestampMs(Date.now());
	if (!session || session.connId !== params.connId || nowMs === void 0 || isExpiredTalkRelaySession(session, nowMs)) {
		if (session) params.closeSession(session);
		throw new Error(params.unknownSessionMessage);
	}
	return session;
}
//#endregion
//#region src/gateway/talk-realtime-relay-operations.ts
const TURN_BOUND_CANCELLATION_DRAIN_MS = 1e3;
/** Ensure a gateway-relay call has its durable record before transcript-free RPCs. */
function ensureTalkRealtimeRelayVoiceSession(params) {
	const session = getRelaySession(params.relaySessionId, params.connId);
	if (session.sessionTarget.sessionKey !== params.sessionKey.trim()) throw new Error("Realtime relay session belongs to another agent session");
	if (!ensureRelayVoiceSession(session)) throw new Error("Realtime relay voice session could not be created");
}
function abortRelayAgentRuns(session, reason) {
	for (const [runId, sessionKey] of session.activeAgentRuns) abortChatRunById(session.context, {
		runId,
		sessionKey,
		stopReason: reason
	});
	session.activeAgentRuns.clear();
	session.activeAgentToolCalls.clear();
}
/** Releases relay-local correlation without cancelling durable voice-bound agent runs. */
function detachRelayAgentRuns(session) {
	session.activeAgentRuns.clear();
	session.activeAgentToolCalls.clear();
}
function pruneInactiveRelayAgentRuns(session) {
	for (const runId of session.activeAgentRuns.keys()) if (!session.context.chatAbortControllers.has(runId)) session.activeAgentRuns.delete(runId);
	for (const [callId, runId] of session.activeAgentToolCalls) if (!session.activeAgentRuns.has(runId)) session.activeAgentToolCalls.delete(callId);
	return session.activeAgentRuns.size;
}
function closeRelaySession(session, reason, options) {
	const disposition = options?.disposition ?? "abort";
	session.harness.close();
	session.outputOwnership.drain?.resolve();
	relaySessions.delete(session.id);
	forgetUnifiedTalkSession(session.id);
	clearTimeout(session.cleanupTimer);
	if (disposition === "detach") detachRelayAgentRuns(session);
	else abortRelayAgentRuns(session, reason === "error" ? "relay-error" : "relay-closed");
	try {
		session.bridge.close({ disposition });
	} finally {
		closeRelayVoiceSession(session);
		broadcastToOwner$1(session.context, session.connId, {
			relaySessionId: session.id,
			type: "close",
			reason,
			talkEvent: session.harness.talk.emit({
				type: "session.closed",
				payload: { reason },
				final: true
			})
		});
	}
}
/** Releases every realtime relay session owned by a disconnected gateway connection. */
function closeTalkRealtimeRelaySessionsForConnection(connId) {
	closeTalkRelaySessionsForConnection({
		sessions: relaySessions.values(),
		connId,
		closeSession: (session) => closeRelaySession(session, "completed", { disposition: "detach" }),
		onCloseError: (error, session) => {
			session.context.logGateway.warn(`failed to close realtime relay session after connection disconnect: ${formatErrorMessage(error)}`);
		}
	});
}
function pruneExpiredRelaySessions(nowMs = Date.now()) {
	closeExpiredTalkRelaySessions({
		sessions: relaySessions.values(),
		closeSession: (session) => closeRelaySession(session, "completed"),
		nowMs
	});
}
function countRelaySessionsForConn(connId) {
	let count = 0;
	for (const session of relaySessions.values()) if (session.connId === connId) count += 1;
	for (const session of drainingRelaySessions.values()) if (session.connId === connId) count += 1;
	return count;
}
function enforceRelaySessionLimits(connId) {
	pruneExpiredRelaySessions();
	if (relaySessions.size + drainingRelaySessions.size >= 64) throw new Error("Too many active realtime relay sessions");
	if (countRelaySessionsForConn(connId) >= 2) throw new Error("Too many active realtime relay sessions for this connection");
}
function getRelaySession(relaySessionId, connId) {
	return requireActiveTalkRelaySession({
		sessions: relaySessions,
		sessionId: relaySessionId,
		connId,
		closeSession: (session) => closeRelaySession(session, "completed"),
		unknownSessionMessage: "Unknown realtime relay session"
	});
}
/** Streams one base64-encoded browser audio frame into the owning relay. */
function sendTalkRealtimeRelayAudio(params) {
	if (params.audioBase64.length > 524288) throw new Error("Realtime relay audio frame is too large");
	const session = getRelaySession(params.relaySessionId, params.connId);
	if (session.outputOwnership.phase === "cancelling") return session.outputOwnership.drain.promise.then(() => sendTalkRealtimeRelayAudio(params));
	const audio = decodeTalkRelayAudioBase64(params.audioBase64, "Realtime relay");
	const turnId = ensureRelayTurn(session);
	session.bridge.sendAudio(audio);
	broadcastToOwner$1(session.context, session.connId, {
		relaySessionId: session.id,
		type: "inputAudio",
		byteLength: audio.byteLength,
		talkEvent: session.harness.talk.emit({
			type: "input.audio.delta",
			turnId,
			payload: { byteLength: audio.byteLength }
		})
	});
	if (typeof params.timestamp === "number" && Number.isFinite(params.timestamp)) session.bridge.setMediaTimestamp(params.timestamp);
}
/** Confirms that an owning relay client finished playing through a provider mark. */
function acknowledgeTalkRealtimeRelayMark(params) {
	getRelaySession(params.relaySessionId, params.connId).bridge.acknowledgeMark(params.markName);
}
/** Delivers a tool result from the browser/client side back to the provider. */
function submitTalkRealtimeRelayToolResult(params) {
	const session = getRelaySession(params.relaySessionId, params.connId);
	if (session.toolCalls.isAgentCompleted(params.callId)) return;
	if (session.outputOwnership.phase === "cancelling" && !session.toolCalls.hasCancelled(params.callId)) return;
	if (!session.toolCalls.tryAdmit([params.callId])) return;
	const pendingFinal = session.pendingFinalToolResults.get(params.callId);
	const cancelledAgentCall = session.toolCalls.hasCancelled(params.callId);
	if (pendingFinal && !cancelledAgentCall) return pendingFinal;
	const forcedConsult = session.harness.forcedConsults.handles().find((handle) => handle.id === params.callId);
	if (forcedConsult) return submitForcedTalkRealtimeRelayToolResult(session, forcedConsult, {
		callId: params.callId,
		result: params.result,
		options: params.options
	});
	if (cancelledAgentCall) {
		const providerResult = buildRealtimeVoiceAgentCancelProviderResult("OpenClaw cancelled this consult before completion. Do not restart it.");
		const submitCancellation = () => submitFinalProviderToolResult({
			session,
			callId: params.callId,
			result: providerResult,
			options: suppressedToolResultOptions(session),
			onAccepted: () => {
				session.toolCalls.deleteCancelled(params.callId);
				session.toolCalls.markAgentCompleted([params.callId]);
			}
		});
		const pendingProvider = session.pendingProviderToolResults.get(params.callId);
		const completion = pendingProvider ? pendingProvider.then(submitCancellation, submitCancellation) : submitCancellation();
		return trackAgentFinalToolResult(session, params.callId, completion);
	}
	if (params.options?.suppressResponse === true && session.bridge.bridge.supportsToolResultSuppression === false) throw new Error("Realtime provider does not support suppressed tool results");
	const final = params.options?.willContinue !== true;
	const turnId = ensureRelayTurn(session);
	const epoch = session.toolResultEpoch;
	const onAccepted = () => {
		if (session.toolResultEpoch !== epoch) return;
		if (final) {
			clearRelayAgentToolCall(session, params.callId);
			if (!session.toolCalls.markAgentCompleted([params.callId])) return;
		}
		broadcastToolResultToOwner(session, {
			callId: params.callId,
			turnId,
			result: params.result,
			final
		});
	};
	if (final) {
		const completion = submitFinalProviderToolResult({
			session,
			callId: params.callId,
			result: params.result,
			options: params.options,
			onAccepted
		});
		return trackAgentFinalToolResult(session, params.callId, completion);
	}
	const submit = () => session.bridge.submitToolResult(resolveRelayProviderToolCallId(session, params.callId), params.result, params.options);
	const pendingWorking = session.pendingWorkingToolResults.get(params.callId);
	if (pendingWorking) {
		const completion = pendingWorking.then(async () => {
			if (relaySessions.get(session.id) !== session || session.toolResultEpoch !== epoch) return false;
			await submit();
			return true;
		}).then((submitted) => {
			if (submitted && relaySessions.get(session.id) === session) onAccepted();
		});
		return trackPendingWorkingToolResult(session, params.callId, completion);
	}
	const completion = completeAfterToolResultSubmissions(session, [submit()], onAccepted);
	return trackPendingWorkingToolResult(session, params.callId, completion);
}
/** Tracks the chat run started for a realtime agent-consult tool call. */
function registerTalkRealtimeRelayAgentRun(params) {
	const session = getRelaySession(params.relaySessionId, params.connId);
	const callId = params.callId?.trim();
	if (callId && session.toolCalls.isAgentCompleted(callId)) {
		abortChatRunById(session.context, {
			runId: params.runId,
			sessionKey: params.sessionKey,
			stopReason: "realtime provider cancelled tool call"
		});
		throw new Error("Realtime provider cancelled the tool call before run registration");
	}
	if (callId && !session.toolCalls.tryAdmit([callId])) throw new Error("Realtime relay tool-call session limit exceeded");
	session.activeAgentRuns.set(params.runId, params.sessionKey);
	if (callId) session.activeAgentToolCalls.set(callId, params.runId);
	if (!ensureRelayVoiceSession(session)) throw new Error("Realtime relay voice session could not be created for agent consult");
	const { agentId, sessionKey } = session.sessionTarget;
	registerClientVoiceConsultRun({
		agentId,
		sessionKey,
		voiceSessionId: session.id,
		runId: params.runId
	});
}
/** Retires one provider-owned tool call and aborts its exact relay consult, if started. */
function cancelTalkRealtimeRelayProviderToolCall(session, providerCallId) {
	const mappedRelayCallId = session.relayToolCallIdsByProviderId.get(providerCallId);
	if (!mappedRelayCallId) return;
	const forcedConsult = session.harness.forcedConsults.handles().find((handle) => session.harness.forcedConsults.nativeCallIds(handle).includes(providerCallId));
	const relayCallId = forcedConsult?.id ?? mappedRelayCallId;
	if (session.toolCalls.isAgentCompleted(relayCallId) || session.toolCalls.isAgentCompleted(mappedRelayCallId) || session.toolCalls.isProviderCompleted(providerCallId)) return;
	if (forcedConsult) {
		session.harness.forcedConsults.markCancelled(forcedConsult);
		if (!session.toolCalls.markCancelled([relayCallId], ensureRelayTurn(session))) return;
	} else session.toolCalls.deleteCancelled(relayCallId);
	if (!session.toolCalls.markAgentCompleted([relayCallId, mappedRelayCallId]) || !session.toolCalls.markProviderCompleted([providerCallId])) return;
	const runId = session.activeAgentToolCalls.get(relayCallId);
	const sessionKey = runId ? session.activeAgentRuns.get(runId) : void 0;
	if (runId && sessionKey) abortChatRunById(session.context, {
		runId,
		sessionKey,
		stopReason: "realtime provider cancelled tool call"
	});
	clearRelayAgentToolCall(session, relayCallId);
	session.providerToolCallIds.delete(mappedRelayCallId);
	session.relayToolCallIdsByProviderId.delete(providerCallId);
	return relayCallId;
}
/** Wait for server-owned final transcript appends before a relay consult is authorized. */
async function flushTalkRealtimeRelayVoiceWrites(params) {
	await getRelaySession(params.relaySessionId, params.connId).voiceTranscriptQueue.flush();
}
/** Applies realtime voice-control text to the active agent-consult chat run. */
async function steerTalkRealtimeRelayAgentRun(params) {
	const session = getRelaySession(params.relaySessionId, params.connId);
	const { sessionKey, canonicalKey } = session.sessionTarget;
	const requestedSessionKey = params.sessionKey?.trim();
	if (requestedSessionKey && requestedSessionKey !== sessionKey) throw new Error("Realtime relay steering session key does not match the relay session");
	const runTarget = resolveOwnedActiveTalkRunTarget({
		context: session.context,
		clientConnId: session.connId,
		sessionTarget: session.sessionTarget,
		assertCurrent: () => {
			params.assertCurrent?.();
			if (relaySessions.get(session.id) !== session) throw new Error("Realtime relay session closed while steering the agent run");
		}
	});
	const result = await controlRealtimeVoiceAgentRun({
		sessionKey: canonicalKey,
		runTarget,
		text: params.text,
		mode: params.mode,
		recentEvents: session.harness.talk.recentEvents
	});
	if (relaySessions.get(session.id) !== session) throw new Error("Realtime relay session closed while steering the agent run");
	const turnId = ensureRelayTurn(session);
	const providerSubmission = submitRelayAgentControlProviderResults(session, result, turnId);
	if (providerSubmission?.completion) await providerSubmission.completion;
	const finalResult = providerSubmission?.providerResponseStarted ? {
		...result,
		suppress: true
	} : result;
	if (relaySessions.get(session.id) !== session) return finalResult;
	broadcastToOwner$1(session.context, session.connId, {
		relaySessionId: session.id,
		type: "toolProgress",
		result: finalResult,
		talkEvent: session.harness.talk.emit({
			type: "tool.progress",
			turnId,
			payload: {
				name: "openclaw_agent_control",
				phase: finalResult.mode,
				result: finalResult
			},
			final: finalResult.mode === "cancel" || finalResult.mode === "status"
		})
	});
	return finalResult;
}
/** Cancels the active relay turn, aborts agent work, and clears provider audio. */
async function cancelTalkRealtimeRelayTurn(params) {
	const session = getRelaySession(params.relaySessionId, params.connId);
	const turnId = session.harness.talk.activeTurnId;
	if (!turnId) return { status: "idle" };
	const requestedTurnId = normalizeOptionalString(params.turnId);
	if (requestedTurnId && turnId !== requestedTurnId) return { status: "stale" };
	if (session.outputOwnership.phase === "owned" && session.outputOwnership.turnId !== turnId) return { status: "stale" };
	const forcedConsults = session.harness.forcedConsults.handles().map((handle) => ({
		handle,
		nativeCallIds: session.harness.forcedConsults.nativeCallIds(handle)
	}));
	const rootCallIds = /* @__PURE__ */ new Set([...session.activeAgentToolCalls.keys(), ...forcedConsults.map(({ handle }) => handle.id)]);
	const playbackOverflowCancellation = (params.reason ?? "client-cancelled") === "playback-overflow";
	const playbackOnlyCancellation = playbackOverflowCancellation || (session.outputOwnership.phase === "unowned" && rootCallIds.size === 0);
	const terminalEpoch = ++session.toolResultEpoch;
	session.forcedTerminalProviderResults.clear();
	const reason = params.reason ?? "client-cancelled";
	if (playbackOnlyCancellation) {
		// A full playback queue must not end the turn. cancelTurn clears
		// activeTurnId, and the audio still streaming then resolves against no
		// active turn, which is the same "no live response owner" failure by a
		// different route. Overflow only needs the client to drop what it has
		// queued, and it must not lose what is already queued either.
		const cancelled = playbackOverflowCancellation ? void 0 : session.harness.talk.cancelTurn({
			turnId,
			payload: { reason }
		});
		// Clearing tells the client to drop everything already queued. On an
		// overflow that queue is exactly the audio the user has not heard yet,
		// so clearing turns a full buffer into a hole in the middle of the
		// reply. The frame that overflowed is already refused by the client.
		if (!playbackOverflowCancellation) broadcastToOwner$1(session.context, session.connId, {
			relaySessionId: session.id,
			type: "clear",
			talkEvent: cancelled?.ok ? cancelled.event : void 0
		});
		return {
			status: "applied",
			turnId
		};
	}
	if (!session.toolCalls.markCancelled([...rootCallIds, ...forcedConsults.flatMap(({ nativeCallIds }) => nativeCallIds)], turnId)) throw new Error("Realtime relay cancellation could not record tool state");
	for (const { handle, nativeCallIds } of forcedConsults) {
		session.harness.forcedConsults.markCancelled(handle);
		session.forcedTerminalProviderResults.set(handle.id, {
			result: buildRealtimeVoiceAgentCancelProviderResult("OpenClaw cancelled this consult before completion. Do not restart it."),
			options: suppressedToolResultOptions(session),
			turnId,
			epoch: terminalEpoch,
			nativeCallIds
		});
	}
	session.outputOwnership.phase = "cancelling";
	session.outputOwnership.turnId = turnId;
	const cancellationDrained = session.outputOwnership.drain = createDeferredCore();
	abortRelayAgentRuns(session, reason);
	const cancelled = session.harness.talk.cancelTurn({
		turnId,
		payload: { reason }
	});
	broadcastToOwner$1(session.context, session.connId, {
		relaySessionId: session.id,
		type: "clear",
		talkEvent: cancelled.ok ? cancelled.event : void 0
	});
	const finishCancellationAfterProviderTimeout = () => {
		if (relaySessions.get(session.id) === session && session.toolResultEpoch === terminalEpoch && session.outputOwnership.phase === "cancelling") {
			// Retire the cancelled generation before releasing queued input. Leaving
			// phase=cancelling with an already-resolved drain recursively requeues
			// every audio frame and eventually exhausts the Gateway heap.
			session.outputOwnership.finish(session.outputOwnership.responseId, true);
		}
	};
	setTimeout(finishCancellationAfterProviderTimeout, TURN_BOUND_CANCELLATION_DRAIN_MS).unref?.();
	Promise.allSettled([...rootCallIds].map(async (callId) => {
		await submitTalkRealtimeRelayToolResult({
			relaySessionId: session.id,
			connId: session.connId,
			callId,
			result: { status: "cancelled" }
		});
	}));
	try {
		session.bridge.handleBargeIn({ audioPlaybackActive: true });
	} catch {
		session.failSession("Realtime provider cancellation failed. Reconnecting.");
	}
	return cancellationDrained.promise.then(() => ({
		status: "applied",
		turnId
	}));
}
/** Drops one provider generation without sending cancellation into its replacement. */
function resetTalkRealtimeRelayContinuity(session, reason = "session.continuity.reset") {
	session.toolResultEpoch += 1;
	const retiredCallIds = /* @__PURE__ */ new Set([
		...session.activeAgentToolCalls.keys(),
		...session.toolCalls.cancelledCallIds(),
		...session.providerToolCallIds.keys(),
		...session.providerToolCallIds.values(),
		...session.pendingFinalToolResults.keys(),
		...session.pendingProviderToolResults.keys(),
		...session.pendingWorkingToolResults.keys(),
		...session.forcedTerminalProviderResults.keys()
	]);
	for (const handle of session.harness.forcedConsults.handles()) {
		retiredCallIds.add(handle.id);
		for (const nativeCallId of session.harness.forcedConsults.nativeCallIds(handle)) retiredCallIds.add(nativeCallId);
	}
	if (!session.toolCalls.markAgentCompleted(retiredCallIds)) return;
	session.toolCalls.clearCancelled();
	session.providerToolCallIds.clear();
	session.relayToolCallIdsByProviderId.clear();
	session.pendingFinalToolResults.clear();
	session.toolCalls.clearProviderCompleted();
	session.pendingProviderToolResults.clear();
	session.pendingWorkingToolResults.clear();
	session.forcedTerminalProviderResults.clear();
	session.harness.forcedConsults.clear();
	abortRelayAgentRuns(session, reason);
	const turnId = session.harness.talk.activeTurnId;
	session.harness.flushOutput(noFallbackRelayOutputFlush);
	session.harness.finishOutputAudio(reason);
	if (!turnId) return;
	const cancelled = session.harness.talk.cancelTurn({
		turnId,
		payload: { reason }
	});
	return cancelled.ok ? cancelled.event : void 0;
}
/** Closes a realtime relay session owned by the current connection. */
function stopTalkRealtimeRelaySession(params) {
	closeRelaySession(getRelaySession(params.relaySessionId, params.connId), "completed");
}
//#endregion
//#region src/gateway/talk-realtime-relay-tool-call-ledger.ts
const MAX_RELAY_TOOL_CALL_IDENTITIES = 2048;
const MAX_RELAY_TOOL_CALL_IDENTITY_BYTES = 1048576;
var RelayToolCallLedger = class {
	constructor(options) {
		this.options = options;
		this.entries = /* @__PURE__ */ new Map();
		this.retainedBytes = 0;
		this.overflowReported = false;
	}
	get size() {
		return this.entries.size;
	}
	has(callId) {
		return this.entries.has(callId);
	}
	tryAdmit(callIds) {
		const uniqueCallIds = new Set(callIds);
		const additions = [];
		let additionBytes = 0;
		for (const callId of uniqueCallIds) if (callId && !this.entries.has(callId)) {
			const bytes = Buffer$1.byteLength(callId, "utf8");
			additions.push({
				callId,
				bytes
			});
			additionBytes += bytes;
		}
		const maxEntries = this.options.maxEntries ?? 2048;
		const maxBytes = this.options.maxBytes ?? 1048576;
		if (this.entries.size + additions.length > maxEntries || this.retainedBytes + additionBytes > maxBytes) {
			if (!this.overflowReported) {
				this.overflowReported = true;
				this.options.onOverflow();
			}
			return false;
		}
		for (const addition of additions) {
			this.entries.set(addition.callId, {});
			this.retainedBytes += addition.bytes;
		}
		return true;
	}
	mark(callIds, mutate) {
		const retainedCallIds = [...callIds];
		if (!this.tryAdmit(retainedCallIds)) return false;
		for (const callId of retainedCallIds) {
			const entry = this.entries.get(callId);
			if (entry) mutate(entry);
		}
		return true;
	}
	isAgentCompleted(callId) {
		return this.entries.get(callId)?.agentCompleted === true;
	}
	markAgentCompleted(callIds) {
		return this.mark(callIds, (entry) => {
			entry.agentCompleted = true;
			delete entry.cancelledTurnId;
		});
	}
	deleteAgentCompleted(callId) {
		delete this.entries.get(callId)?.agentCompleted;
	}
	isProviderCompleted(callId) {
		return this.entries.get(callId)?.providerCompleted === true;
	}
	markProviderCompleted(callIds) {
		return this.mark(callIds, (entry) => {
			entry.providerCompleted = true;
		});
	}
	deleteProviderCompleted(callId) {
		delete this.entries.get(callId)?.providerCompleted;
	}
	clearProviderCompleted() {
		for (const entry of this.entries.values()) delete entry.providerCompleted;
	}
	hasCancelled(callId) {
		return this.entries.get(callId)?.cancelledTurnId !== void 0;
	}
	cancelledTurnId(callId) {
		return this.entries.get(callId)?.cancelledTurnId;
	}
	markCancelled(callIds, turnId) {
		return this.mark(callIds, (entry) => {
			if (!entry.agentCompleted && entry.cancelledTurnId === void 0) entry.cancelledTurnId = turnId;
		});
	}
	deleteCancelled(callId) {
		delete this.entries.get(callId)?.cancelledTurnId;
	}
	cancelledCallIds() {
		return [...this.entries].filter(([, entry]) => entry.cancelledTurnId !== void 0).map(([callId]) => callId);
	}
	clearCancelled() {
		for (const entry of this.entries.values()) delete entry.cancelledTurnId;
	}
};
//#endregion
//#region src/gateway/talk-realtime-relay-session-create.ts
const RELAY_OUTPUT_AUDIO_FRAME_BYTES = 960;
function isRelayAssistantEchoTranscript(session, text) {
	return session?.harness.isLikelyAssistantEchoTranscript(text) ?? false;
}
/** Creates a realtime voice relay session and returns the browser audio contract. */
function createTalkRealtimeRelaySession(params) {
	enforceRelaySessionLimits(params.connId);
	const forceAgentConsultOnFinalTranscript = params.forceAgentConsultOnFinalTranscript === true;
	const relaySessionId = randomUUID();
	const expiresAtMs = resolveExpiresAtMsFromDurationMs(RELAY_SESSION_TTL_MS);
	if (expiresAtMs === void 0) throw new Error("Realtime relay session expiry is outside the supported Date range");
	const harness = createRealtimeVoiceSessionHarness({
		talk: {
			sessionId: relaySessionId,
			mode: "realtime",
			transport: "gateway-relay",
			brain: "agent-consult",
			provider: params.provider.id,
			maxRecentEvents: 20
		},
		talkPayloads: {
			turnStarted: () => ({}),
			turnEnded: (reason) => ({ reason }),
			inputAudioDelta: (audio) => ({ byteLength: audio.byteLength }),
			outputAudioStarted: () => ({}),
			outputAudioDelta: (audio) => ({ byteLength: audio.byteLength }),
			outputAudioDone: (reason) => ({ reason })
		},
		transcriptLookbackMs: RELAY_TRANSCRIPT_ECHO_LOOKBACK_MS,
		captureBridgeEvents: false
	});
	const emit = (event, talkEvent) => broadcastToOwner$1(params.context, params.connId, {
		...event,
		...talkEvent ? { talkEvent: harness.emit(talkEvent) } : {}
	});
	let currentOutputItemId;
	let ready = false;
	let continuityResetActive = false;
	let failureEmitted = false;
	let sessionFailureRequested = false;
	const constructionTerminal = {};
	const relayRef = {};
	const getActiveRelay = () => {
		const relay = relayRef.current;
		return relay && relaySessions.get(relay.id) === relay ? relay : void 0;
	};
	const bridgeRef = {};
	const outputOwnership = new TalkRealtimeRelayOutputOwnership(() => harness.talk.activeTurnId, () => harness.ensureTurn(), (message) => {
		const relay = getActiveRelay();
		relay?.failSession(message);
		if (!relay) constructionTerminal.current ??= {
			kind: "error",
			error: new Error(message)
		};
	});
	const { agentId: relayAgentId, canonicalKey } = params.sessionTarget;
	const configuredAgentModel = typeof params.providerConfig?.agentModel === "string" ? params.providerConfig.agentModel.trim() : "";
	const configuredAgentModelSeparator = configuredAgentModel.indexOf("/");
	const configuredAgentProvider = configuredAgentModelSeparator > 0 ? configuredAgentModel.slice(0, configuredAgentModelSeparator) : void 0;
	const configuredAgentModelId = configuredAgentModelSeparator > 0 && configuredAgentModelSeparator < configuredAgentModel.length - 1 ? configuredAgentModel.slice(configuredAgentModelSeparator + 1) : void 0;
	const consultRunner = createTalkClientAgentConsultRunner({
		config: params.cfg ?? params.context.getRuntimeConfig(),
		provider: configuredAgentProvider,
		model: configuredAgentModelId,
		context: params.context,
		sessionTarget: params.sessionTarget,
		ownerConnId: params.connId,
		authority: params.consultAuthority,
		getVoiceSessionId: () => relaySessionId,
		initialItems: [],
		runIdPrefix: "talk-realtime-relay-consult",
		surface: "a gateway-relay Talk session",
		registerRun: ({ runId }) => registerTalkRealtimeRelayAgentRun({
			relaySessionId,
			connId: params.connId,
			sessionKey: canonicalKey,
			runId
		})
	});
	const runAgentConsult = async ({ prompt, signal, onProgress }) => {
		if (!getActiveRelay()) throw new Error("Realtime gateway-relay session is closed");
		return await consultRunner.runPrompt({
			prompt,
			signal,
			onProgress
		});
	};
	const runControl = createTalkRealtimeRunControlOwner({
		hasActiveRun: () => {
			const relay = getActiveRelay();
			return Boolean(relay && pruneInactiveRelayAgentRuns(relay) > 0);
		},
		execute: async (args) => {
			if (!getActiveRelay() || !args || typeof args !== "object" || Array.isArray(args)) throw new Error("Realtime relay control session is closed");
			const text = args.text;
			if (typeof text !== "string") throw new Error("Realtime relay control text is required");
			return await steerTalkRealtimeRelayAgentRun({
				relaySessionId,
				connId: params.connId,
				text
			});
		},
		speak: (message) => bridgeRef.current?.sendUserMessage?.(message),
		warn: (message) => {
			if (!getActiveRelay()) return;
			emit({
				relaySessionId,
				type: "error",
				message
			}, {
				type: "session.error",
				payload: { message },
				final: true
			});
		}
	});
	const relayProvider = outputOwnership.bind(params.provider, runAgentConsult);
	const bridge = harness.createBridge({
		provider: relayProvider,
		cfg: params.cfg,
		agentId: relayAgentId,
		providerConfig: params.providerConfig,
		audioFormat: REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ,
		instructions: params.instructions,
		language: params.language,
		autoRespondToAudio: !forceAgentConsultOnFinalTranscript,
		interruptResponseOnInputAudio: !forceAgentConsultOnFinalTranscript,
		tools: params.tools,
		markStrategy: "transport",
		audioSink: {
			isOpen: () => Boolean(getActiveRelay()),
			sendAudio: (audio) => {
				if (!getActiveRelay()) return;
				if (outputOwnership.phase === "cancelling") return;
				const outputTurnId = outputOwnership.resolve(true);
				if (!outputTurnId) return;
				for (let offset = 0; offset < audio.byteLength; offset += RELAY_OUTPUT_AUDIO_FRAME_BYTES) {
					const frame = audio.subarray(offset, Math.min(offset + RELAY_OUTPUT_AUDIO_FRAME_BYTES, audio.byteLength));
					emit({
						relaySessionId,
						type: "audio",
						audioBase64: frame.toString("base64"),
						...currentOutputItemId ? { itemId: currentOutputItemId } : {},
						...outputOwnership.responseId ? { responseId: outputOwnership.responseId } : {}
					}, {
						type: "output.audio.delta",
						turnId: outputTurnId,
						payload: { byteLength: frame.byteLength }
					});
				}
			},
			clearAudio: (reason) => {
				if (!getActiveRelay()) return;
				const outputTurnId = outputOwnership.resolve(false);
				if (!outputTurnId) return;
				emit({
					relaySessionId,
					type: "clear",
					...reason ? { reason } : {}
				}, {
					type: "output.audio.done",
					turnId: outputTurnId,
					payload: { reason: reason ?? "clear" },
					final: true
				});
			},
			sendMark: (markName) => {
				if (!getActiveRelay()) return;
				const outputTurnId = outputOwnership.resolve(false);
				if (!outputTurnId) {
					if (outputOwnership.phase !== "owned") bridgeRef.current?.acknowledgeMark(markName);
					return;
				}
				emit({
					relaySessionId,
					type: "mark",
					markName
				}, {
					type: "output.audio.done",
					turnId: outputTurnId,
					payload: { markName },
					final: true
				});
			}
		},
		onEvent: (event) => {
			const relay = getActiveRelay();
			if (!relay) return;
			if (event.direction === "client" && event.type === "session.continuity.reset") {
				if (continuityResetActive) return;
				continuityResetActive = true;
				ready = false;
				currentOutputItemId = void 0;
				outputOwnership.outputGeneration += 1;
				outputOwnership.drain?.resolve();
				outputOwnership.mode = "turn-bound";
				outputOwnership.phase = "unowned";
				outputOwnership.turnId = outputOwnership.responseId = void 0;
				const talkEvent = resetTalkRealtimeRelayContinuity(relay, event.type);
				if (!getActiveRelay()) return;
				const clearEvent = {
					relaySessionId,
					type: "clear"
				};
				broadcastToOwner$1(params.context, params.connId, {
					...clearEvent,
					...talkEvent ? { talkEvent } : {}
				});
				return;
			}
			if (event.direction !== "server") return;
			if (event.type === "session.created") continuityResetActive = false;
			if ((event.type === "response.done" || event.type === "response.cancelled") && outputOwnership.finish(event.responseId, true) === "cancelled") {
				currentOutputItemId = void 0;
				return;
			}
			if (event.type === "tool.call.cancelled" && event.itemId) {
				const relayCallId = cancelTalkRealtimeRelayProviderToolCall(relay, event.itemId);
				if (relayCallId) {
					const cancelledEvent = {
						relaySessionId,
						type: "toolCallCancelled",
						callId: relayCallId
					};
					broadcastToOwner$1(params.context, params.connId, cancelledEvent);
				}
				return;
			}
			if (event.type === "conversation.output_audio.delta" || event.type === "response.audio.delta" || event.type === "response.output_audio.delta") {
				currentOutputItemId = event.itemId ?? currentOutputItemId;
				outputOwnership.responseId = event.responseId ?? outputOwnership.responseId;
			}
		},
		onResponseDone: (outcome) => {
			if (!getActiveRelay()) return;
			const responseId = outcome.responseId ?? outputOwnership.responseId;
			const disposition = outputOwnership.finish(responseId);
			if (disposition === "ignore") return;
			if (disposition === "cancelled") {
				currentOutputItemId = void 0;
				return;
			}
			const terminalTalkEvent = harness.talk.recentEvents.at(-1);
			broadcastToOwner$1(params.context, params.connId, {
				relaySessionId,
				type: "audioDone",
				...currentOutputItemId ? { itemId: currentOutputItemId } : {},
				...responseId ? { responseId } : {},
				...terminalTalkEvent && (terminalTalkEvent.type === "turn.ended" || terminalTalkEvent.type === "turn.cancelled") ? { talkEvent: terminalTalkEvent } : {}
			});
			currentOutputItemId = void 0;
			if (outcome.status === "failed" || outcome.status === "incomplete") {
				const issue = createTalkRealtimeRelayIssue({
					message: outcome.message,
					provider: params.provider.id,
					model: params.model,
					phase: "response"
				});
				const errorTalkEvent = harness.talk.recentEvents.findLast((event) => event.type === "session.error" && event.payload === outcome);
				broadcastToOwner$1(params.context, params.connId, {
					...buildTalkRealtimeRelayIssuePayload(relaySessionId, issue),
					...errorTalkEvent ? { talkEvent: errorTalkEvent } : {}
				});
			}
		},
		onTranscript: (role, text, final) => {
			const relay = getActiveRelay();
			if (!relay) return;
			if (role === "user" && final && outputOwnership.phase === "cancelling") outputOwnership.finish(outputOwnership.responseId, true);
			if (role === "assistant" && outputOwnership.phase === "cancelling") return;
			if (final && !enqueueRelayVoiceTranscript(relay, role, text)) return;
			const outputTurnId = role === "assistant" ? outputOwnership.resolve(true) : void 0;
			if (role === "assistant" && !outputTurnId) return;
			const turnId = outputTurnId ?? ensureRelayTurn(relay);
			emit({
				relaySessionId,
				type: "transcript",
				role,
				text,
				final
			}, {
				type: role === "assistant" ? final ? "output.text.done" : "output.text.delta" : final ? "transcript.done" : "transcript.delta",
				turnId,
				payload: role === "assistant" ? { text } : {
					role,
					text
				},
				final
			});
			if (role === "user" && final && text.trim()) {
				const question = text.trim();
				if (isRelayAssistantEchoTranscript(relay, question)) return;
				if (runControl.handleSpoken(question)) return;
				if (forceAgentConsultOnFinalTranscript) scheduleForcedAgentConsult(relay, question);
			}
		},
		onToolCall: (toolCall) => {
			const relay = getActiveRelay();
			if (!relay) return;
			if (outputOwnership.phase === "cancelling") return;
			const outputTurnId = outputOwnership.resolve(true);
			if (!outputTurnId) return;
			const providerCallId = toolCall.callId;
			const relayCallId = adoptRelayProviderToolCallId(relay, providerCallId);
			if (!relayCallId) return;
			let shouldSubmitWorkingResult = false;
			if (toolCall.name === "openclaw_agent_consult") {
				const forcedConsult = relay.harness.forcedConsults.recordNativeConsult(toolCall.args, providerCallId);
				if (forcedConsult.kind === "in_flight" || forcedConsult.kind === "already_delivered") {
					if (forcedConsult.kind === "already_delivered") return submitForcedConsultProviderResult(relay, providerCallId, relay.harness.forcedConsults.isCancelled(forcedConsult.handle) ? buildRealtimeVoiceAgentCancelProviderResult("OpenClaw cancelled this consult before completion. Do not restart it.") : buildAlreadyDeliveredToolResult(), suppressedToolResultOptions(relay));
					if (relay.forcedTerminalProviderResults.has(forcedConsult.handle.id)) return relay.pendingFinalToolResults.get(forcedConsult.handle.id);
					return submitRealtimeAgentConsultWorkingResponse(relay, relayCallId);
				}
				shouldSubmitWorkingResult = true;
			}
			emit({
				relaySessionId,
				type: "toolCall",
				itemId: toolCall.itemId,
				callId: relayCallId,
				name: toolCall.name,
				args: toolCall.args
			}, {
				type: "tool.call",
				itemId: toolCall.itemId,
				callId: relayCallId,
				turnId: outputTurnId,
				payload: {
					name: toolCall.name,
					args: toolCall.args
				}
			});
			if (shouldSubmitWorkingResult) return submitRealtimeAgentConsultWorkingResponse(relay, relayCallId, outputTurnId);
		},
		onReady: () => {
			if (!getActiveRelay()) return;
			ready = true;
			continuityResetActive = false;
			emit({
				relaySessionId,
				type: "ready"
			}, {
				type: "session.ready",
				payload: null
			});
		},
		onError: (error) => {
			if (!getActiveRelay()) {
				if (!relayRef.current) constructionTerminal.current ??= {
					kind: "error",
					error
				};
				return;
			}
			const issue = createTalkRealtimeRelayIssue({
				message: formatErrorMessage(error),
				provider: params.provider.id,
				model: params.model,
				phase: ready ? "stream" : "connect"
			});
			failureEmitted = true;
			emit(buildTalkRealtimeRelayIssuePayload(relaySessionId, issue), {
				type: "session.error",
				payload: issue,
				final: true
			});
		},
		onClose: (reason) => {
			runControl.close();
			const active = getActiveRelay();
			if (!active) {
				if (!relayRef.current) constructionTerminal.current ??= {
					kind: "close",
					reason
				};
				return;
			}
			if (!ready && !failureEmitted) {
				const issue = createTalkRealtimeRelayIssue({
					message: "Realtime provider closed before the session became ready.",
					provider: params.provider.id,
					model: params.model,
					phase: "connect"
				});
				emit(buildTalkRealtimeRelayIssuePayload(relaySessionId, issue), {
					type: "session.error",
					payload: issue,
					final: true
				});
			}
			closeRelaySession(active, reason);
		}
	});
	bridgeRef.current = bridge;
	const earlyTerminal = constructionTerminal.current;
	if (earlyTerminal) {
		harness.close();
		try {
			bridge.close();
		} catch (error) {
			params.context.logGateway.warn(`failed to close realtime relay bridge after provider terminated during creation: ${formatErrorMessage(error)}`);
		}
		if (earlyTerminal.kind === "error") throw earlyTerminal.error;
		throw new Error(`Realtime provider closed during session creation: ${earlyTerminal.reason}`);
	}
	const failSession = (message) => {
		const active = relaySessions.get(relaySessionId);
		if (!active || sessionFailureRequested) return;
		sessionFailureRequested = true;
		if (!failureEmitted) {
			failureEmitted = true;
			emit({
				relaySessionId,
				type: "error",
				message
			}, {
				type: "session.error",
				payload: { message },
				final: true
			});
		}
		closeRelaySession(active, "error");
	};
	const relay = {
		id: relaySessionId,
		connId: params.connId,
		context: params.context,
		bridge,
		harness,
		outputOwnership,
		sessionTarget: params.sessionTarget,
		expiresAtMs,
		cleanupTimer: setTimeout(() => {
			const active = relaySessions.get(relaySessionId);
			if (active) closeRelaySession(active, "completed");
		}, RELAY_SESSION_TTL_MS),
		activeAgentRuns: /* @__PURE__ */ new Map(),
		provider: params.provider.id,
		activeAgentToolCalls: /* @__PURE__ */ new Map(),
		toolCalls: new RelayToolCallLedger({ onOverflow: () => failSession(`Realtime relay tool-call session limit exceeded (${MAX_RELAY_TOOL_CALL_IDENTITIES} identities or ${MAX_RELAY_TOOL_CALL_IDENTITY_BYTES} UTF-8 bytes)`) }),
		providerToolCallIds: /* @__PURE__ */ new Map(),
		relayToolCallIdsByProviderId: /* @__PURE__ */ new Map(),
		pendingFinalToolResults: /* @__PURE__ */ new Map(),
		pendingProviderToolResults: /* @__PURE__ */ new Map(),
		pendingWorkingToolResults: /* @__PURE__ */ new Map(),
		forcedTerminalProviderResults: /* @__PURE__ */ new Map(),
		toolResultEpoch: 0,
		...params.cfg ? { voiceConfig: params.cfg } : {},
		voiceSessionCreated: false,
		voiceTranscriptSeq: 0,
		voiceTranscriptQueue: VOICE_TRANSCRIPT_QUEUE_POLICY.createQueue(),
		failSession
	};
	relayRef.current = relay;
	relay.cleanupTimer.unref?.();
	relaySessions.set(relaySessionId, relay);
	registerTalkConnectionCleanup(params.connId, "realtime-relay", () => {
		closeTalkRealtimeRelaySessionsForConnection(params.connId);
	});
	bridge.connect().catch((error) => {
		const active = relaySessions.get(relaySessionId);
		if (active !== relay) return;
		const issue = createTalkRealtimeRelayIssue({
			message: formatErrorMessage(error),
			provider: params.provider.id,
			model: params.model,
			phase: "connect"
		});
		failureEmitted = true;
		emit(buildTalkRealtimeRelayIssuePayload(relaySessionId, issue), {
			type: "session.error",
			payload: issue,
			final: true
		});
		closeRelaySession(active, "error");
	});
	return {
		provider: params.provider.id,
		transport: "gateway-relay",
		relaySessionId,
		audio: {
			inputEncoding: "pcm16",
			inputSampleRateHz: REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ.sampleRateHz,
			outputEncoding: "pcm16",
			outputSampleRateHz: REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ.sampleRateHz
		},
		...params.model ? { model: params.model } : {},
		...params.voice ? { voice: params.voice } : {},
		expiresAt: Math.floor(expiresAtMs / 1e3)
	};
}
//#endregion
//#region src/gateway/talk-agent-consult.ts
function normalizeTalkChatSendAckStatus(result) {
	if (!result || typeof result !== "object" || Array.isArray(result)) return "started";
	const status = result.status;
	return status === "in_flight" || status === "ok" || status === "timeout" || status === "error" ? status : "started";
}
function terminalTalkChatSendAckError(status) {
	if (status === "timeout") return errorShape(ErrorCodes.UNAVAILABLE, "Realtime agent consult ended before the run started.");
	if (status === "error") return errorShape(ErrorCodes.UNAVAILABLE, "Realtime agent consult failed before the run started.");
	if (status === "ok") return errorShape(ErrorCodes.UNAVAILABLE, "Realtime agent consult completed before the tool result subscription started.");
}
/**
* Starts the agent-consult chat run that backs realtime Talk tool calls.
*/
async function startTalkRealtimeAgentConsult(request, params) {
	let message;
	try {
		message = buildRealtimeVoiceAgentConsultChatMessage(params.args);
	} catch (err) {
		return {
			ok: false,
			error: errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err))
		};
	}
	const idempotencyKey = `talk-${params.callId}-${randomUUID()}`;
	const normalizedTalk = normalizeTalkSection(request.context.getRuntimeConfig().talk);
	const authority = resolveTalkAgentConsultAuthority(request.client?.connect?.scopes);
	let acknowledgedRunId;
	const chatResponse = await new Promise((resolve) => {
		let acknowledged = false;
		const chatSendOptions = {
			...request,
			req: {
				type: "req",
				id: `${request.req.id}:talk-tool-call`,
				method: "chat.send"
			},
			params: {
				sessionKey: params.sessionTarget.canonicalKey,
				agentId: params.sessionTarget.agentId,
				message,
				idempotencyKey,
				suppressCommandInterpretation: true,
				systemInputProvenance: {
					kind: "internal_system",
					sourceTool: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME
				},
				...normalizedTalk?.consultThinkingLevel ? { thinking: normalizedTalk.consultThinkingLevel } : {},
				...typeof normalizedTalk?.consultFastMode === "boolean" ? { fastMode: normalizedTalk.consultFastMode } : {}
			},
			respond: (ok, result, error) => {
				acknowledged = true;
				if (ok && !terminalTalkChatSendAckError(normalizeTalkChatSendAckStatus(result))) {
					const candidateRunId = result && typeof result === "object" && !Array.isArray(result) ? result.runId : void 0;
					const runId = typeof candidateRunId === "string" ? candidateRunId : idempotencyKey;
					try {
						if (params.relaySessionId && params.connId) registerTalkRealtimeRelayAgentRun({
							relaySessionId: params.relaySessionId,
							connId: params.connId,
							sessionKey: params.sessionTarget.canonicalKey,
							runId,
							callId: params.callId
						});
						params.onRunStarted?.(runId);
						acknowledgedRunId = runId;
					} catch (registrationError) {
						abortChatRunById(request.context, {
							runId,
							sessionKey: params.sessionTarget.canonicalKey,
							stopReason: "voice session binding failed"
						});
						resolve({
							ok: false,
							error: errorShape(ErrorCodes.UNAVAILABLE, formatForLog(registrationError))
						});
						return;
					}
				}
				resolve(ok ? {
					ok: true,
					result
				} : {
					ok: false,
					error: error ?? errorShape(ErrorCodes.UNAVAILABLE, "chat.send failed without error")
				});
			}
		};
		const chatSendResult = handleTrustedInternalChatSend(chatSendOptions, void 0, {
			toolsAllow: authority.toolsAllow,
			transcript: {
				display: false,
				excludeFromContext: true
			}
		});
		Promise.resolve(chatSendResult).then(() => {
			if (!acknowledged) resolve(void 0);
		}, (error) => {
			if (acknowledged) {
				request.context.logGateway.warn(`realtime Talk agent consult failed after acknowledgement: ${formatForLog(error)}`);
				return;
			}
			resolve({
				ok: false,
				error: errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error))
			});
		});
	});
	if (!chatResponse) return {
		ok: false,
		error: errorShape(ErrorCodes.UNAVAILABLE, "chat.send did not return a realtime tool result")
	};
	if (!chatResponse.ok) return {
		ok: false,
		error: chatResponse.error
	};
	const result = chatResponse.result;
	const terminalAckError = terminalTalkChatSendAckError(normalizeTalkChatSendAckStatus(result));
	if (terminalAckError) return {
		ok: false,
		error: terminalAckError
	};
	if (!acknowledgedRunId) return {
		ok: false,
		error: errorShape(ErrorCodes.UNAVAILABLE, "chat.send did not acknowledge an active run")
	};
	return {
		ok: true,
		runId: acknowledgedRunId,
		idempotencyKey
	};
}
const REALTIME_VOICE_DESCRIBE_VIEW_TOOL = {
	type: "function",
	name: "describe_view",
	description: "Capture the current browser camera frame when the caller asks what is visible or needs visual context.",
	parameters: {
		type: "object",
		properties: {}
	}
};
//#endregion
//#region src/gateway/server-methods/talk-client-legacy-voice-bindings.ts
const LEGACY_VOICE_BINDING_TTL_MS = 216e5;
const legacyVoiceSessionByClient = /* @__PURE__ */ new Map();
function legacyVoiceBindingKey(connId, sessionKey) {
	return `${connId}\0${sessionKey}`;
}
function pruneLegacyVoiceBindings(now) {
	for (const [key, binding] of legacyVoiceSessionByClient) if (binding.expiresAt <= now) legacyVoiceSessionByClient.delete(key);
}
/** Pins a resolved voice session to one connection so later consults reuse it. */
function rememberLegacyVoiceBinding(params) {
	const now = Date.now();
	pruneLegacyVoiceBindings(now);
	legacyVoiceSessionByClient.set(legacyVoiceBindingKey(params.connId, params.sessionKey), {
		voiceSessionId: params.voiceSessionId,
		expiresAt: now + LEGACY_VOICE_BINDING_TTL_MS
	});
}
/** Returns the pinned voice session id, dropping it first when the TTL has passed. */
function readLegacyVoiceBinding(connId, sessionKey) {
	pruneLegacyVoiceBindings(Date.now());
	return legacyVoiceSessionByClient.get(legacyVoiceBindingKey(connId, sessionKey))?.voiceSessionId;
}
/** Releases the binding only when it still points at the closing voice session. */
function forgetLegacyVoiceBinding(connId, sessionKey, voiceSessionId) {
	const key = legacyVoiceBindingKey(connId, sessionKey);
	if (legacyVoiceSessionByClient.get(key)?.voiceSessionId === voiceSessionId) legacyVoiceSessionByClient.delete(key);
}
//#endregion
//#region src/gateway/server-methods/talk-shared.ts
/** Resolve the Talk session mode, defaulting managed-room transports to stt-tts. */
function normalizeTalkSessionMode(params) {
	return normalizeOptionalLowercaseString(params.mode) ?? (normalizeOptionalLowercaseString(params.transport) === "managed-room" ? "stt-tts" : "realtime");
}
/** Resolve the Talk session transport from mode when the client omits it. */
function normalizeTalkSessionTransport(params) {
	const transport = normalizeOptionalLowercaseString(params.transport);
	if (transport) return transport;
	return params.mode === "stt-tts" ? "managed-room" : "gateway-relay";
}
/** Resolve the Talk session brain, defaulting transcription sessions to none. */
function normalizeTalkSessionBrain(params) {
	const brain = normalizeOptionalLowercaseString(params.brain);
	if (brain) return brain;
	return params.mode === "transcription" ? "none" : "agent-consult";
}
async function resolveTalkRealtimeProviderInstructions(params) {
	const bootstrapContext = await resolveRealtimeBootstrapContextInstructions(params);
	return [params.configuredInstructions, bootstrapContext].filter((entry) => Boolean(entry?.trim())).join("\n\n");
}
function canUseTalkDirectTools(client) {
	return (Array.isArray(client?.connect?.scopes) ? client.connect.scopes : []).includes(ADMIN_SCOPE);
}
function broadcastTalkRoomEvents(context, connId, params) {
	if (!connId || params.events.length === 0) return;
	for (const talkEvent of params.events) context.broadcastToConnIds("talk.event", {
		handoffId: params.handoffId,
		roomId: params.roomId,
		talkEvent
	}, /* @__PURE__ */ new Set([connId]), { dropIfSlow: true });
}
function getRecord(value) {
	return asOptionalRecord(value) ?? void 0;
}
function singleRecordKey(record) {
	const keys = record ? Object.keys(record) : [];
	return keys.length === 1 ? keys[0] : void 0;
}
function normalizeRealtimeTransport(value) {
	const transport = normalizeOptionalLowercaseString(value);
	return transport === "webrtc" || transport === "provider-websocket" || transport === "gateway-relay" || transport === "managed-room" ? transport : void 0;
}
function getVoiceCallProviderConfig(config, sectionName) {
	const section = getRecord(getRecord(getRecord(getRecord(getRecord(config.plugins)?.entries)?.["voice-call"])?.config)?.[sectionName]);
	const providersRaw = getRecord(section?.providers);
	const providers = {};
	if (providersRaw) for (const [providerId, providerConfig] of Object.entries(providersRaw)) {
		const record = getRecord(providerConfig);
		if (record) providers[providerId] = record;
	}
	return {
		provider: normalizeOptionalString(section?.provider),
		providers: Object.keys(providers).length > 0 ? providers : void 0
	};
}
function getVoiceCallRealtimeConfig(config) {
	return getVoiceCallProviderConfig(config, "realtime");
}
function getVoiceCallStreamingConfig(config) {
	return getVoiceCallProviderConfig(config, "streaming");
}
function listTalkTranscriptionProviders(config, configuredProviderIds) {
	const providers = listRealtimeTranscriptionProviders(config);
	for (const providerId of configuredProviderIds) {
		const configuredProvider = getRealtimeTranscriptionProvider(providerId, config);
		if (configuredProvider && !providers.some((provider) => normalizeOptionalLowercaseString(provider.id) === normalizeOptionalLowercaseString(configuredProvider.id))) providers.push(configuredProvider);
	}
	return providers;
}
function resolveConfiguredVoiceModelDefaultRef(params) {
	const configuredProvider = normalizeOptionalString(params.provider);
	const refs = resolveSupportedVoiceModelRefs({
		config: params.config.agents?.defaults?.voiceModel,
		providers: params.providers,
		providerId: configuredProvider
	});
	for (const ref of refs) {
		const provider = params.providers.find((entry) => providerMatchesId(entry, ref.provider));
		if (!provider) continue;
		if (!configuredProvider) {
			const rawConfig = getVoiceProviderConfig({
				providerConfigs: params.providerConfigs,
				provider
			});
			const rawConfigWithModel = {
				...rawConfig,
				model: params.requestedModel ?? (rawConfig.model === void 0 ? ref.model : rawConfig.model)
			};
			const providerConfig = provider.resolveConfig?.({
				cfg: params.config,
				rawConfig: rawConfigWithModel
			}) ?? rawConfigWithModel;
			if (!configuredOrFalse(() => provider.isConfigured({
				cfg: params.config,
				providerConfig
			}))) continue;
		}
		return {
			provider: provider.id,
			model: ref.model
		};
	}
}
function buildTalkRealtimeConfig(config, requestedProvider, requestedModel) {
	const voiceCallRealtime = getVoiceCallRealtimeConfig(config);
	const talkRealtime = getRecord(config.talk?.realtime);
	const talkRealtimeProviderConfigs = talkRealtime?.providers;
	const explicitProvider = normalizeOptionalString(requestedProvider) ?? normalizeOptionalString(talkRealtime?.provider);
	const singleConfiguredProvider = normalizeOptionalString(singleRecordKey(talkRealtimeProviderConfigs));
	const selectedProvider = explicitProvider ?? singleConfiguredProvider ?? voiceCallRealtime.provider ?? singleConfiguredProvider;
	const providerConfigs = {
		...voiceCallRealtime.providers,
		...talkRealtimeProviderConfigs
	};
	const voiceModelDefault = resolveConfiguredVoiceModelDefaultRef({
		config,
		provider: selectedProvider,
		providerConfigs,
		providers: listRealtimeVoiceProviders(config),
		requestedModel: normalizeOptionalString(requestedModel) ?? normalizeOptionalString(talkRealtime?.model)
	});
	return {
		provider: selectedProvider ?? voiceModelDefault?.provider,
		providers: providerConfigs,
		model: normalizeOptionalString(talkRealtime?.model) ?? voiceModelDefault?.model,
		voice: normalizeOptionalString(talkRealtime?.speakerVoice) ?? normalizeOptionalString(talkRealtime?.speakerVoiceId),
		instructions: normalizeOptionalString(talkRealtime?.instructions),
		mode: normalizeOptionalLowercaseString(talkRealtime?.mode),
		transport: normalizeRealtimeTransport(talkRealtime?.transport),
		vadThreshold: typeof talkRealtime?.vadThreshold === "number" && Number.isFinite(talkRealtime.vadThreshold) ? talkRealtime.vadThreshold : void 0,
		silenceDurationMs: typeof talkRealtime?.silenceDurationMs === "number" && Number.isFinite(talkRealtime.silenceDurationMs) ? talkRealtime.silenceDurationMs : void 0,
		prefixPaddingMs: typeof talkRealtime?.prefixPaddingMs === "number" && Number.isFinite(talkRealtime.prefixPaddingMs) ? talkRealtime.prefixPaddingMs : void 0,
		reasoningEffort: normalizeOptionalString(talkRealtime?.reasoningEffort),
		brain: normalizeOptionalLowercaseString(talkRealtime?.brain),
		consultRouting: normalizeOptionalLowercaseString(talkRealtime?.consultRouting)
	};
}
function buildTalkTranscriptionConfig(config, requestedProvider, requestedModel) {
	const streamingConfig = getVoiceCallStreamingConfig(config);
	const provider = normalizeOptionalString(requestedProvider) ?? streamingConfig.provider;
	const providerConfigs = streamingConfig.providers ?? {};
	const voiceModelDefault = resolveConfiguredVoiceModelDefaultRef({
		config,
		provider,
		providerConfigs,
		providers: listTalkTranscriptionProviders(config, [provider, ...Object.keys(providerConfigs)]),
		requestedModel: normalizeOptionalString(requestedModel)
	});
	return {
		provider: provider ?? voiceModelDefault?.provider,
		providers: providerConfigs,
		model: voiceModelDefault?.model
	};
}
function configuredOrFalse(callback) {
	try {
		return callback();
	} catch {
		return false;
	}
}
function resolveConfiguredRealtimeTranscriptionProvider(params) {
	const normalizedConfigured = normalizeOptionalLowercaseString(params.configuredProviderId);
	const providers = normalizedConfigured ? [getRealtimeTranscriptionProvider(normalizedConfigured, params.config)].filter((provider) => provider !== void 0) : listTalkTranscriptionProviders(params.config, Object.keys(params.providerConfigs));
	const orderedProviders = normalizedConfigured ? providers : providers.toSorted((a, b) => (a.autoSelectOrder ?? 1e3) - (b.autoSelectOrder ?? 1e3));
	for (const provider of orderedProviders) {
		const rawConfig = getVoiceProviderConfig({
			providerConfigs: params.providerConfigs,
			provider,
			configuredProviderId: params.configuredProviderId
		});
		const model = params.requestedModel ?? (rawConfig.model === void 0 ? params.defaultModel : void 0);
		const rawConfigWithModel = model ? {
			...rawConfig,
			model
		} : rawConfig;
		const providerConfig = provider.resolveConfig?.({
			cfg: params.config,
			rawConfig: rawConfigWithModel
		}) ?? rawConfigWithModel;
		if (configuredOrFalse(() => provider.isConfigured({
			cfg: params.config,
			providerConfig
		}))) return {
			provider,
			providerConfig
		};
	}
	if (normalizedConfigured) throw new Error(`Realtime transcription provider "${params.configuredProviderId}" is not configured`);
	throw new Error("No realtime transcription provider registered");
}
const DEFAULT_REALTIME_INSTRUCTIONS = [
	"You are OpenClaw's realtime voice interface. Keep spoken replies concise.",
	`If the user asks for code, repository state, files, current OpenClaw context, tool-backed actions, or deeper reasoning, call ${REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME} and then summarize the result naturally.`,
	`Do not claim you cannot use tools, perform actions, or reach OpenClaw unless ${REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME} returns that failure.`,
	`When ${REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME} is in progress, speak one brief acknowledgement such as "Let me check that for you", then wait for the final OpenClaw result before answering with the actual result.`,
	`If OpenClaw is already working through ${REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME} and the user asks in any language for progress, cancellation, a redirect/change, or a follow-up, call ${REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME} with the semantic mode.`,
	"For greetings and casual chatter while OpenClaw is working, answer naturally and do not redirect the active work."
].join(" ");
function buildRealtimeInstructions(configuredInstructions) {
	const extra = normalizeOptionalString(configuredInstructions);
	if (!extra) return DEFAULT_REALTIME_INSTRUCTIONS;
	return `${DEFAULT_REALTIME_INSTRUCTIONS}\n\nAdditional realtime instructions:\n${extra}`;
}
function buildRealtimeVoiceLaunchOptions(params) {
	return {
		...pickRealtimeVoiceLaunchOptions(params.defaults),
		...pickRealtimeVoiceLaunchOptions(params.requested)
	};
}
function withRealtimeBrowserOverrides(providerConfig, params) {
	const overrides = {};
	const model = normalizeOptionalString(params.model);
	const voice = normalizeOptionalString(params.voice);
	const reasoningEffort = normalizeOptionalString(params.reasoningEffort);
	if (model) overrides.model = model;
	if (voice) overrides.voice = voice;
	if (typeof params.vadThreshold === "number" && Number.isFinite(params.vadThreshold)) overrides.vadThreshold = params.vadThreshold;
	if (typeof params.silenceDurationMs === "number" && Number.isFinite(params.silenceDurationMs)) overrides.silenceDurationMs = params.silenceDurationMs;
	if (typeof params.prefixPaddingMs === "number" && Number.isFinite(params.prefixPaddingMs)) overrides.prefixPaddingMs = params.prefixPaddingMs;
	if (reasoningEffort) overrides.reasoningEffort = reasoningEffort;
	return Object.keys(overrides).length > 0 ? {
		...providerConfig,
		...overrides
	} : providerConfig;
}
function resolveTalkRealtimeGatewayRelayLaunch(params) {
	const forceAgentConsultOnFinalTranscript = params.consultRouting === "force-agent-consult";
	const providerConfig = withRealtimeBrowserOverrides(params.providerConfig, params.launchOptions);
	return {
		providerConfig,
		forceAgentConsultOnFinalTranscript,
		error: resolveInternalRealtimeVoiceGatewayRelayLaunchError({
			provider: params.provider,
			cfg: params.cfg,
			providerConfig,
			model: params.launchOptions.model,
			autoRespondToAudio: !forceAgentConsultOnFinalTranscript
		})
	};
}
function pickRealtimeVoiceLaunchOptions(params) {
	const options = {};
	const model = normalizeOptionalString(params.model);
	const voice = normalizeOptionalString(params.voice);
	const reasoningEffort = normalizeOptionalString(params.reasoningEffort);
	if (model) options.model = model;
	if (voice) options.voice = voice;
	if (typeof params.vadThreshold === "number" && Number.isFinite(params.vadThreshold)) options.vadThreshold = params.vadThreshold;
	if (typeof params.silenceDurationMs === "number" && Number.isFinite(params.silenceDurationMs)) options.silenceDurationMs = params.silenceDurationMs;
	if (typeof params.prefixPaddingMs === "number" && Number.isFinite(params.prefixPaddingMs)) options.prefixPaddingMs = params.prefixPaddingMs;
	if (reasoningEffort) options.reasoningEffort = reasoningEffort;
	return options;
}
function isUnsupportedBrowserWebRtcSession(session) {
	const provider = normalizeLowercaseStringOrEmpty(session.provider);
	const transport = session.transport ?? "webrtc";
	return provider === "google" && transport === "webrtc";
}
//#endregion
//#region src/gateway/server-methods/talk-client-create.ts
const REALTIME_VOICE_CONTEXT_MAX_ITEMS = 16;
const REALTIME_VOICE_CONTEXT_MAX_ITEM_CHARS = 800;
const REALTIME_VOICE_CLIENT_SESSION_MIN_TTL_MS = 5e3;
function rejectTalkClientRequest(respond, code, message) {
	respond(false, void 0, errorShape(code, message));
}
const createTalkClient = async ({ params, respond, context, client, sessionMutationAuthorization, sessionMutationCommitGuard }) => {
	if (!assertValidParams(params, validateTalkClientCreateParams, "talk.client.create", respond)) return;
	try {
		sessionMutationAuthorization?.assertCurrent();
		const runtimeConfig = context.getRuntimeConfig();
		const realtimeConfig = buildTalkRealtimeConfig(runtimeConfig, params.provider, params.model);
		const mode = normalizeOptionalLowercaseString(params.mode) ?? realtimeConfig.mode ?? "realtime";
		if (mode !== "realtime") {
			rejectTalkClientRequest(respond, ErrorCodes.INVALID_REQUEST, `talk.client.create only supports mode="realtime"; use talk.catalog for ${mode} provider discovery`);
			return;
		}
		if ((normalizeOptionalLowercaseString(params.brain) ?? realtimeConfig.brain ?? "agent-consult") !== "agent-consult") {
			rejectTalkClientRequest(respond, ErrorCodes.INVALID_REQUEST, `talk.client.create only supports brain="agent-consult"`);
			return;
		}
		const transport = normalizeOptionalLowercaseString(params.transport) ?? realtimeConfig.transport;
		const wantsCameraFrames = params.capabilities?.includes("camera-frame") === true;
		const wantsGatewayControl = params.capabilities?.includes("gateway-control-v1") === true;
		if (wantsGatewayControl && wantsCameraFrames) {
			rejectTalkClientRequest(respond, ErrorCodes.INVALID_REQUEST, "gateway-control-v1 supports audio-only WebRTC sessions");
			return;
		}
		if (transport === "gateway-relay") {
			rejectTalkClientRequest(respond, ErrorCodes.INVALID_REQUEST, wantsCameraFrames ? "gateway-relay does not support browser video frames" : `talk.client.create is client-owned; use talk.session.create for gateway-relay`);
			return;
		}
		const launchOptions = buildRealtimeVoiceLaunchOptions({
			requested: params,
			defaults: realtimeConfig
		});
		const target = requirePreparedTalkSessionTarget(sessionMutationAuthorization?.talkSessionTarget);
		const { agentId, sessionKey } = target;
		const sessionTarget = {
			agentId,
			sessionKey: target.canonicalKey,
			storePath: target.storePath
		};
		assertSecretOwnerAvailable("capability", "talk:realtime");
		const resolution = resolveConfiguredRealtimeVoiceProvider({
			configuredProviderId: realtimeConfig.provider,
			providerConfigs: realtimeConfig.providers,
			...launchOptions.model ? { providerConfigOverrides: { model: launchOptions.model } } : {},
			cfg: runtimeConfig,
			agentId,
			defaultModel: realtimeConfig.model,
			surface: "browser-session"
		});
		const providerCapabilities = resolveRealtimeVoiceProviderCapabilities({
			provider: resolution.provider,
			providerConfig: resolution.providerConfig,
			cfg: runtimeConfig,
			agentId,
			model: launchOptions.model,
			surface: "browser-session"
		});
		if (wantsGatewayControl && providerCapabilities?.supportsGatewayControl !== true) {
			rejectTalkClientRequest(respond, ErrorCodes.UNAVAILABLE, `Realtime provider "${resolution.provider.id}" does not support gateway-control-v1 with its configured authentication`);
			return;
		}
		if (wantsCameraFrames && providerCapabilities?.supportsVideoFrames !== true) {
			rejectTalkClientRequest(respond, ErrorCodes.INVALID_REQUEST, `Realtime provider ${resolution.provider.id} does not support browser video frames`);
			return;
		}
		const providerInstructions = await resolveTalkRealtimeProviderInstructions({
			config: runtimeConfig,
			agentId,
			configuredInstructions: realtimeConfig.instructions,
			sessionKey: target.canonicalKey,
			warn: (message) => context.logGateway.warn(`talk realtime context: ${message}`)
		});
		sessionMutationAuthorization?.assertCurrent();
		if (resolution.provider.createBrowserSession && transport !== "gateway-relay") {
			const agentSessionId = resolveClientVoiceAgentSessionId(sessionTarget);
			const initialItems = agentSessionId ? boundTalkClientRealtimeInitialItems(readSessionPreviewItemsFromTranscript({
				...sessionTarget,
				sessionId: agentSessionId
			}, REALTIME_VOICE_CONTEXT_MAX_ITEMS, REALTIME_VOICE_CONTEXT_MAX_ITEM_CHARS).filter((item) => item.role === "user" || item.role === "assistant")) : [];
			const tools = providerCapabilities?.supportsToolCalls === false ? [] : [REALTIME_VOICE_AGENT_CONSULT_TOOL, REALTIME_VOICE_AGENT_CONTROL_TOOL];
			if (wantsCameraFrames && tools.length > 0) tools.push(REALTIME_VOICE_DESCRIBE_VIEW_TOOL);
			const instructions = resolveGptLiveCallInstructions(providerCapabilities?.handlesAgentConsult === true ? normalizeOptionalString(providerInstructions) : buildRealtimeInstructions(providerInstructions), {
				providerId: resolution.provider.id, model: launchOptions.model, transport, brain: "agent-consult", capabilities: providerCapabilities
			});
			const requestedVoiceSessionId = normalizeOptionalString(params.voiceSessionId);
			const ownsProvider = wantsGatewayControl || providerCapabilities?.handlesAgentConsult === true;
			let activeVoiceSessionId = ownsProvider ? requestedVoiceSessionId ?? randomUUID() : void 0;
			let logicalSessionCreated = false;
			const ownerConnId = normalizeOptionalString(client?.connId);
			if (ownsProvider && !ownerConnId) {
				respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "Gateway-owned realtime sessions require a connected client"));
				return;
			}
			const consultRunner = createTalkClientAgentConsultRunner({
				config: runtimeConfig,
				context,
				sessionTarget: target,
				...ownerConnId ? { ownerConnId } : {},
				authority: resolveTalkAgentConsultAuthority(client?.connect?.scopes),
				getVoiceSessionId: () => activeVoiceSessionId,
				initialItems
			});
			const gatewayControlOwner = ownsProvider ? createTalkClientGatewayControlOwner({
				voiceSessionId: activeVoiceSessionId,
				providerId: resolution.provider.id,
				sessionTarget: target,
				connId: ownerConnId,
				context,
				assertConnectionOpen: () => {
					if (!(context.getClientConnIds?.((candidate) => candidate === client))?.has(ownerConnId)) throw new Error("Realtime voice client disconnected");
				},
				runAgentConsult: consultRunner.runArgs,
				appendTranscript: ({ entryId, role, text }) => appendClientVoiceTranscript({
					agentId,
					sessionKey,
					sessionTarget,
					voiceSessionId: activeVoiceSessionId,
					entryId,
					role,
					text,
					config: runtimeConfig
				}),
				flushTranscript: () => flushClientVoiceSessionWrites({
					agentId,
					voiceSessionId: activeVoiceSessionId
				}),
				closeLogicalSession: async () => {
					if (logicalSessionCreated) {
						await closeClientVoiceSession({
							agentId,
							sessionKey,
							voiceSessionId: activeVoiceSessionId,
							config: runtimeConfig
						});
						forgetLegacyVoiceBinding(ownerConnId, params.sessionKey?.trim() || sessionKey, activeVoiceSessionId);
					}
				}
			}) : void 0;
			const browserSessionRequest = {
				cfg: runtimeConfig,
				agentId,
				...ownerConnId ? { ownerConnId } : {},
				workspaceDir: resolveAgentWorkspaceDir(runtimeConfig, agentId),
				providerConfig: resolution.providerConfig,
				instructions,
				initialItems,
				runAgentConsult: gatewayControlOwner?.runAgentConsult ?? consultRunner.runPrompt,
				...gatewayControlOwner ? { gatewayControl: gatewayControlOwner.control } : {},
				...tools.length > 0 ? { tools } : {},
				...launchOptions
			};
			const assertCommitAllowed = () => {
				sessionMutationCommitGuard?.();
				sessionMutationAuthorization?.assertCurrent();
				gatewayControlOwner?.assertOpen();
			};
			let session;
			let delivered = false;
			try {
				assertCommitAllowed();
				session = await resolution.provider.createBrowserSession(browserSessionRequest);
				const createdSession = session;
				await gatewayControlOwner?.adoptProvider(() => cancelInternalRealtimeVoiceBrowserSession({
					provider: resolution.provider,
					request: browserSessionRequest,
					session: createdSession
				}));
				assertCommitAllowed();
				if ((session.transport === "webrtc" || session.transport === "provider-websocket" || session.transport === "managed-room") && !isUnsupportedBrowserWebRtcSession(session) && (!transport || session.transport === transport)) {
					const sessionEntryDeadlineAt = session.expiresAt === void 0 ? void 0 : session.expiresAt - REALTIME_VOICE_CLIENT_SESSION_MIN_TTL_MS;
					if (sessionEntryDeadlineAt !== void 0 && Date.now() >= sessionEntryDeadlineAt) throw new Error("Realtime browser session expired during startup; try again");
					const ensuredSessionId = await ensureClientVoiceAgentSessionEntry({
						...sessionTarget,
						creation: resolveSandboxedSessionCreation(client, runtimeConfig) ?? resolveOperatorSessionCreation(client),
						deadlineAt: sessionEntryDeadlineAt,
						assertCommitAllowed
					});
					sessionMutationCommitGuard?.();
					sessionMutationAuthorization?.assertTargetCurrent({
						...sessionTarget,
						ensuredSessionId
					});
					gatewayControlOwner?.assertOpen();
					closeStaleClientVoiceSessions({
						agentId,
						config: runtimeConfig,
						excludeVoiceSessionId: normalizeOptionalString(params.voiceSessionId),
						warn: (message) => context.logGateway.warn(`talk voice session recovery: ${message}`)
					}).catch((error) => context.logGateway.warn(`talk voice session recovery failed: ${formatForLog(error)}`));
					const voiceSessionId = createOrResumeClientVoiceSession({
						agentId,
						sessionKey,
						provider: resolution.provider.id,
						origin: "client",
						transcriptCapable: wantsGatewayControl || params.capabilities?.includes("voice-transcript") === true,
						voiceSessionId: activeVoiceSessionId ?? requestedVoiceSessionId
					});
					activeVoiceSessionId = voiceSessionId;
					logicalSessionCreated = true;
					const connId = ownerConnId;
					if (connId) rememberLegacyVoiceBinding({
						connId,
						sessionKey: params.sessionKey?.trim() || sessionKey,
						voiceSessionId
					});
					gatewayControlOwner?.activate();
					respond(true, {
						...session,
						voiceSessionId,
						...wantsGatewayControl ? { clientControl: { owner: "gateway" } } : {}
					}, void 0);
					delivered = true;
					return;
				}
				if (transport) {
					rejectTalkClientRequest(respond, ErrorCodes.UNAVAILABLE, `Realtime provider "${resolution.provider.id}" does not support requested browser transport "${transport}"`);
					return;
				}
			} finally {
				if (!delivered) try {
					if (gatewayControlOwner) await gatewayControlOwner.close();
					else if (session) await cancelInternalRealtimeVoiceBrowserSession({
						provider: resolution.provider,
						request: browserSessionRequest,
						session
					});
				} catch (error) {
					context.logGateway.warn(`talk browser session cleanup failed: ${formatForLog(error)}`);
				}
			}
		}
		rejectTalkClientRequest(respond, ErrorCodes.UNAVAILABLE, `Realtime provider "${resolution.provider.id}" does not support client-owned realtime sessions`);
	} catch (err) {
		if (err instanceof SessionMutationAuthorizationChangedError) {
			respond(false, void 0, err.error);
			return;
		}
		respond(false, void 0, errorShape(err instanceof AgentSelectionRequiredError ? ErrorCodes.INVALID_REQUEST : ErrorCodes.UNAVAILABLE, formatForLog(err)));
	}
};
//#endregion
//#region src/gateway/server-methods/talk-client.ts
/**
* Gateway methods for browser-owned realtime Talk sessions.
*
* These handlers create provider browser sessions and bridge client-owned tool
* calls back into OpenClaw agent consult runs.
*/
const talkClientHandlers = {
	"talk.client.create": createTalkClient,
	"talk.client.toolCall": async (request) => {
		const { params, respond } = request;
		if (!assertValidParams(params, validateTalkClientToolCallParams, "talk.client.toolCall", respond)) return;
		if (params.name === "openclaw_live_call_control") {
			try {
				const target = requirePreparedTalkSessionTarget(request.sessionMutationAuthorization?.talkSessionTarget);
				if (typeof request.sessionMutationAuthorization?.assertCurrent !== "function") throw new Error("Talk session authorization is required");
				request.sessionMutationAuthorization.assertCurrent();
				const connId = normalizeOptionalString(request.client?.connId);
				const voiceSessionId = normalizeOptionalString(params.voiceSessionId);
				if (!connId || !voiceSessionId || params.relaySessionId || !params.args || Array.isArray(params.args) || Object.keys(params.args).length !== 1 || params.args.action !== "ready") throw new Error("Invalid GPT Live call ready request");
				const owner = owners.get(voiceSessionId);
				if (!owner || owner.connId !== connId || owner.sessionTarget.canonicalKey !== target.canonicalKey || owner.sessionTarget.agentId !== target.agentId || owner.sessionTarget.storePath !== target.storePath) throw new Error("GPT Live call is not owned by this client");
				respond(true, owner.requestCallReady(), void 0);
			} catch (error) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatErrorMessage(error)));
			}
			return;
		}
		if (params.name !== "openclaw_agent_consult") {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `unsupported realtime Talk tool: ${params.name}`));
			return;
		}
		const config = request.context.getRuntimeConfig();
		const target = requirePreparedTalkSessionTarget(request.sessionMutationAuthorization?.talkSessionTarget);
		const { agentId } = target;
		request.sessionMutationAuthorization?.assertCurrent();
		const relaySessionId = normalizeOptionalString(params.relaySessionId);
		const connId = normalizeOptionalString(request.client?.connId);
		const explicitVoiceSessionId = normalizeOptionalString(params.voiceSessionId);
		if (relaySessionId && explicitVoiceSessionId && explicitVoiceSessionId !== relaySessionId) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "relaySessionId and voiceSessionId must match"));
			return;
		}
		let confirmationGrant;
		let voiceSessionId;
		try {
			voiceSessionId = explicitVoiceSessionId ?? relaySessionId ?? (connId ? readLegacyVoiceBinding(connId, params.sessionKey) : void 0) ?? resolveOpenClientVoiceSessionId({
				agentId,
				sessionKey: params.sessionKey
			}) ?? createOrResumeClientVoiceSession({
				agentId,
				sessionKey: params.sessionKey,
				origin: "client"
			});
			if (connId && !relaySessionId) rememberLegacyVoiceBinding({
				connId,
				sessionKey: params.sessionKey,
				voiceSessionId
			});
			if (relaySessionId && connId) {
				await ensureClientVoiceAgentSessionEntry({
					agentId,
					sessionKey: params.sessionKey,
					creation: resolveSandboxedSessionCreation(request.client, config)
				});
				ensureTalkRealtimeRelayVoiceSession({
					relaySessionId,
					connId,
					sessionKey: params.sessionKey
				});
				await flushTalkRealtimeRelayVoiceWrites({
					relaySessionId,
					connId
				});
			}
			const parsedArgs = parseRealtimeVoiceAgentConsultArgs(params.args ?? {});
			if (assertClientVoiceSessionOpen({
				agentId,
				sessionKey: params.sessionKey,
				voiceSessionId
			}) === "relay" && (!relaySessionId || !connId)) throw new Error("relay-owned voice sessions require relaySessionId and connection ownership");
			if (parsedArgs.confirmationId) confirmationGrant = authorizeClientVoiceConfirmation({
				agentId,
				voiceSessionId,
				confirmationId: parsedArgs.confirmationId
			});
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err)));
			return;
		}
		const result = await startTalkRealtimeAgentConsult(request, {
			sessionTarget: target,
			callId: params.callId,
			args: params.args ?? {},
			relaySessionId: normalizeOptionalString(params.relaySessionId),
			connId,
			onRunStarted: (runId) => {
				registerClientVoiceConsultRun({
					agentId,
					sessionKey: params.sessionKey,
					voiceSessionId,
					runId,
					config: request.context.getRuntimeConfig()
				});
				if (confirmationGrant) bindAuthorizedClientVoiceConfirmation({
					grant: confirmationGrant,
					runId
				});
			}
		});
		if (!result.ok) {
			respond(false, void 0, result.error);
			return;
		}
		respond(true, {
			runId: result.runId,
			idempotencyKey: result.idempotencyKey,
			agentId,
			agentSessionKey: target.canonicalKey
		}, void 0);
	},
	"talk.client.transcript": async ({ params, respond, context, sessionMutationAuthorization }) => {
		if (!assertValidParams(params, validateTalkClientTranscriptParams, "talk.client.transcript", respond)) return;
		try {
			const config = context.getRuntimeConfig();
			const target = sessionMutationAuthorization?.talkSessionTarget ?? prepareTalkSessionTarget(config, params.sessionKey);
			sessionMutationAuthorization?.assertCurrent();
			await appendClientVoiceTranscript({
				agentId: target.agentId,
				sessionKey: target.sessionKey,
				sessionTarget: {
					sessionKey: target.canonicalKey,
					storePath: target.storePath
				},
				voiceSessionId: params.voiceSessionId,
				entryId: params.entryId,
				role: params.role,
				text: params.text,
				...params.timestamp !== void 0 ? { timestamp: params.timestamp } : {},
				config
			});
			respond(true, { ok: true }, void 0);
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err)));
		}
	},
	"talk.client.close": async ({ params, respond, context, client, sessionMutationAuthorization }) => {
		if (!assertValidParams(params, validateTalkClientCloseParams, "talk.client.close", respond)) return;
		try {
			if (await closeTalkClientGatewayControlSession({
				voiceSessionId: params.voiceSessionId,
				sessionKey: params.sessionKey,
				connId: normalizeOptionalString(client?.connId)
			})) {
				respond(true, { ok: true }, void 0);
				return;
			}
			const config = context.getRuntimeConfig();
			const { agentId } = sessionMutationAuthorization?.talkSessionTarget ?? prepareTalkSessionTarget(config, params.sessionKey);
			sessionMutationAuthorization?.assertCurrent();
			if (resolveClientVoiceSessionOrigin({
				agentId,
				sessionKey: params.sessionKey,
				voiceSessionId: params.voiceSessionId
			}) === "relay") throw new Error("relay-owned voice sessions close through talk.session.close");
			await closeClientVoiceSession({
				agentId,
				sessionKey: params.sessionKey,
				voiceSessionId: params.voiceSessionId,
				config
			});
			const connId = normalizeOptionalString(client?.connId);
			if (connId) forgetLegacyVoiceBinding(connId, params.sessionKey, params.voiceSessionId);
			respond(true, { ok: true }, void 0);
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err)));
		}
	},
	"talk.client.steer": async ({ params, respond, client, context, sessionMutationAuthorization }) => {
		if (!assertValidParams(params, validateTalkClientSteerParams, "talk.client.steer", respond)) return;
		try {
			const target = sessionMutationAuthorization?.talkSessionTarget ?? prepareTalkSessionTarget(context.getRuntimeConfig(), params.sessionKey);
			const controlParams = { mode: params.mode, text: params.text, ownerConnId: client?.connId, sessionTarget: target, assertCurrent: sessionMutationAuthorization?.assertCurrent };
			const voiceCancel = await cancelOwnedGptLiveVoiceConsult(controlParams);
			if (voiceCancel) { respond(true, voiceCancel, void 0); return; }
			const voiceControl = await controlOwnedGptLiveVoiceConsult(controlParams);
			if (voiceControl) { respond(true, voiceControl, void 0); return; }
			const runTarget = resolveOwnedActiveTalkRunTarget({
				context,
				clientConnId: client?.connId,
				sessionTarget: target,
				assertCurrent: sessionMutationAuthorization?.assertCurrent
			});
			if (runTarget === null) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "talk.client.steer requires an active browser-owned Talk run"));
				return;
			}
			respond(true, await controlRealtimeVoiceAgentRun({
				sessionKey: target.canonicalKey,
				runTarget,
				text: params.text,
				mode: params.mode
			}), void 0);
		} catch (err) {
			if (err instanceof SessionMutationAuthorizationChangedError) {
				respond(false, void 0, err.error);
				return;
			}
			respond(false, void 0, errorShape(err instanceof AgentSelectionRequiredError ? ErrorCodes.INVALID_REQUEST : ErrorCodes.UNAVAILABLE, formatForLog(err)));
		}
	}
};
//#endregion
//#region src/gateway/talk-handoff.ts
const DEFAULT_TALK_HANDOFF_TTL_MS = 6e5;
const MAX_TALK_HANDOFF_TTL_MS = 36e5;
const handoffs = resolveGlobalMap(Symbol.for("openclaw.talkHandoffs"), "close-and-restart");
/** Creates a short-lived Talk room and returns the only plaintext join token. */
function createTalkHandoff(params) {
	pruneExpiredTalkHandoffs();
	const rawCreatedAt = Date.now();
	const createdAt = resolveDateTimestampMs(rawCreatedAt);
	const ttlMs = normalizeTtlMs(params.ttlMs);
	const expiresAt = resolveExpiresAtMsFromDurationMs(ttlMs, { nowMs: rawCreatedAt }) ?? 0;
	const id = randomUUID();
	const roomId = `talk_${id}`;
	const token = randomBytes(32).toString("base64url");
	const room = createTalkHandoffRoom({
		roomId,
		mode: params.mode ?? "stt-tts",
		transport: params.transport ?? "managed-room",
		brain: params.brain ?? "agent-consult",
		provider: params.provider
	});
	const record = {
		id,
		roomId,
		roomUrl: `/talk/rooms/${roomId}`,
		tokenHash: hashTalkHandoffToken(token),
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		channel: params.channel,
		target: params.target,
		provider: params.provider,
		model: params.model,
		voice: params.voice,
		mode: params.mode ?? "stt-tts",
		transport: params.transport ?? "managed-room",
		brain: params.brain ?? "agent-consult",
		createdAt,
		expiresAt,
		room
	};
	appendTalkHandoffRoomEvent(record, {
		type: "session.started",
		payload: {
			handoffId: id,
			roomId
		}
	});
	handoffs.set(id, record);
	return {
		...toPublicTalkHandoffRecord(record),
		token
	};
}
/** Returns a non-expired handoff record for gateway-internal callers. */
function getTalkHandoff(id) {
	pruneExpiredTalkHandoffs();
	return handoffs.get(id);
}
/** Revokes a handoff and emits the final room-close event if it existed. */
function revokeTalkHandoff(id) {
	pruneExpiredTalkHandoffs();
	const record = handoffs.get(id);
	if (!record) return {
		revoked: false,
		events: []
	};
	const event = appendTalkHandoffRoomEvent(record, {
		type: "session.closed",
		payload: {
			reason: "revoked",
			handoffId: id,
			roomId: record.roomId
		},
		final: true
	});
	handoffs.delete(id);
	return {
		revoked: true,
		roomId: record.roomId,
		activeClientId: record.room.activeClientId,
		events: [event]
	};
}
function normalizeTtlMs(value) {
	if (!Number.isFinite(value) || value === void 0) return DEFAULT_TALK_HANDOFF_TTL_MS;
	return Math.min(Math.max(Math.trunc(value), 1e3), MAX_TALK_HANDOFF_TTL_MS);
}
function pruneExpiredTalkHandoffs(now = Date.now()) {
	const validNow = asDateTimestampMs(now);
	if (validNow === void 0) return;
	for (const [id, record] of handoffs) if (!isFutureDateTimestampMs(record.expiresAt, { nowMs: validNow })) {
		appendTalkHandoffRoomEvent(record, {
			type: "session.closed",
			payload: {
				reason: "expired",
				handoffId: id,
				roomId: record.roomId
			},
			final: true
		});
		handoffs.delete(id);
	}
}
function hashTalkHandoffToken(token) {
	return sha256Base64Url(token);
}
function toPublicTalkHandoffRecord(record) {
	const { tokenHash: _tokenHash, room: _room, ...publicRecord } = record;
	return {
		...publicRecord,
		room: {
			activeClientId: record.room.activeClientId,
			activeTurnId: record.room.talk.activeTurnId,
			recentTalkEvents: [...record.room.talk.recentEvents]
		}
	};
}
function createTalkHandoffRoom(params) {
	return { talk: createTalkSessionController({
		sessionId: params.roomId,
		mode: params.mode,
		transport: params.transport,
		brain: params.brain,
		provider: params.provider
	}, { onEvent: recordTalkObservabilityEvent }) };
}
function appendTalkHandoffRoomEvent(record, input) {
	return record.room.talk.emit(input);
}
//#endregion
//#region src/gateway/talk-transcription-relay.ts
/**
* Gateway-owned relay for streaming speech-to-text providers used by Talk.
*
* The relay accepts browser audio on one WebSocket connection, forwards it to a
* realtime transcription provider, and mirrors provider callbacks into Talk
* events for the same connection.
*/
const TRANSCRIPTION_SESSION_TTL_MS = 18e5;
const TRANSCRIPTION_PROVIDER_FINAL_DRAIN_MS = 5e3;
const MAX_AUDIO_BASE64_BYTES = 524288;
const MAX_TRANSCRIPTION_SESSIONS_PER_CONN = 2;
const MAX_TRANSCRIPTION_SESSIONS_GLOBAL = 64;
const TRANSCRIPTION_EVENT = "talk.event";
const RELAY_INPUT_ENCODING = "g711_ulaw";
const RELAY_INPUT_SAMPLE_RATE_HZ = 8e3;
const transcriptionSessions = /* @__PURE__ */ new Map();
/** Normalizes common provider audio-format aliases into the relay contract. */
function normalizeRelayInputEncoding(value) {
	if (typeof value !== "string") return;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return;
	if (normalized === "mulaw" || normalized === "ulaw" || normalized === "g711_ulaw" || normalized === "g711-mulaw" || normalized === "pcm_mulaw" || normalized === "audio/pcmu" || normalized === "ulaw_8000") return "g711_ulaw";
	if (normalized === "alaw" || normalized === "g711_alaw" || normalized === "g711-alaw" || normalized === "pcm_alaw") return "g711_alaw";
	if (normalized === "pcm" || normalized === "pcm16" || normalized === "linear16" || normalized === "pcm_s16le") return "pcm16";
}
function inferSampleRateFromAudioFormat(value) {
	if (typeof value !== "string") return;
	const match = value.match(/_(\d+)$/);
	return match ? parseFiniteNumber(match[1]) : void 0;
}
/** Verifies provider config matches the audio format the browser relay emits. */
function assertRelayInputAudioConfig(providerConfig) {
	const encodingValue = providerConfig.encoding ?? providerConfig.audioFormat ?? providerConfig.audio_format;
	const encoding = normalizeRelayInputEncoding(encodingValue);
	if (encoding && encoding !== RELAY_INPUT_ENCODING) throw new Error(`Gateway transcription relay requires ${RELAY_INPUT_ENCODING}/${RELAY_INPUT_SAMPLE_RATE_HZ} audio`);
	const sampleRate = parseFiniteNumber(providerConfig.sampleRate ?? providerConfig.sample_rate) ?? inferSampleRateFromAudioFormat(encodingValue);
	if (sampleRate && sampleRate !== RELAY_INPUT_SAMPLE_RATE_HZ) throw new Error(`Gateway transcription relay requires ${RELAY_INPUT_ENCODING}/${RELAY_INPUT_SAMPLE_RATE_HZ} audio`);
}
function broadcastToOwner(context, connId, event) {
	context.broadcastToConnIds(TRANSCRIPTION_EVENT, event, /* @__PURE__ */ new Set([connId]), { dropIfSlow: event.type === "inputAudio" || event.type === "partial" });
}
function ensureTranscriptionTurn(session) {
	const turn = session.talk.ensureTurn();
	if (turn.event) broadcastToOwner(session.context, session.connId, {
		transcriptionSessionId: session.id,
		type: "speechStart",
		talkEvent: turn.event
	});
	return turn.turnId;
}
function closeTranscriptionSession(session, reason) {
	if (session.closed) return;
	session.closed = true;
	transcriptionSessions.delete(session.id);
	forgetUnifiedTalkSession(session.id);
	clearTimeout(session.cleanupTimer);
	try {
		if (!session.draining) session.sttSession.close();
	} finally {
		broadcastToOwner(session.context, session.connId, {
			transcriptionSessionId: session.id,
			type: "close",
			reason,
			talkEvent: session.talk.emit({
				type: "session.closed",
				payload: { reason },
				final: true
			})
		});
	}
}
/** Releases every transcription relay owned by a disconnected gateway connection. */
function closeTalkTranscriptionRelaySessionsForConnection(connId) {
	closeTalkRelaySessionsForConnection({
		sessions: transcriptionSessions.values(),
		connId,
		closeSession: (session) => closeTranscriptionSession(session, "completed"),
		onCloseError: (error, session) => {
			session.context.logGateway.warn(`failed to close transcription relay session after connection disconnect: ${formatErrorMessage(error)}`);
		}
	});
}
function pruneExpiredTranscriptionSessions(nowMs = Date.now()) {
	closeExpiredTalkRelaySessions({
		sessions: transcriptionSessions.values(),
		closeSession: (session) => closeTranscriptionSession(session, "completed"),
		nowMs
	});
}
function countTranscriptionSessionsForConn(connId) {
	let count = 0;
	for (const session of transcriptionSessions.values()) if (session.connId === connId) count += 1;
	return count;
}
function enforceTranscriptionSessionLimits(connId) {
	pruneExpiredTranscriptionSessions();
	if (transcriptionSessions.size >= MAX_TRANSCRIPTION_SESSIONS_GLOBAL) throw new Error("Too many active transcription Talk sessions");
	if (countTranscriptionSessionsForConn(connId) >= MAX_TRANSCRIPTION_SESSIONS_PER_CONN) throw new Error("Too many active transcription Talk sessions for this connection");
}
/** Creates a transcription relay session and returns its browser audio contract. */
function createTalkTranscriptionRelaySession(params) {
	enforceTranscriptionSessionLimits(params.connId);
	assertRelayInputAudioConfig(params.providerConfig);
	const transcriptionSessionId = randomUUID();
	const expiresAtMs = resolveExpiresAtMsFromDurationMs(TRANSCRIPTION_SESSION_TTL_MS);
	if (expiresAtMs === void 0) throw new Error("Transcription relay session expiry is outside the supported Date range");
	const talk = createTalkSessionController({
		sessionId: transcriptionSessionId,
		mode: "transcription",
		transport: "gateway-relay",
		brain: "none",
		provider: params.provider.id
	}, { onEvent: recordTalkObservabilityEvent });
	const emit = (event, talkEvent) => {
		broadcastToOwner(params.context, params.connId, {
			...event,
			...talkEvent ? { talkEvent: talk.emit(talkEvent) } : {}
		});
	};
	const relayRef = {};
	const getActiveRelay = () => {
		const relay = relayRef.current;
		return relay && transcriptionSessions.get(relay.id) === relay ? relay : void 0;
	};
	const sttSession = params.provider.createSession({
		cfg: params.context.getRuntimeConfig(),
		providerConfig: params.providerConfig,
		onSpeechStart: () => {
			const relay = getActiveRelay();
			if (!relay || relay.draining) return;
			ensureTranscriptionTurn(relay);
		},
		onPartial: (text) => {
			const relay = getActiveRelay();
			if (!relay) return;
			const turnId = ensureTranscriptionTurn(relay);
			emit({
				transcriptionSessionId,
				type: "partial",
				text
			}, {
				type: "transcript.delta",
				turnId,
				payload: { text }
			});
		},
		onTranscript: (text) => {
			const relay = getActiveRelay();
			if (!relay) return;
			const turnId = ensureTranscriptionTurn(relay);
			emit({
				transcriptionSessionId,
				type: "transcript",
				text,
				final: true
			}, {
				type: "transcript.done",
				turnId,
				payload: { text },
				final: true
			});
			const ended = relay.talk.endTurn({
				turnId,
				payload: {}
			});
			if (ended.ok) broadcastToOwner(relay.context, relay.connId, {
				transcriptionSessionId,
				type: "transcript",
				text: "",
				final: true,
				talkEvent: ended.event
			});
		},
		onError: (error) => {
			const relay = getActiveRelay();
			if (!relay) return;
			emit({
				transcriptionSessionId,
				type: "error",
				message: error.message
			}, {
				type: "session.error",
				payload: { message: error.message },
				final: true
			});
			closeTranscriptionSession(relay, "error");
		}
	});
	const relay = {
		id: transcriptionSessionId,
		connId: params.connId,
		context: params.context,
		provider: params.provider,
		sttSession,
		talk,
		expiresAtMs,
		cleanupTimer: setTimeout(() => {
			const active = transcriptionSessions.get(transcriptionSessionId);
			if (active) closeTranscriptionSession(active, "completed");
		}, TRANSCRIPTION_SESSION_TTL_MS),
		receivedAudio: false,
		draining: false,
		closed: false
	};
	relayRef.current = relay;
	relay.cleanupTimer.unref?.();
	transcriptionSessions.set(transcriptionSessionId, relay);
	registerTalkConnectionCleanup(params.connId, "transcription-relay", () => {
		closeTalkTranscriptionRelaySessionsForConnection(params.connId);
	});
	sttSession.connect().then(() => {
		if (transcriptionSessions.get(transcriptionSessionId) !== relay || relay.draining) return;
		emit({
			transcriptionSessionId,
			type: "ready"
		}, {
			type: "session.ready",
			payload: null
		});
	}).catch((error) => {
		const active = transcriptionSessions.get(transcriptionSessionId);
		if (active !== relay) return;
		emit({
			transcriptionSessionId,
			type: "error",
			message: error instanceof Error ? error.message : String(error)
		}, {
			type: "session.error",
			payload: { message: error instanceof Error ? error.message : String(error) },
			final: true
		});
		closeTranscriptionSession(active, "error");
	});
	return {
		provider: params.provider.id,
		mode: "transcription",
		transport: "gateway-relay",
		transcriptionSessionId,
		audio: {
			inputEncoding: RELAY_INPUT_ENCODING,
			inputSampleRateHz: RELAY_INPUT_SAMPLE_RATE_HZ
		},
		expiresAt: Math.floor(expiresAtMs / 1e3)
	};
}
function getTranscriptionSession(transcriptionSessionId, connId) {
	const relay = requireActiveTalkRelaySession({
		sessions: transcriptionSessions,
		sessionId: transcriptionSessionId,
		connId,
		closeSession: (session) => closeTranscriptionSession(session, "completed"),
		unknownSessionMessage: "Unknown transcription Talk session"
	});
	if (relay.draining) throw new Error("Unknown transcription Talk session");
	return relay;
}
/** Streams one base64-encoded audio frame into the owning transcription relay. */
function sendTalkTranscriptionRelayAudio(params) {
	if (params.audioBase64.length > MAX_AUDIO_BASE64_BYTES) throw new Error("Transcription Talk audio frame is too large");
	const session = getTranscriptionSession(params.transcriptionSessionId, params.connId);
	const audio = decodeTalkRelayAudioBase64(params.audioBase64, "Transcription Talk");
	const turnId = ensureTranscriptionTurn(session);
	session.sttSession.sendAudio(audio);
	session.receivedAudio = true;
	broadcastToOwner(session.context, session.connId, {
		transcriptionSessionId: session.id,
		type: "inputAudio",
		byteLength: audio.byteLength,
		talkEvent: session.talk.emit({
			type: "input.audio.delta",
			turnId,
			payload: { byteLength: audio.byteLength }
		})
	});
}
/** Commits the current transcription turn and closes the relay. */
function stopTalkTranscriptionRelaySession(params) {
	const session = getTranscriptionSession(params.transcriptionSessionId, params.connId);
	const turnId = session.talk.activeTurnId;
	if (!turnId && !session.receivedAudio) {
		closeTranscriptionSession(session, "completed");
		return;
	}
	if (turnId) broadcastToOwner(session.context, session.connId, {
		transcriptionSessionId: session.id,
		type: "transcript",
		text: "",
		final: true,
		talkEvent: session.talk.emit({
			type: "input.audio.committed",
			turnId,
			payload: {},
			final: true
		})
	});
	session.draining = true;
	clearTimeout(session.cleanupTimer);
	session.cleanupTimer = setTimeout(() => {
		if (transcriptionSessions.get(session.id) === session) closeTranscriptionSession(session, "completed");
	}, TRANSCRIPTION_PROVIDER_FINAL_DRAIN_MS);
	session.cleanupTimer.unref?.();
	try {
		session.sttSession.close();
	} catch (error) {
		closeTranscriptionSession(session, "completed");
		throw error;
	}
}
//#endregion
//#region src/gateway/server-methods/talk-session-mark.ts
const acknowledgeTalkSessionMark = ({ params, respond, client }) => {
	if (!assertValidParams(params, validateTalkSessionAcknowledgeMarkParams, "talk.session.acknowledgeMark", respond)) return;
	try {
		const session = getUnifiedTalkSession(params.sessionId);
		if (session.kind !== "realtime-relay") {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "talk.session.acknowledgeMark requires realtime relay"));
			return;
		}
		acknowledgeTalkRealtimeRelayMark({
			relaySessionId: session.relaySessionId,
			connId: requireUnifiedTalkSessionConn(session, client?.connId),
			markName: params.markName
		});
		respond(true, { ok: true }, void 0);
	} catch (error) {
		const message = formatForLog(error);
		respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, message, { details: { talkIssue: {
			code: "realtime_unavailable",
			message,
			phase: "request"
		} } }));
	}
};
//#endregion
//#region src/gateway/server-methods/talk-session.ts
function isActiveManagedRoomClient(session, connId) {
	if (!connId) return false;
	return getTalkHandoff(session.handoffId)?.room.activeClientId === connId;
}
function canCloseManagedRoomSession(session, connId) {
	const handoff = getTalkHandoff(session.handoffId);
	return !handoff?.room.activeClientId || handoff.room.activeClientId === connId;
}
function canCreateUnscopedManagedRoomSession(client) {
	return client?.connect?.scopes?.includes(ADMIN_SCOPE) === true;
}
function managedRoomOwnershipError(action) {
	return errorShape(ErrorCodes.INVALID_REQUEST, `talk.session.${action} requires the active managed-room connection`);
}
function respondInvalidRequest(respond, message) {
	respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, message));
}
function respondUnavailable(respond, err) {
	if (err instanceof SessionMutationAuthorizationChangedError) {
		respond(false, void 0, err.error);
		return;
	}
	const message = formatForLog(err);
	if (err instanceof AgentSelectionRequiredError) {
		respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, message));
		return;
	}
	respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, message, { details: { talkIssue: {
		code: "realtime_unavailable",
		message,
		phase: "request"
	} } }));
}
function respondOk(respond, payload = { ok: true }) {
	respond(true, payload, void 0);
}
/** RPC handlers for gateway-managed Talk sessions and room lifecycle. */
const talkSessionHandlers = {
	"talk.session.create": async ({ params, respond, context, client, sessionMutationAuthorization, sessionMutationCommitGuard }) => {
		if (!assertValidParams(params, validateTalkSessionCreateParams, "talk.session.create", respond)) return;
		const mode = normalizeTalkSessionMode(params);
		const transport = normalizeTalkSessionTransport({
			mode,
			transport: params.transport
		});
		const brain = normalizeTalkSessionBrain({
			mode,
			brain: params.brain
		});
		if (transport === "webrtc" || transport === "provider-websocket") {
			respondInvalidRequest(respond, `talk.session.create is Gateway-managed; use talk.client.create for client transport "${transport}"`);
			return;
		}
		try {
			sessionMutationAuthorization?.assertCurrent();
			if (transport === "managed-room") {
				if (brain === "direct-tools" && !canUseTalkDirectTools(client)) {
					respondInvalidRequest(respond, `talk.session.create brain="direct-tools" requires gateway scope: ${ADMIN_SCOPE}`);
					return;
				}
				const spawnedBy = normalizeOptionalString(params.spawnedBy);
				const requestedSessionKey = normalizeOptionalString(params.sessionKey);
				if (requestedSessionKey && !spawnedBy && !canCreateUnscopedManagedRoomSession(client)) {
					respondInvalidRequest(respond, `talk.session.create managed-room sessionKey requires spawnedBy or gateway scope: ${ADMIN_SCOPE}`);
					return;
				}
				const runtimeConfig = context.getRuntimeConfig();
				const target = requestedSessionKey ? requirePreparedTalkSessionTarget(sessionMutationAuthorization?.talkSessionTarget) : void 0;
				sessionMutationAuthorization?.assertCurrent();
				const resolvedSession = await resolveSessionKeyFromResolveParams({
					cfg: runtimeConfig,
					client,
					p: {
						key: target?.canonicalKey,
						...target ? { agentId: target.agentId } : {},
						...spawnedBy ? { spawnedBy } : {},
						includeGlobal: true,
						includeUnknown: true
					}
				});
				if (!resolvedSession.ok) {
					respond(false, void 0, resolvedSession.error);
					return;
				}
				if ("missing" in resolvedSession || "ambiguous" in resolvedSession) {
					respondInvalidRequest(respond, `No session found: ${params.sessionKey}`);
					return;
				}
				sessionMutationCommitGuard?.();
				sessionMutationAuthorization?.assertCurrent();
				const handoff = createTalkHandoff({
					sessionKey: resolvedSession.key,
					provider: normalizeOptionalString(params.provider),
					model: normalizeOptionalString(params.model),
					voice: normalizeOptionalString(params.voice),
					mode,
					transport,
					brain,
					ttlMs: params.ttlMs
				});
				rememberUnifiedTalkSession(handoff.id, {
					kind: "managed-room",
					handoffId: handoff.id,
					token: handoff.token,
					roomId: handoff.roomId
				});
				return respondOk(respond, {
					sessionId: handoff.id,
					provider: handoff.provider,
					mode: handoff.mode,
					transport: handoff.transport,
					brain: handoff.brain,
					handoffId: handoff.id,
					roomId: handoff.roomId,
					roomUrl: handoff.roomUrl,
					token: handoff.token,
					model: handoff.model,
					voice: handoff.voice,
					expiresAt: handoff.expiresAt
				});
			}
			const connId = client?.connId;
			if (!connId) {
				respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "Talk session unavailable"));
				return;
			}
			if (mode === "realtime") {
				if (transport !== "gateway-relay" || brain !== "agent-consult") return respondInvalidRequest(respond, `realtime talk.session.create requires transport="gateway-relay" and brain="agent-consult"`);
				const runtimeConfig = context.getRuntimeConfig();
				const realtimeConfig = buildTalkRealtimeConfig(runtimeConfig, params.provider, params.model);
				const launchOptions = buildRealtimeVoiceLaunchOptions({
					requested: params,
					defaults: realtimeConfig
				});
				const target = requirePreparedTalkSessionTarget(sessionMutationAuthorization?.talkSessionTarget);
				const { agentId } = target;
				const assertCommitAllowed = () => {
					sessionMutationCommitGuard?.();
					sessionMutationAuthorization?.assertCurrent();
				};
				assertCommitAllowed();
				assertSecretOwnerAvailable("capability", "talk:realtime");
				const resolution = resolveConfiguredRealtimeVoiceProvider({
					configuredProviderId: realtimeConfig.provider,
					providerConfigs: realtimeConfig.providers,
					providerConfigOverrides: launchOptions.model ? { model: launchOptions.model } : {},
					cfg: runtimeConfig,
					agentId,
					defaultModel: realtimeConfig.model,
					surface: "gateway-relay"
				});
				const relayLaunch = resolveTalkRealtimeGatewayRelayLaunch({
					...resolution,
					cfg: runtimeConfig,
					launchOptions,
					consultRouting: realtimeConfig.consultRouting
				});
				if (relayLaunch.error) return respondInvalidRequest(respond, relayLaunch.error);
				const providerInstructions = await resolveTalkRealtimeProviderInstructions({
					config: runtimeConfig,
					agentId,
					configuredInstructions: realtimeConfig.instructions,
					sessionKey: target.canonicalKey,
					warn: (message) => context.logGateway.warn(`talk realtime context: ${message}`)
				});
				assertCommitAllowed();
				const ensuredSessionId = await ensureClientVoiceAgentSessionEntry({
					agentId,
					sessionKey: target.canonicalKey,
					storePath: target.storePath,
					creation: resolveSandboxedSessionCreation(client, runtimeConfig) ?? resolveOperatorSessionCreation(client),
					assertCommitAllowed
				});
				sessionMutationCommitGuard?.();
				sessionMutationAuthorization?.assertTargetCurrent({
					agentId,
					sessionKey: target.canonicalKey,
					ensuredSessionId
				});
				const session = createTalkRealtimeRelaySession({
					context,
					connId,
					cfg: runtimeConfig,
					consultAuthority: resolveTalkAgentConsultAuthority(client?.connect?.scopes),
					provider: resolution.provider,
					providerConfig: relayLaunch.providerConfig,
					instructions: buildRealtimeInstructions(providerInstructions),
					tools: [REALTIME_VOICE_AGENT_CONSULT_TOOL, REALTIME_VOICE_AGENT_CONTROL_TOOL],
					model: launchOptions.model,
					sessionTarget: target,
					voice: launchOptions.voice,
					language: normalizeOptionalLowercaseString(params.language),
					forceAgentConsultOnFinalTranscript: relayLaunch.forceAgentConsultOnFinalTranscript
				});
				rememberUnifiedTalkSession(session.relaySessionId, {
					kind: "realtime-relay",
					connId,
					relaySessionId: session.relaySessionId,
					sessionTarget: target
				});
				return respondOk(respond, {
					...session,
					sessionId: session.relaySessionId,
					voiceSessionId: session.relaySessionId,
					mode,
					brain
				});
			}
			if (mode === "transcription") {
				if (transport !== "gateway-relay" || brain !== "none") {
					respondInvalidRequest(respond, `transcription talk.session.create requires transport="gateway-relay" and brain="none"`);
					return;
				}
				const runtimeConfig = context.getRuntimeConfig();
				const transcriptionConfig = buildTalkTranscriptionConfig(runtimeConfig, params.provider, params.model);
				const resolution = resolveConfiguredRealtimeTranscriptionProvider({
					config: runtimeConfig,
					configuredProviderId: transcriptionConfig.provider,
					providerConfigs: transcriptionConfig.providers,
					requestedModel: normalizeOptionalString(params.model),
					defaultModel: transcriptionConfig.model
				});
				const session = createTalkTranscriptionRelaySession({
					context,
					connId,
					provider: resolution.provider,
					providerConfig: resolution.providerConfig
				});
				rememberUnifiedTalkSession(session.transcriptionSessionId, {
					kind: "transcription-relay",
					connId,
					transcriptionSessionId: session.transcriptionSessionId
				});
				respondOk(respond, {
					...session,
					sessionId: session.transcriptionSessionId,
					brain
				});
				return;
			}
			respondInvalidRequest(respond, `stt-tts talk.session.create requires transport="managed-room"`);
		} catch (err) {
			respondUnavailable(respond, err);
		}
	},
	"talk.session.appendAudio": async ({ params, respond, client }) => {
		if (!assertValidParams(params, validateTalkSessionAppendAudioParams, "talk.session.appendAudio", respond)) return;
		try {
			const session = getUnifiedTalkSession(params.sessionId);
			if (session.kind === "realtime-relay") {
				const connId = requireUnifiedTalkSessionConn(session, client?.connId);
				await sendTalkRealtimeRelayAudio({
					relaySessionId: session.relaySessionId,
					connId,
					audioBase64: params.audioBase64,
					timestamp: params.timestamp
				});
				respondOk(respond);
				return;
			}
			if (session.kind === "transcription-relay") {
				const connId = requireUnifiedTalkSessionConn(session, client?.connId);
				sendTalkTranscriptionRelayAudio({
					transcriptionSessionId: session.transcriptionSessionId,
					connId,
					audioBase64: params.audioBase64
				});
				respondOk(respond);
				return;
			}
			respondInvalidRequest(respond, "talk.session.appendAudio is not supported for managed-room sessions");
		} catch (err) {
			respondUnavailable(respond, err);
		}
	},
	"talk.session.cancelOutput": async ({ params, respond, client }) => {
		if (!assertValidParams(params, validateTalkSessionCancelOutputParams, "talk.session.cancelOutput", respond)) return;
		try {
			const session = getUnifiedTalkSession(params.sessionId);
			if (session.kind !== "realtime-relay") {
				respondInvalidRequest(respond, "talk.session.cancelOutput requires realtime relay");
				return;
			}
			const connId = requireUnifiedTalkSessionConn(session, client?.connId);
			respondOk(respond, {
				ok: true,
				...await cancelTalkRealtimeRelayTurn({
					relaySessionId: session.relaySessionId,
					connId,
					reason: normalizeOptionalString(params.reason) ?? "output-cancelled",
					turnId: normalizeOptionalString(params.turnId)
				})
			});
		} catch (err) {
			respondUnavailable(respond, err);
		}
	},
	"talk.session.acknowledgeMark": acknowledgeTalkSessionMark,
	"talk.session.submitToolResult": async ({ params, respond, client }) => {
		if (!assertValidParams(params, validateTalkSessionSubmitToolResultParams, "talk.session.submitToolResult", respond)) return;
		try {
			const session = getUnifiedTalkSession(params.sessionId);
			if (session.kind !== "realtime-relay") {
				respondInvalidRequest(respond, "talk.session.submitToolResult is only supported for realtime relay sessions");
				return;
			}
			const connId = requireUnifiedTalkSessionConn(session, client?.connId);
			await submitTalkRealtimeRelayToolResult({
				relaySessionId: session.relaySessionId,
				connId,
				callId: params.callId,
				result: params.result,
				options: params.options
			});
			respondOk(respond);
		} catch (err) {
			respondUnavailable(respond, err);
		}
	},
	"talk.session.steer": async ({ params, respond, client, sessionMutationAuthorization }) => {
		if (!assertValidParams(params, validateTalkSessionSteerParams, "talk.session.steer", respond)) return;
		try {
			const session = getUnifiedTalkSession(params.sessionId);
			if (session.kind === "realtime-relay") {
				const connId = requireUnifiedTalkSessionConn(session, client?.connId);
				const assertCurrent = () => {
					sessionMutationAuthorization?.assertCurrent();
					if (getUnifiedTalkSession(params.sessionId) !== session || sessionMutationAuthorization?.talkSessionTarget && sessionMutationAuthorization.talkSessionTarget !== session.sessionTarget) throw new Error("Talk session changed while steering the agent run");
				};
				assertCurrent();
				respondOk(respond, await steerTalkRealtimeRelayAgentRun({
					relaySessionId: session.relaySessionId,
					connId,
					sessionKey: normalizeOptionalString(params.sessionKey),
					text: params.text,
					mode: normalizeOptionalString(params.mode),
					assertCurrent
				}));
				return;
			}
			if (session.kind === "transcription-relay") {
				respondInvalidRequest(respond, "talk.session.steer requires an agent-backed Talk session");
				return;
			}
			if (!isActiveManagedRoomClient(session, client?.connId)) {
				respond(false, void 0, managedRoomOwnershipError("steer"));
				return;
			}
			const handoff = getTalkHandoff(session.handoffId);
			const sessionKey = handoff?.sessionKey;
			if (!sessionKey) {
				respondInvalidRequest(respond, "talk.session.steer requires a session key");
				return;
			}
			const requestedSessionKey = normalizeOptionalString(params.sessionKey);
			if (requestedSessionKey && requestedSessionKey !== sessionKey) {
				respondInvalidRequest(respond, "talk.session.steer sessionKey does not match the managed-room session");
				return;
			}
			respondOk(respond, await controlRealtimeVoiceAgentRun({
				sessionKey,
				text: params.text,
				mode: params.mode,
				recentEvents: handoff?.room.talk.recentEvents
			}));
		} catch (err) {
			respondUnavailable(respond, err);
		}
	},
	"talk.session.close": async ({ params, respond, client, context }) => {
		if (!assertValidParams(params, validateTalkSessionCloseParams, "talk.session.close", respond)) return;
		try {
			const session = getUnifiedTalkSession(params.sessionId);
			if (session.kind === "realtime-relay") {
				const connId = requireUnifiedTalkSessionConn(session, client?.connId);
				stopTalkRealtimeRelaySession({
					relaySessionId: session.relaySessionId,
					connId
				});
			} else if (session.kind === "transcription-relay") {
				const connId = requireUnifiedTalkSessionConn(session, client?.connId);
				stopTalkTranscriptionRelaySession({
					transcriptionSessionId: session.transcriptionSessionId,
					connId
				});
			} else {
				if (!canCloseManagedRoomSession(session, client?.connId)) {
					respond(false, void 0, managedRoomOwnershipError("close"));
					return;
				}
				const result = revokeTalkHandoff(session.handoffId);
				broadcastTalkRoomEvents(context, result.activeClientId, {
					handoffId: session.handoffId,
					roomId: session.roomId,
					events: result.events
				});
			}
			forgetUnifiedTalkSession(params.sessionId);
			respondOk(respond);
		} catch (err) {
			respondUnavailable(respond, err);
		}
	}
};
//#endregion
//#region src/gateway/server-methods/talk.ts
function resolveCatalogProviderSelection(configuredProvider, resolveAutomaticProvider) {
	try {
		return {
			activeProvider: resolveAutomaticProvider(),
			ready: true
		};
	} catch {
		return {
			...configuredProvider ? { activeProvider: configuredProvider } : {},
			ready: false
		};
	}
}
function canReadTalkSecrets(client) {
	const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
	return scopes.includes("operator.admin") || scopes.includes("operator.talk.secrets");
}
function asStringRecord(value) {
	const record = asOptionalRecord(value);
	if (!record) return;
	const next = {};
	for (const [key, entryValue] of Object.entries(record)) if (typeof entryValue === "string") next[key] = entryValue;
	return Object.keys(next).length > 0 ? next : void 0;
}
function normalizeAliasKey(value) {
	return normalizeLowercaseStringOrEmpty(value);
}
function resolveTalkVoiceId(providerConfig, requested) {
	if (!requested) return;
	const aliases = asStringRecord(providerConfig.voiceAliases);
	if (!aliases) return requested;
	const normalizedRequested = normalizeAliasKey(requested);
	for (const [alias, voiceId] of Object.entries(aliases)) if (normalizeAliasKey(alias) === normalizedRequested) return voiceId;
	return requested;
}
function withTalkBaseTtsSpeakerSelectionCompat(baseTts, talkProvider) {
	const next = withSpeakerSelectionCompat(baseTts);
	const providers = asOptionalRecord(baseTts.providers);
	if (providers) next.providers = Object.fromEntries(Object.entries(providers).map(([providerId, providerConfig]) => {
		const normalized = withSpeakerSelectionCompat(asOptionalRecord(providerConfig) ?? {});
		if (typeof talkProvider?.apiKey === "string" && providerMatchesId(talkProvider.provider, providerId) && typeof normalized.apiKey === "object") normalized.apiKey = talkProvider.apiKey;
		return [providerId, normalized];
	}));
	for (const [key, value] of Object.entries(baseTts)) {
		if (key === "providers") continue;
		const record = asOptionalRecord(value);
		if (record) next[key] = withSpeakerSelectionCompat(record);
	}
	return next;
}
function buildTalkTtsConfig(config) {
	const resolved = resolveActiveTalkProviderConfig(config.talk);
	const provider = canonicalizeSpeechProviderId(resolved?.provider, config);
	if (!resolved || !provider) return {
		error: "talk.speak unavailable: talk provider not configured",
		reason: "talk_unconfigured"
	};
	assertSecretOwnerAvailable("capability", "talk:speech");
	const speechProvider = getSpeechProvider(provider, config);
	if (!speechProvider) return {
		error: `talk.speak unavailable: speech provider "${provider}" does not support Talk mode`,
		reason: "talk_provider_unsupported"
	};
	const providerConfig = withSpeakerSelectionFallbackCompat(resolved.config);
	const baseTts = withTalkBaseTtsSpeakerSelectionCompat(asOptionalRecord(config.tts) ?? {}, {
		provider: speechProvider,
		apiKey: providerConfig.apiKey
	});
	const resolvedProviderConfig = speechProvider.resolveTalkConfig?.({
		cfg: config,
		baseTtsConfig: baseTts,
		talkProviderConfig: providerConfig,
		timeoutMs: baseTts.timeoutMs ?? 3e4
	}) ?? providerConfig;
	const talkTts = {
		...baseTts,
		auto: "always",
		provider,
		providers: {
			...asOptionalRecord(baseTts.providers) ?? {},
			[provider]: resolvedProviderConfig
		}
	};
	return {
		provider,
		providerConfig,
		cfg: {
			...config,
			tts: talkTts
		}
	};
}
function buildTalkCatalog(config) {
	const talkResolved = resolveActiveTalkProviderConfig(config.talk);
	const activeSpeechProvider = canonicalizeSpeechProviderId(talkResolved?.provider, config);
	const transcriptionConfig = buildTalkTranscriptionConfig(config);
	const transcriptionSelection = resolveCatalogProviderSelection(canonicalizeRealtimeTranscriptionProviderId(transcriptionConfig.provider, config), () => resolveConfiguredRealtimeTranscriptionProvider({
		config,
		configuredProviderId: transcriptionConfig.provider,
		providerConfigs: transcriptionConfig.providers,
		defaultModel: transcriptionConfig.model
	}).provider.id);
	const activeTranscriptionProvider = transcriptionSelection.activeProvider;
	const realtimeConfig = buildTalkRealtimeConfig(config);
	const realtimeProviderIds = Object.keys(realtimeConfig.providers);
	const realtimeSurface = realtimeConfig.transport === "gateway-relay" ? "gateway-relay" : "browser-session";
	const realtimeAgentId = resolveTalkSessionAgentId(config);
	const realtimeModelOverride = realtimeConfig.model ? { providerConfigOverrides: { model: realtimeConfig.model } } : {};
	const realtimeSelection = resolveCatalogProviderSelection(canonicalizeRealtimeVoiceProviderId(realtimeConfig.provider, config), () => {
		assertSecretOwnerAvailable("capability", "talk:realtime");
		return resolveConfiguredRealtimeVoiceProvider({
			cfg: config,
			configuredProviderId: realtimeConfig.provider,
			providerConfigs: realtimeConfig.providers,
			...realtimeModelOverride,
			agentId: realtimeAgentId,
			defaultModel: realtimeConfig.model,
			surface: realtimeSurface
		}).provider.id;
	});
	const activeRealtimeProvider = realtimeSelection.activeProvider;
	const speechAvailable = isSecretOwnerAvailable("capability", "talk:speech");
	return {
		modes: [
			"realtime",
			"stt-tts",
			"transcription"
		],
		transports: [
			"webrtc",
			"provider-websocket",
			"gateway-relay",
			"managed-room"
		],
		brains: [
			"agent-consult",
			"direct-tools",
			"none"
		],
		speech: {
			...activeSpeechProvider ? { activeProvider: activeSpeechProvider } : {},
			providers: listSpeechProviders(config).map((provider) => {
				const entry = {
					id: provider.id,
					label: provider.label,
					configured: speechAvailable && configuredOrFalse(() => {
						const setup = provider.id === activeSpeechProvider ? buildTalkTtsConfig(config) : void 0;
						const speechConfig = setup && !("error" in setup) ? setup.cfg : config;
						const effectiveTts = resolveTtsConfig(speechConfig);
						return provider.isConfigured({
							cfg: speechConfig,
							providerConfig: getResolvedSpeechProviderConfig(effectiveTts, provider.id, speechConfig),
							timeoutMs: effectiveTts.timeoutMs
						});
					}),
					modes: ["stt-tts"],
					brains: ["agent-consult"]
				};
				if (provider.models) entry.models = [...provider.models];
				if (provider.aliases?.length) entry.aliases = [...provider.aliases];
				if (provider.voices) entry.voices = [...provider.voices];
				return entry;
			})
		},
		transcription: {
			ready: transcriptionSelection.ready,
			...activeTranscriptionProvider ? { activeProvider: activeTranscriptionProvider } : {},
			providers: listTalkTranscriptionProviders(config, [transcriptionConfig.provider, ...Object.keys(transcriptionConfig.providers)]).map((provider) => {
				const rawConfig = getVoiceProviderConfig({
					providerConfigs: transcriptionConfig.providers,
					provider,
					configuredProviderId: activeTranscriptionProvider && normalizeOptionalLowercaseString(provider.id) === normalizeOptionalLowercaseString(activeTranscriptionProvider) ? transcriptionConfig.provider : void 0
				});
				const rawConfigWithModel = transcriptionConfig.model && rawConfig.model === void 0 ? {
					...rawConfig,
					model: transcriptionConfig.model
				} : rawConfig;
				const providerConfig = provider.resolveConfig?.({
					cfg: config,
					rawConfig: rawConfigWithModel
				}) ?? rawConfigWithModel;
				const entry = {
					id: provider.id,
					label: provider.label,
					configured: configuredOrFalse(() => provider.isConfigured({
						cfg: config,
						providerConfig
					})),
					modes: ["transcription"],
					transports: ["gateway-relay"],
					brains: ["none"]
				};
				if (provider.models?.length) entry.models = [...provider.models];
				if (provider.defaultModel) entry.defaultModel = provider.defaultModel;
				if (provider.aliases?.length) entry.aliases = [...provider.aliases];
				return entry;
			})
		},
		realtime: {
			ready: realtimeSelection.ready,
			...activeRealtimeProvider ? { activeProvider: activeRealtimeProvider } : {},
			providers: listRealtimeVoiceProviders(config, realtimeProviderIds).map((provider) => {
				const available = isSecretOwnerAvailable("capability", "talk:realtime");
				const rawConfig = resolveProviderRawConfig({
					providerConfigs: realtimeConfig.providers ?? {},
					providerId: provider.id,
					providerAliases: provider.aliases,
					configuredProviderId: provider.id === activeRealtimeProvider ? realtimeConfig.provider : void 0
				});
				const rawConfigWithModel = realtimeConfig.model ? {
					...rawConfig,
					model: realtimeConfig.model
				} : rawConfig;
				const providerConfig = available ? provider.resolveConfig?.({
					cfg: config,
					rawConfig: rawConfigWithModel
				}) ?? rawConfigWithModel : rawConfigWithModel;
				const capabilities = available ? resolveRealtimeVoiceProviderCapabilities({
					provider,
					providerConfig,
					cfg: config,
					agentId: realtimeAgentId,
					surface: realtimeSurface
				}) : provider.capabilities;
				const entry = {
					id: provider.id,
					label: provider.label,
					configured: available && configuredOrFalse(() => isRealtimeVoiceProviderConfigured({
						provider,
						cfg: config,
						providerConfig,
						agentId: realtimeAgentId,
						surface: realtimeSurface
					})),
					modes: ["realtime"],
					brains: capabilities?.supportsToolCalls === false && capabilities.handlesAgentConsult !== true ? ["none"] : ["agent-consult"],
					supportsBrowserSession: Boolean(capabilities?.supportsBrowserSession ?? provider.createBrowserSession)
				};
				if (provider.defaultModel) entry.defaultModel = provider.defaultModel;
				if (provider.models?.length) entry.models = [...provider.models];
				if (provider.voices?.length) entry.voices = [...provider.voices];
				if (capabilities?.voicesByModel) entry.voicesByModel = capabilities.voicesByModel;
				if (provider.aliases?.length) entry.aliases = [...provider.aliases];
				if (capabilities?.transports) entry.transports = [...capabilities.transports];
				if (capabilities?.inputAudioFormats) entry.inputAudioFormats = capabilities.inputAudioFormats.map((format) => ({ ...format }));
				if (capabilities?.outputAudioFormats) entry.outputAudioFormats = capabilities.outputAudioFormats.map((format) => ({ ...format }));
				if (capabilities?.supportsBargeIn !== void 0) entry.supportsBargeIn = capabilities.supportsBargeIn;
				if (capabilities?.supportsToolCalls !== void 0) entry.supportsToolCalls = capabilities.supportsToolCalls;
				if (capabilities?.supportsVideoFrames !== void 0) entry.supportsVideoFrames = capabilities.supportsVideoFrames;
				if (capabilities?.supportsSessionResumption !== void 0) entry.supportsSessionResumption = capabilities.supportsSessionResumption;
				return entry;
			})
		}
	};
}
function isFallbackEligibleTalkReason(reason) {
	return reason === "talk_unconfigured" || reason === "talk_provider_unsupported" || reason === "method_unavailable";
}
function talkSpeakError(reason, message) {
	const details = {
		reason,
		fallbackEligible: isFallbackEligibleTalkReason(reason)
	};
	return errorShape(ErrorCodes.UNAVAILABLE, message, { details });
}
function resolveTalkSpeed(params) {
	if (typeof params.speed === "number") return params.speed;
	if (typeof params.rateWpm !== "number" || params.rateWpm <= 0) return;
	const resolved = params.rateWpm / 175;
	if (resolved <= .5 || resolved >= 2) return;
	return resolved;
}
function buildTalkSpeakOverrides(provider, providerConfig, config, params) {
	const speechProvider = getSpeechProvider(provider, config);
	if (!speechProvider?.resolveTalkOverrides) return { provider };
	const resolvedSpeed = resolveTalkSpeed(params);
	const resolvedVoiceId = resolveTalkVoiceId(providerConfig, normalizeOptionalString(params.voiceId));
	const providerOverrides = speechProvider.resolveTalkOverrides({
		talkProviderConfig: providerConfig,
		params: {
			...params,
			...resolvedVoiceId == null ? {} : { voiceId: resolvedVoiceId },
			...resolvedSpeed == null ? {} : { speed: resolvedSpeed }
		}
	});
	if (!providerOverrides || Object.keys(providerOverrides).length === 0) return { provider };
	return {
		provider,
		providerOverrides: { [provider]: providerOverrides }
	};
}
function resolveTalkResponseFromConfig(params) {
	const normalizedTalk = normalizeTalkSection(params.sourceConfig.talk);
	const configuredPayload = normalizedTalk ? buildTalkConfigResponse(normalizedTalk) : void 0;
	const runtimeRealtime = buildTalkRealtimeConfig(params.runtimeConfig);
	const effectiveProvider = canonicalizeRealtimeVoiceProviderId(runtimeRealtime.provider, params.runtimeConfig);
	const sourceRealtime = buildTalkRealtimeConfig(params.sourceConfig, effectiveProvider);
	const sourceProviders = {};
	for (const [providerId, providerConfig] of Object.entries(sourceRealtime.providers)) {
		const canonicalProviderId = canonicalizeRealtimeVoiceProviderId(providerId, params.runtimeConfig) ?? providerId;
		sourceProviders[canonicalProviderId] = {
			...sourceProviders[canonicalProviderId],
			...providerConfig
		};
	}
	const effectiveRealtime = normalizeTalkSection({ realtime: {
		...effectiveProvider ? { provider: effectiveProvider } : {},
		...runtimeRealtime.model ? { model: runtimeRealtime.model } : {},
		...runtimeRealtime.transport ? { transport: runtimeRealtime.transport } : {},
		...Object.keys(sourceProviders).length > 0 ? { providers: sourceProviders } : {}
	} })?.realtime;
	if (!configuredPayload && !effectiveRealtime) return;
	const realtime = effectiveRealtime ? {
		...configuredPayload?.realtime,
		...effectiveRealtime
	} : configuredPayload?.realtime;
	const sourcePayload = {
		...configuredPayload,
		...realtime ? { realtime } : {}
	};
	const payload = params.includeSecrets ? projectTalkSourcePayloadForSecrets(sourcePayload) : sourcePayload;
	const sourceResolved = configuredPayload?.resolved;
	const runtimeResolved = resolveActiveTalkProviderConfig(params.runtimeConfig.talk);
	const activeProviderId = sourceResolved?.provider ?? runtimeResolved?.provider;
	const provider = canonicalizeSpeechProviderId(activeProviderId, params.runtimeConfig);
	if (!provider) return payload;
	if (params.includeSecrets) assertSecretOwnerAvailable("capability", "talk:speech");
	else if (!isSecretOwnerAvailable("capability", "talk:speech")) return payload;
	const speechProvider = getSpeechProvider(provider, params.runtimeConfig);
	const sourceBaseTts = withTalkBaseTtsSpeakerSelectionCompat(asOptionalRecord(params.sourceConfig.tts) ?? {});
	const sourceProviderConfig = withSpeakerSelectionFallbackCompat(sourceResolved?.config);
	const runtimeProviderConfig = withSpeakerSelectionFallbackCompat(runtimeResolved?.config);
	const providerInputConfig = stripUnresolvedSecretApiKey(Object.keys(runtimeProviderConfig).length > 0 ? runtimeProviderConfig : sourceProviderConfig);
	const runtimeBaseTts = withTalkBaseTtsSpeakerSelectionCompat(asOptionalRecord(params.runtimeConfig.tts) ?? {}, {
		provider: speechProvider ?? { id: provider },
		apiKey: providerInputConfig.apiKey
	});
	const selectedBaseTts = Object.keys(runtimeBaseTts).length > 0 ? runtimeBaseTts : stripUnresolvedSecretApiKeysFromBaseTtsProviders(sourceBaseTts);
	const resolvedConfig = speechProvider?.resolveTalkConfig?.({
		cfg: params.runtimeConfig,
		baseTtsConfig: selectedBaseTts,
		talkProviderConfig: providerInputConfig,
		timeoutMs: typeof selectedBaseTts.timeoutMs === "number" ? selectedBaseTts.timeoutMs : 3e4
	}) ?? providerInputConfig;
	const responseConfig = projectTalkResolvedProviderConfig({
		includeSecrets: params.includeSecrets,
		sourceProviderConfig,
		resolvedConfig
	});
	return {
		...payload,
		provider,
		resolved: {
			provider,
			config: responseConfig
		}
	};
}
function projectTalkResolvedProviderConfig(params) {
	if (!params.includeSecrets) return params.sourceProviderConfig.apiKey === void 0 ? params.resolvedConfig : {
		...params.resolvedConfig,
		apiKey: params.sourceProviderConfig.apiKey
	};
	const projected = redactConfigObject(params.resolvedConfig);
	const apiKey = normalizeOptionalString(params.resolvedConfig.apiKey);
	return apiKey === void 0 ? projected : {
		...projected,
		apiKey
	};
}
function projectTalkSourceProviderConfigForSecrets(config) {
	const projected = redactConfigObject(config);
	if (config.apiKey === void 0 || typeof config.apiKey === "string") return projected;
	return {
		...projected,
		apiKey: config.apiKey
	};
}
function projectTalkSourceProviderMapForSecrets(providers) {
	if (!providers) return;
	return Object.fromEntries(Object.entries(providers).map(([providerId, providerConfig]) => [providerId, projectTalkSourceProviderConfigForSecrets(providerConfig)]));
}
function projectTalkRealtimeForSecrets(realtime) {
	const projected = redactConfigObject(realtime);
	const providers = projectTalkSourceProviderMapForSecrets(realtime.providers);
	return providers ? {
		...projected,
		providers
	} : projected;
}
function projectTalkSourcePayloadForSecrets(payload) {
	const projected = redactConfigObject(payload);
	const providers = projectTalkSourceProviderMapForSecrets(payload.providers);
	if (providers) projected.providers = providers;
	if (payload.realtime) projected.realtime = projectTalkRealtimeForSecrets(payload.realtime);
	return projected;
}
function stripUnresolvedSecretApiKey(config) {
	return stripUnresolvedSecretApiKeyFromRecord(config);
}
function stripUnresolvedSecretApiKeysFromBaseTtsProviders(base) {
	const providers = asOptionalRecord(base.providers);
	if (!providers) return base;
	let mutated = false;
	const cleaned = Object.create(null);
	for (const [providerId, providerConfig] of Object.entries(providers)) {
		const cfg = asOptionalRecord(providerConfig);
		if (!cfg) {
			cleaned[providerId] = providerConfig;
			continue;
		}
		const next = stripUnresolvedSecretApiKeyFromRecord(cfg);
		if (next !== cfg) mutated = true;
		cleaned[providerId] = next;
	}
	if (!mutated) return base;
	return {
		...base,
		providers: cleaned
	};
}
function stripUnresolvedSecretApiKeyFromRecord(config) {
	if (config.apiKey === void 0 || typeof config.apiKey === "string") return config;
	const { apiKey: _omit, ...rest } = config;
	return rest;
}
/** Gateway request handlers for Talk config, catalog, mode, sessions, and speech. */
const talkHandlers = {
	...talkSessionHandlers,
	...talkClientHandlers,
	"talk.catalog": async ({ params, respond, context }) => {
		if (!assertValidParams(params ?? {}, validateTalkCatalogParams, "talk.catalog", respond)) return;
		try {
			respond(true, buildTalkCatalog(context.getRuntimeConfig()), void 0);
		} catch (err) {
			respond(false, void 0, errorShape(err instanceof AgentSelectionRequiredError ? ErrorCodes.INVALID_REQUEST : ErrorCodes.UNAVAILABLE, formatForLog(err)));
		}
	},
	"talk.config": async ({ params, respond, client, context }) => {
		if (!assertValidParams(params, validateTalkConfigParams, "talk.config", respond)) return;
		const includeSecrets = Boolean(params.includeSecrets);
		if (includeSecrets && !canReadTalkSecrets(client)) {
			respond(false, void 0, missingScopeErrorShape({
				missingScope: TALK_SECRETS_SCOPE,
				requiredScopes: [READ_SCOPE, TALK_SECRETS_SCOPE]
			}));
			return;
		}
		const snapshot = await readConfigFileSnapshot();
		const runtimeConfig = context.getRuntimeConfig();
		const configPayload = {};
		let talk;
		try {
			talk = resolveTalkResponseFromConfig({
				includeSecrets,
				sourceConfig: snapshot.config,
				runtimeConfig
			});
		} catch (err) {
			respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
			return;
		}
		if (talk) configPayload.talk = includeSecrets ? talk : redactConfigObject(talk);
		const sessionMainKey = snapshot.config.session?.mainKey;
		if (typeof sessionMainKey === "string") configPayload.session = { mainKey: sessionMainKey };
		const profileId = client?.authenticatedUserProfile?.profileId;
		const canonicalProfileId = profileId ? resolveUserProfileId(profileId) : void 0;
		const accentKey = UI_APPEARANCE_PREFERENCE_KEYS.accent;
		const seamColor = (canonicalProfileId ? normalizeUiAppearancePreference(accentKey, getUserPreferences(canonicalProfileId, [accentKey])[accentKey]) : void 0) ?? snapshot.config.ui?.prefs?.accent ?? snapshot.config.ui?.seamColor;
		if (typeof seamColor === "string") configPayload.ui = { seamColor };
		respond(true, { config: configPayload }, void 0);
	},
	"talk.speak": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateTalkSpeakParams, "talk.speak", respond)) return;
		const typedParams = params;
		const text = normalizeOptionalString(typedParams.text);
		if (!text) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "talk.speak requires text"));
			return;
		}
		if (typedParams.speed == null && typedParams.rateWpm != null && resolveTalkSpeed(typedParams) == null) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `invalid talk.speak params: rateWpm must resolve to speed between 0.5 and 2.0`));
			return;
		}
		try {
			const runtimeConfig = context.getRuntimeConfig();
			const setup = buildTalkTtsConfig(runtimeConfig);
			if ("error" in setup) {
				respond(false, void 0, talkSpeakError(setup.reason, setup.error));
				return;
			}
			const overrides = buildTalkSpeakOverrides(setup.provider, setup.providerConfig, runtimeConfig, typedParams);
			const speechText = isCodeHeavySpeechText(text) ? CODE_HEAVY_SPOKEN_FALLBACK : text;
			const result = await synthesizeTalkSpeech({
				text: speechText,
				cfg: setup.cfg,
				overrides,
				disableFallback: true
			});
			if (!result.success || !result.audioBuffer) {
				respond(false, void 0, talkSpeakError("synthesis_failed", result.error ?? "talk synthesis failed"));
				return;
			}
			if ((result.provider ?? setup.provider).trim().length === 0) {
				respond(false, void 0, talkSpeakError("invalid_audio_result", "talk synthesis returned empty provider"));
				return;
			}
			if (result.audioBuffer.length === 0) {
				respond(false, void 0, talkSpeakError("invalid_audio_result", "talk synthesis returned empty audio"));
				return;
			}
			respond(true, {
				audioBase64: result.audioBuffer.toString("base64"),
				provider: result.provider ?? setup.provider,
				outputFormat: result.outputFormat,
				voiceCompatible: result.voiceCompatible,
				mimeType: inferSpeechMimeType(result.outputFormat, result.fileExtension),
				fileExtension: result.fileExtension
			}, void 0);
		} catch (err) {
			respond(false, void 0, talkSpeakError("synthesis_failed", formatForLog(err)));
		}
	},
	"talk.mode": async ({ params, respond, context, client, isWebchatConnect }) => {
		if (client && isWebchatConnect(client.connect) && !await context.hasConnectedTalkNode()) {
			respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "talk disabled: no connected Talk-capable nodes"));
			return;
		}
		if (!assertValidParams(params, validateTalkModeParams, "talk.mode", respond)) return;
		const payload = {
			enabled: params.enabled,
			phase: params.phase ?? null,
			ts: Date.now()
		};
		context.broadcast("talk.mode", payload, { dropIfSlow: true });
		respond(true, payload, void 0);
	}
};
//#endregion
export { talkHandlers };
