import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/process/gateway-work-admission.ts
var GatewayDrainingError = class extends Error {
	constructor(message = "Gateway is draining; new tasks are not accepted") {
		super(message);
		this.name = "GatewayDrainingError";
	}
};
const admissionLog = createSubsystemLogger("gateway/admission");
const GATEWAY_WORK_ADMISSION_STATE = resolveGlobalSingleton(Symbol.for("openclaw.gatewayWorkAdmissionState"), () => ({
	restartDraining: false,
	restartDrainController: new AbortController(),
	restartSignalPending: false,
	restartSignalGeneration: 0,
	suspendPhase: "accepting",
	suspendGeneration: 0,
	activeRootWork: /* @__PURE__ */ new Set(),
	currentRootWork: new AsyncLocalStorage(),
	suspendOpenWaiters: /* @__PURE__ */ new Set(),
	suspendListeners: /* @__PURE__ */ new Set()
}));
function logAdmissionClosed(reason) {
	admissionLog.info(`admission closed: ${reason}`);
}
function logAdmissionReopened(reason) {
	admissionLog.info(`admission reopened: ${reason}`);
}
const GATEWAY_ROOT_WORK_ORIGIN_MAX_CHARS = 80;
function createGatewayRootWorkAdmission(origin) {
	const admission = {
		origin: origin.trim().replaceAll(/\s+/g, " ").slice(0, GATEWAY_ROOT_WORK_ORIGIN_MAX_CHARS) || "gateway",
		references: 1,
		released: false
	};
	GATEWAY_WORK_ADMISSION_STATE.activeRootWork.add(admission);
	return {
		ownsRoot: true,
		release: createGatewayRootWorkRelease(admission),
		run: async (run) => await GATEWAY_WORK_ADMISSION_STATE.currentRootWork.run(admission, run)
	};
}
function createGatewayRootWorkRelease(admission) {
	let leaseReleased = false;
	return () => {
		if (leaseReleased || admission.released) return;
		leaseReleased = true;
		admission.references -= 1;
		if (admission.references > 0) return;
		admission.released = true;
		GATEWAY_WORK_ADMISSION_STATE.activeRootWork.delete(admission);
	};
}
function invalidateSuspendAdmission() {
	const callback = GATEWAY_WORK_ADMISSION_STATE.suspendInvalidated;
	const wasClosed = GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting";
	GATEWAY_WORK_ADMISSION_STATE.suspendInvalidated = void 0;
	GATEWAY_WORK_ADMISSION_STATE.suspendPhase = "accepting";
	GATEWAY_WORK_ADMISSION_STATE.suspendGeneration += 1;
	resolveSuspendOpenWaiters();
	if (wasClosed && !GATEWAY_WORK_ADMISSION_STATE.restartDraining) logAdmissionReopened("suspend phase");
	callback?.();
	if (wasClosed) notifyGatewaySuspendAdmission();
}
function clearRestartSignalFence() {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || !GATEWAY_WORK_ADMISSION_STATE.restartSignalPending) return false;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalPending = false;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalGeneration += 1;
	resolveSuspendOpenWaiters();
	if (GATEWAY_WORK_ADMISSION_STATE.suspendPhase === "accepting") logAdmissionReopened("restart-signal fence");
	else admissionLog.info("restart-signal fence cleared; suspension remains closed");
	return true;
}
function resolveSuspendOpenWaiters() {
	const waiters = Array.from(GATEWAY_WORK_ADMISSION_STATE.suspendOpenWaiters);
	GATEWAY_WORK_ADMISSION_STATE.suspendOpenWaiters.clear();
	for (const resolve of waiters) resolve();
}
/** True while restart signal/drain or host suspension rejects new process work. */
function isGatewayWorkAdmissionClosed() {
	return GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting";
}
/** Existing admitted roots may finish spawning subordinate command/session work.
* New async chains still see the global fence, preserving refuse-only suspension. */
function isGatewaySubordinateWorkAdmissionClosed() {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending) return true;
	const current = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	if (current) return current.released;
	return GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting";
}
function getGatewaySuspendAdmissionPhase() {
	return GATEWAY_WORK_ADMISSION_STATE.suspendPhase;
}
function onGatewaySuspendAdmissionChange(listener) {
	GATEWAY_WORK_ADMISSION_STATE.suspendListeners.add(listener);
	return () => {
		GATEWAY_WORK_ADMISSION_STATE.suspendListeners.delete(listener);
	};
}
function notifyGatewaySuspendAdmission() {
	const phase = getGatewaySuspendAdmissionPhase();
	const listeners = Array.from(GATEWAY_WORK_ADMISSION_STATE.suspendListeners);
	for (const listener of listeners) try {
		listener(phase);
	} catch (error) {
		admissionLog.warn(`suspension observer failed: ${String(error)}`);
	}
}
function isGatewayRestartDraining() {
	return GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending;
}
/** Resolves when one-way drain commits or the reversible signal fence clears. */
async function waitForGatewayRestartFenceSettlement() {
	if (!GATEWAY_WORK_ADMISSION_STATE.restartSignalPending) return;
	await new Promise((resolve) => {
		GATEWAY_WORK_ADMISSION_STATE.suspendOpenWaiters.add(resolve);
	});
	await waitForGatewayRestartFenceSettlement();
}
function getGatewayRestartDrainSignal() {
	return GATEWAY_WORK_ADMISSION_STATE.restartDrainController.signal;
}
function isGatewayRestartDrainError(error) {
	return error instanceof GatewayDrainingError && isGatewayRestartDraining();
}
/** Restart drain is one-way until the in-process restart resets runtime state. */
function markGatewayRestartDraining() {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining) return;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalPending = false;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalGeneration += 1;
	GATEWAY_WORK_ADMISSION_STATE.restartDraining = true;
	GATEWAY_WORK_ADMISSION_STATE.restartDrainController.abort(new GatewayDrainingError("gateway is draining for restart"));
	resolveSuspendOpenWaiters();
	logAdmissionClosed("restart drain");
	if (GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") invalidateSuspendAdmission();
}
/**
* Blocks suspension across signal emission until the run loop starts restart drain.
* Returns null when another owner already holds the fence or one-way drain is active.
* Callers must not invent a stand-in lease: a dead rollback handle is how the fence
* can stay closed after the real owner is lost.
*/
function beginGatewayRestartSignalAdmission() {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending) return null;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalPending = true;
	const generation = ++GATEWAY_WORK_ADMISSION_STATE.restartSignalGeneration;
	logAdmissionClosed("restart-signal fence");
	return { rollback: () => {
		if (!GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.restartSignalGeneration !== generation) return false;
		return clearRestartSignalFence();
	} };
}
/**
* Reopens a reversible restart-signal fence that no longer has a live lease.
* No-op while one-way restart drain owns admission.
*/
function rollbackGatewayRestartSignalFence() {
	return clearRestartSignalFence();
}
/** Root RPC/timer admission. Nested work in the same async chain counts once. */
function tryBeginGatewayRootWorkAdmission(origin = "gateway") {
	const current = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	if (current && !current.released) return {
		ownsRoot: false,
		release: () => {},
		run: async (run) => await run()
	};
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") return null;
	return createGatewayRootWorkAdmission(origin);
}
/**
* Tracks a host-selected restart-startup recovery handshake without reopening admission.
* The caller still owns frame/auth validation; this lease grants no method authority.
*/
function tryBeginGatewayRestartStartupRootWorkAdmission() {
	if (!GATEWAY_WORK_ADMISSION_STATE.restartDraining && !GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") return null;
	return createGatewayRootWorkAdmission("restart-startup");
}
/**
* Admits only the exact predecessor-bound restart selected by the RPC router.
* The held root preserves signal-to-drain ordering without reopening suspension.
*/
function tryBeginGatewayPreparedRestartRootWorkAdmission() {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "prepared" || GATEWAY_WORK_ADMISSION_STATE.activeRootWork.size > 0) return null;
	return createGatewayRootWorkAdmission("restart-prepared");
}
/** Independent detached work counts separately even when launched by an admitted parent. */
function tryBeginGatewayIndependentRootWorkAdmission(origin = "independent") {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") return null;
	return createGatewayRootWorkAdmission(origin);
}
/** Waits through a prepared lease, then joins the root-work set atomically. */
async function beginGatewayRootWorkAdmissionWhenOpen(origin = "gateway") {
	while (true) {
		if (GATEWAY_WORK_ADMISSION_STATE.restartDraining) throw new GatewayDrainingError();
		const admission = tryBeginGatewayRootWorkAdmission(origin);
		if (admission) return admission;
		await new Promise((resolve) => {
			GATEWAY_WORK_ADMISSION_STATE.suspendOpenWaiters.add(resolve);
		});
	}
}
async function runWithGatewayIndependentRootWorkAdmission(run, origin) {
	while (true) {
		if (GATEWAY_WORK_ADMISSION_STATE.restartDraining) throw new GatewayDrainingError("gateway is draining for restart");
		const admission = tryBeginGatewayIndependentRootWorkAdmission(origin);
		if (admission) try {
			return await admission.run(run);
		} finally {
			admission.release();
		}
		await new Promise((resolve) => {
			GATEWAY_WORK_ADMISSION_STATE.suspendOpenWaiters.add(resolve);
		});
	}
}
/** Re-admits preserved work whose inherited root was retired before it could run. */
const runWithGatewayRootWorkReadmission = (run) => GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore()?.retiredByReset ? runWithGatewayIndependentRootWorkAdmission(run, "runtime:readmission") : run();
/**
* Detaches required follow-up from the current admitted transaction.
* A live parent synchronously reserves a tracked root even after restart or
* suspension closes admission. The detached root keeps its caller origin
* because it can outlive the parent; otherwise the normal fence applies.
*/
function runWithGatewayIndependentRootWorkContinuation(run, origin = "independent") {
	const parent = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	if (!parent || parent.released) return runWithGatewayIndependentRootWorkAdmission(run, origin);
	const admission = createGatewayRootWorkAdmission(origin);
	return admission.run(run).finally(admission.release);
}
function createGatewayRootWorkAdmissionContinuationScope(retainRoot) {
	const current = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	if (!current || current.released || !GATEWAY_WORK_ADMISSION_STATE.activeRootWork.has(current)) return null;
	if (retainRoot) current.references += 1;
	const releaseAdmission = retainRoot ? createGatewayRootWorkRelease(current) : void 0;
	let released = false;
	return {
		release: () => {
			if (released) return;
			released = true;
			releaseAdmission?.();
		},
		run: async (run) => {
			if (released || current.released || !GATEWAY_WORK_ADMISSION_STATE.activeRootWork.has(current)) throw new GatewayDrainingError("gateway root work continuation is no longer active");
			current.references += 1;
			const releaseRun = createGatewayRootWorkRelease(current);
			try {
				return await GATEWAY_WORK_ADMISSION_STATE.currentRootWork.run(current, run);
			} finally {
				releaseRun();
			}
		}
	};
}
/** Borrows exact root ownership without extending the creating request's lifetime. */
function captureGatewayRootWorkAdmissionContinuationScope() {
	return createGatewayRootWorkAdmissionContinuationScope(false);
}
/** Retains exact root ownership for work that intentionally outlives its handler. */
function retainGatewayRootWorkAdmissionContinuationScope() {
	return createGatewayRootWorkAdmissionContinuationScope(true);
}
/** Transfers an admitted request root to work that intentionally outlives its handler. */
function retainGatewayRootWorkAdmissionContinuation() {
	return retainGatewayRootWorkAdmissionContinuationScope()?.release ?? null;
}
/** Starts process-lifetime work without inheriting the request root that created it. */
function runOutsideGatewayRootWorkAdmission(run) {
	return GATEWAY_WORK_ADMISSION_STATE.currentRootWork.exit(run);
}
/** Active root requests/ticks, optionally excluding the caller running prepare. */
function getActiveGatewayRootWorkCount(opts) {
	let count = GATEWAY_WORK_ADMISSION_STATE.activeRootWork.size;
	const current = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	if (opts?.excludeCurrent === true && current && !current.released && GATEWAY_WORK_ADMISSION_STATE.activeRootWork.has(current)) count -= 1;
	return Math.max(0, count);
}
/** Bounded, deterministic root-owner inventory for shutdown diagnostics. */
function getActiveGatewayRootWorkHolders(opts) {
	const current = GATEWAY_WORK_ADMISSION_STATE.currentRootWork.getStore();
	const counts = /* @__PURE__ */ new Map();
	for (const admission of GATEWAY_WORK_ADMISSION_STATE.activeRootWork) {
		if (opts?.excludeCurrent === true && admission === current) continue;
		counts.set(admission.origin, (counts.get(admission.origin) ?? 0) + 1);
	}
	return [...counts].toSorted(([left], [right]) => left.localeCompare(right)).map(([origin, count]) => count > 1 ? `${origin} (${count})` : origin);
}
/** Atomically closes new suspension admission before synchronous inspection. */
function tryBeginGatewaySuspendAdmission(onInvalidated) {
	if (GATEWAY_WORK_ADMISSION_STATE.restartDraining || GATEWAY_WORK_ADMISSION_STATE.restartSignalPending || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") return null;
	GATEWAY_WORK_ADMISSION_STATE.suspendPhase = "preparing";
	const generation = ++GATEWAY_WORK_ADMISSION_STATE.suspendGeneration;
	GATEWAY_WORK_ADMISSION_STATE.suspendInvalidated = onInvalidated;
	logAdmissionClosed("suspend phase");
	notifyGatewaySuspendAdmission();
	const transition = (expected, next) => {
		if (GATEWAY_WORK_ADMISSION_STATE.suspendGeneration !== generation || GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== expected) return false;
		GATEWAY_WORK_ADMISSION_STATE.suspendPhase = next;
		if (next === "accepting") {
			GATEWAY_WORK_ADMISSION_STATE.suspendInvalidated = void 0;
			resolveSuspendOpenWaiters();
			logAdmissionReopened("suspend phase");
		}
		notifyGatewaySuspendAdmission();
		return true;
	};
	return {
		drain: () => transition("preparing", "draining"),
		commit: () => transition("preparing", "prepared") || transition("draining", "prepared"),
		rollback: () => transition("preparing", "accepting"),
		release: () => transition("draining", "accepting") || transition("prepared", "accepting")
	};
}
/** Clears restart/suspend admission during SIGUSR1 and isolated tests. */
function resetGatewayWorkAdmission() {
	for (const admission of GATEWAY_WORK_ADMISSION_STATE.activeRootWork) {
		admission.references = 0;
		admission.retiredByReset = true;
		admission.released = true;
	}
	GATEWAY_WORK_ADMISSION_STATE.activeRootWork.clear();
	GATEWAY_WORK_ADMISSION_STATE.restartDraining = false;
	GATEWAY_WORK_ADMISSION_STATE.restartDrainController = new AbortController();
	GATEWAY_WORK_ADMISSION_STATE.restartSignalPending = false;
	GATEWAY_WORK_ADMISSION_STATE.restartSignalGeneration += 1;
	if (GATEWAY_WORK_ADMISSION_STATE.suspendPhase !== "accepting") invalidateSuspendAdmission();
	else {
		GATEWAY_WORK_ADMISSION_STATE.suspendGeneration += 1;
		GATEWAY_WORK_ADMISSION_STATE.suspendInvalidated = void 0;
	}
	resolveSuspendOpenWaiters();
}
//#endregion
export { tryBeginGatewayPreparedRestartRootWorkAdmission as C, waitForGatewayRestartFenceSettlement as D, tryBeginGatewaySuspendAdmission as E, runWithGatewayRootWorkReadmission as S, tryBeginGatewayRootWorkAdmission as T, retainGatewayRootWorkAdmissionContinuationScope as _, getActiveGatewayRootWorkCount as a, runWithGatewayIndependentRootWorkAdmission as b, getGatewaySuspendAdmissionPhase as c, isGatewaySubordinateWorkAdmissionClosed as d, isGatewayWorkAdmissionClosed as f, retainGatewayRootWorkAdmissionContinuation as g, resetGatewayWorkAdmission as h, captureGatewayRootWorkAdmissionContinuationScope as i, isGatewayRestartDrainError as l, onGatewaySuspendAdmissionChange as m, beginGatewayRestartSignalAdmission as n, getActiveGatewayRootWorkHolders as o, markGatewayRestartDraining as p, beginGatewayRootWorkAdmissionWhenOpen as r, getGatewayRestartDrainSignal as s, GatewayDrainingError as t, isGatewayRestartDraining as u, rollbackGatewayRestartSignalFence as v, tryBeginGatewayRestartStartupRootWorkAdmission as w, runWithGatewayIndependentRootWorkContinuation as x, runOutsideGatewayRootWorkAdmission as y };
