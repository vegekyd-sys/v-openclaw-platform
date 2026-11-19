// v-spawn-broker-v1
// Spawn service-child relays from a small long-lived helper process instead of the Gateway.
//
// Why: on Linux, child_process.spawn forks the calling process; the fork copies the caller's page
// tables and takes a reference on every anonymous page, synchronously, on the calling thread. V's
// Gateway holds ~6 GB of anonymous memory (VmPTE ~139 MB), so every exec tool call blocked the main
// thread ~54 ms (V CPU profile 2026-11-19 14:33 CST: 69 relay spawns in 60 s = 3.8 s of main
// thread). A helper with a ~50 MB heap forks in ~1 ms.
//
// How: the Gateway spawns this file once (one fork, lazily, on first use). For each relay it sends
// {argv, env, stdio shape}; the helper spawns the relay, stops reading its stdio pipes (libuv makes
// them socketpairs), and hands the parent ends to the Gateway over IPC. The relay's IPC channel
// terminates in the helper, which forwards messages, disconnect, exit and error both ways. The
// Gateway gets a ChildProcess-like object; kill() signals the relay pid directly.
// The helper exits when the Gateway's IPC channel closes, so a relay sees its parent disappear
// exactly when it did before (Gateway exit), and runs its usual parent-loss cleanup.
//
// OPENCLAW_V_SPAWN_BROKER=0 turns it off (read per call). Any helper failure falls back to a direct
// spawn for that call and restarts the helper on the next one. A spawn that misses its deadline only
// falls back for that call: the helper is never killed for it, because losing the helper ends every
// relay it holds. After MAX_CONSECUTIVE_TIMEOUTS in a row spawns go direct, and the helper is replaced
// once no brokered relay depends on it.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

const MARKER = "v-spawn-broker-v1";
const SPAWN_TIMEOUT_MS = 5000;
const MAX_CONSECUTIVE_TIMEOUTS = 3;
const ELIGIBLE = new Set(["pipe", "inherit", "ignore", "ipc"]);

function stopReading(socket) {
	const handle = socket?._handle;
	if (handle && handle.reading) {
		handle.reading = false;
		handle.readStop();
	}
}

// ---------------------------------------------------------------- helper process side
function runBroker() {
	const children = new Map();
	const reply = (message, handle) => {
		if (!process.connected) return;
		try {
			process.send(message, handle);
		} catch {}
	};
	process.on("message", (m) => {
		if (!m || typeof m !== "object") return;
		if (m.t === "spawn") {
			let child;
			try {
				child = spawn(m.execPath, m.argv, { stdio: m.stdio, env: m.env, windowsHide: true });
			} catch (error) {
				reply({ t: "spawned", id: m.id, error: error?.message ?? String(error) });
				return;
			}
			const finishSpawn = () => {
				children.set(m.id, child);
				child.on("message", (msg) => reply({ t: "msg", id: m.id, msg }));
				child.once("disconnect", () => reply({ t: "disconnect", id: m.id }));
				child.once("exit", (code, signal) => {
					children.delete(m.id);
					reply({ t: "exit", id: m.id, code, signal });
				});
				// Hand over every pipe end; the readable ones must not be read here first.
				m.stdio.forEach((kind, index) => {
					if (kind !== "pipe") return;
					const socket = child.stdio[index];
					stopReading(socket);
					reply({ t: "fd", id: m.id, index }, socket);
				});
				reply({ t: "spawned", id: m.id, pid: child.pid, connected: child.connected });
			};
			if (child.pid === undefined) {
				child.once("error", (error) => reply({ t: "spawned", id: m.id, error: error?.message ?? String(error) }));
				return;
			}
			child.on("error", (error) => reply({ t: "error", id: m.id, message: error?.message ?? String(error) }));
			finishSpawn();
		} else if (m.t === "send") {
			const child = children.get(m.id);
			if (!child?.connected) {
				reply({ t: "sent", id: m.id, sid: m.sid, error: "service child lifecycle IPC is closed" });
				return;
			}
			try {
				child.send(m.msg, (error) => reply({ t: "sent", id: m.id, sid: m.sid, error: error ? error.message : undefined }));
			} catch (error) {
				reply({ t: "sent", id: m.id, sid: m.sid, error: error?.message ?? String(error) });
			}
		} else if (m.t === "disconnect") {
			const child = children.get(m.id);
			try {
				if (child?.connected) child.disconnect();
			} catch {}
		}
	});
	// The Gateway is gone: leave, so the relays see their parent disappear as before.
	process.once("disconnect", () => process.exit(0));
	reply({ t: "ready", pid: process.pid });
}

