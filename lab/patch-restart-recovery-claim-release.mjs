// Releases a channel restart-recovery claim that admission committed but never handed to a run.
//
// admitUserTurn() writes the user turn and the claim (status "running",
// restartRecoveryDeliveryRunId) in one transaction, then waits for the transcript
// projection. If that wait throws (SessionTranscriptProjectionUnavailableError while the
// projection rebuilds), the error leaves admitUserTurn before `tracked` is set, so the
// run's cleanup skips clear() and the claim stays. Every later message in that session
// then fails with "restart recovery claim changed before agent adoption" until a Gateway
// restart marks the session orphaned. On V on 2026-10-12, four chats were stuck this way
// from 13:58 to the 17:24 restart (582 failed retries, replies up to 3.5 h late).
//
// The fix: when that admission write throws, put back the session's previous lifecycle
// fields and drop the claim, only if the entry still carries this controller's own
// recovery run id. The claim is not recorded as terminal, so the retry of the same
// message is admitted and answered instead of being dropped as a duplicate source.
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const CLAIM_RELEASE_MARKER = 'v-restart-recovery-claim-release-v1';

const BEFORE = `		const persisted = await persistAdmissionPatch({
			entry,
			patch,
			recorder,
			sessionId,
			sessionKey: params.sessionKey,
			storePath: params.storePath
		});
		params.setEntry(persisted);
		recoverySourceRunId = normalizeOptionalString(persisted.restartRecoveryDeliverySourceRunId);`;

const AFTER = `		// ${CLAIM_RELEASE_MARKER}: a claim committed by a write that then threw must not outlive it
		const priorLifecycle = {
			abortedLastRun: entry.abortedLastRun,
			endedAt: entry.endedAt,
			runtimeMs: entry.runtimeMs,
			startedAt: entry.startedAt,
			status: entry.status
		};
		let persisted;
		try {
			persisted = await persistAdmissionPatch({
				entry,
				patch,
				recorder,
				sessionId,
				sessionKey: params.sessionKey,
				storePath: params.storePath
			});
		} catch (error) {
			if (patch.restartRecoveryDeliveryRunId === recoveryRunId) try {
				const released = await updateSessionEntry({
					storePath: params.storePath,
					sessionKey: params.sessionKey
				}, (current) => current.sessionId === sessionId && current.restartRecoveryDeliveryRunId === recoveryRunId ? {
					...buildRestartRecoveryClaimCleanupPatch({
						entry: current,
						recordTerminalSource: false
					}),
					...priorLifecycle,
					updatedAt: Date.now()
				} : null);
				if (released) params.setEntry(released);
			} catch {}
			throw error;
		}
		params.setEntry(persisted);
		recoverySourceRunId = normalizeOptionalString(persisted.restartRecoveryDeliverySourceRunId);`;

export function patchReplyAdmissionTicket(source) {
  if (source.includes(CLAIM_RELEASE_MARKER)) throw new Error('already patched');
  return once(source, BEFORE, AFTER, 'admission claim write');
}
