import { n as sanitizeCodexHistoryImagePayloads } from "./image-payload-sanitizer-CnfoUPCE.js";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import fs from "node:fs/promises";
import { getSessionEntry, parseSqliteSessionFileMarker, resolveTranscriptSessionKeyBySessionId } from "openclaw/plugin-sdk/session-store-runtime";
import { SessionManager, buildSessionContext, migrateSessionEntries, parseSessionEntries } from "openclaw/plugin-sdk/agent-sessions";
import { embeddedAgentLog } from "openclaw/plugin-sdk/agent-harness-runtime";
//#region extensions/codex/src/app-server/session-history.ts
/** Reads model context separately from full-fidelity Codex mirror evidence. */
/** Returns sanitized session-context messages for consumers that need an owned array. */
async function readCodexMirroredSessionHistoryMessages(target, admission, view = "native-evidence", contextTokenBudget) {
	return readCodexMirroredSessionHistory(target, (messages) => Array.from(messages), admission, view, contextTokenBudget);
}
// v-codex-bounded-history-v1: with a context token budget, the model context is the newest tail within 9.5's limits
// (budget x 8 bytes, 10,000 events). A truncated result carries codexHistoryTruncated, so the turn can read the full
// context when it needs it. A failed bounded read falls back to the full read.
const CODEX_MODEL_CONTEXT_MAX_BYTES = 64 * 1024 * 1024;
const CODEX_MODEL_CONTEXT_MAX_EVENTS = 1e4;
function openCodexModelContext(transcriptTarget, admission, contextTokenBudget) {
	if (process.env.OPENCLAW_V_CODEX_BOUNDED_HISTORY !== "0" && typeof contextTokenBudget === "number" && Number.isFinite(contextTokenBudget) && contextTokenBudget > 0) {
		const limits = {
			maxBytes: Math.min(CODEX_MODEL_CONTEXT_MAX_BYTES, Math.max(1024, Math.floor(contextTokenBudget * 8))),
			maxEvents: CODEX_MODEL_CONTEXT_MAX_EVENTS
		};
		const startedAt = Date.now();
		try {
			let bounded;
			const loaded = SessionManager.openModelContext(transcriptTarget, {
				admission,
				limits,
				onBoundedRead: (facts) => {
					bounded = facts;
				}
			});
			if (bounded?.truncated) embeddedAgentLog.info("[codex-bounded-history.1] " + JSON.stringify({
				events: bounded.events,
				totalEvents: bounded.totalEvents,
				bytes: bounded.serializedBytes,
				maxBytes: limits.maxBytes,
				ms: Date.now() - startedAt
			}));
			return {
				loaded,
				truncated: bounded?.truncated === true
			};
		} catch (error) {
			embeddedAgentLog.warn("[codex-bounded-history.1] bounded model context read failed; reading the full context", { error: error instanceof Error ? error.name + ": " + error.message : String(error) });
		}
	}
	return {
		loaded: SessionManager.openModelContext(transcriptTarget, { admission }),
		truncated: false
	};
}
/** The synchronous consumer can reject before further SQLite message payloads are acquired. */
async function readCodexMirroredSessionHistory(target, read, admission, view = "native-evidence", contextTokenBudget) {
	const consume = (messages, header, imageLabel = "codex mirrored history") => {
		if (!isRecord(header) || header.type !== "session") return read([]);
		if (typeof header.id !== "string") return;
		if (header.id !== target.sessionId) return read([]);
		return read((function* () {
			for (const message of messages) yield sanitizeCodexHistoryImagePayloads(message, imageLabel);
		})());
	};
	const readTarget = (transcriptTarget) => {
		if (view === "native-evidence") return SessionManager.readSessionContext(transcriptTarget, consume, { admission });
		const { loaded, truncated } = openCodexModelContext(transcriptTarget, admission, contextTokenBudget);
		const result = consume(loaded.buildSessionContext().messages, loaded.getHeader(), "codex mirrored model context");
		if (truncated && Array.isArray(result)) Object.defineProperty(result, "codexHistoryTruncated", { value: true });
		return result;
	};
	try {
		if (target.sessionTarget) {
			const { agentId, sessionId, sessionKey, storePath } = target.sessionTarget;
			if (!agentId || !sessionId || !sessionKey || !storePath || sessionId !== target.sessionId || target.agentId !== void 0 && agentId !== target.agentId || target.sessionKey !== void 0 && sessionKey !== target.sessionKey) return read([]);
			return readTarget({
				agentId,
				sessionId,
				sessionKey,
				storePath
			});
		}
		const sqliteMarker = parseSqliteSessionFileMarker(target.sessionFile);
		if (sqliteMarker) {
			if (sqliteMarker.sessionId !== target.sessionId || target.agentId !== void 0 && sqliteMarker.agentId !== target.agentId) return read([]);
			const sessionKey = resolveSqliteMarkerSessionKey(target, sqliteMarker);
			if (!sessionKey) return read([]);
			return readTarget({
				agentId: sqliteMarker.agentId,
				sessionId: sqliteMarker.sessionId,
				sessionKey,
				storePath: sqliteMarker.storePath
			});
		}
		if (admission) {
			if (admission.sessionId !== target.sessionId || target.agentId !== void 0 && admission.agentId !== target.agentId || target.sessionKey !== void 0 && admission.sessionKey !== target.sessionKey) return read([]);
			return readTarget({
				agentId: admission.agentId,
				sessionId: admission.sessionId,
				sessionKey: admission.sessionKey,
				storePath: admission.storePath
			});
		}
		const entries = parseSessionEntries(await fs.readFile(target.sessionFile, "utf-8"));
		return consume((function* () {
			migrateSessionEntries(entries);
			const sessionEntries = entries.filter((entry) => isRecord(entry) && entry.type !== "session");
			yield* buildSessionContext(sessionEntries).messages;
		})(), entries[0]);
	} catch (error) {
		if (isRecord(error) && error.code === "ENOENT") return read([]);
		return;
	}
}
function resolveSqliteMarkerSessionKey(target, marker) {
	const explicitSessionKey = target.sessionKey?.trim();
	if (explicitSessionKey) {
		const explicitEntry = getSessionEntry({
			agentId: marker.agentId,
			sessionKey: explicitSessionKey,
			storePath: marker.storePath
		});
		if (explicitEntry) return explicitEntry.sessionId === marker.sessionId ? explicitSessionKey : void 0;
	}
	return resolveTranscriptSessionKeyBySessionId({
		agentId: marker.agentId,
		sessionId: marker.sessionId,
		storePath: marker.storePath
	});
}
//#endregion
export { readCodexMirroredSessionHistoryMessages as n, readCodexMirroredSessionHistory as t };
