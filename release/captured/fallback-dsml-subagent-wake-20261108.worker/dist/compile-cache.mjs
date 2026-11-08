// Node's on-disk compile cache for the Worker process, in the directory OpenClaw's own CLI
// entry uses (src/entry.compile-cache.ts: <base>/openclaw/<version>/<package.json mtime-size>),
// so Workers, the Gateway and CLI runs share one cache per install. Entries are keyed by
// source content and V8 version/flags; a changed file is compiled again. Without it every
// Worker start compiles the whole dist graph from source (~5 s CPU on VLab).
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";

const segment = (value) => {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "unknown";
};

export function openClawCompileCacheDirectory(installRoot, env = process.env) {
  const packageJsonPath = path.join(installRoot, "package.json");
  let version = "unknown";
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (typeof parsed?.version === "string" && parsed.version.trim().length > 0) version = parsed.version;
  } catch {}
  let installMarker = "no-package-json";
  try { const stat = fs.statSync(packageJsonPath); installMarker = `${Math.trunc(stat.mtimeMs)}-${stat.size}`; } catch {}
  const base = env.NODE_COMPILE_CACHE && env.NODE_DISABLE_COMPILE_CACHE === undefined ? env.NODE_COMPILE_CACHE : path.join(os.tmpdir(), "node-compile-cache");
  return path.join(base, "openclaw", segment(version), segment(installMarker));
}

// agentRuntimePath: <install>/dist/plugin-sdk/agent-runtime.js. Returns the enable result or a
// reason it was not enabled; never throws.
export function enableWorkerCompileCache(agentRuntimePath, { env = process.env, enable = Module.enableCompileCache } = {}) {
  try {
    if (env.NODE_DISABLE_COMPILE_CACHE !== undefined || env.OPENCLAW_WORKER_COMPILE_CACHE === "0") return { status: "disabled" };
    if (typeof enable !== "function") return { status: "unsupported" };
    const installRoot = path.dirname(path.dirname(path.dirname(fs.realpathSync(agentRuntimePath))));
    if (fs.existsSync(path.join(installRoot, ".git")) || fs.existsSync(path.join(installRoot, "src", "entry.ts"))) return { status: "source-checkout" };
    const result = enable(openClawCompileCacheDirectory(installRoot, env));
    return { status: result?.status === Module.constants?.compileCacheStatus?.FAILED ? "failed" : "enabled", directory: result?.directory };
  } catch (error) {
    return { status: "error", error: String(error?.code ?? error?.message ?? error).slice(0, 80) };
  }
}

export function flushWorkerCompileCache(flush = Module.flushCompileCache) {
  try { if (typeof flush === "function") flush(); } catch {}
}
