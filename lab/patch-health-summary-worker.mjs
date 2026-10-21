import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// health-summary-worker (V Gateway 02:07 51 s / 03:03 30 s stalls on 2026-10-21, see
// lab/health-summary-worker.md): the health snapshot's per-agent session summary
// (readSessionStoreSummaryReadOnly) runs in a persistent worker thread instead of the Gateway main thread.
// Same function, same scope and options, same per-store order; the main thread waits on a promise.
// OPENCLAW_V_HEALTH_SUMMARY_WORKER=0, a worker failure or a timeout falls back to the main-thread read.
export const MARKER = 'v-health-summary-worker-v1';
export const RELEASE_DIR = 'lab/release-files/health-summary-worker';
export const WORKER_FILE = 'v-health-session-summary-worker.mjs';

export const WORKER_SOURCE = `// ${MARKER}: runs readSessionStoreSummaryReadOnly for the health collector off the main thread.
import { parentPort } from "node:worker_threads";
const { readSessionStoreSummaryReadOnly } = await import("./session-accessor-Dj50cDcA.js");
const { isTransientSqliteError } = await import("./unhandled-rejections-FEKr3n0D.js");
parentPort.on("message", ({ id, requests }) => {
	const results = requests.map(({ scope, options }) => {
		try {
			return { summary: readSessionStoreSummaryReadOnly(scope, options) };
		} catch (error) {
			return { error: {
				transient: isTransientSqliteError(error),
				name: error?.name,
				message: error instanceof Error ? error.message : String(error),
				code: error?.code
			} };
		}
	});
	parentPort.postMessage({ id, results });
});
`;

