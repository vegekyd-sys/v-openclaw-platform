import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const GATEWAY_OWNED_TOOL_PROXY_KEY =
  "versa.vlab.gateway-owned-tool-proxy-v1";
export const GATEWAY_OWNED_TOOL_PROXY_SYMBOL = Symbol.for(
  GATEWAY_OWNED_TOOL_PROXY_KEY,
);

const DEFAULT_TIMEOUT_MS = 310_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function errorFromEnvelope(envelope, stderr) {
  const message =
    envelope?.error?.message ??
    (stderr.trim() || "Gateway-owned tool subprocess failed");
  const error = new Error(message);
  if (envelope?.error?.name) {
    error.name = envelope.error.name;
  }
  if (envelope?.error?.code) {
    error.code = envelope.error.code;
  }
  return error;
}

function subprocessTimeoutError(toolName, timeoutMs) {
  const error = new Error(
    `${toolName} isolated tool process timed out after ${timeoutMs}ms`,
  );
  error.code = "VLAB_GATEWAY_OWNED_TOOL_TIMEOUT";
  return error;
}

export function createGatewayOwnedToolProxy(options = {}) {
  const runnerPath =
    options.runnerPath ??
    fileURLToPath(new URL("./skill-workshop-subprocess-runner.mjs", import.meta.url));
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1_000, Number(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const stats = {
    calls: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    lastTool: undefined,
    lastElapsedMs: undefined,
    lastErrorCode: undefined,
  };

  const execute = async (request) => {
    const toolName =
      typeof request?.toolName === "string" && request.toolName.trim()
        ? request.toolName.trim()
        : "unknown";
    const startedAt = Date.now();
    stats.calls += 1;
    stats.lastTool = toolName;

    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [runnerPath], {
          env: {
            ...process.env,
            VLAB_GATEWAY_OWNED_TOOL_SUBPROCESS: "1",
            OPENCLAW_SKILL_WORKSHOP_TIMEOUT_MS:
              process.env.VLAB_SKILL_WORKSHOP_SUBPROCESS_TIMEOUT_MS ??
              "300000",
          },
          // fd 3 is a dedicated result channel. OpenClaw and plugins may write
          // diagnostics to stdout while tools are being constructed, so stdout
          // cannot safely double as the machine-readable protocol.
          stdio: ["pipe", "pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let protocol = "";
        let settled = false;
        const finish = (error, value) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        };
        const append = (current, chunk) => {
          const next = current + chunk.toString("utf8");
          if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
            child.kill("SIGKILL");
            finish(
              Object.assign(
                new Error(`${toolName} isolated tool output exceeded 2 MiB`),
                { code: "VLAB_GATEWAY_OWNED_TOOL_OUTPUT_LIMIT" },
              ),
            );
            return current;
          }
          return next;
        };
        child.stdout.on("data", (chunk) => {
          stdout = append(stdout, chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr = append(stderr, chunk);
        });
        child.stdio[3].on("data", (chunk) => {
          protocol = append(protocol, chunk);
        });
        child.on("error", (error) => finish(error));
        child.on("exit", (code, signal) => {
          let envelope;
          try {
            envelope = JSON.parse(protocol.trim());
          } catch {
            finish(
              Object.assign(
                new Error(
                  `${toolName} isolated tool returned invalid JSON ` +
                    `(code=${String(code)} signal=${String(signal)}): ` +
                    `${stderr.trim() || stdout.trim()}`,
                ),
                { code: "VLAB_GATEWAY_OWNED_TOOL_INVALID_RESULT" },
              ),
            );
            return;
          }
          if (code === 0 && envelope?.ok === true) {
            finish(undefined, envelope.result);
          } else {
            finish(errorFromEnvelope(envelope, stderr));
          }
        });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(subprocessTimeoutError(toolName, timeoutMs));
        }, timeoutMs);
        timer.unref?.();
        child.stdin.end(`${JSON.stringify(request)}\n`);
      });
      stats.succeeded += 1;
      stats.lastErrorCode = undefined;
      return result;
    } catch (error) {
      stats.failed += 1;
      if (error?.code === "VLAB_GATEWAY_OWNED_TOOL_TIMEOUT") {
        stats.timedOut += 1;
      }
      stats.lastErrorCode = error?.code;
      throw error;
    } finally {
      stats.lastElapsedMs = Date.now() - startedAt;
    }
  };

  return {
    execute,
    status: () => ({ ...stats, timeoutMs }),
  };
}

export function installGatewayOwnedToolProxy(options = {}) {
  const proxy = createGatewayOwnedToolProxy(options);
  globalThis[GATEWAY_OWNED_TOOL_PROXY_SYMBOL] = proxy.execute;
  return proxy;
}
