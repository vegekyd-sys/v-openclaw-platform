import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchGptLiveConsultProgressHarness, patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import { build as buildNative } from "./build-gpt-live-native-progress.mjs";
import { build as buildCompletion } from "./build-gpt-live-completion-context.mjs";
import { patchGptLiveContinuationHarness, patchGptLiveContinuationTalk, patchGptLiveContinuationRegistry,
  patchGptLiveContinuationWake, patchGptLiveContinuationDelivery, patchGptLiveContinuationTaskSdk, createGptLiveContinuationRuntimeSource } from "./patch-gpt-live-consult-continuation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (source) => createHash("sha256").update(source).digest("hex");
export function build({ baseRelease = "memory-search-guards-20261002" } = {}) {
  buildNative();
  const native = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-native-progress-plan.json")));
  const baseline = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-consult-baseline.json")));
  const files = [...native.files];
  const artifacts = [];
  for (const item of baseline) {
    const before = readFileSync(resolve(root, "release/captured/v2026.9.1-db91.6-memory-search-fast-20261002/dist", item.name));
    assert.equal(hash(before), item.sha256, "captured consult baseline drifted");
    const transform = item.name.startsWith("talk-") ? patchGptLiveConsultProgressTalk : patchGptLiveConsultProgressHarness;
    const continuation = item.name.startsWith("talk-") ? patchGptLiveContinuationTalk : patchGptLiveContinuationHarness;
    const after = continuation(transform(before.toString("utf8")));
    const source = `lab/release-files/gpt-live-call/${item.name}`;
    mkdirSync(dirname(resolve(root, source)), { recursive: true }); writeFileSync(resolve(root, source), after);
    files.push({ source, target: `openclaw/dist/${item.name}`, before: item.sha256 });
    artifacts.push({ target: `openclaw/dist/${item.name}`, before: item.sha256, after: hash(after) });
  }
  buildCompletion();
  files.push(...JSON.parse(readFileSync(resolve(root,"lab/gpt-live-completion-context-plan.json"))).files);
  const continuationBaseline=JSON.parse(readFileSync(resolve(root,"lab/gpt-live-consult-continuation-baseline.json")));
  const transforms={registry:patchGptLiveContinuationRegistry,wake:patchGptLiveContinuationWake,delivery:patchGptLiveContinuationDelivery,taskSdk:patchGptLiveContinuationTaskSdk};
  for(const item of continuationBaseline.files){
    const before=readFileSync(resolve(root,item.source));assert.equal(hash(before),item.capturedSha256);
    const after=transforms[item.patch](before.toString('utf8'));
    const source='lab/release-files/gpt-live-call/'+item.target.split('/').at(-1);
    mkdirSync(dirname(resolve(root,source)),{recursive:true});writeFileSync(resolve(root,source),after);
    files.push({source,target:item.target,before:item.capturedSha256});
  }
  const continuationSource='lab/release-files/gpt-live-call/gpt-live-consult-continuation.js';
  writeFileSync(resolve(root,continuationSource),createGptLiveContinuationRuntimeSource());
  files.push({source:continuationSource,target:continuationBaseline.newModuleTarget,before:null});
  writeFileSync(resolve(root, "lab/gpt-live-call-plan.json"), JSON.stringify({ baseRelease, files }, null, 2) + "\n");
  const fixtureFiles=[];
  function fixtures(dir){for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())fixtures(file);else fixtureFiles.push(file);}}
  fixtures('lab/fixtures/gpt-live-native-progress');fixtures('lab/fixtures/gpt-live-completion-context');fixtures('lab/fixtures/gpt-live-continuation');
  const completionCandidate=JSON.parse(readFileSync(resolve(root,'lab/candidate/gpt-live-completion-context.plan.json')));
  writeFileSync(resolve(root, "lab/candidate/gpt-live-call.plan.json"), JSON.stringify({
    baseRelease, files, tests: ["lab/gpt-live-consult-progress.test.mjs", "lab/gpt-live-native-progress.test.mjs", "lab/gpt-live-h5/server.test.mjs", "lab/gpt-live-h5/app.test.mjs", "lab/gpt-live-h5/duplex-playback.test.mjs", "lab/gpt-live-call-live-auth.test.mjs", "lab/gpt-live-call-live-evidence.test.mjs",
      "lab/gpt-live-consult-continuation.test.mjs", "lab/gpt-live-pr-provenance.test.mjs", "lab/gpt-live-pr-config.test.mjs", "lab/gpt-live-pr-trace.test.mjs", "lab/gpt-live-h5-provenance-evidence.test.mjs", "lab/gpt-live-h5-control-evidence.test.mjs", "lab/gpt-live-h5-user-pcm.test.mjs", "lab/gpt-live-h5-control-probe.test.mjs",...completionCandidate.tests],
    support: [...new Set([
      "lab/gpt-live-consult-progress.mjs", "lab/patch-gpt-live-native-progress.mjs",
      "lab/fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/talk-DkFuKRod.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/builtin-openclaw-zQV8Wwjr.js",
      "lab/release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js",
      "lab/gpt-live-h5/server.mjs", "lab/gpt-live-h5/events.mjs", "lab/gpt-live-h5/duplex-playback.mjs", "lab/gpt-live-h5/index.html", "lab/gpt-live-h5/app.js",
      "lab/gpt-live-call-live-auth.mjs",
      "lab/gpt-live-call-live-evidence.mjs",
      "lab/gpt-live-pr-provenance.mjs","lab/gpt-live-pr-config.mjs","lab/gpt-live-pr-trace.mjs","lab/shared/server.mjs","lab/shared/files.mjs","lab/shared/lifecycle.mjs",
      "lab/gpt-live-consult-continuation.mjs","lab/patch-gpt-live-consult-continuation.mjs","lab/gpt-live-consult-continuation-baseline.json",
      "lab/gpt-live-h5-provenance-evidence.mjs","lab/gpt-live-h5-control-evidence.mjs","lab/gpt-live-h5-user-pcm.mjs","lab/gpt-live-h5-control-smoke.mjs",...completionCandidate.support,...fixtureFiles,...files.map(f=>f.source),
    ])], timeoutSeconds: 120,
  }, null, 2) + "\n");
  return { baseRelease, artifacts:files.map(f=>({target:f.target,before:f.before,after:hash(readFileSync(resolve(root,f.source)))})) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
