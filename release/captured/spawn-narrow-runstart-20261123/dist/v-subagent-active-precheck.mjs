// subagent-active-precheck: can this session have an active subagent at all?
//
// False only when every run the prompt addition could list as active has ended and finished cleanup,
// checked through the existing session-key indexes. Any doubt answers true, and the caller takes the
// original whole-registry path. See lab/subagent-active-precheck.md.
const BATCH = 200;
const MAX_ROWS = 5000;

const settled = (status, endedAt, cleanupCompletedAt) => status === "terminal" && typeof endedAt === "number" && typeof cleanupCompletedAt === "number";

export function indexInMemoryRuns(runs) {
  const byRequester = new Map();
  const byController = new Map();
  const push = (map, key, entry) => {
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  };
  for (const entry of runs.values()) {
    if (entry.requesterSessionKey) push(byRequester, entry.requesterSessionKey.trim(), entry);
    const controller = entry.controllerSessionKey?.trim();
    if (controller) push(byController, controller, entry);
  }
  return { byRequester, byController };
}

export function mayHaveActiveSubagentRuns(db, inMemoryRuns, rootSessionKey) {
  const root = rootSessionKey.trim();
  if (!root) return false;
  const memory = indexInMemoryRuns(inMemoryRuns);
  const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");
  const select = `SELECT child_session_key AS child, json_extract(payload_json, '$.execution.status') AS status, json_extract(payload_json, '$.execution.endedAt') AS endedAt, json_extract(payload_json, '$.cleanupCompletedAt') AS cleanupCompletedAt FROM subagent_runs`;
  const visited = new Set([root]);
  let frontier = [root];
  let rows = 0;
  const visitChild = (child, next) => {
    const key = child?.trim();
    if (key && !visited.has(key)) {
      visited.add(key);
      next.push(key);
    }
  };
  for (let includeController = true; frontier.length > 0; includeController = false) {
    const next = [];
    for (let offset = 0; offset < frontier.length; offset += BATCH) {
      const keys = frontier.slice(offset, offset + BATCH);
      const marks = placeholders(keys.length);
      const scoped = includeController
        ? db.prepare(`${select} WHERE controller_session_key IN (${marks}) OR requester_session_key IN (${marks})`).all(...keys, ...keys)
        : db.prepare(`${select} WHERE requester_session_key IN (${marks})`).all(...keys);
      rows += scoped.length;
      if (rows > MAX_ROWS) return true;
      for (const row of scoped) {
        if (!settled(row.status, row.endedAt, row.cleanupCompletedAt)) return true;
        visitChild(row.child, next);
      }
      for (const key of keys) {
        const held = [...memory.byRequester.get(key) ?? [], ...includeController ? memory.byController.get(key) ?? [] : []];
        for (const entry of held) {
          if (!settled(entry.execution?.status, entry.execution?.endedAt, entry.cleanupCompletedAt)) return true;
          visitChild(entry.childSessionKey, next);
        }
      }
    }
    frontier = next;
  }
  return false;
}
