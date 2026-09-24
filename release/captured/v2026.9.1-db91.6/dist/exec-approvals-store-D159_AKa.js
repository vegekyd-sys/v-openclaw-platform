import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as withExistingOpenClawStateDatabaseReadOnly } from "./openclaw-state-db-readonly-C7txILW9.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { n as normalizeAgentId, r as normalizeAgentIdStrict } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { c as readAgentDeletionJournal } from "./agent-deletion-journal-CoDMOoU8.js";
import { c as resolveExecApprovalsDisplayPath, i as generateToken, o as normalizeExecApprovalsInternal, r as createFailClosedExecApprovalsFallback, u as resolveExecApprovalsSocketPath } from "./exec-approvals-config-C8L2eA5n.js";
import { n as AgentDeletionCommitUncertainError, t as AgentDeletionAuthorityRollbackError } from "./agent-lifecycle-registry-Bhx8Gpp7.js";
import { n as assertNoPendingLegacyExecApprovals, r as resetExecApprovalsMigrationGateForTest, t as ExecApprovalsMigrationRequiredError } from "./exec-approvals-migration-gate-DWOOjrtr.js";
import { c as serializeExecApprovals, i as deleteExecApprovalsConfigRow, l as snapshotFromExecApprovalsRow, n as assertExecApprovalsMutationAllowed, r as assertExecApprovalsMutationAuthority, s as readExecApprovalsConfigRow, t as ExecApprovalsMutationFencedError, u as writeExecApprovalsConfigRow } from "./exec-approvals-sqlite-UmH2D1Jr.js";
//#region src/infra/exec-approvals-store.ts
const log = createSubsystemLogger("infra/exec-approvals");
const WARN_INTERVAL_MS = 6e4;
let lastWarnAt;
var ExecApprovalsStoreUnavailableError = class extends Error {
	constructor(cause) {
		super(`Exec approvals SQLite state is unavailable: ${String(cause)}`, { cause });
		this.name = "ExecApprovalsStoreUnavailableError";
	}
};
function warnFailClosed(message, error) {
	const now = Date.now();
	if (lastWarnAt !== void 0 && now - lastWarnAt < WARN_INTERVAL_MS) return;
	lastWarnAt = now;
	if (error === void 0) log.warn(message);
	else log.warn(message, { error: formatErrorMessage(error) });
}
function snapshotFromExecApprovalsDatabase(db) {
	return snapshotFromExecApprovalsRow({
		path: resolveExecApprovalsDisplayPath(),
		row: readExecApprovalsConfigRow(db),
		onMalformed: () => warnFailClosed("exec approvals SQLite row is malformed; denying host execution")
	});
}
function readExecApprovalsSnapshotFromDatabase(options = {}) {
	assertNoPendingLegacyExecApprovals();
	return snapshotFromExecApprovalsDatabase(openOpenClawStateDatabase(options).db);
}
function readExecApprovalsSnapshotFromDatabaseReadOnly() {
	assertNoPendingLegacyExecApprovals();
	return withExistingOpenClawStateDatabaseReadOnly(({ db }) => snapshotFromExecApprovalsDatabase(db)) ?? snapshotFromExecApprovalsRow({
		path: resolveExecApprovalsDisplayPath(),
		row: void 0
	});
}
function readExecApprovalsSnapshotWithOptions(options = {}) {
	try {
		return readExecApprovalsSnapshotFromDatabase(options);
	} catch (error) {
		if (error instanceof ExecApprovalsMigrationRequiredError) throw error;
		throw new ExecApprovalsStoreUnavailableError(error);
	}
}
function readExecApprovalsSnapshot() {
	return readExecApprovalsSnapshotWithOptions();
}
function loadExecApprovals() {
	try {
		return readExecApprovalsSnapshot().file;
	} catch (error) {
		if (!(error instanceof ExecApprovalsStoreUnavailableError)) throw error;
		warnFailClosed("exec approvals SQLite state is unavailable; denying host execution", error);
		return createFailClosedExecApprovalsFallback();
	}
}
/** Loads exec approvals without creating or migrating shared state. */
function loadExecApprovalsReadOnly() {
	try {
		return readExecApprovalsSnapshotFromDatabaseReadOnly().file;
	} catch (error) {
		if (error instanceof ExecApprovalsMigrationRequiredError) throw error;
		warnFailClosed("exec approvals SQLite state is unavailable; denying host execution", error);
		return createFailClosedExecApprovalsFallback();
	}
}
async function loadExecApprovalsAsync() {
	return loadExecApprovals();
}
function replaceExecApprovalsSnapshot(target, source) {
	target.version = source.version;
	if (source.socket === void 0) delete target.socket;
	else target.socket = source.socket;
	if (source.defaults === void 0) delete target.defaults;
	else target.defaults = source.defaults;
	if (source.agents === void 0) delete target.agents;
	else target.agents = source.agents;
}
function updateExecApprovalsInTransaction(params, options = {}) {
	assertNoPendingLegacyExecApprovals();
	return runOpenClawStateWriteTransaction(({ db }) => {
		const current = snapshotFromExecApprovalsRow({
			path: resolveExecApprovalsDisplayPath(),
			row: readExecApprovalsConfigRow(db),
			onMalformed: () => warnFailClosed("exec approvals SQLite row is malformed; denying host execution")
		});
		if (params.baseHash !== void 0 && current.hash !== params.baseHash) return null;
		const next = params.update(structuredClone(current.file));
		if (next === null) return current;
		assertExecApprovalsMutationAllowed({
			db,
			current: current.file,
			next,
			authority: params.authority
		});
		const raw = serializeExecApprovals(next);
		if (current.exists && current.raw === raw) return current;
		writeExecApprovalsConfigRow({
			db,
			file: next,
			raw
		});
		return snapshotFromExecApprovalsRow({
			path: current.path,
			row: { raw_json: raw }
		});
	}, options, { operationLabel: "exec-approvals.update" });
}
function updateExecApprovalsSync(params) {
	return updateExecApprovalsInTransaction(params);
}
function saveExecApprovals(file) {
	updateExecApprovalsSync({ update: () => file });
}
async function updateExecApprovals(params) {
	return updateExecApprovalsInTransaction(params);
}
/** Remove one deleted agent's policy aliases, restoring them if commit fails. */
async function withAgentExecApprovalsRemoved(agentId, commit, options = {}) {
	const key = normalizeAgentId(agentId);
	const snapshot = readExecApprovalsSnapshotWithOptions(options);
	const operationId = readAgentDeletionJournal(key, options)?.operationId;
	if (!operationId) throw new ExecApprovalsMutationFencedError();
	const removedPolicyEntries = Object.entries(snapshot.file.agents ?? {}).filter(([policyKey]) => {
		const normalizedPolicyKey = normalizeAgentIdStrict(policyKey);
		return normalizedPolicyKey.ok && normalizedPolicyKey.value === key;
	});
	if (removedPolicyEntries.length > 0) {
		if (!updateExecApprovalsInTransaction({
			baseHash: snapshot.hash,
			authority: {
				action: "remove",
				agentId: key,
				operationId
			},
			update: (file) => {
				const agents = { ...file.agents };
				for (const [policyKey] of removedPolicyEntries) delete agents[policyKey];
				return {
					...file,
					agents
				};
			}
		}, options)) throw new Error("Exec approvals changed while deleting agent; retry deletion.");
	} else runOpenClawStateWriteTransaction(({ db }) => {
		assertExecApprovalsMutationAuthority(db, {
			action: "remove",
			agentId: key,
			operationId
		});
	}, options);
	try {
		return await commit();
	} catch (error) {
		if (error instanceof AgentDeletionCommitUncertainError) throw error;
		if (removedPolicyEntries.length > 0) try {
			updateExecApprovalsInTransaction({
				authority: {
					action: "restore",
					agentId: key,
					operationId
				},
				update: (file) => ({
					...file,
					agents: {
						...file.agents,
						...Object.fromEntries(removedPolicyEntries)
					}
				})
			}, options);
		} catch (rollbackError) {
			throw new AgentDeletionAuthorityRollbackError([error, rollbackError], `Failed to roll back exec approvals deletion for agent ${key}.`, { cause: error });
		}
		throw error;
	}
}
function restoreExecApprovalsSnapshotInTransaction(snapshot) {
	runOpenClawStateWriteTransaction(({ db }) => {
		const current = snapshotFromExecApprovalsRow({
			path: resolveExecApprovalsDisplayPath(),
			row: readExecApprovalsConfigRow(db)
		});
		assertExecApprovalsMutationAllowed({
			db,
			current: current.file,
			next: snapshot.file
		});
		if (!snapshot.exists) {
			deleteExecApprovalsConfigRow(db);
			return;
		}
		const raw = snapshot.raw ?? serializeExecApprovals(snapshot.file);
		writeExecApprovalsConfigRow({
			db,
			file: snapshot.file,
			raw
		});
	}, {}, { operationLabel: "exec-approvals.restore" });
}
function restoreExecApprovalsSnapshot(snapshot) {
	assertNoPendingLegacyExecApprovals();
	restoreExecApprovalsSnapshotInTransaction(snapshot);
}
async function restoreExecApprovalsSnapshotLocked(snapshot, baseHash) {
	assertNoPendingLegacyExecApprovals();
	return runOpenClawStateWriteTransaction(({ db }) => {
		const current = snapshotFromExecApprovalsRow({
			path: resolveExecApprovalsDisplayPath(),
			row: readExecApprovalsConfigRow(db)
		});
		if (current.hash !== baseHash) return false;
		assertExecApprovalsMutationAllowed({
			db,
			current: current.file,
			next: snapshot.file
		});
		if (!snapshot.exists) deleteExecApprovalsConfigRow(db);
		else {
			const raw = snapshot.raw ?? serializeExecApprovals(snapshot.file);
			writeExecApprovalsConfigRow({
				db,
				file: snapshot.file,
				raw
			});
		}
		return true;
	}, {}, { operationLabel: "exec-approvals.restore-cas" });
}
function ensureExecApprovalsSocket(file) {
	const next = normalizeExecApprovalsInternal(file);
	const socketPath = next.socket?.path?.trim();
	const token = next.socket?.token?.trim();
	return {
		...next,
		socket: {
			path: socketPath || resolveExecApprovalsSocketPath(),
			token: token || generateToken()
		}
	};
}
function requireInitializedExecApprovals(snapshot) {
	if (!snapshot) throw new Error("Failed to initialize exec approvals");
	return snapshot;
}
function readInitializedExecApprovalsSnapshotReadOnly() {
	const snapshot = readExecApprovalsSnapshotFromDatabaseReadOnly();
	const socketPath = snapshot.file.socket?.path?.trim();
	const token = snapshot.file.socket?.token?.trim();
	return socketPath && token ? snapshot : null;
}
async function ensureExecApprovalsSnapshot() {
	return readInitializedExecApprovalsSnapshotReadOnly() ?? requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket }));
}
function ensureExecApprovals() {
	return (readInitializedExecApprovalsSnapshotReadOnly() ?? requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket }))).file;
}
const testing = { reset() {
	resetExecApprovalsMigrationGateForTest();
	lastWarnAt = void 0;
} };
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.execApprovalsStoreTestApi")] = testing;
//#endregion
export { loadExecApprovalsReadOnly as a, restoreExecApprovalsSnapshot as c, updateExecApprovals as d, updateExecApprovalsSync as f, loadExecApprovalsAsync as i, restoreExecApprovalsSnapshotLocked as l, ensureExecApprovalsSnapshot as n, readExecApprovalsSnapshot as o, withAgentExecApprovalsRemoved as p, loadExecApprovals as r, replaceExecApprovalsSnapshot as s, ensureExecApprovals as t, saveExecApprovals as u };
