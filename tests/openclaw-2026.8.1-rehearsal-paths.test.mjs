import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../scripts/rewrite-openclaw-2026.8.1-rehearsal-paths.mjs", import.meta.url);

test("rewrites copied config and transcript paths without touching the source tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw81-rehearsal-"));
  const source = path.join(root, "live");
  const target = path.join(root, "copy");
  const sessionsDir = path.join(target, "agents", "makaron", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  const sourceConfig = {
    agents: { entries: { makaron: { agentDir: `${source}/agents/makaron/agent` } } },
    plugins: { load: { paths: ["/opt/external-plugin"] } },
  };
  fs.writeFileSync(path.join(target, "openclaw.json"), JSON.stringify(sourceConfig));
  fs.writeFileSync(
    path.join(sessionsDir, "sessions.json"),
    JSON.stringify({
      "agent:makaron:test": {
        sessionId: "abc",
        sessionFile: `${source}/agents/makaron/sessions/abc.jsonl`,
      },
    }),
  );

  const result = spawnSync(
    process.execPath,
    [
      script.pathname,
      "--state-dir",
      target,
      "--source-state-dir",
      source,
      "--config",
      path.join(target, "openclaw.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(target, "openclaw.json")));
  const sessions = JSON.parse(fs.readFileSync(path.join(sessionsDir, "sessions.json")));
  assert.equal(config.agents.entries.makaron.agentDir, `${target}/agents/makaron/agent`);
  assert.equal(config.plugins.load.paths[0], "/opt/external-plugin");
  assert.equal(
    sessions["agent:makaron:test"].sessionFile,
    `${target}/agents/makaron/sessions/abc.jsonl`,
  );
  assert.equal(sourceConfig.agents.entries.makaron.agentDir, `${source}/agents/makaron/agent`);

  const second = spawnSync(
    process.execPath,
    [
      script.pathname,
      "--state-dir",
      target,
      "--source-state-dir",
      source,
      "--config",
      path.join(target, "openclaw.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(second.status, 0, second.stderr);
});

test("refuses session paths that do not belong to the live state tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw81-rehearsal-"));
  const source = path.join(root, "live");
  const target = path.join(root, "copy");
  const sessionsDir = path.join(target, "agents", "makaron", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(target, "openclaw.json"), "{}\n");
  fs.writeFileSync(
    path.join(sessionsDir, "sessions.json"),
    JSON.stringify({ bad: { sessionFile: "/another-host/transcript.jsonl" } }),
  );
  const result = spawnSync(
    process.execPath,
    [
      script.pathname,
      "--state-dir",
      target,
      "--source-state-dir",
      source,
      "--config",
      path.join(target, "openclaw.json"),
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside the source state directory/);
});
