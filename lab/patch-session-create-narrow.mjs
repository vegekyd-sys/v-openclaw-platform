import assert from 'node:assert/strict';

// sessions.create (and so sessions_spawn visible=true) no longer parses every session row on the Gateway thread
// (V 2026-11-23).
//
// 14:51:25-14:52:15, 15:07:27-15:08:27 and 15:24:4x-15:25:36 CST a /vds group turn called
// sessions_spawn(visible=true). Each time the Gateway's main thread stopped for 47-60 s (liveness overdue
// 42.8 / 38.4 / 46.6 s, eventLoopDelayMax 49.9 / 59.9 s), heapUsed rose from <6 GiB to 7.5 GiB, Feishu card
// updates timed out and DingTalk reconnected. Every visible spawn since 11/16 lines up with such a stop
// (11/16 23:47 17.6 s, 11/17 01:06 23.7 s); it grows with the store (makaron: 26,779 rows, 2.64 GB of entry JSON).
//
// The visible spawn goes through the in-process `sessions.create` handler. In a candidate with a V-scale store
// (21,800 rows / 1.7 GB) one warm call took 45.9 s; the sampling heap profiler attributed 6.2 of 6.9 GB to:
//   createSessionEntryWithTranscript -> listSessionEntriesCore -> loadSessionEntrySnapshot
// which reads every row's complete entry JSON (skills and prompt snapshots included) and parses it, to resolve
// one session key and, in the caller, to check that the new label is not used by another session. Plus:
//   - resolveGatewaySessionStoreTarget reads every row's list projection (6 s) and then drops the store; only
//     the seed keys are ever looked at (findCanonicalStoreMatch);
//   - the lifecycle commit counts every row twice (readSessionEntryCount in and after the transaction), for
//     counts createSessionEntryWithTranscript discards.
//
// session-create-narrow-v1:
// - createSessionEntryWithTranscript lists session keys only (primary-key index), keeps the keys the store
//   resolver can consult (the trimmed key, its folded aliases, and keys that normalize to the requested key)
//   and reads just those rows, with the same projection, parser, participant projection, internal-key filter
//   and canonical-key check as the full listing, in key order;
// - the creation callback gets isSessionLabelInUse(label, exceptKey): it reads the rows whose label column
//   equals the label (the writer stores normalizeText(entry.label); NULL, 0 and 1 sit in the record header, so
//   unlabeled rows are not read past their header) plus every entry_valid != 1 row, and compares the parsed
//   entry.label exactly. A label that is not already trimmed and non-empty uses the full listing as before;
// - session-create-service uses that helper for isLabelInUse;
// - the lifecycle mutation skips both entry counts when its caller discards them (skipEntryCounts);
// - resolveGatewaySessionStoreTarget reads its seed keys exactly (the store is not returned).
// OPENCLAW_V_SESSION_CREATE_NARROW=0 restores all of it (read per call).

export const MARKER = 'session-create-narrow-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source, name) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to ${name}`);
}

const ACCESSOR_IMPORTS = `import { O as __scnSelectSessionEntryRows, m as __scnCanonicalMigrationError, projectSqliteSessionParticipantsBatch as __scnProjectParticipants } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { o as __scnResolveDeliveryProvenKey } from "./store-entry-CMuTqREZ.js";
`;

