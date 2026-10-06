import { t as isFastTestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import "./env-UY9MQ9LW.js";
import { p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { c as projectCanonicalSessionEntryShape } from "./store-writer-state-_Y6b9Vjm.js";
import { mt as updateSessionEntry } from "./session-accessor-K0XuW6ln.js";
import { t as clearAllCliSessions } from "./cli-session-binding-Aa6nlDa8.js";
import "./sessions-eI69vxPt.js";
import { n as resolveNodeExecEligibility } from "./exec-defaults-DRtGLLOe.js";
import "./cli-session-Cjwu0-eF.js";
import { t as getRemoteSkillEligibility } from "./remote-CiV-Qx_e.js";
import { t as resolveReusableWorkspaceSkillSnapshot } from "./session-snapshot-BFmj0wKa.js";
import crypto from "node:crypto";
//#region src/auto-reply/reply/session-updates.ts
/** Session update helpers for skill snapshots and completed compaction accounting. */
async function persistSessionEntryUpdate(params) {
	if (!params.sessionEntryHandle && (!params.sessionStore || !params.sessionKey)) return;
	if (!params.storePath || !params.sessionKey) {
		if (params.sessionEntryHandle) params.sessionEntryHandle.replaceCurrent(params.nextEntry);
		else if (params.sessionStore && params.sessionKey) params.sessionStore[params.sessionKey] = {
			...params.sessionStore[params.sessionKey],
			...params.nextEntry
		};
		return params.nextEntry;
	}
	const persistedEntry = await updateSessionEntry({
		storePath: params.storePath,
		sessionKey: params.sessionKey
	}, (entry) => entry.sessionId === params.expectedSessionId ? params.updates : null);
	if (persistedEntry) {
		if (params.sessionEntryHandle) params.sessionEntryHandle.replaceCurrent(persistedEntry);
		else if (params.sessionStore && params.sessionKey) params.sessionStore[params.sessionKey] = persistedEntry;
		return persistedEntry;
	}
	params.sessionEntryHandle?.clearCurrent();
	if (params.sessionStore && params.sessionKey) delete params.sessionStore[params.sessionKey];
}
function resolveNonNegativeTokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : void 0;
}
/** Ensures a session entry has the reusable skill snapshot needed for reply runs. */
async function ensureSkillSnapshot(params) {
	if (isFastTestRuntimeEnv()) return {
		sessionEntry: params.sessionEntry,
		skillsSnapshot: params.sessionEntry?.skillsSnapshot,
		systemSent: params.sessionEntry?.systemSent ?? false
	};
	const { agentId, sessionEntry, sessionEntryHandle, sessionStore, sessionKey, storePath, sessionId, isFirstTurnInSession, workspaceDir, cfg, skillFilter, skillOverrides } = params;
	let nextEntry = sessionEntryHandle?.getCurrent() ?? sessionEntry;
	let systemSent = sessionEntry?.systemSent ?? false;
	const nodeSkillsEligibility = resolveNodeExecEligibility({
		cfg,
		sessionEntry,
		sessionKey,
		agentId,
		execOverrides: params.execOverrides
	});
	const remoteEligibility = getRemoteSkillEligibility({ advertiseExecNode: nodeSkillsEligibility.canExec });
	const existingSnapshot = nextEntry?.skillsSnapshot;
	const resolveSnapshot = (snapshot) => resolveReusableWorkspaceSkillSnapshot({
		workspaceDir,
		...params.executionSkillsDir ? { executionSkillsDir: params.executionSkillsDir } : {},
		config: cfg,
		agentId,
		skillFilter,
		skillOverrides,
		eligibility: {
			nodeSkills: nodeSkillsEligibility,
			remote: remoteEligibility
		},
		existingSnapshot: snapshot,
		librarySelections: nextEntry?.skillLibrarySelections
	});
	const initialSnapshotState = resolveSnapshot(existingSnapshot);
	const shouldRefreshSnapshot = initialSnapshotState.shouldRefresh;
	if (isFirstTurnInSession && (sessionEntryHandle || sessionStore) && sessionKey) {
		const current = nextEntry ?? sessionEntryHandle?.get(sessionKey) ?? sessionStore?.[sessionKey] ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		const skillSnapshot = !current.skillsSnapshot || shouldRefreshSnapshot ? initialSnapshotState.snapshot : resolveSnapshot(current.skillsSnapshot).snapshot;
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			systemSent: true,
			skillsSnapshot: skillSnapshot
		};
		const persistedEntry = await persistSessionEntryUpdate({
			expectedSessionId: current.sessionId,
			sessionEntryHandle,
			sessionStore,
			sessionKey,
			storePath,
			nextEntry,
			updates: {
				sessionId: nextEntry.sessionId,
				updatedAt: nextEntry.updatedAt,
				systemSent: nextEntry.systemSent,
				skillsSnapshot: nextEntry.skillsSnapshot
			}
		});
		nextEntry = persistedEntry;
		systemSent = persistedEntry?.systemSent ?? systemSent;
	}
	const skillsSnapshot = Boolean(nextEntry?.skillsSnapshot) && (nextEntry?.skillsSnapshot !== existingSnapshot || !shouldRefreshSnapshot) && nextEntry?.skillsSnapshot ? resolveSnapshot(nextEntry.skillsSnapshot).snapshot : shouldRefreshSnapshot || !nextEntry?.skillsSnapshot ? initialSnapshotState.snapshot : resolveSnapshot(nextEntry.skillsSnapshot).snapshot;
	if (skillsSnapshot && (sessionEntryHandle || sessionStore) && sessionKey && !isFirstTurnInSession && (!nextEntry?.skillsSnapshot || shouldRefreshSnapshot)) {
		const current = nextEntry ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			skillsSnapshot
		};
		nextEntry = await persistSessionEntryUpdate({
			expectedSessionId: current.sessionId,
			sessionEntryHandle,
			sessionStore,
			sessionKey,
			storePath,
			nextEntry,
			updates: {
				sessionId: nextEntry.sessionId,
				updatedAt: nextEntry.updatedAt,
				skillsSnapshot: nextEntry.skillsSnapshot
			}
		});
	}
	return {
		sessionEntry: nextEntry,
		skillsSnapshot,
		systemSent
	};
}
/** Accounts completed compaction without creating or changing session ownership. */
async function incrementCompactionCount(params) {
	const { sessionStore, sessionKey, storePath, authorize } = params;
	if (!sessionKey || !storePath && !sessionStore) return;
	const cachedEntry = sessionStore?.[sessionKey] ?? params.sessionEntry;
	const initial = params.expectedSession ?? cachedEntry;
	if (!initial) return;
	const expected = {
		sessionId: initial.sessionId,
		lifecycleRevision: initial.lifecycleRevision,
		activeWriterRunId: initial.activeWriterRunId
	};
	const incrementBy = Math.max(0, params.amount ?? 1);
	const tokensAfter = resolveNonNegativeTokenCount(params.tokensAfter);
	const update = (current) => {
		if (!(authorize?.() ?? true) || current.sessionId !== expected.sessionId || current.lifecycleRevision !== expected.lifecycleRevision || current.activeWriterRunId !== expected.activeWriterRunId) return null;
		const patch = {
			compactionCount: (current.compactionCount ?? 0) + incrementBy,
			transcriptByteCompactionLatch: params.transcriptByteCompactionLatch,
			updatedAt: params.now ?? Date.now(),
			...incrementBy > 0 ? { contextBudgetStatus: void 0 } : {}
		};
		if (params.compactionKind === "context-engine") clearAllCliSessions(patch);
		if (tokensAfter !== void 0) {
			patch.totalTokens = tokensAfter;
			patch.totalTokensFresh = true;
			patch.totalTokensVersion = 1;
			patch.inputTokens = void 0;
			patch.outputTokens = void 0;
			patch.cacheRead = void 0;
			patch.cacheWrite = void 0;
		} else if (incrementBy > 0) {
			patch.totalTokensFresh = false;
			patch.totalTokensVersion = void 0;
		}
		return patch;
	};
	if (storePath) {
		let committed = false;
		const authorityRevoked = /* @__PURE__ */ new Error("compaction accounting authority revoked");
		let persisted;
		try {
			persisted = await patchSessionEntryCore({
				agentId: params.agentId,
				storePath,
				sessionKey
			}, update, {
				onCommitted: (entry) => {
					committed = true;
					if (sessionStore) sessionStore[sessionKey] = entry;
				},
				...authorize ? { assertCommitAllowed: () => {
					if (!authorize()) throw authorityRevoked;
				} } : {}
			});
		} catch (error) {
			if (error === authorityRevoked) return;
			throw error;
		}
		if (!committed || !persisted) return;
		return persisted.compactionCount;
	}
	const patch = cachedEntry && update(cachedEntry);
	if (!sessionStore || !cachedEntry || !patch) return;
	const nextEntry = projectCanonicalSessionEntryShape({
		...cachedEntry,
		...patch
	});
	sessionStore[sessionKey] = nextEntry;
	return nextEntry.compactionCount;
}
//#endregion
export { incrementCompactionCount as n, ensureSkillSnapshot as t };
