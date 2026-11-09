#!/usr/bin/env node
// Candidate-only, on top of the watchdog patch: prove the quiet paths the watchdog must not touch.
//
//   [model-wait-trace] one line per notification gap >= MODEL_WAIT_TRACE_GAP_MS on the current turn,
//     with the method that ended it, so real tool-argument silence can be measured
//   CANDIDATE_DYNAMIC_TOOL_SLEEP_MS: every OpenClaw dynamic tool call first waits this long, a stand-in
//     for a long computer or browser round (a server request with no notifications)
//
//   node codex-model-wait-trace.mjs <@openclaw/codex/dist>
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2];
assert(dist, "usage: codex-model-wait-trace.mjs <dist dir>");
const name = fs.readdirSync(dist).find((f) => f.startsWith("run-attempt-") && f.endsWith(".js") && !f.includes(".bak"));
const file = path.join(dist, name);
let text = fs.readFileSync(file, "utf8");
const patch = (from, to) => {
  if (text.includes(to)) return;
  assert.equal(text.split(from).length, 2, `anchor: ${from.slice(0, 60)}`);
  text = text.replace(from, () => to);
};
patch("\t\t\tmodelWait.note(notification);\n", `			{
				const __now = Date.now();
				const __gap = __now - (globalThis.__mwLast?.[turnId] ?? __now);
				(globalThis.__mwLast ??= {})[turnId] = __now;
				if (__gap >= Number(process.env.MODEL_WAIT_TRACE_GAP_MS ?? 5000)) console.error("[model-wait-trace] " + JSON.stringify({ gapMs: __gap, ended: notification.method, type: notification.params?.item?.type }));
			}
			modelWait.note(notification);
`);
patch("\t\t\t\t\tconst response = await handleDynamicToolCallWithTimeout({", `					if (process.env.CANDIDATE_DYNAMIC_TOOL_SLEEP_MS) await new Promise((resolve) => setTimeout(resolve, Number(process.env.CANDIDATE_DYNAMIC_TOOL_SLEEP_MS)));
					const response = await handleDynamicToolCallWithTimeout({`);
fs.writeFileSync(file, text);