const ACCESSOR_HELPERS = `// ${MARKER}: creating one session reads the rows it can resolve to, not every row's entry JSON.
function sessionCreateNarrowEnabled() {
	return process.env.OPENCLAW_V_SESSION_CREATE_NARROW !== "0";
}
function sessionCreateNarrowFoldKey(key) {
	return key.replace(/\\s+/gu, "").toLowerCase();
}
/** Same rows, projection, parser and checks as listSessionEntriesCore (full), restricted to keys, in key order. */
function readSessionCreateEntriesForKeys(database, keys) {
	const parsed = new Map();
	const wanted = [...new Set(keys)].filter((key) => !isInternalSessionEffectsKey(key));
	for (let offset = 0; offset < wanted.length; offset += 400) {
		const chunk = wanted.slice(offset, offset + 400);
		for (const row of iterateSqliteQuerySync(database.db, __scnSelectSessionEntryRows(database, "full").select("updated_at").where("session_key", "in", chunk).orderBy("session_key"))) {
			const entry = parseSessionEntryJson(row, "full");
			if (entry) parsed.set(row.session_key, entry);
		}
	}
	const projected = __scnProjectParticipants(database.db, parsed);
	return [...projected.keys()].toSorted((left, right) => Buffer$1.compare(Buffer$1.from(left, "utf8"), Buffer$1.from(right, "utf8"))).map((sessionKey) => {
		const entry = projected.get(sessionKey);
		const deliveryCanonicalKey = __scnResolveDeliveryProvenKey(sessionKey, entry);
		if (deliveryCanonicalKey !== sessionKey) throw __scnCanonicalMigrationError(\`non-canonical persisted row resolves to session key \${deliveryCanonicalKey}\`);
		return { sessionKey, entry };
	});
}
function withSessionCreateDatabase(storeScope, read) {
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolveSqliteScope({ ...storeScope, sessionKey: "" })));
	assertCanonicalSqliteSessionKeysCurrent(database);
	return database.db.isTransaction ? read(database) : runSqliteDeferredTransactionSync(database.db, () => read(database));
}
/** The entries resolveSessionStoreEntryCore can consult for sessionKey: trimmed key, folded aliases, same normalized key. */
function loadSessionCreateCandidateEntries(storeScope, sessionKey) {
	const trimmedKey = sessionKey.trim();
	const normalizedKey = normalizeStoreSessionKey(trimmedKey);
	const direct = new Set([trimmedKey, normalizedKey, ...collectSessionEntryLookupKeys(void 0, sessionKey)]);
	const folded = sessionCreateNarrowFoldKey(normalizedKey);
	return withSessionCreateDatabase(storeScope, (database) => {
		const keys = [];
		for (const row of iterateSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select("session_key"))) {
			const key = row.session_key;
			// normalizeStoreSessionKey only lowercases and trims spans, so equal normalized keys fold equal.
			if (direct.has(key) || sessionCreateNarrowFoldKey(key) === folded && normalizeStoreSessionKey(key) === normalizedKey) keys.push(key);
		}
		return readSessionCreateEntriesForKeys(database, keys);
	});
}
/** Another session (not exceptKey) whose entry.label === label, as Object.entries(fullStore).some(...) answered. */
function isSessionCreateLabelInUse(storeScope, label, exceptKey) {
	if (typeof label !== "string" || !label || label.trim() !== label) return listSessionEntriesCore(storeScope).some(({ sessionKey, entry }) => sessionKey !== exceptKey && entry.label === label);
	return withSessionCreateDatabase(storeScope, (database) => {
		// The writer stores label = normalizeText(entry.label) on every entry_valid = 1 row; other rows are read whole.
		const keys = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select("session_key").where((eb) => eb.or([eb("label", "=", label), eb("entry_valid", "!=", 1)]))).rows.map((row) => row.session_key).filter((key) => key !== exceptKey);
		return readSessionCreateEntriesForKeys(database, keys).some(({ entry }) => entry.label === label);
	});
}
`;

