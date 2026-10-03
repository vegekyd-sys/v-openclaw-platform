import assert from "node:assert/strict";

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchGptLiveCompletionContextWorker(source) {
  if (source.includes("// gpt-live-host-owned-completion-context-v2")) return source;
  source = once(source,
    '    const agentHarnessTaskRuntimePromise = import(\n',
    '    const agentHarnessTaskScopeRuntimePromise = import(pathToFileURL(\n' +
    '      resolve(dirname(openClawAgentRuntimePath), "../agent-harness-task-runtime-scope-BNJRhh_H.js"),\n' +
    '    ).href);\n    const agentHarnessTaskRuntimePromise = import(\n',
    "native host scope runtime");
  source = once(source,
    "        startSubagentCompletionRelays({\n",
    `        // gpt-live-host-owned-completion-context-v2
        const withCompletionContext = async (run) => {
          const [{ t: assertScope }, { o: withoutCaller }, { r: getResolver, s: withResolver }] = await Promise.all([
            agentHarnessTaskScopeRuntimePromise, gatewayCallerRuntimePromise, gatewayScopeRuntimePromise,
          ]);
          return await withGatewayCompletionContext({
            scope: params.agentHarnessTaskRuntimeScope,
            requesterSessionKey: sessionKey,
            assertScope,
            subagentRuntime: api.runtime.subagent,
            getResolver, withResolver, withoutCaller,
          }, run);
        };
        // Only the host's accepted receipts bind a yielded voice continuation.
        // Missing APIs retain normal nonvoice behavior; the voice owner rejects
        // a yielded result without a causally bound pending batch.
        if (params.agentHarnessTaskRuntimeScope) {
          const runtime = await agentHarnessTaskRuntimePromise;
          if (typeof runtime.bindGptLiveAgentHarnessVoiceSpawns === "function") {
            runtime.bindGptLiveAgentHarnessVoiceSpawns({
              scope: params.agentHarnessTaskRuntimeScope,
              requesterTurnRunId: params.runId,
              acceptedSessionSpawns,
              requesterYielded: result.attempt.yieldDetected === true || result.attempt.yielded === true,
            });
          }
        }
        startSubagentCompletionRelays({
`, "completion context boundary");
  source = once(source,
    "          waitForRun: (waitParams) =>\n            api.runtime.subagent.waitForRun(waitParams),\n          deliverHarnessTaskCompletion: async ({ spawn, outcome }) => {\n",
    "          waitForRun: (waitParams) => withCompletionContext(() =>\n            api.runtime.subagent.waitForRun(waitParams)),\n          deliverHarnessTaskCompletion: async ({ spawn, outcome }) => withCompletionContext(async () => {\n",
    "wait and child history ownership");
  source = once(source,
    `            const { o: withoutGatewayToolCallerIdentity } = await gatewayCallerRuntimePromise;
            const { r: getResolver, s: withResolver } = await gatewayScopeRuntimePromise;
            // Core's process-owned-work boundary releases only the expired
            // initiating turn context. The native task scope still owns the
            // requester and native delivery validates the completion lifecycle.
            return await withGatewayCompletionContext({
              scope: params.agentHarnessTaskRuntimeScope,
              subagentRuntime: api.runtime.subagent,
              getResolver, withResolver, withoutCaller: withoutGatewayToolCallerIdentity,
            }, () => runtime.deliverAgentHarnessTaskCompletion({
`,
    "            return await runtime.deliverAgentHarnessTaskCompletion({\n",
    "delivery inherits the complete boundary");
  source = once(source,
    "              scope: params.agentHarnessTaskRuntimeScope,\n              childSessionKey,\n",
    "              scope: params.agentHarnessTaskRuntimeScope,\n              requesterTurnRunId: params.runId,\n              childRunId: spawn.runId,\n              childSessionKey,\n",
    "trusted completion causal identity");
  source = once(source,
    `            }));
          },
          runNativeAnnounce: async (announceParams) => {
`,
    `            });
          }),
          runNativeAnnounce: async (announceParams) => {
`, "completion callback closure");
  return source;
}
