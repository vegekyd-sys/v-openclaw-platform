import assert from 'node:assert/strict';

// Keep connected spare stdio MCP clients ready so a new session runtime does not spawn its own.
//
// Every bundle MCP runtime (one per session, or per session + requester) spawned and initialized
// its own stdio server processes while the turn waited, inside bundle-tools before the model
// request. On VLab (release firsttext-r1-20261006, gap-marks round 2, 2026-10-06) 20 of 24 Worker
// runs connected voice-memory fresh: reused=false connected=false, 265-2020 ms, P50 1060 ms,
// followed by a 4-197 ms tools/list. Only the 4 runs whose session runtime was already cached in
// the same Worker skipped it. New sessions, sessions that moved between Workers, and runtimes the
// manager replaced all pay it.
//
// This keeps a small process-wide pool of spare clients per stdio server launch. A spare is spawned
// and initialized in the background with the same command, args, env, cwd and plugin data dir the
// runtime would use, under the same client options. When a runtime would create a new session for
// that server it adopts a connected spare instead: same per-session process isolation, one process
// per runtime as before, but the spawn and initialize already happened. The tools/list of the new
// runtime still runs against its own process. Each use schedules a background refill.
//
// Eligible: stdio servers with no requester-scoped connection override in a runtime with no
// requester scope. HTTP/SSE servers and requester-scoped runtimes are unchanged.
// Idle spares do not keep the process alive and are killed when it exits.
// A key unused for 10 minutes has its spares closed. After 3 consecutive spare start failures for
// a key the pool stops refilling it and runtimes start their own process as before.
// OPENCLAW_BUNDLE_MCP_WARM_POOL=0 turns it off; 1-8 sets spares per launch (default 2).

