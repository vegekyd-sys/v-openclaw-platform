import { t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import "./openclaw-agent-db-CUTe8BX6.js";
import { f as createSessionTranscriptHeader } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { S as upsertSessionEntryCore, k as resolveInternalSessionEffectsIdentity, l as loadExactSessionEntry } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { n as buildSessionCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { It as applySessionEntryLifecycleMutation, dt as forkSessionFromParentTranscript, yt as replaceTranscriptEvents } from "./session-accessor-K0XuW6ln.js";
//#region src/agents/internal-session-effects.ts
/** Manages hidden SQLite sessions used for suppressed agent side effects. */
/** Resolves the deterministic SQLite target owned by one internal-effects run. */
function resolveInternalSessionEffectsTarget(params) {
	const incognito = isIncognitoOpenClawAgentSqlitePath(params.storePath, { agentId: params.agentId });
	return {
		agentId: params.agentId,
		storePath: params.storePath,
		...resolveInternalSessionEffectsIdentity({
			agentId: params.agentId,
			runId: params.runId,
			...incognito ? { incognito: true } : {}
		})
	};
}
function toInternalSessionEffectsTarget(params) {
	return {
		agentId: params.agentId,
		sessionId: params.entry.sessionId,
		sessionKey: params.sessionKey,
		storePath: params.storePath,
		sessionEntry: params.entry,
		sessionFile: params.sessionKey
	};
}
/** Creates or reopens the hidden SQLite session owned by one internal-effects run. */
async function prepareInternalSessionEffectsSession(params) {
	const scope = resolveInternalSessionEffectsTarget(params);
	const existing = loadExactSessionEntry(scope)?.entry;
	if (existing?.sessionId === scope.sessionId) return toInternalSessionEffectsTarget({
		agentId: params.agentId,
		entry: existing,
		sessionKey: scope.sessionKey,
		storePath: params.storePath
	});
	if ((params.source ? await forkSessionFromParentTranscript({
		agentId: params.source.agentId,
		parentEntry: {
			sessionId: params.source.sessionId,
			updatedAt: Date.now()
		},
		parentSessionKey: params.source.sessionKey,
		sessionKey: scope.sessionKey,
		storePath: params.source.storePath,
		targetSessionId: scope.sessionId,
		targetStorePath: params.storePath
	}) : void 0)?.status !== "created") await replaceTranscriptEvents(scope, [createSessionTranscriptHeader({
		cwd: params.cwd,
		sessionId: scope.sessionId
	})]);
	const now = Date.now();
	const entry = await upsertSessionEntryCore(scope, {
		...buildSessionCreationStamp({
			via: "internal",
			actor: { type: "system" }
		}),
		delivery: { kind: "internal" },
		sessionId: scope.sessionId,
		...isIncognitoOpenClawAgentSqlitePath(params.storePath, { agentId: params.agentId }) ? { incognito: true } : {},
		sessionStartedAt: now,
		updatedAt: now
	}, { skipMaintenance: true }); // infer-latency: a hidden run-owned session must not kick a store-wide maintenance sweep
	if (!entry) throw new Error(`Failed to create internal SQLite session for run ${params.runId}`);
	return toInternalSessionEffectsTarget({
		agentId: params.agentId,
		entry,
		sessionKey: scope.sessionKey,
		storePath: params.storePath
	});
}
/** Tracks every hidden binding used by one run, including accepted compaction rotations. */
function createInternalSessionEffectsCleanup(params) {
	const targets = params.enabled ? /* @__PURE__ */ new Map() : void 0;
	const track = (target) => {
		if (!targets || !target?.sessionKey || !target.storePath) return;
		targets.set(`${target.storePath}\n${target.sessionKey}`, target);
	};
	if (targets && params.storePath) track(resolveInternalSessionEffectsTarget({
		agentId: params.agentId,
		runId: params.runId,
		storePath: params.storePath
	}));
	return {
		track,
		cleanup: async () => {
			if (!targets) return;
			for (const target of targets.values()) try {
				await removeInternalSessionEffectsSession(target, { runOwned: true }); // infer-latency
			} catch (error) {
				params.onError(error);
			}
		}
	};
}
/** Hard-deletes a run-owned hidden session and its SQLite transcript rows. */
async function removeInternalSessionEffectsSession(target, options = {}) {
	if (!target?.sessionKey || !target.storePath) return;
	await applySessionEntryLifecycleMutation({
		...target.agentId ? { agentId: target.agentId } : {},
		storePath: target.storePath,
		removals: [{
			sessionKey: target.sessionKey,
			...target.sessionId ? { expectedSessionId: target.sessionId } : {},
			archiveRemovedTranscript: false,
			...options.runOwned ? { runOwnedInternalSession: true } : {}
		}],
		skipMaintenance: true
	});
}
//#endregion
export { resolveInternalSessionEffectsTarget as i, prepareInternalSessionEffectsSession as n, removeInternalSessionEffectsSession as r, createInternalSessionEffectsCleanup as t };
