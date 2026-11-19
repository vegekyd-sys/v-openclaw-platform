// Test double for the service child relay: same channels (stdin, stdout, stderr, a control pipe at
// start.controlFd, and IPC) without starting a real command.
import net from "node:net";

process.once("message", (start) => {
	const control = new net.Socket({ fd: start.controlFd, readable: true, writable: true });
	const controlIn = control;
	control.write(`${JSON.stringify({ type: "ready", generation: start.generation, sequence: 1, commandPid: process.pid })}\n`);
	process.send({ type: "hello", generation: start.generation, env: process.env.V_SPAWN_BROKER_TEST ?? null });
	process.stdout.write(`out:${"x".repeat(start.bytes ?? 0)}\n`);
	process.stderr.write("err\n");
	let echoed = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk) => { echoed += chunk; });
	process.stdin.on("end", () => process.stdout.write(`echo:${echoed}\n`));
	controlIn.setEncoding("utf8");
	controlIn.on("data", (chunk) => {
		if (!chunk.includes("cancel")) return;
		control.write(`${JSON.stringify({ type: "closing", generation: start.generation, sequence: 2 })}\n`, () => process.exit(7));
	});
});
process.once("disconnect", () => process.exit(3));
