import {prepareVerifyResourceGroup} from "./database-verify-resource-group.mjs";
import { publishVerificationProof as db91Publish } from "./db91-integrity-gate.mjs";
import { d as toStructuredErrorObject } from "./error-coercion-CwcmpTBO.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as runtimeProcessEntrypoints } from "./runtime-process-entrypoints-DEjFGor2.js";
import { n as resolveRuntimeWorkerUrl } from "./runtime-worker-url-DJUUt97T.js";
import { V as recordOpenClawDatabaseQuarantine, s as recordOpenClawStateDatabaseOpenFailure } from "./openclaw-state-db-cache-AunrvrzG.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { t as confirmOpenClawStateDatabaseIntegrity } from "./openclaw-state-db-Bh3Bq87y.js";
import { H as listOpenClawRegisteredAgentDatabases } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { s as confirmOpenClawAgentDatabaseIntegrity, v as recordOpenClawAgentDatabaseOpenFailure } from "./openclaw-agent-db-CUTe8BX6.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fork } from "node:child_process";
//#region src/state/openclaw-database-verify.impl.ts
const OPENCLAW_DATABASE_VERIFY_INITIAL_DELAY_MS = 3e5;
const OPENCLAW_DATABASE_VERIFY_INTERVAL_MS = 864e5;
const log$1 = createSubsystemLogger("state/database-verify");
const DATABASE_VERIFY_CHILD_ARG = "--openclaw-database-verify-child";
function isVerifyResult(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const result = value;
	return typeof result.path === "string" && typeof result.ok === "boolean" && (result.error === void 0 || typeof result.error === "string") && (result.terminal === void 0 || typeof result.terminal === "boolean");
}
function runDatabaseVerifyWorker(targets, options = {}) {
	const workerUrl = options.workerUrl ?? resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.databaseVerify);
	const execArgv = workerUrl.pathname.endsWith(".ts") ? ["--import", "tsx"] : void 0;
	let worker;
	try {
		const resourceGroup = prepareVerifyResourceGroup();
		worker = fork(fileURLToPath(workerUrl), [DATABASE_VERIFY_CHILD_ARG], {
			execArgv,
			stdio: [
				"ignore",
				"ignore",
				"ignore",
				"ipc"
			]
		});
		resourceGroup?.attach(worker.pid);
	} catch (error) {
		worker?.once("error", () => {});
		worker?.kill();
		return Promise.reject(toStructuredErrorObject(error));
	}
	options.onWorker?.(worker);
	return new Promise((resolve, reject) => {
		let settled = false;
		let result;
		let protocolError;
		let exit;
		let disconnected = !worker.connected;
		const settle = (finish) => {
			if (settled) return;
			settled = true;
			worker.removeAllListeners();
			options.onWorker?.(void 0);
			finish();
		};
		const settleAfterExitAndDisconnect = () => {
			const completedExit = exit;
			if (!completedExit || !disconnected) return;
			settle(() => {
				if (protocolError) reject(toStructuredErrorObject(protocolError));
				else if (completedExit.code !== 0) reject(/* @__PURE__ */ new Error(`database verification worker exited with ${completedExit.signal ? `signal ${completedExit.signal}` : `code ${completedExit.code}`}`));
				else if (!result) reject(/* @__PURE__ */ new Error("database verification worker exited without results"));
				else resolve(result);
			});
		};
		worker.once("message", (message) => {
			if (!Array.isArray(message) || !message.every(isVerifyResult)) {
				protocolError = /* @__PURE__ */ new Error("database verification worker returned invalid results");
				worker.kill();
				return;
			}
			result = message;
		});
		worker.once("error", (error) => settle(() => reject(toStructuredErrorObject(error))));
		worker.once("disconnect", () => {
			disconnected = true;
			settleAfterExitAndDisconnect();
		});
		worker.once("exit", (code, signal) => {
			exit = {
				code,
				signal
			};
			disconnected ||= !worker.connected;
			settleAfterExitAndDisconnect();
		});
		worker.send(targets, (error) => {
			if (!error) return;
			worker.kill();
			settle(() => reject(toStructuredErrorObject(error)));
		});
	});
}
async function terminateDatabaseVerifyWorker(worker) {
	if (worker.exitCode !== null || worker.signalCode !== null) return;
	await new Promise((resolve) => {
		worker.once("exit", () => resolve());
		if (!worker.kill()) resolve();
	});
}
/** Resolve the state database and current registered agent database paths. */
function collectOpenClawDatabaseVerifyTargets(options) {
	const targets = /* @__PURE__ */ new Map();
	const statePath = path.resolve(resolveOpenClawStateSqlitePath(options.env));
	if (existsSync(statePath)) targets.set(statePath, {
		kind: "state",
		label: "OpenClaw state database",
		path: statePath
	});
	let registeredDatabases = [];
	try {
		registeredDatabases = listOpenClawRegisteredAgentDatabases({ env: options.env });
	} catch (error) {
		log$1.warn("failed to collect registered agent databases for integrity verification", { error: String(error) });
	}
	for (const registered of registeredDatabases) {
		const agentPath = path.resolve(registered.path);
		if (!existsSync(agentPath) || targets.has(agentPath)) continue;
		targets.set(agentPath, {
			kind: "agent",
			label: `OpenClaw agent database ${registered.agentId}`,
			path: agentPath
		});
	}
	return [...targets.values()];
}
/** Reconfirm worker failures on live owners before quarantine and latching. */
function applyOpenClawDatabaseVerificationResults(options) {
	const targetByPath = new Map(options.targets.map((target) => [target.path, target]));
	for (const result of options.results) {
		const target = targetByPath.get(result.path);
		if (!target) continue;
		if (result.ok) {
			try { db91Publish(result.db91Verification, result.path); } catch (error) { log$1.warn("DB91 verification cache refresh failed; native strict fallback remains", {error: String(error)}); }
			log$1.info("database integrity verification passed", {
				kind: target.kind,
				label: target.label,
				path: result.path
			});
			continue;
		}
		if (!result.terminal) {
			log$1.warn("database integrity verification was inconclusive", {
				kind: target.kind,
				label: target.label,
				path: result.path,
				error: result.error
			});
			continue;
		}
		const confirmation = target.kind === "state" ? confirmOpenClawStateDatabaseIntegrity(result.path) : confirmOpenClawAgentDatabaseIntegrity(result.path);
		if (confirmation.status === "healthy") {
			log$1.info("discarding stale database integrity verification result", {
				kind: target.kind,
				label: target.label,
				path: result.path
			});
			continue;
		}
		if (!confirmation.terminal) {
			log$1.warn("database integrity verification was inconclusive", {
				kind: target.kind,
				label: target.label,
				path: result.path,
				error: confirmation.error.message
			});
			continue;
		}
		if (!(target.kind === "state" ? recordOpenClawStateDatabaseOpenFailure(result.path, confirmation.error, confirmation.generation) : recordOpenClawAgentDatabaseOpenFailure(result.path, confirmation.error, confirmation.generation))) {
			log$1.info("discarding database integrity result after database generation changed", {
				kind: target.kind,
				label: target.label,
				path: result.path
			});
			continue;
		}
		if (!recordOpenClawDatabaseQuarantine({
			env: options.env,
			generation: confirmation.generation,
			kind: target.kind,
			path: result.path,
			reason: confirmation.error.message
		})) log$1.error("failed to persist database quarantine; quarantine is process-local", {
			kind: target.kind,
			path: result.path
		});
		log$1.error("database integrity verification failed", {
			kind: target.kind,
			label: target.label,
			path: result.path,
			error: confirmation.error.message
		});
	}
}
//#endregion
//#region src/state/openclaw-database-verify.ts
const log = createSubsystemLogger("state/database-verify");
/** Start the Gateway-owned delayed daily integrity verifier. */
function startOpenClawDatabaseIntegrityVerifier(options) {
	let activeWorker;
	let stopped = false;
	let timer;
	const schedule = (delayMs) => {
		timer = setTimeout(() => void run(), delayMs);
		timer.unref?.();
	};
	const run = async () => {
		timer = void 0;
		try {
			const targets = collectOpenClawDatabaseVerifyTargets(options);
			if (targets.length > 0) {
				const results = await runDatabaseVerifyWorker(targets, { onWorker: (worker) => {
					activeWorker = worker;
				} });
				if (!stopped) applyOpenClawDatabaseVerificationResults({
					...options,
					results,
					targets
				});
			}
		} catch (error) {
			if (!stopped) log.error("database integrity verifier failed", { error: String(error) });
		} finally {
			activeWorker = void 0;
			if (!stopped) schedule(OPENCLAW_DATABASE_VERIFY_INTERVAL_MS);
		}
	};
	schedule(OPENCLAW_DATABASE_VERIFY_INITIAL_DELAY_MS);
	return { stop: async () => {
		stopped = true;
		if (timer) {
			clearTimeout(timer);
			timer = void 0;
		}
		if (activeWorker) await terminateDatabaseVerifyWorker(activeWorker);
		activeWorker = void 0;
	} };
}
//#endregion
export { startOpenClawDatabaseIntegrityVerifier };