export const FILES = {
  'collector-DyqVHdcZ.js': {
    before: '8056582c883650665335738742a720cfe00b0dcf050b5a77439c0d949e119c30',
    replacements: [
      [
        'import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";\n',
        'import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";\nimport { u as resolveSqliteTargetFromSessionStorePath } from "./store-entry-CMuTqREZ.js";\nimport { Worker } from "node:worker_threads";\n',
      ],
      [
        `async function createHealthSessionStoreReader(agentIds) {
	const { createStatusSessionStoreReader } = await import("./session-stores-Bfpcoo3w.js");
	const { readSessionStoreSummaryReadOnly } = await import("./session-accessor-Dj50cDcA.js");
	const { isTransientSqliteError } = await import("./unhandled-rejections-FEKr3n0D.js");
	return createStatusSessionStoreReader(agentIds, HEALTH_RECENT_SESSION_LIMIT, (scope, options) => {
		try {`,
        `// ${MARKER}: the summary reads every session_nodes row's entry_valid, which sits after the
// entry JSON, so it walks every row's overflow pages: ~0.1 s with a warm page cache, 9-19 s cold, every
// 60 s refresh, on the main thread (V 2026-10-21 02:07 and 03:03). A persistent worker runs the same
// readSessionStoreSummaryReadOnly for each physical store first, with the scope and options the
// synchronous reader would pass; the reader then returns those results.
const V_HEALTH_SUMMARY_WORKER_TIMEOUT_MS = 12e4;
let vHealthSummaryWorker = null;
let vHealthSummarySequence = 0;
const vHealthSummaryPending = /* @__PURE__ */ new Map();
function vHealthSummaryScopeKey(scope) {
	return JSON.stringify([scope.agentId ?? null, scope.storePath ?? null]);
}
function getVHealthSummaryWorker() {
	if (vHealthSummaryWorker) return vHealthSummaryWorker;
	const worker = new Worker(new URL("./${WORKER_FILE}", import.meta.url));
	worker.unref();
	const fail = (error) => {
		if (vHealthSummaryWorker === worker) vHealthSummaryWorker = null;
		for (const pending of vHealthSummaryPending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		vHealthSummaryPending.clear();
	};
	worker.on("message", (message) => {
		const pending = vHealthSummaryPending.get(message?.id);
		if (!pending) return;
		vHealthSummaryPending.delete(message.id);
		clearTimeout(pending.timer);
		pending.resolve(message.results);
	});
	worker.on("error", fail);
	worker.on("exit", (code) => fail(new Error(\`health summary worker exited with code \${code}\`)));
	vHealthSummaryWorker = worker;
	return worker;
}
function readHealthSummariesInWorker(requests) {
	const worker = getVHealthSummaryWorker();
	const id = ++vHealthSummarySequence;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			vHealthSummaryPending.delete(id);
			reject(new Error("health summary worker timed out"));
		}, V_HEALTH_SUMMARY_WORKER_TIMEOUT_MS);
		timer.unref?.();
		vHealthSummaryPending.set(id, {
			resolve,
			reject,
			timer
		});
		worker.postMessage({
			id,
			requests
		});
	});
}
async function prefetchHealthSessionSummaries(agentIds, targets) {
	if (targets.length === 0 || process.env.OPENCLAW_V_HEALTH_SUMMARY_WORKER === "0") return null;
	const seenPaths = /* @__PURE__ */ new Set();
	const requests = [];
	for (const target of targets) {
		const path = resolveSqliteTargetFromSessionStorePath(target.storePath, { agentId: target.agentId }).path;
		if (seenPaths.has(path)) continue;
		seenPaths.add(path);
		requests.push({
			scope: {
				...target.agentId ? { agentId: target.agentId } : {},
				storePath: target.storePath
			},
			options: {
				agentIds,
				recentLimit: HEALTH_RECENT_SESSION_LIMIT
			}
		});
	}
	try {
		const results = await readHealthSummariesInWorker(requests);
		return new Map(requests.map((request, index) => [vHealthSummaryScopeKey(request.scope), results[index]]));
	} catch (error) {
		healthLog.warn(\`health session summary worker unavailable, reading on the main thread: \${formatErrorMessage(error)}\`);
		return null;
	}
}
async function createHealthSessionStoreReader(agentIds, targets = []) {
	const { createStatusSessionStoreReader } = await import("./session-stores-Bfpcoo3w.js");
	const { readSessionStoreSummaryReadOnly } = await import("./session-accessor-Dj50cDcA.js");
	const { isTransientSqliteError } = await import("./unhandled-rejections-FEKr3n0D.js");
	const prefetched = await prefetchHealthSessionSummaries(agentIds, targets);
	return createStatusSessionStoreReader(agentIds, HEALTH_RECENT_SESSION_LIMIT, (scope, options) => {
		const result = prefetched?.get(vHealthSummaryScopeKey(scope));
		if (result?.summary) return result.summary;
		if (result?.error) {
			if (!result.error.transient) throw Object.assign(new Error(result.error.message), {
				name: result.error.name ?? "Error",
				...result.error.code !== void 0 ? { code: result.error.code } : {}
			});
			return {
				count: 0,
				recent: [],
				byAgent: /* @__PURE__ */ new Map()
			};
		}
		try {`,
      ],
      [
        `	const store = (await createHealthSessionStoreReader(agentId ? [agentId] : [])).read(storePath, agentId);`,
        `	const store = (await createHealthSessionStoreReader(agentId ? [agentId] : [], [{
		agentId,
		storePath
	}])).read(storePath, agentId);`,
      ],
      [
        `	const reader = await createHealthSessionStoreReader(ordered.map((entry) => entry.id));`,
        `	const reader = await createHealthSessionStoreReader(ordered.map((entry) => entry.id), ordered.map((entry) => ({
		agentId: entry.id,
		storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId: entry.id })
	})));`,
      ],
    ],
  },
};

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function patchFile(name, source) {
  const spec = FILES[name];
  assert(spec, `unknown file ${name}`);
  assert(!source.includes(MARKER), `${name} already patched`);
  assert.equal(sha256(source), spec.before, `${name} is not V's bytes`);
  let output = source;
  for (const [from, to] of spec.replacements) {
    assert.equal(output.split(from).length, 2, `${name}: anchor must occur once: ${from.slice(0, 80)}`);
    output = output.replace(from, () => to);
  }
  return output;
}

export function unpatchFile(name, release) {
  const spec = FILES[name];
  let output = release;
  for (const [from, to] of [...spec.replacements].reverse()) {
    assert.equal(output.split(to).length, 2, `${name}: patched text must occur once: ${to.slice(0, 80)}`);
    output = output.replace(to, () => from);
  }
  return output;
}