// ---------------------------------------------------------------- Gateway side
function state() {
	const slot = Symbol.for("openclaw.v.spawnBroker.v1");
	globalThis[slot] ??= { broker: null, ready: null, seq: 0, holds: 0, children: new Map(), abandoned: new Set(), consecutiveTimeouts: 0, retire: null, stats: { brokered: 0, fallback: 0, restarts: 0, timeouts: 0, lastError: null } };
	return globalThis[slot];
}

// A real child's IPC channel keeps its parent's event loop alive while it is connected; the helper's
// channel stands in for all of them, so it is referenced while a spawn is in flight or any brokered
// child is connected, and unreferenced otherwise (an idle helper never keeps a process alive).
function hold(s, delta) {
	s.holds = Math.max(0, s.holds + delta);
	if (s.holds > 0) s.broker?.channel?.ref?.();
	else s.broker?.channel?.unref?.();
}

class BrokeredChild extends EventEmitter {
	constructor(id, broker, stdioShape) {
		super();
		this.brokerId = id;
		this.broker = broker;
		this.pid = undefined;
		this.stdio = stdioShape.map(() => null);
		this.exitCode = null;
		this.signalCode = null;
		this._connected = false;
		this._sendSeq = 0;
		this._sends = new Map();
		this._release = null;
		this._processRelease = null;
	}
	get stdin() { return this.stdio[0]; }
	get stdout() { return this.stdio[1]; }
	get stderr() { return this.stdio[2]; }
	get connected() { return this._connected && this.broker.connected; }
	send(message, callback) {
		if (!this.connected) {
			const error = new Error("service child lifecycle IPC is closed");
			if (callback) queueMicrotask(() => callback(error));
			return false;
		}
		const sid = ++this._sendSeq;
		if (callback) this._sends.set(sid, callback);
		this.broker.send({ t: "send", id: this.brokerId, sid, msg: message }, (error) => {
			if (!error) return;
			const cb = this._sends.get(sid);
			this._sends.delete(sid);
			cb?.(error);
		});
		return true;
	}
	disconnect() {
		if (!this._connected) return;
		try {
			this.broker.send({ t: "disconnect", id: this.brokerId });
		} catch {}
	}
	kill(signal = "SIGTERM") {
		if (this.pid === undefined || this.exitCode !== null || this.signalCode !== null) return false;
		try {
			process.kill(this.pid, signal);
			return true;
		} catch {
			return false;
		}
	}
	ref() {}
	// Like ChildProcess.unref(): the exit no longer keeps the event loop alive (IPC still does).
	unref() {
		this._processRelease?.();
		this._processRelease = null;
	}
	_markDisconnected() {
		if (!this._connected) return;
		this._connected = false;
		this._release?.();
		this._release = null;
		for (const cb of this._sends.values()) cb(new Error("service child lifecycle IPC is closed"));
		this._sends.clear();
		this.emit("disconnect");
	}
	_settleSend(sid, error) {
		const cb = this._sends.get(sid);
		this._sends.delete(sid);
		cb?.(error ? new Error(error) : null);
	}
}

