import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const DEFAULT_SCHEMA_FILE = "zod-schema-B8Isge8w.js";
const selectionFields = [
  ["model"], ["subagents", "model"], ["imageModel"],
  ["compaction", "model"], ["heartbeat", "model"],
];
const digest = (value) => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
const read = (object, keys) => keys.reduce((value, key) =>
  Array.isArray(value) && typeof key === "string" ? value.find((entry) => entry?.id === key) : value?.[key], object);
const displayPath = (keys) => keys.join(".");

function agentScopes(config, agentId) {
  const scopes = [["agents", "defaults"]];
  if (config.agents?.entries?.[agentId]) scopes.push(["agents", "entries", agentId]);
  for (const agent of config.agents?.list ?? []) {
    if (agent.id === agentId) scopes.push(["agents", "list", agentId]);
  }
  return scopes;
}

/** Authored selections only; model catalogs and unused aliases are not selections. */
export function collectCandidateSelectedModelReferences(config, { agentId = "makaron" } = {}) {
  const references = [];
  const collect = (value, keys) => {
    if (typeof value === "string" && value.trim()) references.push({ path: displayPath(keys), model: value.trim() });
    else if (Array.isArray(value)) value.forEach((item, index) => collect(item, [...keys, index]));
    else if (value && typeof value === "object") {
      for (const key of ["primary", "fallbacks"]) collect(value[key], [...keys, key]);
    }
  };
  for (const scope of agentScopes(config, agentId)) {
    const agent = read(config, scope);
    for (const keys of selectionFields) collect(read(agent, keys), [...scope, ...keys]);
    for (const [kind, selection] of Object.entries(agent?.mediaModels ?? {})) {
      collect(selection, [...scope, "mediaModels", kind]);
    }
  }
  // The actual Worker uses this explicit model for its fast-compaction route.
  const workerKeys = ["plugins", "entries", "vlab-agent-worker-isolation", "config", "fastCompactionModel"];
  collect(read(config, workerKeys), workerKeys);
  return references;
}

function matchesModelDefinition(key, definition, model) {
  if (key === model || definition?.alias === model) return true;
  if (!key.includes("*")) return false;
  const escaped = key.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
  return new RegExp(`^${escaped}$`, "u").test(model);
}

function selectedMetadataPaths(config, agentId, selected) {
  const paths = [];
  for (const scope of agentScopes(config, agentId)) {
    for (const [model, definition] of Object.entries(read(config, [...scope, "models"]) ?? {})) {
      if (selected.some((ref) => matchesModelDefinition(model, definition, ref.model))) paths.push([...scope, "models", model]);
    }
  }
  for (const [providerId, provider] of Object.entries(config.models?.providers ?? {})) {
    const modelIds = new Set(selected.filter((ref) => ref.model.startsWith(providerId + "/")).map((ref) => ref.model.slice(providerId.length + 1)));
    if (!modelIds.size) continue;
    paths.push(["models", "providers", providerId, "agentRuntime"]);
    for (const model of provider.models ?? []) {
      if (modelIds.has(model.id)) paths.push(["models", "providers", providerId, "models", model.id]);
    }
  }
  return paths;
}

/** Verify scope pruning preserves every selected model and its runtime metadata. */
export function assertCandidateSelectedModelsPreserved(before, after, { agentId = "makaron" } = {}) {
  const selected = collectCandidateSelectedModelReferences(before, { agentId });
  assert.equal(digest(collectCandidateSelectedModelReferences(after, { agentId })), digest(selected), "Candidate selected model references changed");
  const protectedMetadata = selectedMetadataPaths(before, agentId, selected);
  for (const keys of protectedMetadata) {
    assert.equal(digest(read(after, keys)), digest(read(before, keys)), `Candidate selected model metadata changed at ${displayPath(keys)}`);
  }
  return {
    selectedReferences: selected,
    protectedMetadata: protectedMetadata.map((keys) => ({
      path: displayPath(keys), definitionSha256: digest(read(after, keys)),
      runtimeId: read(after, keys)?.agentRuntime?.id ?? (keys.at(-1) === "agentRuntime" ? read(after, keys)?.id : null) ?? null,
    })),
  };
}

export const CANDIDATE_PRO_DIAGNOSTIC_MODEL = "deepseek/deepseek-v4-pro";
const CANDIDATE_FLASH_BASELINE_MODEL = "deepseek/deepseek-v4-flash";
const diagnosticPrimaryPath = "agents.entries.makaron.model.primary";

