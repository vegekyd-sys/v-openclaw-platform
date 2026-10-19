import { n as normalizeCodexAppServerArgs } from "./launch-args-RXQwn8zV.js";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { materializeWindowsSpawnProgram, resolveWindowsSpawnProgram } from "openclaw/plugin-sdk/windows-spawn";
import { z } from "zod";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import { finished } from "node:stream/promises";
//#region extensions/codex/src/app-server/transport-process-snapshot.ts
const PROCESS_COLUMNS = "pid=,ppid=,pgid=,stat=,lstart=";
const MAX_PROCESS_CONTAINMENT_MS$1 = 2e3;
const PROCESS_INSPECTION_MAX_BYTES = 8388608;
var ProcessInspectionError = class extends Error {
	constructor(reason) {
		const detail = {
			deadline: "Process inspection exceeded its deadline. Retry when the host is responsive.",
			permission: "Check process inspection permissions (/proc on Linux, ps on macOS), then retry.",
			unavailable: "Process identity is unavailable or invalid. Check /proc on Linux or ps on macOS, then retry."
		}[reason];
		super(`Cannot inspect Codex processes. ${detail}`);
		this.reason = reason;
		this.name = "ProcessInspectionError";
	}
};
function inspectionFailure(error) {
	if (error instanceof ProcessInspectionError) return error;
	const code = error && typeof error === "object" && "code" in error ? error.code : void 0;
	return new ProcessInspectionError(code === "ABORT_ERR" ? "deadline" : code === "EACCES" || code === "EPERM" || code === "ERR_ACCESS_DENIED" ? "permission" : "unavailable");
}
async function readCodexAppServerProcessSnapshot(deadline = Date.now() + MAX_PROCESS_CONTAINMENT_MS$1, pids) {
	const selected = pids === void 0 ? void 0 : [.../* @__PURE__ */ new Set([process.pid, ...pids])];
	const rows = process.platform === "linux" ? await readLinuxProcesses(selected, deadline) : await readProcesses(selected ? [
		"-o",
		PROCESS_COLUMNS,
		"-p",
		selected.join(",")
	] : ["-axo", PROCESS_COLUMNS], deadline, selected !== void 0);
	if (selected && !rows.some((row) => row.pid === process.pid)) throw new ProcessInspectionError("unavailable");
	return rows;
}
async function readCodexAppServerProcess(pid, deadline) {
	return (process.platform === "linux" ? await readLinuxProcesses([pid], deadline) : await readProcesses([
		"-o",
		PROCESS_COLUMNS,
		"-p",
		String(pid)
	], deadline)).find((row) => row.pid === pid);
}
async function readCodexAppServerProcessCommand(observed, deadline) {
	let output;
	if (process.platform === "linux") {
		let pending = false;
		do {
			const remainingMs = deadline - Date.now();
			if (remainingMs <= 0) throw new ProcessInspectionError("deadline");
			let command;
			try {
				command = await readFile(`/proc/${observed.pid}/cmdline`, {
					encoding: "utf8",
					signal: AbortSignal.timeout(remainingMs)
				});
			} catch (error) {
				throw inspectionFailure(error);
			}
			if (!command || pending) {
				const current = await readCodexAppServerProcess(observed.pid, deadline);
				if (!current || current.startedAt !== observed.startedAt || current.ppid !== observed.ppid || current.pgid !== observed.pgid || current.state.startsWith("Z")) throw new ProcessInspectionError("unavailable");
			}
			output = command.split("\0").join(" ").trim();
			pending = command.length === 0;
			if (pending) await setImmediate();
		} while (pending);
	} else output = (await readProcessOutput([
		"-o",
		"command=",
		"-p",
		String(observed.pid)
	], deadline)).split("\n")[0]?.trim() ?? "";
	if (Date.now() >= deadline) throw new ProcessInspectionError("deadline");
	if (!output) throw new ProcessInspectionError("unavailable");
	return output;
}
async function readProcesses(args, deadline, selected = false) {
	return parseProcesses(await readProcessOutput(args, deadline), selected);
}
async function readProcessOutput(args, deadline) {
	const remainingMs = deadline - Date.now();
	if (remainingMs <= 0) throw new ProcessInspectionError("deadline");
	return await new Promise((resolve, reject) => {
		let settled = false;
		const settle = (output) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (output instanceof ProcessInspectionError) reject(output);
			else resolve(output);
		};
		const inspector = execFile("ps", args, {
			encoding: "utf8",
			maxBuffer: PROCESS_INSPECTION_MAX_BYTES,
			env: {
				...process.env,
				LC_ALL: "C",
				TZ: "UTC"
			}
		}, (error, stdout) => {
			settle(Date.now() >= deadline ? new ProcessInspectionError("deadline") : error ? inspectionFailure(error) : stdout);
		});
		const timer = setTimeout(() => {
			settle(new ProcessInspectionError("deadline"));
			inspector.stdout?.destroy();
			inspector.stderr?.destroy();
			inspector.kill("SIGKILL");
			inspector.unref();
		}, Math.max(1, remainingMs));
		timer.unref?.();
	}).catch((error) => {
		throw inspectionFailure(error);
	});
}
function parseProcesses(output, selected) {
	const rows = [];
	for (const line of output.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
		if (!match) {
			if (selected && line.trim()) throw new ProcessInspectionError("unavailable");
			continue;
		}
		const pid = Number(match[1] ?? "");
		const ppid = Number(match[2] ?? "");
		const pgid = Number(match[3] ?? "");
		const startedAt = (match[5] ?? "").trim().replace(/\s+/g, " ");
		if (![
			pid,
			ppid,
			pgid
		].every(Number.isSafeInteger) || pid <= 0 || ppid < 0 || pgid <= 0 || !startedAt) {
			if (selected) throw new ProcessInspectionError("unavailable");
			continue;
		}
		rows.push({
			pid,
			ppid,
			pgid,
			state: match[4] ?? "",
			startedAt
		});
	}
	return rows;
}
async function readLinuxProcesses(selected, deadline) {
	const remainingMs = deadline - Date.now();
	if (remainingMs <= 0) throw new ProcessInspectionError("deadline");
	const options = {
		encoding: "utf8",
		signal: AbortSignal.timeout(remainingMs)
	};
	try {
		const bootId = (await readFile("/proc/sys/kernel/random/boot_id", options)).trim();
		if (!/^[a-f0-9-]{36}$/.test(bootId)) throw new ProcessInspectionError("unavailable");
		const pids = selected === void 0 ? await readdir("/proc") : selected.map(String);
		const rows = [];
		let bytes = 0;
		for (const entry of pids) {
			if (!/^\d+$/.test(entry)) continue;
			if (Date.now() >= deadline) throw new ProcessInspectionError("deadline");
			const stat = await readFile(`/proc/${entry}/stat`, options).catch((error) => {
				if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ESRCH")) return;
				throw error;
			});
			if (stat === void 0) continue;
			bytes += stat.length;
			if (bytes > PROCESS_INSPECTION_MAX_BYTES) throw new ProcessInspectionError("unavailable");
			const commEnd = stat.lastIndexOf(")");
			const fields = stat.slice(commEnd + 1).trim().split(/\s+/);
			const ppid = Number(fields[1]);
			const pgid = Number(fields[2]);
			const startTicks = fields[19];
			if (commEnd < 0 || ![ppid, pgid].every(Number.isSafeInteger) || selected !== void 0 && (pgid <= 0 || ppid < 0) || !/^\d+$/.test(startTicks ?? "")) throw new ProcessInspectionError("unavailable");
			if (pgid > 0) rows.push({
				pid: Number(entry),
				ppid,
				pgid,
				state: fields[0],
				startedAt: `${bootId}:${startTicks}`
			});
		}
		if (Date.now() >= deadline) throw new ProcessInspectionError("deadline");
		return rows;
	} catch (error) {
		throw inspectionFailure(error);
	}
}
//#endregion
//#region extensions/codex/src/app-server/transport-process-containment.ts
const MAX_CONTAINED_PROCESSES = 512;
const MAX_PROCESS_CONTAINMENT_MS = 2e3;
const MAX_PROCESS_QUIESCE_PASSES = 16;
async function terminateCodexAppServerDescendants(child) {
	const contained = await containDescendants(child);
	return contained === "exited" ? contained : contained?.resume;
}
/** A durable spawn fact, never a command-line match, selects the orphan root. */
async function terminateCodexAppServerOrphan(expected) {
	const deadline = Date.now() + MAX_PROCESS_CONTAINMENT_MS;
	const result = await containDescendants({
		pid: expected.pid,
		kill: (signal) => signalProcess(expected.pid, signal ?? "SIGTERM")
	}, expected, deadline);
	const contained = result === "exited" ? void 0 : result;
	let gone = false;
	try {
		if (contained) {
			const current = await readCodexAppServerProcess(expected.pid, deadline).catch(() => void 0);
			if (current && isSameLiveRoot(current, contained.root, true)) signalProcess(current.pgid === current.pid ? -current.pid : current.pid, "SIGKILL");
		}
		while (Date.now() < deadline) {
			const snapshot = await readCodexAppServerProcessSnapshot(deadline).catch(() => void 0);
			if (!snapshot?.some((row) => row.pid === process.pid)) return false;
			const current = snapshot.find((row) => row.pid === expected.pid);
			if (!current || !hasSameIdentity(current, expected) || current.state.startsWith("Z")) {
				gone = true;
				return true;
			}
			if (!contained) return false;
			await new Promise((resolve) => {
				setTimeout(resolve, 20);
			});
		}
		return false;
	} finally {
		if (contained && !gone) await signalSameRoot(contained.root, "SIGCONT", Date.now() + MAX_PROCESS_CONTAINMENT_MS);
	}
}
async function containDescendants(child, expected, deadline = Date.now() + MAX_PROCESS_CONTAINMENT_MS) {
	const rootPid = child.pid;
	if (hasExited(child)) return "exited";
	if (process.platform === "win32" || !rootPid || !child.kill) return;
	const snapshot = await readCodexAppServerProcessSnapshot(deadline).catch(() => void 0);
	if (!snapshot || Date.now() >= deadline) return;
	const root = snapshot.find((row) => row.pid === rootPid);
	if (!expected && (!root || root.state.startsWith("Z"))) return "exited";
	if (!root || !(expected ? isSameLiveProcess(root, expected) : root.ppid === process.pid) || root.state.startsWith("Z")) return;
	const initialDescendants = collectDescendants(snapshot, [rootPid]);
	if (initialDescendants.length > MAX_CONTAINED_PROCESSES) return;
	const stoppedDescendants = /* @__PURE__ */ new Map();
	if (!await signalSameRoot(root, "SIGSTOP", deadline)) return;
	let resumeRootOnUnwind = true;
	try {
		const descendants = await quiesceDescendants(root, initialDescendants, stoppedDescendants, deadline);
		if (!descendants) return;
		for (const descendant of descendants.toReversed()) {
			if (Date.now() >= deadline) return;
			if (!descendant.state.startsWith("Z")) {
				if (!await signalSameProcess(descendant, "SIGKILL", deadline) || Date.now() >= deadline) return;
			}
		}
		resumeRootOnUnwind = false;
		let resumed = false;
		return {
			root,
			resume: () => {
				if (resumed) return;
				resumed = true;
				resumeTransportRoot(child, root, false);
			}
		};
	} finally {
		if (resumeRootOnUnwind) {
			if (expected) {
				const releaseDeadline = Date.now() + MAX_PROCESS_CONTAINMENT_MS;
				for (const descendant of stoppedDescendants.values()) await signalSameProcess(descendant, "SIGCONT", releaseDeadline);
				await signalSameRoot(root, "SIGCONT", releaseDeadline);
			} else {
				for (const descendant of stoppedDescendants.values()) signalProcess(descendant.pid, "SIGCONT");
				resumeTransportRoot(child, root, true);
			}
		}
	}
}
async function quiesceDescendants(root, initialDescendants, stopped, deadline) {
	const provenByPid = new Map(initialDescendants.map((descendant) => [descendant.pid, descendant]));
	const stopFailures = /* @__PURE__ */ new Map();
	for (let pass = 0; pass < MAX_PROCESS_QUIESCE_PASSES; pass += 1) {
		if (Date.now() >= deadline) return;
		const snapshot = await readCodexAppServerProcessSnapshot(deadline).catch(() => void 0);
		if (!snapshot || Date.now() >= deadline) return;
		const currentRoot = snapshot.find((row) => row.pid === root.pid);
		if (!currentRoot || !isSameLiveRoot(currentRoot, root)) return;
		if (!isSameLiveRoot(currentRoot, root, true)) {
			if (!await signalSameRoot(root, "SIGSTOP", deadline) || Date.now() >= deadline) return;
			continue;
		}
		const snapshotByPid = new Map(snapshot.map((process) => [process.pid, process]));
		const liveProven = [];
		for (const proven of provenByPid.values()) {
			const current = snapshotByPid.get(proven.pid);
			if (!current) {
				provenByPid.delete(proven.pid);
				stopped.delete(identityKey(proven));
				continue;
			}
			if (!hasSameIdentity(proven, current)) return;
			provenByPid.set(current.pid, current);
			const key = identityKey(current);
			if (stopped.has(key)) stopped.set(key, current);
			liveProven.push(current);
		}
		const descendants = collectDescendants(snapshot, [root.pid, ...liveProven.map(({ pid }) => pid)]);
		for (const descendant of descendants) {
			const proven = provenByPid.get(descendant.pid);
			if (proven && !hasSameIdentity(proven, descendant)) return;
			provenByPid.set(descendant.pid, descendant);
		}
		if (provenByPid.size > MAX_CONTAINED_PROCESSES) return;
		const quiescenceTargets = new Map(liveProven.map((process) => [process.pid, process]));
		for (const descendant of descendants) quiescenceTargets.set(descendant.pid, descendant);
		let allStopped = true;
		for (const descendant of quiescenceTargets.values()) {
			if (Date.now() >= deadline) return;
			if (isStoppedState(descendant.state)) continue;
			const stopQueued = await signalSameProcess(descendant, "SIGSTOP", deadline);
			if (Date.now() >= deadline) return;
			if (stopQueued) {
				stopFailures.delete(identityKey(descendant));
				stopped.set(identityKey(descendant), descendant);
			} else {
				const key = identityKey(descendant);
				const failures = (stopFailures.get(key) ?? 0) + 1;
				if (failures >= 2) return;
				stopFailures.set(key, failures);
			}
			if (!isUninterruptibleState(descendant.state) || !stopQueued) allStopped = false;
		}
		if (allStopped) return [...provenByPid.values()];
	}
}
function collectDescendants(snapshot, rootPids) {
	const childrenByParent = /* @__PURE__ */ new Map();
	for (const row of snapshot) {
		const children = childrenByParent.get(row.ppid) ?? [];
		children.push(row);
		childrenByParent.set(row.ppid, children);
	}
	const descendants = [];
	const pending = [...new Set(rootPids)];
	const seen = new Set(pending);
	for (const parentPid of pending) for (const child of childrenByParent.get(parentPid) ?? []) {
		if (seen.has(child.pid)) continue;
		seen.add(child.pid);
		descendants.push(child);
		pending.push(child.pid);
	}
	return descendants;
}
function isStoppedState(state) {
	return state.startsWith("T") || state.startsWith("t") || state.startsWith("Z");
}
function isQuiescedState(state) {
	return isStoppedState(state) || isUninterruptibleState(state);
}
function isUninterruptibleState(state) {
	return state.startsWith("D") || state.startsWith("U");
}
function isSameLiveProcess(current, expected) {
	return current.pgid === expected.pgid && !current.state.startsWith("Z") && hasSameIdentity(current, expected);
}
function isSameLiveRoot(current, expected, requireStopped = false) {
	return current.ppid === expected.ppid && (!requireStopped || isQuiescedState(current.state)) && isSameLiveProcess(current, expected);
}
async function signalSameRoot(root, signal, deadline) {
	const current = await readCodexAppServerProcess(root.pid, deadline).catch(() => void 0);
	return Boolean(current && isSameLiveRoot(current, root) && signalProcess(current.pid, signal));
}
function resumeTransportRoot(child, root, allowSynchronousPidFallback) {
	try {
		if (child.kill) {
			child.kill("SIGCONT");
			return;
		}
	} catch {
		if (!allowSynchronousPidFallback) return;
	}
	if (allowSynchronousPidFallback) signalProcess(root.pid, "SIGCONT");
}
async function signalSameProcess(expected, signal, deadline) {
	const current = await readCodexAppServerProcess(expected.pid, deadline).catch(() => void 0);
	return Boolean(current && isSameLiveProcess(current, expected) && signalProcess(current.pid, signal));
}
function hasSameIdentity(left, right) {
	return identityKey(left) === identityKey(right);
}
function identityKey(row) {
	return `${row.pid}\0${row.startedAt}`;
}
function hasExited(child) {
	return child.exitCode != null || child.signalCode != null;
}
function signalProcess(pid, signal) {
	try {
		process.kill(pid, signal);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region extensions/codex/src/app-server/transport-process-registration.ts
const processIdentity = z.object({
	pid: z.number().int().positive().safe(),
	pgid: z.number().int().positive().safe(),
	startedAt: z.string().min(1).max(64)
});
const childIdentity = processIdentity.extend({ commandFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const registrationSchema = z.object({
	parent: processIdentity,
	child: childIdentity
}).strict();
function fingerprintProcessCommand(command) {
	return createHash("sha256").update(command).digest("hex");
}
async function openProcessRegistrationStore() {
	const { createPluginStateSyncKeyedStore } = await import("openclaw/plugin-sdk/plugin-state-store-runtime");
	return createPluginStateSyncKeyedStore("codex", {
		namespace: "app-server-processes",
		maxEntries: 512,
		overflowPolicy: "reject-new"
	});
}
async function reapRegisteredCodexAppServerOrphans(requestedDeadline) {
	const store = await openProcessRegistrationStore();
	const deadline = requestedDeadline ?? Date.now() + 1e4;
	for (const entry of store.entries()) {
		if (Date.now() >= deadline) throw new Error("Codex orphan cleanup exceeded its startup budget. Retry to finish cleanup.");
		const registration = registrationSchema.parse(entry.value);
		const snapshot = await readCodexAppServerProcessSnapshot(void 0, [registration.parent.pid, registration.child.pid]);
		const parent = snapshot.find((row) => row.pid === registration.parent.pid);
		if (parent?.startedAt === registration.parent.startedAt && !parent.state.startsWith("Z")) continue;
		const child = snapshot.find((row) => row.pid === registration.child.pid);
		if (registration.child.commandFingerprint !== void 0 && child?.startedAt === registration.child.startedAt && !child.state.startsWith("Z")) {
			let command;
			try {
				command = await readCodexAppServerProcessCommand(child, deadline);
			} catch (error) {
				if ((await readCodexAppServerProcessSnapshot(deadline, [registration.child.pid])).find((row) => row.pid === registration.child.pid)?.startedAt === registration.child.startedAt) throw error;
			}
			if (command !== void 0 && fingerprintProcessCommand(command) !== registration.child.commandFingerprint) {
				store.delete(entry.key);
				continue;
			}
		}
		if (!await terminateCodexAppServerOrphan(registration.child)) throw new Error(`Cannot reap registered Codex process ${registration.child.pid}. Stop it before retrying.`);
		store.delete(entry.key);
	}
}
function createCodexAppServerProcessReaperService() {
	return {
		id: "codex-app-server-process-reaper",
		start(ctx) {
			if (process.platform === "win32") return;
			(async () => {
				try {
					await reapRegisteredCodexAppServerOrphans();
				} catch (error) {
					ctx.logger.warn(`Codex app-server orphan cleanup failed: ${String(error)}`);
				}
			})();
		}
	};
}
/** Reap previous owners before spawn; commit this child's identity before initialization. */
async function prepareCodexAppServerProcessRegistration() {
	if (process.platform === "win32") return async (child) => {
		await once(child, "spawn");
	};
	await reapRegisteredCodexAppServerOrphans();
	const store = await openProcessRegistrationStore();
	return async (child) => {
		await once(child, "spawn");
		if (!child.pid) throw new ProcessInspectionError("unavailable");
		const snapshot = await readCodexAppServerProcessSnapshot(void 0, [child.pid]);
		const parent = snapshot.find((row) => row.pid === process.pid);
		const spawned = snapshot.find((row) => row.pid === child.pid);
		if (!parent || !spawned || spawned.ppid !== process.pid) throw new Error("Cannot register the Codex child process: its direct-parent identity is unavailable. Retry.");
		const command = await readCodexAppServerProcessCommand(spawned, Date.now() + 2e3);
		if (child.exitCode !== null || child.signalCode !== null) throw new Error("Cannot register the Codex child process command: the child exited during inspection. Retry.");
		const key = randomUUID();
		store.register(key, {
			parent: processIdentity.parse(parent),
			child: childIdentity.parse({
				...spawned,
				commandFingerprint: fingerprintProcessCommand(command)
			})
		});
		child.once("exit", () => {
			try {
				store.delete(key);
			} catch {}
		});
	};
}
//#endregion
//#region extensions/codex/src/app-server/transport.ts
/**
* Shared transport lifecycle helpers for stdio and WebSocket Codex app-server
* connections.
*/
const CODEX_APP_SERVER_TRANSPORT_CLOSES = /* @__PURE__ */ new WeakMap();
/** True only after bounded settlement proves an exit that cleanup did not cause. */
function hasCodexAppServerNaturalExit(child) {
	return CODEX_APP_SERVER_TRANSPORT_CLOSES.get(child)?.naturalExit === true;
}
/** Starts graceful transport shutdown and schedules a force kill fallback. */
function closeCodexAppServerTransport(child, options = {}) {
	beginCodexAppServerTransportClose(child, options).closing;
}
function beginCodexAppServerTransportClose(child, options) {
	const current = CODEX_APP_SERVER_TRANSPORT_CLOSES.get(child);
	if (current) return current;
	const closure = {
		closing: (async () => {
			if (hasCodexAppServerTransportExited(child)) return true;
			if (process.platform === "win32" || !child.pid || !child.kill) {
				finishCodexAppServerTransportClose(child, options);
				return false;
			}
			let resumeRoot;
			try {
				const contained = await terminateCodexAppServerDescendants(child);
				if (contained === "exited") return true;
				resumeRoot = contained;
			} catch {
				resumeRoot = void 0;
			}
			try {
				finishCodexAppServerTransportClose(child, options, resumeRoot);
			} catch {
				signalCodexAppServerTransport(child, "SIGKILL");
			}
			return false;
		})(),
		naturalExit: false
	};
	CODEX_APP_SERVER_TRANSPORT_CLOSES.set(child, closure);
	return closure;
}
function finishCodexAppServerTransportClose(child, options, resumeRoot) {
	const forceKillDelayMs = options.forceKillDelayMs ?? 1e3;
	const forceKill = setTimeout(() => {
		if (hasCodexAppServerTransportExited(child)) return;
		signalCodexAppServerTransport(child, "SIGKILL");
	}, Math.max(1, forceKillDelayMs));
	forceKill.unref?.();
	child.once("exit", () => {
		clearTimeout(forceKill);
		if (!options.drainStdio) {
			child.stdout.destroy?.();
			child.stderr.destroy?.();
		}
	});
	try {
		child.stdin.end?.();
		child.stdin.destroy?.();
	} finally {
		resumeRoot?.();
	}
	child.unref?.();
	child.stdout.unref?.();
	child.stderr.unref?.();
	child.stdin.unref?.();
}
/** Closes a transport and waits briefly for an exit event. */
async function closeCodexAppServerTransportAndWait(child, options = {}) {
	const drained = options.drainStdio ? Promise.all([child.stdout, child.stderr].map((stream) => finished(stream, { cleanup: true }))).then(() => true, () => false) : void 0;
	const closure = beginCodexAppServerTransportClose(child, options);
	const naturalExit = await closure.closing;
	const settled = await waitForCodexAppServerTransportExit(child, options.exitTimeoutMs ?? 2e3, drained);
	closure.naturalExit = naturalExit && settled;
	if (options.drainStdio) {
		child.stdout.destroy?.();
		child.stderr.destroy?.();
	}
	return settled;
}
function hasCodexAppServerTransportExited(child) {
	return child.exitCode !== null && child.exitCode !== void 0 ? true : child.signalCode !== null && child.signalCode !== void 0;
}
async function waitForCodexAppServerTransportExit(child, timeoutMs, drained) {
	return await new Promise((resolve) => {
		let settled = false;
		const finish = (exited) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			child.off?.("exit", onExit);
			resolve(exited);
		};
		const onExit = () => {
			if (drained) drained.then(finish);
			else finish(true);
		};
		const timeout = setTimeout(() => finish(false), Math.max(1, timeoutMs));
		child.once("exit", onExit);
		if (hasCodexAppServerTransportExited(child)) onExit();
	});
}
function signalCodexAppServerTransport(child, signal) {
	if (child.pid && process.platform !== "win32") try {
		process.kill(-child.pid, signal);
		return;
	} catch {}
	child.kill?.(signal);
}
//#endregion
//#region extensions/codex/src/app-server/transport-stdio.ts
/**
* Creates and configures stdio-backed Codex app-server transports, including
* Windows spawn normalization and environment filtering.
*/
const UNSAFE_ENVIRONMENT_KEYS = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
const RUNTIME_INJECTION_ENVIRONMENT_KEYS = /* @__PURE__ */ new Set([
	"NODE_PATH",
	"LD_AUDIT",
	"LD_LIBRARY_PATH",
	"LD_PRELOAD"
]);
const QA_PARENT_PID_ENV = "OPENCLAW_QA_PARENT_PID";
const DEFAULT_SPAWN_RUNTIME = {
	platform: process.platform,
	env: process.env,
	execPath: process.execPath
};
/** Resolves the concrete command/argv/shell settings used to spawn Codex app-server. */
function resolveCodexAppServerSpawnInvocation(options, runtime = DEFAULT_SPAWN_RUNTIME) {
	if (options.commandSource === "managed") throw new Error("Managed Codex app-server start options must be resolved before spawn.");
	const program = resolveWindowsSpawnProgram({
		command: options.command,
		platform: runtime.platform,
		env: runtime.env,
		execPath: runtime.execPath,
		packageName: "@openai/codex"
	});
	const args = normalizeCodexAppServerArgs(options.args);
	const resolved = materializeWindowsSpawnProgram(program, args);
	return {
		command: resolved.command,
		args: resolved.argv,
		shell: resolved.shell,
		windowsHide: resolved.windowsHide
	};
}
/** Merges app-server environment overrides while honoring clearEnv and unsafe key filtering. */
function resolveCodexAppServerSpawnEnv(options, baseEnv = process.env, platform = process.platform) {
	const env = Object.create(null);
	copySafeEnvironmentEntries(env, baseEnv);
	copySafeEnvironmentEntries(env, options.env ?? {});
	const keysToClear = normalizedEnvironmentKeys(options.clearEnv ?? []);
	if (platform === "win32") {
		const lowerCaseKeysToClear = new Set(keysToClear.map((key) => key.toLowerCase()));
		for (const candidate of Object.keys(env)) if (lowerCaseKeysToClear.has(candidate.toLowerCase())) delete env[candidate];
	} else for (const key of keysToClear) delete env[key];
	for (const key of Object.keys(env)) if (isCodexRuntimeInjectionEnvironmentKey(key)) delete env[key];
	return env;
}
function isCodexRuntimeInjectionEnvironmentKey(rawKey) {
	const key = rawKey.toUpperCase();
	return RUNTIME_INJECTION_ENVIRONMENT_KEYS.has(key) || key.startsWith("DYLD_");
}
/** Keeps QA-owned app-server processes inside the gateway process-group cleanup boundary. */
function resolveCodexAppServerDetachedMode(env, platform = process.platform) {
	return platform !== "win32" && !env[QA_PARENT_PID_ENV]?.trim();
}
function normalizedEnvironmentKeys(rawKeys) {
	const keys = [];
	for (const rawKey of rawKeys) {
		const key = rawKey.trim();
		if (key.length > 0) keys.push(key);
	}
	return keys;
}
function copySafeEnvironmentEntries(target, source) {
	for (const [key, value] of Object.entries(source)) {
		if (UNSAFE_ENVIRONMENT_KEYS.has(key)) continue;
		target[key] = value;
	}
}
/** Spawns the Codex app-server process and returns the shared transport interface. */
async function createStdioTransport(options, baseEnv = process.env, assertCurrent, onSpawn) {
	const env = resolveCodexAppServerSpawnEnv(options, baseEnv);
	const invocation = resolveCodexAppServerSpawnInvocation(options, {
		platform: process.platform,
		env,
		execPath: process.execPath
	});
	const register = await prepareCodexAppServerProcessRegistration();
	assertCurrent?.();
	const child = spawn(invocation.command, invocation.args, {
		...options.cwd !== void 0 ? { cwd: options.cwd } : {},
		env,
		detached: resolveCodexAppServerDetachedMode(env),
		shell: invocation.shell,
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		],
		windowsHide: invocation.windowsHide
	});
	try {
		onSpawn?.(child);
		await register(child);
		assertCurrent?.();
		return child;
	} catch (error) {
		await closeCodexAppServerTransportAndWait(child, { drainStdio: true });
		assertCurrent?.();
		throw error;
	}
}
//#endregion
export { hasCodexAppServerNaturalExit as a, closeCodexAppServerTransportAndWait as i, resolveCodexAppServerSpawnEnv as n, createCodexAppServerProcessReaperService as o, closeCodexAppServerTransport as r, createStdioTransport as t };
