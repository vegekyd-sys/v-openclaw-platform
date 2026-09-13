import assert from 'node:assert/strict';

function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  assert.notEqual(first, -1, `${label}: expected source pattern missing; refuse drift`);
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: source pattern is ambiguous; refuse drift`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export const GATEWAY_BEFORE = `\t"cron.runs",\n\t"secrets.store.delete"\n]);`;
export const GATEWAY_AFTER = `\t"cron.runs",\n\t"secrets.store.delete",\n\t"openclaw.chat"\n]);`;

export function patchGatewayAgentRuntimeIdentityMethods(source) {
  return replaceExactlyOnce(source, GATEWAY_BEFORE, GATEWAY_AFTER, 'Gateway runtime identity methods');
}

export const SESSIONS_HELPERS_BEFORE = `const callInProcessGatewayTool = async (method, params, options = {}) => {\n\treturn await callInProcessGatewayToolBound(method, params, options, async (scopes) => callGatewayTool(method, {}, params, { scopes }));\n};`;
export const SESSIONS_HELPERS_AFTER = `const callInProcessGatewayTool = async (method, params, options = {}) => {\n\treturn await callInProcessGatewayToolBound(method, params, options, async (scopes) => callGatewayTool(method, {}, params, {\n\t\tscopes,\n\t\t...options.signal ? { signal: options.signal } : {},\n\t\t...options.timeoutMs !== void 0 && options.timeoutMs !== null ? { timeoutMs: options.timeoutMs } : {}\n\t}));\n};`;

export function patchInProcessGatewayFallbackOptions(source) {
  return replaceExactlyOnce(source, SESSIONS_HELPERS_BEFORE, SESSIONS_HELPERS_AFTER, 'Gateway fallback options');
}

export const OPENCLAW_TOOL_BEFORE = `\t\t\t\t\t...options?.turnSourceThreadId !== void 0 ? { turnSourceThreadId: options.turnSourceThreadId } : {}\n\t\t\t\t}\n\t\t\t});\n\t\t\treturn jsonResult({`;
export const OPENCLAW_TOOL_AFTER = `\t\t\t\t\t...options?.turnSourceThreadId !== void 0 ? { turnSourceThreadId: options.turnSourceThreadId } : {}\n\t\t\t\t}\n\t\t\t}, { timeoutMs: 12e4 });\n\t\t\treturn jsonResult({`;

export function patchOpenClawDelegateTimeout(source) {
  return replaceExactlyOnce(source, OPENCLAW_TOOL_BEFORE, OPENCLAW_TOOL_AFTER, 'OpenClaw delegate timeout');
}

export const SYSTEM_AGENT_AUTHORITY_BEFORE = `function queueDelegatedApproval(params) {
	const manager = params.context.systemAgentApprovalManager;
	if (!manager) throw new Error("OpenClaw approval registry unavailable");
	const callerIdentity = getGatewayToolCallerIdentity();
	const approvalAuthority = callerIdentity?.approvalAuthority ?? (callerIdentity?.operationalRunInstance ? getActiveAgentRunDelegatedAuthority(callerIdentity.operationalRunInstance) : void 0);
	if (!approvalAuthority) throw new Error("delegated OpenClaw approval requires an active run authority");
	const runtimeApprovalAuthority = callerIdentity?.workerTurnClaim ? {
		kind: "worker",
		...approvalAuthority,
		turnClaim: callerIdentity.workerTurnClaim
	} : {`;
export const SYSTEM_AGENT_AUTHORITY_AFTER = `function queueDelegatedApproval(params) {
	const manager = params.context.systemAgentApprovalManager;
	if (!manager) throw new Error("OpenClaw approval registry unavailable");
	const transportIdentity = params.client?.internal?.agentRuntimeIdentity;
	const callerIdentity = getGatewayToolCallerIdentity() ?? transportIdentity;
	const runtimeDelegatedAuthority = callerIdentity?.delegatedAuthority;
	const approvalAuthority = callerIdentity?.approvalAuthority ?? runtimeDelegatedAuthority ?? (callerIdentity?.operationalRunInstance ? getActiveAgentRunDelegatedAuthority(callerIdentity.operationalRunInstance) : void 0);
	if (!approvalAuthority) throw new Error("delegated OpenClaw approval requires an active run authority");
	const workerTurnClaim = callerIdentity?.workerTurnClaim ?? (runtimeDelegatedAuthority?.kind === "worker" ? runtimeDelegatedAuthority.turnClaim : void 0);
	const runtimeApprovalAuthority = workerTurnClaim ? {
		kind: "worker",
		...approvalAuthority,
		turnClaim: workerTurnClaim
	} : {`;

export const SYSTEM_AGENT_CALL_BEFORE = `					if (proposal) proposalId = queueDelegatedApproval({
						context,
						sessions,`;
export const SYSTEM_AGENT_CALL_AFTER = `					if (proposal) proposalId = queueDelegatedApproval({
						context,
						client,
						sessions,`;

export function patchSystemAgentTransportAuthority(source) {
  const withAuthority = replaceExactlyOnce(source, SYSTEM_AGENT_AUTHORITY_BEFORE, SYSTEM_AGENT_AUTHORITY_AFTER, 'System Agent transport authority');
  return replaceExactlyOnce(withAuthority, SYSTEM_AGENT_CALL_BEFORE, SYSTEM_AGENT_CALL_AFTER, 'System Agent transport client');
}
