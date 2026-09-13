import assert from 'node:assert/strict';

function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  assert.notEqual(first, -1, `${label}: expected source pattern missing; refuse drift`);
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: source pattern is ambiguous; refuse drift`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export const OWNER_DIRECT_HELPER = `function resolveDelegatedOwnerDirectMessage(params) {
\tconst delegation = params.delegation;
\tconst callerIdentity = params.callerIdentity;
\tif (!delegation || !callerIdentity) return;
\tconst agentId = typeof delegation.agentId === "string" ? delegation.agentId.trim() : "";
\tconst sessionKey = typeof delegation.sessionKey === "string" ? delegation.sessionKey.trim() : "";
\tconst channel = typeof delegation.turnSourceChannel === "string" ? delegation.turnSourceChannel.trim().toLowerCase() : "";
\tif (!agentId || !sessionKey || !channel) return;
\tif (agentId !== callerIdentity.agentId) return;
\tconst directPrefix = \`agent:\${agentId}:\${channel}:direct:\`;
\tif (!sessionKey.startsWith(directPrefix)) return;
\tconst senderId = sessionKey.slice(directPrefix.length).trim();
\tif (!senderId || senderId.includes(":")) return;
\tconst ownerAllowFrom = params.cfg?.commands?.ownerAllowFrom;
\tconst ownerIdentity = \`\${channel}:\${senderId}\`;
\tif (!Array.isArray(ownerAllowFrom) || !ownerAllowFrom.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === ownerIdentity.toLowerCase())) return;
\treturn ownerIdentity;
}`;

const SAME_AUTHORITY = `function sameApprovalAuthority(left, right) {
\tif (left.kind !== right.kind || left.claimId !== right.claimId || left.lifecycleGeneration !== right.lifecycleGeneration || left.operationalRunInstance.instanceId !== right.operationalRunInstance.instanceId || left.operationalRunInstance.runId !== right.operationalRunInstance.runId) return false;
\treturn left.kind === "worker" && right.kind === "worker" ? sameWorkerSessionTurnClaim(left.turnClaim, right.turnClaim) : true;
}`;

const OWNER_RESOLUTION_BEFORE = `\t};
\tconst pendingApproval = params.session.pendingApproval;`;
const OWNER_RESOLUTION_AFTER = `\t};
\tconst ownerDirectMessage = resolveDelegatedOwnerDirectMessage({
\t\tcfg: params.context.getRuntimeConfig?.() ?? {},
\t\tdelegation: params.delegation,
\t\tcallerIdentity
\t});
\tconst pendingApproval = params.session.pendingApproval;`;

const PENDING_REUSE_BEFORE = `\t\tif (!closed && existing) {
\t\t\tif (existing.resolvedAtMs === void 0 && existing.agentRuntimeDelegatedAuthority && sameApprovalAuthority(existing.agentRuntimeDelegatedAuthority, runtimeApprovalAuthority)) return pendingApproval.id;
\t\t}
\t\tparams.session.pendingApproval = void 0;`;
const PENDING_REUSE_AFTER = `\t\tif (!closed && existing) {
\t\t\tif (!ownerDirectMessage && existing.resolvedAtMs === void 0 && existing.agentRuntimeDelegatedAuthority && sameApprovalAuthority(existing.agentRuntimeDelegatedAuthority, runtimeApprovalAuthority)) return { id: pendingApproval.id };
\t\t}
\t\tif (ownerDirectMessage && existing?.resolvedAtMs === void 0) manager.expire(pendingApproval.id, "owner-direct-retry");
\t\tparams.session.pendingApproval = void 0;`;

const APPLICATION_PROMISE_BEFORE = `\t\tparams.context.approvalEvents?.publishResolved("system-agent", resolvedEvent);
\t};
\thandlePendingApprovalRequest({`;
const APPLICATION_PROMISE_AFTER = `\t\tparams.context.approvalEvents?.publishResolved("system-agent", resolvedEvent);
\t};
\tlet resolveOwnerApplication;
\tlet rejectOwnerApplication;
\tconst ownerApplication = ownerDirectMessage ? new Promise((resolve, reject) => {
\t\tresolveOwnerApplication = resolve;
\t\trejectOwnerApplication = reject;
\t}) : void 0;
\thandlePendingApprovalRequest({`;

const DECISION_EMPTY_BEFORE = `\t\tafterDecision: async (decision) => {
\t\t\tif (!decision) return;`;
const DECISION_EMPTY_AFTER = `\t\tafterDecision: async (decision) => {
\t\t\tif (!decision) {
\t\t\t\tresolveOwnerApplication?.(null);
\t\t\t\treturn;
\t\t\t}`;

const APPLICATION_SETTLE_BEFORE = `\t\t\t\tpublishApplicationResult(decision, reply?.applied === true ? "applied" : "not-applied");
\t\t\t} catch (error) {
\t\t\t\tpublishApplicationResult(decision, "not-applied");
\t\t\t\tthrow error;`;
const APPLICATION_SETTLE_AFTER = `\t\t\t\tpublishApplicationResult(decision, reply?.applied === true ? "applied" : "not-applied");
\t\t\t\tresolveOwnerApplication?.(reply);
\t\t\t} catch (error) {
\t\t\t\tpublishApplicationResult(decision, "not-applied");
\t\t\t\trejectOwnerApplication?.(error);
\t\t\t\tthrow error;`;

const QUEUE_RETURN_BEFORE = `\t});
\treturn record.id;
}`;
const QUEUE_RETURN_AFTER = `\t});
\tif (ownerDirectMessage && !manager.resolveAutoReview(record.id, \`owner-direct:\${ownerDirectMessage}\`)) throw new Error("delegated owner OpenClaw approval could not be resolved while the run was active");
\treturn {
\t\tid: record.id,
\t\t...ownerApplication ? { ownerApplication } : {}
\t};
}`;

const HANDLER_BEFORE = `\t\t\t\tif (delegation) {
\t\t\t\t\tconst proposal = session.engine.getPendingOperatorProposal();
\t\t\t\t\tif (proposal) proposalId = queueDelegatedApproval({
\t\t\t\t\t\tcontext,
\t\t\t\t\t\tclient,
\t\t\t\t\t\tsessions,
\t\t\t\t\t\tsession,
\t\t\t\t\t\tsessionId,
\t\t\t\t\t\tdelegation,
\t\t\t\t\t\tproposal
\t\t\t\t\t});
\t\t\t\t}`;
const HANDLER_AFTER = `\t\t\t\tif (delegation) {
\t\t\t\t\tconst proposal = session.engine.getPendingOperatorProposal();
\t\t\t\t\tif (proposal) {
\t\t\t\t\t\tconst queuedApproval = queueDelegatedApproval({
\t\t\t\t\t\t\tcontext,
\t\t\t\t\t\t\tclient,
\t\t\t\t\t\t\tsessions,
\t\t\t\t\t\t\tsession,
\t\t\t\t\t\t\tsessionId,
\t\t\t\t\t\t\tdelegation,
\t\t\t\t\t\t\tproposal
\t\t\t\t\t\t});
\t\t\t\t\t\tproposalId = queuedApproval.id;
\t\t\t\t\t\tif (queuedApproval.ownerApplication) {
\t\t\t\t\t\t\tconst appliedReply = await queuedApproval.ownerApplication;
\t\t\t\t\t\t\tif (!appliedReply?.applied) throw new Error("delegated owner OpenClaw change was approved but not applied");
\t\t\t\t\t\t\treply = appliedReply;
\t\t\t\t\t\t\tproposalId = void 0;
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}`;

export function patchSystemAgentOwnerDirectAutoReview(source) {
  let patched = replaceExactlyOnce(source, SAME_AUTHORITY, `${SAME_AUTHORITY}\n${OWNER_DIRECT_HELPER}`, 'owner direct helper');
  for (const [before, after, label] of [
    [OWNER_RESOLUTION_BEFORE, OWNER_RESOLUTION_AFTER, 'owner direct resolution'],
    [PENDING_REUSE_BEFORE, PENDING_REUSE_AFTER, 'owner pending reuse'],
    [APPLICATION_PROMISE_BEFORE, APPLICATION_PROMISE_AFTER, 'owner application promise'],
    [DECISION_EMPTY_BEFORE, DECISION_EMPTY_AFTER, 'empty decision settlement'],
    [APPLICATION_SETTLE_BEFORE, APPLICATION_SETTLE_AFTER, 'owner application settlement'],
    [QUEUE_RETURN_BEFORE, QUEUE_RETURN_AFTER, 'owner auto review'],
    [HANDLER_BEFORE, HANDLER_AFTER, 'owner applied response'],
  ]) patched = replaceExactlyOnce(patched, before, after, label);
  return patched;
}

const DELEGATE_PENDING_BEFORE = `\t\t\tif (result.needsApproval && result.proposalId) {
\t\t\t\tlet approval;
\t\t\t\tlet approvalRecordClosed = false;
\t\t\t\tconst waitUntil = Date.now() + 6e5;
\t\t\t\tdo {
\t\t\t\t\tsignal?.throwIfAborted?.();
\t\t\t\t\tawait new Promise((resolve) => setTimeout(resolve, 500));
\t\t\t\t\ttry {
\t\t\t\t\t\tconst snapshot = await callGateway("approval.get", { id: result.proposalId }, {
\t\t\t\t\t\t\tsignal,
\t\t\t\t\t\t\ttimeoutMs: 15e3
\t\t\t\t\t\t});
\t\t\t\t\t\tapproval = snapshot.approval;
\t\t\t\t\t} catch (error) {
\t\t\t\t\t\tif (!String(error?.message ?? error).includes("approval not found")) throw error;
\t\t\t\t\t\tapprovalRecordClosed = true;
\t\t\t\t\t}
\t\t\t\t} while (!approvalRecordClosed && approval?.status === "pending" && Date.now() < waitUntil);
\t\t\t\tif (approval?.status === "allowed" || approvalRecordClosed) {
\t\t\t\t\tawait new Promise((resolve) => setTimeout(resolve, 8e3));
\t\t\t\t\treturn jsonResult({
\t\t\t\t\t\treply: approval?.status === "allowed" ? "The operator approved the OpenClaw change. Read the affected Gateway setting now and report success only if its value actually changed." : "The approval record closed after operator action. Read the affected Gateway setting now and report success only if its value actually changed; otherwise report that the change was not applied.",
\t\t\t\t\t\taction: result.action
\t\t\t\t\t});
\t\t\t\t}
\t\t\t\treturn jsonResult({
\t\t\t\t\treply: \`The OpenClaw change was not applied (approval status: \${approval?.status ?? "unavailable"}).\`,
\t\t\t\t\taction: result.action
\t\t\t\t});
\t\t\t}`;
const DELEGATE_PENDING_AFTER = `\t\t\tif (result.needsApproval && result.proposalId) {
\t\t\t\treturn jsonResult({
\t\t\t\t\treply: result.reply,
\t\t\t\t\tneedsApproval: true,
\t\t\t\t\tproposalId: result.proposalId,
\t\t\t\t\t...result.action && result.action !== "none" ? { action: result.action } : {}
\t\t\t\t});
\t\t\t}`;

export function patchDelegateClosedApprovalMisread(source) {
  return replaceExactlyOnce(source, DELEGATE_PENDING_BEFORE, DELEGATE_PENDING_AFTER, 'delegated approval result');
}
