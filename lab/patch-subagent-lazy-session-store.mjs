// subagent-lazy-session-store-v1: read the session rows that subagent capability and
// completion lookups use, instead of materializing the whole session store, on V's
// 2026.9.1 db91.6 bytes (core/dist).
//
// V 2026-10-17 00:42-01:22 CPU profile (Gateway main thread, 2406 s, 1 ms sampling): 310 s in
// listSessionEntriesReadOnly -> loadSessionEntrySnapshot, which reads and JSON-parses every row
// of session_nodes (3,909 rows, 245 MB of entry_json) for each call, 5-8 s per call. The "full"
// projection bypasses the session entry cache (session-accessor.sqlite-transcript-state:252).
// Callers that only need a few keys:
//   - subagent-capabilities readSubagentSessionStore, reached on every plugin-harness turn
//     (preparePluginHarnessParams -> resolveConversationCapabilityProfile ->
//     resolveRequesterToolPolicies -> getSubagentDepthFromSessionStore /
//     resolveSubagentCapabilityStore): 170 s;
//   - subagent-completion-admission.store loadSubagentSessionEntry (subagent announce cleanup):
//     73 s.
// The garbage this produces is what grew the Gateway heap to 4.6-6.9 GB on 10/16 (full GC over a
// partly swapped heap then froze it for 46-70 s, docs/gateway-freeze-20261016.md), and the main
// thread it occupies is what makes Codex's process inspection miss its deadline.
//
// The store these callers get is now a lazy view (createSessionEntryLookupReadOnly):
//   - store[key] reads that one row with the same validated reader the exact-key paths use
//     (readExactSessionEntryRowValidated, full projection), applies the same filters as the full
//     list (internal session-effects keys hidden, non-canonical delivery keys refused), and keeps
//     the result for the lifetime of the view;
//   - findSubagentSessionEntryById finds entries by session id through the indexed
//     session_nodes.current_session_id column and still compares entry.sessionId;
//   - enumerating the view (Object.keys/values/entries, for...in, spread) materializes the
//     complete list once, exactly as before, so any other consumer keeps the old result;
//   - an error makes the view behave like the old catch-all (every lookup undefined).
// OPENCLAW_V_SUBAGENT_LAZY_STORE=0 restores the full reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MARKER = "subagent-lazy-session-store-v1";
export const ENTRY_FILE = "session-accessor.sqlite-entry-BlklNPKQ.js";
export const ENTRY_BEFORE = "6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b";
// The same chunk with PR #403 (session-sharing-bounded-reads-v1) applied; it does not touch either anchor.
export const ENTRY_BEFORE_PR403 = "ba3e8dbbc1defae369a7f4eefb0b47586a7e8bec9c1fa01b682fc8f096a99e84";
export const CAPABILITIES_FILE = "subagent-capabilities-CPAHEjL-.js";
export const CAPABILITIES_BEFORE = "76ac1cc681204e12ca77208f760884f9a1452ac244c69c9f78dfefe0b4135a68";
export const ADMISSION_FILE = "subagent-completion-admission.store-JmpNDYTF.js";
export const ADMISSION_BEFORE = "ee0d42e68d09c0bffd590c650e828fee353cb56af9dbb3f7c1cd5b485f5e8a73";
export const LOOKUP_SYMBOL = "openclaw.v.sessionEntryLookup";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const replaceOnce = (source, before, after, label) => {
  assert.equal(source.split(before).length, 2, `${label}: anchor must occur exactly once`);
  return source.replace(before, () => after);
};
const checkBefore = (source, expected, file) => {
  assert.ok(!source.includes(MARKER), `${file} already carries ${MARKER}`);
  const accepted = [expected].flat();
  assert.ok(accepted.includes(sha256(source)), `${file} is not V's db91.6 bytes`);
};

