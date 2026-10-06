import assert from 'node:assert/strict';

// Worker: keep idle prepared model runtime owners between turns (worker-retain-run-owners).
//
// Every Worker turn builds the prepared model runtime snapshot twice from scratch: once for
// the Worker's own lease in runAgent (agentId/agentDir/workspace) and once for the embedded
// attempt's lease (same agent plus runtimePluginSelections, bound to the Worker lease's
// plugin generation). A run owner is deleted as soon as its last lease is released unless it
// is retained, and OpenClaw only retains idle run owners while the Gateway lifecycle is
// active (retainedGatewayRunOwners, up to 8) or for a direct run without config
// (retainedDirectRunOwners, 1). The Worker is neither, so the next turn rebuilds both:
// buildSnapshotBatch -> prepareWorkspaceBuildGroup -> applyPluginAutoEnable (channel catalog,
// bundled plugin dir, plugin activation) on the Worker's main thread.
//
// VLab CPU profile 2026-10-06 (resident Worker, 16 text messages at 4 parallel, 4 turns on
// this Worker): two builds per turn, 64-128 ms each, about 150 ms of synchronous work per
// turn out of ~700 ms busy between worker-command-enter and model-call-enter. With three
// sessions per Worker every turn also waits for the other sessions' builds.
//
// In the Worker process (the native attempt bridge is installed only there), run owners are
// now retained the same way the Gateway retains them: the same bounded retention, cleared by
// the same config publication path. A turn then finds its owner published and takes the
// existing path (prepareModelRuntimeSnapshot returns the owner's snapshot), and the embedded
// lease's plugin generation is unchanged, so its owner is reused too.
// Guards, for idle owners only (owners shared by overlapping leases behave as today):
//   - a retained owner whose config no longer matches the turn's config is rebuilt (owner
//     keys do not include the config). Config changes normally roll the Worker generation
//     (worker-generations), so this only matters inside one process;
//   - a retained snapshot older than OPENCLAW_WORKER_RETAIN_RUN_OWNERS_TTL_MS (default
//     300000) is rebuilt, so facts another process changes (auth profiles written by the
//     Gateway, persisted plugin model catalogs) are re-read at most that late. Today a Worker
//     re-reads them every turn; the Gateway's own retained owners have no age bound.
// OPENCLAW_WORKER_RETAIN_RUN_OWNERS=0 restores per-turn rebuilds.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const STALE_DYNAMIC_OWNER = `		let staleDynamicOwner = existing?.needsRefresh && !existing.pending && (existing.provenance === "run" || existing.provenance === "ephemeral");
		if (context.getGatewayLifecycleActive() && provenance === "run"`;

const STALE_DYNAMIC_OWNER_GUARDED = `		let staleDynamicOwner = existing?.needsRefresh && !existing.pending && (existing.provenance === "run" || existing.provenance === "ephemeral");
		if (!staleDynamicOwner && provenance === "run" && existing?.provenance === "run" && !existing.pending && (existing.leaseCount ?? 0) === 0 && workerRetainsRunOwners() && !workerRetainedRunOwnerReusable(existing, input)) staleDynamicOwner = true;
		if (context.getGatewayLifecycleActive() && provenance === "run"`;

const RETAIN = `	else if (provenance === "run" && context.getGatewayLifecycleActive()) context.retainedGatewayRunOwners.retain(key, owner, context.owners);`;
const RETAIN_WORKER = `	else if (provenance === "run" && context.getGatewayLifecycleActive()) context.retainedGatewayRunOwners.retain(key, owner, context.owners);
	else if (provenance === "run" && workerRetainsRunOwners()) retainWorkerRunOwner(key, owner, context);`;

const LEASE_REGION = `//#region src/agents/prepared-model-runtime-lease.ts
`;
const LEASE_REGION_WITH_HELPER = `//#region src/agents/prepared-model-runtime-lease.ts
// OPENCLAW_WORKER_RETAIN_RUN_OWNERS_V1: the isolated Worker installs the native attempt
// bridge before it loads OpenClaw; the Gateway never does.
function workerRetainsRunOwners() {
	return globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")] !== void 0 && process.env.OPENCLAW_WORKER_RETAIN_RUN_OWNERS !== "0";
}
// An idle retained owner is reused only for the same config and within a bounded age, so
// state another process changes (auth profiles, plugin catalogs) is re-read at that cadence.
const workerRetainedSnapshotBuiltAt = /* @__PURE__ */ new WeakMap();
function workerRetainedRunOwnerTtlMs() {
	const configured = Number(process.env.OPENCLAW_WORKER_RETAIN_RUN_OWNERS_TTL_MS ?? 3e5);
	return Number.isFinite(configured) ? Math.max(0, configured) : 3e5;
}
function workerRetainedRunOwnerReusable(owner, input) {
	const builtAt = owner.snapshot ? workerRetainedSnapshotBuiltAt.get(owner.snapshot) : void 0;
	return builtAt !== void 0 && Date.now() - builtAt < workerRetainedRunOwnerTtlMs() && preparedModelRuntimeConfigsMatch(owner.input.config, input.config);
}
function retainWorkerRunOwner(key, owner, context) {
	if (owner.snapshot && !workerRetainedSnapshotBuiltAt.has(owner.snapshot)) workerRetainedSnapshotBuiltAt.set(owner.snapshot, Date.now());
	context.retainedGatewayRunOwners.retain(key, owner, context.owners);
}
`;

export function patchPreparedModelRuntimeChunk(source) {
  assert.equal(source.includes('OPENCLAW_WORKER_RETAIN_RUN_OWNERS_V1'), false, 'chunk is already patched');
  let out = replaceExactlyOnce(source, LEASE_REGION, LEASE_REGION_WITH_HELPER, 'lease region');
  out = replaceExactlyOnce(out, STALE_DYNAMIC_OWNER, STALE_DYNAMIC_OWNER_GUARDED, 'stale dynamic owner check');
  out = replaceExactlyOnce(out, RETAIN, RETAIN_WORKER, 'gateway run owner retention');
  return out;
}
