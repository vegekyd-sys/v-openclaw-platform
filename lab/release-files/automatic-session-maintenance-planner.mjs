import { Worker } from "node:worker_threads";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 512 });

function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(`${label} must be an absolute path`);
  }
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

/** Remove work that became active after the isolated read snapshot began. */
export function filterAutomaticSessionMaintenancePlan(plan, identities) {
  const protectedIdentities = identities instanceof Set ? identities : new Set(identities ?? []);
  if (protectedIdentities.size === 0) return plan;
  const plannedEntryArchives = plan.plannedEntryArchives?.filter((item) => !isProtected(item, protectedIdentities));
  const entryRemovals = plan.entryRemovals.filter((item) => !isProtected(item, protectedIdentities));
  const stateDeletePlans = plan.stateDeletePlans.filter((item) => !isProtected(item, protectedIdentities));
  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => !isProtected(item, protectedIdentities));
  return {
    ...plan,
    ...plannedEntryArchives ? { plannedEntryArchives, archived: plannedEntryArchives.length } : {},
    entryRemovals,
    stateDeletePlans,
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
  const workerUrl = options.workerUrl ?? new URL("./automatic-session-maintenance.worker.mjs", import.meta.url);
  const createWorker = options.createWorker ?? ((url, workerOptions) => new Worker(url, workerOptions));
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
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate?.();
      reject(new Error(`Automatic session maintenance worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
