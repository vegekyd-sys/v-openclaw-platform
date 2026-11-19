import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { r as tryRealpath } from "./symlink-targets-HB25TMHt.js";
import { A as readWorkspaceSkillFile, C as assertInsideWorkspace } from "./store-sqlite-record-CnWWrHoO.js";
import { n as listWorkshopOwnedSkillDirs } from "./ownership-DlqNy7D2.js";
import { n as resolveSkillStatusEntry, t as buildWorkspaceSkillStatus } from "./status-CSqJ7Gep.js";
import fs from "node:fs";
import path from "node:path";
//#region src/skills/workshop/workspace-skill-read.ts
const WRITABLE_WORKSPACE_SOURCES = /* @__PURE__ */ new Set(["openclaw-workspace", "agents-skills-project"]);
function assertWritableSkillTarget(workspaceDir, skill) {
	if (!WRITABLE_WORKSPACE_SOURCES.has(skill.source)) throw new Error(`Skill source is not writable by Skill Workshop: ${skill.source}`);
	assertInsideWorkspace(workspaceDir, skill.filePath, "skill file");
	assertInsideWorkspace(workspaceDir, skill.baseDir, "skill directory");
	if (path.basename(skill.filePath) !== "SKILL.md") throw new Error("Skill Workshop can only update SKILL.md targets.");
}
function isWorkspaceOwnedSkillTarget(workspaceDir, skill) {
	const workspaceRealPath = tryRealpath(path.resolve(workspaceDir));
	const skillRealPath = tryRealpath(path.resolve(skill.baseDir));
	return Boolean(workspaceRealPath && skillRealPath && isPathInside(workspaceRealPath, skillRealPath));
}
/**
* Lists the workspace skills the workshop can target with update proposals, using the same
* status discovery as `proposeUpdateSkill` so callers that route learnings to existing
* skills stay in lockstep with what an update can actually write.
*/
// skill-review-bounded-v1: SKILL.md already over the 10,000-character autonomous cap; a change may only shrink it.
function exceedsAutonomousSkillSizeCap(filePath) {
	try {
		if (fs.statSync(filePath).size <= 1e4) return false;
		return fs.readFileSync(filePath, "utf8").length > 1e4;
	} catch {
		return false;
	}
}
function listWritableWorkspaceSkillSummaries(workspaceDir, opts) {
	const status = buildWorkspaceSkillStatus(workspaceDir, {
		config: opts?.config,
		agentId: opts?.agentId
	});
	const ownedDirs = listWorkshopOwnedSkillDirs(workspaceDir, opts?.env ? { env: opts.env } : {});
	return status.skills.filter((skill) => WRITABLE_WORKSPACE_SOURCES.has(skill.source)).map((skill) => ({
		name: skill.name,
		description: skill.description,
		filePath: skill.filePath,
		userAuthored: !ownedDirs.has(path.resolve(skill.baseDir)),
		...exceedsAutonomousSkillSizeCap(skill.filePath) ? { atSizeCap: true } : {}
	}));
}
/** Reads the live SKILL.md of a writable workspace skill, resolved like an update target. */
async function readWritableWorkspaceSkill(workspaceDir, skillName, opts) {
	const name = normalizeOptionalString(skillName);
	if (!name) throw new Error("Skill name is required.");
	const status = buildWorkspaceSkillStatus(workspaceDir, {
		config: opts?.config,
		agentId: opts?.agentId
	});
	const targetSkill = resolveSkillStatusEntry(status.skills, name);
	if (!targetSkill) throw new Error(`Skill not found: ${name}`);
	assertWritableSkillTarget(workspaceDir, targetSkill);
	const content = await readWorkspaceSkillFile(targetSkill.filePath);
	if (content === null) throw new Error(`Skill file is missing: ${targetSkill.filePath}`);
	return {
		skillName: targetSkill.name,
		skillKey: targetSkill.skillKey,
		skillFile: targetSkill.filePath,
		content
	};
}
//#endregion
export { readWritableWorkspaceSkill as i, isWorkspaceOwnedSkillTarget as n, listWritableWorkspaceSkillSummaries as r, assertWritableSkillTarget as t };
