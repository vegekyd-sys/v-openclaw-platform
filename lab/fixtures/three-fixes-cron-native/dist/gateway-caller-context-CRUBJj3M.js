import { r as getGatewayContextResolver } from "./gateway-request-scope-CmMd3nUp.js";
import { a as attachInternalToolExecutionPreparer, f as getInternalToolExecutionPreparer } from "./internal-hooks-CiSltLvS.js";
import { i as getAdmittedRunDelegatedAuthority } from "./admitted-run-context-DO5gB_Jz.js";
import { r as copyAgentToolMetadata } from "./agent-tool-metadata-CkrU8K-F.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/agents/tools/gateway-caller-context.ts
const gatewayToolCallerStorage = new AsyncLocalStorage();
function bindGatewayToolContextResolver(resolveGatewayContext) {
	if (!resolveGatewayContext) return;
	let admittedContext;
	try {
		admittedContext = resolveGatewayContext();
	} catch {
		return () => void 0;
	}
	if (!admittedContext) return () => void 0;
	return () => {
		try {
			return resolveGatewayContext() === admittedContext ? admittedContext : void 0;
		} catch {
			return;
		}
	};
}
function composeReceiptAuthority(...predicates) {
	const checks = predicates.filter((predicate, index) => predicate !== void 0 && predicates.indexOf(predicate) === index);
	return checks.length === 0 ? void 0 : () => {
		let active = true;
		for (const check of checks) try {
			active = check() !== false && active;
		} catch {
			active = false;
		}
		return active;
	};
}
/** Builds host-owned Gateway authority from the exact admitted execution. */
function createAdmittedGatewayToolCallerIdentity(params) {
	const agentId = params.agentId?.trim();
	const sessionKey = params.sessionKey?.trim();
	if (!agentId || !sessionKey) return;
	const delegatedAuthority = getAdmittedRunDelegatedAuthority(params.admittedRunContext);
	return {
		agentId,
		sessionKey,
		operationalRunInstance: params.admittedRunContext.operationalRunInstance,
		...delegatedAuthority ? { approvalAuthority: delegatedAuthority } : {},
		...params.receiptAuthority ? { approvalAuthorityCheck: params.receiptAuthority } : {},
		executionIdentityToken: params.admittedRunContext.executionIdentityToken,
		gatewayContextResolver: bindGatewayToolContextResolver(getGatewayContextResolver(params.admittedRunContext)),
		receiptAuthority: composeReceiptAuthority(() => delegatedAuthority !== void 0 && getAdmittedRunDelegatedAuthority(params.admittedRunContext) === delegatedAuthority, params.receiptAuthority),
		...params.approvalSignals?.length ? { approvalSignals: params.approvalSignals } : {},
		turnSourceChannel: params.turnSourceChannel,
		turnSourceLocal: params.turnSourceLocal,
		turnSourceTo: params.turnSourceTo,
		turnSourceAccountId: params.turnSourceAccountId,
		turnSourceThreadId: params.turnSourceThreadId
	};
}
function getGatewayToolCallerIdentity() {
	return gatewayToolCallerStorage.getStore();
}
/** Process-owned work must not retain the turn that authorized its launch. */
function withoutGatewayToolCallerIdentity(run) {
	return gatewayToolCallerStorage.exit(run);
}
async function withGatewayToolCallerIdentity(identity, run) {
	if (!identity?.agentId?.trim() || !identity.sessionKey?.trim()) return await run();
	const inherited = gatewayToolCallerStorage.getStore();
	const suppliedRun = identity.operationalRunInstance;
	const inheritedRun = inherited?.operationalRunInstance;
	const inheritedOwner = !suppliedRun || inheritedRun?.instanceId === suppliedRun.instanceId && inheritedRun.runId === suppliedRun.runId ? inherited : void 0;
	const operationalRunInstance = inheritedOwner?.operationalRunInstance ?? identity.operationalRunInstance;
	const approvalAuthority = inheritedOwner?.approvalAuthority ?? identity.approvalAuthority;
	const approvalAuthorityCheck = inheritedOwner?.approvalAuthorityCheck ?? identity.approvalAuthorityCheck;
	const signedAgentRuntimeIdentityToken = inheritedOwner?.signedAgentRuntimeIdentityToken ?? identity.signedAgentRuntimeIdentityToken?.trim();
	const executionIdentityToken = inheritedOwner?.executionIdentityToken ?? identity.executionIdentityToken;
	const receiptAuthority = composeReceiptAuthority(inheritedOwner?.receiptAuthority, identity.receiptAuthority);
	const approvalSignals = [.../* @__PURE__ */ new Set([...inheritedOwner?.approvalSignals ?? [], ...identity.approvalSignals ?? []])];
	const workerTurnClaim = inheritedOwner?.workerTurnClaim ?? identity.workerTurnClaim;
	const workerTurnExecutionIdentityCapability = inheritedOwner?.workerTurnExecutionIdentityCapability ?? identity.workerTurnExecutionIdentityCapability;
	const gatewayContextResolver = inheritedOwner?.gatewayContextResolver ?? bindGatewayToolContextResolver(identity.gatewayContextResolver);
	const cronSelfManagementJobId = identity.cronSelfManagementJobId?.trim() ?? inheritedOwner?.cronSelfManagementJobId;
	const cronToolsAllowCapture = identity.cronToolsAllowCapture ?? inheritedOwner?.cronToolsAllowCapture;
	const cronExecToolTarget = identity.cronExecToolTarget ?? inheritedOwner?.cronExecToolTarget;
	const cronCreatorAuthorityGrant = identity.cronCreatorAuthorityGrant ?? inheritedOwner?.cronCreatorAuthorityGrant;
	const turnSourceChannel = inheritedOwner?.turnSourceChannel ?? identity.turnSourceChannel?.trim();
	const turnSourceLocal = inheritedOwner?.turnSourceLocal ?? identity.turnSourceLocal;
	const turnSourceTo = inheritedOwner?.turnSourceTo ?? identity.turnSourceTo?.trim();
	const turnSourceAccountId = inheritedOwner?.turnSourceAccountId ?? identity.turnSourceAccountId?.trim();
	const turnSourceThreadId = inheritedOwner?.turnSourceThreadId ?? identity.turnSourceThreadId;
	return await gatewayToolCallerStorage.run({
		agentId: inheritedOwner?.agentId ?? identity.agentId.trim(),
		sessionKey: inheritedOwner?.sessionKey ?? identity.sessionKey.trim(),
		...operationalRunInstance ? { operationalRunInstance } : {},
		...approvalAuthority ? { approvalAuthority } : {},
		...approvalAuthorityCheck ? { approvalAuthorityCheck } : {},
		...identity.approvalOwnerPluginId?.trim() ? { approvalOwnerPluginId: identity.approvalOwnerPluginId.trim() } : inheritedOwner?.approvalOwnerPluginId ? { approvalOwnerPluginId: inheritedOwner.approvalOwnerPluginId } : {},
		...signedAgentRuntimeIdentityToken ? { signedAgentRuntimeIdentityToken } : {},
		...cronSelfManagementJobId ? { cronSelfManagementJobId } : {},
		...cronToolsAllowCapture ? { cronToolsAllowCapture } : {},
		...cronExecToolTarget ? { cronExecToolTarget } : {},
		...cronCreatorAuthorityGrant ? { cronCreatorAuthorityGrant } : {},
		...executionIdentityToken ? { executionIdentityToken } : {},
		...receiptAuthority ? { receiptAuthority } : {},
		...approvalSignals.length ? { approvalSignals } : {},
		...workerTurnClaim ? { workerTurnClaim } : {},
		...workerTurnExecutionIdentityCapability ? { workerTurnExecutionIdentityCapability } : {},
		...gatewayContextResolver ? { gatewayContextResolver } : {},
		...turnSourceChannel ? { turnSourceChannel } : {},
		...turnSourceLocal === true ? { turnSourceLocal: true } : {},
		...turnSourceTo ? { turnSourceTo } : {},
		...turnSourceAccountId ? { turnSourceAccountId } : {},
		...turnSourceThreadId !== void 0 ? { turnSourceThreadId } : {}
	}, run);
}
/** Narrows one host-owned approval call to the exact registered policy/harness owner. */
async function withGatewayToolApprovalOwner(pluginId, run) {
	const identity = gatewayToolCallerStorage.getStore();
	const approvalOwnerPluginId = pluginId?.trim();
	if (!identity || !approvalOwnerPluginId) return await run();
	return await withGatewayToolCallerIdentity({
		...identity,
		approvalOwnerPluginId
	}, run);
}
function wrapToolWithGatewayCallerIdentity(tool, identity) {
	if (!identity?.agentId?.trim() || !identity.sessionKey?.trim() || !tool.execute) return tool;
	const wrapped = {
		...tool,
		execute: async (...args) => await withGatewayToolCallerIdentity(identity, async () => await tool.execute?.(...args))
	};
	copyAgentToolMetadata(tool, wrapped);
	const sourcePreparer = getInternalToolExecutionPreparer(tool);
	if (sourcePreparer) attachInternalToolExecutionPreparer(wrapped, async (params) => {
		const prepared = await withGatewayToolCallerIdentity(identity, () => sourcePreparer(params));
		return prepared.kind === "ready" ? {
			...prepared,
			execute: (start) => withGatewayToolCallerIdentity(identity, () => prepared.execute(start))
		} : prepared;
	});
	return wrapped;
}
function createGatewayToolCallerWrapper(agentId, source) {
	const identity = agentId && source?.agentSessionKey?.trim() ? {
		agentId,
		sessionKey: source.agentSessionKey.trim(),
		turnSourceChannel: source.agentChannel,
		turnSourceTo: source.currentMessagingTarget ?? source.currentChannelId ?? source.agentTo,
		turnSourceAccountId: source.agentAccountId,
		turnSourceThreadId: source.currentThreadTs ?? source.agentThreadId
	} : void 0;
	return (tool) => wrapToolWithGatewayCallerIdentity(tool, identity);
}
//#endregion
export { withGatewayToolCallerIdentity as a, withGatewayToolApprovalOwner as i, createGatewayToolCallerWrapper as n, withoutGatewayToolCallerIdentity as o, getGatewayToolCallerIdentity as r, wrapToolWithGatewayCallerIdentity as s, createAdmittedGatewayToolCallerIdentity as t };
