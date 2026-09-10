// Undo only named candidate changes, then verify all remaining native bytes.
import assert from 'node:assert/strict';
function once(source, from, to) {
  assert.equal(source.split(from).length,2,'cold-start patch anchor drift');
  return source.replace(from,to);
}
export function restoreDemandExpansion(source) {
  source=once(source,'import { availableParallelism } from "node:os";\n','');
  source=once(source,'    this.maxConcurrentStarts = options.maxConcurrentStarts ??\n      Math.min(this.maxWorkers, 4, availableParallelism());\n','');
  source=once(source,'    if (!Number.isInteger(this.maxConcurrentStarts) || this.maxConcurrentStarts < 1 ||\n        this.maxConcurrentStarts > this.maxWorkers)\n      throw new Error("maxConcurrentStarts must be an integer from 1 to maxWorkers");\n','');
  const candidate=`          // Account for every starting process and distinct unowned session.
          // A burst may start bounded capacity now, without waiting for one
          // boot promise per wave or spawning once per queued turn.
          this.ensureDemandWorkers();`;
  const original=`          // Readiness is an event, not a queue-wide lock. An existing Worker
          // may finish a turn while another process is still booting; its
          // completion must be able to pump pending work immediately.
          // Preserve the original warm-spare + one demand-start concurrency,
          // without letting repeated pumps fork one process per queued job.
          if (!this.capacityStartupPromise && this.workers.size < this.maxWorkers) {
            const startup = this.spawn(this.findAvailableSlot());
            this.capacityStartupPromise = startup;
            void startup.then(() => {
              if (this.capacityStartupPromise === startup) this.capacityStartupPromise = null;
              this.requestPump();
            }, (error) => {
              if (this.capacityStartupPromise === startup) this.capacityStartupPromise = null;
              const failure = toError(error);
              for (const pending of this.pending.splice(0)) pending.reject(failure);
            });
          }`;
  source=once(source,candidate,original);
  const methods=source.slice(source.indexOf('  startingWorkerCount() {'),source.indexOf('  async ensureMinimumWorkers() {'));
  assert.ok(methods.startsWith('  startingWorkerCount() {')&&methods.includes('  ensureDemandWorkers() {'));
  source=once(source,methods,'');
  source=once(source,'      this.startingWorkerCount() < this.maxConcurrentStarts &&\n','');
  return once(source,'      maxConcurrentStarts: this.maxConcurrentStarts,\n','');
}
export function restoreColdConfigSharing(source) {
  source=once(source,'import { shareColdConfigPreparation } from "./cold-config-singleflight.mjs";\n','');
  const start=source.indexOf('async function resolveAgentRuntimeConfig(');
  const end=source.indexOf('async function resolveAgentRuntimeConfigUnshared(runtime, params, loadedRaw) {',start);
  assert.ok(start>0&&end>start);
  const wrapper=source.slice(start,end)+'async function resolveAgentRuntimeConfigUnshared(runtime, params, loadedRaw) {';
  source=once(source,wrapper,'async function resolveAgentRuntimeConfig(runtime, params) {\n\tconst loadedRaw = getRuntimeConfig();');
  return once(source,'\t}, runtimeContext);\n\tconst normalizedSpawned = normalizeSpawnedRunMetadata({','\t});\n\tconst normalizedSpawned = normalizeSpawnedRunMetadata({');
}
