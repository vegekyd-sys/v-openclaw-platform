// Native overflow recovery fixture, artifact SHA256: 128a61c9e10a47d501ad425345f9f05a88c9dc66b665e32f979d12e29675cd67
async function recoverEmbeddedRunOverflow(input) {
	const contextOverflowError = !input.aborted && !input.signalOwnedInterruption ? (() => {
		if (input.promptError) {
			const errorText = formatErrorMessage(input.promptError);
			if (isLikelyContextOverflowError(errorText)) return {
				text: errorText,
				source: "promptError"
			};
			return null;
		}
		if (isProviderRefusalAssistantError(input.assistantOverflowCandidate)) return null;
		if (input.assistantOverflowCandidate && input.contextTokenBudget !== void 0 && isContextOverflow(input.assistantOverflowCandidate, input.contextTokenBudget)) return {
			text: input.assistantOverflowCandidate.errorMessage?.trim() || "Context window exceeded",
			source: "assistantError"
		};
		if (input.assistantErrorText && isLikelyContextOverflowError(input.assistantErrorText)) return {
			text: input.assistantErrorText,
			source: "assistantError"
		};
		return null;
	})() : null;
	if (!contextOverflowError || !input.genericCompactionRecoveryAllowed || input.contextTokenBudget === void 0) return { action: "none" };
	input.assertRecoveryActive();
	const contextTokenBudget = input.contextTokenBudget;
	const terminal = projectAgentRunAttemptTerminal(input.attempt.terminal);
	const providerPromptRejection = contextOverflowError.source === "assistantError" || terminal.promptErrorSource === "prompt" ? markLastProviderPromptContextRejected(getProviderPromptState(input.runParams.runId)) : void 0;
	const runParams = input.runParams;
	const overflowDiagId = createRunRecoveryDiagId();
	const errorText = contextOverflowError.text;
	const observedOverflowTokens = extractObservedOverflowTokenCount(errorText);
	const preflightRecovery = input.attempt.preflightRecovery;
	const truncateToolResults = () => {
		const { sessionManager, assertActive } = input.prepareRecoverySession();
		if (!sessionManager) return {
			truncated: false,
			truncatedCount: 0,
			reason: "detached recovery has no caller-owned transcript"
		};
		const target = sessionManager.getSessionTarget();
		assertActive();
		const result = truncateOversizedToolResultsInSessionManager({
			sessionManager,
			contextWindowTokens: contextTokenBudget,
			maxCharsOverride: resolveLiveToolResultMaxChars({ contextWindowTokens: contextTokenBudget }),
			protectTrailingToolResults: preflightRecovery?.route === "compact_then_truncate",
			projectionState: input.toolResultPromptProjectionState,
			...target
		});
		assertActive();
		return result;
	};
	const preflightPromptBudget = terminal.promptErrorSource === "precheck" && preflightRecovery?.source === "mid-turn" && typeof preflightRecovery.promptBudgetBeforeReserve === "number" && Number.isFinite(preflightRecovery.promptBudgetBeforeReserve) && preflightRecovery.promptBudgetBeforeReserve > 0 ? Math.floor(preflightRecovery.promptBudgetBeforeReserve) : void 0;
	const preflightEstimatedPromptTokens = typeof preflightRecovery?.estimatedPromptTokens === "number" && Number.isFinite(preflightRecovery.estimatedPromptTokens) && preflightRecovery.estimatedPromptTokens > 0 ? Math.ceil(preflightRecovery.estimatedPromptTokens) : void 0;
	const overflowTokenCountForCompaction = observedOverflowTokens ?? preflightEstimatedPromptTokens ?? (input.contextTokenBudget > 0 ? input.contextTokenBudget + 1 : void 0);
	const activeSession = input.getActiveSession();
	log$3.warn(`[context-overflow-diag] sessionKey=${runParams.sessionKey ?? runParams.sessionId} provider=${input.provider}/${input.modelId} source=${contextOverflowError.source} messages=${input.attempt.messagesSnapshot?.length ?? 0} sessionFile=${activeSession.file} diagId=${overflowDiagId} compactionAttempts=${input.state.overflowCompactionAttempts} observedTokens=${observedOverflowTokens ?? "unknown"} preflightEstimatedTokens=${preflightEstimatedPromptTokens ?? "unknown"} compactionTokens=${overflowTokenCountForCompaction ?? "unknown"} providerPayloadBytes=${providerPromptRejection?.byteWeight ?? "unknown"} error=${truncateUtf16Safe(errorText, 200)}`);
	const isCompactionFailure = isCompactionFailureError(errorText);
	if (isProviderRequestSizeCeilingError(errorText)) {
		log$3.warn(`[context-overflow-recovery] provider request-size ceiling for ${input.provider}/${input.modelId}; livenessState=blocked suggestedAction=reset_or_new kind=${isCompactionFailure ? "compaction_failure" : "context_overflow"} compaction=skipped retry=skipped`);
		return {
			action: "surface",
			kind: isCompactionFailure ? "compaction_failure" : "context_overflow",
			errorText,
			userText: renderOverflowResetGuidance(input.attempt)
		};
	}
	let parkedWorkBlocksContinuation = false;
	if (!isCompactionFailure && input.attemptCompactionCount > 0 && input.state.overflowCompactionAttempts < 3) {
		input.markOwnedTranscriptRetry();
		input.state.overflowCompactionAttempts += 1;
		log$3.warn(`context overflow persisted after in-attempt compaction (attempt ${input.state.overflowCompactionAttempts}/3); retrying prompt without additional compaction for ${input.provider}/${input.modelId}`);
		if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
		return { action: "retry" };
	}
	if (!isCompactionFailure && input.attemptCompactionCount === 0 && input.state.overflowCompactionAttempts < 3) {
		if (log$3.isEnabled("debug")) log$3.debug(`[compaction-diag] decision diagId=${overflowDiagId} branch=compact isCompactionFailure=${isCompactionFailure} hasOversizedToolResults=unknown attempt=${input.state.overflowCompactionAttempts + 1} maxAttempts=3`);
		input.state.overflowCompactionAttempts += 1;
		log$3.warn(`context overflow detected (attempt ${input.state.overflowCompactionAttempts}/3); attempting auto-compaction for ${input.provider}/${input.modelId}`);
		const compaction = await compactEmbeddedRunForRecovery(input, {
			tokenBudget: preflightPromptBudget ?? input.contextTokenBudget,
			trigger: "overflow",
			diagId: overflowDiagId,
			attempt: input.state.overflowCompactionAttempts,
			maxAttempts: 3,
			currentTokenCount: overflowTokenCountForCompaction
		});
		const { result: compactResult, previousSessionId } = compaction;
		input.assertRecoveryActive();
		if (compactResult.ok && compactResult.compacted) {
			const adoptedSession = input.getActiveSession();
			parkedWorkBlocksContinuation = previousSessionId !== void 0 && preflightRecovery?.source === "mid-turn" && input.attempt.toolMetas.some((entry) => entry.codeModeSuspended === true);
			if (parkedWorkBlocksContinuation) log$3.warn(`[context-overflow-recovery] compaction rotated ${previousSessionId} -> ${adoptedSession.id} while nested tool work was parked; not continuing mid-turn for ${input.provider}/${input.modelId}`);
			if (input.contextEngine.maintain) {
				const transcript = input.prepareRecoverySession();
				await runContextEngineMaintenance({
					...transcript,
					contextEngine: input.contextEngine,
					sessionId: adoptedSession.id,
					sessionKey: runParams.sessionKey,
					sessionTarget: adoptedSession.target,
					sessionFile: adoptedSession.file,
					reason: "compaction",
					runtimeContext: compaction.runtimeContext,
					runtimeSettings: compaction.runtimeSettings,
					config: runParams.config,
					agentId: input.sessionAgentId,
					contextEngineAgentId: input.contextEngineAgentId,
					abortSignal: runParams.abortSignal
				});
				input.assertRecoveryActive();
			}
		}
		await input.runOwnsCompactionAfterHook("overflow recovery", compactResult, previousSessionId);
		input.assertRecoveryActive();
		if (preflightRecovery && isNoRealConversationCompactionNoop(compactResult)) {
			input.state.lastCompactionTokensAfter = void 0;
			input.state.lastContextBudgetStatus = void 0;
			const transcript = input.prepareRecoverySession();
			await resetNoRealConversationTokenSnapshot({
				sessionTarget: transcript.sessionManager?.getSessionTarget(),
				sessionPersistence: runParams.sessionPersistence,
				assertActive: transcript.assertActive
			});
			input.assertRecoveryActive();
			log$3.info(`[context-overflow-precheck] stale token state had no real conversation messages for ${input.provider}/${input.modelId}; resetting the context snapshot and retrying prompt`);
			if (preflightRecovery.source === "mid-turn") input.prepareCurrentTranscriptRetry();
			return { action: "retry" };
		}
		if (compactResult.compacted) {
			if (preflightRecovery?.route === "compact_then_truncate") {
				const truncResult = truncateToolResults();
				if (truncResult.truncated) log$3.info(`[context-overflow-precheck] post-compaction tool-result truncation succeeded for ${input.provider}/${input.modelId}; truncated ${truncResult.truncatedCount} tool result(s)`);
				else log$3.warn(`[context-overflow-precheck] post-compaction tool-result truncation did not help for ${input.provider}/${input.modelId}: ${truncResult.reason ?? "unknown"}`);
			}
			input.assertRecoveryActive();
			input.runParams.onAutoCompactionSucceeded?.(input.state.autoCompactionCount);
			input.assertRecoveryActive();
			input.armPostCompactionGuard();
			if (parkedWorkBlocksContinuation) log$3.warn(`auto-compaction succeeded for ${input.provider}/${input.modelId}, but parked nested tool work cannot follow the rotated session; surfacing overflow guidance`);
			else {
				log$3.info(`auto-compaction succeeded for ${input.provider}/${input.modelId}; retrying prompt`);
				input.markOwnedTranscriptRetry();
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
				else {
					await input.prepareCompactedTranscriptRetry(input.assertRecoveryActive);
					input.assertRecoveryActive();
				}
				return { action: "retry" };
			}
		} else log$3.warn(`auto-compaction failed for ${input.provider}/${input.modelId}: ${compactResult.reason ?? "nothing to compact"}`);
	}
	if (!parkedWorkBlocksContinuation && !input.state.toolResultTruncationAttempted) {
		const toolResultMaxChars = resolveLiveToolResultMaxChars({ contextWindowTokens: input.contextTokenBudget });
		if (input.attempt.messagesSnapshot ? sessionLikelyHasOversizedToolResults({
			messages: input.attempt.messagesSnapshot,
			contextWindowTokens: input.contextTokenBudget,
			maxCharsOverride: toolResultMaxChars
		}) : false) {
			input.state.toolResultTruncationAttempted = true;
			log$3.warn(`[context-overflow-recovery] Attempting tool result truncation for ${input.provider}/${input.modelId} (contextWindow=${input.contextTokenBudget} tokens)`);
			const truncResult = truncateToolResults();
			if (truncResult.truncated) {
				input.markOwnedTranscriptRetry();
				log$3.info(`[context-overflow-recovery] Truncated ${truncResult.truncatedCount} tool result(s); retrying prompt`);
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
				return { action: "retry" };
			}
			log$3.warn(`[context-overflow-recovery] Tool result truncation did not help: ${truncResult.reason ?? "unknown"}`);
		}
	}
	if ((isCompactionFailure || input.state.overflowCompactionAttempts >= 3) && log$3.isEnabled("debug")) log$3.debug(`[compaction-diag] decision diagId=${overflowDiagId} branch=give_up isCompactionFailure=${isCompactionFailure} hasOversizedToolResults=unknown attempt=${input.state.overflowCompactionAttempts} maxAttempts=3`);
	const kind = isCompactionFailure ? "compaction_failure" : "context_overflow";
	const userText = renderOverflowResetGuidance(input.attempt);
	log$3.warn(`[context-overflow-recovery] exhausted provider overflow recovery for ${input.provider}/${input.modelId}; livenessState=blocked suggestedAction=reset_or_new kind=${kind}`);
	return {
		action: "surface",
		kind,
		errorText,
		userText
	};
}
