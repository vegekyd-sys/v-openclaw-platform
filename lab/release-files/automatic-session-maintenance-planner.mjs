import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ABORT_POLL_MS = 100;
const DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 512 });

export class AutomaticSessionMaintenanceInterruptedError extends Error {
  constructor() {
    super("Automatic session maintenance interrupted by foreground activity");
    this.name = "AutomaticSessionMaintenanceInterruptedError";
  }
}

function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(`${label} must be an absolute path`);
  }
}

function spawnAutomaticSessionMaintenanceProcess(url, workerOptions) {
  const maxOldGenerationSizeMb = workerOptions.resourceLimits?.maxOldGenerationSizeMb ?? DEFAULT_RESOURCE_LIMITS.maxOldGenerationSizeMb;
  if (!Number.isInteger(maxOldGenerationSizeMb) || maxOldGenerationSizeMb <= 0) {
    throw new Error("Automatic session maintenance heap limit must be a positive integer");
  }
  const nodeArgs = [
    `--max-old-space-size=${maxOldGenerationSizeMb}`,
    fileURLToPath(url),
  ];
  // Keep a global read scan below foreground Gateway and Agent Worker CPU work.
  // nice(1) execs Node in place, so the IPC channel remains the child channel.
  const useNice = process.platform !== "win32";
  const child = spawn(useNice ? "/usr/bin/nice" : process.execPath, useNice ? ["-n", "10", process.execPath, ...nodeArgs] : nodeArgs, {
    env: process.env,
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  child.terminate = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  };
  child.send(workerOptions.workerData, (error) => {
    if (!error) return;
    child.automaticDispatchError = error;
    child.terminate();
  });
  return child;
}

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Automatic session maintenance request must be an object");
  }
  if (typeof request.agentId !== "string" || !request.agentId.trim()) {
    throw new Error("Automatic session maintenance requires an agentId");
  }
  assertAbsolutePath(request.storePath, "Automatic session maintenance storePath");
  assertAbsolutePath(request.archiveDirectory, "Automatic session maintenance archiveDirectory");
  if (!Array.isArray(request.activeSessionKeys) || request.activeSessionKeys.some((key) => typeof key !== "string")) {
    throw new Error("Automatic session maintenance activeSessionKeys must be strings");
  }
  if (!request.maintenanceConfig || typeof request.maintenanceConfig !== "object" || Array.isArray(request.maintenanceConfig)) {
    throw new Error("Automatic session maintenance requires a resolved maintenanceConfig");
  }
  return request;
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("Automatic session maintenance worker returned an invalid plan");
  }
  for (const field of ["entryRemovals", "stateDeletePlans"]) {
    if (!Array.isArray(plan[field])) throw new Error(`Automatic session maintenance plan is missing ${field}`);
  }
  if (plan.plannedEntryArchives !== undefined && !Array.isArray(plan.plannedEntryArchives)) {
    throw new Error("Automatic session maintenance plan has invalid plannedEntryArchives");
  }
  if (plan.automaticArchiveBytesBySessionId !== undefined) {
    if (!Array.isArray(plan.automaticArchiveBytesBySessionId) ||
      plan.automaticArchiveBytesBySessionId.some((entry) =>
        !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
        !Number.isFinite(entry[1]) || entry[1] < 0)) {
      throw new Error("Automatic session maintenance plan has invalid archive byte sizes");
    }
    const ids = plan.automaticArchiveBytesBySessionId.map(([sessionId]) => sessionId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("Automatic session maintenance plan has duplicate archive byte sizes");
    }
    const sized = new Set(ids);
    if (plan.stateDeletePlans.some((item) => item.archiveTranscript && !sized.has(item.sessionId))) {
      throw new Error("Automatic session maintenance plan is missing an archive byte size");
    }
  }
  for (const field of ["archived", "modelRunPruned", "pruned", "capped"]) {
    if (!Number.isFinite(plan[field]) || plan[field] < 0) {
      throw new Error(`Automatic session maintenance plan has invalid ${field}`);
    }
  }
  return plan;
}

