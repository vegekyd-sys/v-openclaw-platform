import assert from 'node:assert/strict';

// Media-understanding native-vision probe off the full model catalog (image-hold), on V's
// 2026.9.1 bytes (runner-BIhCXp3h.js is unmodified upstream on V).
//
// Every Feishu message with an image waits in the Gateway before the Worker harness:
// production V 2026-10-04..06, 18 image messages, "dispatching to agent" ->
// gateway-harness-enter 0.9-71.8 s (median ~17 s); message 3389 (2026-10-06 02:35) 12.7 s,
// with two "Worker config derivation" lines inside the wait and nothing else. Text
// messages: 0.7-2.6 s. The image is handed to the model natively (deepseek-flash declares
// image input; no image description reaches the transcript), so the wait is not an image
// description call.
//
// Cause: media understanding runs for every inbound image (get-reply ->
// applyMediaUnderstanding -> runCapability("image")). Before handing the image to the
// primary model natively it asks activeModelSupportsNativeVision(), which calls
// loadPreparedModelCatalog() without readOnly; that materializes the FULL model catalog
// (snapshot.loadFullModelCatalog: every provider's discovery) on the turn path.
// prepared-model-catalog.ts itself says turn-path capability reads must reuse the
// published generation or a scoped read-only catalog (loadProviderScopedThinkingCatalog).
// VLab candidate (fresh process, candidate config): full catalog 16.9 s first call, then
// cached; scoped read-only for the active provider 0.54 s first, 0.14-0.15 s after; same
// vision answer. On V the full catalog is rebuilt whenever its generation turns over.
//
// Fix: the probe first asks the catalog the current generation has already completed
// (getAvailablePreparedModelCatalogSnapshot: no discovery), then the scoped read-only
// catalog for the active provider (the published generation, else that provider's
// read-only metadata). Only when neither has an entry for the active model does it fall back
// to the full read it did before; where a catalog has the entry, the entry is the same
// model fact the full catalog would return.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchRunner(source) {
  return replaceExactlyOnce(
    source,
    `	const { findModelInCatalog, loadPreparedModelCatalog, modelSupportsVision } = await loadPreparedModelCatalogApi();
	return modelSupportsVision(findModelInCatalog(await loadPreparedModelCatalog({
		config: params.cfg,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.agentDir ? { agentDir: params.agentDir } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}
	}), activeProvider, params.activeModel?.model ?? ""));
}`,
    `	const { findModelInCatalog, getAvailablePreparedModelCatalogSnapshot, loadPreparedModelCatalog, modelSupportsVision } = await loadPreparedModelCatalogApi();
	const catalogParams = {
		config: params.cfg,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.agentDir ? { agentDir: params.agentDir } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}
	};
	// image-hold: a turn-path capability read; stay off a full catalog build unless neither
	// the catalog this generation already has nor the scoped read-only one knows the model
	let availableCatalog;
	try {
		availableCatalog = getAvailablePreparedModelCatalogSnapshot(catalogParams);
	} catch {}
	const availableEntry = availableCatalog ? findModelInCatalog(availableCatalog.entries ?? [], activeProvider, params.activeModel?.model ?? "") : void 0;
	if (availableEntry) return modelSupportsVision(availableEntry);
	const scopedEntry = findModelInCatalog(await loadPreparedModelCatalog({
		...catalogParams,
		readOnly: true,
		providerDiscoveryProviderIds: [activeProvider]
	}).catch(() => []), activeProvider, params.activeModel?.model ?? "");
	if (scopedEntry) return modelSupportsVision(scopedEntry);
	return modelSupportsVision(findModelInCatalog(await loadPreparedModelCatalog(catalogParams), activeProvider, params.activeModel?.model ?? ""));
}`,
    'native vision probe',
  );
}
