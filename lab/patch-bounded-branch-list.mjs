import assert from 'node:assert/strict';

// sessions.branches.list on V's largest sessions (265 MB, 26k rows) parses every transcript row on
// the Gateway main thread. (Investigated after the 2026-10-19 02:20 stall; that stall was not this
// read: see lab/bounded-branch-list.md.)
export const MARKER = 'bounded-branch-list-v1';
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one anchor: ${before.slice(0, 100)}`);
  return source.replace(before, after);
};

// sessions.branches.list parsed every transcript row (base64 images included) to build the
// branch tree. The tree needs only navigation facts, which the native reset-boundary projection
// already selects in SQL (navigation keys, timestamp, message.role); a branch headline needs
// one message body, read by seq inside the same read snapshot.
export function patchSessionAccessor(source) {
  assert(!source.includes(MARKER));
  let output = replace(source,
    '\tconst branches = summarizeSessionBranches(loadTranscriptEventsFromDatabase(database, sessionId));\n',
    '\tconst branches = readSessionBranchSummariesBounded(database, sessionId);\n');
  const helper = `// ${MARKER}: tree facts from SQL navigation rows; headline bodies are read one row at a time.
function readSessionBranchSummariesBounded(database, sessionId) {
\tconst read = () => {
\t\tconst db = getSessionKysely(database.db);
\t\tconst events = loadTranscriptEventsFromDatabase(database, sessionId, { projection: "reset-boundary" });
\t\tconst seqs = executeSqliteQuerySync(database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "asc")).rows.map((row) => row.seq);
\t\tif (seqs.length !== events.length) throw new Error("Branch navigation rows changed inside one read snapshot");
\t\tconst readHeadline = (index) => {
\t\t\tconst row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("event_json").where("session_id", "=", sessionId).where("seq", "=", seqs[index]));
\t\t\tif (!row) throw new Error("Branch headline row is missing from the read snapshot");
\t\t\treturn extractHeadlineText(asOptionalRecord(JSON.parse(row.event_json))?.message);
\t\t};
\t\treturn summarizeSessionBranchesBounded(events, readHeadline);
\t};
\treturn database.db.isTransaction ? read() : runSqliteDeferredTransactionSync(database.db, read, {
\t\tdatabaseLabel: database.path,
\t\toperationLabel: "session branch summaries read"
\t});
}
/** Same tree, order and counts as summarizeSessionBranches; a headline is the nearest message
* on the path (tip first) whose text is non-empty, so only those bodies are parsed. */
function summarizeSessionBranchesBounded(events, readHeadline) {
\tconst tree = scanSessionTranscriptTree(events);
\tconst pathSummaries = /* @__PURE__ */ new Map();
\tconst headlines = /* @__PURE__ */ new Map();
\treturn sessionBranchTipNodes(tree).toSorted((left, right) => Number(right.id === tree.leafId) - Number(left.id === tree.leafId) || right.index - left.index).map((node) => summarizeSessionBranchBounded(tree, tree.byId.get(node.id), pathSummaries, headlines, readHeadline));
}
function summarizeSessionBranchBounded(tree, leaf, summaries, headlines, readHeadline) {
\tconst uncachedPath = [];
\tconst seen = /* @__PURE__ */ new Set();
\tlet current = leaf;
\twhile (!summaries.has(current.id)) {
\t\tif (seen.has(current.id)) {
\t\t\tuncachedPath.length = 0;
\t\t\tbreak;
\t\t}
\t\tseen.add(current.id);
\t\tuncachedPath.push(current);
\t\tconst parent = current.parentId === null ? void 0 : tree.byId.get(current.parentId);
\t\tif (!parent) break;
\t\tcurrent = parent;
\t}
\tlet summary = summaries.get(current.id);
\tfor (const node of uncachedPath.toReversed()) {
\t\tconst record = asOptionalRecord(node.entry);
\t\tconst role = record?.type === "message" ? asOptionalRecord(record.message)?.role : void 0;
\t\tsummary = {
\t\t\tcandidate: role === "user" || role === "assistant" ? {
\t\t\t\tindex: node.index,
\t\t\t\tprevious: summary?.candidate
\t\t\t} : summary?.candidate,
\t\t\tmessageCount: (summary?.messageCount ?? 0) + (record?.type === "message" ? 1 : 0)
\t\t};
\t\tsummaries.set(node.id, summary);
\t}
\tconst timestamp = asOptionalRecord(leaf.entry)?.timestamp;
\treturn {
\t\tleafEntryId: leaf.id,
\t\theadline: truncateBranchHeadline(resolveSessionBranchHeadline(summary?.candidate, headlines, readHeadline) ?? ""),
\t\tmessageCount: summary?.messageCount ?? 0,
\t\t...typeof timestamp === "string" && timestamp.trim() ? { updatedAt: timestamp } : {},
\t\tactive: tree.leafId === leaf.id
\t};
}
function resolveSessionBranchHeadline(candidate, headlines, readHeadline) {
\tconst unresolved = [];
\tlet headline;
\tfor (let current = candidate; current; current = current.previous) {
\t\tif (headlines.has(current)) {
\t\t\theadline = headlines.get(current);
\t\t\tbreak;
\t\t}
\t\tunresolved.push(current);
\t\theadline = readHeadline(current.index);
\t\tif (headline !== void 0) break;
\t}
\tfor (const entry of unresolved) headlines.set(entry, headline);
\treturn headline;
}
`;
  return replace(output, 'function summarizeSessionBranches(events) {', helper + 'function summarizeSessionBranches(events) {');
}
