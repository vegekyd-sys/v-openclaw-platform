import { a as asOptionalRecord, c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { a as iterateSqliteQuerySync, n as executeSqliteQuerySync, o as prepareSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { a as getOwnedSessionTranscriptInitialWriter, t as SessionTranscriptWriterClaimReboundError } from "./transcript-write-context-mhuh2Sos.js";
import { A as iterateSessionContextEntries, j as iterateSessionContextMessages, k as buildSessionContext } from "./compaction-DlElLXrZ.js";
import { a as isSessionContextMetadataEntry, c as migrateToCurrentVersion, d as parseParentLinkedOpaqueEntry, h as generateSessionEntryId, i as isIndexedSessionEntry, m as createManagedSessionId, p as partitionSessionFileEntries, u as parseOpaqueLeafEntry } from "./session-manager-codec-CaIkXyYs.js";
import "./version-Bsehiavt.js";
import { t as applyAssistantDeliveryDirectives } from "./transcript-assistant-delivery-B70XwVDs.js";
import { F as projectModelContextEventSql, G as getCodeModeSourceAppend, I as projectModelContextNavigationSql, M as SessionTranscriptReadFenceError, N as resolveSqliteSessionTranscriptReadFence, P as runWithSessionTranscriptReadFence, U as copyCodeModeSourceAppend, W as copyCodeModeSourceAppendOptions, b as loadTranscriptEventsSync } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { C as ensureSessionEntrySync, d as loadSessionEntry, v as replaceSessionEntrySync } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { c as projectCanonicalSessionEntryShape } from "./store-writer-state-_Y6b9Vjm.js";
import { d as resolveSqliteTranscriptReadScope, i as getSessionKysely, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { c as scanSessionTranscriptTree, d as selectSessionTranscriptTreePathNodes, r as isSessionTranscriptSideAppendEntry } from "./transcript-tree-BH69pMSi.js";
import { C as withCurrentProjectionSnapshot, Ct as withTranscriptWriteTransaction, Et as readActiveTranscriptEntryAnchor, _ as normalizeVisibleMessageLimit, bt as replaceTranscriptEventsSync, g as MAX_VISIBLE_MESSAGE_MAX_MESSAGES, gt as appendTranscriptEventSync, h as MAX_VISIBLE_MESSAGE_MAX_BYTES, m as DEFAULT_VISIBLE_MESSAGE_MAX_MESSAGES, p as DEFAULT_VISIBLE_MESSAGE_MAX_BYTES, vt as appendTranscriptMessageSync, x as getActiveTranscriptKysely } from "./session-accessor-K0XuW6ln.js";
import { sql } from "kysely";
import { isCompactionReplayCheckpoint } from "@openclaw/ai/transports";
//#region src/config/sessions/session-accessor.sqlite-active-context.ts
function readBoundedRetentionRanges(projection, rows, headerOffset) {
	const sequences = /* @__PURE__ */ new Map();
	const cuts = rows.flatMap(({ event, seq }, endIndex) => {
		const entry = asOptionalRecord(event);
		if (typeof entry?.id !== "string") return [];
		sequences.set(entry.id, seq);
		return (entry.type === "compaction" || entry.type === "reset") && typeof entry.firstKeptEntryId === "string" ? [{
			id: entry.id,
			firstKeptEntryId: entry.firstKeptEntryId,
			endIndex
		}] : [];
	});
	const missing = [...new Set(cuts.map((cut) => cut.firstKeptEntryId))].filter((id) => !sequences.has(id));
	if (missing.length > 0) {
		const lastSelectedSeq = Math.max(...rows.map((row) => row.seq));
		const db = getActiveTranscriptKysely(projection.database);
		const anchors = executeSqliteQuerySync(projection.database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).select(["identity.event_id", "identity.seq"]).where("identity.session_id", "=", projection.resolved.sessionId).where("identity.event_id", "in", missing).where("identity.seq", "<=", lastSelectedSeq)).rows;
		for (const anchor of anchors) sequences.set(anchor.event_id, anchor.seq);
	}
	const ranges = /* @__PURE__ */ new Map();
	for (const cut of cuts) {
		const firstSeq = sequences.get(cut.firstKeptEntryId);
		if (firstSeq === void 0) continue;
		const start = rows.findIndex(({ seq }, index) => index < cut.endIndex && seq >= firstSeq);
		ranges.set(cut.id, {
			startIndex: (start < 0 ? cut.endIndex : start) + headerOffset,
			endIndex: cut.endIndex + headerOffset
		});
	}
	return ranges;
}
/** Reads one byte-bounded active branch without materializing abandoned transcript history. */
function readSessionTranscriptBoundedActiveContextCore(scope, options) {
	const maxBytes = normalizeVisibleMessageLimit(options.maxBytes, DEFAULT_VISIBLE_MESSAGE_MAX_BYTES, MAX_VISIBLE_MESSAGE_MAX_BYTES, "maxBytes");
	const maxEvents = normalizeVisibleMessageLimit(options.maxEvents, DEFAULT_VISIBLE_MESSAGE_MAX_MESSAGES, MAX_VISIBLE_MESSAGE_MAX_MESSAGES, "maxEvents");
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const db = getActiveTranscriptKysely(projection.database);
		const fence = resolveSqliteSessionTranscriptReadFence({
			database: projection.database,
			...projection.resolved
		});
		const transcript = db.selectFrom("transcript_events").where("session_id", "=", projection.resolved.sessionId);
		const header = executeSqliteQueryTakeFirstSync(projection.database.db, transcript.select("seq").where(sql`json_extract(event_json, '$.type')`, "=", "session").orderBy("seq", "asc").limit(1));
		const headerBytes = header ? executeSqliteQueryTakeFirstSync(projection.database.db, transcript.select(sql`OCTET_LENGTH(event_json) + 1`.as("serialized_bytes")).where("seq", "=", header.seq)).serialized_bytes : 0;
		if (headerBytes > maxBytes) throw new RangeError("Session transcript header exceeds the active-context byte limit");
		const metadata = executeSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select(["active.event_seq", sql`OCTET_LENGTH(event.event_json) + 1`.as("serialized_bytes")]).where("active.session_id", "=", projection.resolved.sessionId).$if(fence !== void 0, (query) => query.where("active.event_seq", "<", fence.beforeRawSeq)).where("active.context_eligible", "=", 1).orderBy("active.active_position", "desc").limit(maxEvents + 1)).rows;
		const selectedSequences = [];
		let serializedBytes = headerBytes;
		for (const row of metadata) {
			if (selectedSequences.length >= maxEvents || serializedBytes + row.serialized_bytes > maxBytes) break;
			selectedSequences.push(row.event_seq);
			serializedBytes += row.serialized_bytes;
		}
		const boundary = executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom(db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).select((eb) => ["identity.seq", eb.fn.count("identity.seq").over().as("boundary_count")]).where("identity.session_id", "=", projection.resolved.sessionId).where("identity.event_type", "in", ["compaction", "reset"]).$if(fence !== void 0, (query) => query.where("identity.seq", "<", fence.beforeRawSeq)).orderBy("active.active_position", "desc").limit(1).as("boundary")).innerJoin("transcript_events as event", (join) => join.on("event.session_id", "=", projection.resolved.sessionId).onRef("event.seq", "=", "boundary.seq")).select([
			"boundary.seq",
			"boundary.boundary_count",
			sql`OCTET_LENGTH(event.event_json) + 1`.as("serialized_bytes")
		]));
		const contextSequences = selectedSequences.toSorted((left, right) => left - right);
		let injectedBoundarySeq;
		let boundaryOmitted = false;
		if (boundary && !selectedSequences.includes(boundary.seq)) {
			if (serializedBytes + boundary.serialized_bytes <= maxBytes) {
				injectedBoundarySeq = boundary.seq;
				contextSequences.unshift(boundary.seq);
				serializedBytes += boundary.serialized_bytes;
			} else boundaryOmitted = true;
		}
		const payloadSequences = header ? [header.seq, ...contextSequences] : contextSequences;
		const payloads = new Map((payloadSequences.length === 0 ? [] : executeSqliteQuerySync(projection.database.db, transcript.select(["seq", "event_json"]).where("seq", "in", payloadSequences)).rows).map((row) => [row.seq, JSON.parse(row.event_json)]));
		const events = header ? [payloads.get(header.seq)] : [];
		const rows = contextSequences.map((seq) => ({
			event: payloads.get(seq),
			seq
		}));
		const opaqueParents = /* @__PURE__ */ new Map();
		let previousId;
		for (const { event, seq } of rows) {
			const entry = asOptionalRecord(event);
			if (seq === injectedBoundarySeq) previousId = entry?.id;
			else if (entry && "id" in entry && "parentId" in entry) {
				if (typeof previousId === "string" && typeof entry.parentId === "string" && entry.parentId !== previousId) opaqueParents.set(entry.parentId, previousId);
				previousId = entry.id;
			}
			events.push(event);
		}
		const activeLeafEntryId = fence ? fence.admission.effectiveParentId : projection.state.leafEventId;
		if (activeLeafEntryId && previousId !== activeLeafEntryId) opaqueParents.set(activeLeafEntryId, typeof previousId === "string" ? previousId : null);
		return {
			activeLeafEntryId,
			opaqueParents,
			firstKeptRanges: readBoundedRetentionRanges(projection, rows, header ? 1 : 0),
			boundaryCount: boundary?.boundary_count ?? 0,
			events,
			serializedBytes,
			totalEvents: projection.state.activeEventCount,
			truncated: boundaryOmitted || metadata.length > selectedSequences.length
		};
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-model-context.ts
/** Read a transient context without opening the writer lifecycle or copying native evidence. */
function readSessionTranscriptModelContext(scope) {
	const result = withTranscriptContextSnapshot(scope, "model-context", ({ header, entries, readEntry }) => {
		const payloads = /* @__PURE__ */ new Map();
		for (const { entry, context } of iterateSessionContextEntries(entries)) {
			const omitCheckpoint = context !== "current" && entry.type === "message" && entry.message.role === "assistant" && isCompactionReplayCheckpoint(entry.message.providerReplay);
			payloads.set(entry, readEntry(entry, omitCheckpoint));
		}
		return [...header ? [header] : [], ...entries.map((entry) => payloads.get(entry) ?? entry)];
	});
	return result.found ? result.value : [];
}
/** Consume full-fidelity context lazily inside one read snapshot, never retaining raw history. */
function readSessionTranscriptContextMessages(scope, read) {
	const result = withTranscriptContextSnapshot(scope, "transcript", ({ header, entries, readEntry }) => {
		const messages = iterateSessionContextMessages(entries, readEntry);
		try {
			return read(messages, header);
		} finally {
			messages.return(void 0);
		}
	});
	return result.found ? result.value : read([], void 0);
}
//#region V context-window-read-v1: model-context window from the active-path index
const V_CONTEXT_WINDOW_FALLBACK = Symbol("v-context-window-fallback");
function noteContextWindowFallback(sessionId, reason) {
	if (process.env.OPENCLAW_V_CONTEXT_WINDOW_DEBUG === "1") process.stderr.write(`[context-window-read] fallback session=${sessionId} reason=${reason}\n`);
}
function selectActivePathNavigation(database, sessionId, where, order, limit) {
	const db = getSessionKysely(database.db);
	let query = db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select((eb) => [
		"active.active_position",
		"active.event_seq as seq",
		projectModelContextNavigationSql(eb.ref("event.event_json")).as("navigation_json")
	]).where("active.session_id", "=", sessionId);
	query = where(query);
	query = query.orderBy("active.active_position", order);
	if (limit !== void 0) query = query.limit(limit);
	return executeSqliteQuerySync(database.db, query).rows.map((row) => ({
		...JSON.parse(row.navigation_json),
		seq: row.seq,
		activePosition: row.active_position
	}));
}
function readActiveContextWindowEntries(database, resolved, fence) {
	const sessionId = resolved.sessionId;
	const raw = database.db;
	const state = raw.prepare("SELECT indexed_seq, needs_rebuild, leaf_event_id FROM session_transcript_index_state WHERE session_id = ?").get(sessionId);
	const latest = raw.prepare("SELECT max(seq) AS seq FROM transcript_events WHERE session_id = ?").get(sessionId)?.seq;
	if (!state || state.needs_rebuild !== 0 || latest === null || latest === void 0 || state.indexed_seq < latest) return noteContextWindowFallback(sessionId, "index-not-current");
	const fenceSeq = fence ? fence.beforeRawSeq : Number.MAX_SAFE_INTEGER;
	const boundary = raw.prepare(`SELECT active.active_position AS position, identity.seq AS seq, identity.event_id AS id
		FROM transcript_event_identities AS identity
		JOIN session_transcript_active_events AS active ON active.session_id = identity.session_id AND active.event_seq = identity.seq
		WHERE identity.session_id = ? AND identity.event_type IN ('compaction', 'reset') AND identity.seq < ?
		ORDER BY active.active_position DESC LIMIT 1`).get(sessionId, fenceSeq);
	if (!boundary) return noteContextWindowFallback(sessionId, "no-boundary");
	const firstKeptId = raw.prepare("SELECT json_extract(event_json, '$.firstKeptEntryId') AS id FROM transcript_events WHERE session_id = ? AND seq = ?").get(sessionId, boundary.seq)?.id;
	let start = boundary.position;
	let startId = boundary.id;
	if (typeof firstKeptId === "string") {
		const kept = raw.prepare(`SELECT active.active_position AS position FROM transcript_event_identities AS identity
			JOIN session_transcript_active_events AS active ON active.session_id = identity.session_id AND active.event_seq = identity.seq
			WHERE identity.session_id = ? AND identity.event_id = ?`).get(sessionId, firstKeptId);
		if (kept && kept.position < start) {
			start = kept.position;
			startId = firstKeptId;
		}
	}
	const window = selectActivePathNavigation(database, sessionId, (query) => query.where("active.active_position", ">=", start).where("active.event_seq", "<", fenceSeq), "asc");
	const expectedLeaf = fence ? fence.admission.effectiveParentId : state.leaf_event_id;
	if (window.length === 0 || window[0].id !== startId || window.at(-1).id !== expectedLeaf || !window.some((entry) => entry.id === boundary.id)) return noteContextWindowFallback(sessionId, `window-mismatch first=${window[0]?.id === startId} leaf=${window.at(-1)?.id === expectedLeaf} boundary=${window.some((entry) => entry.id === boundary.id)}`);
	// Typed by the identity index, so only the selected rows' payloads are read.
	const latestBefore = (eventType, where = (query) => query) => selectActivePathNavigation(database, sessionId, (query) => where(query.innerJoin("transcript_event_identities as identity", (join) => join.onRef("identity.session_id", "=", "active.session_id").onRef("identity.seq", "=", "active.event_seq")).where("identity.event_type", "=", eventType).where("active.active_position", "<", start)), "desc", 1)[0];
	const prefix = [
		latestBefore("thinking_level_change"),
		latestBefore("model_change"),
		latestBefore("message", (query) => query.where(sql`json_extract(event.event_json, '$.message.role')`, "=", "assistant"))
	].filter(Boolean).toSorted((left, right) => left.activePosition - right.activePosition);
	const entries = [...prefix, ...window];
	let parentId = null;
	for (const entry of entries) {
		entry.parentId = parentId;
		parentId = entry.id;
		delete entry.activePosition;
	}
	return entries;
}
function withTranscriptContextSnapshot(scope, view, read) {
	if (process.env.OPENCLAW_V_CONTEXT_WINDOW_READ === "0") return withTranscriptContextSnapshotFullScan(scope, view, read);
	const resolved = resolveSqliteTranscriptReadScope(scope);
	let result;
	let reading = false;
	try {
		result = withOpenClawAgentDatabaseReadOnly((database) => runSqliteDeferredTransactionSync(database.db, () => {
			const db = getSessionKysely(database.db);
			const fence = resolveSqliteSessionTranscriptReadFence({
				database,
				...resolved
			});
			const entries = readActiveContextWindowEntries(database, resolved, fence);
			if (!entries) return V_CONTEXT_WINDOW_FALLBACK;
			const base = db.selectFrom("transcript_events").where("session_id", "=", resolved.sessionId).$if(fence !== void 0, (query) => query.where("seq", "<", fence.beforeRawSeq));
			const header = executeSqliteQueryTakeFirstSync(database.db, base.select("event_json").where(sql`json_extract(event_json, '$.type')`, "=", "session").orderBy("seq", "asc").limit(1));
			const readPayload = prepareSqliteQuerySync(database.db, (parameter) => base.select((eb) => view === "model-context" ? projectModelContextEventSql(eb.ref("event_json"), parameter((row) => row.omitCheckpoint)).as("event_json") : eb.ref("event_json").as("event_json")).where("seq", "=", parameter((row) => row.seq)));
			reading = true;
			return read({
				header: header ? JSON.parse(header.event_json) : void 0,
				entries,
				readEntry: (entry, omitCheckpoint = false) => {
					const row = readPayload({
						seq: entry.seq,
						omitCheckpoint: omitCheckpoint ? 1 : 0
					}).rows[0];
					return {
						...JSON.parse(row.event_json),
						parentId: entry.parentId
					};
				}
			});
		}, { operationLabel: "session context window read" }), toDatabaseOptions(resolved), { throwOnMissingTable: true });
	} catch (error) {
		if (reading || error instanceof SessionTranscriptReadFenceError) throw error;
		noteContextWindowFallback(resolved.sessionId, `error ${String(error?.message ?? error).slice(0, 200)}`);
		result = { found: true, value: V_CONTEXT_WINDOW_FALLBACK };
	}
	if (result.found && result.value === V_CONTEXT_WINDOW_FALLBACK) return withTranscriptContextSnapshotFullScan(scope, view, read);
	return result;
}
//#endregion
function withTranscriptContextSnapshotFullScan(scope, view, read) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	return withOpenClawAgentDatabaseReadOnly((database) => runSqliteDeferredTransactionSync(database.db, () => {
		const db = getSessionKysely(database.db);
		const fence = resolveSqliteSessionTranscriptReadFence({
			database,
			...resolved
		});
		const base = db.selectFrom("transcript_events").where("session_id", "=", resolved.sessionId).$if(fence !== void 0, (query) => query.where("seq", "<", fence.beforeRawSeq));
		const header = executeSqliteQueryTakeFirstSync(database.db, base.select("event_json").where(sql`json_extract(event_json, '$.type')`, "=", "session").orderBy("seq", "asc").limit(1));
		const tree = scanSessionTranscriptTree((function* () {
			for (const row of iterateSqliteQuerySync(database.db, base.select((eb) => ["seq", projectModelContextNavigationSql(eb.ref("event_json")).as("navigation_json")]).orderBy("seq", "asc"))) yield {
				...JSON.parse(row.navigation_json),
				seq: row.seq
			};
		})());
		const entries = selectSessionTranscriptTreePathNodes(tree, tree.leafId).map(({ entry, parentId }) => {
			entry.parentId = parentId;
			return entry;
		});
		const readPayload = prepareSqliteQuerySync(database.db, (parameter) => base.select((eb) => view === "model-context" ? projectModelContextEventSql(eb.ref("event_json"), parameter((row) => row.omitCheckpoint)).as("event_json") : eb.ref("event_json").as("event_json")).where("seq", "=", parameter((row) => row.seq)));
		return read({
			header: header ? JSON.parse(header.event_json) : void 0,
			entries,
			readEntry: (entry, omitCheckpoint = false) => {
				const row = readPayload({
					seq: entry.seq,
					omitCheckpoint: omitCheckpoint ? 1 : 0
				}).rows[0];
				return {
					...JSON.parse(row.event_json),
					parentId: entry.parentId
				};
			}
		});
	}, { operationLabel: "session context snapshot read" }), toDatabaseOptions(resolved), { throwOnMissingTable: true });
}
//#endregion
//#region src/agents/sessions/session-manager-core.ts
var SessionManagerCore = class {
	constructor(cwd, persistenceTarget, loadedEntries, boundedContext) {
		this.migrated = false;
		this.sessionId = "";
		this.fileEntries = [];
		this.opaqueFileEntries = [];
		this.byId = /* @__PURE__ */ new Map();
		this.opaqueParentsById = /* @__PURE__ */ new Map();
		this.boundedFirstKeptById = /* @__PURE__ */ new Map();
		this.logicalParentsById = /* @__PURE__ */ new Map();
		this.invalidLeafControlIds = /* @__PURE__ */ new Set();
		this.labelsById = /* @__PURE__ */ new Map();
		this.labelTimestampsById = /* @__PURE__ */ new Map();
		this.leafId = null;
		this.appendParentId = null;
		this.pendingDeliberateAppend = false;
		this.persistenceHeaderPending = false;
		this.boundedContextIncomplete = false;
		this.cwd = cwd;
		this.persistenceTarget = persistenceTarget;
		this.boundedContextLimits = boundedContext?.limits;
		this.boundedContextIncomplete = boundedContext !== void 0;
		this.persistedBoundaryCount = boundedContext?.boundaryCount;
		if (persistenceTarget || loadedEntries) this.setLoadedSessionTarget(persistenceTarget, loadedEntries ?? [], boundedContext);
		else this.newSession();
	}
	setSessionTarget(target) {
		const bounded = this.boundedContextLimits ? readSessionTranscriptBoundedActiveContextCore(target, this.boundedContextLimits) : void 0;
		const entries = bounded?.events ?? loadTranscriptEventsSync(target);
		this.boundedContextIncomplete = bounded !== void 0;
		this.persistedBoundaryCount = bounded?.boundaryCount;
		const header = entries.find((entry) => typeof entry === "object" && entry !== null && entry.type === "session");
		this.setLoadedSessionTarget(target, entries, bounded);
		if (header?.cwd) this.cwd = header.cwd;
	}
	/** Active-only loads can omit sibling rows even when they fit the context limits. */
	ensureCompletePersistedHistory() {
		if (!this.persistenceTarget || !this.boundedContextIncomplete) return;
		const limits = this.boundedContextLimits;
		this.boundedContextLimits = void 0;
		this.setSessionTarget(this.persistenceTarget);
		this.boundedContextLimits = limits;
	}
	setLoadedSessionTarget(target, entries, bounded) {
		this.boundedFirstKeptById.clear();
		const partitioned = partitionSessionFileEntries(entries);
		if (partitioned.fileEntries.length === 0 && partitioned.opaqueEntries.length === 0) {
			this.persistenceTarget = target ? { ...target } : void 0;
			this.initializeSession({ id: target?.sessionId });
			this.persistenceHeaderPending = target !== void 0;
			return;
		}
		const header = partitioned.fileEntries.find((entry) => entry.type === "session");
		if (target && (header?.version ?? 1) < 3) throw new Error("Persisted legacy session transcripts require doctor/import migration before runtime use");
		this.persistenceHeaderPending = false;
		this.persistenceTarget = target ? { ...target } : void 0;
		this.fileEntries = partitioned.fileEntries;
		this.opaqueFileEntries = partitioned.opaqueEntries;
		this.sessionId = header?.id ?? target?.sessionId ?? createManagedSessionId();
		this.migrated = migrateToCurrentVersion(this.fileEntries, partitioned.fileEntriesByOriginalIndex);
		this.buildIndex();
		if (bounded) {
			for (const [id, parentId] of bounded.opaqueParents) this.opaqueParentsById.set(id, parentId);
			this.appendParentId = bounded.activeLeafEntryId;
			for (const [boundaryId, range] of bounded.firstKeptRanges) {
				let firstKeptEntryId = boundaryId;
				for (let index = range.startIndex; index < range.endIndex; index++) {
					const entry = partitioned.fileEntriesByOriginalIndex[index];
					if (isIndexedSessionEntry(entry)) {
						firstKeptEntryId = entry.id;
						break;
					}
				}
				this.boundedFirstKeptById.set(boundaryId, firstKeptEntryId);
			}
		}
	}
	reloadPersistedTranscript() {
		if (this.persistenceTarget) {
			const runtimeCwd = this.cwd;
			this.setSessionTarget(this.persistenceTarget);
			this.cwd = runtimeCwd;
		}
	}
	newSession(options) {
		if (this.persistenceTarget) throw new Error("Persisted session managers cannot change session identity in place");
		return this.initializeSession(options);
	}
	initializeSession(options) {
		this.sessionId = options?.id ?? this.persistenceTarget?.sessionId ?? createManagedSessionId();
		this.migrated = false;
		const timestamp = (/* @__PURE__ */ new Date()).toISOString();
		const header = {
			type: "session",
			version: 3,
			id: this.sessionId,
			timestamp,
			cwd: this.cwd,
			parentSession: options?.parentSession
		};
		this.fileEntries = [header];
		this.opaqueFileEntries = [];
		this.byId.clear();
		this.opaqueParentsById.clear();
		this.boundedFirstKeptById.clear();
		this.logicalParentsById.clear();
		this.invalidLeafControlIds.clear();
		this.labelsById.clear();
		this.labelTimestampsById.clear();
		this.leafId = null;
		this.appendParentId = null;
		this.appendMode = void 0;
		this.pendingDeliberateAppend = false;
		return this.persistenceTarget ? this.sessionId : void 0;
	}
	resolveOpaqueLeafTargetId(targetId) {
		if (targetId === null || this.byId.has(targetId)) return targetId;
		return this.resolveCanonicalParentId(targetId);
	}
	resolveOpaqueAppendParentId(parentId) {
		if (parentId === null || this.byId.has(parentId) || this.opaqueParentsById.has(parentId)) return parentId;
		return this.resolveCanonicalParentId(parentId);
	}
	resolveOpaqueLeafControl(leafEntry) {
		if (!leafEntry) return;
		const isKnownReference = (id) => id === null || this.byId.has(id) || this.opaqueParentsById.has(id) && !this.invalidLeafControlIds.has(id);
		if (!isKnownReference(leafEntry.targetId) || leafEntry.appendParentId !== void 0 && !isKnownReference(leafEntry.appendParentId)) return;
		const leafId = this.resolveOpaqueLeafTargetId(leafEntry.targetId);
		return {
			leafId,
			appendParentId: leafEntry.appendParentId === void 0 ? leafId : this.resolveOpaqueAppendParentId(leafEntry.appendParentId),
			...leafEntry.appendMode ? { appendMode: leafEntry.appendMode } : {}
		};
	}
	buildIndex() {
		this.byId.clear();
		this.opaqueParentsById.clear();
		this.logicalParentsById.clear();
		this.invalidLeafControlIds.clear();
		this.labelsById.clear();
		this.labelTimestampsById.clear();
		this.leafId = null;
		this.appendParentId = null;
		this.appendMode = void 0;
		this.pendingDeliberateAppend = false;
		let opaqueIndex = 0;
		let latestResetId;
		const resetDescendantIds = /* @__PURE__ */ new Set();
		for (let index = 0; index <= this.fileEntries.length; index += 1) {
			while (this.opaqueFileEntries[opaqueIndex]?.index === index) {
				const opaqueRecord = this.opaqueFileEntries[opaqueIndex]?.record;
				const leafEntry = parseOpaqueLeafEntry(opaqueRecord);
				if (leafEntry) {
					const leafState = this.resolveOpaqueLeafControl(leafEntry);
					if (!leafState) {
						this.invalidLeafControlIds.add(leafEntry.id);
						this.opaqueParentsById.set(leafEntry.id, this.resolveOpaqueAppendParentId(leafEntry.parentId));
						opaqueIndex += 1;
						continue;
					}
					const effectiveLeafState = latestResetId !== void 0 && (leafState.leafId === null || !resetDescendantIds.has(leafState.leafId)) ? {
						leafId: this.leafId,
						appendParentId: this.leafId
					} : leafState;
					this.opaqueParentsById.set(leafEntry.id, effectiveLeafState.leafId);
					if (latestResetId !== void 0 && effectiveLeafState.leafId !== null && resetDescendantIds.has(effectiveLeafState.leafId)) resetDescendantIds.add(leafEntry.id);
					this.leafId = effectiveLeafState.leafId;
					this.appendParentId = effectiveLeafState.appendParentId;
					this.appendMode = effectiveLeafState.appendMode;
					opaqueIndex += 1;
					continue;
				}
				const link = parseParentLinkedOpaqueEntry(opaqueRecord);
				if (link) {
					this.opaqueParentsById.set(link.id, link.parentId);
					if (latestResetId !== void 0 && link.parentId !== null && resetDescendantIds.has(link.parentId)) resetDescendantIds.add(link.id);
					this.appendParentId = link.id;
				}
				opaqueIndex += 1;
			}
			const entry = this.fileEntries[index];
			if (!isIndexedSessionEntry(entry)) continue;
			if (entry.type === "label" && !this.byId.has(entry.targetId)) {
				this.opaqueParentsById.set(entry.id, this.resolveCanonicalParentId(entry.parentId));
				continue;
			}
			if (latestResetId !== void 0 && !isSessionTranscriptSideAppendEntry(entry) && (entry.parentId === null || !resetDescendantIds.has(entry.parentId)) || !Object.hasOwn(entry, "parentId") || !isSessionTranscriptSideAppendEntry(entry) && entry.parentId === this.appendParentId && this.leafId !== this.appendParentId) this.logicalParentsById.set(entry.id, this.leafId);
			this.byId.set(entry.id, entry);
			if (entry.type === "reset") {
				latestResetId = entry.id;
				resetDescendantIds.clear();
				resetDescendantIds.add(entry.id);
			} else {
				const logicalParentId = this.logicalParentsById.has(entry.id) ? this.logicalParentsById.get(entry.id) ?? null : entry.parentId;
				if (latestResetId !== void 0 && logicalParentId !== null && resetDescendantIds.has(logicalParentId)) resetDescendantIds.add(entry.id);
			}
			this.appendParentId = entry.id;
			if (isSessionTranscriptSideAppendEntry(entry)) this.appendMode = "side";
			else {
				this.leafId = entry.id;
				this.appendMode = void 0;
			}
			if (entry.type === "label") {
				if (entry.label) {
					this.labelsById.set(entry.targetId, entry.label);
					this.labelTimestampsById.set(entry.targetId, entry.timestamp);
				} else {
					this.labelsById.delete(entry.targetId);
					this.labelTimestampsById.delete(entry.targetId);
				}
			}
		}
	}
	resolveCanonicalParentId(parentId) {
		const seen = /* @__PURE__ */ new Set();
		let currentId = parentId;
		while (currentId && !this.byId.has(currentId)) {
			if (seen.has(currentId)) return null;
			seen.add(currentId);
			currentId = this.opaqueParentsById.get(currentId) ?? null;
		}
		return currentId;
	}
	normalizeEntryParent(entry) {
		const parentId = this.logicalParentsById.has(entry.id) ? this.logicalParentsById.get(entry.id) ?? null : this.resolveCanonicalParentId(entry.parentId);
		let normalized = parentId === entry.parentId ? entry : {
			...entry,
			parentId
		};
		if (normalized.parentId === normalized.id) normalized = {
			...normalized,
			parentId: null
		};
		const boundedFirstKept = this.boundedFirstKeptById.get(normalized.id);
		if (boundedFirstKept !== void 0 && (normalized.type === "compaction" || normalized.type === "reset")) normalized = {
			...normalized,
			firstKeptEntryId: boundedFirstKept
		};
		if ((normalized.type === "compaction" || normalized.type === "reset") && normalized.firstKeptEntryId !== void 0 && !this.byId.has(normalized.firstKeptEntryId) && this.opaqueParentsById.has(normalized.firstKeptEntryId)) {
			const firstKeptEntryId = this.resolveCanonicalParentId(normalized.firstKeptEntryId) ?? this.findFirstCanonicalDescendantOnBranch(normalized.firstKeptEntryId, normalized.parentId) ?? this.findFirstCanonicalDescendant(normalized.firstKeptEntryId) ?? parentId;
			if (firstKeptEntryId && firstKeptEntryId !== normalized.firstKeptEntryId) normalized = {
				...normalized,
				firstKeptEntryId
			};
		}
		return normalized;
	}
	findFirstCanonicalDescendantOnBranch(opaqueId, leafId) {
		const seen = /* @__PURE__ */ new Set();
		let currentId = leafId;
		let firstCanonicalDescendant;
		while (currentId && !seen.has(currentId)) {
			if (currentId === opaqueId) return firstCanonicalDescendant;
			seen.add(currentId);
			const entry = this.byId.get(currentId);
			if (entry) {
				firstCanonicalDescendant = entry.id;
				currentId = entry.parentId;
			} else currentId = this.opaqueParentsById.get(currentId) ?? null;
		}
	}
	findFirstCanonicalDescendant(opaqueId) {
		for (const entry of this.fileEntries) {
			if (!isIndexedSessionEntry(entry)) continue;
			const seen = /* @__PURE__ */ new Set();
			let parentId = entry.parentId;
			while (parentId && this.opaqueParentsById.has(parentId) && !seen.has(parentId)) {
				if (parentId === opaqueId) return entry.id;
				seen.add(parentId);
				parentId = this.opaqueParentsById.get(parentId) ?? null;
			}
		}
	}
	resolveBranchTargetId(branchFromId) {
		if (this.byId.has(branchFromId)) return branchFromId;
		if (!this.opaqueParentsById.has(branchFromId)) return;
		return this.resolveCanonicalParentId(branchFromId);
	}
	clampOpaqueFileEntryIndexes() {
		let previousOpaqueIndex = 0;
		for (const opaqueEntry of this.opaqueFileEntries) {
			opaqueEntry.index = Math.max(previousOpaqueIndex, Math.min(opaqueEntry.index, this.fileEntries.length));
			previousOpaqueIndex = opaqueEntry.index;
		}
	}
	createLeafControl(parentId, appendParentId = this.appendParentId, appendMode) {
		return {
			type: "leaf",
			id: generateSessionEntryId(),
			parentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			targetId: this.leafId,
			...appendParentId !== this.leafId ? { appendParentId } : {},
			...appendMode ? { appendMode } : {}
		};
	}
	rememberLeafControl(leafEntry) {
		this.opaqueFileEntries.push({
			index: this.fileEntries.length,
			record: leafEntry
		});
		this.opaqueParentsById.set(leafEntry.id, leafEntry.targetId);
	}
	getAppendParentId() {
		return this.appendParentId;
	}
	getAppendMode() {
		return this.appendMode;
	}
	getPersistedFileEntries(leafAppendParentId = this.appendParentId, leafAppendMode) {
		this.clampOpaqueFileEntryIndexes();
		const entries = [];
		let opaqueIndex = 0;
		for (let index = 0; index <= this.fileEntries.length; index += 1) {
			while (this.opaqueFileEntries[opaqueIndex]?.index === index) {
				entries.push(this.opaqueFileEntries[opaqueIndex]?.record);
				opaqueIndex += 1;
			}
			const entry = this.fileEntries[index];
			if (entry) entries.push(entry);
		}
		while (opaqueIndex < this.opaqueFileEntries.length) {
			entries.push(this.opaqueFileEntries[opaqueIndex]?.record);
			opaqueIndex += 1;
		}
		let persistedLeafId = null;
		let persistedAppendParentId = null;
		let rawTailId = null;
		for (const entry of entries) {
			const leafEntry = parseOpaqueLeafEntry(entry);
			if (leafEntry) {
				rawTailId = leafEntry.id;
				if (this.invalidLeafControlIds.has(leafEntry.id)) continue;
				const targetId = this.resolveOpaqueLeafTargetId(leafEntry.targetId);
				persistedLeafId = targetId;
				persistedAppendParentId = leafEntry.appendParentId === void 0 ? targetId : this.resolveOpaqueAppendParentId(leafEntry.appendParentId);
				continue;
			}
			if (isIndexedSessionEntry(entry)) {
				persistedLeafId = entry.id;
				persistedAppendParentId = entry.id;
				rawTailId = entry.id;
				continue;
			}
			const opaqueLink = parseParentLinkedOpaqueEntry(entry);
			if (opaqueLink) {
				persistedAppendParentId = opaqueLink.id;
				rawTailId = opaqueLink.id;
			}
		}
		if (persistedLeafId !== this.leafId || persistedAppendParentId !== this.appendParentId) {
			const leafEntry = this.createLeafControl(rawTailId, leafAppendParentId, leafAppendMode);
			this.rememberLeafControl(leafEntry);
			entries.push(leafEntry);
		}
		return entries;
	}
	getPersistedEntries() {
		return this.getPersistedFileEntries();
	}
	clearPreservedOpaqueFileEntries() {
		this.opaqueFileEntries = [];
		this.opaqueParentsById.clear();
		this.invalidLeafControlIds.clear();
		this.appendParentId = null;
		this.appendMode = void 0;
		this.pendingDeliberateAppend = false;
	}
	replacePersistedTranscript(options) {
		if (!this.persistenceTarget) return;
		const leafAppendParentId = options?.leafAppendParentId === void 0 ? this.appendParentId : options.leafAppendParentId;
		replaceTranscriptEventsSync(this.persistenceTarget, this.getPersistedFileEntries(leafAppendParentId, options?.leafAppendMode ?? this.appendMode));
		this.persistenceHeaderPending = false;
	}
	/** SQLite appends are synchronous; retained for the AgentSession contract. */
	flushPendingPersistence() {}
	isPersisted() {
		return this.persistenceTarget !== void 0;
	}
	getCwd() {
		return this.cwd;
	}
	getSessionId() {
		return this.sessionId;
	}
	getSessionTarget() {
		return this.persistenceTarget ? { ...this.persistenceTarget } : void 0;
	}
};
//#endregion
//#region src/agents/sessions/session-manager-persistence.ts
function requireTranscriptEventAppend(result, message) {
	if (result.ok && result.value) return;
	const cause = result.ok ? { code: "transcript-event-not-appended" } : result.error;
	throw new Error(`${message}: ${cause.code}`, { cause });
}
var SessionManagerPersistence = class extends SessionManagerCore {
	#initialWriter;
	removeTrailingEntries(predicate, options) {
		this.ensureCompletePersistedHistory();
		let preservedStart = this.fileEntries.length;
		while (preservedStart > 1) {
			const entry = this.fileEntries[preservedStart - 1];
			if (!isIndexedSessionEntry(entry) || !options?.preserveTrailing?.(entry)) break;
			preservedStart -= 1;
		}
		let removeStart = preservedStart;
		while (removeStart > 1) {
			const entry = this.fileEntries[removeStart - 1];
			if (!isIndexedSessionEntry(entry) || !predicate(entry)) break;
			removeStart -= 1;
		}
		if (removeStart === preservedStart) return 0;
		const shiftOpaqueIndexesAfterRemoval = (start, count) => {
			for (const opaqueEntry of this.opaqueFileEntries) {
				const removedBeforeOpaque = Math.max(0, Math.min(count, opaqueEntry.index - start));
				opaqueEntry.index -= removedBeforeOpaque;
			}
		};
		const removedCount = preservedStart - removeStart;
		shiftOpaqueIndexesAfterRemoval(removeStart, removedCount);
		const removedEntries = this.fileEntries.splice(removeStart, removedCount);
		const removedParentById = new Map(removedEntries.map((entry) => [entry.id, entry.parentId]));
		for (let index = removeStart; index < this.fileEntries.length;) {
			const entry = this.fileEntries[index];
			if (isIndexedSessionEntry(entry) && entry.type === "label" && removedParentById.has(entry.targetId)) {
				removedParentById.set(entry.id, entry.parentId);
				shiftOpaqueIndexesAfterRemoval(index, 1);
				this.fileEntries.splice(index, 1);
				continue;
			}
			index += 1;
		}
		const resolveRetainedParentId = (parentId) => {
			const seen = /* @__PURE__ */ new Set();
			let currentId = parentId;
			while (currentId && removedParentById.has(currentId) && !seen.has(currentId)) {
				seen.add(currentId);
				currentId = removedParentById.get(currentId) ?? null;
			}
			return currentId;
		};
		const replacementParentId = resolveRetainedParentId(removedEntries[0]?.parentId ?? null);
		this.fileEntries = this.fileEntries.map((entry) => {
			if (!isIndexedSessionEntry(entry)) return entry;
			const parentId = resolveRetainedParentId(entry.parentId);
			return parentId === entry.parentId ? entry : {
				...entry,
				parentId
			};
		});
		this.opaqueFileEntries = this.opaqueFileEntries.map((opaqueEntry) => {
			if (!isRecord(opaqueEntry.record)) return opaqueEntry;
			const record = opaqueEntry.record;
			const parentId = record.parentId === null || typeof record.parentId === "string" ? resolveRetainedParentId(record.parentId) : void 0;
			const leafEntry = parseOpaqueLeafEntry(record);
			const targetId = leafEntry ? resolveRetainedParentId(leafEntry.targetId) : void 0;
			const appendParentId = leafEntry?.appendParentId !== void 0 ? resolveRetainedParentId(leafEntry.appendParentId) : void 0;
			if ((parentId === void 0 || parentId === record.parentId) && (targetId === void 0 || targetId === leafEntry?.targetId) && (appendParentId === void 0 || appendParentId === leafEntry?.appendParentId)) return opaqueEntry;
			return {
				...opaqueEntry,
				record: {
					...record,
					...parentId !== void 0 ? { parentId } : {},
					...targetId !== void 0 ? { targetId } : {},
					...appendParentId !== void 0 ? { appendParentId } : {}
				}
			};
		});
		this.clampOpaqueFileEntryIndexes();
		this.buildIndex();
		this.leafId = this.resolveCanonicalParentId(replacementParentId);
		this.appendParentId = replacementParentId;
		this.replacePersistedTranscript();
		return removedEntries.length;
	}
	persistRecord(entry, options) {
		if (this.persistenceTarget) return this.persistSqliteRecord(entry, options);
	}
	persist(entry, options) {
		return this.persistRecord(entry, options);
	}
	persistSqliteRecord(entry, options) {
		if (!this.persistenceTarget) return;
		const scope = this.persistenceTarget;
		const inheritedWriter = getOwnedSessionTranscriptInitialWriter({ sessionTarget: scope });
		this.#initialWriter ??= inheritedWriter;
		const initialWriter = this.#initialWriter;
		if (initialWriter) {
			initialWriter.assertActive();
			if (!initialWriter.committedFence && inheritedWriter !== initialWriter) throw new SessionTranscriptWriterClaimReboundError();
			Object.assign(scope, initialWriter.committedFence ?? {
				expectedLifecycleRevision: void 0,
				expectedWriterRunId: initialWriter.writerRunId
			});
		}
		if (this.persistenceHeaderPending || initialWriter && !initialWriter.committedFence) {
			if (!ensureSessionEntrySync(scope, {
				sessionId: scope.sessionId,
				updatedAt: Date.now()
			})) throw new Error("Session transcript header was not persisted");
			initialWriter?.assertActive();
			if (initialWriter?.committedFence) Object.assign(scope, initialWriter.committedFence);
		}
		if (this.persistenceHeaderPending) {
			const header = this.fileEntries[0];
			if (!header || header.type !== "session") throw new Error("Session transcript header was not persisted");
			requireTranscriptEventAppend(appendTranscriptEventSync(scope, header), "Session transcript header was not persisted");
			this.persistenceHeaderPending = false;
		}
		const leafEntry = parseOpaqueLeafEntry(entry);
		if (leafEntry) {
			requireTranscriptEventAppend(appendTranscriptEventSync(scope, entry), `Session transcript leaf control was not persisted: ${leafEntry.id}`);
			return;
		}
		if (!isIndexedSessionEntry(entry)) return;
		if (entry.type !== "message") {
			requireTranscriptEventAppend(appendTranscriptEventSync(scope, entry, options?.appendIntent === "active-branch" ? { appendIntent: options.appendIntent } : void 0), `Session transcript entry was not persisted: ${entry.id}`);
			return;
		}
		const appendOptions = copyCodeModeSourceAppendOptions(options, {
			cwd: this.cwd,
			eventId: entry.id,
			...options?.config ? { config: options.config } : {},
			...options?.idempotencyLookup ? { idempotencyLookup: options.idempotencyLookup } : {},
			message: entry.message,
			now: Date.parse(entry.timestamp),
			parentId: entry.parentId,
			...options?.appendIntent === "active-branch" ? { appendIntent: options.appendIntent } : {}
		});
		const outcome = appendTranscriptMessageSync(scope, appendOptions);
		if (!outcome.ok) throw new Error(`Session transcript message was not persisted: ${entry.id}`, { cause: outcome.error });
		const result = outcome.value;
		if (!result) throw new Error(`Session transcript message was not persisted: ${entry.id}`);
		entry.message = result.message;
		if (result.messageId !== entry.id) {
			if ((entry.message.role === "user" && "idempotencyKey" in entry.message && typeof entry.message.idempotencyKey === "string" && entry.message.idempotencyKey.length > 0 ? entry.message.idempotencyKey : void 0) && options?.idempotencyLookup !== "caller-checked") {
				if (!result.anchor) throw new Error(`Session transcript anchor was not returned: ${result.messageId}`);
				return {
					adoptedMessageId: result.messageId,
					anchor: result.anchor,
					effectiveParentId: result.effectiveParentId ?? null
				};
			}
			throw new Error(`Session transcript parent entry was not persisted: ${entry.id}`);
		}
		if (options?.idempotencyLookup === "caller-checked" && (!result?.appended || result.messageId !== entry.id)) throw new Error(`Session transcript append was not persisted: ${entry.id}`);
		if (result.effectiveParentId === void 0) throw new Error(`Session transcript append parent was not returned: ${entry.id}`);
		return {
			...result.anchor ? { anchor: result.anchor } : {},
			effectiveParentId: result.effectiveParentId
		};
	}
};
//#endregion
//#region src/agents/sessions/session-manager-entries.ts
var SessionManagerEntries = class extends SessionManagerPersistence {
	appendEntry(entry, options) {
		const canonicalEntry = JSON.parse(JSON.stringify(entry));
		if (!isIndexedSessionEntry(canonicalEntry)) throw new Error(`Invalid session transcript entry: ${entry.type}`);
		if (entry.type === "message" && canonicalEntry.type === "message") copyCodeModeSourceAppend(entry.message, canonicalEntry.message, getCodeModeSourceAppend(options), (source) => source);
		const activeBranchAppend = !this.pendingDeliberateAppend && this.appendMode !== "side" && !isSessionTranscriptSideAppendEntry(canonicalEntry);
		const persistenceResult = this.persist(canonicalEntry, copyCodeModeSourceAppendOptions(options, {
			...options,
			...activeBranchAppend ? { appendIntent: "active-branch" } : {}
		}));
		if (persistenceResult?.adoptedMessageId) {
			this.reloadPersistedTranscript();
			if (this.resolveCurrentTurnEntryId() !== persistenceResult.adoptedMessageId) throw new Error(`Session transcript keyed user is outside the current turn: ${persistenceResult.adoptedMessageId}`);
			canonicalEntry.id = persistenceResult.adoptedMessageId;
		} else if (persistenceResult?.effectiveParentId !== void 0 && persistenceResult.effectiveParentId !== canonicalEntry.parentId) this.reloadPersistedTranscript();
		else {
			if (!isSessionTranscriptSideAppendEntry(canonicalEntry) && canonicalEntry.parentId === this.appendParentId && this.leafId !== this.appendParentId) this.logicalParentsById.set(canonicalEntry.id, this.leafId);
			this.fileEntries.push(canonicalEntry);
			this.byId.set(canonicalEntry.id, canonicalEntry);
			this.appendParentId = canonicalEntry.id;
			if (isSessionTranscriptSideAppendEntry(canonicalEntry)) this.appendMode = "side";
			else {
				this.leafId = canonicalEntry.id;
				this.appendMode = void 0;
			}
		}
		this.pendingDeliberateAppend = false;
		return {
			entry: canonicalEntry,
			anchor: persistenceResult?.anchor
		};
	}
	resolveCurrentTurnEntryId() {
		let parentId = this.appendParentId;
		let remainingAncestors = this.byId.size;
		while (parentId && remainingAncestors-- > 0) {
			const parent = this.byId.get(parentId);
			if (!parent || !isSessionContextMetadataEntry(parent) && parent.type !== "compaction") break;
			parentId = parent.parentId;
		}
		return parentId;
	}
	appendMessage(message, options) {
		return this.appendMessageWithTranscriptAnchor(message, options).entryId;
	}
	appendMessageWithTranscriptAnchor(message, options) {
		if (message.role === "assistant") applyAssistantDeliveryDirectives(message);
		if (options?.idempotencyLookup !== "caller-checked" && message.role === "user" && "idempotencyKey" in message && typeof message.idempotencyKey === "string" && message.idempotencyKey.length > 0) {
			const currentTurnId = this.resolveCurrentTurnEntryId();
			const current = currentTurnId ? this.byId.get(currentTurnId) : void 0;
			if (current?.type === "message" && current.message.role === "user" && "idempotencyKey" in current.message && current.message.idempotencyKey === message.idempotencyKey) {
				const anchor = this.persistenceTarget ? readActiveTranscriptEntryAnchor({
					...this.persistenceTarget,
					entryId: current.id
				}) : void 0;
				if (this.persistenceTarget && !anchor) throw new Error(`Session transcript anchor was not returned: ${current.id}`);
				return {
					entryId: current.id,
					message: current.message,
					...anchor ? { anchor } : {}
				};
			}
		}
		const entry = {
			type: "message",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			message
		};
		const { entry: persisted, anchor } = this.appendEntry(entry, options);
		return {
			entryId: persisted.id,
			message: persisted.message,
			...anchor ? { anchor } : {}
		};
	}
	appendThinkingLevelChange(thinkingLevel) {
		const entry = {
			type: "thinking_level_change",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			thinkingLevel
		};
		this.appendEntry(entry);
		return entry.id;
	}
	appendModelChange(provider, modelId) {
		const entry = {
			type: "model_change",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			provider,
			modelId
		};
		this.appendEntry(entry);
		return entry.id;
	}
	appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromHook, metadata) {
		const entry = {
			type: "compaction",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			summary,
			firstKeptEntryId,
			tokensBefore,
			details,
			fromHook,
			...metadata?.runId || metadata?.itemId ? { __openclaw: metadata } : {}
		};
		this.appendEntry(entry, { invalidateSerializedPrefixCache: fromHook === true || details !== void 0 });
		if (this.persistedBoundaryCount !== void 0) this.persistedBoundaryCount += 1;
		return entry.id;
	}
	appendResetBoundary(reason, firstKeptEntryId) {
		const entry = {
			type: "reset",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			reason,
			...firstKeptEntryId ? { firstKeptEntryId } : {}
		};
		this.appendEntry(entry);
		if (this.persistedBoundaryCount !== void 0) this.persistedBoundaryCount += 1;
		return entry.id;
	}
	appendCustomEntry(customType, data) {
		const entry = {
			type: "custom",
			customType,
			data,
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.appendEntry(entry, { invalidateSerializedPrefixCache: true });
		return entry.id;
	}
	appendSessionInfo(name) {
		const entry = {
			type: "session_info",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			name: name.replace(/[\r\n]+/g, " ").trim()
		};
		this.appendEntry(entry);
		return entry.id;
	}
	getSessionName() {
		for (const entry of this.getEntries().toReversed()) if (entry.type === "session_info") return entry.name?.trim() || void 0;
	}
	appendCustomMessageEntry(customType, content, display, details) {
		const entry = {
			type: "custom_message",
			customType,
			content,
			display,
			details,
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.appendEntry(entry, { invalidateSerializedPrefixCache: true });
		return entry.id;
	}
	getLeafId() {
		return this.leafId;
	}
	appendLeafControl(params) {
		if (params.targetId !== null && !this.byId.has(params.targetId)) throw new Error(`Entry ${params.targetId} not found`);
		if (params.appendParentId !== null && !this.byId.has(params.appendParentId) && !this.opaqueParentsById.has(params.appendParentId)) throw new Error(`Append parent ${params.appendParentId} not found`);
		const previousLeafId = this.leafId;
		this.leafId = params.targetId;
		const entry = this.createLeafControl(this.appendParentId, params.appendParentId, params.appendMode);
		this.leafId = previousLeafId;
		this.persistRecord(entry);
		this.rememberLeafControl(entry);
		this.leafId = params.targetId;
		this.appendParentId = params.appendParentId;
		this.appendMode = params.appendMode;
		this.pendingDeliberateAppend = false;
		return entry;
	}
	getLeafEntry() {
		return this.leafId ? this.getEntry(this.leafId) : void 0;
	}
	getEntry(id) {
		const entry = this.byId.get(id);
		return entry ? this.normalizeEntryParent(entry) : void 0;
	}
	getChildren(parentId) {
		const children = [];
		for (const entry of this.byId.values()) {
			const normalizedEntry = this.normalizeEntryParent(entry);
			if (normalizedEntry.parentId === parentId) children.push(normalizedEntry);
		}
		return children;
	}
	getLabel(id) {
		return this.labelsById.get(id);
	}
	appendLabelChange(targetId, label) {
		if (!this.byId.has(targetId)) throw new Error(`Entry ${targetId} not found`);
		const entry = {
			type: "label",
			id: generateSessionEntryId(),
			parentId: this.appendParentId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			targetId,
			label
		};
		this.appendEntry(entry);
		if (label) {
			this.labelsById.set(targetId, label);
			this.labelTimestampsById.set(targetId, entry.timestamp);
		} else {
			this.labelsById.delete(targetId);
			this.labelTimestampsById.delete(targetId);
		}
		return entry.id;
	}
	getBranch(fromId) {
		const path = [];
		const seen = /* @__PURE__ */ new Set();
		let currentId = fromId ?? this.leafId;
		while (currentId && !seen.has(currentId)) {
			seen.add(currentId);
			const current = this.byId.get(currentId);
			if (current) {
				const normalizedCurrent = this.normalizeEntryParent(current);
				path.push(normalizedCurrent);
				currentId = normalizedCurrent.parentId;
			} else currentId = this.opaqueParentsById.get(currentId) ?? null;
		}
		path.reverse();
		return path;
	}
	buildSessionContext() {
		return buildSessionContext(this.getBranch());
	}
	getBoundaryCount() {
		return this.persistedBoundaryCount ?? this.getBranch().filter((entry) => entry.type === "compaction" || entry.type === "reset").length;
	}
	getHeader() {
		return this.fileEntries.find((entry) => entry.type === "session") ?? null;
	}
	getEntries() {
		return this.fileEntries.filter((entry) => entry.type !== "session" && this.byId.has(entry.id)).map((entry) => this.normalizeEntryParent(entry));
	}
	getTree() {
		const entries = this.getEntries();
		const nodeMap = /* @__PURE__ */ new Map();
		const roots = [];
		for (const entry of entries) nodeMap.set(entry.id, {
			entry,
			children: [],
			label: this.labelsById.get(entry.id),
			labelTimestamp: this.labelTimestampsById.get(entry.id)
		});
		for (const entry of entries) {
			const node = nodeMap.get(entry.id);
			const parentId = this.resolveCanonicalParentId(entry.parentId);
			if (parentId === null || parentId === entry.id) roots.push(node);
			else {
				const parent = nodeMap.get(parentId);
				if (parent) parent.children.push(node);
				else roots.push(node);
			}
		}
		const stack = [...roots];
		while (stack.length > 0) {
			const node = stack.pop();
			node.children.sort((left, right) => new Date(left.entry.timestamp).getTime() - new Date(right.entry.timestamp).getTime());
			stack.push(...node.children);
		}
		return roots;
	}
	branch(branchFromId) {
		if (!this.byId.has(branchFromId)) this.ensureCompletePersistedHistory();
		const branchTargetId = this.resolveBranchTargetId(branchFromId);
		if (branchTargetId === void 0) throw new Error(`Entry ${branchFromId} not found`);
		this.leafId = branchTargetId;
		this.appendParentId = branchTargetId;
		this.appendMode = void 0;
		this.pendingDeliberateAppend = true;
	}
	resetLeaf() {
		this.leafId = null;
		this.appendParentId = null;
		this.appendMode = void 0;
		this.pendingDeliberateAppend = true;
	}
	branchWithSummary(branchFromId, summary, details, fromHook) {
		if (branchFromId !== null && !this.byId.has(branchFromId)) this.ensureCompletePersistedHistory();
		const branchTargetId = branchFromId === null ? null : this.resolveBranchTargetId(branchFromId);
		if (branchTargetId === void 0) throw new Error(`Entry ${branchFromId} not found`);
		const entry = {
			type: "branch_summary",
			id: generateSessionEntryId(),
			parentId: branchTargetId,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			fromId: branchTargetId ?? "root",
			summary,
			details,
			fromHook
		};
		this.appendEntry(entry, { invalidateSerializedPrefixCache: fromHook === true || details !== void 0 });
		return entry.id;
	}
};
//#endregion
//#region src/agents/sessions/session-manager-branching.ts
var SessionManagerBranching = class extends SessionManagerEntries {
	collectBranchedSessionPath(leafId) {
		const opaqueById = /* @__PURE__ */ new Map();
		for (const opaqueEntry of this.opaqueFileEntries) {
			const link = parseOpaqueLeafEntry(opaqueEntry.record) ?? parseParentLinkedOpaqueEntry(opaqueEntry.record);
			if (link && isRecord(opaqueEntry.record)) opaqueById.set(link.id, opaqueEntry.record);
		}
		const reversedNodes = [];
		const seen = /* @__PURE__ */ new Set();
		let currentId = leafId;
		while (currentId && !seen.has(currentId)) {
			seen.add(currentId);
			const entry = this.byId.get(currentId);
			if (entry) {
				reversedNodes.push({
					type: "entry",
					entry
				});
				if (this.logicalParentsById.has(entry.id)) {
					let physicalId = entry.parentId;
					while (physicalId && !seen.has(physicalId)) {
						const physicalRecord = opaqueById.get(physicalId);
						if (!physicalRecord || !this.opaqueParentsById.has(physicalId)) break;
						seen.add(physicalId);
						reversedNodes.push({
							type: "opaque",
							id: physicalId,
							record: physicalRecord
						});
						physicalId = this.opaqueParentsById.get(physicalId) ?? null;
					}
					currentId = this.logicalParentsById.get(entry.id) ?? null;
				} else currentId = entry.parentId;
				continue;
			}
			const record = opaqueById.get(currentId);
			if (!record || !this.opaqueParentsById.has(currentId)) break;
			reversedNodes.push({
				type: "opaque",
				id: currentId,
				record
			});
			currentId = this.opaqueParentsById.get(currentId) ?? null;
		}
		const entries = [];
		const opaqueEntries = [];
		let tailId = null;
		for (const node of reversedNodes.toReversed()) {
			if (node.type === "entry") {
				if (node.entry.type === "label") continue;
				const branchEntry = node.entry.parentId === tailId ? node.entry : {
					...node.entry,
					parentId: tailId
				};
				entries.push(branchEntry);
				tailId = branchEntry.id;
				continue;
			}
			if (parseOpaqueLeafEntry(node.record)) continue;
			opaqueEntries.push({
				index: entries.length + 1,
				record: {
					...node.record,
					parentId: tailId
				}
			});
			tailId = node.id;
		}
		return {
			entries,
			opaqueEntries,
			tailId
		};
	}
	async createBranchedSession(leafId) {
		this.ensureCompletePersistedHistory();
		const previousSessionId = this.sessionId;
		const branchPath = this.collectBranchedSessionPath(leafId);
		if (branchPath.entries.length === 0) throw new Error(`Entry ${leafId} not found`);
		const newSessionId = createManagedSessionId();
		const timestamp = (/* @__PURE__ */ new Date()).toISOString();
		const persistenceTarget = this.persistenceTarget;
		const header = {
			type: "session",
			version: 3,
			id: newSessionId,
			timestamp,
			cwd: this.cwd,
			parentSession: persistenceTarget ? previousSessionId : void 0
		};
		const pathEntryIds = new Set(branchPath.entries.map((entry) => entry.id));
		const labelsToWrite = [];
		for (const [targetId, label] of this.labelsById) if (pathEntryIds.has(targetId)) labelsToWrite.push({
			targetId,
			label,
			timestamp: this.labelTimestampsById.get(targetId)
		});
		const labelEntries = [];
		let parentId = branchPath.tailId;
		for (const { targetId, label, timestamp: labelTimestamp } of labelsToWrite) {
			const labelEntry = {
				type: "label",
				id: generateSessionEntryId(),
				parentId,
				timestamp: labelTimestamp,
				targetId,
				label
			};
			labelEntries.push(labelEntry);
			parentId = labelEntry.id;
		}
		this.fileEntries = [
			header,
			...branchPath.entries,
			...labelEntries
		];
		this.opaqueFileEntries = branchPath.opaqueEntries;
		this.sessionId = newSessionId;
		this.buildIndex();
		if (!persistenceTarget) return;
		const entryScope = {
			agentId: persistenceTarget.agentId,
			sessionKey: persistenceTarget.sessionKey,
			storePath: persistenceTarget.storePath
		};
		const previousEntry = loadSessionEntry(entryScope);
		const updatedAt = Date.now();
		const nextTarget = {
			...persistenceTarget,
			sessionId: newSessionId
		};
		const nextEntry = {
			...previousEntry ? projectCanonicalSessionEntryShape({ ...previousEntry }) : { updatedAt },
			sessionId: newSessionId,
			updatedAt
		};
		try {
			if (!await withTranscriptWriteTransaction(persistenceTarget, () => {
				const currentEntry = loadSessionEntry(entryScope);
				if (currentEntry?.sessionId !== previousSessionId || currentEntry.lifecycleRevision !== previousEntry?.lifecycleRevision) return false;
				replaceSessionEntrySync(entryScope, nextEntry);
				if (!replaceTranscriptEventsSync(nextTarget, this.getPersistedFileEntries())) throw new Error("Branched session transcript was not persisted");
				return true;
			})) {
				const actualEntry = loadSessionEntry(entryScope);
				const cause = actualEntry ? {
					actualSessionId: actualEntry.sessionId,
					code: "session-rebound",
					expectedSessionId: previousSessionId,
					sessionKey: persistenceTarget.sessionKey
				} : {
					code: "session-entry-missing",
					expectedSessionId: previousSessionId,
					sessionKey: persistenceTarget.sessionKey
				};
				throw new Error(`Branched session was not persisted: ${cause.code}`, { cause });
			}
		} catch (error) {
			this.setSessionTarget(persistenceTarget);
			throw error;
		}
		this.persistenceTarget = nextTarget;
		this.persistenceHeaderPending = false;
		return newSessionId;
	}
};
//#endregion
//#region src/agents/sessions/session-manager.ts
function withSessionContextAdmission(target, admission, read) {
	if (admission && (target.agentId !== admission.agentId || target.sessionId !== admission.sessionId || target.sessionKey !== admission.sessionKey)) throw new SessionTranscriptReadFenceError("Current-turn transcript admission belongs to a different transcript target");
	return runWithSessionTranscriptReadFence(admission, read);
}
var SessionManager = class SessionManager extends SessionManagerBranching {
	constructor(cwd, persistenceTarget, loadedEntries, boundedContext) {
		super(cwd, persistenceTarget, loadedEntries, boundedContext);
	}
	/** Makes pending append-oriented persistence durable without rewriting committed entries. */
	flushPendingPersistence() {
		super.flushPendingPersistence();
	}
	appendMessage(message, options) {
		return super.appendMessage(message, options);
	}
	appendMessageWithTranscriptAnchor(message, options) {
		return super.appendMessageWithTranscriptAnchor(message, options);
	}
	static open(target, cwdOverride, contextLimits) {
		if (contextLimits) return SessionManager.openBounded(target, {
			...contextLimits,
			...cwdOverride !== void 0 ? { cwd: cwdOverride } : {}
		});
		const entries = loadTranscriptEventsSync(target);
		const header = entries.find((entry) => typeof entry === "object" && entry !== null && entry.type === "session");
		return new SessionManager(cwdOverride ?? header?.cwd ?? process.cwd(), target, entries);
	}
	/** Opens only the selected model-context tail while preserving the complete durable transcript. */
	static openBounded(target, options) {
		const { cwd, onTruncated, ...limits } = options;
		const context = readSessionTranscriptBoundedActiveContextCore(target, limits);
		if (context.truncated) onTruncated?.();
		const entries = context.events;
		const header = entries.find((entry) => typeof entry === "object" && entry !== null && entry.type === "session");
		return new SessionManager(cwd ?? header?.cwd ?? process.cwd(), target, entries, {
			...context,
			limits
		});
	}
	/** Detached model view: selected payloads plus lightweight ancestry, never raw replay evidence. */
	static openModelContext(target, options = {}) {
		// V codex-bounded-history-v1: with limits, the newest active-branch tail within them, under the same admission fence
		if (options.limits) {
			const context = withSessionContextAdmission(target, options.admission, () => readSessionTranscriptBoundedActiveContextCore(target, options.limits));
			const boundedEntries = context.events;
			const boundedHeader = boundedEntries.find((entry) => typeof entry === "object" && entry !== null && entry.type === "session");
			if (boundedEntries.length > 0 && (!boundedHeader || (boundedHeader.version ?? 1) < 3)) throw new Error("Persisted legacy session transcripts require doctor/import migration before runtime use");
			options.onBoundedRead?.({
				events: boundedEntries.length,
				totalEvents: context.totalEvents,
				serializedBytes: context.serializedBytes,
				truncated: context.truncated
			});
			return new SessionManager(options.cwd ?? boundedHeader?.cwd ?? process.cwd(), void 0, boundedEntries, {
				...context,
				limits: options.limits
			});
		}
		const entries = withSessionContextAdmission(target, options.admission, () => readSessionTranscriptModelContext(target));
		const header = entries.find((entry) => entry.type === "session");
		if (entries.length > 0 && (!header || (header.version ?? 1) < 3)) throw new Error("Persisted legacy session transcripts require doctor/import migration before runtime use");
		return new SessionManager(options.cwd ?? header?.cwd ?? process.cwd(), void 0, entries);
	}
	/** Synchronously consumes full-fidelity context; its iterator closes with the read snapshot. */
	static readSessionContext(target, read, options = {}) {
		return withSessionContextAdmission(target, options.admission, () => readSessionTranscriptContextMessages(target, read));
	}
	/** Appends to the current transcript leaf without hydrating its history. */
	static appendMessageToTranscript(target, message, options) {
		const outcome = appendTranscriptMessageSync(target, {
			cwd: process.cwd(),
			message,
			...options?.config ? { config: options.config } : {}
		});
		if (!outcome.ok) throw new Error("Session transcript message was not persisted", { cause: outcome.error });
		const result = outcome.value;
		if (!result) throw new Error("Session transcript message was not persisted");
		return result.messageId;
	}
	static inMemory(cwd = process.cwd()) {
		return new SessionManager(cwd);
	}
	static fromEntries(entries, cwdOverride) {
		const fileEntries = structuredClone(entries);
		const header = fileEntries.find((entry) => typeof entry === "object" && entry !== null && entry.type === "session");
		return new SessionManager(cwdOverride ?? header?.cwd ?? process.cwd(), void 0, fileEntries);
	}
};
//#endregion
export { SessionManager as t };
