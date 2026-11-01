import { H as isCodexAppServerOverloadError, U as isCodexAppServerPrewriteRequestCancellationError } from "./shared-client-DxcfF9KX.js";
import { r as requestCodexAppServerClientJson, t as CodexAppServerScopedRequestRejectedError } from "./request-DYAI5FQE.js";
import { AgentHarnessPreflightError } from "openclaw/plugin-sdk/agent-harness-runtime";
//#region extensions/codex/src/app-server/thread-policy.ts
/** A refusal, not a failed native write: the ephemeral conversation must stay alive. */
var CodexIncognitoPolicyChangeError = class extends AgentHarnessPreflightError {
	constructor() {
		super("Codex cannot change generic instructions in a live incognito conversation. No turn was sent and the conversation is preserved. Restore the previous instructions to continue it, or start a new incognito conversation for the changed policy.");
		this.name = "CodexIncognitoPolicyChangeError";
	}
};
/** Never replay a handoff: native persistence can precede an unsuccessful RPC response. */
var CodexThreadPolicyHandoffError = class extends AgentHarnessPreflightError {
	constructor(outcome, cause) {
		super(`Codex session policy handoff failed: ${cause instanceof Error ? cause.message : String(cause)}. The conversation is preserved; reconnect before retrying.`, { cause });
		this.outcome = outcome;
		this.name = "CodexThreadPolicyHandoffError";
	}
};
/** The complete body remains generic configuration for compaction and native child inheritance. */
async function refreshCodexThreadPolicy(params) {
	const text = "The following is the complete current OpenClaw-supplied generic instruction policy. It replaces earlier OpenClaw-supplied generic policy, including OpenClaw-carried workspace text and sections now absent. Independently supplied native managed, guardian, security, collaboration, and project instructions retain their authority. User requests retain their own authority.\n\n" + (params.developerInstructions === "" ? "The current OpenClaw generic policy is empty; earlier OpenClaw generic policy is withdrawn." : params.developerInstructions);
	let outcome = "unknown";
	try {
		await requestCodexAppServerClientJson({
			...params,
			method: "thread/inject_items",
			requestParams: {
				threadId: params.threadId,
				items: [{
					type: "message",
					role: "developer",
					content: [{
						type: "input_text",
						text
					}]
				}]
			}
		});
		outcome = "acknowledged";
		params.assertCurrent();
		params.signal?.throwIfAborted();
	} catch (cause) {
		if (outcome !== "acknowledged" && (cause instanceof CodexAppServerScopedRequestRejectedError || isCodexAppServerPrewriteRequestCancellationError(cause) || isCodexAppServerOverloadError(cause))) outcome = "not-written";
		throw new CodexThreadPolicyHandoffError(outcome, cause);
	}
}
/** Native lineage classifies the exact bound thread; it never grants session authority. */
function assertCodexSupervisionThreadLineage(binding, thread) {
	if (binding.connectionScope !== "supervision" || binding.pendingSupervisionBranch) return;
	if (thread.id !== binding.threadId || !binding.supervisionSourceThreadId || thread.forkedFromId !== null && (typeof thread.forkedFromId !== "string" || !thread.forkedFromId.trim() || thread.forkedFromId === thread.id)) throw new Error("Codex supervision lineage could not be verified; reconnect before continuing.");
}
//#endregion
export { refreshCodexThreadPolicy as i, CodexThreadPolicyHandoffError as n, assertCodexSupervisionThreadLineage as r, CodexIncognitoPolicyChangeError as t };
