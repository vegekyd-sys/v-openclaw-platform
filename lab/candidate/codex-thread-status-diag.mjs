#!/usr/bin/env node
// Candidate-only probe: log what Codex says about a thread and why OpenClaw refuses to resume it.
//   node codex-thread-status-diag.mjs <@openclaw/codex/dist>
// Lines go to the Gateway's stderr with the prefix [codex-thread-diag]. Never shipped.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2];
assert(dist, "usage: codex-thread-status-diag.mjs <dist dir>");
const log = (expr) => `process.stderr.write("[codex-thread-diag] " + JSON.stringify(${expr}) + "\\n");`;
const patches = {
  "shared-client-": [
    ["\thandleNotification(notification) {\n",
      `\thandleNotification(notification) {\n\t\tif (/^(thread\\/status\\/changed|thread\\/closed|turn\\/started|turn\\/completed|error)$/u.test(notification.method)) ${log(`{ at: Date.now(), n: notification.method, p: notification.params && { threadId: notification.params.threadId, status: notification.params.status, willRetry: notification.params.willRetry, turn: notification.params.turn && { id: notification.params.turn.id, status: notification.params.turn.status }, message: notification.params.error && String(notification.params.error.message).slice(0, 80) } }`)}\n`],
    ["\t\tawait client.request(\"thread/unsubscribe\", { threadId }, {\n\t\t\ttimeoutMs,\n\t\t\tassertCurrent\n\t\t});\n",
      `\t\tconst diagUnsub = await client.request("thread/unsubscribe", { threadId }, {\n\t\t\ttimeoutMs,\n\t\t\tassertCurrent\n\t\t});\n\t\t${log(`{ at: Date.now(), n: "unsubscribe-result", threadId, r: diagUnsub, claimed: runtime?.claimedThreads.has(threadId) }`)}\n`],
  ],
  "thread-lifecycle-": [
    ["function observeCodexThreadConfiguration(params, thread, assertCurrent) {\n",
      `function observeCodexThreadConfiguration(params, thread, assertCurrent) {\n\t${log(`{ at: Date.now(), n: "observe", threadId: thread.id, status: thread.status, claimed: isCodexAppServerLiveThreadClaimed(params.client, thread.id) }`)}\n`],
  ],
};
for (const [prefix, list] of Object.entries(patches)) {
  const files = fs.readdirSync(dist).filter((f) => f.startsWith(prefix) && f.endsWith(".js") && !f.includes(".bak"));
  assert.equal(files.length, 1, prefix);
  const file = path.join(dist, files[0]);
  let text = fs.readFileSync(file, "utf8");
  for (const [from, to] of list) {
    if (text.includes(to)) continue;
    assert.equal(text.split(from).length, 2, `anchor ${from.slice(0, 50)}`);
    text = text.replace(from, () => to);
  }
  fs.writeFileSync(file, text);
}
