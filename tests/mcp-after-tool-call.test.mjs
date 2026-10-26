import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

import { FILE, MARKER, patchMcpAfterToolCall } from "../lab/release-files/mcp-after-tool-call/patch.mjs";

// V runs upstream 9.1's file unchanged (sha256 6a1e20fc…); the patch is generated from it.
const SOURCE = new URL(`../lab/release-files/mcp-after-tool-call/source/${FILE}`, import.meta.url);
const GENERATED = new URL(`../lab/release-files/mcp-after-tool-call/generated/${FILE}`, import.meta.url);

test("the committed file is exactly the patch of the bytes V runs", () => {
  const source = fs.readFileSync(SOURCE, "utf8");
  assert.match(execFileSync("shasum", ["-a", "256", SOURCE.pathname], { encoding: "utf8" }), /^6a1e20fca020096809a48fc2882e147084144c620004c2ebca23697c563d0371 /u);
  assert.equal(patchMcpAfterToolCall(source), fs.readFileSync(GENERATED, "utf8"));
  execFileSync(process.execPath, ["--check", GENERATED.pathname]);
});

test("loopback MCP tool calls report to after_tool_call like 9.8, then to the old observer", () => {
  const patched = fs.readFileSync(GENERATED, "utf8");
  assert.match(patched, /import \{ t as runAgentHarnessAfterToolCallHook \} from "\.\/hook-helpers-D11aAm0B\.js";/u);
  const report = patched.slice(patched.indexOf("const reportToolCallResult = (outcome) => {"), patched.indexOf("params.onToolCallResult?.({"));
  assert.match(report, new RegExp(MARKER));
  assert.match(report, /void runAgentHarnessAfterToolCallHook\(\{/u);
  assert.match(report, /sessionKey: params\.hookContext\?\.sessionKey/u);
  assert.match(report, /result: outcome\?\.outcome === "completed" \? outcome\.result : void 0/u);
  assert.match(report, /\}\)\.catch\(\(\) => \{\}\);/u, "a failing hook never breaks the tool call");
  assert.throws(() => patchMcpAfterToolCall(patched), /already patched/u);
});
