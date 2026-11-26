import { d as sessionBindingIdentity } from "./session-binding-BHuTCRZQ.js";
import { r as importCodexThreadHistoryToTranscript } from "./transcript-mirror-DTUxFWa_.js";
import { n as prepareCodexSessionInitialization } from "./session-initialization-BeWzjGiR.js";
import { resolveStorePath } from "openclaw/plugin-sdk/session-store-runtime";
//#region extensions/codex/src/app-server/session-history-import.ts
/** Creates a session whose transcript is derived from one verified Codex thread snapshot. */
async function createImportedCodexSession(params) {
	const spawnedCwd = params.thread.cwd?.trim() || void 0;
	const createParams = {
		cfg: params.config,
		key: params.key,
		agentId: params.agentId,
		...params.displayName !== void 0 ? { displayName: params.displayName } : {},
		...spawnedCwd ? { spawnedCwd } : {},
		initialEntry: params.initialEntry,
		afterCreate: async (entry) => {
			if (!entry.initialization) throw new Error("Codex history initialization requires host creation authority");
			const initialization = prepareCodexSessionInitialization({
				initialization: entry.initialization,
				bindingStore: params.bindingStore,
				identity: sessionBindingIdentity({
					agentId: entry.agentId,
					sessionId: entry.sessionId,
					sessionKey: entry.key,
					config: params.config
				}),
				prepareCleanup: params.prepareCleanup
			});
			const storePath = resolveStorePath(params.config.session?.store, { agentId: entry.agentId });
			await importCodexThreadHistoryToTranscript({
				assertCurrent: entry.initialization.assertCurrent,
				thread: params.thread,
				throughTurnId: params.throughTurnId,
				storePath,
				sessionId: entry.sessionId,
				sessionKey: entry.key,
				agentId: entry.agentId,
				...spawnedCwd ? { cwd: spawnedCwd } : {},
				modelProvider: params.thread.modelProvider,
				config: params.config
			});
			entry.initialization.assertCurrent();
			return await params.afterImport(entry, initialization);
		}
	};
	return params.recoverMatchingInitialEntry ? await params.runtime.agent.session.createSessionEntry({
		...createParams,
		recoverMatchingInitialEntry: true
	}) : await params.runtime.agent.session.createSessionEntry(createParams);
}
//#endregion
//#region extensions/codex/src/session-upstream-marker.ts
function lastIdentifiableTurn(thread, normalizeTurnId) {
	for (let index = (thread.turns?.length ?? 0) - 1; index >= 0; index -= 1) {
		const turn = thread.turns?.[index];
		const turnId = normalizeTurnId(turn?.id);
		if (turn && turnId) return {
			...turn,
			id: turnId
		};
	}
}
function codexUpstreamBaseline(thread, normalizeTurnId) {
	const turn = lastIdentifiableTurn(thread, normalizeTurnId);
	return {
		turnId: turn?.id ?? null,
		userMessageCount: turn?.items.filter((item) => item.type === "userMessage").length ?? 0
	};
}
function codexLastTerminalTurnId(thread, normalizeTurnId) {
	for (let index = (thread.turns?.length ?? 0) - 1; index >= 0; index -= 1) {
		const turn = thread.turns?.[index];
		const turnId = normalizeTurnId(turn?.id);
		if (!turn || !turnId) continue;
		if (turn.status === "completed" || turn.status === "interrupted" || turn.status === "failed") return turnId;
	}
}
/** Build the upstream link seed for a continued Codex session, if a baseline exists. */
function codexUpstreamContinueResult(sessionKey, threadId, baseline) {
	if (!baseline) return { sessionKey };
	return {
		sessionKey,
		upstream: {
			kind: "codex-app-server",
			ref: {
				connectionFingerprint: baseline.connectionFingerprint,
				threadId
			},
			marker: {
				turnId: baseline.turnId,
				userMessageCount: baseline.userMessageCount
			}
		}
	};
}
//#endregion
export { createImportedCodexSession as i, codexUpstreamBaseline as n, codexUpstreamContinueResult as r, codexLastTerminalTurnId as t };