function maintenanceIdentity(item) {
  return {
    sessionId: item?.expectedEntry?.sessionId ?? item?.entry?.sessionId ?? item?.sessionId,
    sessionKey: item?.sessionKey,
  };
}

function isProtected(item, protectedIdentities) {
  const { sessionId, sessionKey } = maintenanceIdentity(item);
  return (typeof sessionId === "string" && protectedIdentities.has(sessionId)) ||
    (typeof sessionKey === "string" && protectedIdentities.has(sessionKey));
}

/** Return at most one native cleanup batch so Worker-to-Gateway transfer and
 * owner-process revalidation stay bounded even for a multi-thousand-session
 * backlog. The full read-only scan still chooses the same oldest candidates. */
export function boundAutomaticSessionMaintenancePlan(plan, buildBatches) {
  if (typeof buildBatches !== "function") throw new Error("Automatic maintenance batch builder is required");
  const automaticArchiveBytesBySessionId = plan.automaticArchiveBytesBySessionId ?? [];
  const [batch] = buildBatches({
    archiveBytesBySessionId: new Map(automaticArchiveBytesBySessionId),
    entryRemovals: plan.entryRemovals,
    stateDeletePlans: plan.stateDeletePlans,
  });
  const entryRemovals = batch?.entryRemovals ?? [];
  const stateDeletePlans = batch?.stateDeletePlans ?? [];
  const retainedStateIds = new Set(stateDeletePlans.map((item) => item.sessionId));
  const boundedArchiveBytes = automaticArchiveBytesBySessionId.filter(([sessionId]) => retainedStateIds.has(sessionId));
  const plannedEntryArchives = plan.plannedEntryArchives?.slice(0, 64);
  const retainedArchiveKeys = new Set(plannedEntryArchives?.map((item) => item.sessionKey) ?? []);
  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => retainedArchiveKeys.has(item.sessionKey));
  const counts = { modelRunPruned: 0, pruned: 0, capped: 0 };
  for (const removal of entryRemovals) {
    if (removal.maintenanceReason === "model-run-pruned") counts.modelRunPruned += 1;
    else if (removal.maintenanceReason === "pruned") counts.pruned += 1;
    else if (removal.maintenanceReason === "capped") counts.capped += 1;
  }
  const automaticPlanSummary = {
    truncated: entryRemovals.length < plan.entryRemovals.length ||
      stateDeletePlans.length < plan.stateDeletePlans.length ||
      (plannedEntryArchives?.length ?? 0) < (plan.plannedEntryArchives?.length ?? 0),
    entryRemovalsTotal: plan.entryRemovals.length,
    plannedEntryArchivesTotal: plan.plannedEntryArchives?.length ?? 0,
    stateDeletePlansTotal: plan.stateDeletePlans.length,
  };
  return {
    ...plan,
    ...plannedEntryArchives ? { plannedEntryArchives, archived: plannedEntryArchives.length } : { archived: 0 },
    ...archivedWorktrees ? { archivedWorktrees } : {},
    ...counts,
    entryRemovals,
    stateDeletePlans,
    automaticArchiveBytesBySessionId: boundedArchiveBytes,
    automaticPlanSummary,
  };
}

