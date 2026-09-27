// Worker vs no-worker mode for the mirror's probes (probe.mjs, accept.mjs,
// bench.mjs). Same rule as scripts/v-sentinel/sentinel.py worker_mode():
// worker mode while the Worker plugin entry is not disabled or any
// agentRuntime.id still routes to "vlab-worker"; no-worker mode only when the
// config positively says so.
export const WORKER_PLUGIN_ID = "vlab-agent-worker-isolation";
export const WORKER_RUNTIME_ID = "vlab-worker";
export const PROVIDERS_PLUGIN_ID = "versa-runtime-providers";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function routesToWorker(value) {
  if (Array.isArray(value)) return value.some(routesToWorker);
  if (!isRecord(value)) return false;
  if (isRecord(value.agentRuntime) && value.agentRuntime.id === WORKER_RUNTIME_ID) return true;
  return Object.values(value).some(routesToWorker);
}

/** "worker" | "no-worker"; VERSA_RUNTIME_MODE overrides. */
export function runtimeMode(config, env = process.env) {
  const override = env.VERSA_RUNTIME_MODE?.trim();
  if (override === "worker" || override === "no-worker") return override;
  const entry = config?.plugins?.entries?.[WORKER_PLUGIN_ID];
  if (isRecord(entry) && entry.enabled !== false) return "worker";
  return routesToWorker(config) ? "worker" : "no-worker";
}

/**
 * Strict probe verdict. Returns the list of failed checks (empty = pass).
 * Worker mode: the Worker plugin is loaded and its pool started.
 * No-worker mode: the Worker plugin is NOT loaded (a half-converted config
 * would otherwise start a pool nobody routes to) and versa-runtime-providers
 * is, since talk.realtime.provider and the compaction provider depend on it.
 */
export function probeFailures({ mode, health, workers }) {
  const failures = [];
  const loaded = health?.plugins?.loaded ?? [];
  if (health?.ok !== true) failures.push("health not ok");
  if ((health?.plugins?.errors ?? []).length) failures.push("plugin errors");
  if (mode === "worker") {
    if (!loaded.includes(WORKER_PLUGIN_ID)) failures.push("worker plugin not loaded");
    if (workers?.started !== true) failures.push("worker pool not started");
  } else {
    if (loaded.includes(WORKER_PLUGIN_ID)) failures.push("worker plugin loaded in no-worker mode");
    if (!loaded.includes(PROVIDERS_PLUGIN_ID)) failures.push(`${PROVIDERS_PLUGIN_ID} not loaded`);
  }
  return failures;
}

/** The mirror's acceptance RPC list; vlab.workers.status exists only with a pool. */
export function acceptanceRpcs(mode) {
  return [
    ["health", {}],
    ["sessions.list", { limit: 20 }],
    ["tasks.list", {}],
    ["cron.list", {}],
    ...(mode === "worker" ? [["vlab.workers.status", {}]] : []),
    ["models.list", {}],
  ];
}
