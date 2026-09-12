import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v4";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
};
const targets = {
  entry: {
    source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js",
    target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js",
    before: "6d21c55e2d90864d64150fb358c3f3a34cdbcc30653fe7947bb99178fe0ef674",
  },
  planner: {
    source: "lab/release-files/automatic-session-maintenance-planner.mjs",
    target: "openclaw/dist/automatic-session-maintenance-planner.mjs",
    before: "a042a47171a5e6aeeb7882546b442004ee2762801178ad60b82052e37d525819",
  },
  worker: {
    source: "lab/release-files/automatic-session-maintenance.worker.mjs",
    target: "openclaw/dist/automatic-session-maintenance.worker.mjs",
    before: "dcef7f9fcf21cd3c30e9ced47c9e31eb3be4c8ddba833a0bdc561bb3c547573d",
  },
  quietWindow: {
    source: "lab/release-files/automatic-maintenance-quiet-window.mjs",
    target: "openclaw/dist/automatic-maintenance-quiet-window.mjs",
    before: null,
  },
};

function readCode(target) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
    "read-code",
    "--repo",
    "/Users/tianyicai/vlab-dev",
    "--target",
    target.target,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
  assert.equal(result.current.release, baseRelease);
  assert.equal(result.sha256, target.before);
  if (target.before === null) return "";
  const source = Buffer.from(result.content, "base64").toString();
  assert.equal(sha(source), target.before);
  return source;
}

function patchPlanner(source) {
  let output = once(source,
    `import { Worker } from "node:worker_threads";
`,
    `import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
`,
  );
  output = once(output,
    `const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 512 });
`,
    `const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ABORT_POLL_MS = 100;
const DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 512 });

export class AutomaticSessionMaintenanceInterruptedError extends Error {
  constructor() {
    super("Automatic session maintenance interrupted by foreground activity");
    this.name = "AutomaticSessionMaintenanceInterruptedError";
  }
}
`,
  );
  output = once(output,
    `function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(\`\${label} must be an absolute path\`);
  }
}
`,
    `function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(\`\${label} must be an absolute path\`);
  }
}

function spawnAutomaticSessionMaintenanceProcess(url, workerOptions) {
  const maxOldGenerationSizeMb = workerOptions.resourceLimits?.maxOldGenerationSizeMb ?? DEFAULT_RESOURCE_LIMITS.maxOldGenerationSizeMb;
  if (!Number.isInteger(maxOldGenerationSizeMb) || maxOldGenerationSizeMb <= 0) {
    throw new Error("Automatic session maintenance heap limit must be a positive integer");
  }
  const child = spawn(process.execPath, [
    \`--max-old-space-size=\${maxOldGenerationSizeMb}\`,
    fileURLToPath(url),
  ], {
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
`,
  );
  output = once(output,
    `  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("Automatic session maintenance timeout must be positive"));
  }
  const workerUrl =`,
    `  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("Automatic session maintenance timeout must be positive"));
  }
  const abortPollMs = options.abortPollMs ?? DEFAULT_ABORT_POLL_MS;
  if (typeof options.shouldInterrupt === "function" && (!Number.isFinite(abortPollMs) || abortPollMs <= 0)) {
    return Promise.reject(new Error("Automatic session maintenance abortPollMs must be positive"));
  }
  const workerUrl =`,
  );
  output = once(output,
    `  const createWorker = options.createWorker ?? ((url, workerOptions) => new Worker(url, workerOptions));
`,
    `  const createWorker = options.createWorker ?? spawnAutomaticSessionMaintenanceProcess;
`,
  );
  output = once(output,
    `    let result;
    let protocolError;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate?.();
      reject(new Error(\`Automatic session maintenance worker timed out after \${timeoutMs}ms\`));
    }, timeoutMs);
    timer.unref?.();
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners?.();
      operation();
    };
`,
    `    let result;
    let protocolError;
    let settled = false;
    let abortTimer;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (abortTimer) clearInterval(abortTimer);
      void worker.terminate?.();
      reject(new Error(\`Automatic session maintenance worker timed out after \${timeoutMs}ms\`));
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
`,
  );
  return once(output,
    `      if (protocolError) reject(protocolError);
      else if (code !== 0) reject(new Error(\`Automatic session maintenance worker exited with code \${code}\`));
`,
    `      if (protocolError) reject(protocolError);
      else if (worker.automaticDispatchError) reject(worker.automaticDispatchError);
      else if (code !== 0) reject(new Error(\`Automatic session maintenance worker exited with code \${code}\`));
`,
  );
}

function patchWorker(source) {
  let output = once(source,
    `import { parentPort, workerData } from "node:worker_threads";
`,
    `import { parentPort, workerData } from "node:worker_threads";
import { setPriority } from "node:os";
`,
  );
  output = once(output,
    `if (!parentPort) throw new Error("Automatic session maintenance worker requires a parent port");
`,
    `const processChannel = !parentPort && typeof process.send === "function";
if (!parentPort && !processChannel) throw new Error("Automatic session maintenance requires an isolated message channel");
if (processChannel) {
  try { setPriority(0, 10); } catch {}
}

const request = parentPort ? workerData : await new Promise((resolve, reject) => {
  process.once("message", resolve);
  process.once("disconnect", () => reject(new Error("Automatic session maintenance owner disconnected before dispatch")));
});
const postMessage = (message) => parentPort ? parentPort.postMessage(message) : process.send(message);
const closeChannel = () => parentPort ? parentPort.close() : process.disconnect();
`,
  );
  output = once(output, `  const request = workerData;
`, "");
  output = once(output, `  parentPort.postMessage({ type: "result", plan: opened.value });
`, `  postMessage({ type: "result", plan: opened.value });
`);
  output = once(output, `  parentPort.postMessage({
`, `  postMessage({
`);
  return once(output, `  parentPort.close();
`, `  closeChannel();
`);
}