function startBroker(s) {
	const broker = spawn(process.execPath, [fileURLToPath(import.meta.url), "--v-spawn-broker"], {
		stdio: ["inherit", "inherit", "inherit", "ipc"],
		env: process.env,
		windowsHide: true,
	});
	broker.unref();
	broker.channel?.unref?.();
	s.broker = broker;
	s.stats.restarts += 1;
	console.log(`[v-spawn-broker.1] ${JSON.stringify({ event: "start", pid: broker.pid, starts: s.stats.restarts })}`);
	let readyResolve;
	s.ready = new Promise((resolve) => { readyResolve = resolve; });
	// A helper that never reports ready (it has no relays yet) is killed; loss handling fails the waiters.
	const readyTimer = setTimeout(() => { try { broker.kill("SIGKILL"); } catch {} }, SPAWN_TIMEOUT_MS);
	readyTimer.unref?.();
	const pending = s.children;
	broker.on("message", (m, handle) => {
		if (m?.t === "ready") { clearTimeout(readyTimer); readyResolve(true); return; }
		const entry = pending.get(m?.id);
		if (!entry) {
			handle?.destroy?.();
			// The caller already fell back to a direct spawn; this relay never got a start message.
			if (m?.t === "spawned" && s.abandoned.delete(m.id) && m.pid) {
				try { process.kill(m.pid, "SIGKILL"); } catch {}
			}
			return;
		}
		const child = entry.child;
		if (m.t === "fd") {
			if (m.index === 0) stopReading(handle);
			child.stdio[m.index] = handle;
		} else if (m.t === "spawned") {
			if (m.error) {
				pending.delete(m.id);
				entry.reject(new Error(m.error));
				return;
			}
			child.pid = m.pid;
			child._connected = m.connected === true;
			// releases count only against the helper instance that took them
			const release = () => { if (s.broker === broker) hold(s, -1); };
			hold(s, 1);
			child._processRelease = release;
			if (child._connected) {
				hold(s, 1);
				child._release = release;
			}
			entry.resolve(child);
		} else if (m.t === "msg") child.emit("message", m.msg);
		else if (m.t === "sent") child._settleSend(m.sid, m.error);
		else if (m.t === "disconnect") child._markDisconnected();
		else if (m.t === "error") child.emit("error", new Error(m.message));
		else if (m.t === "exit") {
			pending.delete(m.id);
			child.exitCode = m.code;
			child.signalCode = m.signal;
			child._markDisconnected();
			child._processRelease?.();
			child._processRelease = null;
			child.emit("exit", m.code, m.signal);
			child.emit("close", m.code, m.signal);
		}
	});
	const lost = (why) => {
		if (s.broker !== broker) return;
		s.broker = null;
		s.ready = null;
		s.retire = null;
		s.holds = 0;
		s.consecutiveTimeouts = 0;
		s.abandoned.clear();
		s.stats.lastError = why;
		console.log(`[v-spawn-broker.1] ${JSON.stringify({ event: "lost", pid: broker.pid, why, children: pending.size, brokered: s.stats.brokered, fallback: s.stats.fallback })}`);
		clearTimeout(readyTimer);
		readyResolve(false);
		for (const [id, entry] of pending) {
			pending.delete(id);
			if (entry.child.pid === undefined) entry.reject(new Error(`spawn broker lost: ${why}`));
			else {
				entry.child._markDisconnected();
				if (entry.child.exitCode === null && entry.child.signalCode === null) {
					entry.child.signalCode = "SIGKILL";
					entry.child.emit("exit", null, "SIGKILL");
				}
			}
		}
	};
	s.retire = (why) => {
		try { broker.kill("SIGKILL"); } catch {}
		lost(why);
	};
	broker.once("exit", (code, signal) => lost(`exit ${code ?? signal}`));
	broker.once("error", (error) => lost(error.message));
	broker.once("disconnect", () => lost("disconnect"));
	return broker;
}

/**
 * Spawn `execPath argv` through the helper. Resolves to a ChildProcess-like object, or to null when
 * the broker is off, the stdio shape cannot be brokered, or the helper failed (the caller then
 * spawns directly).
 */
async function spawnViaBroker(execPath, argv, options) {
	const s = state();
	if (process.env.OPENCLAW_V_SPAWN_BROKER === "0" || process.platform === "win32") return null;
	const stdio = options?.stdio;
	if (!Array.isArray(stdio) || options.detached || !stdio.every((v) => ELIGIBLE.has(v))) return null;
	if (s.consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
		s.stats.fallback += 1;
		// Unresponsive: spawn directly; replace the helper once no brokered relay depends on it.
		if (![...s.children.values()].some((entry) => entry.child.pid !== undefined)) s.retire?.(`${s.consecutiveTimeouts} spawns timed out in a row`);
		return null;
	}
	const timeoutMs = options.timeoutMs ?? SPAWN_TIMEOUT_MS;
	let held = false;
	try {
		if (!s.broker?.connected) startBroker(s);
		hold(s, 1);
		held = s.broker;
		if (!(await s.ready)) throw new Error(s.stats.lastError ?? "spawn broker did not start");
		const broker = s.broker;
		const id = ++s.seq;
		const child = new BrokeredChild(id, broker, stdio);
		const result = await new Promise((resolve, reject) => {
			// A slow spawn fails only this call; killing the helper would end every relay it holds.
			const timer = setTimeout(() => {
				s.children.delete(id);
				if (s.broker === broker) {
					s.abandoned.add(id);
					s.consecutiveTimeouts += 1;
				}
				s.stats.timeouts += 1;
				reject(new Error("spawn broker timed out"));
			}, timeoutMs);
			timer.unref?.();
			s.children.set(id, {
				child,
				resolve: (value) => { clearTimeout(timer); resolve(value); },
				reject: (error) => { clearTimeout(timer); reject(error); },
			});
			broker.send({ t: "spawn", id, execPath, argv, stdio, env: options.env ?? process.env }, (error) => {
				if (!error) return;
				s.children.get(id)?.reject(error);
				s.children.delete(id);
			});
		});
		s.stats.brokered += 1;
		s.consecutiveTimeouts = 0;
		return result;
	} catch (error) {
		s.stats.fallback += 1;
		s.stats.lastError = error?.message ?? String(error);
		return null;
	} finally {
		if (held && held === s.broker) hold(s, -1);
	}
}

function spawnBrokerStats() {
	return { marker: MARKER, ...state().stats, brokerPid: state().broker?.pid ?? null };
}

if (process.argv.includes("--v-spawn-broker") && process.argv[1] === fileURLToPath(import.meta.url)) runBroker();

export { spawnViaBroker, spawnBrokerStats, MARKER };
