import assert from "node:assert/strict";
import {
  buildWorkerEnvironment,
  resolveWorkerExecEnv,
} from "./exec-env.mjs";

const gatewayConfigPath = "/srv/vlab/state/openclaw.json";
const workerConfigPath =
  "/srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json";
const workerEnv = buildWorkerEnvironment(
  {
    HOME: "/srv/vlab",
    OPENCLAW_CONFIG_PATH: gatewayConfigPath,
  },
  {
    gatewayConfigPath,
    workerConfigPath,
  },
);

assert.equal(workerEnv.OPENCLAW_CONFIG_PATH, workerConfigPath);
assert.equal(workerEnv.VLAB_GATEWAY_CONFIG_PATH, gatewayConfigPath);
assert.equal(workerEnv.VLAB_WORKER_CONFIG_PATH, workerConfigPath);
assert.equal(workerEnv.VLAB_WORKER_CHILD, "1");

assert.deepEqual(
  resolveWorkerExecEnv(
    {
      toolName: "exec",
      host: "gateway",
    },
    workerEnv,
  ),
  {
    OPENCLAW_CONFIG_PATH: gatewayConfigPath,
    VLAB_ACTIVE_CONFIG_DOMAIN: "gateway",
  },
);
assert.equal(
  resolveWorkerExecEnv(
    {
      toolName: "exec",
      host: "sandbox",
    },
    workerEnv,
  ),
  undefined,
);
assert.equal(
  resolveWorkerExecEnv(
    {
      toolName: "exec",
      host: "gateway",
    },
    {
      ...workerEnv,
      VLAB_WORKER_CHILD: "0",
    },
  ),
  undefined,
);
assert.throws(
  () =>
    buildWorkerEnvironment(
      {},
      {
        gatewayConfigPath,
        workerConfigPath: gatewayConfigPath,
      },
    ),
  /must be different/,
);
assert.throws(
  () =>
    resolveWorkerExecEnv(
      {
        toolName: "exec",
        host: "gateway",
      },
      {
        VLAB_WORKER_CHILD: "1",
      },
    ),
  /VLAB_GATEWAY_CONFIG_PATH is required/,
);

console.log(
  JSON.stringify({
    ok: true,
    workerRuntimeConfig: workerConfigPath,
    workerExecConfig: gatewayConfigPath,
  }),
);
