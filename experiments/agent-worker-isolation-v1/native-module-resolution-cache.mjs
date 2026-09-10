import * as nodeModule from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_ENTRIES = 4096;
const MAX_KEY_LENGTH = 4096;

// Node still resolves every first import. Only repeat relative ESM edges in
// this immutable OpenClaw dist tree are shared across importers in one directory.
// No source/module instance, exports map, plugin selection or authority is cached.
export function createNativeModuleResolveHook({distURL, maxEntries = MAX_ENTRIES}) {
  if (!distURL?.startsWith("file:") || !distURL.endsWith("/") ||
      !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ENTRIES) {
    throw new Error("Invalid native module resolution cache bounds");
  }
  const cache = new Map();
  const stats = {hits: 0, misses: 0};
  function resolve(specifier, context, nextResolve) {
    // Bare/#/absolute imports remain native, including package export denials.
    if ((!specifier.startsWith("./") && !specifier.startsWith("../")) ||
        !context.parentURL?.startsWith(distURL) ||
        !context.parentURL.endsWith(".js") ||
        Object.keys(context).some(key => !["parentURL", "conditions", "importAttributes"].includes(key))) {
      return nextResolve(specifier, context);
    }
    const target = new URL(specifier, context.parentURL);
    if (!target.href.startsWith(distURL) || target.search || target.hash ||
        !target.pathname.endsWith(".js")) return nextResolve(specifier, context);
    const key = JSON.stringify([new URL(".", context.parentURL).href, specifier,
      context.conditions, context.importAttributes]);
    if (key.length > MAX_KEY_LENGTH) return nextResolve(specifier, context);
    const cached = cache.get(key);
    if (cached) {
      stats.hits++;
      return {...cached, shortCircuit: true};
    }
    stats.misses++;
    // Do not cache failures. Retrying a missing module still uses native rules.
    const result = nextResolve(specifier, context);
    if (result.format === "module" && result.url === target.href && cache.size < maxEntries) {
      cache.set(key, {...result});
    }
    return result;
  }
  return {resolve, status: () => ({...stats, entries: cache.size}), clear: () => cache.clear()};
}

function hasCustomLoader(env, execArgv) {
  const options = `${env.NODE_OPTIONS ?? ""} ${execArgv.join(" ")}`;
  return /(?:^|[\s=])--(?:import|require|(?:experimental-)?loader)(?:[\s=]|$)/.test(options) ||
    /(?:^|\s)-r(?:\S*|(?=\s|$))/.test(options);
}

export function installNativeModuleResolutionCache({
  agentRuntimePath,
  env = process.env,
  execArgv = process.execArgv,
} = {}) {
  const disabled = {status: () => ({enabled: false})};
  if (env.OPENCLAW_WORKER_RESOLVE_CACHE === "0" ||
      typeof nodeModule.registerHooks !== "function" || hasCustomLoader(env, execArgv)) return disabled;
  try {
    const runtime = realpathSync(agentRuntimePath);
    if (!runtime.endsWith("/dist/plugin-sdk/agent-runtime.js")) return disabled;
    const dist = dirname(dirname(runtime));
    const manifest = JSON.parse(readFileSync(join(dirname(dist), "package.json"), "utf8"));
    if (manifest.name !== "openclaw" || manifest.type !== "module") return disabled;
    const hook = createNativeModuleResolveHook({distURL: pathToFileURL(dist + "/").href});
    const registration = nodeModule.registerHooks({resolve: hook.resolve});
    return {status: () => ({enabled: true, ...hook.status()}),
      close: () => { registration.deregister(); hook.clear(); }};
  } catch {
    // An optional acceleration must never replace a native load failure or
    // make an older Node/runtime unsupported. The normal import runs next.
    return disabled;
  }
}
