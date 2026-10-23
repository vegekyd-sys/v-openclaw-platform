import assert from 'node:assert/strict';

// sqlite-hold-callsite-v1: name the caller in "slow SQLite transaction hold" (2026-10-16).
//
// V's Gateway holds the makaron Agent DB writer 9-12 s at a time (2026-10-16 08:01 11.8 s,
// 11:51 9.1 s); every other turn that waits more than 5 s for it fails with "Agent DB process
// coordinator wait exceeded 5000ms" and the user sees the reply stop. The file log only says
// {operation: "agent.write", elapsedMs, pid}: nothing tells which code held the transaction.
//
// node-sqlite's runSqliteTransactionSync is synchronous (a Promise result throws), and it calls
// logSlowTransactionHold before it returns. The call stack at that moment is therefore the stack
// that entered the transaction, so the stack is read only when a hold is already over the
// threshold (1000 ms, unchanged): a transaction under the threshold runs no new code.
//
// The wrapper frames (node-sqlite itself, and for agent.write everything up to and including
// runOpenClawAgentWriteTransaction: begin-contention retry, post-commit publications, the process
// coordinator) are dropped; the next CALLER_FRAMES frames go into the same log line as `callers`,
// each "function (dir/file.js:line:col)". Any failure here logs the line without `callers`.
export const MARKER = 'sqlite-hold-callsite-v1';
export const CALLER_FRAMES = 8;

export const HELPER = `//#region V ${MARKER}: who entered a slow SQLite transaction (logging only)
function __vSqliteHoldCallers() {
	try {
		const limit = Error.stackTraceLimit;
		let stack;
		Error.stackTraceLimit = 40;
		try {
			stack = new Error().stack;
		} finally {
			Error.stackTraceLimit = limit;
		}
		if (typeof stack !== "string") return void 0;
		const frames = [];
		for (const line of stack.split("\\n")) {
			const text = line.trim();
			if (!text.startsWith("at ")) continue;
			frames.push(text.slice(3).replace(/(?:file:\\/\\/)?\\/(?:[^\\s()/]+\\/)*([^\\s()/]+\\/[^\\s()/]+:\\d+:\\d+)/gu, "$1"));
		}
		let start = frames.findIndex((frame) => /^(?:[\\w$]+\\.)?runOpenClawAgentWriteTransaction\\b/u.test(frame));
		if (start >= 0) start += 1;
		else {
			start = frames.findIndex((frame) => !/\\bnode-sqlite-[^\\s/()]*\\.js:/u.test(frame));
			if (start < 0) return void 0;
		}
		const callers = frames.slice(start, start + ${CALLER_FRAMES});
		return callers.length > 0 ? callers : void 0;
	} catch {
		return void 0;
	}
}
//#endregion
`;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const HOLD_LOG = `function logSlowTransactionHold(params) {
	if (params.elapsedMs < slowTransactionHoldThresholdMs(params.options)) return;
	transactionLogger(params.options).warn("slow SQLite transaction hold", {
		async: false,
		...params.options?.databaseLabel ? { database: params.options.databaseLabel } : {},
		elapsedMs: params.elapsedMs,
		...params.options?.operationLabel ? { operation: params.options.operationLabel } : {},
		pid: process.pid,
		thresholdMs: slowTransactionHoldThresholdMs(params.options)
	});
}
`;

const HOLD_LOG_PATCHED = `function logSlowTransactionHold(params) {
	if (params.elapsedMs < slowTransactionHoldThresholdMs(params.options)) return;
	const callers = __vSqliteHoldCallers(); // V ${MARKER}
	transactionLogger(params.options).warn("slow SQLite transaction hold", {
		async: false,
		...params.options?.databaseLabel ? { database: params.options.databaseLabel } : {},
		elapsedMs: params.elapsedMs,
		...params.options?.operationLabel ? { operation: params.options.operationLabel } : {},
		pid: process.pid,
		thresholdMs: slowTransactionHoldThresholdMs(params.options),
		...callers ? { callers } : {}
	});
}
`;

// dist/node-sqlite-*.js
export function patchNodeSqlite(source) {
  assert(!source.includes(MARKER), `already carries ${MARKER}`);
  const region = '//#region src/infra/sqlite-transaction.ts\n';
  let out = replaceExactlyOnce(source, region, `${HELPER}${region}`, 'sqlite-transaction region');
  out = replaceExactlyOnce(out, HOLD_LOG, HOLD_LOG_PATCHED, 'logSlowTransactionHold');
  return out;
}
