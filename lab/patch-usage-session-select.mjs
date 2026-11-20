import assert from 'node:assert/strict';

// sessions.usage reads only the session rows it needs, and read-scoped CLI calls run in the usage
// worker (V 2026-11-20).
//
// 17:51:14 and 17:51:46 CST a /vcc session ran
//   openclaw gateway call sessions.usage --params '{"key":"agent:makaron:feishu:direct:ou_…"}'
// (the second with a one-day range). The Gateway answered after 29.8 s and 65.9 s; its event loop
// was blocked for most of that (liveness overdue 13.7 s and 41.1 s, Feishu ingress catch-up
// timeouts, DingTalk reconnect), heap 6.5 GiB, RSS 7.7 -> 9.9 GiB. usage-offload-v1 was live:
// - `openclaw gateway call` connects with operator.read only (callGatewayCli least privilege), and
//   usage-offload-v1 runs a whole usage RPC in the worker only for operator.admin, so this handler
//   ran on the Gateway thread.
// - selectUsageSessions loads the agent's whole session store with the full projection, even for
//   one session's usage. makaron on V: 25,866 rows, 2.4 GB of entry JSON, of which skillsSnapshot
//   (avg 62 KB) and systemPromptReport (avg 34 KB) are 98%; the list projection is 37 MB.
//
// usage-session-select-v1:
// - one session's usage (key, instance grouping) reads only the rows its key or session id can
//   match (loadCombinedSessionStoreForGatewayCore match, full projection);
// - lists read the list projection, then loadUsageContextWeights reads back exactly the
//   systemPromptReport of the rows the reply includes (limit) for hasContextWeight/contextWeight;
// - without a Gateway operator role (V has none) a read-scoped caller has no visibility filter
//   and gets the admin reply, so it runs in the usage worker too. Callers under a role stay
//   in-process.
//
// Source: openclaw-versa versa/port-usage-session-select-20261120 @ 13747d7e018 (on 45b1333d152,
// usage-offload-v1): src/gateway/server-methods/usage{,-offload,-session-selection}.ts; tests
// usage-offload.test.ts, usage.sessions-usage.test.ts.

export const MARKER = 'usage-session-select-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const HELPERS = `// ${MARKER}: a report never reads a row's prompt or skills snapshot (98% of entry JSON on V).
function resolveSpecificUsageSessionMatch(config, agentId, specificKey) {
	const scopedSpecificKey = resolveStoredSessionKeyForAgentStore({
		cfg: config,
		agentId,
		sessionKey: specificKey
	});
	const keyRest = parseAgentSessionKey(scopedSpecificKey)?.rest ?? specificKey;
	return {
		sessionKeys: [scopedSpecificKey, specificKey],
		sessionIds: [keyRest, specificKey]
	};
}
/** Lists read entries without their prompt snapshot; read it back for the rows a reply includes. */
function loadUsageContextWeights(params) {
	const byAgent = /* @__PURE__ */ new Map();
	for (const entry of params.entries.slice(0, Math.max(0, params.limit))) {
		if (!entry.storeEntry || entry.storeEntry.systemPromptReport) continue;
		const selected = byAgent.get(entry.agentId) ?? [];
		selected.push(entry);
		byAgent.set(entry.agentId, selected);
	}
	for (const [agentId, selected] of byAgent) {
		const { store } = loadCombinedSessionStoreForGatewayCore(params.config, {
			agentId,
			match: { sessionKeys: selected.map((entry) => entry.key) }
		});
		for (const entry of selected) {
			const systemPromptReport = store[entry.key]?.systemPromptReport;
			if (systemPromptReport && entry.storeEntry) entry.storeEntry = {
				...entry.storeEntry,
				systemPromptReport
			};
		}
	}
}
async function selectUsageSessions(params) {`;

const STORE_LOAD = `	const { store, agentIdBySessionKey } = loadCombinedSessionStoreForGatewayCore(config, {
		...effectiveAgentId ? { agentId: effectiveAgentId } : {},
		...specificKey && groupingMode !== "family" ? { match: resolveSpecificUsageSessionMatch(config, expectDefined(effectiveAgentId, "specific session owner"), specificKey) } : { projection: "list" }
	});`;

export function patchUsage(source) {
  assert(!source.includes(MARKER), `${MARKER} already applied`);
  assert(source.includes('usage-offload-v1'), 'usage-session-select-v1 builds on usage-offload-v1');
  let out = replaceExactlyOnce(source, 'async function selectUsageSessions(params) {', HELPERS, 'selectUsageSessions');
  out = replaceExactlyOnce(out,
    '\tconst { store, agentIdBySessionKey } = loadCombinedSessionStoreForGatewayCore(config, effectiveAgentId ? { agentId: effectiveAgentId } : {});',
    STORE_LOAD, 'session store load');
  out = replaceExactlyOnce(out,
    '\t\t\t\t\t\tvisibilityFilter\n\t\t\t\t\t});\n',
    '\t\t\t\t\t\tvisibilityFilter\n\t\t\t\t\t});\n\t\t\t\t\tloadUsageContextWeights({\n\t\t\t\t\t\tconfig,\n\t\t\t\t\t\tentries: mergedEntries,\n\t\t\t\t\t\tlimit\n\t\t\t\t\t});\n',
    'sessions.usage selection');
  out = replaceExactlyOnce(out,
    '\treturn isGatewayAdmin(client) && operatorSessionCap(client, config) !== "none";',
    `\t// ${MARKER}: without a Gateway operator role a read-scoped caller (\`openclaw gateway call\`
\t// asks for operator.read only) has no visibility filter and gets the admin reply.
\tconst sessionCap = operatorSessionCap(client, config);
\treturn isGatewayAdmin(client) ? sessionCap !== "none" : sessionCap === void 0;`,
    'worker eligibility');
  return out;
}

export const FILES = [
  {
    name: 'usage-C3nh9kcO.js',
    base: 'core/dist',
    target: 'openclaw/dist',
    // V since startup-stall-usage-20261114 (usage-offload-v1).
    before: '44c5f048ed5bae4ed417a19a8d42962e6090bdfbc349b02b4fa37b73415c2e94',
    patch: patchUsage,
  },
];
