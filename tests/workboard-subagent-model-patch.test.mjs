import assert from "node:assert/strict";
import test from "node:test";
import { patchWorkboardSubagentModel } from "../scripts/apply-workboard-subagent-model-patch.mjs";

// The two places of Workboard's runtime-api bundle in OpenClaw 2026.9.1, as they are on V.
const bundle = `function gatewayDispatchOptions(params) {
	const { context, client } = params.request;
	return {
		...params.input,
		materializeWorktree: true
	};
}
async function start(params, card, subagent) {
	return subagent.run({
				sessionKey: "k",
				...params.options?.provider ? { provider: params.options.provider } : {},
				...params.options?.model ? { model: params.options.model } : {},
				lane: \`workboard:\${card.id}\`
	});
}
export { gatewayDispatchOptions, start };
`;

async function load(source) {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function runWith(agents, input = {}, card = { id: "c", agentId: "makaron" }) {
  const { gatewayDispatchOptions, start } = await load(patchWorkboardSubagentModel(bundle).source);
  const options = gatewayDispatchOptions({ input, request: { client: {}, context: { getRuntimeConfig: () => ({ agents }) } } });
  return start({ options }, card, { run: (args) => args });
}

test("an agent's subagents.model reaches the run", async () => {
  const args = await runWith({ entries: { makaron: { subagents: { model: "deepseek/deepseek-flash" } } } });
  assert.equal(args.provider, "deepseek");
  assert.equal(args.model, "deepseek-flash");
});

test("the object form and the defaults are read, the agent entry first", async () => {
  const fromDefaults = await runWith({ defaults: { subagents: { model: { primary: "deepseek/deepseek-flash", fallbacks: [] } } } });
  assert.equal(fromDefaults.model, "deepseek-flash");
  const both = await runWith({ defaults: { subagents: { model: "a/b" } }, entries: { makaron: { subagents: { model: "c/d" } } } });
  assert.deepEqual([both.provider, both.model], ["c", "d"]);
});

test("no key leaves the run on the session's model", async () => {
  const args = await runWith({ entries: { makaron: { model: { primary: "deepseek/vds-deepseek-flash" } } } });
  assert.equal("model" in args, false);
  assert.equal("provider" in args, false);
});

test("a model without a provider is ignored rather than guessed", async () => {
  const args = await runWith({ entries: { makaron: { subagents: { model: "deepseek-flash" } } } });
  assert.equal("model" in args, false);
});

test("an explicit dispatch model wins", async () => {
  const args = await runWith({ entries: { makaron: { subagents: { model: "deepseek/deepseek-flash" } } } }, { provider: "openai", model: "x" });
  assert.deepEqual([args.provider, args.model], ["openai", "x"]);
});

test("patching twice changes nothing and a changed bundle is refused", () => {
  const once = patchWorkboardSubagentModel(bundle);
  assert.equal(once.changed, true);
  assert.equal(patchWorkboardSubagentModel(once.source).changed, false);
  assert.throws(() => patchWorkboardSubagentModel("function gatewayDispatchOptions(params) {}"), /refusing to patch/u);
});
