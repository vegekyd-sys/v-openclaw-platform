#!/usr/bin/env node
// A Codex thread whose turn failed upstream can take the next message at once.
//
//   node patch-codex-failed-thread-resume.mjs <@openclaw/codex/dist> [--check]
//
// After a 503, 429, 402 or a cut stream Codex ends the turn (turn/completed, failed) and leaves the
// thread loaded in status systemError. OpenClaw then unsubscribed, and refused the next message
// with "Codex session became active in another runner", though nothing was running, until Codex
// unloaded the thread 60 s after the last subscriber left.
//
//   A. A turn Codex itself reports as failed keeps its subscription, as a completed turn does. The
//      next message with the same config reuses the live thread and needs no thread/resume.
//   B. If the config did change, systemError no longer counts as active: drop the subscription and
//      wait for Codex to confirm the unload, which a config change needs anyway.
//
// Timeouts, aborts and closed clients keep the old path: there the turn may still be running.
// Upstream 2026.9.5 also stopped treating systemError as active, but recovers by retiring the whole
// app-server, only when no other thread uses it. V's app-server is shared, so it would rarely apply.
//
// Idempotent: every anchor must match exactly once, or its replacement must already be present.
// Written against the Codex dist V runs on 2026-10-31 (whole-dist sha256 4660540e).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith("--"));
const checkOnly = args.includes("--check");
assert(dist, "usage: patch-codex-failed-thread-resume.mjs <dist dir> [--check]");

const TARGETS = {
  "run-attempt-": [
    // A. only what Codex itself reported as failed; any other unsuccessful end may still be running
    ["\tterminalState.turnSucceeded = turnSucceeded;\n",
      "\tterminalState.turnSucceeded = turnSucceeded;\n\tterminalState.turnFailedSettled = !turnSucceeded && !finalAborted && !effectiveTimedOut && clientClosedPromptErrorForFinal === void 0 && completedTurnStatus === \"failed\";\n"],
    ["&& resourceState.thread.liveThreadEphemeralPolicy !== void 0 || terminalState.turnSucceeded && !isIncognitoSessionKey(params.sessionKey)",
      "&& resourceState.thread.liveThreadEphemeralPolicy !== void 0 || (terminalState.turnSucceeded || terminalState.turnFailedSettled) && !isIncognitoSessionKey(params.sessionKey)"],
  ],
  "thread-lifecycle-": [
    // B. systemError is a finished turn; its unload comes 60 s after the last subscriber left
    [`	if (thread.status?.type !== "idle" && thread.status?.type !== "notLoaded") throw new CodexAdoptedThreadActiveError();
	let unloaded = thread.status.type === "notLoaded";
	return {
		dispose: params.client.addNotificationHandler((notification) => {
			if (notification.method === "thread/status/changed" && isJsonObject(notification.params) && notification.params.threadId === thread.id && isJsonObject(notification.params.status) && notification.params.status.type === "notLoaded") unloaded = true;
		}),
`, `	if (thread.status?.type !== "idle" && thread.status?.type !== "notLoaded" && thread.status?.type !== "systemError") throw new CodexAdoptedThreadActiveError();
	const settledSystemError = thread.status.type === "systemError";
	let unloaded = thread.status.type === "notLoaded";
	let onUnloaded;
	return {
		dispose: params.client.addNotificationHandler((notification) => {
			if (notification.method === "thread/status/changed" && isJsonObject(notification.params) && notification.params.threadId === thread.id && isJsonObject(notification.params.status) && notification.params.status.type === "notLoaded") {
				unloaded = true;
				onUnloaded?.();
			}
		}),
		waitForSettledUnload: async () => {
			if (!settledSystemError || unloaded) return;
			await new Promise((resolve) => {
				const timer = setTimeout(resolve, 75e3);
				onUnloaded = () => {
					clearTimeout(timer);
					resolve();
				};
				params.signal?.addEventListener("abort", onUnloaded, { once: true });
			});
			params.signal?.removeEventListener("abort", onUnloaded);
			onUnloaded = void 0;
		},
`],
    [`						await releaseRetainedThread(binding.threadId, binding.clientId, configuration.assertCurrent);
						configuration.assertCurrent();
						const resumed = await resumeExistingCodexThread(params, {
`, `						await releaseRetainedThread(binding.threadId, binding.clientId, configuration.assertCurrent);
						configuration.assertCurrent();
						await configuration.waitForSettledUnload();
						configuration.assertCurrent();
						const resumed = await resumeExistingCodexThread(params, {
`],
  ],
};

for (const [prefix, patches] of Object.entries(TARGETS)) {
  const hits = fs.readdirSync(dist).filter((f) => f.startsWith(prefix) && f.endsWith(".js") && !f.includes(".bak"));
  assert.equal(hits.length, 1, `expected one ${prefix}*.js in ${dist}, found ${hits.length}`);
  const file = path.join(dist, hits[0]);
  const before = fs.readFileSync(file, "utf8");
  let text = before;
  for (const [from, to] of patches) {
    if (text.includes(to)) continue;
    assert.equal(text.split(from).length, 2, `${hits[0]}: anchor must match once: ${from.slice(0, 70)}`);
    text = text.replace(from, () => to);
  }
  if (checkOnly) assert.equal(text, before, `${hits[0]}: patch not applied`);
  else if (text !== before) fs.writeFileSync(file, text);
}
