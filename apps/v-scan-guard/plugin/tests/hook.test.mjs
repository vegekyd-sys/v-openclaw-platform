import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { MATCHER, blockText, commandText, createScanGuard, processText } from "../core/hook.js";

const WS = "/home/openclaw/makaron-openclaw/.openclaw-local/workspace";
const RUNAWAY = `grep -rl "chengpian-daily" /home/openclaw/.openclaw 2>/dev/null | head -10`;

function guardWithLog(config) {
  const lines = [];
  return { guard: createScanGuard({ config, log: (l) => lines.push(l) }), lines };
}

test("OpenClaw exec: blocked with guidance, nothing rewritten", () => {
  const { guard, lines } = guardWithLog();
  const params = { command: RUNAWAY, yieldMs: 20000 };
  const out = guard({ toolName: "exec", params }, { sessionKey: "agent:makaron:feishu:group:oc_x", runId: "r1", cwd: WS });
  assert.equal(out.block, true);
  assert.equal(out.params, undefined, "a block never carries rewritten params (Codex refuses them)");
  assert.match(out.blockReason, /grep -r` over \/home\/openclaw\/\.openclaw/u);
  assert.match(out.blockReason, /NIGHTSHIFT_URL=http:\/\/127\.0\.0\.1:24879/u);
  assert.match(out.blockReason, /openclaw automations list --all --json/u);
  assert.match(out.blockReason, /NO_PROXY=127\.0\.0\.1,localhost nightshiftctl/u);
  assert.equal(params.command, RUNAWAY);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^blocked grep -r over \/home\/openclaw\/\.openclaw .*session=agent:makaron:feishu:group:oc_x run=r1/u);
});

test("Codex exec_command as the native hook relay hands it over (toolName exec, cmd copied to command)", () => {
  const { guard } = guardWithLog();
  // native-hook-relay-codec.ts: exec_command -> exec; argv cmd is shell-quoted into command.
  const relayed = { toolName: "exec", params: { cmd: ["bash", "-lc", RUNAWAY], command: `bash -lc '${RUNAWAY.replace(/'/gu, `'\\''`)}'`, yield_time_ms: 60000 } };
  assert.equal(guard(relayed, { cwd: WS }).block, true);
  // a string cmd without command (older relay) is read too
  assert.equal(guard({ toolName: "exec", params: { cmd: RUNAWAY } }, {}).block, true);
  assert.equal(guard({ toolName: "exec_command", params: { cmd: ["grep", "-r", "x", "/home/openclaw/.openclaw"] } }, {}).block, true);
});

test("process write / paste / send-keys literal text is checked; other process actions are not", () => {
  const { guard } = guardWithLog();
  for (const params of [
    { action: "write", sessionId: "s", data: "grep -r x /home/openclaw/.openclaw\n" },
    { action: "paste", sessionId: "s", text: "du -sh /home/openclaw/.openclaw/nightshift/instances/*\n" },
    { action: "send-keys", sessionId: "s", literal: "find ~ -name x" },
  ]) assert.equal(guard({ toolName: "process", params }, {})?.block, true, JSON.stringify(params));
  assert.equal(guard({ toolName: "process", params: { action: "poll", sessionId: "s" } }, {}), undefined);
  assert.equal(guard({ toolName: "process", params: { action: "write", sessionId: "s", data: "ls\n" } }, {}), undefined);
});

test("normal commands and other tools pass untouched", () => {
  const { guard, lines } = guardWithLog();
  assert.equal(guard({ toolName: "exec", params: { command: "ls -la && grep -rn foo ." } }, { cwd: WS }), undefined);
  assert.equal(guard({ toolName: "exec", params: { command: "grep -r foo .", workdir: "/home/openclaw/.openclaw" } }, { cwd: WS })?.block, true, "workdir wins over the session cwd");
  assert.equal(guard({ toolName: "read", params: { path: "/home/openclaw/.openclaw" } }, {}), undefined);
  assert.equal(guard({ toolName: "web_search", params: { query: "grep -r x /" } }, {}), undefined);
  assert.equal(lines.length, 1);
});

test("warn mode logs and lets the call run", () => {
  const { guard, lines } = guardWithLog({ mode: "warn" });
  assert.equal(guard({ toolName: "exec", params: { command: RUNAWAY } }, {}), undefined);
  assert.match(lines[0], /^would block grep -r/u);
});

test("an internal error lets the call through (the runner would turn a throw into a block)", () => {
  const { guard, lines } = guardWithLog();
  const evil = { toolName: "exec", get params() { throw new Error("boom"); } };
  assert.equal(guard(evil, {}), undefined);
  assert.match(lines[0], /^error, letting the call through/u);
});

test("config: extra roots, findMaxDepth, home", () => {
  const { guard } = guardWithLog({ extraProtectedRoots: ["/srv/media"], findMaxDepth: 1 });
  assert.equal(guard({ toolName: "exec", params: { command: "grep -r x /srv/media" } }, {})?.block, true);
  assert.equal(guard({ toolName: "exec", params: { command: "find /home/openclaw/.openclaw -maxdepth 2 -name x" } }, {})?.block, true);
  assert.equal(blockText({ tool: "find", root: "/x" }, { findMaxDepth: 1 }).includes("depth limit of 1"), true);
});

test("helpers", () => {
  assert.equal(commandText({ command: "a", cmd: ["b c", "d"] }), "a\n'b c' d");
  assert.equal(processText({ action: "kill", data: "x" }), "");
  assert.deepEqual(MATCHER, ["exec", "process"]);
});

test("manifest, package and entry agree", () => {
  const dir = new URL("../", import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL("openclaw.plugin.json", dir), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", dir), "utf8"));
  const entry = fs.readFileSync(new URL("index.js", dir), "utf8");
  assert.equal(manifest.id, "v-scan-guard");
  assert.match(entry, /id: "v-scan-guard"/u);
  assert.deepEqual(pkg.openclaw.extensions, ["./index.js"]);
  assert.match(entry, /matcher: \[\.\.\.MATCHER\]/u);
  assert.deepEqual(Object.keys(manifest.configSchema.properties).sort(), ["extraProtectedRoots", "findMaxDepth", "home", "mode", "protectedRoots"]);
});
