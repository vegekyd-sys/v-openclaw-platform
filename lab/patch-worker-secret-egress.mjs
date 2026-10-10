import assert from 'node:assert/strict';

// Secret egress for exec inside a Worker (worker-secret-egress), on top of V's
// production-worker/worker.mjs (worker-prewarm-contention-retry, the bytes V runs as of
// 2026-10-10, sha256 8b466a60).
//
// Protected secret-store entries reach exec only through a process-local egress proxy,
// which only Gateway start-up creates. Exec inside a Worker therefore got no sentinel and
// every `$NAME` was empty (production V 2026-10-10: AgentMail and Vercel requests from a
// /vcc sub-agent both went out without credentials and got 403). The Worker now starts
// the same native proxy in its own process before it reports ready, and revokes a run's
// authorization when that run's request ends (and everything once no Agent request is
// left). secrets.egressProxy.enabled in the Worker config gates it as it does the
// Gateway; OPENCLAW_WORKER_SECRET_EGRESS=0 turns it off.

export const MARKER = '/* OPENCLAW_WORKER_SECRET_EGRESS_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorker(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `import { installGatewayOwnedToolProxy } from "./gateway-owned-tool-proxy.mjs";
`,
    `import { installGatewayOwnedToolProxy } from "./gateway-owned-tool-proxy.mjs";
import { startWorkerSecretEgress } from "./secret-egress-worker.mjs";
`,
    'gateway-owned tool proxy import',
  );
  out = replaceExactlyOnce(
    out,
    `globalThis[NATIVE_ATTEMPT_BRIDGE] = nativeAttemptBridge;
`,
    `globalThis[NATIVE_ATTEMPT_BRIDGE] = nativeAttemptBridge;
${MARKER}
let workerSecretEgress;
`,
    'native attempt bridge install',
  );
  out = replaceExactlyOnce(
    out,
    `    activeControllers.delete(message.id);
`,
    `    activeControllers.delete(message.id);
    if (message.kind === "agent" && message.runId) workerSecretEgress?.revokeRun(message.runId);
    if (![...activeControllers.values()].some((active) => active.request?.kind === "agent")) workerSecretEgress?.revokeAll();
`,
    'request finally',
  );
  out = replaceExactlyOnce(
    out,
    `// Prepare the first turn before reporting ready (worker-prewarm-v).`,
    `// Exec in this Worker gets protected secret-store entries the way Gateway exec does:
// through an egress proxy in this process (worker-secret-egress). Started before
// prewarm and before ready, so no exec tool is built while it is still missing.
{
  const started = performance.now();
  try {
    const { configRuntime } = await loadCompactionRuntime();
    workerSecretEgress = await startWorkerSecretEgress({
      agentRuntimePath: configuredAgentRuntimePath(),
      config: configRuntime.loadConfig(),
    });
  } catch (error) {
    workerSecretEgress = undefined;
    process.stderr.write(\`[worker-secret-egress.1] \${JSON.stringify({ pid: process.pid, status: "failed", error: String(error?.message ?? error).slice(0, 200), ms: Math.round(performance.now() - started) })}\\n\`);
  }
  if (workerSecretEgress) process.stderr.write(\`[worker-secret-egress.1] \${JSON.stringify({ pid: process.pid, ...workerSecretEgress.report() })}\\n\`);
}

// Prepare the first turn before reporting ready (worker-prewarm-v).`,
    'prewarm comment',
  );
  return out;
}
