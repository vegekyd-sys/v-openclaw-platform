import assert from 'node:assert/strict';

// Paired macOS nodes stay in the skills prompt's remote note while they reconnect (V 2026-11-11).
//
// The note listed only the live macOS exec connections, in connection order ("Remote macOS node
// available (Tianyi Air Headless, Tianyi Mac, MacBook Air (4))"). The Tianyi Mac node runs on a laptop
// behind an ssh tunnel; every sleep or Power Nap drops it and a reconnect re-inserts it last, so the
// note changed 47 times in 36 hours and each change re-delivered the 75k-character workspace context to
// every active /vds thread (84 of 229 in-thread re-deliveries were node-only; 57 a pure reorder).
// remote-node-stable-eligibility-v1 advertises the paired macOS exec nodes seen within seven days,
// sorted by label, and keeps an offline node's last probe result.
// OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY=0 restores live-connection eligibility.
//
// Source: openclaw-versa versa/port-remote-node-stable-20261111 @ 8f8b5ed3525
// (src/skills/runtime/remote-stable-eligibility.ts; tests remote-stable-eligibility.test.ts).

export const MARKER = 'remote-node-stable-eligibility-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const STABLE_MODULE = `
// ${MARKER}: paired macOS exec nodes stay advertised while they reconnect (sleep/wake), sorted by
// label; an offline node keeps its last probe result. OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY=0
// restores live-connection eligibility.
const STABLE_REMOTE_NODE_RETENTION_MS = 6048e5;
const knownMacExecNodes = /* @__PURE__ */ new Map();
function stableRemoteNodeEligibilityEnabled() {
	return process.env.OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY !== "0";
}
function rememberMacExecNode(node, authoritativeBins) {
	if (!node?.pairingGeneration || !isMacPlatform(node.platform, node.deviceFamily) || !supportsSystemRun(node.commands)) return;
	const previous = knownMacExecNodes.get(node.nodeId);
	knownMacExecNodes.set(node.nodeId, {
		label: node.displayName ?? node.nodeId,
		bins: authoritativeBins || !previous ? new Set(node.bins) : previous.bins,
		lastSeenMs: Date.now()
	});
}
function markMacExecNodeSeen(nodeId) {
	const known = knownMacExecNodes.get(nodeId);
	if (known) known.lastSeenMs = Date.now();
}
function stableRemoteSkillEligibility(liveMacNodes, options) {
	const live = new Map(liveMacNodes.map((node) => [node.nodeId, node]));
	const cutoff = Date.now() - STABLE_REMOTE_NODE_RETENTION_MS;
	const nodes = [...knownMacExecNodes.entries()].filter(([nodeId, known]) => live.has(nodeId) || known.lastSeenMs >= cutoff);
	for (const node of liveMacNodes) if (!knownMacExecNodes.has(node.nodeId)) nodes.push([node.nodeId, {
		label: node.displayName ?? node.nodeId,
		bins: node.bins,
		lastSeenMs: Date.now()
	}]);
	if (nodes.length === 0) return;
	const bins = /* @__PURE__ */ new Set();
	for (const [nodeId, known] of nodes) for (const bin of live.get(nodeId)?.bins ?? known.bins) bins.add(bin);
	const labels = [...new Set(nodes.map(([, known]) => known.label).filter(Boolean))].toSorted((left, right) => left.localeCompare(right, "en"));
	const note = options?.advertiseExecNode === false ? void 0 : \`Paired macOS nodes: \${labels.join(", ")}. Run macOS-only skills via exec host=node on one of them; a node that is asleep or offline fails the call.\`;
	return {
		platforms: ["darwin"],
		hasBin: (bin) => bins.has(bin),
		hasAnyBin: (required) => required.some((bin) => bins.has(bin)),
		...note ? { note } : {}
	};
}
`;

// core/dist/remote-CiV-Qx_e.js
export function patchRemote(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `const REMOTE_BIN_PROBE_FAILURE_MAX_BACKOFF_MS = 3e5;\n`,
    `const REMOTE_BIN_PROBE_FAILURE_MAX_BACKOFF_MS = 3e5;${STABLE_MODULE}`,
    'probe backoff constant');
  out = replaceExactlyOnce(out,
    `		connected: record.connected ?? existing?.connected ?? false
	});
}
function clearRemoteNodeBins(nodeId) {`,
    `		connected: record.connected ?? existing?.connected ?? false
	});
	rememberMacExecNode(remoteNodes.get(record.nodeId), record.bins !== void 0);
}
function clearRemoteNodeBins(nodeId) {`,
    'upsertNode tail');
  out = replaceExactlyOnce(out,
    `function removeRemoteNodeInfo(nodeId) {
	const existing = remoteNodes.get(nodeId);
	remoteNodes.delete(nodeId);`,
    `function removeRemoteNodeInfo(nodeId) {
	const existing = remoteNodes.get(nodeId);
	markMacExecNodeSeen(nodeId);
	remoteNodes.delete(nodeId);`,
    'removeRemoteNodeInfo head');
  out = replaceExactlyOnce(out,
    `supportsSystemRun(node.commands));
	if (macNodes.length === 0) return;
	const bins = /* @__PURE__ */ new Set();`,
    `supportsSystemRun(node.commands));
	if (stableRemoteNodeEligibilityEnabled()) return stableRemoteSkillEligibility(macNodes, options);
	if (macNodes.length === 0) return;
	const bins = /* @__PURE__ */ new Set();`,
    'getRemoteSkillEligibility live branch');
  return out;
}

export const FILES = [
  { name: 'remote-CiV-Qx_e.js', base: 'core/dist', target: 'openclaw/dist', before: '86731e90ab432a05e0549c112430e0675a60dc32592ecef2a8a3b2956e5bd10d', patch: patchRemote },
];