/** Remove work that became active after the isolated read snapshot began. */
export function filterAutomaticSessionMaintenancePlan(plan, identities) {
  const protectedIdentities = identities instanceof Set ? identities : new Set(identities ?? []);
  if (protectedIdentities.size === 0) return plan;
  const plannedEntryArchives = plan.plannedEntryArchives?.filter((item) => !isProtected(item, protectedIdentities));
  const entryRemovals = plan.entryRemovals.filter((item) => !isProtected(item, protectedIdentities));
  const stateDeletePlans = plan.stateDeletePlans.filter((item) => !isProtected(item, protectedIdentities));
  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => !isProtected(item, protectedIdentities));
  const retainedStateIds = new Set(stateDeletePlans.map((item) => item.sessionId));
  const automaticArchiveBytesBySessionId = plan.automaticArchiveBytesBySessionId
    ?.filter(([sessionId]) => retainedStateIds.has(sessionId));
  return {
    ...plan,
    ...plannedEntryArchives ? { plannedEntryArchives, archived: plannedEntryArchives.length } : {},
    entryRemovals,
    stateDeletePlans,
    ...automaticArchiveBytesBySessionId ? { automaticArchiveBytesBySessionId } : {},
    ...archivedWorktrees ? { archivedWorktrees } : {},
  };
}

/**
 * Run the synchronous, global maintenance selection scan off the Gateway or
 * Agent Worker event loop. The caller still owns all commit-time revalidation,
 * writer coordination, filesystem finalization and lifecycle publication.
 */
export function runAutomaticSessionMaintenancePlan(request, options = {}) {
  const validated = validateRequest(request);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("Automatic session maintenance timeout must be positive"));
  }
  const abortPollMs = options.abortPollMs ?? DEFAULT_ABORT_POLL_MS;
  if (typeof options.shouldInterrupt === "function" && (!Number.isFinite(abortPollMs) || abortPollMs <= 0)) {
    return Promise.reject(new Error("Automatic session maintenance abortPollMs must be positive"));
  }
  const workerUrl = options.workerUrl ?? new URL("./automatic-session-maintenance.worker.mjs", import.meta.url);
  const createWorker = options.createWorker ?? spawnAutomaticSessionMaintenanceProcess;
  let worker;
  try {
    worker = createWorker(workerUrl, {
      resourceLimits: options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
      workerData: structuredClone(validated),
    });
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let result;
    let protocolError;
    let settled = false;
    let abortTimer;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (abortTimer) clearInterval(abortTimer);
      void worker.terminate?.();
      reject(new Error(`Automatic session maintenance worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    let abortPollActive = false;
    const pollForAbort = async () => {
      if (settled || abortPollActive || typeof options.shouldInterrupt !== "function") return;
      abortPollActive = true;
      try {
        const interrupted = await options.shouldInterrupt();
        if (!settled && interrupted) {
          protocolError = new AutomaticSessionMaintenanceInterruptedError();
          void worker.terminate?.();
        }
      } catch (error) {
        if (!settled) {
          protocolError = error instanceof Error ? error : new Error(String(error));
          void worker.terminate?.();
        }
      } finally {
        abortPollActive = false;
      }
    };
    if (typeof options.shouldInterrupt === "function") {
      abortTimer = setInterval(() => void pollForAbort(), abortPollMs);
      abortTimer.unref?.();
      void pollForAbort();
    }
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abortTimer) clearInterval(abortTimer);
      worker.removeAllListeners?.();
      operation();
    };
    worker.once("message", (message) => {
      try {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          throw new Error("Automatic session maintenance worker returned an invalid response");
        }
        if (message.type === "error") {
          protocolError = new Error(typeof message.message === "string" ? message.message : "Automatic session maintenance worker failed");
          return;
        }
        if (message.type !== "result") throw new Error("Automatic session maintenance worker returned an unknown response");
        result = validatePlan(message.plan);
      } catch (error) {
        protocolError = error;
        void worker.terminate?.();
      }
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => finish(() => {
      if (protocolError) reject(protocolError);
      else if (worker.automaticDispatchError) reject(worker.automaticDispatchError);
      else if (code !== 0) reject(new Error(`Automatic session maintenance worker exited with code ${code}`));
      else if (!result) reject(new Error("Automatic session maintenance worker exited without a plan"));
      else resolve(result);
    }));
  });
}

export const automaticSessionMaintenanceProtocol = Object.freeze({
  filterAutomaticSessionMaintenancePlan,
  validatePlan,
  validateRequest,
});
