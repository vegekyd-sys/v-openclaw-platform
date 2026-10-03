import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCandidateSelectedModelsPreserved, collectCandidateSelectedModelReferences,
  disableCandidateParallelToolCalls, preflightCandidateConfig, scopeCandidateAgentToAgentAllow, validateCandidateConfigPure,
} from "./gpt-live-candidate-config-guard.mjs";

function fixtureConfig() {
  return {
    agents: {
      ownership: "explicit",
      defaults: {
        model: { primary: "deepseek/pro", fallbacks: [] },
        subagents: { model: { primary: "deepseek/flash", fallbacks: ["openai/fallback"] } },
        imageModel: { primary: "openai/image", fallbacks: ["deepseek/image"] },
        compaction: { model: "deepseek/compact" }, heartbeat: { model: "deepseek/heartbeat" },
        models: {
          "deepseek/pro": { agentRuntime: { id: "vlab-worker" } },
          "openai/*": { agentRuntime: { id: "vlab-worker" } },
          "openai/unused": { agentRuntime: { id: "codex" } },
        },
      },
      entries: { makaron: { model: "deepseek/flash", models: { "deepseek/flash": { agentRuntime: { id: "vlab-worker" } } } } },
    },
    models: { providers: { deepseek: { agentRuntime: { id: "vlab-worker" }, models: [{ id: "flash", name: "Selected" }] } } },
    plugins: { entries: { "vlab-agent-worker-isolation": { config: { fastCompactionModel: "deepseek/worker-compact" } } } },
    tools: { agentToAgent: { enabled: true, allow: ["makaron", "v-codex", "short-v", "xiaoai"] } },
    bindings: [{ agentId: "makaron" }],
  };
}

test("selection protection includes image, compaction, heartbeat, subagent and Worker compaction routes", () => {
  const config = fixtureConfig(), before = structuredClone(config);
  config.agents.entries.makaron.imageModel = "openai/agent-image";
  config.agents.entries.makaron.mediaModels = { video: { primary: "video/primary", fallbacks: ["video/fallback"] } };
  config.agents.entries.unrelated = { model: "openai/unrelated" };
  const refs = collectCandidateSelectedModelReferences(config);
  for (const model of ["deepseek/pro", "deepseek/flash", "openai/fallback", "openai/image", "deepseek/image", "deepseek/compact", "deepseek/heartbeat", "deepseek/worker-compact", "openai/agent-image", "video/primary", "video/fallback"]) {
    assert(refs.some((ref) => ref.model === model), model);
  }
  assert(!refs.some((ref) => ref.model === "openai/unused" || ref.model === "openai/unrelated"));
  assert.equal(before.agents.entries.makaron.mediaModels, undefined);
});

test("unused alias pruning passes while selected and wildcard runtime metadata must remain unchanged", () => {
  const before = fixtureConfig(), after = structuredClone(before);
  delete after.agents.defaults.models["openai/unused"];
  assertCandidateSelectedModelsPreserved(before, after);
  delete after.agents.defaults.models["openai/*"];
  assert.throws(() => assertCandidateSelectedModelsPreserved(before, after), /selected model metadata changed/u);
  const replaced = structuredClone(before);
  replaced.agents.entries.makaron.models["deepseek/flash"].agentRuntime.id = "openclaw";
  assert.throws(() => assertCandidateSelectedModelsPreserved(before, replaced), /selected model metadata changed/u);
});

test("image selection, provider runtime, and selected model catalog changes fail before launch", () => {
  const before = fixtureConfig();
  for (const edit of [
    (config) => { config.agents.defaults.imageModel.primary = "openai/new-image"; },
    (config) => { config.models.providers.deepseek.agentRuntime.id = "codex"; },
    (config) => { config.models.providers.deepseek.models[0].name = "Changed"; },
  ]) {
    const after = structuredClone(before); edit(after);
    assert.throws(() => assertCandidateSelectedModelsPreserved(before, after), /selected model/u);
  }
});

