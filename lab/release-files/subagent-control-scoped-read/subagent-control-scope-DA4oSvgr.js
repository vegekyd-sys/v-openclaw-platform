import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, T as isSubagentSessionKey } from "./session-key-CRjxKW0X.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { r as resolveStoredSubagentCapabilities } from "./subagent-capabilities-CPAHEjL-.js";
import { m as resolveMainSessionAlias, p as resolveInternalSessionKey } from "./sessions-helpers-Bn_vDNby.js";
import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, o as getLatestLiveSubagentRunByChildSessionKey } from "./subagent-registry-read-UaDFTyfW.js";
import { n as resolveSubagentRequesterAgentId } from "./subagent-requester-owner-D7K1yW_G.js";
import { loadSubagentRunTreeFromSqlite, w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { loadControlledSubagentRuns } from "./v-subagent-control-scoped-runs.mjs";
import { n as sortSubagentRuns } from "./subagent-run-view-BqhTqM1D.js";
//#region src/agents/subagents/registry/subagent-control-scope.ts
/** Recent-run default window used by subagent control UI/tools. */
const DEFAULT_RECENT_MINUTES = 30;
/** Maximum recent-run window accepted by subagent control UI/tools. */
const MAX_RECENT_MINUTES = 1440;
/** Resolves which subagent runs the caller is allowed to control. */
function resolveSubagentController(params) {
	const { mainKey, alias } = resolveMainSessionAlias(params.cfg);
	const callerRaw = params.agentSessionKey?.trim() || alias;
	const callerSessionKey = resolveInternalSessionKey({
		key: callerRaw,
		alias,
		mainKey
	});
	const controllerAgentId = resolveSessionAgentId({
		config: params.cfg,
		sessionKey: callerSessionKey,
		agentId: params.agentId
	});
	if (!isSubagentSessionKey(callerSessionKey)) return {
		controllerSessionKey: callerSessionKey,
		controllerAgentId,
		callerSessionKey,
		callerIsSubagent: false,
		controlScope: "children"
	};
	return {
		controllerSessionKey: callerSessionKey,
		controllerAgentId,
		callerSessionKey,
		callerIsSubagent: true,
		controlScope: resolveStoredSubagentCapabilities(callerSessionKey, {
			cfg: params.cfg,
			agentId: controllerAgentId
		}).controlScope
	};
}
function resolveRunRequesterAgentId(entry, cfg) {
	if (entry.requesterAgentId) return entry.requesterAgentId;
	const parsed = parseAgentSessionKey(entry.requesterSessionKey)?.agentId;
	if (parsed || !cfg) return parsed;
	return resolveSubagentRequesterAgentId(cfg, entry);
}
function isSubagentRunVisibleToSession(entry, sessionKey, agentId, cfg) {
	const controllerKey = entry.controllerSessionKey?.trim();
	const requesterKey = entry.requesterSessionKey.trim();
	const requesterAgentId = resolveRunRequesterAgentId(entry, cfg);
	const controllerAgentId = (controllerKey ? parseAgentSessionKey(controllerKey)?.agentId : void 0) ?? requesterAgentId;
	const normalizedAgentId = normalizeAgentId(agentId);
	return controllerKey === sessionKey && controllerAgentId === normalizedAgentId || requesterKey === sessionKey && requesterAgentId === normalizedAgentId;
}
/** Builds one stable snapshot for controlled-run listing and descendant status reads. */
function buildControlledSubagentRunsReadContext(controllerSessionKey, controllerAgentId, cfg) {
	const key = controllerSessionKey.trim();
	const agentId = controllerAgentId ?? parseAgentSessionKey(key)?.agentId;
	if (!key || !agentId) return {
		runs: [],
		countPendingDescendantRuns: () => 0
	};
	// subagent-control-scoped-read: the session's tree through the indexes; the whole registry only when that declines.
	let snapshot = null;
	if (process.env.OPENCLAW_V_SCOPED_CONTROL_SUBAGENT_RUNS !== "0") try {
		snapshot = loadControlledSubagentRuns({
			key,
			inMemoryRuns: subagentRuns,
			loadTree: loadSubagentRunTreeFromSqlite,
			maxRuns: Number(process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? 256)
		});
	} catch {}
	snapshot ??= getSubagentRunsSnapshotForRead(subagentRuns);
	const readIndex = buildSubagentRunReadIndexFromRuns({ runs: snapshot });
	const filtered = Array.from(readIndex.latestRunsByChildSessionKey.values()).filter((entry) => isSubagentRunVisibleToSession(entry, key, agentId, cfg));
	return {
		runs: sortSubagentRuns(filtered),
		countPendingDescendantRuns: (rootSessionKey) => readIndex.countPendingDescendantRuns(rootSessionKey)
	};
}
/** Lists latest child runs controlled by a session key. */
function listControlledSubagentRuns(controllerSessionKey, controllerAgentId, cfg) {
	return buildControlledSubagentRunsReadContext(controllerSessionKey, controllerAgentId, cfg).runs;
}
function ensureSubagentControllerOwnsRun(params) {
	const owner = params.entry.controllerSessionKey?.trim() || params.entry.requesterSessionKey;
	const ownerAgentId = parseAgentSessionKey(owner)?.agentId ?? resolveRunRequesterAgentId(params.entry, params.cfg);
	const controllerAgentId = params.controller.controllerAgentId ?? parseAgentSessionKey(params.controller.controllerSessionKey)?.agentId;
	if (owner === params.controller.controllerSessionKey && ownerAgentId === controllerAgentId) return;
	return "Subagents can only control runs spawned from their own session.";
}
function getLatestOwnedSubagentRun(childSessionKey, agentId, cfg) {
	const ownerFilter = parseAgentSessionKey(childSessionKey) ? void 0 : agentId;
	return getLatestLiveSubagentRunByChildSessionKey(childSessionKey, ownerFilter ? (candidate) => resolveRunRequesterAgentId(candidate, cfg) === ownerFilter : void 0) ?? void 0;
}
function isCurrentSubagentRun(entry, cfg) {
	if (!cfg) return getLatestLiveSubagentRunByChildSessionKey(entry.childSessionKey) === entry;
	return getLatestOwnedSubagentRun(entry.childSessionKey, resolveRunRequesterAgentId(entry, cfg), cfg) === entry;
}
function isSameSubagentRunGeneration(live, snapshot) {
	return live.childSessionKey === snapshot.childSessionKey && live.runId === snapshot.runId && live.generation === snapshot.generation && live.createdAt === snapshot.createdAt;
}
//#endregion
export { getLatestOwnedSubagentRun as a, listControlledSubagentRuns as c, ensureSubagentControllerOwnsRun as i, resolveSubagentController as l, MAX_RECENT_MINUTES as n, isCurrentSubagentRun as o, buildControlledSubagentRunsReadContext as r, isSameSubagentRunGeneration as s, DEFAULT_RECENT_MINUTES as t };
