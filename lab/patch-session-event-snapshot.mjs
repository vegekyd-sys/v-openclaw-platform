import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Session snapshots in the agent event broadcast. See lab/session-event-snapshot.md.
//
// Two layers over V's bytes:
//   probeFile(): candidate-only instrumentation. Times every buildSessionEventSnapshot call by call site,
//     every lifecycle snapshot load, every handleEvent call and every transcript-broadcast row, into
//     $OPENCLAW_V_SNAPSHOT_PROBE_FILE (JSON lines). With OPENCLAW_V_SNAPSHOT_PROBE_SHADOW=1 every snapshot
//     served from the patch's cache is also rebuilt uncached at the same moment and compared. Never shipped.
//   patchFile(): the change itself (see PATCH below).

export const MARKER = "session-event-snapshot-coalesce";
export const PROBE_MARKER = "session-event-snapshot-probe";
export const RELEASE_DIR = "lab/release-files/session-event-snapshot-coalesce";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const FILES = {
  "server-chat-Mh_L0_2e.js": {
    target: "openclaw/dist/server-chat-Mh_L0_2e.js",
    before: "9c2f1bb1fd63684edfc89c1314fb668c5e4363b98e269507b9caf81ec052faed",
  },
  "server-session-events-B8swmjJ9.js": {
    target: "openclaw/dist/server-session-events-B8swmjJ9.js",
    before: "008c6ec6aee78a7dbb05def3ccd5e02a4b1dc22171b7c32feb65928c61db2152",
  },
};

function replaceOnce(name, source, from, to) {
  assert.equal(source.split(from).length, 2, `${name}: anchor must occur once: ${from.slice(0, 100)}`);
  return source.replace(from, () => to);
}

// ---------------------------------------------------------------------------------------------------
// The change.
//
// buildSessionEventSnapshot loads the whole session row (entry, store children, subagent run index,
// row projection) for each call. One tool event calls it up to four times for the same session (the
// tool-event client, session.tool subscribers, the hidden-session mirror, nodes); between those calls the
// handler only sends frames, so the row cannot change. Calls without an event and without lifecycle
// projection now share one row per handled event. Lifecycle calls (event, active run state,
// lifecycle projection) are never shared. OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE=0 restores one load
// per call.
// ---------------------------------------------------------------------------------------------------
export const PATCH = {
  "server-chat-Mh_L0_2e.js": [
    [
      "\tconst buildSessionEventSnapshot = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {\n\t\tconst { lifecycleRunId, row } = loadGatewaySessionLifecycleSnapshotForEvent(sessionKey, agentId ? { agentId } : void 0);\n",
      `\t// ${MARKER}: one row per handled event for calls without an event or lifecycle projection.
\tlet coalescedEventSnapshots = null;
\tconst buildSessionEventSnapshot = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {
\t\tif (evt !== void 0 || includeActiveRunState || lifecycleProjection || coalescedEventSnapshots === null || process.env.OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE === "0") return buildSessionEventSnapshotUncached(sessionKey, evt, agentId, includeActiveRunState, lifecycleProjection);
\t\tconst cacheKey = \`\${agentId ?? ""}\\u0000\${sessionKey}\`;
\t\tlet snapshot = coalescedEventSnapshots.get(cacheKey);
\t\tif (snapshot === void 0) {
\t\t\tsnapshot = buildSessionEventSnapshotUncached(sessionKey, void 0, agentId);
\t\t\tcoalescedEventSnapshots.set(cacheKey, snapshot);
\t\t}
\t\treturn copySessionEventSnapshot(snapshot);
\t};
\tconst buildSessionEventSnapshotUncached = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {
\t\tconst { lifecycleRunId, row } = loadGatewaySessionLifecycleSnapshotForEvent(sessionKey, agentId ? { agentId } : void 0);
`,
    ],
    [
      "\tconst handleEvent = (event) => {\n\t\tconst evt = event;\n",
      `\tconst handleEvent = (event) => {
\t\tconst outerEventSnapshots = coalescedEventSnapshots;
\t\tcoalescedEventSnapshots = /* @__PURE__ */ new Map();
\t\ttry {
\t\t\treturn handleEventCoalesced(event);
\t\t} finally {
\t\t\tcoalescedEventSnapshots = outerEventSnapshots;
\t\t}
\t};
\tconst handleEventCoalesced = (event) => {
\t\tconst evt = event;
`,
    ],
    [
      "function createAgentEventHandler({",
      `// ${MARKER}: each frame gets its own top-level and session objects, as when every call loaded its own row.
function copySessionEventSnapshot(snapshot) {
\treturn snapshot.session ? {
\t\t...snapshot,
\t\tsession: { ...snapshot.session }
\t} : { ...snapshot };
}
function createAgentEventHandler({`,
    ],
  ],
};

