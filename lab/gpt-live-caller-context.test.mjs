import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveGptLiveCallInstructions, resolveGptLiveCaller, resolveGptLiveCallerSurface, extractGptLivePersona,
  createGptLiveCallLifecycleRuntimeSource } from "./gpt-live-call-lifecycle.mjs";
import { patchGptLiveCallerContextTalk } from "./patch-gpt-live-caller-context.mjs";

const key = entry => `agent:makaron:explicit:gpt-live-h5-${entry}-${randomUUID()}`;
const profile = { providerId: "openai", model: "gpt-live-1-codex", transport: "webrtc", brain: "agent-consult",
  capabilities: { handlesAgentConsult: true, supportsToolCalls: false } };
const persona = "Default presence:\nWarm and curious.\nIdentity:\nYou are V.\nSpeaker identity policy:\nAsk everyone who they are.\nBackchannel policy:\nFill every silence.\nAgency and judgment:\nPrivate info stays private.\nSelf-introduction policy:\nBe brief.\nPrivate bootstrap:\nSECRET_EXAMPLE";

test("two host session identities select the greeting and preserve persona without old waiting or private bootstrap", () => {
  const selected = extractGptLivePersona(persona.replaceAll("\n", "\\n"));
  assert.match(selected, /Warm and curious|You are V|Private info stays private/u);
  assert.doesNotMatch(selected, /Ask everyone|Fill every|SECRET_EXAMPLE/u);
  for (const entry of ["tianyi", "visitor"]) {
    const sessionKey = key(entry);
    const instructions = resolveGptLiveCallInstructions("private bootstrap ignored", { ...profile, sessionKey, configuredInstructions: persona });
    assert.match(instructions, /Warm and curious/u);
    assert.doesNotMatch(instructions, /private bootstrap ignored|SECRET_EXAMPLE|Fill every silence/u);
    assert.match(instructions, entry === "tianyi" ? /默认是 Tianyi.*不再询问是谁/u : /默认当前说话者不是 Tianyi.*自然问一次/u);
    assert.deepEqual(resolveGptLiveCaller(sessionKey), { entry, speaker: entry === "tianyi" ? "Tianyi" : null });
  }
});

test("ordinary self-identification cannot promote the host entry; unrelated clients keep their instructions and surface", () => {
  const surface = resolveGptLiveCallerSurface("browser call", key("visitor"));
  assert.match(surface, /"entry":"visitor","speaker":null/u);
  assert.match(surface, /does not turn this into Tianyi's entry|existing backend redline/u);
  assert.equal(resolveGptLiveCallerSurface("normal call", "agent:makaron:main"), "normal call");
  assert.equal(resolveGptLiveCallInstructions("other model", { ...profile, model: "other" }), "other model");
  assert.equal(resolveGptLiveCaller(key("tianyi") + "-spoof"), null);
});

test("actual shipped Talk anchors pass host canonical identity and configured persona to frontend and backend", async () => {
  const source = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005/dist/talk-DkFuKRod.js", import.meta.url), "utf8");
  const patched = patchGptLiveCallerContextTalk(source);
  assert.match(patched, /sessionKey: target.canonicalKey, configuredInstructions: realtimeConfig.instructions/u);
  assert.match(patched, /surface: resolveGptLiveCallerSurface\(params.surface \?\? "a browser Talk session", canonicalKey\)/u);
  assert.equal(patchGptLiveCallerContextTalk(patched), patched);
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(createGptLiveCallLifecycleRuntimeSource()).toString("base64")}`);
  assert.equal(runtime.resolveGptLiveCallInstructions("x", { ...profile, sessionKey: key("visitor"), configuredInstructions: persona }),
    resolveGptLiveCallInstructions("x", { ...profile, sessionKey: key("visitor"), configuredInstructions: persona }));
});