test("pruning another agent or unused catalog entry preserves stable owner/model identity", () => {
  const before = fixtureConfig();
  before.agents.list = [{ id: "other", model: "openai/other" }, { id: "makaron", model: "deepseek/flash", models: { "deepseek/flash": { agentRuntime: { id: "vlab-worker" } } } }];
  before.models.providers.deepseek.models.unshift({ id: "unused", name: "Not selected" });
  const after = structuredClone(before);
  after.agents.list = after.agents.list.filter((agent) => agent.id === "makaron");
  after.models.providers.deepseek.models.shift();
  const proof = assertCandidateSelectedModelsPreserved(before, after);
  assert(proof.selectedReferences.some((ref) => ref.path === "agents.list.makaron.model"));
  after.agents.list[0].models["deepseek/flash"].agentRuntime.id = "codex";
  assert.throws(() => assertCandidateSelectedModelsPreserved(before, after), /selected model metadata changed/u);
});

test("agent-to-agent scope removes the actual excluded agents without changing models or source config", () => {
  const before = fixtureConfig(), original = structuredClone(before);
  const result = scopeCandidateAgentToAgentAllow(before);
  assert.deepEqual(result.config.tools.agentToAgent.allow, ["makaron"]);
  assert.deepEqual(result.excludedAgentIds, ["v-codex", "short-v", "xiaoai"]);
  assert.equal(result.config.tools.agentToAgent.enabled, true);
  assert.equal(result.changed, true);
  assert.deepEqual(before, original);
  assertCandidateSelectedModelsPreserved(before, result.config);
});

test("scope rejects another roster or a list that would grant new permission", () => {
  const extraAgent = fixtureConfig(); extraAgent.agents.entries.other = {};
  assert.throws(() => scopeCandidateAgentToAgentAllow(extraAgent), /sole configured agent/u);
  const notAllowed = fixtureConfig(); notAllowed.tools.agentToAgent.allow = ["other"];
  assert.throws(() => scopeCandidateAgentToAgentAllow(notAllowed), /does not permit/u);
  const noPolicy = fixtureConfig(); delete noPolicy.tools.agentToAgent;
  assert.equal(scopeCandidateAgentToAgentAllow(noPolicy).changed, false);
});

test("Candidate provider flag changes only Makaron agent params and preserves source/model/other params", () => {
  const before = fixtureConfig();
  before.agents.defaults.params = { parallel_tool_calls: true, temperature: 0.25 };
  before.agents.defaults.models["deepseek/pro"].params = { parallel_tool_calls: true, maxTokens: 1234 };
  before.agents.entries.makaron.params = { parallelToolCalls: true, maxTokens: 987, response_format: { type: "json_object" } };
  const original = structuredClone(before), result = disableCandidateParallelToolCalls(before, { label: "main" });
  assert.deepEqual(before, original);
  const expected = structuredClone(original);
  expected.agents.entries.makaron.params.parallel_tool_calls = false;
  assert.deepEqual(result.config, expected);
  assertCandidateSelectedModelsPreserved(before, result.config);
  assert.deepEqual(result.diagnostic.changes[0].before.parallel_tool_calls, { present: false, type: "undefined" });
  assert.deepEqual(result.diagnostic.changes[0].before.parallelToolCalls, { present: true, type: "boolean", value: true });
  assert.equal(result.diagnostic.configuredValue, false);
  assert.equal(result.diagnostic.providerBehaviorVerified, false);
  assert.equal(result.diagnostic.toolOrderVerified, false);
  assert.equal(result.diagnostic.dispatcherChanged, false);
});

test("Candidate provider flag covers both native agent representations without rewriting defaults", () => {
  const before = fixtureConfig();
  before.agents.entries.makaron.params = { parallel_tool_calls: null, temperature: 0.15 };
  before.agents.list = [{ id: "makaron", model: "deepseek/flash", params: { parallel_tool_calls: true, parallelToolCalls: true, topP: 0.9 } }];
  const result = disableCandidateParallelToolCalls(before, { label: "worker" });
  assert.equal(result.config.agents.entries.makaron.params.parallel_tool_calls, false);
  assert.equal(result.config.agents.list[0].params.parallel_tool_calls, false);
  assert.equal(result.config.agents.list[0].params.parallelToolCalls, true);
  assert.deepEqual(result.config.agents.defaults, before.agents.defaults);
  assert.equal(result.diagnostic.changes.length, 2);
  assert.deepEqual(result.diagnostic.changes[0].before.parallel_tool_calls, { present: true, type: "null", value: null });
});