export function patchFile(name, source) {
  assert(PATCH[name], `no change for ${name}`);
  assert(!source.includes(MARKER), `${name} already patched`);
  assert.equal(sha256(source), FILES[name].before, `${name} is not V's bytes`);
  let output = source;
  for (const [from, to] of PATCH[name]) output = replaceOnce(name, output, from, to);
  return output;
}

export function unpatchFile(name, release) {
  let output = release;
  for (const [from, to] of [...PATCH[name]].reverse()) output = replaceOnce(name, output, to, from);
  return output;
}

// ---------------------------------------------------------------------------------------------------
// Candidate instrumentation (works on V's bytes and on the patched bytes).
// ---------------------------------------------------------------------------------------------------
const PROBE_RUNTIME = `//#region ${PROBE_MARKER} (candidate instrumentation, never shipped)
const __vSnapProbe = globalThis.__vSnapProbe ??= (() => {
	const file = process.env.OPENCLAW_V_SNAPSHOT_PROBE_FILE;
	const probe = { file, buf: [], site: null, depth: 0, shadowing: 0, shadow: process.env.OPENCLAW_V_SNAPSHOT_PROBE_SHADOW === "1", bench: null };
	if (!file) return probe;
	const fs = process.getBuiltinModule("node:fs");
	const crypto = process.getBuiltinModule("node:crypto");
	probe.hash = (text) => crypto.createHash("sha1").update(text).digest("base64").slice(0, 12);
	const flush = () => {
		if (probe.buf.length === 0) return;
		try { fs.appendFileSync(file, probe.buf.splice(0).map((r) => JSON.stringify(r)).join("\\n") + "\\n"); } catch {}
	};
	setInterval(() => {
		flush();
		// shadow can also be switched for a stretch of the run by creating or removing <file>.shadow
		probe.shadow = process.env.OPENCLAW_V_SNAPSHOT_PROBE_SHADOW === "1" || fs.existsSync(file + ".shadow");
		if (!probe.bench) return;
		let request;
		try { request = JSON.parse(fs.readFileSync(file + ".bench-request", "utf8")); fs.rmSync(file + ".bench-request"); } catch { return; }
		Promise.resolve().then(() => probe.bench(request)).then((result) => fs.writeFileSync(file + ".bench-result", JSON.stringify(result)), (error) => fs.writeFileSync(file + ".bench-result", JSON.stringify({ error: String(error?.stack ?? error) })));
	}, 1000).unref();
	process.once("exit", flush);
	return probe;
})();
const __vSnapProbeDiff = (a, b) => {
	const out = [];
	for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) out.push(key);
	return out;
};
const loadGatewaySessionLifecycleSnapshot = (sessionKey, options) => {
	if (!__vSnapProbe.file) return __vSnapProbeRawLoadGatewaySessionLifecycleSnapshot(sessionKey, options);
	const startedAt = performance.now();
	try {
		return __vSnapProbeRawLoadGatewaySessionLifecycleSnapshot(sessionKey, options);
	} finally {
		__vSnapProbe.buf.push({ t: Date.now(), s: "load", k: sessionKey, ms: +(performance.now() - startedAt).toFixed(3), in: __vSnapProbe.depth > 0 ? 1 : 0, ...__vSnapProbe.shadowing ? { sh: 1 } : {} });
	}
};
__vSnapProbe.bench = async ({ keys = [], n = 20, gapMs = 0 }) => {
	const results = [];
	for (const { key, agentId } of keys) {
		const rows = [];
		for (let i = 0; i < n; i += 1) {
			const entryAt = performance.now();
			const { entry, store } = loadGatewaySessionEntryReadOnly(key, { clone: false, includeStoreChildEntries: true, ...agentId ? { agentId } : {} });
			const entryMs = performance.now() - entryAt;
			const loadAt = performance.now();
			const { row } = __vSnapProbeRawLoadGatewaySessionLifecycleSnapshot(key, agentId ? { agentId } : void 0);
			const loadMs = performance.now() - loadAt;
			const buildAt = performance.now();
			const snapshot = buildGatewaySessionSnapshot({ sessionRow: row, agentId, includeSession: true, lifecycle: false, event: void 0, lifecycleRunId: void 0, activeRunState: void 0 });
			const buildMs = performance.now() - buildAt;
			rows.push({ entryMs: +entryMs.toFixed(3), loadMs: +loadMs.toFixed(3), buildMs: +buildMs.toFixed(3), hasEntry: Boolean(entry), storeKeys: store ? Object.keys(store).length : 0, childSessions: row?.childSessions?.length ?? 0, bytes: JSON.stringify(snapshot).length });
			if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
		}
		results.push({ key, agentId, rows });
	}
	return { at: Date.now(), results };
};
const __vSnapProbeWrapHandler = (handler) => (event) => {
	const startedAt = performance.now();
	try {
		return handler(event);
	} finally {
		__vSnapProbe.buf.push({ t: Date.now(), s: "event", st: event?.stream, ph: typeof event?.data?.phase === "string" ? event.data.phase : void 0, k: event?.sessionKey, ms: +(performance.now() - startedAt).toFixed(3) });
	}
};
//#endregion
`;