export const WARM_POOL_MARKER = '// OPENCLAW_BUNDLE_MCP_WARM_POOL_V1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const POOL = `${WARM_POOL_MARKER}
const BUNDLE_MCP_WARM_POOL_IDLE_MS = 6e5;
const BUNDLE_MCP_WARM_POOL_SWEEP_MS = 6e4;
const BUNDLE_MCP_WARM_POOL_MAX_FAILURES = 3;
const bundleMcpWarmPools = /* @__PURE__ */ new Map();
let bundleMcpWarmPoolSweep;
let bundleMcpWarmPoolExitHook = false;
function bundleMcpWarmPoolSize() {
	const raw = process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL?.trim();
	if (raw === "0" || raw === "off" || raw === "false") return 0;
	const size = Number(raw);
	return raw && Number.isInteger(size) && size >= 1 && size <= 8 ? size : 2;
}
function bundleMcpWarmPoolKey(serverName, resolved, mcpAppsEnabled) {
	if (bundleMcpWarmPoolSize() === 0 || resolved?.transportType !== "stdio") return;
	const launch = resolved.transport?.serverParams;
	if (!launch || typeof launch.command !== "string") return;
	return createHash("sha256").update(JSON.stringify([
		serverName,
		mcpAppsEnabled,
		launch.command,
		launch.args ?? [],
		launch.env ?? null,
		launch.cwd ?? null,
		launch.prepareDataDir ?? null,
		launch.stderr ?? null,
		resolved.connectionTimeoutMs
	])).digest("hex");
}
function refBundleMcpWarmSpare(spare, ref) {
	const child = spare.transport.process;
	for (const handle of [child, child?.stdin, child?.stdout, child?.stderr]) try {
		if (ref) handle?.ref?.();
		else handle?.unref?.();
	} catch {}
}
function closeBundleMcpWarmSpare(spare) {
	spare.closed = true;
	spare.connected = false;
	disposeBundleMcpSession(spare).catch(() => {});
}
function removeBundleMcpWarmSpare(pool, spare) {
	const index = pool.spares.indexOf(spare);
	if (index >= 0) pool.spares.splice(index, 1);
}
function sweepBundleMcpWarmPools(now = Date.now(), force = false) {
	for (const [key, pool] of bundleMcpWarmPools) {
		if (!force && now - pool.lastDemandAt < BUNDLE_MCP_WARM_POOL_IDLE_MS) continue;
		bundleMcpWarmPools.delete(key);
		for (const spare of pool.spares.splice(0)) closeBundleMcpWarmSpare(spare);
	}
	if (bundleMcpWarmPools.size === 0 && bundleMcpWarmPoolSweep) {
		clearInterval(bundleMcpWarmPoolSweep);
		bundleMcpWarmPoolSweep = void 0;
	}
}
function killBundleMcpWarmSparesOnExit() {
	for (const pool of bundleMcpWarmPools.values()) for (const spare of pool.spares) try {
		spare.transport.forceClose?.().catch?.(() => {});
	} catch {}
}
function refillBundleMcpWarmPool(key, pool) {
	pool.refillScheduled = false;
	if (bundleMcpWarmPools.get(key) !== pool) return;
	const size = bundleMcpWarmPoolSize();
	while (pool.spares.length < size && pool.failures < BUNDLE_MCP_WARM_POOL_MAX_FAILURES) {
		let resolved;
		try {
			resolved = pool.resolveTransport();
		} catch {
			pool.failures += 1;
			return;
		}
		if (!resolved || bundleMcpWarmPoolKey(pool.serverName, resolved, pool.mcpAppsEnabled) !== key) {
			resolved?.detachStderr?.();
			pool.failures = BUNDLE_MCP_WARM_POOL_MAX_FAILURES;
			return;
		}
		const handlers = {};
		const client = new Client({
			name: "openclaw-bundle-mcp",
			version: "0.0.0"
		}, {
			...buildMcpClientOptions(pool.mcpAppsEnabled),
			jsonSchemaValidator: createMcpJsonSchemaValidator(),
			listChanged: { tools: {
				autoRefresh: false,
				debounceMs: 0,
				onChanged: (error) => handlers.onChanged?.(error)
			} }
		});
		const spare = {
			serverName: pool.serverName,
			client,
			transport: resolved.transport,
			transportType: resolved.transportType,
			detachStderr: resolved.detachStderr,
			handlers,
			connected: false,
			closed: false
		};
		client.onclose = () => {
			spare.connected = false;
			spare.closed = true;
			removeBundleMcpWarmSpare(pool, spare);
		};
		pool.spares.push(spare);
		connectMcpClient({
			client,
			transport: resolved.transport,
			timeoutMs: resolved.connectionTimeoutMs
		}).then(() => {
			if (spare.closed) return;
			spare.connected = true;
			refBundleMcpWarmSpare(spare, false);
			pool.failures = 0;
		}, (error) => {
			pool.failures += 1;
			removeBundleMcpWarmSpare(pool, spare);
			closeBundleMcpWarmSpare(spare);
			logWarn(\`bundle-mcp: warm spare for server "\${pool.serverName}" failed to start: \${redactMcpDiagnosticError(error)}\`);
		});
	}
}
function takeBundleMcpWarmSpare(key, serverName, mcpAppsEnabled, resolveTransport) {
	let pool = bundleMcpWarmPools.get(key);
	if (!pool) {
		pool = {
			serverName,
			mcpAppsEnabled,
			spares: [],
			failures: 0,
			lastDemandAt: Date.now(),
			refillScheduled: false
		};
		bundleMcpWarmPools.set(key, pool);
	}
	pool.lastDemandAt = Date.now();
	pool.resolveTransport = resolveTransport;
	const index = pool.spares.findIndex((entry) => entry.connected && !entry.closed && entry.transport.pid);
	const spare = index >= 0 ? pool.spares.splice(index, 1)[0] : void 0;
	if (spare) refBundleMcpWarmSpare(spare, true);
	if (!bundleMcpWarmPoolSweep) {
		bundleMcpWarmPoolSweep = setInterval(() => sweepBundleMcpWarmPools(), BUNDLE_MCP_WARM_POOL_SWEEP_MS);
		bundleMcpWarmPoolSweep.unref?.();
	}
	if (!bundleMcpWarmPoolExitHook) {
		bundleMcpWarmPoolExitHook = true;
		process.once("exit", killBundleMcpWarmSparesOnExit);
	}
	if (!pool.refillScheduled && pool.failures < BUNDLE_MCP_WARM_POOL_MAX_FAILURES) {
		pool.refillScheduled = true;
		setImmediate(() => refillBundleMcpWarmPool(key, pool));
	}
	return spare;
}
function bundleMcpWarmPoolStateForTest() {
	return [...bundleMcpWarmPools.values()].map((pool) => ({
		serverName: pool.serverName,
		spares: pool.spares.length,
		connected: pool.spares.filter((spare) => spare.connected).length,
		failures: pool.failures
	}));
}
function closeBundleMcpWarmPoolsForTest() {
	sweepBundleMcpWarmPools(Date.now(), true);
}
`;

export function patchMcpWarmPool(source) {
  if (source.includes(WARM_POOL_MARKER)) return source;
  let s = source;
  s = replaceExactlyOnce(s,
    'import { Client } from "@modelcontextprotocol/sdk/client/index.js";\n',
    'import { Client } from "@modelcontextprotocol/sdk/client/index.js";\nimport { createHash } from "node:crypto";\n',
    'Client import');
  s = replaceExactlyOnce(s,
    'function createSessionMcpRuntime(params) {\n',
    POOL + 'function createSessionMcpRuntime(params) {\n',
    'createSessionMcpRuntime');
  s = replaceExactlyOnce(s,
    `\t\t\t\t\tconst launchDescription = override ? \`\${serverName}: requester-scoped connection\` : resolved.description;
\t\t\t\t\tpreparedEntries.push({
\t\t\t\t\t\tserverName,
\t\t\t\t\t\trawServer,
\t\t\t\t\t\tresolved,
\t\t\t\t\t\tsafeServerName,
\t\t\t\t\t\tlaunchDescription
\t\t\t\t\t});`,
    `\t\t\t\t\tconst launchDescription = override ? \`\${serverName}: requester-scoped connection\` : resolved.description;
\t\t\t\t\tconst warmKey = !override && params.requesterScope === void 0 ? bundleMcpWarmPoolKey(serverName, resolved, mcpAppsEnabled) : void 0;
\t\t\t\t\tconst warmResolveTransport = warmKey ? () => resolveMcpTransport(serverName, transportSource, {
\t\t\t\t\t\tcfg: params.cfg,
\t\t\t\t\t\tagentDir: params.agentDir,
\t\t\t\t\t\tprepareDataDir: dataDirOwnership?.dataDir
\t\t\t\t\t}) : void 0;
\t\t\t\t\tpreparedEntries.push({
\t\t\t\t\t\tserverName,
\t\t\t\t\t\trawServer,
\t\t\t\t\t\tresolved,
\t\t\t\t\t\tsafeServerName,
\t\t\t\t\t\tlaunchDescription,
\t\t\t\t\t\twarmKey,
\t\t\t\t\t\twarmResolveTransport
\t\t\t\t\t});`,
    'preparedEntries.push');
  s = replaceExactlyOnce(s,
    'const tasks = preparedEntries.map(({ serverName, rawServer, resolved, safeServerName, launchDescription }) => async () => {',
    'const tasks = preparedEntries.map(({ serverName, rawServer, resolved, safeServerName, launchDescription, warmKey, warmResolveTransport }) => async () => {',
    'tasks map');
  s = replaceExactlyOnce(s,
    `\t\t\t\t\tif (!session) {
\t\t\t\t\t\tconst client = new Client({`,
    `\t\t\t\t\tif (!session) {
\t\t\t\t\t\tconst warmSpare = warmKey ? takeBundleMcpWarmSpare(warmKey, serverName, mcpAppsEnabled, warmResolveTransport) : void 0;
\t\t\t\t\t\tif (warmKey) bundlePrepObserver.mark("server-warm-spare",{server:serverName,connected:Boolean(warmSpare)});
\t\t\t\t\t\tif (warmSpare) {
\t\t\t\t\t\t\tresolved.detachStderr?.();
\t\t\t\t\t\t\twarmSpare.handlers.onChanged = (error) => {
\t\t\t\t\t\t\t\tif (error) logWarn(\`bundle-mcp: failed to refresh changed tool list for server "\${serverName}": \${redactMcpDiagnosticError(error)}\`);
\t\t\t\t\t\t\t\tinvalidateCatalog();
\t\t\t\t\t\t\t};
\t\t\t\t\t\t}
\t\t\t\t\t\tconst client = warmSpare ? warmSpare.client : new Client({`,
    'new session client');
  s = replaceExactlyOnce(s,
    `\t\t\t\t\t\t\tclient,
\t\t\t\t\t\t\ttransport: resolved.transport,
\t\t\t\t\t\t\ttransportType: resolved.transportType,
\t\t\t\t\t\t\trequestTimeoutMs: resolved.requestTimeoutMs,
\t\t\t\t\t\t\tsupportsParallelToolCalls: resolved.supportsParallelToolCalls,
\t\t\t\t\t\t\tconnected: false,
\t\t\t\t\t\t\tretiring: false,
\t\t\t\t\t\t\tdetachStderr: resolved.detachStderr
\t\t\t\t\t\t};`,
    `\t\t\t\t\t\t\tclient,
\t\t\t\t\t\t\ttransport: warmSpare ? warmSpare.transport : resolved.transport,
\t\t\t\t\t\t\ttransportType: resolved.transportType,
\t\t\t\t\t\t\trequestTimeoutMs: resolved.requestTimeoutMs,
\t\t\t\t\t\t\tsupportsParallelToolCalls: resolved.supportsParallelToolCalls,
\t\t\t\t\t\t\tconnected: Boolean(warmSpare),
\t\t\t\t\t\t\tretiring: false,
\t\t\t\t\t\t\tdetachStderr: warmSpare ? warmSpare.detachStderr : resolved.detachStderr
\t\t\t\t\t\t};`,
    'createdSession');
  s = replaceExactlyOnce(s,
    '\tsetBundleMcpDisposeTimeoutMsForTest,\n\tmergeMcpToolCatalogs\n};',
    '\tsetBundleMcpDisposeTimeoutMsForTest,\n\tmergeMcpToolCatalogs,\n\tbundleMcpWarmPoolStateForTest,\n\tcloseBundleMcpWarmPoolsForTest\n};',
    'testing export');
  return s;
}
