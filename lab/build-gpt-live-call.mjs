import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchGptLiveConsultProgressHarness, patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import { build as buildNative } from "./build-gpt-live-native-progress.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (source) => createHash("sha256").update(source).digest("hex");
export function build() {
  buildNative();
  const native = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-native-progress-plan.json")));
  const baseline = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-consult-baseline.json")));
  const files = [...native.files];
  const artifacts = [];
  for (const item of baseline) {
    assert.equal(item.baseRelease, native.baseRelease, "candidate targets must share one baseline release");
    const before = readFileSync(resolve(root, "release/captured/v2026.9.1-db91.6-memory-search-fast-20261002/dist", item.name));
    assert.equal(hash(before), item.sha256, "captured consult baseline drifted");
    const transform = item.name.startsWith("talk-") ? patchGptLiveConsultProgressTalk : patchGptLiveConsultProgressHarness;
    const after = transform(before.toString("utf8"));
    const source = `lab/release-files/gpt-live-call/${item.name}`;
    mkdirSync(dirname(resolve(root, source)), { recursive: true }); writeFileSync(resolve(root, source), after);
    files.push({ source, target: `openclaw/dist/${item.name}`, before: item.sha256 });
    artifacts.push({ target: `openclaw/dist/${item.name}`, before: item.sha256, after: hash(after) });
  }
  writeFileSync(resolve(root, "lab/gpt-live-call-plan.json"), JSON.stringify({ baseRelease: native.baseRelease, files }, null, 2) + "\n");
  writeFileSync(resolve(root, "lab/candidate/gpt-live-call.plan.json"), JSON.stringify({
    files, tests: ["lab/gpt-live-consult-progress.test.mjs", "lab/gpt-live-native-progress.test.mjs", "lab/gpt-live-h5/server.test.mjs", "lab/gpt-live-h5/app.test.mjs", "lab/gpt-live-call-live-auth.test.mjs", "lab/gpt-live-call-live-evidence.test.mjs"],
    support: [
      "lab/gpt-live-consult-progress.mjs", "lab/patch-gpt-live-native-progress.mjs",
      "lab/fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/talk-DkFuKRod.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/builtin-openclaw-zQV8Wwjr.js",
      "lab/release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js",
      "lab/gpt-live-h5/server.mjs", "lab/gpt-live-h5/events.mjs", "lab/gpt-live-h5/index.html", "lab/gpt-live-h5/app.js",
      "lab/gpt-live-call-live-auth.mjs",
      "lab/gpt-live-call-live-evidence.mjs",
    ], timeoutSeconds: 120,
  }, null, 2) + "\n");
  return { baseRelease: native.baseRelease, artifacts };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
