import { isAbsolute } from "node:path";

function requireAbsolutePath(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  const path = value.trim();
  if (!isAbsolute(path)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path;
}

export function buildWorkerEnvironment(baseEnv, options) {
  const gatewayConfigPath = requireAbsolutePath(
    options.gatewayConfigPath,
    "gatewayConfigPath",
  );
  const workerConfigPath = requireAbsolutePath(
    options.workerConfigPath,
    "workerConfigPath",
  );
  if (gatewayConfigPath === workerConfigPath) {
    throw new Error("gatewayConfigPath and workerConfigPath must be different");
  }
  return {
    ...baseEnv,
    VLAB_WORKER_CHILD: "1",
    VLAB_GATEWAY_CONFIG_PATH: gatewayConfigPath,
    VLAB_WORKER_CONFIG_PATH: workerConfigPath,
    // The embedded Agent runtime must read the overlay so model dispatch does
    // not recursively select this worker Harness.
    OPENCLAW_CONFIG_PATH: workerConfigPath,
  };
}

export function resolveWorkerExecEnv(event, env = process.env) {
  if (
    env.VLAB_WORKER_CHILD !== "1" ||
    event?.toolName !== "exec" ||
    event?.host === "sandbox"
  ) {
    return undefined;
  }
  const gatewayConfigPath = requireAbsolutePath(
    env.VLAB_GATEWAY_CONFIG_PATH,
    "VLAB_GATEWAY_CONFIG_PATH",
  );
  return {
    // Commands launched by the Agent are control-plane clients. They must see
    // the Gateway config, not the private runtime overlay used by this process.
    OPENCLAW_CONFIG_PATH: gatewayConfigPath,
    VLAB_ACTIVE_CONFIG_DOMAIN: "gateway",
  };
}
