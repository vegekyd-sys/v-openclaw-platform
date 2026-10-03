import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
