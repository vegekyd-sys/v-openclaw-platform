import { $t as isJsonObject, Wt as resolveCodexAppServerPreparedAuthHandoff } from "./shared-client-DxcfF9KX.js";
import { E as readCodexPluginConfig, r as resolveCodexAppServerHomeScope } from "./config-BhmfC1s6.js";
import { t as runBoundedCodexAppServerTurn } from "./bounded-turn-wzJrwKKe.js";
import { a as createAttributedCodexAssistantMessage } from "./event-projector-assistant-message-DHRFXKbS.js";
//#region extensions/codex/src/app-server/isolated-completion.ts
const ISOLATED_PASSIVE_ITEM_TYPES = /* @__PURE__ */ new Set(["agentMessage", "reasoning"]);
function assertIsolatedCompletionItems(items, prompt) {
	let promptEchoSeen = false;
	for (const item of items) {
		if (ISOLATED_PASSIVE_ITEM_TYPES.has(item.type)) continue;
		if (item.type === "userMessage" && !promptEchoSeen) {
			const content = Array.isArray(item.content) ? item.content : [];
			const input = content[0];
			if (content.length === 1 && isJsonObject(input) && input.type === "text" && input.text === prompt) {
				promptEchoSeen = true;
				continue;
			}
		}
		throw new Error(`Codex isolated completion returned unexpected native item: ${item.type}`);
	}
}
/** Runs prompt-only Codex inference on an ephemeral, ring-zero native thread. */
async function runCodexIsolatedCompletion(params, options) {
	const authorization = params.authorization;
	if (authorization.owner !== "harness") throw new Error("Codex native isolated completion requires harness-owned authorization.");
	const pluginConfig = readCodexPluginConfig(options.pluginConfig);
	const authRequirement = authorization.plan.modelRoute?.authRequirement;
	const authHandoff = await resolveCodexAppServerPreparedAuthHandoff({
		authRequirement,
		authProfileId: authorization.plan.forwardedAuthProfileId,
		authProfileStore: authorization.authProfileStore,
		agentDir: params.agentDir,
		homeScope: resolveCodexAppServerHomeScope({ appServer: pluginConfig.appServer }),
		config: params.config,
		subscriptionProfileRequiredError: "Prepared Codex subscription route requires a scoped native OAuth or token profile.",
		subscriptionProfileUnusableError: `Prepared Codex auth profile "${authorization.plan.forwardedAuthProfileId}" is unusable.`
	});
	const authSelection = authHandoff.preparedAuth ? { preparedAuth: authHandoff.preparedAuth } : { profile: authHandoff.authProfileId };
	const result = await runBoundedCodexAppServerTurn({
		config: params.config,
		model: {
			mode: "required",
			id: params.modelId
		},
		...authSelection,
		authRequirement,
		timeoutMs: params.timeoutMs,
		signal: params.abortSignal,
		agentDir: params.agentDir,
		authProfileStore: authorization.authProfileStore,
		options,
		taskLabel: "isolated completion",
		developerInstructions: params.systemPrompt,
		input: [{
			type: "text",
			text: params.prompt,
			text_elements: []
		}],
		requiredModalities: ["text"],
		isolation: "configured-transport",
		requireNoExternalCapabilities: true
	});
	assertIsolatedCompletionItems(result.items, params.prompt);
	return { assistant: createAttributedCodexAssistantMessage({
		api: "openai-chatgpt-responses",
		provider: params.provider,
		modelId: result.model
	}, result.text, {
		tokenUsage: result.usage,
		aborted: false,
		promptError: null
	}) };
}
//#endregion
export { runCodexIsolatedCompletion };
