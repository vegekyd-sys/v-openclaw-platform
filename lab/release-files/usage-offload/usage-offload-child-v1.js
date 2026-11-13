// usage-offload-v1: worker process for usage-offload-v1.js. It answers one message per call, runs
// background rollup refreshes in its own event loop, exits on "shutdown" once its refresh queue is
// idle, and exits immediately when the Gateway's IPC channel closes.
import { isCostUsageRefreshQueueIdle } from "./session-cost-usage-C_mE_GAE.js";
import { resolveUsageOffloadReader } from "./usage-offload-v1.js";
let inFlight = 0;
let shutdownRequested = false;
function exitWhenIdle() {
	if (inFlight === 0 && isCostUsageRefreshQueueIdle()) process.exit(0);
	setTimeout(exitWhenIdle, 1e3);
}
process.on("disconnect", () => process.exit(0));
process.on("message", (message) => {
	if (message?.type === "shutdown") {
		shutdownRequested = true;
		exitWhenIdle();
		return;
	}
	if (typeof message?.id !== "number" || !message.method) return;
	const run = resolveUsageOffloadReader(message.method);
	if (!run) {
		process.send?.({
			id: message.id,
			ok: false,
			error: `unknown usage method ${message.method}`
		});
		return;
	}
	inFlight += 1;
	(async () => {
		try {
			const value = await run(message.params);
			process.send?.({
				id: message.id,
				ok: true,
				value
			});
		} catch (error) {
			process.send?.({
				id: message.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		} finally {
			inFlight -= 1;
			if (shutdownRequested) exitWhenIdle();
		}
	})();
});
