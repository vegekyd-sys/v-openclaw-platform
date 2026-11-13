// usage-offload-v1: usage readers run in a child process, not on the Gateway's main thread.
// Source: openclaw-versa src/infra/session-cost-usage-offload.ts. OPENCLAW_USAGE_OFFLOAD=0 runs
// them in-process again.
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { a as loadCostUsageSummaryDirect, i as loadSessionUsageTimeSeriesDirect, n as loadSessionCostSummaryDirect, o as loadCostUsageSummaryFromCacheDirect, r as loadSessionLogsDirect, s as loadSessionCostSummariesFromCacheDirect, t as discoverAllSessionsDirect } from "./session-cost-usage-C_mE_GAE.js";
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
	return [...process.execArgv.filter((arg) => !/^--(inspect|inspect-brk|inspect-port|debug-port|max-old-space-size)(=|$)/u.test(arg)), `--max-old-space-size=${readPositiveInt("OPENCLAW_USAGE_OFFLOAD_HEAP_MB", DEFAULT_HEAP_MB)}`];
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
		logger.warn(`usage worker error: ${error.message}`);
	});
	child.on("exit", (code, signal) => {
		if (current === state) current = void 0;
		if (state.pending.size > 0) {
			logger.warn(`usage worker exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
			failPending(state, new Error(`usage worker exited before answering (code=${code} signal=${signal})`));
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
	const payload = params && typeof params === "object" && "config" in params ? {
		...params,
		config: cloneConfig(params.config)
	} : params;
	const state = current ?? (current = startChild());
	if (state.idleTimer) {
		clearTimeout(state.idleTimer);
		state.idleTimer = void 0;
	}
	const id = nextId++;
	return await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			state.pending.delete(id);
			reject(new Error(`usage worker did not answer ${method} in time`));
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
				method,
				params: payload
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
export { callUsageOffload, discoverAllSessions, isUsageOffloadEnabled, loadCostUsageSummary, loadCostUsageSummaryFromCache, loadSessionCostSummariesFromCache, loadSessionCostSummary, loadSessionLogs, loadSessionUsageTimeSeries, resolveUsageOffloadReader };
