import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnBrokerStats, spawnViaBroker } from "./v-spawn-broker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const relay = path.join(here, "fake-relay.mjs");
const STDIO = ["pipe", "pipe", "pipe", "pipe", "ipc"];
const env = { ...process.env, V_SPAWN_BROKER_TEST: "env-ok" };

const collect = (stream) => new Promise((resolve) => {
	let text = "";
	stream.setEncoding("utf8");
	stream.on("data", (c) => { text += c; });
	stream.on("end", () => resolve(text));
	stream.on("error", () => {});
});

// Drive one relay the way createServiceChildRelayAdapter does, and return what it observed.
async function drive(child, bytes) {
	assert.ok(child.connected, "IPC connected right after spawn");
	assert.ok(child.stdout && child.stderr && child.stdio[3] && child.stdin, "all pipes present right after spawn");
	const out = collect(child.stdout);
	const err = collect(child.stderr);
	const control = child.stdio[3];
	control.setEncoding("utf8");
	let controlText = "";
	control.on("data", (c) => { controlText += c; });
	const hello = new Promise((resolve) => child.once("message", resolve));
	const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
	await new Promise((resolve, reject) => child.send({ type: "start", generation: "g1", controlFd: 3, bytes }, (e) => (e ? reject(e) : resolve())));
	assert.deepEqual(await hello, { type: "hello", generation: "g1", env: "env-ok" });
	child.stdin.write("in-data");
	child.stdin.end();
	await new Promise((r) => setTimeout(r, 300));
	control.write(`${JSON.stringify({ type: "cancel", generation: "g1", sequence: 1 })}\n`);
	const exit = await exited;
	return { out: await out, err: await err, controlText, exit, pid: child.pid };
}

test("a brokered relay behaves like a directly spawned one on every channel", async () => {
	const bytes = 300_000; // larger than a socket buffer: output must stream, not sit in the helper
	const direct = await drive(spawn(process.execPath, [relay], { stdio: STDIO, env }), bytes);
	const child = await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env });
	assert.ok(child, "brokered");
	const brokered = await drive(child, bytes);
	for (const r of [direct, brokered]) {
		assert.equal(r.out, `out:${"x".repeat(bytes)}\necho:in-data\n`);
		assert.equal(r.err, "err\n");
		assert.match(r.controlText, /"type":"ready".*\n.*"type":"closing"/s);
		assert.deepEqual(r.exit, { code: 7, signal: null });
	}
	assert.notEqual(brokered.pid, process.pid);
	assert.ok(spawnBrokerStats().brokered >= 1);
});

test("kill reaches the brokered relay and its exit is reported", async () => {
	const child = await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env });
	const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
	assert.equal(child.kill("SIGKILL"), true);
	assert.deepEqual(await exited, { code: null, signal: "SIGKILL" });
	assert.equal(child.connected, false);
});

test("unbrokerable shapes, the switch, and a missing program fall back to a direct spawn", async () => {
	assert.equal(await spawnViaBroker(process.execPath, [relay], { stdio: ["pipe", "pipe", "pipe", 3, "ipc"], env }), null);
	assert.equal(await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env, detached: true }), null);
	process.env.OPENCLAW_V_SPAWN_BROKER = "0";
	try {
		assert.equal(await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env }), null);
	} finally {
		delete process.env.OPENCLAW_V_SPAWN_BROKER;
	}
	const before = spawnBrokerStats().fallback;
	assert.equal(await spawnViaBroker("/nonexistent/v-spawn-broker-test", [], { stdio: STDIO, env }), null);
	assert.equal(spawnBrokerStats().fallback, before + 1);
});

test("the helper going away ends the relays it holds and is restarted on the next call", async () => {
	const child = await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env });
	const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
	const brokerPid = spawnBrokerStats().brokerPid;
	process.kill(brokerPid, "SIGKILL");
	assert.deepEqual(await exited, { code: null, signal: "SIGKILL" });
	const next = await spawnViaBroker(process.execPath, [relay], { stdio: STDIO, env });
	assert.ok(next);
	assert.notEqual(spawnBrokerStats().brokerPid, brokerPid);
	next.kill("SIGKILL");
	// the orphaned relay saw its IPC parent disappear and left on its own (exit 3)
	await new Promise((r) => setTimeout(r, 300));
	assert.throws(() => process.kill(child.pid, 0));
});

test("the caller's thread is not blocked by the fork when its heap is large (Linux)", { skip: process.platform !== "linux" }, async () => {
	const keep = [];
	for (let i = 0; i < 4; i++) { const b = Buffer.allocUnsafeSlow(256 * 1024 * 1024); for (let j = 0; j < b.length; j += 4096) b[j] = 1; keep.push(b); }
	const blockedMs = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
	const direct = [];
	for (let i = 0; i < 5; i++) { let c; direct.push(blockedMs(() => { c = spawn(process.execPath, ["-e", "0"], { stdio: STDIO }); })); c.disconnect(); await new Promise((r) => c.once("exit", r)); }
	const brokered = [];
	for (let i = 0; i < 5; i++) {
		let p;
		brokered.push(blockedMs(() => { p = spawnViaBroker(process.execPath, ["-e", "0"], { stdio: STDIO, env }); }));
		const c = await p;
		const exited = c.exitCode !== null || c.signalCode !== null ? null : new Promise((r) => c.once("exit", r));
		c.disconnect();
		await exited;
	}
	const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
	assert.ok(med(direct) > 8, `direct fork with 1 GB anon blocks ${med(direct)} ms`);
	assert.ok(med(brokered) < 3, `brokered spawn blocks ${med(brokered)} ms`);
	keep.length = 0;
});
