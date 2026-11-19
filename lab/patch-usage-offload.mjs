import assert from 'node:assert/strict';

// Usage reports run off the Gateway thread and are bounded to their date range (V 2026-11-12).
//
// One `openclaw gateway call usage.cost --params {"agentId":"makaron","days":1}` blocked V's
// Gateway event loop for 487 s (22:00:22-22:08:34 CST) and pushed its heap to 8.4 GiB; every
// channel stopped answering and the stall ended in the DingTalk 400 crash. The report asked for one
// day but, on the main thread, read transcript statistics for all 25k makaron sessions
// (SUM(OCTET_LENGTH(event_json)) per session on a 39 GB database), parsed all 6,214 stored rollups
// (457 MB of JSON), and queued a refresh that loads whole transcripts synchronously.
//
// usage-offload-v1:
// - usage.cost, sessions.usage (+ timeseries, logs) and /usage cost call their readers through
//   usage-offload-v1.js, which forwards them to one child process (usage-offload-child-v1.js) with
//   its own heap limit (OPENCLAW_USAGE_OFFLOAD_HEAP_MB, 4096) and nice 19 / ionice idle. The worker
//   exits a minute after its last call once its refresh queue drains, and when the Gateway's IPC
//   channel closes. OPENCLAW_USAGE_OFFLOAD=0 runs the readers in-process again.
// - A report lists and reads only transcripts changed since its start; its refresh scans only those
//   and does not prune. OPENCLAW_USAGE_COST_WINDOW=0 restores whole-agent work.
// - A refresh run stops after 1 GiB / 5 min of transcripts (OPENCLAW_USAGE_REFRESH_MAX_BYTES,
//   OPENCLAW_USAGE_REFRESH_MAX_MS; 0 = unbounded) and yields between transcripts.
//
// - usage.cost, sessions.usage, sessions.usage.timeseries and sessions.usage.logs run as whole
//   handlers in the worker for administrators without a session-visibility filter (timeseries and
//   logs for every caller); only the reply crosses back. Bounded reports and refreshes read stored
//   rollups 500 rows at a time.
//
// Source: openclaw-versa versa/port-usage-offload-20261113 @ 45b1333d152 (on d25de0a30ff)
// (src/infra/session-cost-usage-{offload,offload-child,bounds,aggregation,cache-runtime,
// projection}.ts, src/gateway/server-methods/usage{,-offload}.ts; tests
// session-cost-usage-offload.test.ts, session-cost-usage.test.ts, usage-offload.test.ts).

