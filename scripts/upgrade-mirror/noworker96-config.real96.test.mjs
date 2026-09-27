// Validates the converted synthetic fixture with a real OpenClaw 9.6 build.
// Needs a built checkout, so it is a deferred test in platform/catalog.json:
//   OPENCLAW96_ROOT=~/openclaw-versa-wt/merge96 node --test scripts/upgrade-mirror/noworker96-config.real96.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "./noworker96-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = () =>
  JSON.parse(fs.readFileSync(path.join(here, "fixtures", "noworker96", "openclaw.json"), "utf8"));
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "noworker96-real-"));
function captureMain(argv) {
  const out = [];
  const err = [];
  const code = main(argv, { log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("converted fixture passes the 9.6 config validator", {
  skip: !process.env.OPENCLAW96_ROOT && "set OPENCLAW96_ROOT to a built OpenClaw 9.6 checkout",
  timeout: 300_000,
}, () => {
  const dir = tempDir();
  const fakeWorker = path.join(dir, "worker");
  fs.mkdirSync(fakeWorker);
  fs.copyFileSync(
    path.join(here, "..", "..", "release", "components", "worker-0.2.11-versa95.1", "openclaw.plugin.json"),
    path.join(fakeWorker, "openclaw.plugin.json"),
  );
  const config = loadFixture();
  config.plugins.load.paths = [fakeWorker];
  config.agents.defaults.workspace = path.join(dir, "ws");
  for (const [id, entry] of Object.entries(config.agents.entries)) entry.workspace = path.join(dir, `ws-${id}`);
  const configPath = path.join(dir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const pluginPath = path.join(here, "..", "..", "release", "components", "versa-runtime-providers-0.1.0");
  assert.equal(captureMain(["--config", configPath, "--plugin-path", pluginPath, "--disable-mcp", "voice-memory"]).code, 0);
  const output = execFileSync(process.execPath, ["openclaw.mjs", "config", "validate"], {
    cwd: process.env.OPENCLAW96_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: dir,
      OPENCLAW_STATE_DIR: path.join(dir, "state"),
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_GATEWAY_TOKEN: "x",
      DEEPSEEK_API_KEY: "x",
    },
  });
  assert.match(output, /Config valid/);
  assert.doesNotMatch(output, /plugin not found|versa-runtime-providers.*invalid/);
});
