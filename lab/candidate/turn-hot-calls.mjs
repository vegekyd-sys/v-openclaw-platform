// Candidate microbenchmark for turn-caches: per-call cost of the helpers the warm Worker
// turn profile shows hot (isVitestRuntimeEnv, resolveBundledPluginsDir,
// listBundledChannelCatalogEntries, normalizeChatChannelId), in a fresh process with the
// candidate's environment. Dividing a profile's self time by these costs estimates calls
// per turn.
import assert from "node:assert/strict";
import path from "node:path";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const { n: isVitestRuntimeEnv } = await import(`${dist}/test-runtime-env-DQDRzsLt.js`);
const { i: resolveBundledPluginsDir } = await import(`${dist}/bundled-dir-CnR4u-Mo.js`);
const { n: listBundledChannelCatalogEntries } = await import(`${dist}/bundled-channel-catalog-read-BwcurWAL.js`);
const { i: normalizeChatChannelId } = await import(`${dist}/ids-DeNBb0Rp.js`);
const bench = (label, fn, n = 20000) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i += 1) fn(); return { label, usPerCall: +(((performance.now() - t0) * 1000) / n).toFixed(2) }; };
console.log(JSON.stringify([
  bench("isVitestRuntimeEnv()", () => isVitestRuntimeEnv()),
  bench("resolveBundledPluginsDir()", () => resolveBundledPluginsDir()),
  bench("listBundledChannelCatalogEntries()", () => listBundledChannelCatalogEntries()),
  bench("normalizeChatChannelId('feishu')", () => normalizeChatChannelId("feishu")),
  bench("normalizeChatChannelId('webchat')", () => normalizeChatChannelId("webchat")),
], null, 1));
process.exit(0);
