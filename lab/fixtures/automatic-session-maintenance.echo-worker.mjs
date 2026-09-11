import { parentPort, workerData } from "node:worker_threads";

const until = Date.now() + (workerData.testBusyMs ?? 0);
while (Date.now() < until) {
  // This deliberately blocks only the isolated fixture Worker.
}

parentPort.postMessage({
  type: "result",
  plan: {
    archived: 0,
    capped: 0,
    entryRemovals: [],
    modelRunPruned: 0,
    plannedEntryArchives: [],
    pruned: 0,
    stateDeletePlans: [],
  },
});
parentPort.close();
