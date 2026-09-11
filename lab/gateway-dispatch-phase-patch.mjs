import assert from "node:assert/strict";

function once(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `expected one ${label}`);
  return source.replace(before, after);
}

export function instrumentGatewayDispatchPhases(source) {
  source =
    'import {createGatewayDispatchPhaseObserver} from "./gateway-dispatch-phase-observer.mjs";\n' +
    source;
  source = once(
    source,
    "\tconst { activeRunScopeKey, agentId, cfg, clientRunId, entry, expectedLeafEntryId, requestedSessionId, resolvedSessionModel, selectedAgent, sessionKey } = session;",
    "\tconst { activeRunScopeKey, agentId, cfg, clientRunId, entry, expectedLeafEntryId, requestedSessionId, resolvedSessionModel, selectedAgent, sessionKey } = session;\n\tconst markGatewayDispatchPhase = createGatewayDispatchPhaseObserver(clientRunId);\n\tmarkGatewayDispatchPhase(\"gateway-dispatch-function-enter\");",
    "dispatch observer start",
  );
  source = once(
    source,
    '\tconst dispatch = replyDispatch.runAgentMediaTranscript({ run: (operation) => gatewayWorkAdmission.run(() => userTurnRecorder.withPendingInput ? userTurnRecorder.withPendingInput(operation) : operation()) }, () => measureDiagnosticsTimelineSpan("gateway.chat_send.dispatch_inbound", async () => {',
    '\tmarkGatewayDispatchPhase("gateway-dispatch-wrapper-call");\n\tconst dispatch = replyDispatch.runAgentMediaTranscript({ run: (operation) => {\n\t\tmarkGatewayDispatchPhase("gateway-media-transcript-run");\n\t\treturn gatewayWorkAdmission.run(() => {\n\t\t\tmarkGatewayDispatchPhase("gateway-work-admission-run");\n\t\t\treturn userTurnRecorder.withPendingInput ? userTurnRecorder.withPendingInput(operation) : operation();\n\t\t});\n\t} }, () => measureDiagnosticsTimelineSpan("gateway.chat_send.dispatch_inbound", async () => {\n\t\tmarkGatewayDispatchPhase("gateway-dispatch-inbound-enter");',
    "dispatch wrapper",
  );
  source = once(
    source,
    "\t\tconst pluginBoundMedia = await pluginBoundMediaPromise;\n\t\tassertWorkspaceRunOwnership?.();",
    "\t\tmarkGatewayDispatchPhase(\"gateway-plugin-media-await-enter\");\n\t\tconst pluginBoundMedia = await pluginBoundMediaPromise;\n\t\tmarkGatewayDispatchPhase(\"gateway-plugin-media-await-end\");\n\t\tassertWorkspaceRunOwnership?.();",
    "plugin media await",
  );
  source = once(
    source,
    "\t\tconst dispatchInbound = () => {\n\t\t\tassertWorkspaceRunOwnership?.();",
    "\t\tconst dispatchInbound = () => {\n\t\t\tmarkGatewayDispatchPhase(\"gateway-projected-dispatch-enter\");\n\t\t\tassertWorkspaceRunOwnership?.();",
    "projected dispatcher",
  );
  return source;
}
