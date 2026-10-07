async function completeEmbeddedRun(input) {
	const terminalAborted = isEmbeddedRunTerminalAbort(input.terminalState.outcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(input.terminalState.outcome);
	const error = input.incompleteTurnText !== void 0 || classifyAgentRunTerminalOutcome(input.terminalState.outcome) === "failure" ? {
		kind: "incomplete_turn",
		message: formatErrorMessage(projectAgentRunAttemptTerminal(input.attempt.terminal).promptError ?? input.terminalState.outcome.error ?? "Agent couldn't generate a response."),
		fallbackSafe: input.incompleteTurnFallbackSafe ?? false,
		terminalPresentation: input.terminalToolPresentation !== void 0
	} : void 0;
	const incompleteTurnText = input.incompleteTurnText ?? error?.message ?? null;
	const replayInvalid = input.resolveReplayInvalid(incompleteTurnText);
	const yieldHasContinuation = input.attempt.yieldDetected && hasYieldContinuationEvidence(input.attempt);
	const livenessState = !error && input.attempt.yieldDetected ? "paused" : resolveRunLivenessState({
		payloadCount: input.payloadCount,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt,
		incompleteTurnText
	});
	const stopReason = error ? void 0 : input.attempt.clientToolCalls ? "tool_calls" : input.attempt.yieldDetected ? "end_turn" : input.attemptAssistant?.stopReason;
	if (error) {
		input.setTerminalLifecycleMeta({
			replayInvalid,
			livenessState
		});
		if (input.authProfileId) try {
			await input.maybeMarkAuthProfileFailure({
				profileId: input.authProfileId,
				reason: input.assistantProfileFailureReason,
				modelId: input.modelId
			});
		} catch (bookkeepingError) {
			log$3.warn(`terminal auth bookkeeping failed; preserving result: ${String(bookkeepingError)}`);
		}
	} else {
		log$3.debug(`embedded run done: runId=${input.runParams.runId} sessionId=${input.runParams.sessionId} durationMs=${Date.now() - input.startedAtMs} aborted=${terminalAborted}`);
		markEmbeddedRunAuthProfileSuccess({
			authProfileStateMode: input.runParams.authProfileStateMode,
			profileId: input.authProfileId,
			profileStore: input.profileFailureStore,
			provider: input.provider,
			agentDir: input.runParams.agentDir,
			runId: input.runParams.runId,
			sessionId: input.runParams.sessionId
		});
		reportEmbeddedRunSuccessfulAuthBinding({
			profileId: input.authProfileId,
			profileStore: input.attemptAuthProfileStore,
			apiKeyInfo: input.apiKeyInfo,
			attempt: input.attempt,
			provider: input.provider,
			agentDir: input.runParams.agentDir,
			modelId: input.modelTransportId,
			modelApi: input.modelTransportApi,
			...input.modelTransportBaseUrl ? { modelBaseUrl: input.modelTransportBaseUrl } : {},
			requestTransportOverrides: input.requestTransportOverrides ?? "none",
			config: input.runParams.config,
			agentHarnessId: input.agentHarnessId,
			pluginHarnessOwnsTransport: input.pluginHarnessOwnsTransport,
			pluginHarnessOwnsAuthBootstrap: input.pluginHarnessOwnsAuthBootstrap,
			onSuccessfulAuthBinding: input.runParams.onSuccessfulAuthBinding
		});
		input.runParams.onSuccessfulAuthProfile?.(input.authProfileId);
	}
	const acceptedSessionSpawnContinuation = shouldContinueInteractiveAcceptedSessionSpawns({
		attempt: input.attempt,
		run: input.runParams
	});
	const keepEmptyReplySilent = input.runParams.lane !== AGENT_LANE_SUBAGENT || Boolean(input.finalAssistantRawText?.trim());
	const hasPartialAssistantText = input.attempt.assistantTexts.some((text) => text.trim().length > 0) || resolveFinalAssistantVisibleText(input.attemptAssistant) !== void 0;
	const isTruncatedPartialReply = stopReason === "length" && !hasAttemptTerminalState(input.attempt) && hasPartialAssistantText;
	const terminalPayloads = input.incompleteTurnText !== void 0 ? [{
		text: input.terminalToolPresentation ? input.terminalToolPresentation.concat("\n\n", input.incompleteTurnText) : input.incompleteTurnText,
		isError: true
	}] : error ? input.payloadsForTerminalPath : input.emptyAssistantReplyIsSilent ? [{ text: SILENT_REPLY_TOKEN }] : input.payloadsForTerminalPath?.length ? isTruncatedPartialReply ? [...input.payloadsForTerminalPath, { text: TRUNCATED_REPLY_NOTICE_TEXT }] : input.payloadsForTerminalPath : acceptedSessionSpawnContinuation ? [{ text: ACCEPTED_SESSION_SPAWN_CONTINUATION_TEXT }] : input.attempt.yieldDetected && !yieldHasContinuation ? [{ text: YIELD_DIAGNOSTIC_TEXT }] : input.payloadsForTerminalPath;
	if (!error) input.setTerminalLifecycleMeta({
		replayInvalid,
		livenessState,
		stopReason,
		yielded: input.attempt.yieldDetected === true
	});
	return {
		action: "complete",
		result: {
			payloads: terminalPayloads?.length ? terminalPayloads : void 0,
			...!error && input.attempt.diagnosticTrace ? { diagnosticTrace: freezeDiagnosticTraceContext(input.attempt.diagnosticTrace) } : {},
			meta: {
				durationMs: Date.now() - input.startedAtMs,
				agentMeta: input.agentMeta,
				aborted: terminalAborted,
				systemPromptReport: input.attempt.systemPromptReport,
				finalPromptText: input.attempt.finalPromptText,
				finalAssistantVisibleText: input.finalAssistantVisibleText,
				finalAssistantRawText: input.finalAssistantRawText,
				replayInvalid,
				livenessState,
				agentHarnessResultClassification: input.attempt.agentHarnessResultClassification,
				...error ? { error } : {
					...input.attempt.yieldDetected ? { yielded: true } : {},
					...input.attempt.yieldAcknowledgment ? { yieldAcknowledgment: input.attempt.yieldAcknowledgment } : {},
					...acceptedSessionSpawnContinuation ? { continuationPending: true } : {},
					...input.emptyAssistantReplyIsSilent && keepEmptyReplySilent ? { terminalReplyKind: "silent-empty" } : {},
					...input.intentionalTerminalCompletion ? { intentionalTerminalCompletion: "tool-batch" } : {},
					stopReason,
					pendingToolCalls: input.attempt.clientToolCalls?.map((call) => ({
						id: randomBytes(5).toString("hex").slice(0, 9),
						name: call.name,
						arguments: JSON.stringify(call.params)
					})),
					executionTrace: {
						winnerProvider: input.reportedModelRef.provider,
						winnerModel: input.reportedModelRef.model,
						attempts: input.traceAttempts.length > 0 || input.attemptAssistant?.provider || input.attemptAssistant?.model ? [...input.traceAttempts, {
							provider: input.reportedModelRef.provider,
							model: input.reportedModelRef.model,
							result: "success",
							stage: "assistant"
						}] : void 0,
						fallbackUsed: input.traceAttempts.some(input.traceAttemptUsesFallback),
						runner: "embedded"
					},
					requestShaping: {
						...input.authProfileId ? { authMode: "auth-profile" } : {},
						...input.thinkLevel ? { thinking: input.thinkLevel } : {},
						...input.runParams.reasoningLevel ? { reasoning: input.runParams.reasoningLevel } : {},
						...input.runParams.verboseLevel ? { verbose: input.runParams.verboseLevel } : {},
						...input.runParams.blockReplyBreak ? { blockStreaming: input.runParams.blockReplyBreak } : {}
					},
					completion: {
						...stopReason ? { stopReason } : {},
						...stopReason ? { finishReason: stopReason } : {},
						...stopReason?.toLowerCase().includes("refusal") ? { refusal: true } : {}
					},
					contextManagement: input.contextRecoveryState.autoCompactionCount > 0 ? { lastTurnCompactions: input.contextRecoveryState.autoCompactionCount } : void 0
				},
				toolSummary: input.attemptToolSummary,
				...input.failureSignal ? { failureSignal: input.failureSignal } : {},
				...input.terminalToolFailure ? { terminalToolFailure: input.terminalToolFailure } : {}
			},
			...copyAttemptDeliveryState(input.attempt)
		}
	};
}
