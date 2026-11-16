// v-health-summary-worker-v1: runs readSessionStoreSummaryReadOnly for the health collector off the main thread.
import { parentPort } from "node:worker_threads";
const { readSessionStoreSummaryReadOnly } = await import("./session-accessor-Dj50cDcA.js");
const { isTransientSqliteError } = await import("./unhandled-rejections-FEKr3n0D.js");
parentPort.on("message", ({ id, requests }) => {
	const results = requests.map(({ scope, options }) => {
		try {
			return { summary: readSessionStoreSummaryReadOnly(scope, options) };
		} catch (error) {
			return { error: {
				transient: isTransientSqliteError(error),
				name: error?.name,
				message: error instanceof Error ? error.message : String(error),
				code: error?.code
			} };
		}
	});
	parentPort.postMessage({ id, results });
});