test("Candidate provider flag rejects unrelated agents and malformed params, and diagnostics exclude arbitrary values", () => {
  const other = fixtureConfig(); other.agents.entries.other = {};
  assert.throws(() => disableCandidateParallelToolCalls(other), /sole configured agent/u);
  const otherList = fixtureConfig(); otherList.agents.list = [{ id: "other" }];
  assert.throws(() => disableCandidateParallelToolCalls(otherList), /excluded list agent/u);
  const malformed = fixtureConfig(); malformed.agents.entries.makaron.params = [];
  assert.throws(() => disableCandidateParallelToolCalls(malformed), /must be a record/u);
  const diagnostic = fixtureConfig(); diagnostic.agents.entries.makaron.params = { parallel_tool_calls: "private-invalid-value", unrelated: "private-param" };
  const result = disableCandidateParallelToolCalls(diagnostic);
  assert(!JSON.stringify(result.diagnostic).includes("private-invalid-value"));
  assert(!JSON.stringify(result.diagnostic).includes("private-param"));
  assert.equal(result.config.agents.entries.makaron.params.unrelated, "private-param");
});

test("pure schema preflight surfaces native issue paths without replacing or serializing config", () => {
  const config = fixtureConfig(); config.bindings.push({ agentId: "short-v" });
  const source = structuredClone(config);
  const schema = { safeParse(input) {
    assert.equal(input, config);
    return { success: false, error: { issues: [{ path: ["bindings", 1, "agentId"], code: "custom", message: "Unknown agent id short-v" }] } };
  } };
  assert.throws(() => validateCandidateConfigPure(config, schema, { label: "Worker" }), (error) => {
    assert.match(error.message, /Worker.*bindings\.1\.agentId/u);
    assert.deepEqual(error.issues.map((issue) => issue.path), ["bindings.1.agentId"]);
    assert.equal(error.config, undefined); return true;
  });
  assert.deepEqual(config, source);
  const valid = validateCandidateConfigPure(config, { safeParse: () => ({ success: true, data: { defaultsApplied: true } }) });
  assert.equal(valid.ok, true); assert.equal(valid.nativeSchemaOnly, true); assert.equal(valid.gatewayValidated, false);
  assert.equal(valid.config, undefined);
});

function privateFixture(t) {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-live-config-guard-"));
  t.after(() => fs.rmSync(container, { recursive: true, force: true }));
  const candidateRoot = path.join(container, "candidate-config-guard"), runtime = path.join(candidateRoot, "runtime"), state = path.join(candidateRoot, "data/state");
  const dist = path.join(runtime, "openclaw/dist"), schemaFile = "zod-schema-test.js";
  fs.mkdirSync(dist, { recursive: true }); fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(runtime, "openclaw/package.json"), JSON.stringify({ type: "module" }));
  // A local stand-in tests loader isolation only; it is not native runtime acceptance.
  fs.writeFileSync(path.join(dist, schemaFile), "export const t = { safeParse: () => ({ success: true }) };\n");
  const configPath = path.join(state, "openclaw.json"); fs.writeFileSync(configPath, JSON.stringify(fixtureConfig()));
  return { container, candidateRoot, runtime, state, configPath, dist, schemaFile };
}

test("loader admits only the standalone schema and config inside actual private roots", async (t) => {
  const f = privateFixture(t), result = await preflightCandidateConfig(f);
  assert.equal(result.ok, true); assert.equal(result.schemaFile, f.schemaFile);
  await assert.rejects(() => preflightCandidateConfig({ ...f, schemaFile: "entry.js" }), /Standalone native schema/u);
  const sharedConfig = path.join(f.container, "shared-config.json"); fs.writeFileSync(sharedConfig, "{}");
  await assert.rejects(() => preflightCandidateConfig({ ...f, configPath: sharedConfig }), /inside owned private roots/u);
  await assert.rejects(() => preflightCandidateConfig({ ...f, runtime: f.container }), /inside owned private roots/u);
});

test("loader rejects a schema symlink to shared bytes before importing it", async (t) => {
  const f = privateFixture(t), outside = path.join(f.container, "shared-schema.js");
  fs.writeFileSync(outside, "throw new Error('must never import shared schema');\n");
  fs.unlinkSync(path.join(f.dist, f.schemaFile)); fs.symlinkSync(outside, path.join(f.dist, f.schemaFile));
  await assert.rejects(() => preflightCandidateConfig(f), /escaped its private runtime/u);
});
