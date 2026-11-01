// subagent-control-scoped-read: the runs buildControlledSubagentRunsReadContext depends on for one session,
// in the whole snapshot's order, instead of every persisted run.
//
// Visible runs have the key as controller or requester, and the latest-generation and pending-descendant
// answers read their children's other generations and everything below them along the requester edge.
// loadTree returns exactly that closure (rootKeys [key]); the in-memory runs of the same closure replace
// their persisted copies by run id, as in getSubagentRunsSnapshot. Returns null when the tree is above the
// row budget, and the caller reads the whole registry.
export function loadControlledSubagentRuns({ key, inMemoryRuns, loadTree, maxRuns }) {
  const tree = loadTree({ maxRuns, controllerKey: key, rootKeys: [key], inMemoryRuns: inMemoryRuns.values() });
  if (!tree) return null;
  const runs = new Map();
  for (const entry of tree.runs) runs.set(entry.runId, entry);
  for (const [runId, entry] of inMemoryRuns) {
    if (runs.has(runId) || tree.childKeys.has(entry.childSessionKey.trim()) || tree.requesterKeys.has(entry.requesterSessionKey) || (entry.controllerSessionKey?.trim() || entry.requesterSessionKey) === key) runs.set(runId, entry);
  }
  return runs;
}
