// Read-only installed-runtime compatibility check. The candidate Worker uses a
// synthetic state directory and never issues an Agent, model, or tool request.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root?.startsWith("/")) {
  throw new Error("An absolute installed runtime root is required");
}

const scratch = mkdtempSync(join(tmpdir(), "worker-runtime-readiness-"));
const workerDirectory = join(root, "production-worker");
const helperUrl = new URL(
  "../experiments/agent-worker-isolation-v1/runtime-prewarm.mjs",
  import.meta.url,
).href;
const source = readFileSync(
  new URL("../lab/release-files/production-worker-worker.mjs", import.meta.url),
  "utf8",
).replace(
  /from (["'])(\.\/[^"']+)\1/g,
  (_match, quote, specifier) =>
    `from ${quote}${
      specifier === "./runtime-prewarm.mjs"
        ? helperUrl
        : pathToFileURL(join(workerDirectory, specifier)).href
    }${quote}`,
);
const workerPath = join(scratch, "candidate-worker.mjs");
writeFileSync(workerPath, source);

const state = join(scratch, "state");
const workspace = join(state, "workspace");
mkdirSync(workspace, { recursive: true, mode: 0o700 });
const configPath = join(state, "openclaw.json");
writeFileSync(
  configPath,
  JSON.stringify({
    agents: {
      defaults: {
        workspace,
        model: { primary: "openai/readiness-fixture", fallbacks: [] },
      },
      entries: { makaron: {} },
    },
    models: {
      providers: {
        openai: {
          baseUrl: "http://127.0.0.1:1/v1",
          api: "openai-completions",
          apiKey: "readiness-fixture-not-a-secret",
          models: [
            {
              id: "readiness-fixture",
              name: "Readiness Fixture",
              reasoning: false,
              input: ["text"],
              contextWindow: 65_536,
              maxTokens: 1_024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    },
    plugins: { enabled: true, allow: [], load: { paths: [] }, entries: {} },
  }),
  { mode: 0o600 },
);

const env = {
  ...process.env,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_AGENT_DIR: join(state, "agent"),
  OPENCLAW_SKIP_CHANNELS: "1",
  OPENCLAW_WORKER_EAGER_PREPARE: "1",
  OPENCLAW_WORKER_EAGER_PREPARE_TIMEOUT_MS: "60000",
  VLAB_OPENCLAW_AGENT_RUNTIME: join(
    root,
    "openclaw/dist/plugin-sdk/agent-runtime.js",
  ),
  VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1",
  NODE_DISABLE_COMPILE_CACHE: "1",
};
delete env.NODE_COMPILE_CACHE;

const startedAt = performance.now();
const child = fork(workerPath, [], {
  env,
  execArgv: [],
  stdio: ["ignore", "ignore", "pipe", "ipc"],
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-4_000);
});
const exited = new Promise((resolve) => child.once("exit", resolve));
try {
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Candidate Worker readiness deadline")),
      90_000,
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      reject(new Error(`Candidate Worker exited ${code}: ${stderr}`)),
    );
    child.on("message", (message) => {
      if (message?.type !== "ready") return;
      clearTimeout(timer);
      resolve(message);
    });
  });
  assert.equal(ready.runtimePrewarm?.status, "ready");
  assert.match(stderr, /\[worker-runtime-prewarm\.2\]/);
  console.log(
    JSON.stringify({
      status: ready.runtimePrewarm.status,
      prewarmMs: ready.runtimePrewarm.ms,
      readyMs: Math.round(performance.now() - startedAt),
      noAgentModelOrToolRequest: true,
    }),
  );
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await exited;
  rmSync(scratch, { recursive: true, force: true });
}
