// v-scan-guard: refuse shell commands that walk V's whole data tree (grep -r / rg / find /
// du / ** over ~/.openclaw, Night Shift instances, agent databases) before they run.
// Registered in the Gateway and in every Worker child (the Worker config is derived from
// the Gateway's). See ../README.md and docs/incidents/2026-11-09-recursive-scan.md.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { MATCHER, createScanGuard } from "./core/hook.js";

const REGISTERED = Symbol.for("v-scan-guard.registered");

export default definePluginEntry({
  id: "v-scan-guard",
  name: "V Scan Guard",
  description: "Blocks recursive grep/rg/find/du and ** globs over V's data directories before they run.",
  register(api) {
    // register() may run more than once per process with the same api; one hook per api.
    if (api[REGISTERED]) return;
    api[REGISTERED] = true;
    const log = (line) => (api.logger?.warn ?? console.warn)(`[v-scan-guard] ${line}`);
    const guard = createScanGuard({ config: api.pluginConfig, log });
    api.on("before_tool_call", guard, { priority: 100, timeoutMs: 1_000, matcher: [...MATCHER] });
  },
});
