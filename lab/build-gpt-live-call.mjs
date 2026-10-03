import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchGptLiveConsultProgressHarness, patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import { patchGptLivePublicProgressBridge } from "./gpt-live-public-progress-bridge.mjs";
import { build as buildNative } from "./build-gpt-live-native-progress.mjs";
import { build as buildCompletion } from "./build-gpt-live-completion-context.mjs";
import { patchGptLiveContinuationHarness, patchGptLiveContinuationTalk, patchGptLiveContinuationRegistry,
  patchGptLiveContinuationWake, patchGptLiveContinuationDelivery, patchGptLiveContinuationTaskSdk, createGptLiveContinuationRuntimeSource } from "./patch-gpt-live-consult-continuation.mjs";
import { patchSessionsSpawnGatewayProxy } from "../experiments/agent-worker-isolation-v1/patch-openclaw-sessions-spawn-gateway-proxy.mjs";
import { createGptLiveVoiceExecLifetimeRuntimeSource } from "./gpt-live-voice-exec-lifetime.mjs";
import { patchGptLiveVoiceExecHostCapability, patchGptLiveVoiceExecBashTools, patchGptLiveVoiceExecNativeAttemptBridge,
  patchGptLiveVoiceExecGatewayRelay, patchGptLiveVoiceExecWorkerPool } from "./patch-gpt-live-voice-exec-lifetime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (source) => createHash("sha256").update(source).digest("hex");
