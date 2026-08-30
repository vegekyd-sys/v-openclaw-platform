import { isProjectSandboxContextAllowed } from "./tools.js";

export function createProjectSandboxPromptContribution(context, config = {}) {
  if (!isProjectSandboxContextAllowed(context, config)) return undefined;

  const projects = Object.entries(config.projects ?? {})
    .filter(([projectId, project]) => projectId && project && typeof project === "object")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([projectId, project]) => `- ${projectId}: ${String(project.description ?? "Approved project")}`)
    .join("\n");

  return {
    appendSystemContext: [
      "[Project Sandbox routing]",
      "For create/change/debug/build/test/dependency-install/run work on an approved project, use project_sandbox_open before native host file or command tools, then use project_sandbox_files, project_sandbox_exec, and project_sandbox_finish.",
      "Keep ordinary conversation, read-only Session or Memory lookup, and non-project work on the normal Agent path.",
      "If no matching project is approved or the Sandbox path fails, do not silently write or execute against the Gateway host project; explain the boundary instead.",
      "Sandbox completion returns a reviewable patch. Merge, push, deploy, publication, and other production writes still require their normal approval.",
      "Approved projects:",
      projects || "- none",
    ].join("\n"),
  };
}
