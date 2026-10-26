// The inter-session dist patches are generated from V's captured bytes (design §3.0).
// tests/fixtures/inter-session-v-bytes.json names every R1 + R2 target; this keeps it
// honest: each entry exists in git, hashes to the recorded sha256, and agrees with
// the capture manifest it came from.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/inter-session-v-bytes.json"), "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const R1 = ["sessions-spawn-tool-1FQMTkIo.js", "openclaw-tools-BODVdJQD.js", "get-reply-CqW1y05D.js", "agent-runner.runtime-CAdsMsQt.js", "dispatch-from-config-DOJq_7CI.js", "task-registry-activity-DSlVVJwD.js", "monitor.account-WFdlCDhR.js"];
const R2 = ["telegram-ingress-drain-factory-DJM2Jqrc.js", "bot-message-DC6p8sB3.js", "v-experience.js", "connection-DCvu-l09.mjs", "message-handler-BUoLSylZ.mjs", "v-experience.mjs", "monitor.js", "v-experience.mjs"];

test("inter-session V bytes: the fixture lists exactly the §3.0 R1 and R2 targets", () => {
  assert.equal(fixture.capture, "v2026.9.1-db91.6-subagent-index-20261020");
  assert.deepEqual(fixture.files.filter((f) => f.release === "R1").map((f) => f.file).sort(), [...R1].sort());
  assert.deepEqual(fixture.files.filter((f) => f.release === "R2").map((f) => f.file).sort(), [...R2].sort());
  const keys = fixture.files.map((f) => `${f.component}:${f.manifestPath}`);
  assert.equal(new Set(keys).size, keys.length, "no target listed twice");
});

test("inter-session V bytes: every captured file is in git with the recorded sha256", () => {
  for (const f of fixture.files) {
    assert(f.captured.startsWith(`release/captured/${fixture.capture}`), f.captured);
    const file = path.join(repo, f.captured);
    assert(fs.existsSync(file), `missing capture: ${f.captured}`);
    assert.equal(sha256(file), f.sha256, f.captured);
    assert.equal(fs.statSync(file).size, f.bytes, f.captured);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, f.manifest), "utf8"));
    const entry = manifest.files.find((e) => e.path === f.manifestPath);
    assert(entry, `${f.manifestPath} not in ${f.manifest}`);
    assert.equal(entry.sha256, f.sha256, f.manifestPath);
    assert.equal(f.hostPath, `${manifest.capturedFrom.runtimeDir}/${f.manifestPath.slice(2)}`);
    assert.equal(path.posix.basename(f.captured), f.file);
  }
});
