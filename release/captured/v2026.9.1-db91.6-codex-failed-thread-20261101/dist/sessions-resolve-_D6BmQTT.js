import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import "./agent-scope-CSlN0kZb.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { n as resolveSessionStoreAgentId } from "./session-store-key-DVtVp9hU.js";
import { n as loadCombinedSessionStoreForGatewayCore } from "./combined-store-gateway-BwDhjbIt.js";
import { n as hasOperatorBoundary } from "./operator-role-policy-B_VzZMic.js";
import { c as buildSessionListRowMetadataContext, i as buildGatewaySessionInfo, t as filterAndSortSessionEntries } from "./session-utils-list-BUP03AzS.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { f as resolveGatewaySessionStoreTargetWithStore, l as resolveDeletedAgentIdFromSessionKey } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import { r as controlUiSessionSlug } from "./share-BXJe223Y.js";
import { n as SHORT_SESSION_ID_RE, t as SESSION_UUID_SUFFIX_RE } from "./src-C-Qv_qoV.js";
import { n as resolveSessionIdMatchSelection } from "./session-id-resolution-tHy0h84G.js";
import { t as parseSessionLabel } from "./session-label-DSD-L6TD.js";
import { n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";
import { O as isInternalSessionEffectsKey } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
//#region src/gateway/sessions-resolve.ts
function resolveSessionVisibilityFilterOptions(p) {
	return {
		includeGlobal: p.includeGlobal === true,
		includeUnknown: p.includeUnknown === true,
		spawnedBy: p.spawnedBy,
		agentId: p.agentId
	};
}
function noSessionFoundResult(params) {
	if (params.p.allowMissing) return {
		ok: true,
		missing: true
	};
	return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, params.message)
	};
}
/** Rejects sessions whose owning agent no longer exists in config (#65524). */
function validateSessionAgentExists(cfg, key, entry, options) {
	const deletedAgentId = resolveDeletedAgentIdFromSessionKey(cfg, key, entry, options);
	if (deletedAgentId === null) return null;
	return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, `Agent "${deletedAgentId}" no longer exists in configuration`)
	};
}
function isResolvedSessionKeyVisible(params) {
	if (typeof params.p.spawnedBy !== "string" || params.p.spawnedBy.trim().length === 0) return true;
	return filterAndSortSessionEntries({
		cfg: params.cfg,
		store: params.store,
		now: Date.now(),
		opts: resolveSessionVisibilityFilterOptions(params.p)
	}).some(([key]) => key === params.key);
}
function findVisibleSessionIdMatches(params) {
	return filterAndSortSessionEntries({
		cfg: params.cfg,
		store: params.store,
		now: Date.now(),
		opts: resolveSessionVisibilityFilterOptions(params.p)
	}).filter(([key, entry]) => (params.entryFilter?.(key, entry) ?? true) && (entry?.sessionId === params.sessionId || key === params.sessionId));
}
function normalizeShortSessionId(shortId) {
	return SHORT_SESSION_ID_RE.test(shortId) ? shortId.toLowerCase() : null;
}
function findVisibleShortIdMatches(params) {
	const now = Date.now();
	return filterAndSortSessionEntries({
		cfg: params.cfg,
		store: params.store,
		now,
		opts: {
			...resolveSessionVisibilityFilterOptions(params.p),
			archived: "all"
		}
	}).flatMap(([key, entry]) => {
		if (params.entryFilter && !params.entryFilter(key, entry)) return [];
		if (!(parseAgentSessionKey(key)?.rest.match(SESSION_UUID_SUFFIX_RE)?.[1])?.toLowerCase().replaceAll("-", "").startsWith(params.shortId)) return [];
		if (resolveDeletedAgentIdFromSessionKey(params.cfg, key, entry) !== null) return [];
		const row = buildGatewaySessionInfo({
			cfg: params.cfg,
			storePath: params.storePath,
			store: params.store,
			key,
			entry,
			now
		});
		return [{
			key,
			agentId: expectDefined(row.agentId ?? parseAgentSessionKey(key)?.agentId ?? params.p.agentId, "short-id session agent"),
			...row.displayName ? { displayName: row.displayName } : {},
			...row.boardFace ? { boardFace: row.boardFace } : {}
		}];
	});
}
async function resolveSessionKeyFromResolveParams(params) {
	const { cfg, client, p } = params;
	const entryFilter = createSessionListEntryFilter({
		client,
		cfg
	});
	const key = normalizeOptionalString(p.key) ?? "";
	const hasKey = key.length > 0;
	const sessionId = normalizeOptionalString(p.sessionId) ?? "";
	const hasSessionId = sessionId.length > 0;
	const hasLabel = (normalizeOptionalString(p.label) ?? "").length > 0;
	const rawShortId = normalizeOptionalString(p.shortId) ?? "";
	const hasShortId = rawShortId.length > 0;
	if (p.slugHint !== void 0 && !hasShortId) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, "slugHint requires shortId")
	};
	const selectionCount = [
		hasKey,
		hasSessionId,
		hasLabel,
		hasShortId
	].filter(Boolean).length;
	if (selectionCount > 1) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, "Provide either key, sessionId, label, or shortId (not multiple)")
	};
	if (selectionCount === 0) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, "Either key, sessionId, label, or shortId is required")
	};
	// sessions-search-exact-read: the sessionId, shortId and label searches read only the rows they can match.
	const searchExact = process.env.OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT !== "0";
	const loadSearchStore = (opts, match) => loadCombinedSessionStoreForGatewayCore(cfg, searchExact ? {
		...opts,
		match
	} : opts);
	// findVisibleSessionIdMatches keeps entry.sessionId === sessionId or key === sessionId.
	const sessionIdMatch = {
		sessionIds: [sessionId],
		sessionKeys: [sessionId]
	};
	if (hasKey) {
		const requestedAgent = resolveRequestedSessionAgentId(cfg, key, p.agentId);
		if (!requestedAgent.ok) return requestedAgent;
		// sessions-resolve-exact-read: read only this key's store rows, as sessions.get does.
		const exactRead = process.env.OPENCLAW_V_SESSIONS_RESOLVE_EXACT !== "0";
		const target = resolveGatewaySessionStoreTargetWithStore({
			cfg,
			key,
			clone: false,
			...exactRead ? {
				exactRead: true,
				readOnly: true
			} : {},
			...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {}
		});
		const store = target.store;
		const entry = exactRead && isInternalSessionEffectsKey(target.canonicalKey) ? void 0 : store[target.canonicalKey];
		if (entry) {
			if (hasOperatorBoundary(client, cfg) && entryFilter?.(target.canonicalKey, entry) === false || !isResolvedSessionKeyVisible({
				cfg,
				p,
				store,
				key: target.canonicalKey
			})) return noSessionFoundResult({
				p,
				message: `No session found: ${key}`
			});
			const agentCheck = validateSessionAgentExists(cfg, target.canonicalKey, entry, { acpMetadataSessionKey: target.canonicalKey });
			if (agentCheck) return agentCheck;
			return {
				ok: true,
				key: target.canonicalKey,
				agentId: requestedAgent.agentId
			};
		}
		return noSessionFoundResult({
			p,
			message: `No session found: ${key}`
		});
	}
	if (hasSessionId) {
		if (!p.agentId) {
			const ownerTaggedMatches = /* @__PURE__ */ new Map();
			for (const agentId of listAgentIds(cfg)) {
				const agentMatches = findVisibleSessionIdMatches({
					cfg,
					store: loadSearchStore({ agentId }, sessionIdMatch).store,
					p: {
						...p,
						agentId
					},
					sessionId,
					entryFilter
				});
				const agentSelection = resolveSessionIdMatchSelection(agentMatches, sessionId);
				if (agentSelection.kind === "ambiguous") return {
					ok: false,
					error: errorShape(ErrorCodes.INVALID_REQUEST, `Multiple sessions found for sessionId: ${sessionId} (${agentSelection.sessionKeys.join(", ")})`)
				};
				if (agentSelection.kind === "selected") {
					const entry = agentMatches.find(([matchKey]) => matchKey === agentSelection.sessionKey)?.[1];
					const owner = resolveRequestedSessionAgentId(cfg, agentSelection.sessionKey, agentId);
					if (entry && owner.ok) ownerTaggedMatches.set(`${owner.agentId}\0${agentSelection.sessionKey}`, {
						agentId: owner.agentId,
						entry,
						key: agentSelection.sessionKey
					});
				}
			}
			if (ownerTaggedMatches.size > 1) return {
				ok: false,
				error: errorShape(ErrorCodes.INVALID_REQUEST, `Multiple sessions found for sessionId: ${sessionId} (${[...ownerTaggedMatches.values()].map((match) => `${match.agentId}:${match.key}`).join(", ")})`)
			};
			const ownerTaggedMatch = ownerTaggedMatches.values().next().value;
			if (ownerTaggedMatch) return validateSessionAgentExists(cfg, ownerTaggedMatch.key, ownerTaggedMatch.entry) ?? {
				ok: true,
				key: ownerTaggedMatch.key,
				agentId: ownerTaggedMatch.agentId
			};
		}
		const { store } = loadSearchStore({ agentId: p.agentId }, sessionIdMatch);
		const matches = findVisibleSessionIdMatches({
			cfg,
			store,
			p,
			sessionId,
			entryFilter
		});
		const selection = resolveSessionIdMatchSelection(matches, sessionId);
		if (selection.kind === "none") return noSessionFoundResult({
			p,
			message: `No session found: ${sessionId}`
		});
		if (selection.kind === "ambiguous") return {
			ok: false,
			error: errorShape(ErrorCodes.INVALID_REQUEST, `Multiple sessions found for sessionId: ${sessionId} (${selection.sessionKeys.join(", ")})`)
		};
		const selectedEntry = matches.find(([matchKey]) => matchKey === selection.sessionKey)?.[1];
		let selectedAgentId = parseAgentSessionKey(selection.sessionKey)?.agentId ?? p.agentId;
		if (!selectedAgentId) {
			const resolvedOwner = resolveRequestedSessionAgentId(cfg, selection.sessionKey);
			if (!resolvedOwner.ok) return resolvedOwner;
			selectedAgentId = resolvedOwner.agentId;
		}
		const agentCheckSessionId = validateSessionAgentExists(cfg, selection.sessionKey, selectedEntry);
		if (agentCheckSessionId) return agentCheckSessionId;
		return {
			ok: true,
			key: selection.sessionKey,
			agentId: selectedAgentId
		};
	}
	if (hasShortId) {
		const shortId = normalizeShortSessionId(rawShortId);
		if (!shortId) return {
			ok: false,
			error: errorShape(ErrorCodes.INVALID_REQUEST, "shortId must be 8-32 hexadecimal characters")
		};
		// findVisibleShortIdMatches keeps keys whose UUID suffix starts with the short id.
		const { storePath, store } = loadSearchStore({ agentId: p.agentId }, { keyFilter: (storedKey) => (parseAgentSessionKey(storedKey)?.rest.match(SESSION_UUID_SUFFIX_RE)?.[1])?.toLowerCase().replaceAll("-", "").startsWith(shortId) === true });
		const matches = findVisibleShortIdMatches({
			cfg,
			storePath,
			store,
			p,
			shortId,
			entryFilter
		});
		const slugHint = normalizeOptionalString(p.slugHint);
		const slugMatches = slugHint ? matches.filter((candidate) => controlUiSessionSlug(candidate.displayName) === slugHint) : [];
		const narrowed = slugMatches.length > 0 ? slugMatches : matches;
		if (narrowed.length === 0) return noSessionFoundResult({
			p,
			message: `No session found: ${shortId}`
		});
		if (narrowed.length > 1) return {
			ok: true,
			ambiguous: true,
			candidates: narrowed.slice(0, 10)
		};
		return {
			ok: true,
			...expectDefined(narrowed[0], "short session match at 0")
		};
	}
	const parsedLabel = parseSessionLabel(p.label);
	if (!parsedLabel.ok) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, parsedLabel.error)
	};
	// filterSessionEntries keeps entry.label === the trimmed label; the label column is the trimmed entry.label.
	const { store } = loadSearchStore({ agentId: p.agentId }, { labels: [parsedLabel.label] });
	const now = Date.now();
	let rowContext;
	const matches = filterAndSortSessionEntries({
		cfg,
		...entryFilter ? { entryFilter } : {},
		store,
		now,
		getRowContext: () => rowContext ??= buildSessionListRowMetadataContext({ now }),
		opts: {
			...resolveSessionVisibilityFilterOptions(p),
			label: parsedLabel.label,
			limit: 2
		}
	});
	if (matches.length === 0) return noSessionFoundResult({
		p,
		message: `No session found with label: ${parsedLabel.label}`
	});
	if (matches.length > 1) {
		const keys = matches.map(([matchKey]) => matchKey).join(", ");
		return {
			ok: false,
			error: errorShape(ErrorCodes.INVALID_REQUEST, `Multiple sessions found with label: ${parsedLabel.label} (${keys})`)
		};
	}
	const [labelKey, labelEntry] = expectDefined(matches[0], "label session match at 0");
	const agentCheckLabel = validateSessionAgentExists(cfg, labelKey, labelEntry);
	if (agentCheckLabel) return agentCheckLabel;
	return {
		ok: true,
		key: labelKey,
		agentId: normalizeAgentId(parseAgentSessionKey(labelKey)?.agentId ?? p.agentId ?? resolveSessionStoreAgentId(cfg, labelKey))
	};
}
//#endregion
export { resolveSessionKeyFromResolveParams as t };
