// Compatibility check against an installed OpenClaw runtime. The candidate
// chunk is imported from a temporary synthetic state and performs module
// loading only; it never opens an Agent turn or invokes a model or tool.
import assert from "node:assert/strict";
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

const scratch = mkdtempSync(join(tmpdir(), "worker-command-readiness-"));
try {
  const state = join(scratch, "state");
  const workspace = join(state, "workspace");
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const configPath = join(state, "openclaw.json");
  const config = {
      agents: {
        defaults: {
          workspace,
          model: { primary: "openai/readiness-fixture", fallbacks: [] },
        },
      },
      models: { providers: {} },
      plugins: { enabled: true, allow: [], load: { paths: [] }, entries: {} },
    };
  writeFileSync(
    configPath,
    JSON.stringify(config),
    { mode: 0o600 },
  );
  process.env.OPENCLAW_STATE_DIR = state;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_AGENT_DIR = join(state, "agent");
  process.env.OPENCLAW_SKIP_CHANNELS = "1";
  process.env.NODE_DISABLE_COMPILE_CACHE = "1";
  delete process.env.NODE_COMPILE_CACHE;

  const dist = join(root, "openclaw", "dist");
  const source = readFileSync(
    new URL("../lab/release-files/agent-command-DPfawBbr.js", import.meta.url),
    "utf8",
  ).replace(/(["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) => {
    return `${quote}${pathToFileURL(join(dist, specifier)).href}${quote}`;
  });
  const candidatePath = join(scratch, "agent-command-candidate.mjs");
  writeFileSync(candidatePath, source, { mode: 0o600 });
  const facadePath = join(scratch, "agent-command-facade.mjs");
  writeFileSync(
    facadePath,
    readFileSync(
      new URL("../lab/release-files/agent-command-DeP5kHlK.js", import.meta.url),
      "utf8",
    ).replace(
      '"./agent-command-DPfawBbr.js"',
      JSON.stringify(pathToFileURL(candidatePath).href),
    ),
    { mode: 0o600 },
  );

  const startedAt = performance.now();
  const runtime = await import(pathToFileURL(facadePath).href);
  assert.equal(typeof runtime.prewarmAgentCommandRuntimes, "function");
  const preparation = await runtime.prewarmAgentCommandRuntimes({
    config,
    agentId: "makaron",
    workspaceDir: workspace,
  });
  assert.equal(preparation.skillSnapshotPrepared, true);
  console.log(
    JSON.stringify({
      status: "ready",
      commandPrewarmMs: Math.round(performance.now() - startedAt),
      skillSnapshotPrepared: preparation.skillSnapshotPrepared,
      noAgentModelOrToolRequest: true,
    }),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
