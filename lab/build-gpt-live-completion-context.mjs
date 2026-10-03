import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchGptLiveCompletionContextWorker } from "./patch-gpt-live-completion-context.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function build() {
  const baseline = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-completion-context-baseline.json")));
  const files = [], artifacts = [];
  for (const item of baseline.files) {
    const before = readFileSync(resolve(root, item.capture));
    assert.equal(digest(before), item.before, `${item.target} captured baseline drifted`);
    const after = item.target.endsWith("/index.mjs")
      ? patchGptLiveCompletionContextWorker(before.toString("utf8"))
      : readFileSync(resolve(root, "lab/gpt-live-completion-context.mjs"), "utf8");
    const source = `lab/release-files/gpt-live-completion-context/${item.target.split("/").at(-1)}`;
    mkdirSync(dirname(resolve(root, source)), { recursive: true });
    writeFileSync(resolve(root, source), after);
    files.push({ source, target: item.target, before: item.before });
    artifacts.push({ target: item.target, before: item.before, after: digest(after) });
  }
  for (const [name, expected] of Object.entries(baseline.fixtureSha256)) {
    assert.equal(digest(readFileSync(resolve(root, "lab/fixtures/gpt-live-completion-context", name))), expected, `${name} fixture drifted`);
  }
  const plan = { baseRelease: baseline.baseRelease, files };
  writeFileSync(resolve(root, "lab/gpt-live-completion-context-plan.json"), JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(resolve(root, "lab/candidate/gpt-live-completion-context.plan.json"), JSON.stringify({
    files, tests: [
      "lab/gpt-live-completion-context.test.mjs",
      "release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/subagent-completion-relay.test.mjs",
    ],
    support: [
      "lab/gpt-live-completion-context.mjs", "lab/patch-gpt-live-completion-context.mjs",
      "lab/gpt-live-completion-context-baseline.json",
      "lab/gpt-live-consult-continuation.mjs", "lab/patch-gpt-live-consult-continuation.mjs",
      "lab/fixtures/gpt-live-continuation/plugin-sdk/agent-harness-task-runtime.js",
      "release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/subagent-completion-relay.mjs",
      // Retain the older runtime fixture exercised by compatibility tests.
      "release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/index.mjs",
      ...baseline.files.map(item => item.capture),
      ...Object.keys(baseline.fixtureSha256).map(name => `lab/fixtures/gpt-live-completion-context/${name}`),
    ], timeoutSeconds: 120,
  }, null, 2) + "\n");
  return { baseRelease: baseline.baseRelease, artifacts };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
