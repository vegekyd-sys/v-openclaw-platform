import { n as resolveGlobalMap } from "./global-singleton-Dc_stLtU.js";
import { i as getOrCreatePromise } from "./lazy-promise-DGqyc4Y4.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { r as logVerbose } from "./globals-Dl0PaL2u.js";
import { f as loadSessionEntryReadOnly, p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import "./session-accessor-K0XuW6ln.js";
import { a as SessionWorkStartInvalidatedError, f as resolveSessionWorkStartError, i as SessionWorkStartChangedError, u as isSessionWorkStartInvalidatedError } from "./lifecycle-CKz-1QIz.js";
import { t as createSessionDiffBaselineCaptureClaim } from "./session-diff-baseline-capture-6ejBT0Am.js";
import fs from "node:fs/promises";
import path from "node:path";
//#region src/sessions/session-diff-baseline.ts
const captureInFlight = resolveGlobalMap(Symbol.for("openclaw.sessionDiffBaselineCaptureInFlight"), async (captures) => {
	await Promise.allSettled(captures.values());
	captures.clear();
});
function matchingCapture(entry) {
	const capture = entry.sessionDiffBaselineCapture;
	return capture?.version === 1 ? capture : void 0;
}
function invalidatedSessionWork(params) {
	return new SessionWorkStartChangedError(resolveSessionWorkStartError(params.sessionKey, params.entry, { expectedSessionId: params.expectedSessionId }) ?? `Session "${params.sessionKey}" changed while starting work. Retry.`);
}
function requireAuthoritativeGeneration(params) {
	if (!params.entry || params.entry.sessionId !== params.expectedSessionId || params.entry.lifecycleRevision !== params.expectedLifecycleRevision) throw invalidatedSessionWork(params);
	return params.entry;
}
function loadAuthoritativeGeneration(params) {
	let entry;
	try {
		entry = loadSessionEntryReadOnly({
			sessionKey: params.sessionKey,
			storePath: params.storePath
		});
	} catch (error) {
		logVerbose(`session diff baseline generation read failed for ${params.sessionKey}: ${formatErrorMessage(error)}`);
		throw new SessionWorkStartInvalidatedError(`Session "${params.sessionKey}" could not verify its diff baseline before starting work. Retry.`);
	}
	return requireAuthoritativeGeneration({
		entry,
		...params
	});
}
async function hasDiscoverableGitMetadata(cwd, env = process.env) {
	if ((typeof env.GIT_DIR === "string" && env.GIT_DIR.trim()) || (typeof env.GIT_WORK_TREE === "string" && env.GIT_WORK_TREE.trim())) return true;
	if (typeof cwd !== "string" || !cwd.trim()) return true;
	let current = path.resolve(cwd);
	for (;;) {
		try {
			await fs.lstat(path.join(current, ".git"));
			return true;
		} catch (error) {
			if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return true;
		}
		const parent = path.dirname(current);
		if (parent === current) return false;
		current = parent;
	}
}
async function persistCaptureResult(params) {
	const authoritative = requireAuthoritativeGeneration({
		entry: await patchSessionEntryCore({
			sessionKey: params.sessionKey,
			storePath: params.storePath
		}, (currentEntry) => {
			const current = currentEntry;
			const currentCapture = matchingCapture(current);
			if (current.sessionId !== params.sessionId || current.lifecycleRevision !== params.expectedLifecycleRevision || currentCapture?.captureId !== params.capture.captureId || currentCapture.status !== "pending") return null;
			return params.baseline ? {
				sessionDiffBaseline: params.baseline,
				sessionDiffBaselineCapture: void 0
			} : { sessionDiffBaselineCapture: {
				...params.capture,
				status: "unavailable"
			} };
		}, {
			preserveActivity: true,
			skipMaintenance: true
		}).catch((error) => {
			if (isSessionWorkStartInvalidatedError(error)) throw error;
			logVerbose(`session diff baseline settlement failed for ${params.sessionKey}: ${formatErrorMessage(error)}`);
			throw new SessionWorkStartInvalidatedError(`Session "${params.sessionKey}" could not persist its diff baseline before starting work. Retry.`);
		}),
		expectedLifecycleRevision: params.expectedLifecycleRevision,
		expectedSessionId: params.sessionId,
		sessionKey: params.sessionKey
	});
	if (authoritative.sessionDiffBaseline?.sessionId === params.sessionId) return authoritative;
	const authoritativeCapture = matchingCapture(authoritative);
	if (authoritativeCapture?.captureId === params.capture.captureId && authoritativeCapture.status === "unavailable") return authoritative;
	throw invalidatedSessionWork({
		entry: authoritative,
		expectedSessionId: params.sessionId,
		sessionKey: params.sessionKey
	});
}
async function settleCapture(params) {
	let baseline;
	try {
		const { captureSessionDiffBaseline } = await import("./session-diff-D5_JfMCo.js");
		baseline = await captureSessionDiffBaseline({
			cwd: params.cwd,
			sessionId: params.sessionId
		});
	} catch (error) {
		if (isSessionWorkStartInvalidatedError(error)) throw error;
		const entry = await persistCaptureResult(params);
		logVerbose(`session diff baseline capture failed; continuing without attribution filtering: ${formatErrorMessage(error)}`);
		return entry;
	}
	return await persistCaptureResult({
		...params,
		baseline
	});
}
async function ensureSessionDiffBaseline(params) {
	if (params.entry.execNode) return params.entry;
	let entry = loadAuthoritativeGeneration({
		expectedLifecycleRevision: params.entry.lifecycleRevision,
		expectedSessionId: params.entry.sessionId,
		sessionKey: params.sessionKey,
		storePath: params.storePath
	});
	if (entry.sessionDiffBaseline?.sessionId === entry.sessionId || matchingCapture(entry)?.status === "unavailable") return entry;
	let capture = matchingCapture(entry);
	if (!capture) {
		if (!params.isNewSession || entry.createdVia !== "operator") return entry;
		if (!await hasDiscoverableGitMetadata(params.cwd)) return entry;
		const expectedSessionId = entry.sessionId;
		const expectedLifecycleRevision = entry.lifecycleRevision;
		const pending = createSessionDiffBaselineCaptureClaim();
		entry = requireAuthoritativeGeneration({
			entry: await patchSessionEntryCore({
				sessionKey: params.sessionKey,
				storePath: params.storePath
			}, (currentEntry) => {
				const current = currentEntry;
				if (current.sessionId !== expectedSessionId || current.lifecycleRevision !== expectedLifecycleRevision || current.sessionDiffBaseline?.sessionId === current.sessionId || matchingCapture(current)) return null;
				return { sessionDiffBaselineCapture: pending };
			}, {
				preserveActivity: true,
				skipMaintenance: true
			}),
			expectedLifecycleRevision,
			expectedSessionId,
			sessionKey: params.sessionKey
		});
		if (entry.sessionDiffBaseline?.sessionId === entry.sessionId) return entry;
		capture = matchingCapture(entry);
	}
	if (!capture || capture.status === "unavailable") return entry;
	return await getOrCreatePromise(captureInFlight, capture.captureId, () => settleCapture({
		...params,
		capture,
		expectedLifecycleRevision: entry.lifecycleRevision,
		sessionId: entry.sessionId
	}), { evictOnSettled: true });
}
//#endregion
export { hasDiscoverableGitMetadata, ensureSessionDiffBaseline as t };