const voiceExecBaseline = [
  { name: "host-capability-Dq3cEEWF.js", directory: "release/captured/v2026.9.1-db91.6-memory-search-guards-20261002/dist", target: "openclaw/dist/host-capability-Dq3cEEWF.js", before: "4535cb192dff71e0d3602f19ebbba6191f98a2f21013c2fa33e0b87386eaa5ce", transform: patchGptLiveVoiceExecHostCapability },
  { name: "bash-tools-DiAfkLAC.js", directory: "release/captured/v2026.9.1-db91.6-memory-search-guards-20261002/dist", target: "openclaw/dist/bash-tools-DiAfkLAC.js", before: "8bda4a91e8e742308d2aecbd8914996b4ddd0f1af0cfc1018064f4a7a3cd8d28", transform: patchGptLiveVoiceExecBashTools },
  { name: "native-attempt-bridge.mjs", directory: "release/captured/v2026.9.1-db91.6-memory-search-weighted-20261002.worker/dist", target: "production-worker/native-attempt-bridge.mjs", before: "6482f3d27a0f7e019a1f65faaa6e7bbdb28a999250ff5d1d6ab871d9ba65a813", transform: patchGptLiveVoiceExecNativeAttemptBridge },
  { name: "gateway-message-tool.mjs", directory: "release/captured/v2026.9.1-db91.6-memory-search-weighted-20261002.worker/dist", target: "production-worker/gateway-message-tool.mjs", before: "2ae673d4eae9dfd0f350e07d1106a78c95c9259d698e2a9b42fdbaeab2078472", transform: patchGptLiveVoiceExecGatewayRelay },
  { name: "worker-pool.mjs", directory: "release/captured/v2026.9.1-db91.6-hotreload-feishu-approvals-20261003.worker/dist", target: "production-worker/worker-pool.mjs", before: "58558773884404e99b50e8a2916dc62f6c18a7b2d9360301340dcd61511c50c6", transform: patchGptLiveVoiceExecWorkerPool },
];
export function build({ baseRelease = "hotreload-feishu-approvals-v1" } = {}) {
  buildNative();
  const native = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-native-progress-plan.json")));
  const baseline = JSON.parse(readFileSync(resolve(root, "lab/gpt-live-consult-baseline.json")));
  const files = [...native.files];
  const publicBridgeBaseline = "release/captured/v2026.9.1-db91.6-memory-search-guards-20261002.worker/dist/gateway-public-stream.mjs";
  const publicBridgeBefore = readFileSync(resolve(root, publicBridgeBaseline));
  const publicBridgeBeforeSha = "5440eadbfe1e6bf40824bd389e9cd3fb87326cc3c75b1a158cfe107799300fdf";
  assert.equal(hash(publicBridgeBefore), publicBridgeBeforeSha, "captured public stream bridge baseline drifted");
  const publicBridgeSource = "lab/release-files/gpt-live-call/gateway-public-stream.mjs";
  mkdirSync(dirname(resolve(root, publicBridgeSource)), { recursive: true });
  writeFileSync(resolve(root, publicBridgeSource), patchGptLivePublicProgressBridge(publicBridgeBefore.toString("utf8")));
  files.push({ source: publicBridgeSource, target: "production-worker/gateway-public-stream.mjs", before: publicBridgeBeforeSha });
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
  const spawnBaseline = "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/sessions-spawn-tool-1FQMTkIo.js";
  const spawnBefore = readFileSync(resolve(root, spawnBaseline));
  const spawnBeforeSha = "52b6ea5448e758f6d764200d946853be80a0fe5b419629801ee761173741d848";
  assert.equal(hash(spawnBefore), spawnBeforeSha, "captured external spawn bridge baseline drifted");
  const spawnSource = "lab/release-files/gpt-live-call/sessions-spawn-tool-1FQMTkIo.js";
  const spawnAfter = patchSessionsSpawnGatewayProxy(spawnBefore.toString("utf8")).source;
  writeFileSync(resolve(root, spawnSource), spawnAfter);
  files.push({ source: spawnSource, target: "openclaw/dist/sessions-spawn-tool-1FQMTkIo.js", before: spawnBeforeSha });
  for (const item of voiceExecBaseline) {
    const before = readFileSync(resolve(root, item.directory, item.name));
    assert.equal(hash(before), item.before, "captured voice exec baseline drifted: " + item.name);
    assert(!files.some(file => file.target === item.target), "voice exec target would overwrite another transform");
    const source = "lab/release-files/gpt-live-call/" + item.name;
    writeFileSync(resolve(root, source), item.transform(before.toString("utf8")));
    files.push({ source, target: item.target, before: item.before });
  }
  const voiceExecSource = "lab/release-files/gpt-live-call/gpt-live-voice-exec-lifetime.js";
  writeFileSync(resolve(root, voiceExecSource), createGptLiveVoiceExecLifetimeRuntimeSource());
  files.push({ source: voiceExecSource, target: "openclaw/dist/gpt-live-voice-exec-lifetime.js", before: null });
  writeFileSync(resolve(root, "lab/gpt-live-call-plan.json"), JSON.stringify({ baseRelease, files }, null, 2) + "\n");
  const fixtureFiles=[];
  function fixtures(dir){for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())fixtures(file);else fixtureFiles.push(file);}}
  fixtures('lab/fixtures/gpt-live-native-progress');fixtures('lab/fixtures/gpt-live-completion-context');fixtures('lab/fixtures/gpt-live-continuation');fixtures('lab/fixtures/gpt-live-public-progress');
  const completionCandidate=JSON.parse(readFileSync(resolve(root,'lab/candidate/gpt-live-completion-context.plan.json')));
  writeFileSync(resolve(root, "lab/candidate/gpt-live-call.plan.json"), JSON.stringify({
    baseRelease, files, tests: ["lab/gpt-live-consult-progress.test.mjs", "lab/gpt-live-public-progress-bridge.test.mjs", "lab/gpt-live-native-progress.test.mjs", "lab/gpt-live-h5/server.test.mjs", "lab/gpt-live-h5/app.test.mjs", "lab/gpt-live-h5/duplex-playback.test.mjs", "lab/gpt-live-h5/microphone-capture.test.mjs", "lab/gpt-live-h5/transcript-presentation.test.mjs", "lab/gpt-live-h5/call-sounds.test.mjs", "lab/gpt-live-call-live-auth.test.mjs", "lab/gpt-live-call-live-evidence.test.mjs",
      "lab/gpt-live-consult-continuation.test.mjs", "lab/gpt-live-voice-exec-lifetime.test.mjs", "experiments/agent-worker-isolation-v1/patch-openclaw-sessions-spawn-gateway-proxy.test.mjs", "experiments/agent-worker-isolation-v1/patch-openclaw-sessions-yield-external-task.test.mjs", "lab/gpt-live-pr-provenance.test.mjs", "lab/gpt-live-pr-config.test.mjs", "lab/gpt-live-pr-trace.test.mjs", "lab/gpt-live-h5-provenance-evidence.test.mjs", "lab/gpt-live-h5-control-evidence.test.mjs", "lab/gpt-live-h5-user-pcm.test.mjs", "lab/gpt-live-h5-control-probe.test.mjs",...completionCandidate.tests],
    support: [...new Set([
      "lab/gpt-live-consult-progress.mjs", "lab/gpt-live-public-progress-bridge.mjs", publicBridgeBaseline, "lab/patch-gpt-live-native-progress.mjs",
      "lab/fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/talk-DkFuKRod.js",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/builtin-openclaw-zQV8Wwjr.js",
      "lab/release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js",
      "lab/gpt-live-h5/server.mjs", "lab/gpt-live-h5/events.mjs", "lab/gpt-live-h5/instructions.mjs", "lab/gpt-live-h5/duplex-playback.mjs", "lab/gpt-live-h5/index.html", "lab/gpt-live-h5/app.js", "lab/gpt-live-h5/styles.css", "lab/gpt-live-h5/microphone-capture.mjs", "lab/gpt-live-h5/transcript-presentation.mjs", "lab/gpt-live-h5/call-sounds.mjs",
      "lab/gpt-live-call-live-auth.mjs",
      "lab/gpt-live-call-live-evidence.mjs",
      "lab/gpt-live-pr-provenance.mjs","lab/gpt-live-pr-config.mjs","lab/gpt-live-pr-trace.mjs","lab/shared/server.mjs","lab/shared/files.mjs","lab/shared/lifecycle.mjs",
      "lab/gpt-live-consult-continuation.mjs","lab/patch-gpt-live-consult-continuation.mjs","lab/gpt-live-consult-continuation-baseline.json",
      "lab/gpt-live-voice-exec-lifetime.mjs", "lab/patch-gpt-live-voice-exec-lifetime.mjs", ...voiceExecBaseline.map(item => item.directory + "/" + item.name),
      "release/captured/v2026.9.1-db91.6-memory-search-weighted-20261002.worker/dist/worker-pool.mjs",
      "experiments/agent-worker-isolation-v1/patch-openclaw-sessions-spawn-gateway-proxy.mjs", spawnBaseline,
      "experiments/agent-worker-isolation-v1/patch-openclaw-sessions-yield-external-task.mjs",
      "release/captured/v2026.9.1-db91.6-background-work-20261002/dist/openclaw-tools-BODVdJQD.js",
      "release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/subagent-completion-relay.mjs",
      "lab/gpt-live-h5-provenance-evidence.mjs","lab/gpt-live-h5-control-evidence.mjs","lab/gpt-live-h5-user-pcm.mjs","lab/gpt-live-h5-control-smoke.mjs",...completionCandidate.support,...fixtureFiles,...files.map(f=>f.source),
    ])], timeoutSeconds: 120,
  }, null, 2) + "\n");
  return { baseRelease, artifacts:files.map(f=>({target:f.target,before:f.before,after:hash(readFileSync(resolve(root,f.source)))})) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
