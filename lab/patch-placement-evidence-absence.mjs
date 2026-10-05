import assert from 'node:assert/strict';

// Worker placement sweep without decoding every session entry.
//
// Every 60 s the Gateway reconciles all worker_session_placements rows on its main thread
// (WORKER_PLACEMENT_RECONCILE_INTERVAL_MS). Each local turn claim leaves a placement row
// behind, one per session, so the table only grows: 295 rows on V on 2026-09-18, 2394 on
// 2026-10-05, most added by Night Shift fan-out. The sweep asks the session store for
// identity evidence on every placement, and readSessionIdentityEvidenceRows selects
// entry_json and decodes it for each one. With 2400-3200 placements that is a 1.9-3.2 s
// main-thread stall once a minute (shared VLab profile 2026-10-05, V liveness max median
// 2.0-2.6 s a day since 2026-09-24), and every chat message that lands in it waits.
//
// The sweep acts on exactly one answer: "absent" retires the placement (and tears down an
// orphaned environment); any other answer leaves it alone. Whether a placement is absent
// follows from indexed columns, except when its exact session key now points at another
// session id: then the original falls back to the session-id lookup only if that entry
// decodes, so only that row is decoded. Present placements come back as unknown/undecoded,
// which the sweep treats the same as current. Other callers keep the full evidence read.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const ABSENCE_ROWS = `// Placement sweeps only act on "absent". Decide absence from indexed columns and decode
// entry_json only where readability changes that answer (the exact key moved to another
// session id). Present results are unknown/undecoded: current vs unknown needs the entry.
function readSessionIdentityAbsenceRows(database, items) {
	assertCanonicalSqliteSessionKeysCurrent(database);
	const db = getSessionKysely(database.db);
	const rowsByKey = /* @__PURE__ */ new Map();
	const readChunks = (values, column) => {
		for (let offset = 0; offset < values.length; offset += SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE) {
			const chunk = values.slice(offset, offset + SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE);
			const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
				"current_session_id",
				"entry_valid",
				"session_key"
			]).where(column, "in", chunk)).rows;
			for (const row of rows) rowsByKey.set(row.session_key, row);
		}
	};
	readChunks([...new Set(items.flatMap((item) => item.sessionKey ? [item.sessionKey] : []))], "session_key");
	const fallbackIds = items.flatMap((item) => {
		const exactRow = item.sessionKey ? rowsByKey.get(item.sessionKey) : void 0;
		return exactRow && exactRow.entry_valid !== -1 && exactRow.current_session_id === item.sessionId ? [] : [item.sessionId];
	});
	readChunks([...new Set(fallbackIds)], "current_session_id");
	const rowsBySessionId = /* @__PURE__ */ new Map();
	for (const row of rowsByKey.values()) {
		const rows = rowsBySessionId.get(row.current_session_id) ?? [];
		rows.push(row);
		rowsBySessionId.set(row.current_session_id, rows);
	}
	const readable = /* @__PURE__ */ new Map();
	const isReadable = (row) => {
		if (row.entry_valid !== 1) return false;
		let value = readable.get(row.session_key);
		if (value === void 0) {
			value = false;
			try {
				const full = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_nodes").select([
					"current_session_id",
					"entry_json",
					"entry_valid",
					"session_key",
					"updated_at"
				]).where("session_key", "=", row.session_key));
				if (full?.entry_valid === 1 && parseReadableSqliteSessionEntryRow(database, full)) value = true;
			} catch {}
			readable.set(row.session_key, value);
		}
		return value;
	};
	const present = {
		status: "unknown",
		reason: "undecoded"
	};
	return items.map((item) => {
		const exactRow = item.sessionKey ? rowsByKey.get(item.sessionKey) : void 0;
		if (exactRow && exactRow.entry_valid !== -1) {
			if (exactRow.current_session_id === item.sessionId) return present;
			if (!isReadable(exactRow)) return {
				status: "unknown",
				reason: "row-invalid"
			};
		}
		const fallbackRows = rowsBySessionId.get(item.sessionId) ?? [];
		if (fallbackRows.length !== 1) return fallbackRows.length === 0 ? { status: "absent" } : {
			status: "unknown",
			reason: "ambiguous"
		};
		return fallbackRows[0].entry_valid === -1 ? { status: "absent" } : present;
	});
}
`;

export function patchAccessor(source) {
  let out = replaceExactlyOnce(
    source,
    '/** Reads indexed identity evidence once per physical store and in SQLite-sized chunks. */\nfunction readSessionIdentityEvidenceBatch(probes) {\n',
    `${ABSENCE_ROWS}/** Reads indexed identity evidence once per physical store and in SQLite-sized chunks. */\nfunction readSessionIdentityEvidenceBatch(probes, options) {\n\tconst readRows = options?.absenceOnly === true ? readSessionIdentityAbsenceRows : readSessionIdentityEvidenceRows;\n`,
    'evidence batch header',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\tread = withOpenClawAgentDatabaseReadOnly((database) => readSessionIdentityEvidenceRows(database, group.items), group.options);\n',
    '\t\t\tread = withOpenClawAgentDatabaseReadOnly((database) => readRows(database, group.items), group.options);\n',
    'evidence batch read',
  );
  return out;
}

export function patchPlacementStartup(source) {
  return replaceExactlyOnce(
    source,
    '\t\t\tsessionKey: identity.sessionKey,\n\t\t\tstorePath: target.storePath\n\t\t}))) : [];\n',
    '\t\t\tsessionKey: identity.sessionKey,\n\t\t\tstorePath: target.storePath\n\t\t})), { absenceOnly: true }) : [];\n',
    'placement evidence read',
  );
}
