import { pathToFileURL } from 'node:url';

// A Worker has no Gateway startup to activate the native global hook runner.
// Use the exact prepared generation and the official SDK initializer; do not
// reimplement hook dispatch, plugin selection, permissions, or channel startup.
export async function initializeWorkerNativeHooks({ pluginGeneration, agentRuntimePath }, importModule = specifier => import(specifier)) {
  const registry = pluginGeneration?.pluginRegistry;
  if (!registry) return false; // Legacy runtimes have no prepared generation.
  const sdk = await importModule(new URL('./hook-runtime.js', pathToFileURL(agentRuntimePath)).href);
  if (typeof sdk.initializeGlobalHookRunner !== 'function') throw new Error('Native OpenClaw hook runtime initializer is unavailable');
  sdk.initializeGlobalHookRunner(registry);
  return true;
}
