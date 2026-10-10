// Secret egress for exec inside a Worker (worker-secret-egress).
//
// OpenClaw 9.1 hands protected secret-store entries to Gateway-host exec only as
// process-local sentinels: the exec tool asks its own process for an active egress
// proxy (a globalThis singleton published by the Gateway at start-up), seals each
// entry with that process's sentinel key, and gives the subprocess HTTPS_PROXY plus
// the sentinels. The proxy swaps a sentinel for its value at request time, only for
// the entry's allowed hosts. A Worker never runs Gateway start-up, so it has no proxy:
// exec there sees no sentinel at all and `$NAME` expands to an empty string
// (production V 2026-10-10: AGENTMAIL_API_KEY and VERCEL_ULTRONX_TOKEN both empty,
// every request 403).
//
// Sentinels only open in the process that sealed them, so the Gateway's proxy cannot
// serve a Worker. The Worker starts the same native proxy in its own process instead,
// on loopback, with its own CA, and revokes a run's authorization when that run's
// request ends (the Gateway does this on agent-run authority close, which a Worker
// does not have). The Worker already reads the secret store directly; nothing new
// reaches the Agent or the command.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REGISTRY_KEY = Symbol.for("openclaw.secretEgressProxy.registry");
const EXPORT_PATTERN = /export\s*\{\s*startGatewaySecretEgressProxy\s*\}\s*;?/u;
const RUNTIME_FILE = /^runtime-[\w-]+\.js$/u;

function runKey(run) {
  return `${run?.runId}\0${run?.instanceId}`;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// The native egress runtime, found by its semantic export rather than its hashed name.
export function resolveEgressRuntimePath(distDir, readDirectory = fs.readdirSync, readFile = (file) => fs.readFileSync(file, "utf8")) {
  const matches = readDirectory(distDir)
    .filter((name) => RUNTIME_FILE.test(name))
    .filter((name) => {
      try { return EXPORT_PATTERN.test(readFile(path.join(distDir, name))); } catch { return false; }
    });
  if (matches.length !== 1) throw new Error(`secret egress runtime must resolve uniquely; found ${matches.length}`);
  return path.join(distDir, matches[0]);
}

// One directory per Worker pid. The native start-up removes every `gateway-*` directory
// under `<state>/secret-egress-proxy`, which in the Gateway's state directory is the
// Gateway's own live CA; a Worker must never point it there.
export function prepareWorkerProxyRoot(baseStateDir, pid = process.pid) {
  const parent = path.join(baseStateDir, "secret-egress-proxy-workers");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  fs.chmodSync(parent, 0o700);
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
    const other = Number(entry.name);
    if (other !== pid && !pidAlive(other)) fs.rmSync(path.join(parent, entry.name), { recursive: true, force: true });
  }
  const root = path.join(parent, String(pid));
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { mode: 0o700 });
  return root;
}

export async function startWorkerSecretEgress(options = {}) {
  const env = options.env ?? process.env;
  const started = Date.now();
  const disabled = (status, extra = {}) => ({
    status,
    ...extra,
    revokeRun() {},
    revokeAll() {},
    report: () => ({ status, ...extra }),
  });
  if (env.OPENCLAW_WORKER_SECRET_EGRESS === "0") return disabled("disabled-by-env");
  const egressConfig = options.config?.secrets?.egressProxy;
  if (egressConfig?.enabled !== true) return disabled("disabled-by-config");
  const registry = (globalThis[REGISTRY_KEY] ??= {});
  if (registry.activeProxy) return disabled("already-active");

  const distDir = options.distDir ?? path.dirname(path.dirname(options.agentRuntimePath));
  const runtimePath = options.runtimePath ?? resolveEgressRuntimePath(distDir);
  const runtime = await (options.importer ?? ((file) => import(pathToFileURL(file).href)))(runtimePath);
  if (typeof runtime.startGatewaySecretEgressProxy !== "function") throw new Error("native secret egress runtime has no startGatewaySecretEgressProxy");

  const baseStateDir = env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  const root = prepareWorkerProxyRoot(baseStateDir, options.pid ?? process.pid);
  // The native start resolves its state directory from process.env exactly once,
  // synchronously, before its first await (CA generation then works from the resolved
  // directory). Pointing OPENCLAW_STATE_DIR at this Worker's root for that synchronous
  // span confines it there.
  const previous = Object.hasOwn(process.env, "OPENCLAW_STATE_DIR") ? process.env.OPENCLAW_STATE_DIR : undefined;
  let starting;
  process.env.OPENCLAW_STATE_DIR = root;
  try {
    starting = runtime.startGatewaySecretEgressProxy({
      ...(egressConfig.allowedHosts !== undefined ? { allowedHosts: egressConfig.allowedHosts } : {}),
      ...(egressConfig.bypassHosts ? { bypassHosts: egressConfig.bypassHosts } : {}),
    });
  } finally {
    if (previous === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previous;
  }
  let handle;
  try {
    handle = await starting;
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  const removeRoot = () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} };
  process.once("exit", removeRoot);

  // Track every run the exec tool authorizes so the Worker can revoke it when the
  // request that owns it ends.
  const runs = new Map();
  const stats = { registered: 0, revoked: 0, revokedUnmatched: 0 };
  const wrapper = {
    ...handle,
    registerRun(run, bindings) {
      const proxyEnv = handle.registerRun(run, bindings);
      if (!runs.has(runKey(run))) stats.registered += 1;
      runs.set(runKey(run), run);
      return proxyEnv;
    },
    revokeRun(run) {
      runs.delete(runKey(run));
      handle.revokeRun(run);
    },
    async stop() {
      if (registry.activeProxy === wrapper) registry.activeProxy = undefined;
      process.off("exit", removeRoot);
      try { await handle.stop(); } finally { removeRoot(); }
    },
  };
  // startGatewaySecretEgressProxy published `handle`; exec reads the registry per tool.
  registry.activeProxy = wrapper;

  const revoke = (run, key) => {
    runs.delete(key);
    try { handle.revokeRun(run); } catch {}
    stats.revoked += 1;
  };
  const report = () => ({
    status: "active",
    ms: Date.now() - started,
    activeRuns: runs.size,
    ...stats,
  });
  return {
    status: "active",
    proxy: wrapper,
    // Revokes every authorization registered for this Agent run id.
    revokeRun(runId) {
      for (const [key, run] of runs) if (run?.runId === runId) revoke(run, key);
    },
    // Called when the Worker has no Agent request left: nothing may still hold one.
    revokeAll() {
      for (const [key, run] of runs) {
        revoke(run, key);
        stats.revokedUnmatched += 1;
      }
    },
    report,
    stop: () => wrapper.stop(),
  };
}
