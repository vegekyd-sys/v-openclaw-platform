// OpenClaw's own dist ESM resolve fast path (src/entry.esm-resolve-fast-path.ts), for the
// Worker process. The Gateway installs it in dist/index.js before importing anything; a
// Worker starts from production-worker/worker.mjs and never did, so every relative import
// inside dist went through Node's default resolver, which re-materializes the openclaw
// package.json `exports` map (300+ entries) per resolution: ~10 s CPU per Worker start on
// VLab. Same rule as upstream: only a relative ".js" specifier whose parent and target are
// both inside the dist root, outside require conditions; the URL is what Node would return
// and the format is "module" (every dist package.json declares "type": "module").
import fs from "node:fs";
import Module from "node:module";
import { pathToFileURL } from "node:url";

const RESOLVER_HOOK_OPTIONS = new Set(["--import", "--require", "-r", "--loader", "--experimental-loader", "--experimental-config-file", "--experimental-default-config-file"]);
let installedRoot;

export function resolveDistEsmFastPathUrl({ specifier, parentUrl, conditions, distRootUrl }) {
  if (specifier.charCodeAt(0) !== 46 || !specifier.endsWith(".js") || parentUrl === undefined || !parentUrl.startsWith(distRootUrl) || conditions?.includes("require") === true || (specifier.charCodeAt(1) !== 47 && (specifier.charCodeAt(1) !== 46 || specifier.charCodeAt(2) !== 47))) return null;
  let resolved;
  try { resolved = new URL(specifier, parentUrl).href; } catch { return null; }
  return resolved.startsWith(distRootUrl) ? resolved : null;
}

function hasResolverHookOption(execArgv, nodeOptions) {
  const tokens = [...execArgv, ...String(nodeOptions ?? "").split(/\s+/u).filter(Boolean)];
  return tokens.some((token) => RESOLVER_HOOK_OPTIONS.has((token.split("=", 1)[0] ?? "").replaceAll("_", "-")));
}

// agentRuntimePath: dist/plugin-sdk/agent-runtime.js. Node resolves the Worker's import of it
// to its real path, so the covered root is the real dist directory. Returns that root, or
// null when the fast path does not apply (no registerHooks, not a dist layout, or another
// resolver hook is configured and must keep owning resolution).
export function installWorkerDistEsmResolveFastPath(agentRuntimePath, { registerHooks = Module.registerHooks, execArgv = process.execArgv, nodeOptions = process.env.NODE_OPTIONS, env = process.env } = {}) {
  if (env.OPENCLAW_WORKER_DIST_RESOLVE_FAST_PATH === "0") return null;
  if (typeof registerHooks !== "function") return null;
  let distRootUrl;
  try { distRootUrl = new URL("../", pathToFileURL(fs.realpathSync(agentRuntimePath))).href; } catch { return null; }
  if (!distRootUrl.endsWith("/dist/")) return null;
  if (hasResolverHookOption(execArgv, nodeOptions)) return null;
  if (installedRoot === distRootUrl) return distRootUrl;
  if (installedRoot) return null;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const url = resolveDistEsmFastPathUrl({ specifier, parentUrl: context.parentURL, conditions: context.conditions, distRootUrl });
      return url === null ? nextResolve(specifier, context) : { url, format: "module", shortCircuit: true };
    },
  });
  installedRoot = distRootUrl;
  return distRootUrl;
}
