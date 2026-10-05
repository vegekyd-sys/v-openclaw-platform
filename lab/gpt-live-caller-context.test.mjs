import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveGptLiveCallInstructions, resolveGptLiveCaller, resolveGptLiveCallerSurface, extractGptLivePersona,
  createGptLiveCallLifecycleRuntimeSource } from "./gpt-live-call-lifecycle.mjs";
import { patchGptLiveCallerContextTalk } from "./patch-gpt-live-caller-context.mjs";
import { V_FRONTEND_PERSONA } from "./gpt-live-h5/persona.mjs";
import { GPT_LIVE_PERSONAL_SESSION_KEY } from "./gpt-live-h5/personal-session.mjs";

const key = entry => `agent:makaron:explicit:gpt-live-h5-${entry}-${randomUUID()}`;
const profile = { providerId: "openai", model: "gpt-live-1-codex", transport: "webrtc", brain: "agent-consult",
  capabilities: { handlesAgentConsult: true, supportsToolCalls: false } };
const persona = "Default presence:\nWarm and curious.\nIdentity:\nYou are V.\nSpeaker identity policy:\nAsk everyone who they are.\nBackchannel policy:\nFill every silence.\nAgency and judgment:\nPrivate info stays private.\nSelf-introduction policy:\nBe brief.\nPrivate bootstrap:\nSECRET_EXAMPLE";

test("the selected Feishu conversation gets personal phone identity and an explicit current-channel context", async () => {
  const instructions = resolveGptLiveCallInstructions("ignored", { ...profile, sessionKey: GPT_LIVE_PERSONAL_SESSION_KEY });
  assert.match(instructions, /默认是 Tianyi.*不再询问是谁/u);
  assert.match(instructions, /当前交流渠道是电话/u);
  assert.match(instructions, /飞书日历/u);
  const surface = resolveGptLiveCallerSurface("a browser Talk session", GPT_LIVE_PERSONAL_SESSION_KEY);
  assert.match(surface, /web voice call with Tianyi, not a Feishu group message/u);
  assert.match(surface, /Feishu calendar.*unless the caller explicitly specifies another source/u);
  assert.match(surface, /do not post to the group/u);
  assert.equal(resolveGptLiveCaller(GPT_LIVE_PERSONAL_SESSION_KEY + "-spoof"), null);
  assert.equal(resolveGptLiveCaller("agent:makaron:feishu:group:oc_fab91abe705f55cc63751731d9a258ab"), null);
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(createGptLiveCallLifecycleRuntimeSource()).toString("base64")}`);
  assert.equal(runtime.resolveGptLiveCallerSurface("a browser Talk session", GPT_LIVE_PERSONAL_SESSION_KEY), surface);
  assert.equal(runtime.resolveGptLiveCallInstructions("ignored", { ...profile, sessionKey: GPT_LIVE_PERSONAL_SESSION_KEY }), instructions);
});

test("experimental config still receives the frozen original V persona without private family examples", () => {
  const instructions = resolveGptLiveCallInstructions("ignored", { ...profile, sessionKey: key("visitor"), configuredInstructions: "Existing experimental speech policy" });
  assert.ok(instructions.includes(V_FRONTEND_PERSONA));
  assert.match(instructions, /Identity:|sharp, warm|Private information stays private/u);
  assert.doesNotMatch(V_FRONTEND_PERSONA, /十二|members of his family|Backchannel policy|Pause and silence policy/u);
  assert.equal(extractGptLivePersona("Identity:\nYour long-term partnership is with Tianyi, while realtime Talk may also be used by a private family example. Treat every confirmed speaker separately."),
    "Identity:\nYour long-term partnership is with Tianyi. Treat every confirmed speaker separately.");
});

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