const PROBE_WRAPPER = `\t// ${PROBE_MARKER}: per call site timing and, with shadow on, a fresh rebuild of each shared row.
\tconst buildSessionEventSnapshot = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {
\t\tif (!__vSnapProbe.file) return __vSnapProbeInnerBuildSessionEventSnapshot(sessionKey, evt, agentId, includeActiveRunState, lifecycleProjection);
\t\tconst site = __vSnapProbe.site ?? "unlabelled";
\t\t__vSnapProbe.site = null;
\t\t__vSnapProbe.depth += 1;
\t\tconst startedAt = performance.now();
\t\tlet out;
\t\ttry {
\t\t\tout = __vSnapProbeInnerBuildSessionEventSnapshot(sessionKey, evt, agentId, includeActiveRunState, lifecycleProjection);
\t\t} finally {
\t\t\t__vSnapProbe.depth -= 1;
\t\t}
\t\tconst ms = performance.now() - startedAt;
\t\tconst json = JSON.stringify(out);
\t\tconst record = { t: Date.now(), s: site, k: sessionKey, ms: +ms.toFixed(3), h: __vSnapProbe.hash(json), len: json.length };
\t\tif (__vSnapProbe.shadow && evt === void 0 && !includeActiveRunState && !lifecycleProjection && typeof buildSessionEventSnapshotUncached === "function") {
\t\t\t__vSnapProbe.shadowing += 1;
\t\t\tlet fresh;
\t\t\ttry { fresh = buildSessionEventSnapshotUncached(sessionKey, evt, agentId); } finally { __vSnapProbe.shadowing -= 1; }
\t\t\trecord.sh = 1;
\t\t\tconst freshJson = JSON.stringify(fresh);
\t\t\tif (freshJson !== json) record.diff = __vSnapProbeDiff(fresh, out).concat(__vSnapProbeDiff(fresh.session, out.session).map((key) => \`session.\${key}\`));
\t\t\tif (fresh.session !== void 0 && fresh.session === out.session) record.sharedObject = 1;
\t\t}
\t\t__vSnapProbe.buf.push(record);
\t\treturn out;
\t};
`;

