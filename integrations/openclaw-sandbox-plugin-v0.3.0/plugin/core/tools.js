import { createHash } from "node:crypto";

import { resolveTrustedActor } from "./identity.js";

const WORKSPACE_TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);

export const TOOL_NAMES = ["project_sandbox_open", "project_sandbox_files", "project_sandbox_exec", "project_sandbox_finish"];

const openSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ["list", "open", "status"] },
    projectId: { type: "string", minLength: 1, maxLength: 64 },
    request: { type: "string", maxLength: 4000 },
    workspaceId: { type: "string", minLength: 8, maxLength: 80 },
    fencingToken: { type: "string", minLength: 8, maxLength: 128 },
  },
};

const filesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "fencingToken", "action"],
  properties: {
    workspaceId: { type: "string", minLength: 8, maxLength: 80 },
    fencingToken: { type: "string", minLength: 8, maxLength: 128 },
    action: { type: "string", enum: ["list", "read", "write", "patch"] },
    path: { type: "string", maxLength: 4096 },
    content: { type: "string", maxLength: 1000000 },
    patch: { type: "string", maxLength: 2000000 },
    maxBytes: { type: "integer", minimum: 1, maximum: 1000000 },
  },
};

const execSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "fencingToken", "action"],
  properties: {
    workspaceId: { type: "string", minLength: 8, maxLength: 80 },
    fencingToken: { type: "string", minLength: 8, maxLength: 128 },
    action: { type: "string", enum: ["start", "status", "cancel"] },
    command: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: { type: "string", minLength: 1, maxLength: 4096 },
    },
    operationId: { type: "string", minLength: 8, maxLength: 80 },
    timeoutSeconds: { type: "integer", minimum: 1, maximum: 86400 },
    maxBytes: { type: "integer", minimum: 1, maximum: 1000000 },
  },
};

const finishSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "fencingToken", "action"],
  properties: {
    workspaceId: { type: "string", minLength: 8, maxLength: 80 },
    fencingToken: { type: "string", minLength: 8, maxLength: 128 },
    action: { type: "string", enum: ["finish", "cancel"] },
    collect: {
      type: "array",
      maxItems: 32,
      items: { type: "string", minLength: 1, maxLength: 4096 },
    },
  },
};