function patchEntry(source) {
  let output = once(source,
    `import {filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan} from "./automatic-session-maintenance-planner.mjs";
`,
    `import {waitForAutomaticMaintenanceQuietWindow} from "./automatic-maintenance-quiet-window.mjs";
import {AutomaticSessionMaintenanceInterruptedError, filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan} from "./automatic-session-maintenance-planner.mjs";
`,
  );
  output = once(output,
    `\t\tif (process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE === "1") {
\t\t\tawait db91WaitAutomaticMaintenance(owner.database);
\t\t\tif (!isCurrent()) break;
\t\t}
\t\t// Incognito has no shared physical store.`,
    `\t\tif (process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE === "1") {
\t\t\tawait db91WaitAutomaticMaintenance(owner.database);
\t\t\tif (!isCurrent()) break;
\t\t}
\t\tconst incognito = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env});
\t\tconst currentAdmissionIdentities = () => collectActiveSessionWorkAdmissions().get(owner.storePath) ?? /* @__PURE__ */ new Set();
\t\t// Incognito has no shared physical store.`,
  );
  output = once(output,
    `\t\tlet completed = false;
\t\tconst generation = owner.generation;
\t\tconst currentAdmissionIdentities = () => collectActiveSessionWorkAdmissions().get(owner.storePath) ?? /* @__PURE__ */ new Set();
\t\tconst activeSessionKeys = uniqueStrings([...owner.activeSessionKeys, ...currentAdmissionIdentities()]);
\t\towner.activeSessionKeys.clear();
\t\ttry {
\t\t\tconst incognito = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env});
\t\t\tconst maintenanceConfig =`,
    `\t\tlet completed = false;
\t\tlet generation = owner.generation;
\t\ttry {
\t\t\t// The data-free coordinator elects one process to poll. A continuous quiet
\t\t\t// window in the Agent database/WAL keeps the full scan away from bursts in
\t\t\t// every Gateway/Worker process that shares this store.
\t\t\tconst quietWindow = incognito ? void 0 : await waitForAutomaticMaintenanceQuietWindow({
\t\t\t\tdatabasePath: owner.database.path,
\t\t\t\tisCurrent,
\t\t\t\tisLocallyIdle: () => currentAdmissionIdentities().size === 0
\t\t\t});
\t\t\tif (!incognito && !quietWindow) {
\t\t\t\tif (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
\t\t\t\treturn;
\t\t\t}
\t\t\tgeneration = owner.generation;
\t\t\tconst activeSessionKeys = uniqueStrings([...owner.activeSessionKeys, ...currentAdmissionIdentities()]);
\t\t\towner.activeSessionKeys.clear();
\t\t\tconst maintenanceConfig =`,
  );
  output = once(output,
    `\t\t\t\t\tmaintenanceConfig,
\t\t\t\t\tstorePath: owner.storePath
\t\t\t\t});
\t\t\t// Planning is read-only`,
    `\t\t\t\t\tmaintenanceConfig,
\t\t\t\t\tstorePath: owner.storePath
\t\t\t\t}, {
\t\t\t\t\tshouldInterrupt: async () => !isCurrent() || currentAdmissionIdentities().size > 0 || await quietWindow.changed()
\t\t\t\t});
\t\t\tif (!incognito && await quietWindow.changed()) plan = void 0;
\t\t\t// Planning is read-only`,
  );
  return once(output,
    `\t\t} catch (error) {
\t\t\tgetChildLogger({ subsystem: "session-sqlite" }).warn("SQLite automatic session maintenance failed", {
\t\t\t\terror,
\t\t\t\tpath: databasePath
\t\t\t});
\t\t} finally {`,
    `\t\t} catch (error) {
\t\t\tif (!(error instanceof AutomaticSessionMaintenanceInterruptedError)) {
\t\t\t\tgetChildLogger({ subsystem: "session-sqlite" }).warn("SQLite automatic session maintenance failed", {
\t\t\t\t\terror,
\t\t\t\t\tpath: databasePath
\t\t\t\t});
\t\t\t}
\t\t} finally {`,
  );
}

const patchers = { entry: patchEntry, planner: patchPlanner, worker: patchWorker, quietWindow: () => fs.readFileSync(path.join(root, targets.quietWindow.source), "utf8") };
const files = [];
for (const [name, target] of Object.entries(targets)) {
  const candidate = patchers[name](readCode(target));
  const candidatePath = path.join(root, target.source);
  assert.equal(candidate, fs.readFileSync(candidatePath, "utf8"), `${name} candidate differs from deterministic patch`);
  files.push({ ...target, candidate: sha(candidate) });
}
console.log(JSON.stringify({ baseRelease, files }, null, 2));
