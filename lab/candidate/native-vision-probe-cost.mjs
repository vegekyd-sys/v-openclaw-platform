// Candidate measurement for image-hold: what the media-understanding native-vision probe
// costs. runner.ts activeModelSupportsNativeVision() asks loadPreparedModelCatalog() for
// the active model without readOnly, which materializes the FULL model catalog
// (snapshot.loadFullModelCatalog) on the turn path; prepared-model-catalog.ts says turn-path
// capability reads must reuse the published generation or a scoped read-only catalog.
// Times the full read and the scoped read-only read (the same call loadProviderScopedThinkingCatalog
// makes) three times each in a fresh process with the candidate's config, and reports
// whether both agree on vision support for the configured primary model.
import assert from "node:assert/strict";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime && process.env.OPENCLAW_CONFIG_PATH, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const { getRuntimeConfig } = await import(`${dist}/io.runtime-CKu7Rw0j.js`).then((m) => ({ getRuntimeConfig: m.n ?? m.getRuntimeConfig }));
const catalogApi = await import(`${dist}/prepared-model-catalog-BQXfkgza.js`);
const { findModelInCatalog, modelSupportsVision } = await import(`${dist}/model-catalog-DRobr014.js`);
const config = getRuntimeConfig();
const primary = String(config.agents?.defaults?.model?.primary ?? config.agents?.defaults?.model ?? "deepseek/deepseek-flash");
const [provider, ...rest] = primary.split("/"); const model = rest.join("/");
const agentId = "makaron";
const time = async (label, params) => {
  const runs = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = performance.now(); let vision, error, entries;
    try { const catalog = await catalogApi.loadPreparedModelCatalog(params); entries = catalog.length; vision = modelSupportsVision(findModelInCatalog(catalog, provider, model)); }
    catch (e) { error = String(e?.message ?? e).slice(0, 200); }
    runs.push({ ms: Math.round(performance.now() - t0), vision, entries, error });
  }
  return { label, runs };
};
const out = { primary, results: [] };
out.results.push(await time("scoped-read-only", { config, agentId, readOnly: true, providerDiscoveryProviderIds: [provider] }));
out.results.push(await time("full (current probe)", { config, agentId }));
out.results.push(await time("scoped-read-only after full", { config, agentId, readOnly: true, providerDiscoveryProviderIds: [provider] }));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