function assertBackendDiagnosticIdentity({ flag, candidateId, label }) {
  assert(flag === CANDIDATE_PRO_DIAGNOSTIC_MODEL, "Unsupported Candidate backend diagnostic flag");
  assert(/^candidate-[a-z0-9-]{1,100}$/u.test(candidateId ?? ""), "Candidate backend diagnostic owner required");
  assert(["main", "worker"].includes(label), "Candidate backend diagnostic copy required");
}

function assertConfiguredDiagnosticRuntime(config, label) {
  // The main Gateway delegates to its private Worker; the Worker must execute
  // with openclaw rather than recursively dispatching to another Worker.
  const expectedRuntime = label === "main" ? "vlab-worker" : "openclaw";
  const provider = config.models?.providers?.deepseek;
  assert(provider && provider.agentRuntime?.id === expectedRuntime, "Candidate backend provider runtime drifted");
  for (const ref of [CANDIDATE_FLASH_BASELINE_MODEL, CANDIDATE_PRO_DIAGNOSTIC_MODEL]) {
    const id = ref.slice("deepseek/".length);
    const catalog = (provider.models ?? []).filter((model) => model.id === id);
    assert.equal(catalog.length, 1, "Candidate backend model must already have one configured catalog entry");
    assert(catalog[0].agentRuntime === undefined || catalog[0].agentRuntime.id === expectedRuntime,
      "Candidate backend catalog runtime drifted");
    const definition = config.agents?.defaults?.models?.[ref];
    assert(definition?.agentRuntime?.id === expectedRuntime, "Candidate backend model runtime closure drifted");
    for (const scope of agentScopes(config, "makaron")) {
      for (const [key, metadata] of Object.entries(read(config, [...scope, "models"]) ?? {})) {
        if (matchesModelDefinition(key, metadata, ref)) {
          assert(metadata && typeof metadata === "object" && !Array.isArray(metadata), "Candidate backend alias definition drifted");
          if (metadata.agentRuntime === undefined) continue;
          assert(metadata.agentRuntime?.id === expectedRuntime, "Candidate backend alias runtime conflicts");
        }
      }
    }
  }
  return expectedRuntime;
}

/** A diagnostic config overlay only; it grants no model or deployment acceptance. */
export function applyCandidateBackendRouteDiagnostic(config, { flag, candidateId, label } = {}) {
  if (flag === undefined) return { config, diagnostic: { applied: false } };
  assertBackendDiagnosticIdentity({ flag, candidateId, label });
  const originalModel = config.agents?.entries?.makaron?.model;
  assert(originalModel && typeof originalModel === "object" && !Array.isArray(originalModel),
    "Candidate backend diagnostic requires the existing object selection");
  assert(originalModel.primary === CANDIDATE_FLASH_BASELINE_MODEL, "Candidate backend baseline primary drifted");
  assert(Array.isArray(originalModel.fallbacks) && originalModel.fallbacks.length === 0,
    "Candidate backend diagnostic must preserve the empty fallback list");
  // One primary field is sufficient only with the observed inheritance shape.
  // Reject another selector instead of silently rewriting a second route.
  for (const scope of agentScopes(config, "makaron")) {
    assert(read(config, [...scope, "subagents", "model"]) === undefined,
      "Candidate backend diagnostic has an explicit child model selection");
    if (scope[1] === "list") assert(read(config, [...scope, "model"]) === undefined,
      "Candidate backend diagnostic has an explicit list model selection");
  }
  const runtimeId = assertConfiguredDiagnosticRuntime(config, label);
  const scoped = structuredClone(config);
  scoped.agents.entries.makaron.model.primary = CANDIDATE_PRO_DIAGNOSTIC_MODEL;
  const rewound = structuredClone(scoped);
  rewound.agents.entries.makaron.model.primary = originalModel.primary;
  assert(isDeepStrictEqual(rewound, config), "Candidate backend diagnostic changed more than its primary");
  return { config: scoped, diagnostic: {
    applied: true, candidateId, label, scope: "Disposable Candidate backend route diagnostic",
    changedPath: diagnosticPrimaryPath, before: originalModel.primary, after: CANDIDATE_PRO_DIAGNOSTIC_MODEL,
    runtimeId, beforeConfigSha256: digest(config), overlayConfigSha256: digest(scoped),
    onlyPrimaryChanged: true, defaultsPreserved: true, fallbacksPreserved: true, providerMetadataPreserved: true,
    modelSemanticsVerified: false, actualProviderResponseVerified: false, combinedReleaseAccepted: false,
  } };
}

