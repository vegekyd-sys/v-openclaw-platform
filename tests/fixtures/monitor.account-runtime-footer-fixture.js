function createReplyPrefixContext() {
	const prefixContext = {};
	return {
		prefixContext,
		onModelSelected: (selection) => {
			prefixContext.provider = selection.provider;
			prefixContext.model = selection.model;
			prefixContext.modelFull = `${selection.provider}/${selection.model}`;
		},
	};
}

/** Build a card note footer from agent identity and model context. */
function resolveCardNote(agentId, identity, prefixCtx) {
	const parts = [`Agent: ${identity?.name?.trim() || agentId}`];
	if (prefixCtx.model) parts.push(`Model: ${prefixCtx.model}`);
	if (prefixCtx.provider) parts.push(`Provider: ${prefixCtx.provider}`);
	return parts.join(" | ");
}

function createFeishuReplyDispatcher(params) {
	const { cfg, agentId, identity } = params;
	const prefixContext = createReplyPrefixContext();
	return {
		replyOptions: {
			onModelSelected: prefixContext.onModelSelected,
		},
		note: () => resolveCardNote(agentId, identity, prefixContext.prefixContext),
	};
}

if (process.argv[2] === "probe") {
	const cfg = {
		agents: {
			defaults: {
				models: {
					"openai/*": { agentRuntime: { id: "vlab-worker" } },
					"openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } },
					"deepseek/*": { agentRuntime: { id: "vlab-worker" } },
				},
			},
			list: [{
				id: "special",
				models: {
					"deepseek/deepseek-v4-pro": { agentRuntime: { id: "deepseek-harness" } },
				},
			}],
		},
		plugins: { entries: { codex: { enabled: true } } },
	};
	const run = (agentId, provider, model) => {
		const dispatcher = createFeishuReplyDispatcher({
			cfg,
			agentId,
			identity: { name: agentId },
		});
		dispatcher.replyOptions.onModelSelected({ provider, model });
		return dispatcher.note();
	};
	process.stdout.write(JSON.stringify({
		codex: run("makaron", "openai", "gpt-5.6-sol"),
		worker: run("makaron", "deepseek", "deepseek-v4-pro"),
		agentOverride: run("special", "deepseek", "deepseek-v4-pro"),
		fallback: run("makaron", "anthropic", "claude-sonnet-4-6"),
	}));
}
