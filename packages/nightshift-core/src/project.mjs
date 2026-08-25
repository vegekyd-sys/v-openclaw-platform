export function validateProjectRequest(release, project) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,30}$/.test(project?.id ?? "")) {
    throw new Error("Project id must be 1-31 characters using letters, numbers, dots, underscores, or hyphens");
  }
  if (typeof project.name !== "string" || !project.name.trim()) {
    throw new Error("Project name is required");
  }
  if (!release?.metadata?.workflowSha256) {
    throw new Error(`Unknown workflow release ${project.workflowSha256 ?? ""}`.trim());
  }
  const inputs = project.inputs ?? {};
  for (const [name, contract] of Object.entries(release.spec.inputs ?? {})) {
    const value = inputs[name];
    if (contract.required && (value === undefined || value === null || value === "")) {
      throw new Error(`Required project input is missing: ${name}`);
    }
    if (value === undefined || value === null) continue;
    if (!inputMatchesType(value, contract.type)) {
      throw new Error(`Project input ${name} must be ${contract.type}`);
    }
    if (contract.type === "object" && Array.isArray(contract.requiredProperties)) {
      const missing = contract.requiredProperties.filter((property) => missingValue(value[property]));
      if (missing.length > 0) {
        throw new Error(`Project input ${name} is missing required properties: ${missing.join(", ")}`);
      }
    }
  }
  const roles = new Set(
    (release.spec.stages ?? [])
      .filter((stage) => stage.actor === "agent")
      .map((stage) => stage.agentRole ?? release.spec.ownerAgentRole),
  );
  for (const role of roles) {
    if (typeof project.agentBindings?.[role] !== "string" || !project.agentBindings[role].trim()) {
      throw new Error(`Agent binding is required for role ${role}`);
    }
  }
  project.collaboration = normalizeProjectCollaboration(project.collaboration);
  return project;
}

export function normalizeProjectCollaboration(value = {}) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project collaboration must be an object");
  }
  const createdByOpenId = optionalId(value.createdByOpenId, "createdByOpenId", /^ou_[A-Za-z0-9_-]+$/);
  const sourceChatId = optionalId(
    value.sourceChatId,
    "sourceChatId",
    /^(?:oc_[A-Za-z0-9_-]+|(?:user:)?ou_[A-Za-z0-9_-]+)$/,
  );
  const reviewers = uniqueIds(value.reviewers, "reviewers", /^ou_[A-Za-z0-9_-]+$/);
  const followers = uniqueIds(value.followers, "followers", /^ou_[A-Za-z0-9_-]+$/);
  const feishuAccountId = optionalId(value.feishuAccountId, "feishuAccountId", /^[A-Za-z0-9._-]+$/);
  if ((createdByOpenId && !sourceChatId) || (!createdByOpenId && sourceChatId)) {
    throw new Error("Project collaboration requires both createdByOpenId and sourceChatId");
  }
  return {
    ...(createdByOpenId ? { createdByOpenId } : {}),
    ...(sourceChatId ? { sourceChatId } : {}),
    ...(reviewers.length > 0 ? { reviewers } : {}),
    ...(followers.length > 0 ? { followers } : {}),
    ...(feishuAccountId ? { feishuAccountId } : {}),
  };
}

function missingValue(value) {
  return value === undefined || value === null || value === "";
}

export function requiredSkillsByRole(release) {
  const result = new Map();
  const defaultRole = release?.spec?.ownerAgentRole;
  for (const stage of release?.spec?.stages ?? []) {
    if (stage.actor !== "agent") continue;
    const role = stage.agentRole ?? defaultRole;
    if (!role) continue;
    const required = result.get(role) ?? new Set();
    for (const skill of stage.skills ?? []) required.add(skill);
    for (const strategy of Object.values(stage.routeStrategies ?? {})) {
      for (const skill of strategy.skills ?? []) required.add(skill);
    }
    result.set(role, required);
  }
  return Object.fromEntries(
    [...result.entries()].map(([role, skills]) => [role, [...skills].sort()]),
  );
}

function inputMatchesType(value, type) {
  if (!type) return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function optionalId(value, name, pattern) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 200 || !pattern.test(value)) {
    throw new Error(`Project collaboration ${name} is invalid`);
  }
  return value;
}

function uniqueIds(value, name, pattern) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error(`Project collaboration ${name} must be an array with at most 50 entries`);
  }
  return [...new Set(value.map((entry) => optionalId(entry, name, pattern)))].filter(Boolean);
}
