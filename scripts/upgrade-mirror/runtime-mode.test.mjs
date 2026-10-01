import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { convertConfig } from "./noworker96-config.mjs";
import { acceptanceRpcs, probeFailures, runtimeMode } from "./runtime-mode.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = () =>
  JSON.parse(fs.readFileSync(path.join(here, "fixtures", "noworker96", "openclaw.json"), "utf8"));
const converted = () => convertConfig(fixture(), { pluginPath: "/srv/example/versa-runtime-providers" }).config;
const noEnv = {};

const healthy = (loaded) => ({ ok: true, plugins: { loaded, errors: [] } });

test("the mirror config is worker mode before conversion and no-worker after", () => {
  assert.equal(runtimeMode(fixture(), noEnv), "worker");
  assert.equal(runtimeMode(converted(), noEnv), "no-worker");
});

test("a leftover vlab-worker route keeps worker mode even with the plugin disabled", () => {
  const config = converted();
  config.agents.defaults.models["deepseek/deepseek-v4-pro"].agentRuntime.id = "vlab-worker";
  assert.equal(runtimeMode(config, noEnv), "worker");
});

test("VERSA_RUNTIME_MODE overrides the config", () => {
  assert.equal(runtimeMode(fixture(), { VERSA_RUNTIME_MODE: "no-worker" }), "no-worker");
  assert.equal(runtimeMode(converted(), { VERSA_RUNTIME_MODE: "worker" }), "worker");
});

test("worker-mode probe keeps its strict checks", () => {
  assert.deepEqual(
    probeFailures({ mode: "worker", health: healthy(["vlab-agent-worker-isolation"]), workers: { started: true } }),
    [],
  );
  assert.deepEqual(probeFailures({ mode: "worker", health: healthy([]), workers: { error: "unknown method" } }), [
    "worker plugin not loaded",
    "worker pool not started",
  ]);
});

test("no-worker probe passes without a pool and fails on a half-converted Gateway", () => {
  assert.deepEqual(
    probeFailures({ mode: "no-worker", health: healthy(["versa-runtime-providers"]), workers: null }),
    [],
  );
  assert.deepEqual(
    probeFailures({
      mode: "no-worker",
      health: healthy(["vlab-agent-worker-isolation"]),
      workers: null,
    }),
    ["worker plugin loaded in no-worker mode", "versa-runtime-providers not loaded"],
  );
  assert.deepEqual(
    probeFailures({
      mode: "no-worker",
      health: { ok: false, plugins: { loaded: ["versa-runtime-providers"], errors: [{ id: "x" }] } },
    }),
    ["health not ok", "plugin errors"],
  );
});

test("acceptance asks vlab.workers.status only when a pool exists", () => {
  assert.ok(acceptanceRpcs("worker").some(([method]) => method === "vlab.workers.status"));
  assert.ok(!acceptanceRpcs("no-worker").some(([method]) => method === "vlab.workers.status"));
});

test("the V sentinel reads the same mode from the same configs", { skip: !hasPython() && "python3 missing" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-mode-"));
  const sentinel = path.join(here, "..", "v-sentinel", "sentinel.py");
  const cases = [fixture(), converted()];
  const leftover = converted();
  leftover.models.providers.deepseek.agentRuntime.id = "vlab-worker";
  cases.push(leftover);
  for (const [index, config] of cases.entries()) {
    const file = path.join(dir, `c${index}.json`);
    fs.writeFileSync(file, JSON.stringify(config));
    const script = [
      "import importlib.util, sys",
      "spec = importlib.util.spec_from_file_location('s', sys.argv[1])",
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "m.MODE_OVERRIDE = ''",
      "print('worker' if m.worker_mode(sys.argv[2]) else 'no-worker')",
    ].join("\n");
    const fromSentinel = execFileSync("python3", ["-c", script, sentinel, file], { encoding: "utf8" }).trim();
    assert.equal(fromSentinel, runtimeMode(config, noEnv), `case ${index}`);
  }
});

function hasPython() {
  try {
    execFileSync("python3", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