// call sites in file order
const PLAIN_SITES = ["tool.agent", "tool.hidden", "tool.sessionTool", "item.hidden", "tool.node"];
const PLAIN_CALL = "buildSessionEventSnapshot(sessionKey, void 0, sessionAgentId)";

export function probeFile(name, source) {
  assert(!source.includes(PROBE_MARKER), `${name} already probed`);
  let output = source;
  if (name === "server-chat-Mh_L0_2e.js") {
    output = replaceOnce(name, output,
      'import { a as loadGatewaySessionLifecycleSnapshot } from "./session-utils-list-BUP03AzS.js";\n',
      'import { a as __vSnapProbeRawLoadGatewaySessionLifecycleSnapshot } from "./session-utils-list-BUP03AzS.js";\n');
    output = replaceOnce(name, output, 'import { performance } from "node:perf_hooks";\n', `import { performance } from "node:perf_hooks";\n${PROBE_RUNTIME}`);
    output = replaceOnce(name, output,
      "\tconst buildSessionEventSnapshot = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {\n",
      "\tconst __vSnapProbeInnerBuildSessionEventSnapshot = (sessionKey, evt, agentId, includeActiveRunState = false, lifecycleProjection = false) => {\n");
    output = replaceOnce(name, output, "\tconst resolveSessionDeliveryKeys = (sessionKey, agentId) => {\n", `${PROBE_WRAPPER}\tconst resolveSessionDeliveryKeys = (sessionKey, agentId) => {\n`);
    const parts = output.split(PLAIN_CALL);
    assert.equal(parts.length, PLAIN_SITES.length + 1, `${name}: expected ${PLAIN_SITES.length} plain snapshot calls`);
    output = parts.reduce((acc, part, i) => (i === 0 ? part : `${acc}(__vSnapProbe.site = "${PLAIN_SITES[i - 1]}", ${PLAIN_CALL})${part}`), "");
    output = replaceOnce(name, output, "buildSessionEventSnapshot(sessionKey, snapshotEvent, sessionAgentId, true, true)", '(__vSnapProbe.site = "lifecycle.end", buildSessionEventSnapshot(sessionKey, snapshotEvent, sessionAgentId, true, true))');
    output = replaceOnce(name, output, "buildSessionEventSnapshot(sessionKey, evt, sessionAgentId, true, true)", '(__vSnapProbe.site = "lifecycle.start", buildSessionEventSnapshot(sessionKey, evt, sessionAgentId, true, true))');
    output = replaceOnce(name, output, "\treturn Object.assign(handleEvent, { dispose: () => {", "\treturn Object.assign(__vSnapProbe.file ? __vSnapProbeWrapHandler(handleEvent) : handleEvent, { dispose: () => {");
  } else if (name === "server-session-events-B8swmjJ9.js") {
    output = replaceOnce(name, output,
      'import { o as loadGatewaySessionRow } from "./session-utils-list-BUP03AzS.js";\n',
      'import { o as __vSnapProbeRawLoadGatewaySessionRow } from "./session-utils-list-BUP03AzS.js";\n');
    output = replaceOnce(name, output, 'import path from "node:path";\n', `import path from "node:path";
// ${PROBE_MARKER}: transcript-broadcast rows, timed into the same file
const loadGatewaySessionRow = (sessionKey, options) => {
	const probe = globalThis.__vSnapProbe;
	if (!probe?.file) return __vSnapProbeRawLoadGatewaySessionRow(sessionKey, options);
	const startedAt = performance.now();
	try {
		return __vSnapProbeRawLoadGatewaySessionRow(sessionKey, options);
	} finally {
		probe.buf.push({ t: Date.now(), s: "transcript.row", k: sessionKey, ms: +(performance.now() - startedAt).toFixed(3) });
	}
};
`);
  } else throw new Error(`no probe for ${name}`);
  return output;
}
