import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import {
  assertCandidateSelectedModelsPreserved, collectCandidateSelectedModelReferences,
  disableCandidateParallelToolCalls, preflightCandidateConfig, scopeCandidateAgentToAgentAllow, validateCandidateConfigPure,
  CANDIDATE_PRO_DIAGNOSTIC_MODEL, applyCandidateBackendRouteDiagnostic,
  assertCandidateBackendRouteDiagnosticPreserved, assertCandidateBackendRouteDiagnosticPair, assertCandidateBackendDiagnosticPaths,
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

function diagnosticFixture(label) {
  const config = fixtureConfig(), runtimeId = label === "main" ? "vlab-worker" : "openclaw";
  delete config.agents.defaults.subagents.model;
  config.agents.defaults.model = { primary: CANDIDATE_PRO_DIAGNOSTIC_MODEL, fallbacks: [] };
  for (const model of ["deepseek/deepseek-v4-flash", CANDIDATE_PRO_DIAGNOSTIC_MODEL]) {
    config.agents.defaults.models[model] = { agentRuntime: { id: runtimeId }, params: { temperature: 0.1 } };
  }
  config.agents.entries.makaron.model = { primary: "deepseek/deepseek-v4-flash", fallbacks: [] };
  config.agents.entries.makaron.models = { [CANDIDATE_PRO_DIAGNOSTIC_MODEL]: {} };
  config.models.providers.deepseek = { agentRuntime: { id: runtimeId }, apiKey: "fixture-secret-never-in-proof",
    models: [{ id: "deepseek-v4-flash", name: "Existing Flash" }, { id: "deepseek-v4-pro", name: "Existing Pro" }] };
  return config;
}

const diagnosticOptions = (label) => ({ flag: CANDIDATE_PRO_DIAGNOSTIC_MODEL, candidateId: "candidate-route-test", label });

test("absent backend diagnostic flag retains the original config object and Flash path", () => {
  const before = fixtureConfig();
  const result = applyCandidateBackendRouteDiagnostic(before);
  assert.equal(result.config, before);
  assert.deepEqual(result.diagnostic, { applied: false });
  assert.equal(before.agents.entries.makaron.model, "deepseek/flash");
  assert.deepEqual(assertCandidateBackendRouteDiagnosticPair({}, {}), { applied: false });
});

test("explicit Pro diagnostic changes one primary in each private copy without changing credentials or defaults", () => {
  for (const label of ["main", "worker"]) {
    const before = diagnosticFixture(label), original = structuredClone(before);
    const result = applyCandidateBackendRouteDiagnostic(before, diagnosticOptions(label));
    const expected = structuredClone(original); expected.agents.entries.makaron.model.primary = CANDIDATE_PRO_DIAGNOSTIC_MODEL;
    assert.deepEqual(result.config, expected);
    assert.deepEqual(before, original);
    result.config.agents.entries.makaron.model.primary = original.agents.entries.makaron.model.primary;
    assert.deepEqual(result.config, original);
    assert.equal(result.diagnostic.runtimeId, label === "main" ? "vlab-worker" : "openclaw");
    assert.equal(result.diagnostic.changedPath, "agents.entries.makaron.model.primary");
    assert.equal(result.diagnostic.combinedReleaseAccepted, false);
    assert.equal(result.diagnostic.modelSemanticsVerified, false);
    assert(!JSON.stringify(result.diagnostic).includes("fixture-secret-never-in-proof"));
  }
});

test("diagnostic rejects unsupported flags, owner and copy without exposing their supplied values", () => {
  const before = diagnosticFixture("main");
  for (const flag of ["", "deepseek/new-model", "private-invalid-flag"]) {
    assert.throws(() => applyCandidateBackendRouteDiagnostic(before, { ...diagnosticOptions("main"), flag }),
      (error) => /Unsupported Candidate/u.test(error.message) && !error.message.includes("private-invalid-flag"));
  }
  assert.throws(() => applyCandidateBackendRouteDiagnostic(before, { ...diagnosticOptions("main"), candidateId: "shared" }), /owner required/u);
  assert.throws(() => applyCandidateBackendRouteDiagnostic(before, { ...diagnosticOptions("main"), label: "shared" }), /copy required/u);
});

test("diagnostic rejects baseline, fallback, catalog and runtime drift rather than adding model configuration", () => {
  for (const edit of [
    (config) => { config.agents.entries.makaron.model = "deepseek/deepseek-v4-flash"; },
    (config) => { config.agents.entries.makaron.model.primary = CANDIDATE_PRO_DIAGNOSTIC_MODEL; },
    (config) => { config.agents.entries.makaron.model.fallbacks.push(CANDIDATE_PRO_DIAGNOSTIC_MODEL); },
    (config) => { config.models.providers.deepseek.models.pop(); },
    (config) => { config.models.providers.deepseek.models.push({ id: "deepseek-v4-pro" }); },
    (config) => { config.models.providers.deepseek.agentRuntime.id = "openclaw"; },
    (config) => { config.agents.defaults.models[CANDIDATE_PRO_DIAGNOSTIC_MODEL].agentRuntime.id = "codex"; },
    (config) => { config.agents.entries.makaron.models["deepseek/*"] = { agentRuntime: { id: "claude-cli" } }; },
    (config) => { config.models.providers.deepseek.models[1].agentRuntime = { id: "codex" }; },
  ]) {
    const config = diagnosticFixture("main"); edit(config);
    assert.throws(() => applyCandidateBackendRouteDiagnostic(config, diagnosticOptions("main")));
  }
  const recursiveWorker = diagnosticFixture("worker"); recursiveWorker.models.providers.deepseek.agentRuntime.id = "vlab-worker";
  assert.throws(() => applyCandidateBackendRouteDiagnostic(recursiveWorker, diagnosticOptions("worker")), /runtime drifted/u);
});

test("diagnostic rejects an explicit list or child selector rather than expanding its one-field scope", () => {
  for (const edit of [
    (config) => { config.agents.list = [{ id: "makaron", model: "deepseek/deepseek-v4-flash" }]; },
    (config) => { config.agents.entries.makaron.subagents = { model: CANDIDATE_PRO_DIAGNOSTIC_MODEL }; },
    (config) => { config.agents.defaults.subagents.model = "deepseek/deepseek-v4-flash"; },
  ]) {
    const config = diagnosticFixture("main"); edit(config);
    assert.throws(() => applyCandidateBackendRouteDiagnostic(config, diagnosticOptions("main")), /explicit (list|child) model selection/u);
  }
  const inheritedList = diagnosticFixture("main"); inheritedList.agents.list = [{ id: "makaron", params: { temperature: 0.3 } }];
  assert.equal(applyCandidateBackendRouteDiagnostic(inheritedList, diagnosticOptions("main")).diagnostic.applied, true);
});

test("both original Flash and new Pro metadata retain their existing generic preservation checks", () => {
  const before = diagnosticFixture("main"), result = applyCandidateBackendRouteDiagnostic(before, diagnosticOptions("main"));
  const proof = assertCandidateBackendRouteDiagnosticPreserved(before, result.config, diagnosticOptions("main"));
  assert(proof.selectedFlash.metadataCount > 0 && proof.selectedPro.metadataCount > 0);
  for (const model of ["deepseek/deepseek-v4-flash", CANDIDATE_PRO_DIAGNOSTIC_MODEL]) {
    const after = structuredClone(result.config); after.agents.defaults.models[model].params.temperature = 0.9;
    assert.throws(() => assertCandidateBackendRouteDiagnosticPreserved(before, after, diagnosticOptions("main")), /selected model metadata changed/u);
  }
  const alteredFallback = structuredClone(result.config); alteredFallback.agents.defaults.model.fallbacks.push("openai/new");
  assert.throws(() => assertCandidateBackendRouteDiagnosticPreserved(before, alteredFallback, diagnosticOptions("main")), /selected model references changed/u);
  assert.throws(() => assertCandidateSelectedModelsPreserved(before, result.config), /selected model references changed/u);
});

test("Pro-only post-isolation guard preserves the complete provider without printing credentials", () => {
  for (const label of ["main", "worker"]) {
    const before = diagnosticFixture(label);
    Object.assign(before.models.providers.deepseek, { baseUrl: "https://fixture.invalid/v1",
      headers: { Authorization: "fixture-private-header" }, api: "openai-completions" });
    const result = applyCandidateBackendRouteDiagnostic(before, diagnosticOptions(label));
    for (const edit of [
      (provider) => { provider.apiKey = "anonymous-changed-secret"; },
      (provider) => { provider.baseUrl = "https://anonymous-changed.invalid/v1"; },
      (provider) => { provider.headers.Authorization = "anonymous-changed-secret"; },
      (provider) => { provider.api = "anonymous-changed-api"; },
    ]) {
      const after = structuredClone(result.config); edit(after.models.providers.deepseek);
      assert.throws(() => assertCandidateBackendRouteDiagnosticPreserved(before, after, diagnosticOptions(label)),
        (error) => error.message === "Candidate backend complete provider configuration changed" &&
          !error.stack.includes("anonymous-changed") && !error.stack.includes("fixture-private-header"));
    }
    assert.equal(assertCandidateBackendRouteDiagnosticPreserved(before, result.config, diagnosticOptions(label)).providerMetadataPreserved, true);
  }
  // The opt-in guard must not introduce a new check on the original path.
  assert.deepEqual(assertCandidateBackendRouteDiagnosticPreserved({}, { arbitrary: "unchanged normal contract" }, {}), { applied: false });
});

test("Pro-only post-isolation guard preserves empty fallbacks and authored selector shape", () => {
  const before = diagnosticFixture("main"), result = applyCandidateBackendRouteDiagnostic(before, diagnosticOptions("main"));
  for (const scope of ["defaults", "makaron"]) {
    for (const edit of [
      (agent) => { delete agent.model.fallbacks; },
      (agent) => { agent.model.fallbacks = null; },
      (agent) => { agent.model.secondary = "anonymous-secondary"; },
    ]) {
      const after = structuredClone(result.config);
      edit(scope === "defaults" ? after.agents.defaults : after.agents.entries.makaron);
      assert.throws(() => assertCandidateBackendRouteDiagnosticPreserved(before, after, diagnosticOptions("main")),
        /authored model selection changed/u);
    }
  }
  const normalIsolation = structuredClone(result.config);
  normalIsolation.agents.defaults.workspace = "/private/candidate/workspace";
  normalIsolation.agents.defaults.heartbeat.every = "0m";
  normalIsolation.agents.entries.makaron.subagents = { allowAgents: ["makaron"] };
  assert.equal(assertCandidateBackendRouteDiagnosticPreserved(before, normalIsolation, diagnosticOptions("main")).fallbacksPreserved, true);
});

test("paired main and Worker diagnostic is bounded and refuses a stale or mixed Worker route", () => {
  const mainBefore = diagnosticFixture("main"), workerBefore = diagnosticFixture("worker");
  const mainAfter = applyCandidateBackendRouteDiagnostic(mainBefore, diagnosticOptions("main")).config;
  const workerAfter = applyCandidateBackendRouteDiagnostic(workerBefore, diagnosticOptions("worker")).config;
  const proof = assertCandidateBackendRouteDiagnosticPair({ mainBefore, mainAfter, workerBefore, workerAfter }, diagnosticOptions("main"));
  assert.equal(proof.main.runtimeId, "vlab-worker"); assert.equal(proof.worker.runtimeId, "openclaw");
  assert.equal(proof.normalFlashValidationReplaced, false); assert.equal(proof.combinedReleaseAccepted, false);
  const serialized = JSON.stringify(proof);
  assert(serialized.length < 4096 && !serialized.includes("fixture-secret-never-in-proof"));
  assert(!serialized.includes("apiKey") && !serialized.includes("config\":"));
  assert.throws(() => assertCandidateBackendRouteDiagnosticPair({ mainBefore, mainAfter, workerBefore, workerAfter: workerBefore }, diagnosticOptions("main")), /selected model references changed/u);
});

test("diagnostic private path guard rejects shared, escaped and duplicate config targets", () => {
  const candidateRoot = "/tmp/candidate-route-test", state = candidateRoot + "/state";
  const options = { candidateId: "candidate-route-test", candidateRoot, runtime: candidateRoot + "/runtime", state,
    configPath: state + "/main.json", workerConfigPath: state + "/worker.json" };
  assert.equal(assertCandidateBackendDiagnosticPaths(options).privatePathsVerified, true);
  for (const edit of [
    { candidateId: "candidate-someone-else" }, { runtime: "/srv/shared/runtime" },
    { configPath: "/srv/shared/config.json" }, { workerConfigPath: options.configPath },
    { workerConfigPath: state + "/../shared.json" },
  ]) assert.throws(() => assertCandidateBackendDiagnosticPaths({ ...options, ...edit }));
});

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

test("actual bootstrap pairs routes and private paths before its first config write", (t) => {
  const source = fs.readFileSync(new URL("./gpt-live-h5-candidate.mjs", import.meta.url), "utf8");
  const start = source.indexOf("let backendRouteDiagnostic;"), end = source.indexOf("const schemaPreflight=[];", start);
  assert(start >= 0 && end > start);
  const actualWriteBoundary = source.slice(start, end);
  for (const scenario of ["valid", "mixed-worker", "symlink-worker"]) {
    const f = privateFixture(t), state = fs.realpathSync(f.state), runtime = fs.realpathSync(f.runtime);
    // The wrapper prepares its owned main config with 0600 before bootstrap.
    fs.chmodSync(f.configPath, 0o600);
    const configPath = fs.realpathSync(f.configPath), candidateId = path.basename(fs.realpathSync(f.candidateRoot));
    const mainBefore = diagnosticFixture("main"), workerBefore = diagnosticFixture("worker");
    const options = { flag: CANDIDATE_PRO_DIAGNOSTIC_MODEL, candidateId };
    const config = applyCandidateBackendRouteDiagnostic(mainBefore, { ...options, label: "main" }).config;
    const workerConfig = scenario === "mixed-worker" ? structuredClone(workerBefore)
      : applyCandidateBackendRouteDiagnostic(workerBefore, { ...options, label: "worker" }).config;
    const workerTarget = path.join(state, "worker/openclaw.json"), writes = [];
    if (scenario === "symlink-worker") {
      const outside = path.join(f.container, "shared-worker"); fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.dirname(workerTarget));
    }
    const guardedFs = { existsSync: fs.existsSync, realpathSync: fs.realpathSync,
      mkdirSync(...args) { writes.push({ operation: "mkdir", target: args[0] }); return fs.mkdirSync(...args); },
      writeFileSync(...args) { writes.push({ operation: "write", target: args[0] }); return fs.writeFileSync(...args); } };
    const context = vm.createContext({ fs: guardedFs, path, assert, runtime, state, configPath,
      worker: { workerConfigPath: workerTarget }, config, workerConfig, mainRouteBefore: mainBefore, workerRouteBefore: workerBefore,
      backendRouteFlag: options.flag, backendRouteOptions: options, process: { env: { VLAB_CANDIDATE_ID: candidateId } },
      assertCandidateBackendDiagnosticPaths, assertCandidateBackendRouteDiagnosticPair });
    const run = () => vm.runInContext(actualWriteBoundary + "\nglobalThis.proof = backendRouteDiagnostic;", context);
    if (scenario !== "valid") {
      assert.throws(run);
      assert.equal(writes.length, 0, "A rejected route/path pair must precede all config mutations");
      assert(!fs.existsSync(workerTarget));
    } else {
      run();
      assert.equal(context.proof.privatePathsVerified, true);
      assert.equal(context.proof.combinedReleaseAccepted, false);
      assert.deepEqual(writes.filter((row) => row.operation === "write").map((row) => row.target), [workerTarget, configPath]);
      for (const file of [workerTarget, configPath]) {
        assert.equal(JSON.parse(fs.readFileSync(file)).agents.entries.makaron.model.primary, CANDIDATE_PRO_DIAGNOSTIC_MODEL);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
    }
  }
});

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