export function patchAccessor(source) {
  guard(source, 'session-accessor-K0XuW6ln.js');
  let out = source;
  out = replaceExactlyOnce(out,
    'import { isDeepStrictEqual } from "node:util";\n',
    `${ACCESSOR_IMPORTS}import { isDeepStrictEqual } from "node:util";\n`,
    'node:util import');
  out = replaceExactlyOnce(out,
    '//#region src/config/sessions/session-accessor.entry-mutation.ts\n',
    `//#region src/config/sessions/session-accessor.entry-mutation.ts\n${ACCESSOR_HELPERS}`,
    'entry-mutation region');
  out = replaceExactlyOnce(out,
    `	const store = Object.fromEntries(listSessionEntriesCore(storeScope).map(({ sessionKey, entry }) => [sessionKey, entry]));
	const resolved = resolveSessionStoreEntryCore({
		store,
		sessionKey: scope.sessionKey
	});
	const created = await createEntry({
		existingEntry: resolved.existing ? { ...resolved.existing } : void 0,
		sessionEntries: cloneSessionEntries(store)
	});`,
    `	const narrow = sessionCreateNarrowEnabled() && !isIncognitoSessionKey(scope.sessionKey);
	const store = Object.fromEntries((narrow ? loadSessionCreateCandidateEntries(storeScope, scope.sessionKey) : listSessionEntriesCore(storeScope)).map(({ sessionKey, entry }) => [sessionKey, entry]));
	const resolved = resolveSessionStoreEntryCore({
		store,
		sessionKey: scope.sessionKey
	});
	const created = await createEntry({
		existingEntry: resolved.existing ? { ...resolved.existing } : void 0,
		sessionEntries: cloneSessionEntries(store),
		...narrow ? { isSessionLabelInUse: (label, exceptKey) => isSessionCreateLabelInUse(storeScope, label, exceptKey) } : {}
	});`,
    'createSessionEntryWithTranscript store read');
  out = replaceExactlyOnce(out,
    `		skipMaintenance: true,
		...options.commitGuard ? { beforeCommitInTransaction: options.commitGuard } : {}
	});
	return {
		ok: true,
		entry,
		sessionFile: resolved.normalizedKey
	};`,
    `		skipMaintenance: true,
		...sessionCreateNarrowEnabled() ? { skipEntryCounts: true } : {},
		...options.commitGuard ? { beforeCommitInTransaction: options.commitGuard } : {}
	});
	return {
		ok: true,
		entry,
		sessionFile: resolved.normalizedKey
	};`,
    'createSessionEntryWithTranscript lifecycle mutation');
  out = replaceExactlyOnce(out,
    '		const countEntries = projected.runOwnedInternalRemovalsOnly !== true;\n',
    `		const countEntries = projected.runOwnedInternalRemovalsOnly !== true && params.skipEntryCounts !== true; // ${MARKER}\n`,
    'lifecycle countEntries');
  return out;
}

export function patchCreateService(source) {
  guard(source, 'session-create-service--hv2vsLh.js');
  let out = source;
  out = replaceExactlyOnce(out,
    '		}, async ({ existingEntry, sessionEntries }) => {\n',
    '		}, async ({ existingEntry, sessionEntries, isSessionLabelInUse }) => {\n',
    'createEntry callback');
  out = replaceExactlyOnce(out,
    '				isLabelInUse: (label) => Object.entries(sessionEntries).some(([sessionKey, entry]) => sessionKey !== target.canonicalKey && entry.label === label),\n',
    `				// ${MARKER}: the accessor answers from the label column instead of every parsed entry.
				isLabelInUse: (label) => typeof isSessionLabelInUse === "function" ? isSessionLabelInUse(label, target.canonicalKey) : Object.entries(sessionEntries).some(([sessionKey, entry]) => sessionKey !== target.canonicalKey && entry.label === label),\n`,
    'isLabelInUse');
  return out;
}

export function patchStoreUtils(source) {
  guard(source, 'session-utils-store-Dlphca2N.js');
  return replaceExactlyOnce(source,
    `function resolveGatewaySessionStoreTarget(params) {
	const { store: _store, ...target } = resolveGatewaySessionStoreTargetWithStore({
		...params,
		projection: "list"
	});
	return target;
}`,
    `function resolveGatewaySessionStoreTarget(params) {
	const { store: _store, ...target } = resolveGatewaySessionStoreTargetWithStore({
		...params,
		// ${MARKER}: the store is dropped and only its seed keys are matched, so read the seeds exactly.
		...process.env.OPENCLAW_V_SESSION_CREATE_NARROW !== "0" && params.exactRead === void 0 ? { exactRead: true } : {},
		projection: "list"
	});
	return target;
}`,
    'resolveGatewaySessionStoreTarget');
}

// V's bytes (/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist, 2026-11-23).
export const FILES = [
  { name: 'session-accessor-K0XuW6ln.js', base: 'lab/release-files/infer-latency', target: 'openclaw/dist', before: '13af5e83e8dd4140a4d90340dcb0ebacc62699643ecb00817b23897872131b38', patch: patchAccessor },
  { name: 'session-create-service--hv2vsLh.js', base: 'lab/release-files/session-create-narrow/v-base', target: 'openclaw/dist', before: '83b8f923a0b8d7c7e76bdfcf8f049d54f1d4526eeb3d8b04ba31da8ce166bbd5', patch: patchCreateService },
  { name: 'session-utils-store-Dlphca2N.js', base: 'lab/release-files/session-sharing-bounded-reads', target: 'openclaw/dist', before: 'b566c7e93e3cab8ecc2242ae241597d0ee9890cd8455b99c22a0262eb84dad6c', patch: patchStoreUtils },
];
