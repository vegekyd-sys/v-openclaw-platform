import { isAbsolute, join, resolve } from "node:path";

export function normalizeSkillTelemetrySource(value) {
  const source = typeof value === "string" ? value.trim() : "";
  if (source === "bundled" || source === "openclaw-bundled") {
    return "bundled";
  }
  if (
    source === "workspace" ||
    source === "openclaw-workspace" ||
    source === "openclaw-managed" ||
    source === "openclaw-extra" ||
    source === "agents-skills-personal" ||
    source === "agents-skills-project"
  ) {
    return "workspace";
  }
  return "unknown";
}

function skillFile(skill) {
  const filePath =
    typeof skill?.filePath === "string" ? skill.filePath.trim() : "";
  if (filePath && isAbsolute(filePath)) return resolve(filePath);
  const baseDir =
    typeof skill?.baseDir === "string" ? skill.baseDir.trim() : "";
  if (baseDir && isAbsolute(baseDir)) return resolve(join(baseDir, "SKILL.md"));
  return undefined;
}

export function buildSkillTelemetryIndex(skillsSnapshot) {
  const resolvedSkills = Array.isArray(skillsSnapshot?.resolvedSkills)
    ? skillsSnapshot.resolvedSkills
    : [];
  return resolvedSkills.flatMap((skill) => {
    const name = typeof skill?.name === "string" ? skill.name.trim() : "";
    const file = skillFile(skill);
    if (!name || !file) return [];
    return [
      {
        name,
        source: normalizeSkillTelemetrySource(
          skill.source ?? skill.sourceInfo?.source,
        ),
        skillFile: file,
      },
    ];
  });
}

export function resolveSkillTelemetryEntry(index, event) {
  const name =
    typeof event?.skillName === "string" ? event.skillName.trim() : "";
  if (!name || !Array.isArray(index)) return undefined;
  const candidates = index.filter((entry) => entry?.name === name);
  const source = normalizeSkillTelemetrySource(event.skillSource);
  return (
    candidates.find((entry) => entry.source === source) ??
    (candidates.length === 1 ? candidates[0] : undefined)
  );
}

export function buildRelayedSkillUsageEvent(options) {
  const event = options.event;
  const request = options.request;
  if (event?.type !== "skill.used") return undefined;
  const entry = resolveSkillTelemetryEntry(options.skillTelemetryIndex, event);
  if (!entry) return undefined;
  const runId =
    typeof event.runId === "string" && event.runId.trim()
      ? event.runId.trim()
      : request?.runId;
  const sessionKey =
    typeof event.sessionKey === "string" && event.sessionKey.trim()
      ? event.sessionKey.trim()
      : request?.sessionKey;
  const eventIdentity =
    typeof event.toolCallId === "string" && event.toolCallId.trim()
      ? event.toolCallId.trim()
      : `seq-${String(event.seq ?? "unknown")}`;
  if (!runId || !sessionKey) return undefined;
  return {
    contractVersion: options.contractVersion,
    eventKind: "skill_usage",
    eventId: `skill.used:${runId}:${eventIdentity}:${entry.name}`,
    taskKey: `skill:${runId}`,
    usage: {
      runId,
      sessionKey,
      sessionId: event.sessionId ?? request?.sessionId,
      agentId: event.agentId ?? request?.agentId,
      skillName: entry.name,
      skillSource: entry.source,
      skillFile: entry.skillFile,
      activation: event.activation,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
    },
  };
}