const LOOKUP = `//#region V ${MARKER}: per-key session store view
const V_SESSION_ENTRY_LOOKUP = Symbol.for("${LOOKUP_SYMBOL}");
/**
* A read-only session store view keyed by session key. Lookups read one row each;
* enumeration materializes listSessionEntriesReadOnly(scope) once, unchanged.
*/
function createSessionEntryLookupReadOnly(scope = {}) {
	if (process.env.OPENCLAW_V_SUBAGENT_LAZY_STORE === "0") return Object.fromEntries(listSessionEntriesReadOnly({
		...scope,
		clone: false
	}).map(({ sessionKey, entry }) => [sessionKey, entry]));
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const options = toDatabaseOptions(resolved);
	const entries = new Map();
	let full;
	let failed = false;
	const materialize = () => {
		if (full) return full;
		try {
			full = failed ? {} : Object.fromEntries(listSessionEntriesReadOnly({
				...scope,
				clone: false
			}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		} catch {
			full = {};
		}
		return full;
	};
	const readEntry = (sessionKey) => {
		const result = withOpenClawAgentDatabaseReadOnly((database) => {
			const entry = readExactSessionEntryRowValidated(database, sessionKey)?.entry;
			if (entry && resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry) !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(\`non-canonical persisted row resolves to session key \${resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry)}\`);
			return entry;
		}, options);
		return result.found ? result.value : void 0;
	};
	const getEntry = (sessionKey) => {
		if (full) return Object.hasOwn(full, sessionKey) ? full[sessionKey] : void 0;
		if (failed) return;
		if (entries.has(sessionKey)) return entries.get(sessionKey);
		let entry;
		if (sessionKey && !isInternalSessionEffectsKey(sessionKey)) try {
			entry = readEntry(sessionKey);
		} catch {
			failed = true;
			entries.clear();
			return;
		}
		entries.set(sessionKey, entry);
		return entry;
	};
	const findBySessionId = (sessionId) => {
		if (full) return Object.values(full).find((entry) => typeof entry?.sessionId === "string" && entry.sessionId.trim() === sessionId);
		if (failed) return;
		let keys;
		try {
			const result = withOpenClawAgentDatabaseReadOnly((database) => executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select("session_key").where("current_session_id", "=", sessionId).orderBy("session_key")).rows.map((row) => row.session_key), options);
			keys = result.found ? result.value : [];
		} catch {
			failed = true;
			entries.clear();
			return;
		}
		for (const sessionKey of keys) {
			const entry = getEntry(sessionKey);
			if (typeof entry?.sessionId === "string" && entry.sessionId.trim() === sessionId) return entry;
		}
	};
	const lookup = { findBySessionId };
	return new Proxy(Object.create(null), {
		get(_target, property) {
			if (property === V_SESSION_ENTRY_LOOKUP) return lookup;
			if (typeof property !== "string") return;
			return getEntry(property);
		},
		has(_target, property) {
			return typeof property === "string" && getEntry(property) !== void 0;
		},
		ownKeys() {
			return Reflect.ownKeys(materialize());
		},
		getOwnPropertyDescriptor(_target, property) {
			if (typeof property !== "string") return;
			const value = full ? (Object.hasOwn(full, property) ? full[property] : void 0) : getEntry(property);
			return value === void 0 ? void 0 : {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			};
		},
		set(_target, property, value) {
			if (typeof property !== "string") return false;
			if (full) full[property] = value;
			else entries.set(property, value);
			return true;
		},
		defineProperty(_target, property, descriptor) {
			if (typeof property !== "string" || !("value" in descriptor)) return false;
			if (full) full[property] = descriptor.value;
			else entries.set(property, descriptor.value);
			return true;
		},
		deleteProperty(_target, property) {
			if (typeof property !== "string") return true;
			if (full) delete full[property];
			else entries.set(property, void 0);
			return true;
		}
	});
}
//#endregion
`;

export function patchEntryLookup(source) {
  checkBefore(source, [ENTRY_BEFORE, ENTRY_BEFORE_PR403], ENTRY_FILE);
  let out = replaceOnce(source, "function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {", `${LOOKUP}function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {`, "list function");
  out = replaceOnce(out, "resolveSessionEntry as y };", "resolveSessionEntry as y, createSessionEntryLookupReadOnly as z };", "export list");
  return `// ${MARKER}\n${out}`;
}

export function patchCapabilities(source) {
  checkBefore(source, CAPABILITIES_BEFORE, CAPABILITIES_FILE);
  let out = replaceOnce(source,
    'import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";',
    'import { z as createSessionEntryLookupReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";',
    "capabilities import");
  out = replaceOnce(out, `function readSubagentSessionStore(storePath, agentId) {
	try {
		return Object.fromEntries(listSessionEntriesReadOnly({
			agentId,
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
	} catch {}
	return {};
}`, `function readSubagentSessionStore(storePath, agentId) {
	try {
		return createSessionEntryLookupReadOnly({
			agentId,
			storePath
		});
	} catch {}
	return {};
}`, "readSubagentSessionStore");
  out = replaceOnce(out, `function findSubagentSessionEntryById(store, sessionId) {
	const normalizedSessionId = normalizeOptionalString(sessionId);
	if (!normalizedSessionId) return;
`, `function findSubagentSessionEntryById(store, sessionId) {
	const normalizedSessionId = normalizeOptionalString(sessionId);
	if (!normalizedSessionId) return;
	const lookup = store?.[Symbol.for("${LOOKUP_SYMBOL}")];
	if (lookup) return lookup.findBySessionId(normalizedSessionId);
`, "findSubagentSessionEntryById");
  return `// ${MARKER}\n${out}`;
}

export function patchAdmission(source) {
  checkBefore(source, ADMISSION_BEFORE, ADMISSION_FILE);
  let out = replaceOnce(source,
    'import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope } from "./session-accessor.sqlite-entry-BlklNPKQ.js";',
    'import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope, z as createSessionEntryLookupReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";',
    "admission import");
  out = replaceOnce(out, `	if (!store) {
		store = Object.fromEntries(listSessionEntriesReadOnly({
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		params.storeCache?.set(storePath, store);
	}
	return store[key] ?? store[normalizeStoreSessionKey(key)];`, `	if (!store) {
		store = createSessionEntryLookupReadOnly({ storePath });
		params.storeCache?.set(storePath, store);
	}
	return store[key] ?? store[normalizeStoreSessionKey(key)];`, "loadSubagentSessionEntry");
  return `// ${MARKER}\n${out}`;
}