/** Protect both the former Flash metadata and the newly selected Pro metadata. */
export function assertCandidateBackendRouteDiagnosticPreserved(before, after, options) {
  const overlay = applyCandidateBackendRouteDiagnostic(before, options);
  if (!overlay.diagnostic.applied) return { applied: false };
  const selectedPro = assertCandidateSelectedModelsPreserved(overlay.config, after);
  const rewound = structuredClone(after);
  rewound.agents.entries.makaron.model.primary = CANDIDATE_FLASH_BASELINE_MODEL;
  const selectedFlash = assertCandidateSelectedModelsPreserved(before, rewound);
  // Selected-model metadata alone does not include provider credentials,
  // endpoints, headers or API shape. Preserve the complete original provider.
  assert(isDeepStrictEqual(before.models.providers.deepseek, after.models?.providers?.deepseek),
    "Candidate backend complete provider configuration changed");
  // Reference lists omit empty fallback arrays and other authored selector
  // shape. Preserve those fields while allowing the existing isolation setup
  // to change workspace, heartbeat cadence and agent-to-agent permissions.
  for (const scope of agentScopes(overlay.config, "makaron")) {
    for (const field of [...selectionFields, ["mediaModels"]]) {
      assert(isDeepStrictEqual(read(overlay.config, [...scope, ...field]), read(after, [...scope, ...field])),
        "Candidate backend authored model selection changed");
    }
  }
  assertConfiguredDiagnosticRuntime(after, options.label);
  const summary = (proof) => {
    assert(proof.selectedReferences.length <= 64 && proof.protectedMetadata.length <= 128,
      "Candidate backend selected proof exceeds its bounded scope");
    return { selectedCount: proof.selectedReferences.length, metadataCount: proof.protectedMetadata.length,
      selectedReferencesSha256: digest(proof.selectedReferences), protectedMetadataSha256: digest(proof.protectedMetadata) };
  };
  return { ...overlay.diagnostic, postIsolationConfigSha256: digest(after),
    selectedPro: summary(selectedPro), selectedFlash: summary(selectedFlash) };
}

/** Pair the two private configs before either bootstrap write or voice startup. */
export function assertCandidateBackendRouteDiagnosticPair({ mainBefore, mainAfter, workerBefore, workerAfter }, options) {
  if (options?.flag === undefined) return { applied: false };
  const main = assertCandidateBackendRouteDiagnosticPreserved(mainBefore, mainAfter, { ...options, label: "main" });
  const worker = assertCandidateBackendRouteDiagnosticPreserved(workerBefore, workerAfter, { ...options, label: "worker" });
  assert.equal(main.candidateId, worker.candidateId, "Candidate backend diagnostic owners differ");
  assert.equal(main.after, worker.after, "Candidate backend diagnostic routes differ");
  return { applied: true, candidateId: main.candidateId, model: CANDIDATE_PRO_DIAGNOSTIC_MODEL,
    scope: "Disposable Candidate main and private Worker Makaron only", main, worker,
    normalFlashValidationReplaced: false, combinedReleaseAccepted: false };
}

/** Pure canonical-path check; callers resolve existing roots before applying it. */
export function assertCandidateBackendDiagnosticPaths({ candidateId, candidateRoot, runtime, state, configPath, workerConfigPath }) {
  assert(/^candidate-[a-z0-9-]{1,100}$/u.test(candidateId ?? ""), "Candidate backend diagnostic owner required");
  assert([candidateRoot, runtime, state, configPath, workerConfigPath].every((value) =>
    typeof value === "string" && path.isAbsolute(value) && path.resolve(value) === value),
  "Candidate backend diagnostic canonical private paths required");
  assert.equal(path.basename(candidateRoot), candidateId, "Candidate backend diagnostic root owner differs");
  assert(isInside(candidateRoot, runtime) && isInside(candidateRoot, state) && isInside(state, configPath) &&
    isInside(state, workerConfigPath) && configPath !== workerConfigPath,
  "Candidate backend diagnostic configs must remain in their owned private roots");
  return { candidateId, privatePathsVerified: true };
}

/** Restrict the actual global agent-to-agent allowlist without changing models. */
export function scopeCandidateAgentToAgentAllow(config, { agentId = "makaron" } = {}) {
  const ids = Object.keys(config.agents?.entries ?? {});
  assert.deepEqual(ids, [agentId], "Candidate agent-to-agent scope requires a sole configured agent");
  const scoped = structuredClone(config);
  const policy = scoped.tools?.agentToAgent;
  if (!policy) return { config: scoped, changed: false, excludedAgentIds: [] };
  const allow = policy.allow;
  assert(allow === undefined || (Array.isArray(allow) && allow.every((id) => typeof id === "string")), "Candidate agent-to-agent allowlist is malformed");
  // Avoid turning a restrictive list without this agent into an empty/open list.
  assert(allow === undefined || allow.includes(agentId) || allow.includes("*"), "Candidate agent-to-agent policy does not permit the scoped agent");
  policy.allow = [agentId];
  assertCandidateSelectedModelsPreserved(config, scoped, { agentId });
  return {
    config: scoped, changed: digest(allow) !== digest(policy.allow),
    excludedAgentIds: (allow ?? []).filter((id) => id !== agentId),
  };
}

