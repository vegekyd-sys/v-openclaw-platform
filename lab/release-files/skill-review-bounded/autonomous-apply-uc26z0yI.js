import { t as isWorkshopOwnedSkillDir } from "./ownership-DlqNy7D2.js";
import { m as withSkillProposalCommitLock, o as readSkillProposalManifest, s as readSkillProposalRecord, u as updateSkillProposalRecord } from "./store-BhtJIqk3.js";
import { r as rejectSkillProposal, t as applySkillProposal } from "./service-DUObgA1F.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/agents/skill-workshop-workspace-context.ts
const canonicalSkillWorkspace = new AsyncLocalStorage();
function runWithCanonicalSkillWorkspace(canonicalWorkspaceDir, run) {
	return canonicalWorkspaceDir ? canonicalSkillWorkspace.run(canonicalWorkspaceDir, run) : run();
}
function getCanonicalSkillWorkspace() {
	return canonicalSkillWorkspace.getStore();
}
//#endregion
//#region src/skills/workshop/autonomous-apply.ts
const USER_AUTHORED_PENDING_REASON = "user-authored skill; awaiting operator review";
async function applyAutonomousSkillProposal(params) {
	const store = params.env ? { env: params.env } : {};
	if (params.proposal.record.kind !== "create" && !isWorkshopOwnedSkillDir(params.workspaceDir, params.proposal.record.target.skillDir, store)) return {
		status: "pending",
		record: await withSkillProposalCommitLock(params.workspaceDir, params.proposal.record, async () => {
			const current = await readSkillProposalRecord(params.proposal.record.id, store);
			if (!current) throw new Error(`Skill proposal not found: ${params.proposal.record.id}`);
			if (current.status !== "pending") return current;
			const pending = {
				...current,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				statusReason: USER_AUTHORED_PENDING_REASON
			};
			await updateSkillProposalRecord({
				record: pending,
				store
			});
			return pending;
		}, store)
	};
	return {
		status: "applied",
		...await applySkillProposal({
			workspaceDir: params.workspaceDir,
			...params.agentId ? { agentId: params.agentId } : {},
			...params.config ? { config: params.config } : {},
			...params.env ? { env: params.env } : {},
			...params.eventActor ? { eventActor: params.eventActor } : {},
			proposalId: params.proposal.record.id,
			expectedRevisionHash: params.proposal.revisionHash,
			reason: params.reason
		})
	};
}
// skill-review-bounded-v1: autonomous proposals nobody reviewed within 7 days are rejected, so a full pending
// queue cannot block every later review. Operator proposals are never expired.
const AUTONOMOUS_PENDING_EXPIRY_MS = 6048e5;
const AUTONOMOUS_PENDING_EXPIRED_REASON = "Expired: autonomous proposal waited 7 days without operator review";
async function expireStaleAutonomousSkillProposals(params) {
	const store = params.env ? { env: params.env } : {};
	const cutoffMs = (params.nowMs ?? Date.now()) - AUTONOMOUS_PENDING_EXPIRY_MS;
	const manifest = await readSkillProposalManifest(store, {
		workspaceDir: params.workspaceDir,
		...params.agentId ? { agentId: params.agentId } : {}
	});
	const expired = [];
	for (const entry of manifest.proposals) {
		const createdAtMs = Date.parse(entry.createdAt);
		if (entry.status !== "pending" || !Number.isFinite(createdAtMs) || createdAtMs > cutoffMs) continue;
		const record = await readSkillProposalRecord(entry.id, store);
		if (!record || record.status !== "pending" || record.autonomousCapture !== true) continue;
		try {
			await rejectSkillProposal({
				workspaceDir: params.workspaceDir,
				...params.agentId ? { agentId: params.agentId } : {},
				...params.env ? { env: params.env } : {},
				eventActor: {
					type: "system",
					id: "skill-workshop-autonomous-expiry"
				},
				proposalId: entry.id,
				reason: AUTONOMOUS_PENDING_EXPIRED_REASON
			});
			expired.push(entry.id);
		} catch {}
	}
	return expired;
}
//#endregion
export { expireStaleAutonomousSkillProposals as i, getCanonicalSkillWorkspace as n, runWithCanonicalSkillWorkspace as r, applyAutonomousSkillProposal as t };
