import assert from 'node:assert/strict';

// Transcript projection rebuild reads each transcript row once instead of twice.
//
// visitSessionTranscriptProjection (session-transcript-index chunk) is the body of
// sessions.transcript-index.prepare in the reconcile Worker and of the synchronous rebuild of
// small sessions inside a writer transaction. It read every row of the session and JSON.parsed it
// to build the branch tree, then read the visible path again row by row (one statement per row)
// and JSON.parsed each of those rows a second time to extract the FTS entry and the active-row
// facts. The visible path is nearly the whole session (5863 of 6019 rows in the largest shared
// VLab session), so the second pass repeated the first one with a per-row query on top: on that
// 30 MB session prepare took 798 ms where one read + parse of all rows took 255 ms.
//
// Now the first pass also keeps, per row, the four facts the second pass derived from the parsed
// event (FTS entry, whether it projects an active row, whether that row carries a message, the
// context eligibility); the second pass walks the visible path (or all rows, as before) over
// those facts. Same functions, same events from the same snapshot, same order, so the visitor
// receives the same rows; only the second read and parse are gone.

export const TRANSCRIPT_PROJECTION_SINGLE_PASS_MARKER = '// transcript-projection-single-pass-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const PASS_ONE_BEFORE = `	let sourceIndexedSeq = -1;
	const tree = scanSessionTranscriptTree((function* () {
		for (const row of iterateSqliteQuerySync(db, query.orderBy("seq", "asc"))) {
			sourceIndexedSeq = row.seq;
			const event = JSON.parse(row.event_json);
			const navigation = { seq: row.seq };`;
const PASS_ONE_AFTER = `	let sourceIndexedSeq = -1;
	${TRANSCRIPT_PROJECTION_SINGLE_PASS_MARKER}: keep each row's projection facts from the tree pass instead of reading the path again
	const projectedRows = /* @__PURE__ */ new Map();
	const tree = scanSessionTranscriptTree((function* () {
		for (const row of iterateSqliteQuerySync(db, query.orderBy("seq", "asc"))) {
			sourceIndexedSeq = row.seq;
			const event = JSON.parse(row.event_json);
			const projectsActiveEvent = shouldProjectActiveEvent(event);
			projectedRows.set(row.seq, {
				seq: row.seq,
				indexed: extractTranscriptIndexEntry(event, row.created_at),
				projectsActiveEvent,
				projectsMessage: projectsActiveEvent && hasTranscriptMessage(event),
				contextEligible: projectsActiveEvent ? transcriptEventContextEligibility(event) : void 0
			});
			const navigation = { seq: row.seq };`;

const PASS_TWO_BEFORE = `	const rows = visiblePath.length > 0 ? (function* () {
		const read = prepareSqliteQuerySync(db, (parameter) => query.where("seq", "=", parameter((seq) => seq)));
		for (const node of visiblePath) yield* read(node.entry.seq).rows;
	})() : tree.hasLeafControl ? [] : iterateSqliteQuerySync(db, query.orderBy("seq", "asc"));
	let activeEventCount = 0;
	let activeMessageCount = 0;
	for (const row of rows) {
		const event = JSON.parse(row.event_json);
		const indexed = extractTranscriptIndexEntry(event, row.created_at);
		if (indexed) visitor.ftsRow(indexed);
		if (!shouldProjectActiveEvent(event)) continue;
		const projectsMessage = hasTranscriptMessage(event);
		visitor.activeRow({
			activePosition: activeEventCount++,
			contextEligible: transcriptEventContextEligibility(event),
			eventSeq: row.seq,
			messagePosition: projectsMessage ? activeMessageCount++ : null
		});
	}`;
const PASS_TWO_AFTER = `	const rows = visiblePath.length > 0 ? (function* () {
		for (const node of visiblePath) {
			const projected = projectedRows.get(node.entry.seq);
			if (projected) yield projected;
		}
	})() : tree.hasLeafControl ? [] : projectedRows.values();
	let activeEventCount = 0;
	let activeMessageCount = 0;
	for (const row of rows) {
		if (row.indexed) visitor.ftsRow({ ...row.indexed });
		if (!row.projectsActiveEvent) continue;
		visitor.activeRow({
			activePosition: activeEventCount++,
			contextEligible: row.contextEligible,
			eventSeq: row.seq,
			messagePosition: row.projectsMessage ? activeMessageCount++ : null
		});
	}`;

export function patchTranscriptProjectionSinglePass(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_SINGLE_PASS_MARKER), 'Already patched');
  let next = replaceExactlyOnce(source, PASS_ONE_BEFORE, PASS_ONE_AFTER, 'projection tree pass');
  next = replaceExactlyOnce(next, PASS_TWO_BEFORE, PASS_TWO_AFTER, 'projection path pass');
  return next;
}
