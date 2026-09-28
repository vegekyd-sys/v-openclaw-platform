import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compileWorkflow, effectivePerInstance, fairShareOf, loadWorkflow, planNextActions } from "../src/index.mjs";
import { runSchedulerPass } from "../src/scheduler-pass.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(here, "../../../examples/workflows/xingqing-content-delivery.workflow.md");
const release = (concurrency) => ({ spec: { concurrency } });

test("perInstance is a floor; idle capacity is borrowed up to the burst cap", () => {
  // V, 2026-09-28: two 星擎夜班 D projects, board target 18.
  assert.equal(effectivePerInstance(release({ perInstance: 2 }), { fairShare: fairShareOf(18, 2) }), 6);
  assert.equal(effectivePerInstance(release({ perInstance: 2 }), { fairShare: 1 }), 2, "never below perInstance");
  assert.equal(effectivePerInstance(release({ perInstance: 2 }), { fairShare: 4 }), 4, "the fair share when it is below the cap");
  assert.equal(effectivePerInstance(release({ perInstance: 2 }), {}), 2, "no share: perInstance");
  assert.equal(effectivePerInstance(release({ perInstance: 2, maxPerInstance: 2 }), { fairShare: 9 }), 2, "a Workflow can pin its limit");
  assert.equal(effectivePerInstance(release({ perInstance: 2, maxPerInstance: 10 }), { fairShare: 9 }), 9);
  assert.equal(effectivePerInstance(release({ perInstance: 2 }), { fairShare: 9, burstFactor: 1 }), 2, "burstFactor 1 turns borrowing off");
  assert.equal(effectivePerInstance(release({}), { fairShare: 9 }), 3, "perInstance defaults to 1");
});

test("the scheduler splits the board among projects with work; a project waiting on timed releases keeps its floor", async () => {
  const instances = [
    { id: "DL-5", status: "active", workflowSha256: "d" },
    { id: "DL-7", status: "active", workflowSha256: "d" },
    { id: "GEE", status: "active", workflowSha256: "g" },
  ];
  const releases = { d: { manifest: release({ perInstance: 2 }) }, g: { manifest: release({ perInstance: 8 }) } };
  const cards = [
    { id: "a", status: "running", labels: ["instance:DL-5"] },
    { id: "b", status: "ready", labels: ["instance:DL-7"] },
    { id: "c", status: "scheduled", labels: ["instance:GEE"], metadata: { automation: { scheduledAt: Date.now() + 3_600_000 } } },
  ];
  const seen = {};
  const result = await runSchedulerPass({
    maxWorkboardActive: 18,
    store: {
      listInstances: () => instances,
      getInstanceControl: () => ({ automaticDispatch: true, fault: null }),
      setInstanceControl() {},
      getRelease: (sha) => releases[sha],
      listStageRuns: () => [],
      listContentItemRuns: () => [],
      appendEvent() {},
    },
    workboard: {},
    refreshCards: async () => cards,
    syncContentItemsManifest: async () => {},
    runtime: { tick: async (id, options) => { seen[id] = options.perInstanceLimit; return { applied: [], dispatch: null }; } },
  });
  assert.deepEqual(seen, { "DL-5": 6, "DL-7": 6, GEE: 8 });
  assert.deepEqual(result.perInstanceLimits, seen);
});

test("planning creates cards up to this pass's limit", async () => {
  const compiled = compileWorkflow(await loadWorkflow(workflowPath));
  const instance = { id: "NS-C", status: "active", workflowSha256: compiled.metadata.workflowSha256, inputs: { authorizationScope: { paidProduction: true } }, agentBindings: { "content-operator": "main" } };
  const contentItems = Array.from({ length: 12 }, (_, index) => ({ id: `v-${index}`, title: `V${index}`, route: "SCENE_EDIT" }));
  const runs = compiled.spec.stages.filter((stage) => (stage.scope ?? "project") === "project").map((stage) => ({ stageId: stage.id, status: "done" }));
  const base = planNextActions({ release: compiled, instance, runs, contentItems, contentItemRuns: [] });
  const wider = planNextActions({ release: compiled, instance, runs, contentItems, contentItemRuns: [], perInstanceLimit: 11 });
  const perInstance = compiled.spec.concurrency.perInstance;
  assert.equal(base.length, Math.min(perInstance, contentItems.length));
  assert.equal(wider.length, 11);
});
