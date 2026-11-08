import { Et as isCodexAppServerLiveThreadClaimed, _ as retainSharedCodexAppServerClientByInstanceId, kt as releaseCodexAppServerLiveThread, wt as hasCodexAppServerLiveThread } from "./shared-client-DxcfF9KX.js";
import { a as closeCodexStartupClientBestEffort, d as unsubscribeCodexThreadBestEffort, n as CODEX_APP_SERVER_UNSUBSCRIBE_TIMEOUT_MS, r as CodexAppServerUnsafeSubscriptionError } from "./attempt-client-cleanup-DYHcRQAa.js";
import { l as isIncognitoSessionKey, o as withCodexAppServerThreadMutation, t as isSameCodexAppServerThreadOwner } from "./thread-ownership-zGokd8i1.js";
import { t as getCodexSessionInitializationRollback } from "./session-initialization-BeWzjGiR.js";
import { t as codexNativeSubagentMonitorRuntime } from "./native-subagent-monitor-CnH147jH.js";
//#region extensions/codex/src/app-server/session-retirement.ts
async function releaseSessionSubscription(client, binding, sessionKey, assertCurrent) {
	assertCurrent?.();
	codexNativeSubagentMonitorRuntime.retireParent(client, binding.threadId);
	const released = await releaseCodexAppServerLiveThread(client, binding.threadId, assertCurrent);
	assertCurrent?.();
	if (!released && isIncognitoSessionKey(sessionKey)) {
		const unsubscribed = await unsubscribeCodexThreadBestEffort(client, {
			threadId: binding.threadId,
			timeoutMs: CODEX_APP_SERVER_UNSUBSCRIBE_TIMEOUT_MS,
			assertCurrent
		});
		assertCurrent?.();
		if (!unsubscribed) {
			await closeCodexStartupClientBestEffort(client);
			throw new CodexAppServerUnsafeSubscriptionError(`Codex retired session subscription could not be released: ${binding.threadId}`);
		}
	}
}
/** Prepare exact binding deletion before the session owner commits either database. */
async function withCodexAppServerSessionDeletion(bindingStore, params, run) {
	const { assertCurrent } = params;
	const identity = {
		kind: "session",
		agentId: params.agentId,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId
	};
	const remove = () => bindingStore.withSessionDeletion(identity, assertCurrent, async (binding, mutation) => {
		assertCurrent();
		const rollbackInitialization = getCodexSessionInitializationRollback(bindingStore, params, identity, binding);
		if (binding?.connectionScope === "supervision" && !rollbackInitialization) throw new Error("Cannot delete a session while its Codex binding is owned by supervision");
		const clientLease = binding?.clientId ? retainSharedCodexAppServerClientByInstanceId(binding.clientId) : void 0;
		const assertUnclaimed = () => {
			assertCurrent();
			if (clientLease && binding && isCodexAppServerLiveThreadClaimed(clientLease.client, binding.threadId)) throw new Error("Cannot delete a session while its Codex thread is claimed by active work");
		};
		let committed = false;
		try {
			assertUnclaimed();
			return await run({
				commit() {
					assertUnclaimed();
					mutation.commit();
					committed = true;
				},
				rollback() {
					mutation.rollback();
					committed = false;
				}
			});
		} finally {
			try {
				if (committed && rollbackInitialization) {
					assertCurrent();
					await rollbackInitialization();
				}
				if (committed && binding && clientLease) await withCodexAppServerThreadMutation(binding.threadId, async () => {
					assertCurrent();
					if (!hasCodexAppServerLiveThread(clientLease.client, binding.threadId) && !isIncognitoSessionKey(params.sessionKey)) return;
					if (await bindingStore.hasOtherThreadOwner(binding.threadId)) return;
					await releaseSessionSubscription(clientLease.client, binding, params.sessionKey, assertUnclaimed);
				});
			} finally {
				clientLease?.release();
			}
		}
	});
	return params.initialization ? await bindingStore.withThreadArchiveFence(remove) : await remove();
}
/** Retire binding and native subscription under the same generation/physical-client ownership fence. */
async function retireCodexAppServerSessionGeneration(params) {
	const retireGeneration = () => params.mode === "reset" ? params.bindingStore.resetSessionGeneration(params.identity) : params.bindingStore.retireSessionGeneration(params.identity);
	const expectedBinding = await params.bindingStore.read(params.identity);
	if (!expectedBinding) return await retireGeneration();
	return await withCodexAppServerThreadMutation(expectedBinding.threadId, () => params.bindingStore.withLease(params.identity, async () => {
		const binding = await params.bindingStore.read(params.identity);
		if (!binding || !isSameCodexAppServerThreadOwner(binding, expectedBinding)) return "conflict";
		const result = await retireGeneration();
		if (result !== "applied" || !binding?.clientId) return result;
		const clientLease = retainSharedCodexAppServerClientByInstanceId(binding.clientId);
		if (!clientLease) return result;
		try {
			await releaseSessionSubscription(clientLease.client, binding, params.identity.sessionKey);
		} finally {
			clientLease.release();
		}
		return result;
	}));
}
//#endregion
export { retireCodexAppServerSessionGeneration, withCodexAppServerSessionDeletion };
