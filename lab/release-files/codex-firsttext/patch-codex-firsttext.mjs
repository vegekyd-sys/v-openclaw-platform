#!/usr/bin/env node
// Codex harness first text on OpenClaw 2026.9.1 (V): stream the answer without
// waiting for the user prompt's transcript write, and give /vds (DeepSeek) a
// persistent Codex thread instead of a fresh transient thread every turn.
//
//   node patch-codex-firsttext.mjs --codex <.../node_modules/@openclaw/codex> [--check]
//
// Idempotent: every anchor must match exactly once, or its replacement must
// already be present. Written against @openclaw/codex@2026.9.1 as installed on V
// (generation g-b42d646e5561ece2, /vds G1 and codex-native-subagent applied:
// run-attempt 694e3817…, thread-lifecycle 94d5420f…). See README.md next to this file.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const checkOnly = args.includes("--check");
assert(codexRoot, "usage: patch-codex-firsttext.mjs --codex <@openclaw/codex dir> [--check]");
const MARK = "v-codex-firsttext-v1";

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const dist = path.join(codexRoot, "dist");

const TARGETS = [
  {
    // A. The active turn used to wait for the user prompt's transcript write before
    //    binding the turn route, so every app-server notification sat in the 256-entry
    //    pre-bind buffer meanwhile. On a big private session that write takes seconds:
    //    /vcodex answers were held 1–8 s after Codex finished, and /vds overflowed the
    //    buffer and replayed the whole turn (+8 s). The wait only exists to keep the
    //    durable transcript chronological, so order the transcript writers behind the
    //    prompt write instead and bind the route at once.
    file: moduleIn(dist, /^run-attempt-.*\.js$/u, "var CodexTranscriptCheckpoint = class {"),
    patches: [
      // A1. Checkpoint writes queue behind the prompt write. While it is pending, the
      //     notification handler and tool calls do not wait for their own flush; the
      //     write chain still lands them in receipt order. close() waits for all of it.
      ["\t\tthis.writing = Promise.resolve();\n\t\tthis.tainted = false;\n\t\tthis.closed = false;\n",
        "\t\tthis.writing = Promise.resolve();\n\t\tthis.tainted = false;\n\t\tthis.closed = false;\n"
        + `\t\t// ${MARK}: transcript writes wait for the user prompt's write; streaming does not.\n`
        + "\t\tthis.orderingGatePending = false;\n"
        + "\t\tthis.orderAfter = (gate) => {\n"
        + "\t\t\tthis.orderingGatePending = true;\n"
        + "\t\t\tconst settled = Promise.resolve(gate).then(() => void 0, () => void 0).then(() => {\n"
        + "\t\t\t\tthis.orderingGatePending = false;\n"
        + "\t\t\t});\n"
        + "\t\t\tthis.writing = this.writing.then(() => settled);\n"
        + "\t\t};\n"
        + "\t\tthis.flushInOrder = () => {\n"
        + "\t\t\tconst writing = this.flush();\n"
        + "\t\t\treturn this.orderingGatePending ? void 0 : writing;\n"
        + "\t\t};\n"],
      ["await this.transcriptCheckpoint.flush();", "await this.transcriptCheckpoint.flushInOrder();", 3],
      ["await projector?.transcriptCheckpoint.flush();", "await projector?.transcriptCheckpoint.flushInOrder();", 2],
      // A2. Async user messages also persist; deliver them after the prompt too.
      ["\tasync deliver(delivery) {\n\t\tif (this.settledItemIds.has(delivery.itemId)) return;\n",
        "\tasync deliver(delivery) {\n\t\tif (this.settledItemIds.has(delivery.itemId)) return;\n"
        + `\t\tawait this.orderingGate; // ${MARK}\n`],
      ["\t\tupstreamUserText: turnState.codexTurnPromptText\n\t});\n\tconst bindProjection = async () => {\n",
        "\t\tupstreamUserText: turnState.codexTurnPromptText\n\t});\n"
        + `\t// ${MARK}: order durable writers behind the prompt write instead of holding the route.\n`
        + "\tconst promptMirrorSettled = Promise.resolve(promptMirrorPromise).then(() => void 0, () => void 0);\n"
        + "\tactiveProjector.transcriptCheckpoint.orderAfter(promptMirrorSettled);\n"
        + "\tactiveProjector.asyncDeliveryProjection.orderingGate = promptMirrorSettled;\n"
        + "\tconst bindProjection = async () => {\n"],
      // A3. Bind the turn route immediately.
      ["\t\t\tawait Promise.race([promptMirrorPromise, completion]);\n\t\t\tif (state.completed) return;\n",
        `\t\t\tif (state.completed) return; // ${MARK}: no longer waits for the prompt write\n`],
      // A4. The final mirror still follows the prompt write.
      ["\t\tnotifyUserMessagePersisted,\n\t\tabortListener,\n\t\tready: bindProjection()\n",
        "\t\tnotifyUserMessagePersisted,\n\t\tpromptMirrorSettled,\n\t\tabortListener,\n\t\tready: bindProjection()\n"],
      ["\tconst mirrorOutcome = await codexTranscriptMirrorRuntime.mirrorBestEffort({\n",
        `\tawait activeTurn.promptMirrorSettled; // ${MARK}\n`
        + "\tconst mirrorOutcome = await codexTranscriptMirrorRuntime.mirrorBestEffort({\n"],
      // B2. With no explicit profile, startup fell back to the bound thread's auth profile
      //     even when the turn switched provider family: /vds after /vcodex asked for the
      //     OpenAI subscription profile and failed ("selected auth profile is unavailable").
      //     Inherit it only within the same family; the thread itself rotates (see B).
      ["var CodexTranscriptCheckpoint = class {",
        `// ${MARK}: a thread binding's auth profile belongs to its provider family.\n`
        + "function codexBindingSharesProviderFamily(binding, provider) {\n"
        + "\tconst bindingDeepSeek = String(binding?.modelProvider ?? \"\").trim().toLowerCase() === \"deepseek\" || /deepseek/iu.test(String(binding?.model ?? \"\"));\n"
        + "\treturn bindingDeepSeek === (String(provider ?? \"\").trim().toLowerCase() === \"deepseek\");\n"
        + "}\n"
        + "var CodexTranscriptCheckpoint = class {"],
      ["params.runtimePlan?.auth.forwardedAuthProfileId ?? params.authProfileId ?? startupBinding?.authProfileId;",
        "params.runtimePlan?.auth.forwardedAuthProfileId ?? params.authProfileId ?? (codexBindingSharesProviderFamily(startupBinding, params.provider) ? startupBinding?.authProfileId : void 0);"],
      // C. An oversized DeepSeek thread was rotated before every turn. The fresh thread is
      //    seeded with the whole OpenClaw transcript, so in a big session (43万 tokens in
      //    oc_64bcd621) it is born over Codex's 258,400 fallback window: the next turn sees
      //    it oversized again, rotates again, and Codex compacts the replay every turn.
      //    Keep the DeepSeek thread and let Codex's own auto-compaction shrink it; the
      //    DeepSeek API accepts the uncompacted request (1M context). Byte guard and other
      //    providers are unchanged.
      ["\tconst tokenCount = maxFiniteNumber([sessionTokens, nativeTokens]);\n\tif (tokenCount !== void 0 && tokenCount >= maxTokens) {\n",
        "\tconst tokenCount = maxFiniteNumber([sessionTokens, nativeTokens]);\n"
        + "\t// v-codex-firsttext-v2: Codex compacts an oversized DeepSeek thread itself; a fresh one would replay the whole transcript.\n"
        + "\tconst codexDeepSeekThread = String(binding.modelProvider ?? \"\").trim().toLowerCase() === \"deepseek\" || /deepseek/iu.test(String(binding.model ?? \"\"));\n"
        + "\tif (tokenCount !== void 0 && tokenCount >= maxTokens && codexDeepSeekThread) embeddedAgentLog.info(\"codex app-server keeping oversized DeepSeek thread for native compaction\", {\n"
        + "\t\tthreadId: binding.threadId,\n\t\tmaxTokens,\n\t\tnativeTokens,\n\t\tsessionTokens\n\t});\n"
        + "\tif (tokenCount !== void 0 && tokenCount >= maxTokens && !codexDeepSeekThread) {\n"],
    ],
  },
  {
    // B. /vds runs DeepSeek with code mode off (G1), and upstream reads code mode off
    //    as a one-turn restriction: keep the session's binding and start a transient
    //    thread. Every /vds turn therefore opened a new thread and replayed the whole
    //    history as the prompt (40万 input tokens, about 9万 cached in a busy group).
    //    For DeepSeek code mode off is permanent, so let it own a persistent binding.
    //    A thread cannot cross between DeepSeek and OpenAI (OpenAI rejects DeepSeek's
    //    plaintext reasoning items), so rotate when the provider family changes; the
    //    fresh thread is seeded from the full OpenClaw transcript, which also lets
    //    either side see turns the other one answered.
    file: moduleIn(dist, /^thread-lifecycle-.*\.js$/u, "function isTransientWebSearchRestriction(params) {"),
    patches: [
      ["function isTransientWebSearchRestriction(params) {",
        `// ${MARK}: DeepSeek runs without code mode permanently; it is not a one-turn restriction.\n`
        + "function isCodexDeepSeekProvider(provider) {\n"
        + "\treturn String(provider ?? \"\").trim().toLowerCase() === \"deepseek\";\n"
        + "}\n"
        + "function isCodexDeepSeekBinding(binding) {\n"
        + "\treturn isCodexDeepSeekProvider(binding?.modelProvider) || /deepseek/iu.test(String(binding?.model ?? \"\"));\n"
        + "}\n"
        + "function isTransientWebSearchRestriction(params) {"],
      ["\tif (params.nativeCodeModeEnabled === false && !persistentWebSearchRestriction) return true;\n",
        "\tif (params.nativeCodeModeEnabled === false && !persistentWebSearchRestriction && !isCodexDeepSeekProvider(params.params.provider)) return true;\n"],
      ["\t\tconst transientNativeToolRestriction = params.nativeCodeModeEnabled === false && !persistentWebSearchRestriction;\n",
        "\t\tconst transientNativeToolRestriction = params.nativeCodeModeEnabled === false && !persistentWebSearchRestriction && !isCodexDeepSeekProvider(params.params.provider);\n"],
      ["const deferLegacyWebSearchRotationToTransientNativeSurface = params.nativeCodeModeEnabled === false && binding?.webSearchThreadConfigFingerprint === void 0 && !persistentWebSearchRestriction;",
        "const deferLegacyWebSearchRotationToTransientNativeSurface = params.nativeCodeModeEnabled === false && binding?.webSearchThreadConfigFingerprint === void 0 && !persistentWebSearchRestriction && !isCodexDeepSeekProvider(params.params.provider);"],
      ["\t\t\tawait clearCurrentBinding(\"rotating a GPT-5.6 multi-agent thread binding\");\n\t\t\tbinding = void 0;\n\t\t}\n",
        "\t\t\tawait clearCurrentBinding(\"rotating a GPT-5.6 multi-agent thread binding\");\n\t\t\tbinding = void 0;\n\t\t}\n"
        + `\t\tif (binding?.threadId && isCodexDeepSeekBinding(binding) !== isCodexDeepSeekProvider(params.params.provider)) { // ${MARK}\n`
        + "\t\t\tembeddedAgentLog.info(\"codex app-server model provider family changed; starting a new thread\", {\n"
        + "\t\t\t\tthreadId: binding.threadId,\n"
        + "\t\t\t\tbindingModel: binding.model,\n"
        + "\t\t\t\tbindingModelProvider: binding.modelProvider,\n"
        + "\t\t\t\trequestedProvider: params.params.provider\n"
        + "\t\t\t});\n"
        + "\t\t\tawait clearCurrentBinding(\"rotating a cross-provider thread binding\");\n"
        + "\t\t\tbinding = void 0;\n"
        + "\t\t}\n"],
      // E. The deferred memory flush (#243) runs after each reply in a big session with only
      //    read/write as tools. A Codex thread's tools are fixed at creation, so the flush got
      //    a fresh thread AND became the session's binding; the next user turn (94 tools) did
      //    not match it and started yet another thread, replaying the whole transcript every
      //    turn (oc_fab91, 2026-10-08). Run the flush in a transient thread like other one-turn
      //    restrictions and keep the session's binding.
      ["\t\tconst transientDelegationRestriction = params.params.delegationCapability === \"report_only\";\n",
        "\t\t// v-codex-firsttext-v3: a memory flush is a one-turn tool surface; never rebind the session to it.\n"
        + "\t\tconst transientDelegationRestriction = params.params.delegationCapability === \"report_only\" || params.params.trigger === \"memory\";\n"],
      // F. Owner and member turns in one group get different tool catalogs: the owner has
      //    owner-only tools (computer, conversations_*, …) and a few descriptions mention
      //    them. Each change of speaker therefore rotated the thread and replayed the whole
      //    transcript. Tool calls only run what the current turn grants (toolMap), so a
      //    thread whose recorded tools cover this turn's tools by name and schema can keep
      //    serving it; descriptions may differ. Keep the binding's fingerprint truthful: the
      //    warm reuse and resume paths use the thread's own catalog fingerprint.
      ["function shouldStartTransientNoToolThread(params) {",
        "// v-codex-firsttext-v4: a thread whose recorded tools cover this turn's tools keeps serving it.\n"
        + "function codexThreadToolName(tool) {\n"
        + "\treturn tool?.namespace ?? tool?.name;\n"
        + "}\n"
        + "function codexThreadToolShape(tool) {\n"
        + "\tconst { description, tools, deferLoading, ...rest } = tool ?? {};\n"
        + "\treturn JSON.stringify(stabilizeJsonValue({ ...rest, deferLoading: deferLoading === true }));\n"
        + "}\n"
        + "function codexThreadToolServes(have, want) {\n"
        + "\tif (!have || !want || codexThreadToolName(have) !== codexThreadToolName(want)) return false;\n"
        + "\tif (Array.isArray(have.tools) || Array.isArray(want.tools)) {\n"
        + "\t\tif (!Array.isArray(have.tools) || !Array.isArray(want.tools)) return false;\n"
        + "\t\tconst byName = new Map(have.tools.map((tool) => [codexThreadToolName(tool), tool]));\n"
        + "\t\treturn want.tools.every((tool) => codexThreadToolServes(byName.get(codexThreadToolName(tool)), tool));\n"
        + "\t}\n"
        + "\treturn codexThreadToolShape(have) === codexThreadToolShape(want);\n"
        + "}\n"
        + "async function codexBoundThreadToolCatalogForTurn(params, binding) {\n"
        + "\tif (!binding?.rolloutPath || !binding.dynamicToolsFingerprint || binding.connectionScope === \"supervision\" || params.dynamicTools.length === 0) return;\n"
        + "\ttry {\n"
        + "\t\tconst sessionsRoot = path.join(resolveCodexAppServerLocalHomeDir(params.appServer.start, resolveCodexThreadAgentDir(params)), \"sessions\");\n"
        + "\t\tconst recorded = (await readCodexSessionMeta(sessionsRoot, binding.rolloutPath, binding.threadId))?.dynamic_tools;\n"
        + "\t\tif (!Array.isArray(recorded) || codexDynamicToolsFingerprint(recorded) !== binding.dynamicToolsFingerprint) return;\n"
        + "\t\tconst byName = new Map(recorded.map((tool) => [codexThreadToolName(tool), tool]));\n"
        + "\t\tif (!params.dynamicTools.every((tool) => codexThreadToolServes(byName.get(codexThreadToolName(tool)), tool))) return;\n"
        + "\t\treturn {\n"
        + "\t\t\tdynamicToolsFingerprint: binding.dynamicToolsFingerprint,\n"
        + "\t\t\tlegacyDynamicToolsFingerprint: codexLegacyDynamicToolsFingerprint(recorded),\n"
        + "\t\t\trecordedToolCount: recorded.length\n"
        + "\t\t};\n"
        + "\t} catch {\n"
        + "\t\treturn;\n"
        + "\t}\n"
        + "}\n"
        + "function shouldStartTransientNoToolThread(params) {"],
      ["\t\tif (binding?.threadId) {\n"
        + "\t\t\tif (binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n",
        "\t\tlet codexKeptToolCatalog; // v-codex-firsttext-v4\n"
        + "\t\tif (binding?.threadId && binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n"
        + "\t\t\tconst kept = await codexBoundThreadToolCatalogForTurn(params, binding);\n"
        + "\t\t\tif (kept) {\n"
        + "\t\t\t\tembeddedAgentLog.info(\"codex app-server keeping thread whose tool catalog covers this turn\", {\n"
        + "\t\t\t\t\tthreadId: binding.threadId,\n"
        + "\t\t\t\t\tthreadTools: kept.recordedToolCount,\n"
        + "\t\t\t\t\tturnTools: params.dynamicTools.length\n"
        + "\t\t\t\t});\n"
        + "\t\t\t\tcodexKeptToolCatalog = {\n"
        + "\t\t\t\t\tdynamicToolsFingerprint: kept.dynamicToolsFingerprint,\n"
        + "\t\t\t\t\tlegacyDynamicToolsFingerprint: kept.legacyDynamicToolsFingerprint\n"
        + "\t\t\t\t};\n"
        + "\t\t\t}\n"
        + "\t\t}\n"
        + "\t\tif (binding?.threadId) {\n"
        + "\t\t\tif (!codexKeptToolCatalog && binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n"],
      ["\t\t\t\tconst warmReuse = await tryReuseCodexLiveThread({\n\t\t\t\t\t...requestContext,\n",
        "\t\t\t\tconst warmReuse = await tryReuseCodexLiveThread({\n\t\t\t\t\t...requestContext,\n\t\t\t\t\t...codexKeptToolCatalog,\n"],
      ["\t\t\t\t\tconst configuration = await prepareCodexThreadResume(params, binding, requestContext);\n",
        "\t\t\t\t\tconst configuration = await prepareCodexThreadResume(params, binding, {\n\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t...codexKeptToolCatalog\n\t\t\t\t\t});\n"],
      ["\t\t\t\t\t\tconst resumed = await resumeExistingCodexThread(params, {\n\t\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t\tbinding,\n",
        "\t\t\t\t\t\tconst resumed = await resumeExistingCodexThread(params, {\n\t\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t\t...codexKeptToolCatalog,\n\t\t\t\t\t\t\tbinding,\n"],
    ],
  },
];

const report = [];
for (const { file, patches } of TARGETS) {
  let source = fs.readFileSync(file, "utf8");
  let changed = 0;
  for (const [before, after, expected = 1] of patches) {
    if (before === after) continue;
    const beforeCount = source.split(before).length - 1;
    const afterCount = source.split(after).length - 1;
    // Insertions keep their anchor inside the replacement, so test for the result first.
    if (afterCount >= expected) continue;
    assert.equal(beforeCount, expected, `${path.basename(file)}: anchor matched ${beforeCount}×, expected ${expected}: ${JSON.stringify(before.slice(0, 90))}`);
    source = source.split(before).join(after);
    changed += expected;
  }
  if (changed && !checkOnly) fs.writeFileSync(file, source);
  report.push({ file: path.relative(codexRoot, file), changed, marked: source.includes(MARK) });
}
console.log(JSON.stringify({ mark: MARK, checkOnly, report }, null, 2));