export const MARKER = 'usage-offload-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const BOUNDS = `
// ${MARKER}: reports read only transcripts changed inside their range; refresh runs stop at a byte
// and time budget. OPENCLAW_USAGE_COST_WINDOW=0 / OPENCLAW_USAGE_REFRESH_MAX_*=0 lift the bounds.
const USAGE_REFRESH_DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;
const USAGE_REFRESH_DEFAULT_MAX_MS = 3e5;
function isUsageCostWindowEnabled() {
	return process.env.OPENCLAW_USAGE_COST_WINDOW !== "0";
}
function readUsageRefreshBudget(name, fallback) {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0) return fallback;
	return value === 0 ? void 0 : Math.floor(value);
}
function resolveUsageRefreshBudget() {
	return {
		maxBytes: readUsageRefreshBudget("OPENCLAW_USAGE_REFRESH_MAX_BYTES", USAGE_REFRESH_DEFAULT_MAX_BYTES),
		maxMs: readUsageRefreshBudget("OPENCLAW_USAGE_REFRESH_MAX_MS", USAGE_REFRESH_DEFAULT_MAX_MS)
	};
}
function isUsageRefreshBudgetSpent(params) {
	if (params.scannedFiles === 0) return false;
	const { maxBytes, maxMs } = params.budget;
	if (maxBytes !== void 0 && params.scannedBytes >= maxBytes) return true;
	return maxMs !== void 0 && (params.now ?? performance.now()) - params.startedAt >= maxMs;
}
`;

function replaceBetween(source, begin, end, replacement, label) {
  assert.equal(source.split(begin).length, 2, `Expected exactly one start of ${label}`);
  const from = source.indexOf(begin);
  const to = source.indexOf(end, from);
  assert(to > from, `Expected the end of ${label}`);
  return source.slice(0, from) + replacement + source.slice(to);
}

const REFRESH = `async function refreshCostUsageCacheForAgent(params) {
	const databasePath = params.databasePath ?? resolveUsageCostCacheDatabasePath(params.agentId);
	const lock = acquireSessionCostUsageRefreshLock(params.agentId, databasePath);
	if (!lock.acquired) return "busy";
	try {
		const agentDir = params.agentDir ?? resolveUsageCostAgentDir(params.config, params.agentId);
		const pricingFingerprint = resolveUsageCostPricingFingerprint(params.config, agentDir);
		const bounded = isUsageCostWindowEnabled() && ((params.sessionFiles?.length ?? 0) > 0 || params.startMs !== void 0);
		const requestedFiles = [];
		for (const requested of params.sessionFiles ?? []) {
			const resolved = await resolveUsageCostTranscriptFile(requested);
			if (resolved) requestedFiles.push(resolved);
		}
		const discoveredFiles = bounded && requestedFiles.length > 0 ? [] : await listUsageCountedTranscriptStats(params.agentId, {
			...params.sessionsDir ? { sessionsDir: params.sessionsDir } : {},
			...bounded && params.startMs !== void 0 ? { minMtimeMs: params.startMs } : {}
		});
		const filesByPath = new Map(discoveredFiles.map((file) => [file.filePath, file]));
		for (const file of requestedFiles) filesByPath.set(file.filePath, file);
		const files = [...filesByPath.values()];
		const requestedPaths = /* @__PURE__ */ new Set();
		for (const file of requestedFiles) requestedPaths.add(file.filePath);
		const refreshFiles = requestedPaths.size > 0 ? files.filter((file) => requestedPaths.has(file.filePath)) : params.startMs === void 0 ? files : files.filter((file) => file.mtimeMs >= params.startMs);
		const maxFiles = params.maxFiles !== void 0 && Number.isFinite(params.maxFiles) && params.maxFiles > 0 ? Math.floor(params.maxFiles) : void 0;
		let staleCandidates;
		let readPrevious;
		if (bounded) {
			staleCandidates = [];
			for (let index = 0; index < refreshFiles.length; index += USAGE_COST_ROLLUP_READ_CHUNK) {
				const chunk = refreshFiles.slice(index, index + USAGE_COST_ROLLUP_READ_CHUNK);
				const chunkRollups = readUsageCostRollups(params.agentId, pricingFingerprint, databasePath, { filePaths: chunk.map((file) => file.filePath) });
				staleCandidates.push(...getUsageCostStaleRollupFiles({
					rollups: chunkRollups,
					files: chunk
				}));
			}
			readPrevious = (file) => {
				const [row] = readSessionCostUsageRollupRows(params.agentId, databasePath, [file.filePath]);
				return {
					stored: row ? readUsageCostRollups(params.agentId, pricingFingerprint, databasePath, { rows: [row] }).get(file.filePath) : void 0,
					valueJson: row?.valueJson ?? null
				};
			};
		} else {
			const rows = readSessionCostUsageRollupRows(params.agentId, databasePath);
			const rawValues = new Map(rows.map((row) => [row.key, row.valueJson]));
			const rollups = readUsageCostRollups(params.agentId, pricingFingerprint, databasePath, { rows });
			deleteSessionCostUsageRollupsExcept({
				agentId: params.agentId,
				databasePath,
				liveKeys: new Set(files.map((file) => file.filePath)),
				rows
			});
			staleCandidates = getUsageCostStaleRollupFiles({
				rollups,
				files: refreshFiles
			});
			readPrevious = (file) => ({
				stored: rollups.get(file.filePath),
				valueJson: rawValues.get(file.filePath) ?? null
			});
		}
		const staleFiles = staleCandidates.toSorted((a, b) => a.size - b.size || a.filePath.localeCompare(b.filePath)).slice(0, maxFiles);
		const resolveCost = createUsageCostResolver({
			config: params.config,
			agentDir
		});
		const budget = resolveUsageRefreshBudget();
		const startedAt = performance.now();
		let scannedFiles = 0;
		let scannedBytes = 0;
		for (const file of staleFiles) {
			if (isUsageRefreshBudgetSpent({
				budget,
				scannedFiles,
				scannedBytes,
				startedAt
			})) break;
			if (scannedFiles > 0) await new Promise((resolve) => setImmediate(resolve));
			scannedFiles += 1;
			scannedBytes += file.size;
			const previous = readPrevious(file);
			const entry = await scanUsageFileForRollup({
				file,
				previous: previous.stored,
				pricingFingerprint,
				resolveCost
			});
			const valueJson = JSON.stringify(entry);
			if (!writeSessionCostUsageRollup({
				agentId: params.agentId,
				databasePath,
				rollupId: file.filePath,
				previousValueJson: previous.valueJson,
				valueJson,
				updatedAt: entry.scannedAt
			})) throw new Error(\`usage rollup changed while refreshing: \${file.filePath}\`);
		}
		return "refreshed";
	} finally {
		lock.release();
	}
}
`;

const PROJECTION = `function createCostUsageSummaryAccumulator(dayBucket) {
	return {
		daily: /* @__PURE__ */ new Map(),
		totals: createEmptyCostUsageTotals(),
		formatDay: createUsageDayKeyFormatter(dayBucket),
		cachedFiles: 0,
		staleFiles: 0
	};
}
function addRollupsToCostUsageSummary(acc, params) {
	acc.staleFiles += getUsageCostStaleRollupFiles(params).length;
	acc.cachedFiles += countUsableUsageCostRollups(params);
	for (const file of params.files) {
		const stored = params.rollups.get(file.filePath);
		if (!canUseUsageCostRollupForPartial({
			stored,
			file
		}) || !stored) continue;
		addRollupToCostUsageSummary({
			rollup: stored.entry.rollup,
			startMs: params.startMs,
			endMs: params.endMs,
			formatDay: acc.formatDay,
			daily: acc.daily,
			totals: acc.totals
		});
	}
	const scannedAt = latestUsageCostRollupScan(params.rollups);
	if (scannedAt !== void 0) acc.refreshedAt = Math.max(acc.refreshedAt ?? 0, scannedAt);
}
function finishCostUsageSummary(acc, params) {
	fillMissingDays(acc.daily, params.startMs, params.endMs, acc.formatDay);
	const status = params.refreshing ? "refreshing" : acc.staleFiles > 0 ? acc.cachedFiles > 0 ? "partial" : "stale" : "fresh";
	return {
		updatedAt: Date.now(),
		days: countCalendarDays(params.startMs, params.endMs, acc.formatDay),
		daily: Array.from(acc.daily.entries()).map(([date, bucket]) => Object.assign({ date }, bucket)).toSorted((a, b) => a.date.localeCompare(b.date)),
		totals: acc.totals,
		cacheStatus: {
			status,
			cachedFiles: acc.cachedFiles,
			pendingFiles: acc.staleFiles,
			staleFiles: acc.staleFiles,
			refreshedAt: acc.refreshedAt
		}
	};
}
function buildCostUsageSummaryFromRollups(params) {
	const acc = createCostUsageSummaryAccumulator(params.dayBucket);
	addRollupsToCostUsageSummary(acc, params);
	return finishCostUsageSummary(acc, params);
}
`;

const LOADERS = `async function loadCostUsageSummary(params) {
	const now = Date.now();
	const defaultStart = new Date(now);
	defaultStart.setDate(defaultStart.getDate() - 29);
	const startMs = params.startMs ?? defaultStart.getTime();
	const endMs = params.endMs ?? now;
	const agentDir = resolveUsageCostAgentDir(params.config, params.agentId);
	const databasePath = resolveUsageCostCacheDatabasePath(params.agentId);
	const windowStartMs = isUsageCostWindowEnabled() ? startMs : void 0;
	const result = await refreshCostUsageCacheForAgent({
		config: params.config,
		agentId: params.agentId,
		agentDir,
		databasePath,
		...windowStartMs !== void 0 ? { startMs: windowStartMs } : {}
	});
	const pricingFingerprint = resolveUsageCostPricingFingerprint(params.config, agentDir);
	const refreshing = () => result === "busy" || usageCostRefreshes.has(databasePath) || isSessionCostUsageRefreshRunning(params.agentId, databasePath);
	if (windowStartMs !== void 0) return finishCostUsageSummary(await summarizeCostUsageWindow({
		agentId: params.agentId,
		pricingFingerprint,
		databasePath,
		windowStartMs,
		startMs,
		endMs,
		dayBucket: params.dayBucket
	}), {
		startMs,
		endMs,
		refreshing: refreshing()
	});
	return buildCostUsageSummaryFromRollups({
		rollups: readUsageCostRollups(params.agentId, pricingFingerprint, databasePath),
		files: await listUsageCountedTranscriptStats(params.agentId),
		startMs,
		endMs,
		dayBucket: params.dayBucket,
		refreshing: refreshing()
	});
}
/** ${'${MARKER}'}: totals for transcripts changed since windowStartMs, reading stored rollups a chunk at a time. */
async function summarizeCostUsageWindow(params) {
	const files = await listUsageCountedTranscriptStats(params.agentId, { minMtimeMs: params.windowStartMs });
	const acc = createCostUsageSummaryAccumulator(params.dayBucket);
	for (let index = 0; index < files.length; index += USAGE_COST_ROLLUP_READ_CHUNK) {
		const chunk = files.slice(index, index + USAGE_COST_ROLLUP_READ_CHUNK);
		addRollupsToCostUsageSummary(acc, {
			rollups: readUsageCostRollups(params.agentId, params.pricingFingerprint, params.databasePath, { filePaths: chunk.map((file) => file.filePath) }),
			files: chunk,
			startMs: params.startMs,
			endMs: params.endMs
		});
	}
	return acc;
}
async function loadCostUsageSummaryFromCache(params) {
	const agentDir = resolveUsageCostAgentDir(params.config, params.agentId);
	const databasePath = resolveUsageCostCacheDatabasePath(params.agentId);
	const pricingFingerprint = resolveUsageCostPricingFingerprint(params.config, agentDir);
	const windowStartMs = isUsageCostWindowEnabled() ? params.startMs : void 0;
	const refreshing = () => usageCostRefreshes.has(databasePath) || isSessionCostUsageRefreshRunning(params.agentId, databasePath);
	if (windowStartMs !== void 0) {
		const summarize = () => summarizeCostUsageWindow({
			agentId: params.agentId,
			pricingFingerprint,
			databasePath,
			windowStartMs,
			startMs: params.startMs,
			endMs: params.endMs,
			dayBucket: params.dayBucket
		});
		let acc = await summarize();
		if (params.requestRefresh !== false && acc.staleFiles > 0) if (params.refreshMode === "sync-when-empty" && acc.cachedFiles === 0) {
			const result = await refreshCostUsageCacheForAgent({
				config: params.config,
				agentId: params.agentId,
				agentDir,
				startMs: windowStartMs
			});
			acc = await summarize();
			if (result === "refreshed" && acc.staleFiles > 0) requestCostUsageCacheRefresh({
				config: params.config,
				agentId: params.agentId,
				startMs: windowStartMs
			});
		} else requestCostUsageCacheRefresh({
			config: params.config,
			agentId: params.agentId,
			startMs: windowStartMs
		});
		return finishCostUsageSummary(acc, {
			startMs: params.startMs,
			endMs: params.endMs,
			refreshing: refreshing()
		});
	}
	let rollups = readUsageCostRollups(params.agentId, pricingFingerprint, databasePath);
	let files = await listUsageCountedTranscriptStats(params.agentId);
	const staleFiles = getUsageCostStaleRollupFiles({
		rollups,
		files
	});
	if (params.requestRefresh !== false && staleFiles.length > 0) {
		const cachedFiles = countUsableUsageCostRollups({
			rollups,
			files
		});
		if (params.refreshMode === "sync-when-empty" && cachedFiles === 0) {
			const result = await refreshCostUsageCacheForAgent({
				config: params.config,
				agentId: params.agentId,
				agentDir,
				startMs: params.startMs
			});
			rollups = readUsageCostRollups(params.agentId, pricingFingerprint, databasePath);
			files = await listUsageCountedTranscriptStats(params.agentId);
			if (result === "refreshed" && getUsageCostStaleRollupFiles({
				rollups,
				files
			}).length > 0) requestCostUsageCacheRefresh({
				config: params.config,
				agentId: params.agentId
			});
		} else requestCostUsageCacheRefresh({
			config: params.config,
			agentId: params.agentId
		});
	}
	return buildCostUsageSummaryFromRollups({
		rollups,
		files,
		startMs: params.startMs,
		endMs: params.endMs,
		dayBucket: params.dayBucket,
		refreshing: refreshing()
	});
}
async function loadSessionCostSummariesFromCache(params) {
	const agentDir = resolveUsageCostAgentDir(params.config, params.agentId);
	const databasePath = resolveUsageCostCacheDatabasePath(params.agentId);
	const pricingFingerprint = resolveUsageCostPricingFingerprint(params.config, agentDir);
	const fileTasks = params.sessions.map((session) => async () => await resolveUsageCostTranscriptFile(session.sessionFile));
	const { results: files } = await runTasksWithConcurrency({
		tasks: fileTasks,
		limit: 32
	});
	const staleFiles = /* @__PURE__ */ new Set();
	let cachedFiles = 0;
	const hasExplicitRange = params.startMs !== void 0 || params.endMs !== void 0;
	const startMs = params.startMs ?? Number.NEGATIVE_INFINITY;
	const endMs = params.endMs ?? Number.POSITIVE_INFINITY;
	const dayFormatter = createUsageDayKeyFormatter(params.dayBucket);
	let rollups = /* @__PURE__ */ new Map();
	let refreshedAt;
	const summaries = params.sessions.map((session, index) => {
		if (index % USAGE_COST_ROLLUP_READ_CHUNK === 0) {
			rollups = readUsageCostRollups(params.agentId, pricingFingerprint, databasePath, { filePaths: files.slice(index, index + USAGE_COST_ROLLUP_READ_CHUNK).flatMap((file) => file ? [file.filePath] : []) });
			const scannedAt = latestUsageCostRollupScan(rollups);
			if (scannedAt !== void 0) refreshedAt = Math.max(refreshedAt ?? 0, scannedAt);
		}
		const file = files[index];
		const stored = file ? rollups.get(file.filePath) : void 0;
		if (!file || !stored || !isUsageCostRollupFresh({
			stored,
			file
		})) {
			staleFiles.add(file?.sourcePath ?? session.sessionFile);
			return null;
		}
		cachedFiles += 1;
		return buildSessionCostSummaryFromRollup({
			rollup: stored.entry.rollup,
			sessionId: session.sessionId,
			sessionFile: session.sessionFile,
			startMs,
			endMs,
			includeUntimestamped: params.includeUntimestamped === true || !hasExplicitRange,
			formatDay: dayFormatter
		});
	});
	const refreshRequested = params.requestRefresh !== false && staleFiles.size > 0;
	if (refreshRequested) requestCostUsageCacheRefresh({
		config: params.config,
		agentId: params.agentId,
		sessionFiles: [...staleFiles]
	});
	const refreshRunning = isSessionCostUsageRefreshRunning(params.agentId, databasePath);
	return {
		summaries,
		cacheStatus: {
			status: staleFiles.size === 0 ? "fresh" : refreshRunning || refreshRequested ? "refreshing" : cachedFiles > 0 ? "partial" : "stale",
			cachedFiles,
			pendingFiles: staleFiles.size,
			staleFiles: staleFiles.size,
			refreshedAt
		}
	};
}
`.replace('${MARKER}', MARKER);

// core/dist/session-cost-usage-C_mE_GAE.js
export function patchSessionCostUsage(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `const USAGE_COST_ROLLUP_VERSION = 3;\n`,
    `${BOUNDS}const USAGE_COST_ROLLUP_READ_CHUNK = 500;\nconst USAGE_COST_ROLLUP_VERSION = 3;\n`,
    'rollup version constant');
  out = replaceBetween(out, 'async function refreshCostUsageCacheForAgent(params) {', '//#endregion\n//#region src/infra/session-cost-usage-projection.ts', REFRESH, 'refreshCostUsageCacheForAgent');
  out = replaceBetween(out, 'function buildCostUsageSummaryFromRollups(params) {', '//#endregion\n//#region src/infra/session-cost-usage-cache-runtime.ts', PROJECTION, 'buildCostUsageSummaryFromRollups');
  out = replaceBetween(out, 'async function loadCostUsageSummary(params) {', 'function requestCostUsageCacheRefresh(params) {', LOADERS, 'cache report loaders');

  // Refresh queue: a full refresh remembers the oldest range start it serves.
  out = replaceExactlyOnce(out,
    `	if (!params.sessionFiles) {
		state.fullRefreshRequested = true;
		return;
	}`,
    `	if (!params.sessionFiles) {
		state.fullRefreshStartMs = !state.fullRefreshRequested ? params.startMs : state.fullRefreshStartMs === void 0 || params.startMs === void 0 ? void 0 : Math.min(state.fullRefreshStartMs, params.startMs);
		state.fullRefreshRequested = true;
		return;
	}`,
    'merge refresh request');
  out = replaceExactlyOnce(out,
    `			const fullRefreshRequested = state.fullRefreshRequested;
			const sessionFiles = fullRefreshRequested ? [] : [...state.pendingSessionFiles];
			if (!fullRefreshRequested) state.pendingSessionFiles.clear();
			state.fullRefreshRequested = false;
			if (await refreshCostUsageCacheForAgent({
				config: state.config,
				agentId: state.agentId,
				databasePath: state.databasePath,
				sessionsDir: state.sessionsDir,
				sessionFiles: fullRefreshRequested ? void 0 : sessionFiles
			}) === "busy") {
				if (fullRefreshRequested) state.fullRefreshRequested = true;`,
    `			const fullRefreshRequested = state.fullRefreshRequested;
			const fullRefreshStartMs = state.fullRefreshStartMs;
			const sessionFiles = fullRefreshRequested ? [] : [...state.pendingSessionFiles];
			if (!fullRefreshRequested) state.pendingSessionFiles.clear();
			state.fullRefreshRequested = false;
			state.fullRefreshStartMs = void 0;
			if (await refreshCostUsageCacheForAgent({
				config: state.config,
				agentId: state.agentId,
				databasePath: state.databasePath,
				sessionsDir: state.sessionsDir,
				sessionFiles: fullRefreshRequested ? void 0 : sessionFiles,
				...fullRefreshRequested && fullRefreshStartMs !== void 0 ? { startMs: fullRefreshStartMs } : {}
			}) === "busy") {
				if (fullRefreshRequested) mergeUsageCostRefreshRequest(state, {
					agentId: state.agentId,
					startMs: fullRefreshStartMs
				});`,
    'run queued refresh');

  out = replaceExactlyOnce(out,
    `//#endregion
//#region src/infra/session-cost-usage-reporting.ts`,
    `/** ${MARKER}: true when this process has no queued or running background usage refresh. */
function isCostUsageRefreshQueueIdle() {
	return usageCostRefreshes.size === 0;
}
//#endregion
//#region src/infra/session-cost-usage-reporting.ts`,
    'reporting region');
  out = replaceExactlyOnce(out,
    `export { loadCostUsageSummary as a, `,
    `export { isCostUsageRefreshQueueIdle, loadCostUsageSummary as a, `,
    'export list');
  return out;
}

const DIRECT = './session-cost-usage-C_mE_GAE.js';

const RPC_WRAPPER = `//#region ${MARKER}: usage RPCs run whole in the usage worker (src/gateway/server-methods/usage-offload.ts)
const USAGE_OFFLOAD_RPC_METHODS = [
	"usage.cost",
	"sessions.usage",
	"sessions.usage.timeseries",
	"sessions.usage.logs"
];
function canRunUsageRpcInWorker(method, client, config) {
	if (method === "sessions.usage.timeseries" || method === "sessions.usage.logs") return true;
	return isGatewayAdmin(client) && operatorSessionCap(client, config) !== "none";
}
function offloadUsageRpcHandlers(handlers) {
	const wrapped = { ...handlers };
	for (const method of USAGE_OFFLOAD_RPC_METHODS) {
		const inProcess = handlers[method];
		if (!inProcess) continue;
		wrapped[method] = async (opts) => {
			if (!isUsageOffloadEnabled()) return await inProcess(opts);
			const config = opts.context.getRuntimeConfig();
			if (!canRunUsageRpcInWorker(method, opts.client, config)) return await inProcess(opts);
			let reply;
			try {
				reply = await callUsageOffloadRpc(method, opts.params, config);
			} catch (error) {
				opts.respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, \`usage report failed: \${error instanceof Error ? error.message : String(error)}\`));
				return;
			}
			opts.respond(reply.ok, reply.payload, reply.error);
		};
	}
	return wrapped;
}
const usageHandlers = offloadUsageRpcHandlers(usageHandlersInProcess);
//#endregion
`;

// core/dist/usage-C3nh9kcO.js
export function patchUsageHandlers(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `import { c as mergeSessionCostSummaryInto, i as loadSessionUsageTimeSeries, l as createUsageAggregateAccumulator, o as loadCostUsageSummaryFromCache, r as loadSessionLogs, s as loadSessionCostSummariesFromCache, t as discoverAllSessions, u as resolveExistingUsageSessionFile } from "${DIRECT}";\n`,
    `import { c as mergeSessionCostSummaryInto, l as createUsageAggregateAccumulator, u as resolveExistingUsageSessionFile } from "${DIRECT}";
import { callUsageOffloadRpc, discoverAllSessions, isUsageOffloadEnabled, loadCostUsageSummaryFromCache, loadSessionCostSummariesFromCache, loadSessionLogs, loadSessionUsageTimeSeries } from "./usage-offload-v1.js"; // ${MARKER}: usage readers run in a child process
`,
    'session-cost-usage import');
  out = replaceExactlyOnce(out, 'const usageHandlers = {\n', 'const usageHandlersInProcess = {\n', 'usage handlers');
  out = replaceExactlyOnce(out,
    `//#endregion\nexport { usageHandlers as t };`,
    `//#endregion\n${RPC_WRAPPER}export { usageHandlers as t, usageHandlersInProcess };`,
    'usage handlers export');
  return out;
}

// core/dist/commands-session-cost.runtime-C4rqe689.js
export function patchSessionCostCommand(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `import { a as loadCostUsageSummary, n as loadSessionCostSummary } from "${DIRECT}";\n`,
    `import { loadCostUsageSummary, loadSessionCostSummary } from "./usage-offload-v1.js"; // ${MARKER}: usage readers run in a child process\n`,
    'session-cost-usage import');
}

// New file core/dist/usage-offload-v1.js (src/infra/session-cost-usage-offload.ts).
export const OFFLOAD_MODULE = `// ${MARKER}: usage readers run in a child process, not on the Gateway's main thread.
// Source: openclaw-versa src/infra/session-cost-usage-offload.ts. OPENCLAW_USAGE_OFFLOAD=0 runs
// them in-process again.
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { a as loadCostUsageSummaryDirect, i as loadSessionUsageTimeSeriesDirect, n as loadSessionCostSummaryDirect, o as loadCostUsageSummaryFromCacheDirect, r as loadSessionLogsDirect, s as loadSessionCostSummariesFromCacheDirect, t as discoverAllSessionsDirect } from "${DIRECT}";
import { execFile, fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
const logger = createSubsystemLogger("usage-offload");
const DEFAULT_HEAP_MB = 4096;
const DEFAULT_CALL_TIMEOUT_MS = 6e5;
const DEFAULT_IDLE_MS = 6e4;
const USAGE_OFFLOAD_CHILD_ENV = "OPENCLAW_USAGE_OFFLOAD_CHILD";
const READERS = {
	discoverAllSessions: discoverAllSessionsDirect,
	loadCostUsageSummary: loadCostUsageSummaryDirect,
	loadCostUsageSummaryFromCache: loadCostUsageSummaryFromCacheDirect,
	loadSessionCostSummariesFromCache: loadSessionCostSummariesFromCacheDirect,
	loadSessionCostSummary: loadSessionCostSummaryDirect,
	loadSessionLogs: loadSessionLogsDirect,
	loadSessionUsageTimeSeries: loadSessionUsageTimeSeriesDirect
};
function resolveUsageOffloadReader(method) {
	return Object.hasOwn(READERS, method) ? READERS[method] : void 0;
}
let current;
let nextId = 1;
function readPositiveInt(name, fallback) {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function resolveChildEntry() {
	return process.env.OPENCLAW_USAGE_OFFLOAD_CHILD_ENTRY || fileURLToPath(new URL("./usage-offload-child-v1.js", import.meta.url));
}
function isUsageOffloadEnabled() {
	return process.env.OPENCLAW_USAGE_OFFLOAD !== "0" && process.env[USAGE_OFFLOAD_CHILD_ENV] !== "1" && fs.existsSync(resolveChildEntry());
}
function childExecArgv() {
	return [...process.execArgv.filter((arg) => !/^--(inspect|inspect-brk|inspect-port|debug-port|max-old-space-size)(=|$)/u.test(arg)), \`--max-old-space-size=\${readPositiveInt("OPENCLAW_USAGE_OFFLOAD_HEAP_MB", DEFAULT_HEAP_MB)}\`];
}
function lowerPriority(pid) {
	if (!pid) return;
	try {
		os.setPriority(pid, 19);
	} catch {}
	if (process.platform === "linux") execFile("ionice", [
		"-c3",
		"-p",
		String(pid)
	], () => {});
}
function failPending(state, error) {
	for (const pending of state.pending.values()) {
		clearTimeout(pending.timer);
		pending.reject(error);
	}
	state.pending.clear();
}
function holdParent(state, hold) {
	const channel = state.child.channel;
	if (hold) {
		state.child.ref();
		channel?.ref?.();
	} else {
		state.child.unref();
		channel?.unref?.();
	}
}
function settle(state) {
	if (state.pending.size === 0) holdParent(state, false);
	scheduleIdleShutdown(state);
}
function startChild() {
	const child = fork(resolveChildEntry(), [], {
		env: {
			...process.env,
			[USAGE_OFFLOAD_CHILD_ENV]: "1"
		},
		execArgv: childExecArgv(),
		serialization: "advanced",
		stdio: [
			"ignore",
			"inherit",
			"inherit",
			"ipc"
		]
	});
	const state = {
		child,
		pending: /* @__PURE__ */ new Map()
	};
	lowerPriority(child.pid);
	child.on("message", (message) => {
		const pending = typeof message?.id === "number" ? state.pending.get(message.id) : void 0;
		if (!pending) return;
		state.pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.ok) pending.resolve(message.value);
		else pending.reject(new Error(message.error ?? "usage worker failed"));
		settle(state);
	});
	child.on("error", (error) => {
		logger.warn(\`usage worker error: \${error.message}\`);
	});
	child.on("exit", (code, signal) => {
		if (current === state) current = void 0;
		if (state.pending.size > 0) {
			logger.warn(\`usage worker exited (code=\${code ?? "null"} signal=\${signal ?? "null"})\`);
			failPending(state, new Error(\`usage worker exited before answering (code=\${code} signal=\${signal})\`));
		}
	});
	return state;
}
function scheduleIdleShutdown(state) {
	if (state.pending.size > 0 || state.idleTimer) return;
	state.idleTimer = setTimeout(() => {
		state.idleTimer = void 0;
		if (state.pending.size > 0 || current !== state) return;
		current = void 0;
		try {
			state.child.send({ type: "shutdown" });
		} catch {
			state.child.kill();
		}
	}, readPositiveInt("OPENCLAW_USAGE_OFFLOAD_IDLE_MS", DEFAULT_IDLE_MS));
	state.idleTimer.unref?.();
}
function cloneConfig(config) {
	return config === void 0 ? void 0 : JSON.parse(JSON.stringify(config));
}
async function callUsageOffload(method, params) {
	if (!isUsageOffloadEnabled()) return await resolveUsageOffloadReader(method)(params);
	return await sendToWorker(method, {
		method,
		params: params && typeof params === "object" && "config" in params ? {
			...params,
			config: cloneConfig(params.config)
		} : params
	});
}
/** Runs a Gateway usage RPC handler in the worker; only its reply crosses back. */
async function callUsageOffloadRpc(rpc, params, config) {
	return await sendToWorker(rpc, {
		rpc,
		params,
		config: cloneConfig(config)
	});
}
async function sendToWorker(label, message) {
	const state = current ?? (current = startChild());
	if (state.idleTimer) {
		clearTimeout(state.idleTimer);
		state.idleTimer = void 0;
	}
	const id = nextId++;
	return await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			state.pending.delete(id);
			reject(new Error(\`usage worker did not answer \${label} in time\`));
			settle(state);
		}, readPositiveInt("OPENCLAW_USAGE_OFFLOAD_TIMEOUT_MS", DEFAULT_CALL_TIMEOUT_MS));
		timer.unref?.();
		state.pending.set(id, {
			resolve,
			reject,
			timer
		});
		holdParent(state, true);
		try {
			state.child.send({
				id,
				...message
			});
		} catch (error) {
			state.pending.delete(id);
			clearTimeout(timer);
			settle(state);
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}
const discoverAllSessions = (params) => callUsageOffload("discoverAllSessions", params);
const loadCostUsageSummary = (params) => callUsageOffload("loadCostUsageSummary", params);
const loadCostUsageSummaryFromCache = (params) => callUsageOffload("loadCostUsageSummaryFromCache", params);
const loadSessionCostSummariesFromCache = (params) => callUsageOffload("loadSessionCostSummariesFromCache", params);
const loadSessionCostSummary = (params) => callUsageOffload("loadSessionCostSummary", params);
const loadSessionLogs = (params) => callUsageOffload("loadSessionLogs", params);
const loadSessionUsageTimeSeries = (params) => callUsageOffload("loadSessionUsageTimeSeries", params);
export { callUsageOffload, callUsageOffloadRpc, discoverAllSessions, isUsageOffloadEnabled, loadCostUsageSummary, loadCostUsageSummaryFromCache, loadSessionCostSummariesFromCache, loadSessionCostSummary, loadSessionLogs, loadSessionUsageTimeSeries, resolveUsageOffloadReader };
`;

// New file core/dist/usage-offload-child-v1.js (src/infra/session-cost-usage-offload-child.ts).
export const OFFLOAD_CHILD = `// ${MARKER}: worker process for usage-offload-v1.js. It answers one message per call (a reader
// or a whole usage RPC handler), runs background rollup refreshes in its own event loop, exits on
// "shutdown" once its refresh queue is idle, and exits immediately when the Gateway's IPC channel
// closes. Source: openclaw-versa src/infra/session-cost-usage-offload-child.ts.
import { isCostUsageRefreshQueueIdle } from "${DIRECT}";
import { resolveUsageOffloadReader } from "./usage-offload-v1.js";
const WORKER_RPC_CLIENT = { connect: { scopes: ["operator.admin"] } };
async function runRpc(message) {
	const { usageHandlersInProcess } = await import("./usage-C3nh9kcO.js");
	const handler = usageHandlersInProcess[message.rpc];
	if (!handler) throw new Error(\`unknown usage rpc \${message.rpc}\`);
	return await new Promise((resolve, reject) => {
		Promise.resolve(handler({
			params: message.params ?? {},
			context: { getRuntimeConfig: () => message.config },
			client: WORKER_RPC_CLIENT,
			respond: (ok, payload, error) => resolve({
				ok,
				payload,
				error
			}),
			req: {
				type: "req",
				id: \`usage-offload-\${message.id}\`,
				method: message.rpc
			},
			isWebchatConnect: () => false
		})).catch(reject);
	});
}
let inFlight = 0;
let shutdownRequested = false;
function exitWhenIdle() {
	if (inFlight === 0 && isCostUsageRefreshQueueIdle()) process.exit(0);
	setTimeout(exitWhenIdle, 1e3);
}
process.on("disconnect", () => process.exit(0));
process.on("message", (message) => {
	if (message?.type === "shutdown") {
		shutdownRequested = true;
		exitWhenIdle();
		return;
	}
	if (typeof message?.id !== "number" || !message.method && !message.rpc) return;
	const reader = message.method ? resolveUsageOffloadReader(message.method) : void 0;
	const run = message.rpc ? () => runRpc(message) : reader;
	if (!run) {
		process.send?.({
			id: message.id,
			ok: false,
			error: \`unknown usage method \${message.method}\`
		});
		return;
	}
	inFlight += 1;
	(async () => {
		try {
			const value = await run(message.params);
			process.send?.({
				id: message.id,
				ok: true,
				value
			});
		} catch (error) {
			process.send?.({
				id: message.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		} finally {
			inFlight -= 1;
			if (shutdownRequested) exitWhenIdle();
		}
	})();
});
`;

export const FILES = [
  { name: 'session-cost-usage-C_mE_GAE.js', base: 'core/dist', target: 'openclaw/dist', before: '0514592d3436c5c2b86792024d640f09b6c6b70ae90acf18943b736fd0e1ade3', patch: patchSessionCostUsage },
  { name: 'usage-C3nh9kcO.js', base: 'core/dist', target: 'openclaw/dist', before: '5b614d0a7245a859c76c281bff2d7e1507f8ed621a4ec36b42002cccb6c1ff0f', patch: patchUsageHandlers },
  { name: 'commands-session-cost.runtime-C4rqe689.js', base: 'core/dist', target: 'openclaw/dist', before: 'ad93673131d8070c771e06170be6e5a993fd409345ceab89ae6413707761e46c', patch: patchSessionCostCommand },
];

export const NEW_FILES = [
  { name: 'usage-offload-v1.js', target: 'openclaw/dist', content: OFFLOAD_MODULE },
  { name: 'usage-offload-child-v1.js', target: 'openclaw/dist', content: OFFLOAD_CHILD },
];
