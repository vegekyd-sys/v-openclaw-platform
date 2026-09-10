// Read-only installed dependencies, fresh synthetic state, no Gateway/model.
// Candidate source imports are relocated to existing installed support modules;
// no runtime, configuration, conversations or databases are copied.
import {fork} from "node:child_process";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const root = process.argv[2];
if (!root?.startsWith("/")) throw new Error("An absolute installed runtime root is required");
const scratch = mkdtempSync(join(tmpdir(), "native-worker-ready-"));
const workerDirectory = join(root, "production-worker");
const helper = new URL("../experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs", import.meta.url).href;
const candidateSource = readFileSync(new URL("../lab/release-files/production-worker-worker.mjs", import.meta.url), "utf8")
  .replace(/from (["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) =>
    `from ${quote}${specifier === "./native-module-resolution-cache.mjs" ? helper : pathToFileURL(join(workerDirectory, specifier)).href}${quote}`);
const candidatePath = join(scratch, "candidate-worker.mjs");
writeFileSync(candidatePath, candidateSource);
async function sample(variant, index) {
  const state = join(scratch, `state-${index}`);
  mkdirSync(state, {mode: 0o700});
  const env = {...process.env, OPENCLAW_STATE_DIR: state,
    OPENCLAW_CONFIG_PATH: join(state, "absent-config.json"), OPENCLAW_AGENT_DIR: join(state, "agent"),
    VLAB_OPENCLAW_AGENT_RUNTIME: join(root, "openclaw/dist/plugin-sdk/agent-runtime.js"),
    VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1", VLAB_REQUIRE_SKILL_USAGE_TELEMETRY: "1",
    OPENCLAW_SKIP_CHANNELS: "1", NODE_DISABLE_COMPILE_CACHE: "1",
    OPENCLAW_WORKER_RESOLVE_CACHE: variant === "candidate" ? "1" : "0"};
  delete env.NODE_COMPILE_CACHE;
  const start = performance.now();
  const child = fork(variant === "baseline" ? join(workerDirectory, "worker.mjs") : candidatePath, [], {
    env, execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "", readyMs, telemetryReady = false, timer;
  child.stderr.on("data", chunk => {stderr = (stderr + chunk).slice(-2000);});
  const exited = new Promise(resolve => child.once("exit", resolve));
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Owned diagnostic Worker startup timeout")), 60_000);
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`Owned diagnostic Worker exited ${code}: ${stderr}`)));
      child.on("message", message => {
        if (message.type === "ready") {
          readyMs = Math.round(performance.now() - start);
          telemetryReady = Boolean(message.skillUsageTelemetry) && message.skillUsageTelemetry.unavailable !== true;
          if (!telemetryReady) {reject(new Error("Native Skill telemetry is unavailable")); return;}
          child.send({id: "native-ready-probe", kind: "hold", durationMs: 1});
        } else if (message.type === "response" && message.id === "native-ready-probe") {
          if (!message.ok) {reject(new Error("Diagnostic IPC hold failed")); return;}
          resolve({variant, index, readyMs, telemetryReady, ipcHold: true,
            totalMs: Math.round(performance.now() - start)});
        }
      });
    });
  } finally {
    clearTimeout(timer);
    // Only the exact process created above; it has never owned business work.
    if (child.exitCode === null) child.kill("SIGTERM");
    await exited;
  }
}
try {
  for (const [index, variant] of ["baseline", "candidate", "baseline", "candidate", "baseline", "candidate"].entries()) {
    console.log(JSON.stringify(await sample(variant, index)));
  }
} finally {rmSync(scratch, {recursive: true, force: true});}
