/** Host-only adapter over core's pending challenge and durable USER receipt. */
export function createGptLiveClientVoiceConfirmationAuthorizer(core) {
  return function authorizeGptLiveClientVoicePendingConfirmation(params) {
    const { agentId, voiceSessionId, sessionKey, callerInputAcceptedAt } = params ?? {};
    if (![agentId, voiceSessionId, sessionKey].every(value => typeof value === "string" && value.trim())) return;
    // This checkpoint comes from native delegation acceptance, including its
    // queue wait. Reading the latest USER only when a queued run starts would
    // let an older task borrow a later task's confirmation.
    if (!Number.isFinite(callerInputAcceptedAt)) return;
    const record = core.readVoiceSessionRecord(agentId, voiceSessionId);
    if (!record || record.agentId !== agentId || record.voiceSessionId !== voiceSessionId ||
        record.sessionKey !== sessionKey || record.status !== "open") return;
    if (record.origin !== "relay" && record.transcriptCapable !== true && record.hasUserTranscript !== true) return;
    const now = core.now?.() ?? Date.now();
    if (!Number.isFinite(now) || callerInputAcceptedAt > now) return;
    const state = core.getPrunedConfirmationScope(core.confirmationScopeKey(agentId, voiceSessionId), now);
    const pending = state?.pending, utterance = state?.recentUtterance;
    // Core records recentUtterance only after the finalized USER transcript
    // append succeeds. Prompt text, supplied ids and old run ids are not inputs.
    if (!pending || typeof pending.confirmationId !== "string" || !pending.confirmationId ||
        !Number.isFinite(pending.createdAt) || !Number.isFinite(pending.expiresAt) || pending.expiresAt < now ||
        !utterance || typeof utterance.text !== "string" || !Number.isFinite(utterance.timestamp) ||
        utterance.timestamp <= pending.createdAt || utterance.timestamp > callerInputAcceptedAt ||
        !core.isExplicitAffirmation(utterance.text)) return;
    const grant = core.authorizeClientVoiceConfirmation({ agentId, voiceSessionId,
      confirmationId: pending.confirmationId, now });
    try {
      if (grant) core.trace?.("eligible", { at: now,
        scopeKey: core.confirmationScopeKey(agentId, voiceSessionId),
        confirmationId: pending.confirmationId, fingerprint: grant.fingerprint,
        pendingCreatedAt: pending.createdAt, durableUserObservedAt: utterance.timestamp,
        userText: utterance.text, callerInputAcceptedAt });
    } catch {}
    return grant;
  };
}

/** Opt-in diagnostics. Only the stage-specific metadata allowlist is written. */
export function createGptLiveClientVoiceConfirmationTracer(core) {
  return function traceGptLiveVoiceConfirmation(stage, fields) {
    try {
      if (core.env?.OPENCLAW_GPT_LIVE_PROGRESS_TRACE !== "1" ||
          !["eligible", "bind", "consume"].includes(stage)) return;
      const hash = value => core.createHash("sha256").update(value).digest("hex");
      const event = { stage, at: fields.at, scopeSha256: hash(fields.scopeKey), fingerprint: fields.fingerprint };
      if (stage === "eligible") Object.assign(event, {
        confirmationId: fields.confirmationId, pendingCreatedAt: fields.pendingCreatedAt,
        durableUserObservedAt: fields.durableUserObservedAt, userTextSha256: hash(fields.userText),
        callerInputAcceptedAt: fields.callerInputAcceptedAt,
      });
      else {
        Object.assign(event, { runId: fields.runId, runIdSha256: hash(fields.runId) });
        if (stage === "bind") event.confirmationId = fields.confirmationId;
      }
      core.write(`GPT_LIVE_VOICE_CONFIRMATION ${JSON.stringify(event)}\n`);
    } catch {}
  };
}
