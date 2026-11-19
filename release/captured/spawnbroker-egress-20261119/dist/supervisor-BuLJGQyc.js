import { F as resolveTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import "./src-vebZIeLe.js";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as sliceUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { n as signalProcessTree, r as signalPtySessionTree } from "./kill-tree-CR2oLt9D.js";
import "./errors-u9zSVTak.js";
import { t as runtimeProcessEntrypoints } from "./runtime-process-entrypoints-DEjFGor2.js";
import { n as resolveRuntimeWorkerUrl, t as resolveRuntimeWorkerArgv } from "./runtime-worker-url-DJUUt97T.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { a as resolveWindowsCommandShim, i as resolveTrustedWindowsCmdExe, n as isWindowsBatchCommand, t as buildWindowsCmdExeCommandLine } from "./windows-command-5_3nnUxV.js";
import { n as spawnWithFallback } from "./spawn-utils-DyaIzqd8.js";
import { t as prepareOomScoreAdjustedSpawn } from "./linux-oom-score-YCP0ajt5.js";
import { t as _usingCtx } from "./usingCtx-CTfBxUtw.js";
import { n as GRACEFUL_CANCEL_TIMEOUT_MS, t as encodeServiceChildMessage } from "./service-child-protocol-BVuC_Roy.js";
import { i as resolveWindowsExecutablePath, o as resolveWindowsSpawnProgramCandidate } from "./windows-spawn-BdbXNPtX.js";
import { t as onDecodedOutput } from "./decoded-output-CM2zo0aM.js";
import { t as prepareSecretInputStdio } from "./spawn-secret-input-dEdY_QJ6.js";
import { n as resolvePtyTerminalName, r as setPtyTerminalName, t as readPtyTerminalName } from "./pty-terminal-name-CCuR8Uei.js";
import { spawn } from "node:child_process";
import { spawnViaBroker } from "./v-spawn-broker.mjs"; // v-spawn-broker-v1
import crypto, { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
//#region src/process/supervisor/adapters/child-stdin.ts
/** Keep direct children and service relays on the same observable stdin lifecycle. */
function createManagedChildStdin(stream) {
	if (!stream) return;
	let ended = stream.writableEnded || stream.writableFinished;
	let destroyed = stream.destroyed;
	stream.once("finish", () => {
		ended = true;
	});
	stream.once("close", () => {
		ended = true;
		destroyed = true;
	});
	stream.once("error", () => {
		destroyed = true;
	});
	return {
		get destroyed() {
			return destroyed || stream.destroyed;
		},
		get writable() {
			return !destroyed && !ended && stream.writable;
		},
		get writableEnded() {
			return ended || stream.writableEnded;
		},
		get writableFinished() {
			return stream.writableFinished;
		},
		write(data, callback) {
			if (destroyed || ended || !stream.writable) {
				callback?.(/* @__PURE__ */ new Error("stdin is not writable"));
				return;
			}
			try {
				stream.write(data, callback);
			} catch (error) {
				callback?.(error instanceof Error ? error : new Error(String(error)));
			}
		},
		end() {
			ended = true;
			try {
				stream.end();
			} catch {}
		},
		destroy() {
			ended = true;
			destroyed = true;
			try {
				stream.destroy();
			} catch {}
		}
	};
}
//#endregion
//#region src/process/supervisor/adapters/env.ts
/** Convert Node's optional env values into the concrete string map spawn adapters expect. */
function toStringEnv(env) {
	if (!env) return {};
	const out = {};
	for (const [key, value] of Object.entries(env)) {
		if (value === void 0) continue;
		out[key] = value;
	}
	return out;
}
//#endregion
//#region src/process/supervisor/service-child-relay-host.ts
const retainedChildren = /* @__PURE__ */ new Map();
const PUSHED_OUTPUT_BUFFER_LIMIT_BYTES = 262144;
function readChildMessage(raw) {
	return raw;
}
function reserveStdioEntry(stdio, value) {
	let fd = 3;
	while (stdio[fd] !== void 0 && stdio[fd] !== "ignore") fd += 1;
	while (stdio.length <= fd) stdio.push("ignore");
	stdio[fd] = value;
	return fd;
}
function createOutputRelay(stream) {
	const listeners = /* @__PURE__ */ new Set();
	const rawListeners = /* @__PURE__ */ new Set();
	const pending = [];
	let pendingBytes = 0;
	let active = false;
	let ended = false;
	const deliver = (chunk) => {
		if (typeof chunk === "string") listeners.forEach((listener) => listener(chunk));
		else rawListeners.forEach((listener) => listener(chunk));
	};
	const activate = (keepOutput) => {
		if (active) return;
		active = true;
		if (keepOutput) pending.forEach(deliver);
		pending.length = 0;
		pendingBytes = 0;
		stream?.resume();
	};
	const push = (chunk) => {
		if (active) {
			deliver(chunk);
			return true;
		}
		const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
		if (!stream && pendingBytes + chunkBytes > PUSHED_OUTPUT_BUFFER_LIMIT_BYTES) return false;
		pending.push(chunk);
		if (!stream || Buffer.isBuffer(chunk)) pendingBytes += chunkBytes;
		if (stream && pendingBytes >= stream.readableHighWaterMark) stream.pause();
		return true;
	};
	const end = () => {
		ended = true;
	};
	if (stream) {
		onDecodedOutput(stream, push, push);
		stream.once("end", end);
		stream.once("close", end);
	}
	return {
		get ended() {
			return ended;
		},
		push,
		end,
		subscribe: (listener, onRaw) => {
			listeners.add(listener);
			if (onRaw) rawListeners.add(onRaw);
			activate(true);
		},
		drain: () => activate(false),
		clear: () => {
			listeners.clear();
			rawListeners.clear();
			pending.length = 0;
			pendingBytes = 0;
		}
	};
}
async function createServiceChildRelayAdapter(params) {
	try {
		var _usingCtx$2 = _usingCtx();
		const generation = randomUUID();
		const useWindowsJobAnchor = process.platform === "win32" && params.windowsShellCommand !== void 0;
		const workerUrl = resolveRuntimeWorkerUrl(useWindowsJobAnchor ? runtimeProcessEntrypoints.serviceChildWindowsJobAnchor : runtimeProcessEntrypoints.serviceChildRelay);
		const stdio = useWindowsJobAnchor ? [
			"ignore",
			"ignore",
			"ignore"
		] : [
			params.stdinMode === "inherit" ? "inherit" : "pipe",
			"pipe",
			"pipe"
		];
		const secretDelivery = _usingCtx$2.u(prepareSecretInputStdio(stdio, useWindowsJobAnchor ? void 0 : params.secretInput));
		const controlFd = useWindowsJobAnchor ? void 0 : reserveStdioEntry(stdio, "pipe");
		reserveStdioEntry(stdio, "ipc");
		// v-spawn-broker-v1: fork from a small helper, not from the Gateway
		const child = (useWindowsJobAnchor ? null : await spawnViaBroker(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			env: process.env
		})) ?? spawn(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			detached: useWindowsJobAnchor,
			windowsHide: true,
			env: process.env
		});
		retainedChildren.set(generation, child);
		child.unref();
		const control = controlFd === void 0 ? null : child.stdio[controlFd];
		if (!child.connected || !useWindowsJobAnchor && (!control || !child.stdout || !child.stderr)) {
			child.kill("SIGKILL");
			retainedChildren.delete(generation);
			throw new Error("service child lifecycle channels were not created");
		}
		const stdoutRelay = createOutputRelay(child.stdout ?? void 0);
		const stderrRelay = createOutputRelay(child.stderr ?? void 0);
		child.stdout?.on("error", () => {});
		child.stderr?.on("error", () => {});
		let state = "starting";
		let commandPid;
		let outboundSequence = 0;
		let inboundSequence = 0;
		let rootResult;
		let resultError;
		let closingReceipt = false;
		let controlError;
		let childError;
		let childDisconnected = false;
		let childExited = false;
		let requestedSignal;
		let waitError;
		const startup = createDeferredCore();
		const resultCompletion = createDeferredCore();
		const extinctionCompletion = createDeferredCore();
		resultCompletion.promise.catch(() => {});
		extinctionCompletion.promise.catch(() => {});
		let startupErrorAckDelivery;
		const settleWait = () => {
			const error = waitError ?? resultError;
			if (error) {
				resultCompletion.reject(error);
				return;
			}
			if (!rootResult || !stdoutRelay.ended || !stderrRelay.ended) return;
			if (requestedSignal && state !== "closed") return;
			resultCompletion.resolve(rootResult);
		};
		child.stdout?.once("end", settleWait);
		child.stdout?.once("close", settleWait);
		child.stderr?.once("end", settleWait);
		child.stderr?.once("close", settleWait);
		const loseIdentity = (message) => {
			if (state === "closed" || state === "identity-lost") return;
			state = "identity-lost";
			waitError = /* @__PURE__ */ new Error(`service child cleanup identity lost: ${message}`);
			if (!commandPid) startup.reject(waitError);
			settleWait();
			extinctionCompletion.reject(waitError);
		};
		const sendChildMessage = (message) => new Promise((resolve, reject) => {
			if (!child.connected) {
				reject(/* @__PURE__ */ new Error("service child lifecycle IPC is closed"));
				return;
			}
			child.send(message, (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
		const sendControlMessage = (message) => {
			if (useWindowsJobAnchor) return sendChildMessage(message);
			return new Promise((resolve, reject) => {
				if (!control || control.destroyed) {
					reject(/* @__PURE__ */ new Error("service child control pipe is closed"));
					return;
				}
				control.write(encodeServiceChildMessage(message), "utf8", (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		};
		const finishAuthorityClose = (missingReceiptError) => {
			if (!closingReceipt) {
				loseIdentity(missingReceiptError);
				return;
			}
			state = "closed";
			if (!rootResult && !resultError && !waitError) rootResult = {
				code: null,
				signal: requestedSignal ?? null
			};
			settleWait();
			extinctionCompletion.resolve();
		};
		const handleAnchorMessage = (message) => {
			if (message.generation !== generation || message.sequence <= inboundSequence) {
				loseIdentity("stale anchor generation or sequence");
				return;
			}
			inboundSequence = message.sequence;
			if (message.type === "ready" && state === "starting") {
				commandPid = message.commandPid;
				state = "active";
				startup.resolve();
			} else if (message.type === "root-result") {
				if (!resultError) rootResult ??= {
					code: message.code,
					signal: message.signal
				};
				settleWait();
			} else if (message.type === "result-error") {
				resultError ??= /* @__PURE__ */ new Error(`service child result unavailable: ${message.error}`);
				settleWait();
			} else if (message.type === "output") {
				if (!(message.stream === "stdout" ? stdoutRelay : stderrRelay).push(message.chunk)) {
					resultError ??= /* @__PURE__ */ new Error(`service child ${message.stream} exceeded its pre-subscription buffer`);
					settleWait();
				}
			} else if (message.type === "output-end") {
				(message.stream === "stdout" ? stdoutRelay : stderrRelay).end();
				settleWait();
			} else if (message.type === "closing") {
				closingReceipt = true;
				state = "closing";
			} else if (message.type === "startup-error") {
				if (useWindowsJobAnchor) startup.reject(new Error(message.error));
				else loseIdentity(message.error);
				outboundSequence += 1;
				startupErrorAckDelivery = sendControlMessage({
					type: "startup-error-ack",
					generation,
					sequence: outboundSequence
				});
				startupErrorAckDelivery.catch((error) => loseIdentity(toErrorObject(error, "startup error acknowledgement failed").message));
			}
		};
		if (control) {
			let pending = "";
			control.setEncoding("utf8");
			control.on("data", (chunk) => {
				pending += chunk;
				for (;;) {
					const newline = pending.indexOf("\n");
					if (newline < 0) break;
					const line = pending.slice(0, newline);
					pending = pending.slice(newline + 1);
					try {
						const message = readChildMessage(JSON.parse(line));
						if (!("sequence" in message)) throw new Error("invalid anchor message");
						handleAnchorMessage(message);
					} catch {
						loseIdentity("invalid anchor message");
					}
				}
			});
			control.once("close", () => {
				finishAuthorityClose(childError?.message ?? controlError?.message ?? "anchor channel closed without a matching closing receipt");
			});
			control.on("error", (error) => {
				controlError ??= error;
			});
		}
		child.on("message", (raw) => {
			const message = readChildMessage(raw);
			if (!message || typeof message !== "object") {
				if (useWindowsJobAnchor) loseIdentity("invalid anchor message");
				return;
			}
			if (useWindowsJobAnchor) {
				if (!("sequence" in message)) {
					loseIdentity("invalid anchor message");
					return;
				}
				handleAnchorMessage(message);
				return;
			}
			if (message.generation !== generation) return;
			if (message.type === "relay-error") loseIdentity(message.error);
		});
		child.once("error", (error) => {
			childError ??= error;
		});
		const finishWindowsAuthority = () => {
			if (!useWindowsJobAnchor || !childDisconnected || !childExited) return;
			finishAuthorityClose(childError?.message ?? "Windows service child anchor exited without a closing receipt");
			retainedChildren.delete(generation);
		};
		child.once("disconnect", () => {
			childDisconnected = true;
			finishWindowsAuthority();
		});
		child.once("exit", () => {
			childExited = true;
			if (useWindowsJobAnchor) finishWindowsAuthority();
			else retainedChildren.delete(generation);
		});
		const start = {
			type: "start",
			generation,
			command: params.command,
			args: params.args,
			argv0: params.argv0,
			cwd: params.cwd,
			env: params.env ? toStringEnv(params.env) : void 0,
			stdinMode: params.stdinMode,
			secretFd: params.secretInput?.fd,
			controlFd,
			windowsShellCommand: params.windowsShellCommand
		};
		try {
			await sendChildMessage(start);
		} catch (error) {
			child.kill("SIGKILL");
			retainedChildren.delete(generation);
			throw error;
		}
		const [startupResult, secretDeliveryResult] = await Promise.allSettled([startup.promise, secretDelivery?.deliverTo(child)]);
		const startupError = startupResult.status === "rejected" ? startupResult.reason : void 0;
		const secretDeliveryError = secretDeliveryResult.status === "rejected" ? secretDeliveryResult.reason : void 0;
		if (startupError !== void 0 || secretDeliveryError !== void 0) {
			if (useWindowsJobAnchor && startupError !== void 0) {
				await startupErrorAckDelivery;
				await extinctionCompletion.promise;
			} else {
				child.kill("SIGKILL");
				retainedChildren.delete(generation);
			}
			throw startupError ?? secretDeliveryError;
		}
		const stdin = createManagedChildStdin(child.stdin);
		if (params.input !== void 0) {
			stdin?.write(params.input);
			stdin?.end();
		} else if (params.stdinMode === "pipe-closed") stdin?.end();
		const kill = (signal = "SIGKILL") => {
			if (state !== "active") return;
			const normalized = signal === "SIGTERM" ? "SIGTERM" : "SIGKILL";
			requestedSignal = normalized;
			outboundSequence += 1;
			sendControlMessage({
				type: "cancel",
				generation,
				sequence: outboundSequence,
				signal: normalized
			}).catch((error) => {
				if (state === "active") loseIdentity(toErrorObject(error, "service child cancellation failed").message);
			});
		};
		return {
			pid: commandPid,
			stdin,
			oomScoreWrapperSelected: params.oomScoreWrapperSelected,
			supportsRawOutput: !useWindowsJobAnchor,
			onStdout: stdoutRelay.subscribe,
			onStderr: stderrRelay.subscribe,
			wait: async () => {
				stdoutRelay.drain();
				stderrRelay.drain();
				settleWait();
				return await resultCompletion.promise;
			},
			waitForExtinction: async () => await extinctionCompletion.promise,
			kill,
			dispose: () => {
				stdoutRelay.clear();
				stderrRelay.clear();
			}
		};
	} catch (_) {
		_usingCtx$2.e = _;
	} finally {
		_usingCtx$2.d();
	}
}
//#endregion
//#region src/process/supervisor/adapters/child.ts
const FORCE_KILL_WAIT_FALLBACK_MS$1 = 4e3;
const FORCED_WINDOWS_CLOSE_SETTLE_MS = 250;
const WINDOWS_PACKAGE_MANAGER_SHIMS = [
	"npm",
	"pnpm",
	"yarn",
	"npx"
];
function resolveChildInvocation(params) {
	const command = params.argv[0] ?? "";
	const candidate = resolveWindowsSpawnProgramCandidate({
		command,
		env: params.env,
		execPath: process.platform === "win32" ? resolveWindowsExecutablePath("node", params.env ?? process.env) : void 0
	});
	const args = [...candidate.leadingArgv, ...params.argv.slice(1)];
	const resolvedCommand = candidate.resolution === "direct" && candidate.command === command ? resolveWindowsCommandShim({
		command,
		cmdCommands: WINDOWS_PACKAGE_MANAGER_SHIMS
	}) : candidate.command;
	if (!isWindowsBatchCommand(resolvedCommand)) return {
		command: resolvedCommand,
		args,
		windowsVerbatimArguments: params.windowsVerbatimArguments
	};
	return {
		command: resolveTrustedWindowsCmdExe(),
		args: [
			"/d",
			"/s",
			"/c",
			buildWindowsCmdExeCommandLine(resolvedCommand, args)
		],
		windowsVerbatimArguments: true
	};
}
const WORKER_START_MESSAGE = { type: "openclaw-worker-start-v1" };
function isServiceManagedRuntime() {
	return Boolean(process.env.OPENCLAW_SERVICE_MARKER?.trim());
}
async function createChildAdapter(params) {
	try {
		var _usingCtx$1 = _usingCtx();
		if (params.anchoredShellCommand !== void 0) return await createServiceChildRelayAdapter({
			command: process.platform === "win32" ? params.anchoredShellCommand : "/bin/sh",
			args: process.platform === "win32" ? [] : ["-c", params.anchoredShellCommand],
			windowsShellCommand: process.platform === "win32" ? params.anchoredShellCommand : void 0,
			cwd: params.cwd,
			env: params.env,
			stdinMode: "pipe-closed",
			oomScoreWrapperSelected: false
		});
		const baseEnv = params.env ? toStringEnv(params.env) : void 0;
		const invocation = resolveChildInvocation({
			argv: params.argv,
			env: baseEnv,
			windowsVerbatimArguments: params.windowsVerbatimArguments
		});
		const argv0 = invocation.command === params.argv[0] ? params.argv0 : void 0;
		const preparedSpawn = params.exactEnv ? {
			command: invocation.command,
			args: invocation.args,
			argv0,
			env: baseEnv,
			wrapped: false
		} : prepareOomScoreAdjustedSpawn(invocation.command, invocation.args, {
			env: baseEnv,
			argv0
		});
		const stdinMode = params.stdinMode ?? (params.input !== void 0 ? "pipe-closed" : "inherit");
		if (process.platform !== "win32" && params.ownedWorker === void 0 && isServiceManagedRuntime()) return await createServiceChildRelayAdapter({
			command: preparedSpawn.command,
			args: preparedSpawn.args,
			argv0: preparedSpawn.argv0,
			cwd: params.cwd,
			env: preparedSpawn.env,
			stdinMode,
			input: params.input,
			secretInput: params.secretInput,
			oomScoreWrapperSelected: preparedSpawn.wrapped
		});
		const useDetached = process.platform !== "win32" && (params.ownedWorker !== void 0 || !isServiceManagedRuntime());
		const stdio = [
			stdinMode === "inherit" ? "inherit" : "pipe",
			"pipe",
			"pipe"
		];
		const secretDelivery = _usingCtx$1.u(prepareSecretInputStdio(stdio, params.secretInput));
		if (params.ownedWorker !== void 0) stdio.push("ipc");
		const options = {
			cwd: params.cwd,
			env: preparedSpawn.env,
			argv0: preparedSpawn.argv0,
			stdio,
			detached: useDetached,
			windowsHide: true,
			windowsVerbatimArguments: invocation.windowsVerbatimArguments
		};
		const spawned = await spawnWithFallback({
			argv: [preparedSpawn.command, ...preparedSpawn.args],
			options,
			fallbacks: useDetached && params.ownedWorker === void 0 ? [{
				label: "no-detach",
				options: { detached: false }
			}] : []
		});
		const child = spawned.child;
		if (params.ownedWorker !== void 0 && (!child.connected || !child.channel)) {
			spawned.child.kill("SIGKILL");
			throw new Error("worker lifecycle IPC channel was not created");
		}
		if (params.onWorkerMessage) child.on("message", (message) => {
			try {
				params.onWorkerMessage?.(message);
			} catch {}
		});
		const disconnectWorkerIpc = () => {
			if (!child.connected) return;
			try {
				child.disconnect();
			} catch (error) {
				if (error.code !== "ERR_IPC_DISCONNECTED") throw error;
			}
		};
		const ignoreOutputStreamError = () => {};
		child.stdout.on("error", ignoreOutputStreamError);
		child.stderr.on("error", ignoreOutputStreamError);
		const childStdin = spawned.child.stdin;
		const stdin = createManagedChildStdin(childStdin);
		if (params.input !== void 0) {
			childStdin?.write(params.input);
			stdin?.end();
		} else if (stdinMode === "pipe-closed") stdin?.end();
		const outputUnsubscribers = [];
		const onStdout = (listener, onRaw) => {
			outputUnsubscribers.push(onDecodedOutput(child.stdout, listener, onRaw));
		};
		const onStderr = (listener, onRaw) => {
			outputUnsubscribers.push(onDecodedOutput(child.stderr, listener, onRaw));
		};
		const completion = createDeferredCore();
		completion.promise.catch(() => {});
		let waitSettled = false;
		let forceKillWaitFallbackTimer = null;
		let forcedWindowsCloseTimer = null;
		let hardKillRequested = false;
		let windowsTreeKillCompleted = false;
		let childExitState = null;
		let childCloseState = null;
		let stdoutDrained = child.stdout == null;
		let stderrDrained = child.stderr == null;
		let workerIpcDisconnected = false;
		let openWorkerStdio = 0;
		const clearForceKillWaitFallback = () => {
			if (!forceKillWaitFallbackTimer) return;
			clearTimeout(forceKillWaitFallbackTimer);
			forceKillWaitFallbackTimer = null;
		};
		const clearForcedWindowsCloseTimer = () => {
			if (!forcedWindowsCloseTimer) return;
			clearTimeout(forcedWindowsCloseTimer);
			forcedWindowsCloseTimer = null;
		};
		const settleWait = (value) => {
			if (waitSettled) return;
			waitSettled = true;
			clearForceKillWaitFallback();
			clearForcedWindowsCloseTimer();
			completion.resolve(value);
		};
		const rejectPendingWait = (error) => {
			if (waitSettled) return;
			waitSettled = true;
			clearForceKillWaitFallback();
			clearForcedWindowsCloseTimer();
			completion.reject(error);
		};
		const scheduleForceKillWaitFallback = (signal) => {
			clearForceKillWaitFallback();
			forceKillWaitFallbackTimer = setTimeout(() => {
				settleWait({
					code: null,
					signal
				});
			}, FORCE_KILL_WAIT_FALLBACK_MS$1);
			forceKillWaitFallbackTimer.unref?.();
		};
		const resolveObservedExitState = (fallback) => {
			if (childExitState != null) return childExitState;
			return {
				code: child.exitCode ?? fallback.code,
				signal: child.signalCode ?? fallback.signal
			};
		};
		const scheduleForcedWindowsCloseSettlement = () => {
			if (process.platform !== "win32" || !hardKillRequested || !windowsTreeKillCompleted || childExitState == null || forcedWindowsCloseTimer) return;
			const exitState = childExitState;
			forcedWindowsCloseTimer = setTimeout(() => {
				child.stdout?.destroy();
				child.stderr?.destroy();
				settleWait(resolveObservedExitState(exitState));
			}, FORCED_WINDOWS_CLOSE_SETTLE_MS);
			forcedWindowsCloseTimer.unref?.();
		};
		const isWindowsHardKillSettlementBlocked = () => process.platform === "win32" && hardKillRequested && !windowsTreeKillCompleted;
		const maybeSettleAfterExit = () => {
			if (process.platform !== "win32" && (!workerIpcDisconnected || openWorkerStdio > 0) || isWindowsHardKillSettlementBlocked() || childExitState == null || !stdoutDrained || !stderrDrained) return;
			settleWait(resolveObservedExitState(childExitState));
		};
		if (params.ownedWorker) {
			child.once("disconnect", () => {
				workerIpcDisconnected = true;
				maybeSettleAfterExit();
			});
			for (const stream of child.stdio.slice(1)) {
				if (!stream || stream.closed) continue;
				openWorkerStdio += 1;
				stream.once("close", () => {
					openWorkerStdio -= 1;
					maybeSettleAfterExit();
				});
			}
		}
		child.stdout?.once("end", () => {
			stdoutDrained = true;
			maybeSettleAfterExit();
		});
		child.stdout?.once("close", () => {
			stdoutDrained = true;
			maybeSettleAfterExit();
		});
		child.stderr?.once("end", () => {
			stderrDrained = true;
			maybeSettleAfterExit();
		});
		child.stderr?.once("close", () => {
			stderrDrained = true;
			maybeSettleAfterExit();
		});
		child.on("error", params.ownedWorker ? rejectPendingWait : () => {});
		child.once("exit", (code, signal) => {
			childExitState = {
				code,
				signal
			};
			scheduleForcedWindowsCloseSettlement();
			maybeSettleAfterExit();
		});
		child.once("close", (code, signal) => {
			childCloseState = {
				code,
				signal
			};
			childExitState ??= childCloseState;
			if (isWindowsHardKillSettlementBlocked()) return;
			settleWait(resolveObservedExitState(childCloseState));
		});
		if (params.secretInput) try {
			await secretDelivery?.deliverTo(spawned.child);
		} catch (error) {
			spawned.child.kill("SIGKILL");
			throw error;
		}
		const wait = async () => await completion.promise;
		const childIsDetached = useDetached && !spawned.usedFallback;
		const signalProcessTreeForChild = (pid, signal) => {
			signalProcessTree(pid, signal, { detached: childIsDetached });
		};
		const signalProcessTreeForChildAndWait = (pid, signal) => new Promise((resolve) => {
			signalProcessTree(pid, signal, {
				detached: childIsDetached,
				onComplete: resolve
			});
		});
		const kill = (signal) => {
			const pid = child.pid ?? void 0;
			if (signal === void 0 || signal === "SIGKILL") {
				hardKillRequested = true;
				scheduleForcedWindowsCloseSettlement();
				if (pid) signalProcessTreeForChildAndWait(pid, "SIGKILL").then(() => {
					try {
						child.kill("SIGKILL");
					} catch {}
					windowsTreeKillCompleted = true;
					if (childCloseState) {
						settleWait(resolveObservedExitState(childCloseState));
						return;
					}
					maybeSettleAfterExit();
					scheduleForcedWindowsCloseSettlement();
				});
				else {
					windowsTreeKillCompleted = true;
					try {
						child.kill("SIGKILL");
					} catch {}
				}
				scheduleForceKillWaitFallback("SIGKILL");
				return;
			}
			if (signal === "SIGTERM" && pid) {
				signalProcessTreeForChild(pid, "SIGTERM");
				return;
			}
			try {
				child.kill(signal);
			} catch {}
		};
		const dispose = () => {
			clearForceKillWaitFallback();
			clearForcedWindowsCloseTimer();
			if (params.ownedWorker !== void 0) disconnectWorkerIpc();
			for (const unsubscribe of outputUnsubscribers.splice(0)) unsubscribe();
			child.stdout.destroy();
			child.stderr.destroy();
			child.removeAllListeners();
		};
		const closeStartGate = params.ownedWorker ? disconnectWorkerIpc : void 0;
		let startGateOpened = false;
		const openStartGate = params.ownedWorker ? async () => {
			if (startGateOpened) return;
			startGateOpened = true;
			await new Promise((resolve, reject) => {
				if (!child.connected) {
					reject(/* @__PURE__ */ new Error("worker lifecycle IPC channel closed before startup"));
					return;
				}
				try {
					child.send(WORKER_START_MESSAGE, (error) => {
						if (error) {
							reject(error);
							return;
						}
						resolve();
					});
				} catch (error) {
					reject(toErrorObject(error, "worker lifecycle IPC send failed"));
				}
			});
		} : void 0;
		return {
			pid: child.pid ?? void 0,
			stdin,
			oomScoreWrapperSelected: preparedSpawn.wrapped,
			supportsRawOutput: true,
			onStdout,
			onStderr,
			wait,
			kill,
			dispose,
			closeStartGate,
			openStartGate
		};
	} catch (_) {
		_usingCtx$1.e = _;
	} finally {
		_usingCtx$1.d();
	}
}
//#endregion
//#region src/process/supervisor/adapters/pty.ts
const FORCE_KILL_WAIT_FALLBACK_MS = 4e3;
async function createPtyAdapter(params) {
	if (typeof WORKER_DEPLOY_BUILD === "boolean" && WORKER_DEPLOY_BUILD) throw new Error("PTY is unavailable in the portable worker runtime");
	const { spawn } = await import("@lydell/node-pty");
	const baseEnv = params.env ? toStringEnv(params.env) : void 0;
	const preparedSpawn = prepareOomScoreAdjustedSpawn(params.shell, params.args, { env: baseEnv });
	const terminalName = resolvePtyTerminalName(params.name ?? readPtyTerminalName(preparedSpawn.env, process.platform) ?? readPtyTerminalName(process.env, process.platform));
	const spawnEnv = preparedSpawn.env ? toStringEnv(preparedSpawn.env) : process.platform === "win32" ? toStringEnv(process.env) : void 0;
	if (spawnEnv) setPtyTerminalName({
		env: spawnEnv,
		name: terminalName,
		platform: process.platform
	});
	const pty = spawn(preparedSpawn.command, preparedSpawn.args, {
		cwd: params.cwd,
		env: spawnEnv,
		name: terminalName,
		cols: params.cols ?? 120,
		rows: params.rows ?? 30
	});
	let dataListener = null;
	let exitListener = null;
	const completion = createDeferredCore();
	let waitSettled = false;
	let forceKillWaitFallbackTimer = null;
	let stdinDestroyed = false;
	let stdinEnded = false;
	const clearForceKillWaitFallback = () => {
		if (!forceKillWaitFallbackTimer) return;
		clearTimeout(forceKillWaitFallbackTimer);
		forceKillWaitFallbackTimer = null;
	};
	const settleWait = (value) => {
		if (waitSettled) return;
		waitSettled = true;
		clearForceKillWaitFallback();
		stdinDestroyed = true;
		stdinEnded = true;
		completion.resolve(value);
	};
	const scheduleForceKillWaitFallback = (signal) => {
		clearForceKillWaitFallback();
		forceKillWaitFallbackTimer = setTimeout(() => {
			settleWait({
				code: null,
				signal
			});
		}, FORCE_KILL_WAIT_FALLBACK_MS);
		forceKillWaitFallbackTimer.unref();
	};
	exitListener = pty.onExit((event) => {
		const signal = event.signal && event.signal !== 0 ? event.signal : null;
		settleWait({
			code: event.exitCode ?? null,
			signal
		});
	});
	const stdin = {
		get destroyed() {
			return stdinDestroyed;
		},
		get writable() {
			return !stdinDestroyed && !stdinEnded;
		},
		get writableEnded() {
			return stdinEnded;
		},
		get writableFinished() {
			return stdinEnded;
		},
		write: (data, cb) => {
			try {
				pty.write(data);
				cb?.(null);
			} catch (err) {
				cb?.(err);
			}
		},
		end: () => {
			try {
				stdinEnded = true;
				const eof = process.platform === "win32" ? "" : "";
				pty.write(eof);
			} catch {}
		},
		destroy: () => {
			stdinDestroyed = true;
			stdinEnded = true;
		}
	};
	const onStdout = (listener) => {
		dataListener = pty.onData((chunk) => {
			listener(chunk);
		});
	};
	const onStderr = (_listener) => {};
	const wait = async () => await completion.promise;
	const kill = (signal = "SIGKILL") => {
		try {
			if ((signal === "SIGKILL" || signal === "SIGTERM") && typeof pty.pid === "number" && pty.pid > 0) signalPtySessionTree(pty.pid, signal);
			else if (process.platform === "win32") pty.kill();
			else pty.kill(signal);
		} catch {}
		if (signal === "SIGKILL") scheduleForceKillWaitFallback(signal);
	};
	const dispose = () => {
		stdinDestroyed = true;
		stdinEnded = true;
		try {
			dataListener?.dispose();
		} catch {}
		try {
			exitListener?.dispose();
		} catch {}
		clearForceKillWaitFallback();
		dataListener = null;
		exitListener = null;
		settleWait({
			code: null,
			signal: null
		});
	};
	return {
		pid: pty.pid || void 0,
		stdin,
		oomScoreWrapperSelected: preparedSpawn.wrapped,
		supportsRawOutput: false,
		onStdout,
		onStderr,
		wait,
		kill,
		dispose
	};
}
//#endregion
//#region src/process/supervisor/registry.ts
const DEFAULT_MAX_EXITED_RECORDS = 2e3;
function resolveMaxExitedRecords(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return DEFAULT_MAX_EXITED_RECORDS;
	return Math.max(1, Math.floor(value));
}
/**
* Create the supervisor's mutable run registry. Exited records are retained
* only for diagnostics, so the cap bounds memory without touching live runs.
*/
function createRunRegistry(options) {
	const records = /* @__PURE__ */ new Map();
	const maxExitedRecords = resolveMaxExitedRecords(options?.maxExitedRecords);
	let exitedRecords = 0;
	const pruneExitedRecords = () => {
		if (exitedRecords <= maxExitedRecords) return;
		for (const [runId, record] of records.entries()) {
			if (exitedRecords <= maxExitedRecords) break;
			if (record.state !== "exited") continue;
			records.delete(runId);
			exitedRecords -= 1;
		}
	};
	const add = (record) => {
		if (records.get(record.runId)?.state === "exited") exitedRecords -= 1;
		const current = { ...record };
		records.set(current.runId, current);
		if (current.state === "exited") exitedRecords += 1;
		const update = (patch) => {
			if (records.get(current.runId) !== current) return false;
			const state = patch.state ?? current.state;
			if (current.state !== "exited" && state === "exited") exitedRecords += 1;
			else if (current.state === "exited" && state !== "exited") exitedRecords -= 1;
			Object.assign(current, patch, { updatedAtMs: patch.lastOutputAtMs ?? Date.now() });
			return true;
		};
		return {
			updateState: (state, patch) => {
				update({
					...patch,
					state
				});
			},
			touchOutput: () => {
				update({ lastOutputAtMs: Date.now() });
			},
			finalize: (exit) => {
				if (current.state === "exited") return;
				if (update({
					state: "exited",
					terminationReason: current.terminationReason ?? exit.reason,
					exitCode: exit.exitCode,
					exitSignal: exit.exitSignal
				})) pruneExitedRecords();
			}
		};
	};
	const get = (runId) => {
		const record = records.get(runId);
		return record ? { ...record } : void 0;
	};
	return {
		add,
		get
	};
}
//#endregion
//#region src/process/supervisor/supervisor.ts
const DEFAULT_MAX_CAPTURED_OUTPUT_CHARS = 1048576;
const loadSupervisorLogRuntime = createLazyRuntimeModule(() => import("./supervisor-log.runtime.js"));
function normalizeTimeoutDuration(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
	return Math.max(1, Math.floor(value));
}
function clampCapturedOutputChars(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_MAX_CAPTURED_OUTPUT_CHARS;
	return Math.max(256, Math.floor(value));
}
function appendCapturedOutput(current, chunk, stream, maxChars) {
	const next = current + chunk;
	if (next.length <= maxChars) return next;
	const marker = `[openclaw: captured ${stream} truncated to last ${maxChars} chars]\n`;
	const tailChars = Math.max(0, maxChars - marker.length);
	return `${marker}${sliceUtf16Safe(next, -tailChars)}`;
}
function isTimeoutReason(reason) {
	return reason === "overall-timeout" || reason === "no-output-timeout";
}
function resolveElapsedTimeoutReason(params) {
	if (params.overallTimeoutDeadlineMs !== null && params.nowMs >= params.overallTimeoutDeadlineMs && (params.noOutputTimeoutDeadlineMs === null || params.nowMs < params.noOutputTimeoutDeadlineMs || params.overallTimeoutDeadlineMs <= params.noOutputTimeoutDeadlineMs)) return "overall-timeout";
	return params.noOutputTimeoutDeadlineMs !== null && params.nowMs >= params.noOutputTimeoutDeadlineMs ? "no-output-timeout" : null;
}
function createProcessSupervisor() {
	const registry = createRunRegistry();
	const ownedRuns = /* @__PURE__ */ new Set();
	const startingScopes = /* @__PURE__ */ new Map();
	let shuttingDown = false;
	let shutdownPromise = null;
	const cancelOwner = (current, reason) => {
		if (current.cancel) {
			current.cancel(reason);
			return;
		}
		current.terminationReason ??= reason;
	};
	const cancel = (runId, reason = "manual-cancel") => {
		for (const current of ownedRuns) if (current.runId === runId) cancelOwner(current, reason);
	};
	const cancelActiveScope = (scopeKey, reason) => {
		for (const current of ownedRuns) if (current.waitForExtinction && current.scopeKey === scopeKey) cancelOwner(current, reason);
	};
	const cancelScope = (scopeKey, reason = "manual-cancel") => {
		if (!scopeKey.trim()) return;
		for (const current of ownedRuns) if (current.scopeKey === scopeKey) cancelOwner(current, reason);
	};
	const waitForRuns = async (scopeKey, ignoreStartupFailures = false) => {
		let firstFailure;
		while (true) {
			const selected = Array.from(ownedRuns).filter((current) => scopeKey === null || current.scopeKey === scopeKey);
			const starts = selected.flatMap((current) => current.pending ? [current.pending] : []);
			const owned = selected.flatMap((current) => current.waitForExtinction ? [current.waitForExtinction()] : []);
			if (starts.length === 0 && owned.length === 0) {
				if (firstFailure) throw firstFailure.reason;
				return;
			}
			const results = await Promise.allSettled([...owned, ...starts]);
			firstFailure ??= results.slice(0, ignoreStartupFailures ? owned.length : void 0).find((result) => result.status === "rejected");
		}
	};
	const waitForScope = (scopeKey) => waitForRuns(scopeKey);
	const startRun = async (input, owner) => {
		const { runId, scopeKey } = owner;
		const startedAtMs = Date.now();
		const startingTerminationReason = owner.terminationReason;
		const registration = registry.add({
			runId,
			sessionId: input.sessionId,
			backendId: input.backendId,
			scopeKey,
			state: startingTerminationReason ? "exiting" : "starting",
			...startingTerminationReason ? { terminationReason: startingTerminationReason } : {},
			startedAtMs,
			lastOutputAtMs: startedAtMs,
			createdAtMs: startedAtMs,
			updatedAtMs: startedAtMs
		});
		if (startingTerminationReason) {
			const exit = {
				reason: startingTerminationReason,
				exitCode: null,
				exitSignal: null,
				durationMs: Date.now() - startedAtMs,
				stdout: "",
				stderr: "",
				timedOut: isTimeoutReason(startingTerminationReason),
				noOutputTimedOut: startingTerminationReason === "no-output-timeout"
			};
			registration.finalize(exit);
			return {
				runId,
				startedAtMs,
				wait: async () => exit,
				cancel: () => void 0
			};
		}
		if (input.replaceExistingScope && scopeKey) cancelActiveScope(scopeKey, "manual-cancel");
		let forcedReason = owner.terminationReason ?? null;
		let resultSettled = false;
		let ownershipExtinct = false;
		const captured = {
			stdout: "",
			stderr: ""
		};
		let outputDetached = false;
		const detachOutput = () => {
			outputDetached = true;
		};
		let forceKillTimer = null;
		let cancelRequested = false;
		const captureOutput = input.captureOutput !== false;
		const maxCapturedOutputChars = clampCapturedOutputChars(input.maxCapturedOutputChars);
		const setForcedReason = (reason) => {
			if (forcedReason || resultSettled) return;
			forcedReason = reason;
			registration.updateState("exiting", { terminationReason: reason });
		};
		let cancelAdapter = null;
		const requestCancel = (reason) => {
			setForcedReason(reason);
			cancelAdapter?.(reason);
		};
		owner.cancel = requestCancel;
		const createDeadline = (reason, value) => {
			const durationMs = normalizeTimeoutDuration(value);
			let deadlineMs = null;
			let timer;
			const schedule = (remainingMs, deadline) => {
				const intervalMs = resolveTimerTimeoutMs(remainingMs, 1);
				timer = setTimeout(() => {
					if (resultSettled) return;
					const remaining = Math.min(remainingMs - intervalMs, deadline - performance.now());
					if (remaining <= 0) requestCancel(reason);
					else schedule(remaining, deadline);
				}, intervalMs);
			};
			return {
				get deadlineMs() {
					return deadlineMs;
				},
				reset: () => {
					if (!durationMs || resultSettled) return;
					clearTimeout(timer);
					deadlineMs = performance.now() + durationMs;
					schedule(durationMs, deadlineMs);
				},
				clear: () => clearTimeout(timer)
			};
		};
		const overallDeadline = createDeadline("overall-timeout", input.timeoutMs);
		const outputDeadline = createDeadline("no-output-timeout", input.noOutputTimeoutMs);
		const touchOutput = () => {
			registration.touchOutput();
			outputDeadline.reset();
		};
		try {
			if (input.mode !== "anchored-shell" && input.argv.length === 0) throw new Error("spawn argv cannot be empty");
			const adapter = input.mode === "pty" ? await createPtyAdapter({
				shell: expectDefined(input.argv[0], "spawn executable"),
				args: input.argv.slice(1),
				cwd: input.cwd,
				env: input.env
			}) : input.mode === "anchored-shell" ? await createChildAdapter({
				anchoredShellCommand: input.command,
				cwd: input.cwd,
				env: input.env
			}) : await createChildAdapter({
				argv: input.argv,
				argv0: input.argv0,
				cwd: input.cwd,
				env: input.env,
				exactEnv: input.exactEnv,
				windowsVerbatimArguments: input.windowsVerbatimArguments,
				input: input.input,
				stdinMode: input.stdinMode,
				secretInput: input.secretInput
			});
			registration.updateState(forcedReason ? "exiting" : "running", {
				pid: adapter.pid,
				...forcedReason ? { terminationReason: forcedReason } : {}
			});
			const releaseOwnership = () => {
				if (ownershipExtinct) return;
				ownershipExtinct = true;
				if (forceKillTimer) {
					clearTimeout(forceKillTimer);
					forceKillTimer = null;
				}
				ownedRuns.delete(owner);
				if (resultSettled) adapter.dispose();
			};
			const settleResult = () => {
				resultSettled = true;
				overallDeadline.clear();
				outputDeadline.clear();
				detachOutput();
				if (ownershipExtinct) adapter.dispose();
				else if (!adapter.waitForExtinction) releaseOwnership();
			};
			cancelAdapter = (reason) => {
				if (ownershipExtinct || cancelRequested && !(resultSettled && forceKillTimer)) return;
				cancelRequested = true;
				if (resultSettled) {
					if (forceKillTimer) {
						clearTimeout(forceKillTimer);
						forceKillTimer = null;
					}
					adapter.kill("SIGKILL");
					return;
				}
				if (process.platform === "win32" && (reason === "overall-timeout" || reason === "no-output-timeout")) {
					adapter.kill("SIGKILL");
					return;
				}
				adapter.kill("SIGTERM");
				forceKillTimer = setTimeout(() => {
					if (!ownershipExtinct) adapter.kill("SIGKILL");
				}, GRACEFUL_CANCEL_TIMEOUT_MS);
				forceKillTimer.unref?.();
			};
			overallDeadline.reset();
			outputDeadline.reset();
			const withOutputFence = (deliver, recordsOutput = true) => (chunk) => {
				if (outputDetached) return;
				if (recordsOutput) touchOutput();
				deliver?.(chunk);
			};
			const rawInput = input.mode === "child" ? input : void 0;
			for (const [stream, subscribe, onText, onRaw] of [[
				"stdout",
				adapter.onStdout,
				input.onStdout,
				rawInput?.onStdoutRaw
			], [
				"stderr",
				adapter.onStderr,
				input.onStderr,
				rawInput?.onStderrRaw
			]]) subscribe(withOutputFence((chunk) => {
				if (captureOutput) captured[stream] = appendCapturedOutput(captured[stream], chunk, stream, maxCapturedOutputChars);
				onText?.(chunk);
			}, !adapter.supportsRawOutput), withOutputFence(onRaw));
			const waitPromise = (async () => {
				const result = await adapter.wait();
				const deadlineReason = resolveElapsedTimeoutReason({
					nowMs: performance.now(),
					overallTimeoutDeadlineMs: overallDeadline.deadlineMs,
					noOutputTimeoutDeadlineMs: outputDeadline.deadlineMs
				});
				const terminalReason = forcedReason ?? deadlineReason;
				settleResult();
				const reason = terminalReason ?? (result.signal != null ? "signal" : "exit");
				const exit = {
					reason,
					exitCode: result.code,
					exitSignal: result.signal,
					oomScoreWrapperSelected: adapter.oomScoreWrapperSelected === true,
					durationMs: Date.now() - startedAtMs,
					...captured,
					timedOut: isTimeoutReason(reason),
					noOutputTimedOut: terminalReason === "no-output-timeout"
				};
				registration.finalize(exit);
				return exit;
			})().catch((err) => {
				if (!resultSettled) {
					settleResult();
					registration.finalize({
						reason: "spawn-error",
						exitCode: null,
						exitSignal: null
					});
				}
				throw err;
			});
			const extinctionPromise = adapter.waitForExtinction ? adapter.waitForExtinction().finally(releaseOwnership) : waitPromise.then(() => void 0);
			extinctionPromise.catch(() => void 0);
			const managedRun = {
				runId,
				pid: adapter.pid,
				startedAtMs,
				stdin: adapter.stdin,
				wait: async () => await waitPromise,
				...adapter.waitForExtinction && { waitForExtinction: () => extinctionPromise },
				cancel: (reason = "manual-cancel") => {
					requestCancel(reason);
				},
				detachOutput
			};
			owner.waitForExtinction = async () => await extinctionPromise;
			if (forcedReason) managedRun.cancel(forcedReason);
			return managedRun;
		} catch (err) {
			registration.finalize({
				reason: "spawn-error",
				exitCode: null,
				exitSignal: null
			});
			const { warnProcessSupervisorSpawnFailure } = await loadSupervisorLogRuntime();
			warnProcessSupervisorSpawnFailure(`spawn failed: runId=${runId} reason=${String(err)}`);
			throw err;
		}
	};
	const spawn = (input) => {
		if (shuttingDown) return Promise.reject(/* @__PURE__ */ new Error("process supervisor is shut down"));
		const scopeKey = normalizeOptionalString(input.scopeKey);
		const owner = {
			runId: normalizeOptionalString(input.runId) ?? crypto.randomUUID(),
			scopeKey
		};
		ownedRuns.add(owner);
		const starting = scopeKey ? startingScopes.get(scopeKey) ?? { runs: /* @__PURE__ */ new Set() } : void 0;
		if (scopeKey && starting) startingScopes.set(scopeKey, starting);
		const previous = starting ? input.replaceExistingScope ? Array.from(starting.runs) : starting.replacement ? [starting.replacement] : [] : [];
		const pending = previous.length > 0 ? Promise.allSettled(previous).then(() => startRun(input, owner)) : startRun(input, owner);
		owner.pending = pending;
		starting?.runs.add(pending);
		if (starting && input.replaceExistingScope) starting.replacement = pending;
		const clearPendingStart = () => {
			delete owner.pending;
			if (!owner.waitForExtinction) ownedRuns.delete(owner);
			starting?.runs.delete(pending);
			if (starting?.replacement === pending) delete starting.replacement;
			if (scopeKey && starting?.runs.size === 0 && startingScopes.get(scopeKey) === starting) startingScopes.delete(scopeKey);
		};
		pending.then(clearPendingStart, clearPendingStart);
		return pending;
	};
	const shutdown = () => {
		shuttingDown = true;
		return shutdownPromise ??= Promise.resolve().then(async () => {
			while (ownedRuns.size) {
				for (const owner of ownedRuns) cancelOwner(owner, "manual-cancel");
				await waitForRuns(null, true);
			}
		});
	};
	return {
		spawn,
		cancel,
		cancelScope,
		shutdown,
		waitForScope,
		getRecord: (runId) => registry.get(runId)
	};
}
//#endregion
//#region src/process/supervisor/index.ts
const holder = resolveGlobalSingleton(Symbol.for("openclaw.processSupervisorHolder"), () => ({ current: null }), async (value) => {
	const supervisor = value.current;
	await supervisor?.shutdown();
	if (value.current === supervisor) value.current = null;
});
/** Return the process-wide supervisor used by runtime code that does not inject one. */
function getProcessSupervisor() {
	if (holder.current) return holder.current;
	holder.current = createProcessSupervisor();
	return holder.current;
}
//#endregion
export { createChildAdapter as n, getProcessSupervisor as t };
