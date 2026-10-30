import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as isPathInside } from "./path-safety-Bi0ppMWC.js";
import { D as walkDirectory, d as pathExists, w as root } from "./fs-safe-Cdu9fYG_.js";
import { a as sha256Hex } from "./crypto-digest-IGAbV2KW.js";
import { t as resolveSkillWorkshopConfig } from "./config-Cjp42tXL.js";
import { a as normalizeSkillIndexName } from "./skill-index-DeSp-UjJ.js";
import { n as resolveAllowedSkillSymlinkTargetRealPaths } from "./symlink-targets-HB25TMHt.js";
import { t as bumpSkillsSnapshotVersion } from "./refresh-state-DHnXO3IV.js";
import { A as readWorkspaceSkillFile, C as assertInsideWorkspace, E as isWorkspaceSkillMutationRestored, M as restoreWorkspaceSkillMutation, O as prepareWorkspaceSkillMutation, S as applyWorkspaceSkillMutation, T as isWorkspaceSkillMutationApplied, i as readStoredProposal, y as SKILL_WORKSHOP_ROLLBACK_SCHEMA } from "./store-sqlite-record-CnWWrHoO.js";
import { t as isWorkshopOwnedSkillDir } from "./ownership-DlqNy7D2.js";
import { i as snapshotCommittedSkillArtifactBestEffort, n as hasCommittedSkillChangeHooks, t as dispatchCommittedSkillChangeBestEffort } from "./skill-change-hook-CF_P_oba.js";
import { C as clearSkillProposalRollback, D as createSkillProposalEvent, E as hashSkillProposalContent, F as resolveSkillProposalName, I as stripProposalFrontmatterForSkill, M as hashSkillProposalRevision, N as readProposalFrontmatter, O as dispatchSkillProposalChanged, T as writeSkillProposalRollback, a as readSkillProposal, b as readCommittedSkillProposalTransition, h as withSkillProposalTargetLock, m as withSkillProposalCommitLock, o as readSkillProposalManifest, s as readSkillProposalRecord, t as SkillProposalDraftMissingError, w as readSkillProposalRollback, y as commitPendingSkillProposalTransition } from "./store-BhtJIqk3.js";
import { i as scanSource, r as scanSkillContent } from "./scanner-KOYyW9ao.js";
import path from "node:path";
//#region src/skills/workshop/proposal-bundle.ts
const MAX_EVALUATION_FILES = 256;
const MAX_EVALUATION_FILE_BYTES = 1048576;
const MAX_EVALUATION_BUNDLE_BYTES = 8388608;
const EXCLUDED_ROOT_DIRS = /* @__PURE__ */ new Set([
	".clawhub",
	".clawdhub",
	".openclaw"
]);
async function buildSkillProposalEvaluationBundles(params) {
	const targetFiles = await readSkillTreeFiles(params.proposal.record.target.skillDir);
	const targetTreeSha256 = hashSkillTree(targetFiles);
	const skillMdPath = params.proposal.record.kind === "create" ? "SKILL.md" : resolveTargetSkillRelativePath(params.proposal, targetFiles, { recordedTargetExists: await pathExists(params.proposal.record.target.skillFile) });
	const candidateSkillMd = fileFromBuffer(skillMdPath, Buffer.from(stripProposalFrontmatterForSkill(params.proposal.content), "utf8"));
	const proposedFiles = params.supportFiles.map((file) => fileFromBuffer(file.path, Buffer.from(file.content, "utf8")));
	const candidateFiles = new Map(targetFiles.map((file) => [file.path, file]));
	if (params.proposal.record.kind === "create") {
		if (await pathExists(params.proposal.record.target.skillFile)) throw new Error(`Target skill already exists: ${params.proposal.record.target.skillFile}`);
		candidateFiles.set(candidateSkillMd.path, candidateSkillMd);
		for (const file of proposedFiles) {
			const targetFile = path.join(params.proposal.record.target.skillDir, file.path);
			if (await pathExists(targetFile)) throw new Error(`Target support file already exists: ${targetFile}`);
			candidateFiles.set(file.path, file);
		}
		return {
			candidate: snapshotFromFiles([...candidateFiles.values()], skillMdPath),
			targetTreeSha256
		};
	}
	const baseline = snapshotFromFiles(targetFiles, skillMdPath);
	candidateFiles.set(candidateSkillMd.path, candidateSkillMd);
	for (const file of proposedFiles) candidateFiles.set(file.path, file);
	return {
		baseline,
		candidate: snapshotFromFiles([...candidateFiles.values()], skillMdPath),
		targetTreeSha256
	};
}
async function readSkillProposalTargetTreeSha256(skillDir) {
	return hashSkillTree(await readSkillTreeFiles(skillDir));
}
async function readSkillTreeFiles(skillDir) {
	if (!await pathExists(skillDir)) return [];
	const scanned = await walkDirectory(skillDir, {
		maxDepth: 16,
		maxEntries: MAX_EVALUATION_FILES * 2,
		symlinks: "include"
	});
	if (scanned.truncated) throw new Error(`Skill evaluation bundle exceeds ${MAX_EVALUATION_FILES} files.`);
	const skillRoot = await root(skillDir);
	const files = [];
	let totalBytes = 0;
	for (const entry of scanned.entries.toSorted((a, b) => a.relativePath.localeCompare(b.relativePath))) {
		const portablePath = entry.relativePath.split(path.sep).join("/");
		if (!portablePath || EXCLUDED_ROOT_DIRS.has(portablePath.split("/")[0] ?? "") || entry.kind === "directory") continue;
		if (entry.kind !== "file") throw new Error(`Skill evaluation bundle contains unsupported entry: ${portablePath}`);
		const read = await skillRoot.read(entry.relativePath, {
			hardlinks: "reject",
			maxBytes: MAX_EVALUATION_FILE_BYTES,
			symlinks: "reject"
		});
		totalBytes += read.buffer.byteLength;
		if (totalBytes > MAX_EVALUATION_BUNDLE_BYTES) throw new Error(`Skill evaluation bundle exceeds ${MAX_EVALUATION_BUNDLE_BYTES} total bytes.`);
		files.push(fileFromBuffer(portablePath, read.buffer));
	}
	return files;
}
function fileFromBuffer(relativePath, content) {
	const utf8 = content.toString("utf8");
	const isUtf8 = !utf8.includes("\0") && Buffer.from(utf8, "utf8").equals(content);
	return {
		path: relativePath,
		content: isUtf8 ? utf8 : content.toString("base64"),
		encoding: isUtf8 ? "utf8" : "base64",
		sha256: sha256Hex(content),
		sizeBytes: content.byteLength
	};
}
function snapshotFromFiles(inputFiles, skillMdPath) {
	const files = inputFiles.toSorted((a, b) => a.path.localeCompare(b.path));
	assertEvaluationBundleWithinLimits(files);
	const skillMd = files.find((file) => file.path === skillMdPath);
	if (!skillMd) throw new Error(`Skill evaluation bundle is missing ${skillMdPath}.`);
	return {
		skillMd,
		files: files.filter((file) => file.path !== skillMdPath),
		treeSha256: hashSkillTree(files)
	};
}
function assertEvaluationBundleWithinLimits(files) {
	if (files.length > MAX_EVALUATION_FILES) throw new Error(`Skill evaluation bundle exceeds ${MAX_EVALUATION_FILES} files.`);
	let totalBytes = 0;
	for (const file of files) {
		if (file.sizeBytes > MAX_EVALUATION_FILE_BYTES) throw new Error(`Skill evaluation bundle file exceeds ${MAX_EVALUATION_FILE_BYTES} bytes: ${file.path}.`);
		totalBytes += file.sizeBytes;
	}
	if (totalBytes > MAX_EVALUATION_BUNDLE_BYTES) throw new Error(`Skill evaluation bundle exceeds ${MAX_EVALUATION_BUNDLE_BYTES} total bytes.`);
}
function hashSkillTree(files) {
	return sha256Hex(JSON.stringify(files.toSorted((a, b) => a.path.localeCompare(b.path)).map((file) => ({
		path: file.path,
		sha256: file.sha256,
		sizeBytes: file.sizeBytes
	}))));
}
function resolveTargetSkillRelativePath(proposal, targetFiles, options) {
	const relativePath = path.relative(path.resolve(proposal.record.target.skillDir), path.resolve(proposal.record.target.skillFile));
	if (!relativePath || path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`)) throw new Error("Skill evaluation target file must be inside the skill directory.");
	const portablePath = relativePath.split(path.sep).join("/");
	if (targetFiles.some((file) => file.path === portablePath)) return portablePath;
	if (!options.recordedTargetExists) return portablePath;
	const caseMatches = targetFiles.filter((file) => file.path.toLowerCase() === portablePath.toLowerCase());
	if (caseMatches.length === 1) return caseMatches[0].path;
	if (caseMatches.length > 1) throw new Error(`Skill evaluation target filename is ambiguous: ${portablePath}.`);
	return portablePath;
}
//#endregion
//#region src/skills/workshop/proposal-scan.ts
function scanProposalBundle(content, supportFiles = [], metadata = []) {
	const scannedAt = (/* @__PURE__ */ new Date()).toISOString();
	const findings = [
		...scanSkillContent(content, "PROPOSAL.md"),
		...scanSource(content, "PROPOSAL.md"),
		...supportFiles.flatMap((file) => [
			...scanSkillContent(file.path, "support-file-path").filter((finding) => finding.ruleId === "literal-secret"),
			...scanSkillContent(file.content, file.path),
			...scanSource(file.content, file.path)
		]),
		...metadata.flatMap((entry) => entry.content ? scanSkillContent(entry.content, entry.file).filter((finding) => finding.ruleId === "literal-secret") : [])
	];
	const critical = findings.filter((finding) => finding.severity === "critical").length;
	const warn = findings.filter((finding) => finding.severity === "warn").length;
	const info = findings.filter((finding) => finding.severity === "info").length;
	return {
		state: critical > 0 ? "failed" : "clean",
		scannedAt,
		critical,
		warn,
		info,
		findings
	};
}
function assertProposalContainsNoLiteralSecrets(scan) {
	const finding = scan.findings.find((entry) => entry.ruleId === "literal-secret");
	if (!finding) return;
	throw new Error(`Skill proposal contains a recognized literal credential in ${finding.file}; replace it with a SecretRef or placeholder.`);
}
//#endregion
//#region src/skills/workshop/apply-transition.ts
const SKILL_PROPOSAL_APPLY_TRANSITIONS = {
	pending: {
		apply_failed: "pending",
		apply_succeeded: "applied",
		scan_failed: "quarantined",
		target_changed: "stale"
	},
	applied: {},
	rejected: {},
	quarantined: {},
	stale: {}
};
var SkillProposalLifecycleError = class extends Error {
	constructor(message, record, event) {
		super(message);
		this.record = record;
		this.event = event;
	}
};
function resolveSkillProposalApplyTransition(status, outcome) {
	return SKILL_PROPOSAL_APPLY_TRANSITIONS[status][outcome] ?? null;
}
async function applySkillProposalTransition(input, dependencies) {
	const recoveryReadOptions = input.config ? { config: input.config } : void 0;
	const lockedReadOptions = {
		...input.config ? { config: input.config } : {},
		reconcile: false
	};
	const initial = await dependencies.readRequiredProposal(input.proposalId, input.workspaceDir, input.env, input.agentId, recoveryReadOptions);
	if (initial.record.status !== "pending") throw new Error(`Only pending proposals can be applied. Current status: ${initial.record.status}.`);
	dependencies.assertExpectedRevisionHash(initial.revisionHash, input.expectedRevisionHash);
	let evaluated;
	try {
		evaluated = await dependencies.evaluateSkillProposal({
			workspaceDir: input.workspaceDir,
			...input.agentId ? { agentId: input.agentId } : {},
			...input.eventActor ? { eventActor: input.eventActor } : {},
			...input.env ? { env: input.env } : {},
			proposalId: input.proposalId,
			expectedRevisionHash: initial.revisionHash,
			...input.correlationId ? { correlationId: input.correlationId } : {},
			trigger: "apply"
		});
	} catch (error) {
		if (dependencies.isCreateTargetConflict(error)) await withSkillProposalLifecycleDispatch(input, withSkillProposalTargetLock(initial.record, async () => {
			const current = await dependencies.readRequiredProposal(input.proposalId, input.workspaceDir, input.env, input.agentId, lockedReadOptions);
			if (current.record.status === "pending" && current.record.kind === "create" && await readWorkspaceSkillFile(current.record.target.skillFile) !== null) await markSkillProposalStale({
				record: current.record,
				reason: "Target skill was created after proposal creation.",
				message: "Target skill was created after proposal creation; proposal marked stale.",
				input
			});
			throw error;
		}, storeOptions$1(input.env)));
		throw error;
	}
	const blocking = evaluated.evaluation.outcomes.find((outcome) => outcome.status === "completed" && outcome.result.decision === "block");
	if (blocking?.status === "completed") throw new Error(blocking.result.decisionReason || `Skill proposal apply blocked by evaluator ${blocking.evaluatorId}.`);
	const result = await withSkillProposalLifecycleDispatch(input, withSkillProposalCommitLock(input.workspaceDir, evaluated.record, async () => {
		const read = await dependencies.readRequiredProposal(input.proposalId, input.workspaceDir, input.env, input.agentId, lockedReadOptions);
		const { record, content } = read;
		if (record.status !== "pending") throw new Error(`Only pending proposals can be applied. Current status: ${record.status}.`);
		dependencies.assertExpectedRevisionHash(read.revisionHash, evaluated.evaluation.revisionHash);
		if (hashSkillProposalContent(content) !== record.draftHash) throw new Error("Proposal draft changed without updating proposal metadata.");
		const supportFiles = read.supportFiles ?? [];
		if (!readProposalFrontmatter(content)) throw new Error("Proposal draft must include proposal frontmatter.");
		const scan = scanProposalBundle(content, supportFiles);
		if (scan.state !== "clean") await quarantineSkillProposalAfterScan({
			input,
			record,
			scan
		});
		assertInsideWorkspace(input.workspaceDir, record.target.skillFile, "skill file");
		assertInsideWorkspace(input.workspaceDir, record.target.skillDir, "skill directory");
		const operatorActor = input.eventActor?.type === "gateway" || input.eventActor?.type === "system";
		if (record.kind === "update" && !operatorActor && !isWorkshopOwnedSkillDir(input.workspaceDir, record.target.skillDir, storeOptions$1(input.env))) throw new Error(`Skill Workshop does not own this skill path: ${record.target.skillKey}`);
		const workshopConfig = resolveSkillWorkshopConfig(input.config);
		const symlinkPolicy = {
			allowWrites: workshopConfig.allowSymlinkTargetWrites,
			allowedTargetRealPaths: workshopConfig.allowSymlinkTargetWrites ? resolveAllowedSkillSymlinkTargetRealPaths(input.config) : []
		};
		if (record.evaluation?.id !== evaluated.evaluation.id) throw new Error("Skill proposal evaluation changed before apply; retry the operation.");
		if (evaluated.evaluation.targetTreeSha256) {
			let currentTargetTreeSha256;
			try {
				currentTargetTreeSha256 = await readSkillProposalTargetTreeSha256(record.target.skillDir);
			} catch {
				throw new Error("Skill target changed after evaluation; retry the operation.");
			}
			if (currentTargetTreeSha256 !== evaluated.evaluation.targetTreeSha256) throw new Error("Skill target changed after evaluation; retry the operation.");
		}
		const mutation = await prepareWorkspaceSkillMutation({
			workspaceDir: input.workspaceDir,
			skillDir: record.target.skillDir,
			skillFile: record.target.skillFile,
			content: stripProposalFrontmatterForSkill(content),
			supportFiles,
			mode: record.kind,
			symlinkPolicy
		});
		await assertApplyTargetUnchanged(record, mutation, input);
		const shouldDispatchSkillChange = hasCommittedSkillChangeHooks();
		const beforeSkill = shouldDispatchSkillChange && record.kind === "update" ? await snapshotCommittedSkillArtifactBestEffort({
			skillDir: record.target.skillDir,
			skillKey: record.target.skillKey,
			source: "workshop"
		}) : void 0;
		const rollback = createSkillProposalRollbackFromMutation(record, mutation);
		await writeSkillProposalRollback({
			proposalId: record.id,
			rollback,
			store: storeOptions$1(input.env)
		});
		try {
			await applyWorkspaceSkillMutation(mutation);
		} catch (error) {
			if (await isWorkspaceSkillMutationRestored(mutation).catch(() => false)) await clearSkillProposalRollback({
				proposalId: record.id,
				expectedRecordJson: JSON.stringify(record),
				store: storeOptions$1(input.env)
			}).catch(() => false);
			throw error;
		}
		const afterSkill = shouldDispatchSkillChange ? await snapshotCommittedSkillArtifactBestEffort({
			skillDir: record.target.skillDir,
			skillKey: record.target.skillKey,
			source: "workshop",
			sourceVersion: record.proposedVersion
		}) : void 0;
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const applied = {
			...record,
			status: requiredApplyStatus("apply_succeeded"),
			updatedAt: now,
			appliedAt: now,
			statusReason: normalizeOptionalString(input.reason),
			scan
		};
		const eventInput = createSkillProposalEvent({
			record: applied,
			type: "applied",
			actor: input.eventActor,
			...input.correlationId ? { correlationId: input.correlationId } : {},
			occurredAt: now,
			payload: { targetSkillFile: record.target.skillFile }
		});
		let commit;
		try {
			commit = commitPendingSkillProposalTransition({
				expected: record,
				record: applied,
				event: eventInput,
				store: storeOptions$1(input.env),
				operationLabel: "skill-workshop.apply.commit"
			});
		} catch (error) {
			const recoveredEvent = await recoverAfterApplyCommitFailure({
				error,
				expected: record,
				applied,
				event: eventInput,
				mutation,
				env: input.env,
				workspaceDir: input.workspaceDir
			});
			if (!recoveredEvent) throw error;
			commit = {
				state: "committed",
				event: recoveredEvent
			};
		}
		if (commit.state === "conflict") {
			const error = /* @__PURE__ */ new Error("Skill proposal changed before apply status commit.");
			const recoveredEvent = await recoverAfterApplyCommitFailure({
				error,
				expected: record,
				applied,
				event: eventInput,
				mutation,
				env: input.env,
				workspaceDir: input.workspaceDir
			});
			if (!recoveredEvent) throw error;
			commit = {
				state: "committed",
				event: recoveredEvent
			};
		}
		bumpSkillsSnapshotVersion({
			workspaceDir: input.workspaceDir,
			reason: "workshop",
			changedPath: record.target.skillFile
		});
		return {
			result: {
				record: applied,
				targetSkillFile: record.target.skillFile
			},
			event: commit.event,
			skillChange: shouldDispatchSkillChange ? {
				before: beforeSkill,
				after: afterSkill
			} : void 0
		};
	}, storeOptions$1(input.env)));
	await dispatchSkillProposalChanged({
		event: result.event,
		record: result.result.record,
		workspaceDir: input.workspaceDir,
		...input.agentId ? { agentId: input.agentId } : {}
	});
	if (result.skillChange) await dispatchCommittedSkillChangeBestEffort({
		action: result.result.record.kind === "create" ? "created" : "updated",
		source: "workshop",
		workspaceDir: input.workspaceDir,
		before: result.skillChange.before,
		after: result.skillChange.after,
		proposal: {
			id: result.result.record.id,
			revision: result.result.record.proposedVersion,
			revisionSha256: hashSkillProposalRevision(result.result.record)
		}
	});
	return result.result;
}
async function withSkillProposalLifecycleDispatch(input, operation) {
	try {
		return await operation;
	} catch (error) {
		if (error instanceof SkillProposalLifecycleError) await dispatchSkillProposalChanged({
			event: error.event,
			record: error.record,
			workspaceDir: input.workspaceDir,
			...input.agentId ? { agentId: input.agentId } : {}
		});
		throw error;
	}
}
async function assertSkillProposalSupportTargetUnchanged(params) {
	const { record, file, currentContent } = params;
	if (file.targetExisted === false && currentContent !== null) await markSkillProposalStale({
		record,
		reason: `Target support file changed after proposal creation: ${file.path}`,
		message: "Target support file changed after proposal creation; proposal marked stale.",
		input: params.input
	});
	if (file.targetExisted === true) {
		if ((currentContent === null ? void 0 : hashSkillProposalContent(currentContent)) !== file.targetContentHash) await markSkillProposalStale({
			record,
			reason: `Target support file changed after proposal creation: ${file.path}`,
			message: "Target support file changed after proposal creation; proposal marked stale.",
			input: params.input
		});
	}
}
function transitionPendingSkillProposalToStale(params) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const stale = {
		...params.record,
		status: requiredApplyStatus("target_changed"),
		updatedAt: now,
		staleAt: now,
		statusReason: params.reason
	};
	const commit = commitPendingSkillProposalTransition({
		expected: params.record,
		record: stale,
		event: createSkillProposalEvent({
			record: stale,
			type: "stale",
			actor: params.input.eventActor,
			...params.input.correlationId ? { correlationId: params.input.correlationId } : {},
			occurredAt: now
		}),
		store: storeOptions$1(params.input.env),
		operationLabel: "skill-workshop.stale.commit"
	});
	if (commit.state !== "committed") throw new Error("Failed to record stale Skill Workshop proposal.");
	return {
		record: stale,
		event: commit.event
	};
}
async function markSkillProposalStale(params) {
	const transition = transitionPendingSkillProposalToStale(params);
	throw new SkillProposalLifecycleError(params.message, transition.record, transition.event);
}
function createSkillProposalRollback(params) {
	return {
		schema: SKILL_WORKSHOP_ROLLBACK_SCHEMA,
		proposalId: params.proposalId,
		writtenAt: (/* @__PURE__ */ new Date()).toISOString(),
		targetSkillFile: params.targetSkillFile,
		action: params.action,
		...params.previousContent !== void 0 ? {
			previousContent: params.previousContent,
			previousContentHash: hashSkillProposalContent(params.previousContent)
		} : {},
		...params.supportFiles && params.supportFiles.length > 0 ? { supportFiles: params.supportFiles } : {}
	};
}
async function quarantineSkillProposalAfterScan(params) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const updated = {
		...params.record,
		status: requiredApplyStatus("scan_failed"),
		updatedAt: now,
		quarantinedAt: now,
		scan: {
			...params.scan,
			state: "quarantined"
		},
		statusReason: "Proposal scan failed."
	};
	const commit = commitPendingSkillProposalTransition({
		expected: params.record,
		record: updated,
		event: createSkillProposalEvent({
			record: updated,
			type: "quarantined",
			actor: params.input.eventActor,
			...params.input.correlationId ? { correlationId: params.input.correlationId } : {},
			occurredAt: now
		}),
		store: storeOptions$1(params.input.env),
		operationLabel: "skill-workshop.quarantine.commit"
	});
	if (commit.state !== "committed") throw new Error("Failed to record quarantined Skill Workshop proposal.");
	throw new SkillProposalLifecycleError("Proposal scan failed; proposal was quarantined.", updated, commit.event);
}
async function assertApplyTargetUnchanged(record, mutation, input) {
	if (record.kind === "update" && record.target.currentContentHash && mutation.skillFile.previousContent !== null && hashSkillProposalContent(mutation.skillFile.previousContent) !== record.target.currentContentHash) await markSkillProposalStale({
		record,
		reason: "Target skill changed after proposal creation.",
		message: "Target skill changed after proposal creation; proposal marked stale.",
		input
	});
	for (const file of mutation.supportFiles) {
		const supportRecord = record.supportFiles?.find((entry) => entry.path === file.path);
		if (record.kind === "update" && supportRecord) await assertSkillProposalSupportTargetUnchanged({
			record,
			file: supportRecord,
			currentContent: file.previousContent,
			input
		});
	}
}
function createSkillProposalRollbackFromMutation(record, mutation) {
	return createSkillProposalRollback({
		proposalId: record.id,
		targetSkillFile: record.target.skillFile,
		action: record.kind,
		...mutation.skillFile.previousContent !== null ? { previousContent: mutation.skillFile.previousContent } : {},
		...mutation.supportFiles.length > 0 ? { supportFiles: mutation.supportFiles.map((file) => file.previousContent === null ? {
			path: file.path,
			existed: false
		} : {
			path: file.path,
			existed: true,
			previousContent: file.previousContent,
			previousContentHash: hashSkillProposalContent(file.previousContent)
		}) } : {}
	});
}
async function recoverAfterApplyCommitFailure(params) {
	const committed = readCommittedSkillProposalTransition({
		record: params.applied,
		event: params.event,
		store: storeOptions$1(params.env)
	});
	if (committed) return committed.event;
	if (readStoredProposal(params.expected.id, storeOptions$1(params.env))?.record.status === "applied") throw new Error("Applied Skill Workshop transition is missing its committed event.", { cause: params.error });
	requiredApplyStatus("apply_failed");
	if (!await isWorkspaceSkillMutationApplied(params.mutation).catch(() => false)) return null;
	try {
		try {
			await restoreWorkspaceSkillMutation(params.mutation);
		} finally {
			bumpSkillsSnapshotVersion({
				workspaceDir: params.workspaceDir,
				reason: "workshop",
				changedPath: params.expected.target.skillFile
			});
		}
	} catch (restoreError) {
		const failure = new Error("Skill proposal apply failed after filesystem mutation and requires reconciliation.", { cause: params.error });
		Object.assign(failure, { restoreError });
		throw failure;
	}
	await clearSkillProposalRollback({
		proposalId: params.expected.id,
		expectedRecordJson: JSON.stringify(params.expected),
		store: storeOptions$1(params.env)
	}).catch(() => false);
	return null;
}
function requiredApplyStatus(outcome) {
	const status = resolveSkillProposalApplyTransition("pending", outcome);
	if (!status) throw new Error(`Invalid pending Skill Workshop apply transition: ${outcome}`);
	return status;
}
function storeOptions$1(env) {
	return env ? { env } : {};
}
//#endregion
//#region src/skills/workshop/service-query.ts
function storeOptions(env) {
	return env ? { env } : {};
}
function proposalScope(options) {
	return {
		...options.agentId ? { agentId: options.agentId } : {},
		...options.workspaceDir ? { workspaceDir: options.workspaceDir } : {}
	};
}
async function listSkillProposals(options = {}) {
	const store = storeOptions(options.env);
	const scope = proposalScope(options);
	const manifest = await readSkillProposalManifest(store, scope);
	const missingDrafts = /* @__PURE__ */ new Set();
	for (const proposal of manifest.proposals) {
		if (proposal.kind !== "create" || proposal.status !== "pending") continue;
		let read;
		try {
			read = await readSkillProposal(proposal.id, store, scope);
		} catch (error) {
			if (!(error instanceof SkillProposalDraftMissingError)) throw error;
			missingDrafts.add(error.proposalId);
			continue;
		}
		if (read) await reconcilePendingCreateProposal(read, options);
	}
	const reconciled = await readSkillProposalManifest(store, scope);
	for (const proposal of reconciled.proposals) if (missingDrafts.has(proposal.id)) proposal.degradedState = "draft-missing";
	return reconciled;
}
async function getSkillProposalRunProgress(options) {
	const store = storeOptions(options.env);
	const manifest = await readSkillProposalManifest(store, options);
	const ids = [];
	let mutationCount = 0;
	for (const proposal of manifest.proposals) {
		const record = await readSkillProposalRecord(proposal.id, store, options);
		if (!record) continue;
		if (record.origin?.runId === options.runId || record.originRunIds?.includes(options.runId)) {
			ids.push(record.id);
			mutationCount += record.originRunMutationCounts?.[options.runId] ?? 1;
		}
	}
	return {
		mutationCount,
		proposalIds: ids
	};
}
async function inspectSkillProposal(proposalId, options = {}) {
	const read = await readSkillProposal(proposalId, storeOptions(options.env), proposalScope(options));
	if (!read) return null;
	return await reconcilePendingCreateProposal(read, options);
}
async function resolvePendingSkillProposal(input) {
	const proposalId = normalizeOptionalString(input.proposalId);
	if (proposalId) {
		const direct = await reconcilePendingCreateProposal(await readRequiredProposal(proposalId, input.workspaceDir, input.env, input.agentId), input);
		if (direct.record.status !== "pending") throw new Error(`Only pending proposals can be revised. Current status: ${direct.record.status}.`);
		return direct;
	}
	const name = normalizeOptionalString(input.name);
	if (!name) throw new Error("proposal_id or name required.");
	const matches = (await listSkillProposals({
		agentId: input.agentId,
		workspaceDir: input.workspaceDir,
		env: input.env
	})).proposals.filter((proposal) => proposal.status === "pending" && proposalMatchesName(proposal, name));
	if (matches.length === 0) throw new Error(`No pending skill proposal matched: ${name}`);
	if (matches.length > 1) {
		const candidates = matches.slice(0, 8).map((proposal) => `${proposal.id} (${resolveSkillProposalName(proposal.kind, proposal)})`).join(", ");
		throw new Error(`Multiple pending skill proposals matched ${name}: ${candidates}`);
	}
	const matched = await reconcilePendingCreateProposal(await readRequiredProposal(expectDefined(matches[0], "matches capture group 0").id, input.workspaceDir, input.env, input.agentId), input);
	if (matched.record.status !== "pending") throw new Error(`Only pending proposals can be revised. Current status: ${matched.record.status}.`);
	return matched;
}
async function readRequiredProposal(proposalId, workspaceDir, env, agentId, readOptions = {}) {
	const read = await readSkillProposal(proposalId, storeOptions(env), {
		...agentId ? { agentId } : {},
		...workspaceDir ? { workspaceDir } : {}
	}, readOptions);
	if (!read) throw new Error(`Skill proposal not found: ${proposalId}`);
	return read;
}
async function reconcilePendingCreateProposal(read, options) {
	const workspaceDir = options.workspaceDir;
	if (!workspaceDir || read.record.kind !== "create" || read.record.status !== "pending") return read;
	const resolvedWorkspaceDir = path.resolve(workspaceDir);
	const resolvedTarget = path.resolve(read.record.target.skillFile);
	if (options.agentId && resolvedTarget !== resolvedWorkspaceDir && !isPathInside(resolvedWorkspaceDir, resolvedTarget)) return read;
	const store = storeOptions(options.env);
	const scope = proposalScope(options);
	const reconciled = await withSkillProposalCommitLock(workspaceDir, read.record, async () => {
		const current = await readSkillProposal(read.record.id, store, scope, { reconcile: false });
		if (!current || current.record.kind !== "create" || current.record.status !== "pending") return { read: current ?? read };
		assertInsideWorkspace(workspaceDir, current.record.target.skillFile, "skill file");
		if (await readSkillProposalRollback(current.record.id, store)) return { read: current };
		if (await readWorkspaceSkillFile(current.record.target.skillFile) === null) return { read: current };
		const transition = transitionPendingSkillProposalToStale({
			record: current.record,
			reason: "Target skill was created after proposal creation.",
			input: {
				workspaceDir,
				...options.agentId ? { agentId: options.agentId } : {},
				eventActor: { type: "system" },
				...options.env ? { env: options.env } : {}
			}
		});
		return {
			read: {
				...current,
				record: transition.record,
				revisionHash: hashSkillProposalRevision(transition.record)
			},
			transition
		};
	}, store);
	if (reconciled.transition) await dispatchSkillProposalChanged({
		event: reconciled.transition.event,
		record: reconciled.transition.record,
		workspaceDir,
		...options.agentId ? { agentId: options.agentId } : {}
	});
	return reconciled.read;
}
function proposalMatchesName(proposal, name) {
	const normalizedName = normalizeSkillIndexName(name);
	return [
		proposal.id,
		proposal.skillName,
		proposal.skillKey,
		proposal.title,
		proposal.description
	].some((candidate) => {
		if (!candidate) return false;
		if (candidate === name || candidate.toLowerCase() === name.toLowerCase()) return true;
		const normalizedCandidate = normalizeSkillIndexName(candidate);
		return Boolean(normalizedName && normalizedCandidate && (normalizedCandidate === normalizedName || normalizedCandidate.includes(normalizedName) || normalizedName.includes(normalizedCandidate)));
	});
}
//#endregion
export { resolvePendingSkillProposal as a, markSkillProposalStale as c, scanProposalBundle as d, buildSkillProposalEvaluationBundles as f, readRequiredProposal as i, withSkillProposalLifecycleDispatch as l, inspectSkillProposal as n, applySkillProposalTransition as o, readSkillProposalTargetTreeSha256 as p, listSkillProposals as r, assertSkillProposalSupportTargetUnchanged as s, getSkillProposalRunProgress as t, assertProposalContainsNoLiteralSecrets as u };
