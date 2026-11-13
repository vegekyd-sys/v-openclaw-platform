// usage-offload-v1: worker process for usage-offload-v1.js. It answers one message per call (a reader
// or a whole usage RPC handler), runs background rollup refreshes in its own event loop, exits on
// "shutdown" once its refresh queue is idle, and exits immediately when the Gateway's IPC channel
// closes. Source: openclaw-versa src/infra/session-cost-usage-offload-child.ts.
import { isCostUsageRefreshQueueIdle } from "./session-cost-usage-C_mE_GAE.js";
import { resolveUsageOffloadReader } from "./usage-offload-v1.js";
const WORKER_RPC_CLIENT = { connect: { scopes: ["operator.admin"] } };
async function runRpc(message) {
	const { usageHandlersInProcess } = await import("./usage-C3nh9kcO.js");
	const handler = usageHandlersInProcess[message.rpc];
	if (!handler) throw new Error(`unknown usage rpc ${message.rpc}`);
	return await new Promise((resolve, reject) => {
		Promise.resolve(handler({
			params: message.params ?? {},
			context: { getRuntimeConfig: () => message.config },
			client: WORKER_RPC_CLIENT,
			respond: (ok, payload, error) => resolve({
				ok,
				payload,
				error
			}),
			req: {
				type: "req",
				id: `usage-offload-${message.id}`,
				method: message.rpc
			},
			isWebchatConnect: () => false
		})).catch(reject);
	});
}
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
	if (typeof message?.id !== "number" || !message.method && !message.rpc) return;
	const reader = message.method ? resolveUsageOffloadReader(message.method) : void 0;
	const run = message.rpc ? () => runRpc(message) : reader;
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