/** Provider request setting only; actual tool ordering still requires native evidence. */
export function disableCandidateParallelToolCalls(config, { agentId = "makaron", label = "Candidate" } = {}) {
  const ids = Object.keys(config.agents?.entries ?? {});
  assert.deepEqual(ids, [agentId], "Candidate provider setting requires a sole configured agent");
  const scoped = structuredClone(config), changes = [];
  const scopes = [["agents", "entries", agentId], ...(scoped.agents.list ?? [])
    .filter((agent) => agent.id === agentId).map(() => ["agents", "list", agentId])];
  assert((scoped.agents.list ?? []).every((agent) => agent.id === agentId), "Candidate provider setting has an excluded list agent");
  for (const keys of scopes) {
    const agent = read(scoped, keys), params = agent.params;
    assert(params === undefined || (params && typeof params === "object" && !Array.isArray(params)), "Candidate agent params must be a record");
    const original = (key) => {
      const present = Object.hasOwn(params ?? {}, key), value = params?.[key];
      // Do not serialize malformed string/object values into public diagnostics.
      return { present, type: value === null ? "null" : typeof value,
        ...((typeof value === "boolean" || value === null) ? { value } : {}) };
    };
    const before = { parallel_tool_calls: original("parallel_tool_calls"), parallelToolCalls: original("parallelToolCalls") };
    agent.params = { ...params, parallel_tool_calls: false };
    changes.push({ path: displayPath([...keys, "params", "parallel_tool_calls"]), before, after: false });
  }
  const preservedSelectedModels = assertCandidateSelectedModelsPreserved(config, scoped, { agentId });
  return { config: scoped, diagnostic: { label, agentId, scope: "Disposable Candidate Makaron parent and same-agent child",
    providerParameter: "parallel_tool_calls", configuredValue: false, changes, preservedSelectedModels,
    dispatcherChanged: false, providerBehaviorVerified: false, toolOrderVerified: false } };
}

/** No defaults, plugin metadata discovery, database access, or Gateway admission. */
export function validateCandidateConfigPure(config, schema, { label = "Candidate" } = {}) {
  assert(typeof schema?.safeParse === "function", "Native Candidate schema.safeParse unavailable");
  const result = schema.safeParse(config);
  assert(typeof result?.success === "boolean", "Native Candidate schema returned an invalid result");
  if (!result.success) {
    const issues = (result.error?.issues ?? []).map((issue) => ({
      path: displayPath(issue.path ?? []), code: issue.code, message: issue.message,
    }));
    const error = new Error(`${label} config failed native schema preflight: ${issues.map((issue) => issue.path).join(", ") || "unknown issue"}`);
    error.issues = issues;
    throw error;
  }
  return { ok: true, label, configSha256: digest(config), nativeSchemaOnly: true, gatewayValidated: false };
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
}

/** Import only the standalone schema inside this disposable private runtime. */
export async function preflightCandidateConfig({ candidateRoot, runtime, state, configPath, schemaFile = DEFAULT_SCHEMA_FILE, label }) {
  assert(candidateRoot && runtime && state && configPath, "Explicit Candidate private roots are required");
  const rootReal = fs.realpathSync(candidateRoot);
  assert(/^candidate-[a-z0-9-]+$/iu.test(path.basename(rootReal)), "Candidate root identity required");
  const runtimeReal = fs.realpathSync(runtime), stateReal = fs.realpathSync(state), configReal = fs.realpathSync(configPath);
  assert(isInside(rootReal, runtimeReal) && isInside(rootReal, stateReal) && isInside(stateReal, configReal), "Candidate config/runtime must remain inside owned private roots");
  assert(/^zod-schema-[a-z0-9_-]+\.js$/iu.test(schemaFile), "Standalone native schema file required");
  const distReal = fs.realpathSync(path.join(runtimeReal, "openclaw", "dist"));
  const schemaReal = fs.realpathSync(path.join(distReal, schemaFile));
  assert(isInside(runtimeReal, distReal) && isInside(distReal, schemaReal), "Candidate native schema escaped its private runtime");
  const { t: schema } = await import(pathToFileURL(schemaReal).href);
  const config = JSON.parse(fs.readFileSync(configReal, "utf8"));
  return { ...validateCandidateConfigPure(config, schema, { label }), schemaFile, configPath: configReal };
}