export function createSandboxTools(context, { broker, config, logger = console }) {
  const actor = () => resolveTrustedActor(context, config);
  const projectEntries = normalizedProjects(config.projects);

  return [
    {
      name: "project_sandbox_open",
      label: "Project Sandbox Open",
      description:
        "List approved projects, open one persistent Broker-managed Sandbox for this Session, or check its status. Use this before project_sandbox_files or project_sandbox_exec. Never ask for a host path.",
      parameters: openSchema,
      async execute(toolCallId, params, signal) {
        const trusted = actor();
        if (params.action === "list") {
          return toolResult({
            projects: projectEntries.map(([projectId, project]) => ({ projectId, description: project.description ?? "Approved project" })),
          });
        }
        if (params.action === "status") {
          requireWorkspaceCredentials(params);
          const result = await broker.request(`/workspaces/${encodeURIComponent(params.workspaceId)}/status`, {
            method: "POST",
            body: { actor: { ...trusted, fencingToken: params.fencingToken } },
            signal,
          });
          return toolResult({ workspace: sanitizeWorkspace(result.workspace) });
        }

        const [projectId, project] = requireProject(projectEntries, params.projectId);
        const opened = await broker.request("/workspaces", {
          method: "POST",
          body: {
            owner: trusted.owner,
            session: trusted.session,
            request: String(params.request ?? "Open a project development workspace"),
            idempotencyKey: stableKey("workspace", trusted.session, toolCallId, projectId),
            projectPath: project.path,
            cpu: project.cpu ?? "1",
            memory: project.memory ?? "2Gi",
            networkProfile: project.networkProfile ?? "offline",
            leaseSeconds: project.leaseSeconds ?? 900,
          },
          signal,
        });
        let workspace = opened.workspace;
        const deadline = Date.now() + Number(config.openWaitMs ?? 45000);
        while (!WORKSPACE_TERMINAL.has(workspace.status) && workspace.status !== "active" && Date.now() < deadline) {
          await abortableDelay(250, signal);
          const status = await broker.request(`/workspaces/${encodeURIComponent(workspace.id)}/status`, {
            method: "POST",
            body: { actor: { ...trusted, fencingToken: workspace.fencingToken } },
            signal,
          });
          workspace = status.workspace;
        }
        logger.info?.(`project-sandbox open ${workspace.id} status=${workspace.status} existing=${opened.existing === true}`);
        return toolResult({
          workspace: sanitizeWorkspace(workspace),
          existing: opened.existing === true,
          instruction: workspace.status === "active"
            ? "Keep workspaceId and fencingToken for project_sandbox_files, project_sandbox_exec, and project_sandbox_finish."
            : "The workspace is not ready yet; call project_sandbox_open with action=status.",
        });
      },
    },
    {
      name: "project_sandbox_files",
      label: "Project Sandbox Files",
      description:
        "List, read, write, or apply a unified patch inside the current Session's opened Sandbox. Paths are always relative to the approved project root.",
      parameters: filesSchema,
      async execute(_toolCallId, params, signal) {
        const trusted = actor();
        requireWorkspaceCredentials(params);
        const input = { action: params.action };
        for (const key of ["path", "content", "patch", "maxBytes"]) if (params[key] !== undefined) input[key] = params[key];
        const result = await broker.request(`/workspaces/${encodeURIComponent(params.workspaceId)}/files`, {
          method: "POST",
          body: { input, actor: { ...trusted, fencingToken: params.fencingToken } },
          signal,
        });
        return toolResult({ workspace: sanitizeWorkspace(result.workspace), result: result.result });
      },
    },
    {
      name: "project_sandbox_exec",
      label: "Project Sandbox Execute",
      description:
        "Start, poll, or cancel an argv command in the current Session's Sandbox. start returns quickly with operationId; poll status until terminal. Long commands continue independently of the OpenClaw tool-call timeout.",
      parameters: execSchema,
      async execute(toolCallId, params, signal) {
        const trusted = actor();
        requireWorkspaceCredentials(params);
        const input = { action: params.action };
        if (params.action === "start") {
          input.command = params.command;
          input.timeoutSeconds = params.timeoutSeconds ?? 3600;
          input.idempotencyKey = stableKey("exec", trusted.session, toolCallId, params.workspaceId);
        } else {
          input.operationId = params.operationId;
          input.maxBytes = params.maxBytes ?? 200000;
        }
        const result = await broker.request(`/workspaces/${encodeURIComponent(params.workspaceId)}/exec`, {
          method: "POST",
          body: { input, actor: { ...trusted, fencingToken: params.fencingToken } },
          signal,
        });
        return toolResult({
          workspace: sanitizeWorkspace(result.workspace),
          operation: result.operation,
          existing: result.existing,
          instruction: result.operation?.status === "running" || result.operation?.status === "starting"
            ? "Call project_sandbox_exec with action=status and this operationId later."
            : undefined,
        });
      },
    },
    {
      name: "project_sandbox_finish",
      label: "Project Sandbox Finish",
      description:
        "Finish or cancel the current Session's Sandbox. finish returns a reviewable Git patch and artifact hashes; it never merges, pushes, deploys, publishes, or writes production.",
      parameters: finishSchema,
      async execute(_toolCallId, params, signal) {
        const trusted = actor();
        requireWorkspaceCredentials(params);
        const endpoint = params.action === "cancel" ? "cancel" : "finish";
        const result = await broker.request(`/workspaces/${encodeURIComponent(params.workspaceId)}/${endpoint}`, {
          method: "POST",
          body: {
            ...(params.action === "finish" ? { input: { collect: params.collect ?? [] } } : {}),
            actor: { ...trusted, fencingToken: params.fencingToken },
          },
          signal,
        });
        return toolResult({
          workspace: sanitizeWorkspace(result.workspace),
          result: sanitizeFinishResult(result.result),
          instruction: params.action === "finish"
            ? "Review and apply the returned patch outside the Sandbox. Merge, push, deploy, publication, and production writes still require their normal approval."
            : undefined,
        });
      },
    },
  ];
}

function normalizedProjects(projects) {
  if (!projects || typeof projects !== "object" || Array.isArray(projects)) throw new Error("Project Sandbox has no approved project registry");
  return Object.entries(projects).sort(([left], [right]) => left.localeCompare(right));
}

function requireProject(entries, requestedId) {
  const projectId = String(requestedId ?? "").trim();
  const match = entries.find(([id]) => id === projectId);
  if (!match) throw new Error(`Unknown approved projectId: ${projectId || "<empty>"}`);
  if (!match[1] || typeof match[1].path !== "string" || !match[1].path.trim()) throw new Error(`Project ${projectId} has no operator-configured path`);
  return match;
}

function requireWorkspaceCredentials(params) {
  if (!params.workspaceId || !params.fencingToken) throw new Error("workspaceId and fencingToken are required");
}

function sanitizeWorkspace(workspace = {}) {
  return {
    id: workspace.id,
    status: workspace.status,
    phase: workspace.phase,
    createdAt: workspace.createdAt,
    startedAt: workspace.startedAt,
    updatedAt: workspace.updatedAt,
    lastActivityAt: workspace.lastActivityAt,
    expiresAt: workspace.expiresAt,
    finishedAt: workspace.finishedAt,
    attempt: workspace.attempt,
    sandbox: workspace.sandbox,
    fencingToken: workspace.fencingToken,
    operations: workspace.operations,
    error: workspace.error,
  };
}

function sanitizeFinishResult(result) {
  if (!result) return undefined;
  return {
    ok: result.ok,
    status: result.status,
    diffPreview: result.diffPreview,
    diffPreviewTruncated: result.diffPreviewTruncated,
    diff: result.diff ? withoutHostPath(result.diff) : undefined,
    baseFingerprint: result.baseFingerprint,
    artifacts: Array.isArray(result.artifacts) ? result.artifacts.map(withoutHostPath) : [],
  };
}

function withoutHostPath(artifact) {
  const { path: _hostPath, ...safe } = artifact;
  return safe;
}

function stableKey(...parts) {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    details: value,
  };
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Project Sandbox request aborted"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abort);
    setTimeout(cleanup, ms);
  });
}
