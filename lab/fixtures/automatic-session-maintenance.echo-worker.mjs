import { parentPort, workerData } from "node:worker_threads";

const request = parentPort ? workerData : await new Promise((resolve, reject) => {
  process.once("message", resolve);
  process.once("disconnect", () => reject(new Error("owner disconnected")));
});
const postMessage = (message) => parentPort ? parentPort.postMessage(message) : process.send(message);
const closeChannel = () => parentPort ? parentPort.close() : process.disconnect();

const until = Date.now() + (request.testBusyMs ?? 0);
while (Date.now() < until) {
  // This deliberately blocks only the isolated fixture Worker.
}

postMessage({
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
closeChannel();
