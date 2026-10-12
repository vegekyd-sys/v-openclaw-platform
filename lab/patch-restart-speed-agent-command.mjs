// Worker preparation must not wait on the Gateway it is starting for.
//
// worker-prewarm-secrets (#254, 2026-10-07) activates the secrets runtime snapshot before a
// Worker reports ready, through resolveAgentRuntimeConfig. When the config has agent-runtime
// SecretRefs (V: skills.entries.*.apiKey, plugins.entries.google.config.webSearch.apiKey;
// shared VLab has none) that resolves them through the Gateway's secrets.resolve. During a
// Gateway start the Gateway answers only after its services are up, and the Worker pool
// service is up only when every Worker reports ready: the call waits out its 30 s timeout and
// then resolves locally. V since 2026-10-07: Worker preparation 40-45 s at every restart
// instead of 7-10 s.
//
// The step now starts during preparation but readiness no longer waits for it: it completes
// once the Gateway answers (or falls back locally, as before) and activates the same in-memory
// snapshot. A turn that starts before it completes builds the snapshot itself, which is what
// every first turn did before #254. OPENCLAW_WORKER_EAGER_PREPARE_SECRETS=await restores the
// blocking step; =0 still turns it off.
import assert from 'node:assert/strict';

export const MARKER = '/* OPENCLAW_WORKER_PREWARM_SECRETS_DEFERRED_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchAgentCommandChunk(source) {
  assert(!source.includes(MARKER), 'agent command chunk already defers the secrets step');
  let out = replaceExactlyOnce(
    source,
    '\tconst secrets = process.env.OPENCLAW_WORKER_EAGER_PREPARE_SECRETS === "0" ? {} : await prewarmSecretsRuntimeSnapshot();\n',
    '\tconst secrets = process.env.OPENCLAW_WORKER_EAGER_PREPARE_SECRETS === "0" ? {} : process.env.OPENCLAW_WORKER_EAGER_PREPARE_SECRETS === "await" ? await prewarmSecretsRuntimeSnapshot() : startSecretsRuntimeSnapshot();\n',
    'secrets prewarm step',
  );
  out = replaceExactlyOnce(
    out,
    'async function prewarmSecretsRuntimeSnapshot() {\n',
    `${MARKER}
/** Start activating the secrets runtime snapshot without holding Worker readiness on it. */
function startSecretsRuntimeSnapshot() {
	if (getActiveSecretsRuntimeConfigSnapshot()) return { secretsPrepared: true };
	void prewarmSecretsRuntimeSnapshot().catch(() => {});
	return { secretsPrepared: "started" };
}
async function prewarmSecretsRuntimeSnapshot() {
`,
    'secrets prewarm function',
  );
  return out;
}
