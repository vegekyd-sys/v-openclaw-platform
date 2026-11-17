import { createHash } from 'node:crypto';

// infer-latency: `openclaw infer` on V. See docs/infer-latency-20261117.md.
//
// CLI (each `openclaw infer` is a new process; no Gateway restart):
//   config-guard: infer/capability skip the state migration preflight (a child process took a full
//     sqlite.backup() of the 862 MB state database, then integrity-checked it: 8-21 s per call);
//     `--gateway` reads core-only validated config (the Gateway validates plugin config).
// Gateway (loaded at start; needs a restart):
//   lifecycle-state + internal-session-effects: the model run deleting its own hidden
//     internal-session-effects session skips the store-wide reference read (#611's fingerprint pass
//     over every session row, 1.3-2 s on the main thread per `infer --gateway`).
//
// Source: vegekyd-sys/openclaw-versa versa/port-infer-latency-20261117 (on 1a9308eec02, V's source
// for the session chunks).

export const MARKER = 'infer-latency';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const CONFIG_GUARD = 'config-guard--4cC6uJU.js';
export const LIFECYCLE_STATE = 'session-accessor.sqlite-lifecycle-state-CrB_K2kA.js';
export const INTERNAL_EFFECTS = 'internal-session-effects-C8FWqbuL.js';
export const SESSION_ACCESSOR = 'session-accessor-K0XuW6ln.js';
export const COMMAND_POLICY = 'command-path-policy-qUeic05b.js';
export const LOAD_PLAN = 'runtime-plugin-load-plan-Bm46qisR.js';
export const SIMPLE_COMPLETION = 'simple-completion-runtime-D9F09LT6.js';
export const INFER_MODEL = 'model-fXXfAcf8.js';
export const RUNTIME_FACTS = 'prepared-model-runtime.facts-CEW6RO02.js';

const GUARD_LINE_START = '\tconst shouldConsiderStateMigration = !params.validateConfigOnly && commandName !== "config" && commandName !== "health" && commandName !== "logs" && commandName !== "sessions" && ';

export const FILES = {
  [CONFIG_GUARD]: {
    // npm 2026.9.1 bytes, unchanged on V (db91-release-v2026.9.1-db91.6/core/dist, 2026-11-17)
    before: '8a221eb34c58271215cf5305c696376dc861e19a2a67e00965deb05acbae4f9d',
    layer: 'cli',
    edits: [
      [
        GUARD_LINE_START,
        `\t// ${MARKER}: one-shot inference is a provider surface, not a state owner; its preflight\n` +
          '\t// snapshotted and integrity-checked the whole state database on every call.\n' +
          `${GUARD_LINE_START}commandName !== "infer" && commandName !== "capability" && `,
      ],
      [
        'import { a as withSuppressedNotes } from "./note-S3UJZiOI.js";\n',
        'import { a as withSuppressedNotes } from "./note-S3UJZiOI.js";\nimport { s as hasFlag } from "./argv-BGeU0eAz.js";\n',
      ],
      [
        '\tconst configSnapshotOptions = params.validateConfigOnly ? {\n\t\tobserve: false,\n\t\tpluginValidation: "core-only"\n\t} : commandName === "logs" ? {\n',
        `\t// ${MARKER}: Gateway-dispatched inference validates plugin config in the Gateway; locally it needs core config.\n` +
          '\tconst isGatewayDispatchedInference = (commandName === "infer" || commandName === "capability") && hasFlag(process.argv, "--gateway");\n' +
          '\tconst configSnapshotOptions = params.validateConfigOnly ? {\n\t\tobserve: false,\n\t\tpluginValidation: "core-only"\n\t} : commandName === "logs" || isGatewayDispatchedInference ? {\n',
      ],
    ],
  },
  [COMMAND_POLICY]: {
    before: '4b1ccc0efa5fc55ef16959964c91a12fd8ae1e22519b90d7a1b0c219f5d87b21',
    layer: 'cli',
    edits: [
      [
        '\t{\n\t\tcommandPath: ["message"],\n\t\tpolicy: { loadPlugins: "never" }\n\t},\n',
        `\t// ${MARKER}: Gateway-dispatched inference only talks to the local Gateway; \`--local\` keeps the operator proxy.\n` +
          '\t{\n\t\tcommandPath: ["infer"],\n\t\tpolicy: { networkProxy: ({ argv }) => hasFlag(argv, "--gateway") ? "bypass" : "default" }\n\t},\n' +
          '\t{\n\t\tcommandPath: ["capability"],\n\t\tpolicy: { networkProxy: ({ argv }) => hasFlag(argv, "--gateway") ? "bypass" : "default" }\n\t},\n' +
          '\t{\n\t\tcommandPath: ["message"],\n\t\tpolicy: { loadPlugins: "never" }\n\t},\n',
      ],
    ],
  },
  [LOAD_PLAN]: {
    before: '132c9ec91bd60838e0f9ebdd78b168be80c15e7f091797a08255acfa0809479c',
    layer: 'cli',
    edits: [
      [
        'function resolveAgentRuntimePluginSelections(config, selections, configuredHarnessRuntimes = collectConfiguredAgentHarnessRuntimes(config ?? {})) {\n\treturn [...configuredHarnessRuntimes.map((runtime) => ({\n',
        `/** ${MARKER}: true when every selection is a direct provider completion (pluginScope "provider"). */\n` +
          'function isProviderOnlyPluginSelection(selections) {\n\treturn selections.length > 0 && selections.every((selection) => selection.pluginScope === "provider");\n}\n' +
          'function resolveAgentRuntimePluginSelections(config, selections, configuredHarnessRuntimes) {\n\tif (isProviderOnlyPluginSelection(selections)) return [...selections];\n\treturn [...(configuredHarnessRuntimes ?? collectConfiguredAgentHarnessRuntimes(config ?? {})).map((runtime) => ({\n',
      ],
      [
        '\tconst runtimeIds = dedupePluginIds(selections.map((selection) => resolveSelectedAgentHarnessRuntime(selection, params.config)).filter((runtime) => !isDefaultAgentRuntimeId(runtime) && runtime !== "openclaw"));\n',
        '\tif (isProviderOnlyPluginSelection(selections)) return lookup.hasInstalledPluginIds(pluginIds) ? [...pluginIds].toSorted((left, right) => left.localeCompare(right)) : void 0;\n' +
          '\tconst runtimeIds = dedupePluginIds(selections.map((selection) => resolveSelectedAgentHarnessRuntime(selection, params.config)).filter((runtime) => !isDefaultAgentRuntimeId(runtime) && runtime !== "openclaw"));\n',
      ],
      [
        '\tlet config = params.config;\n\tconst memoryPluginIds = resolveSelectedMemoryPluginIds({\n\t\tconfig: params.config,\n\t\tworkspaceDir: params.workspaceDir,\n\t\tmetadataSnapshot: params.metadataSnapshot\n\t});\n\tconst contextEnginePluginId = resolveSelectedContextEnginePluginId(params.config);\n',
        `\tlet config = params.config;\n\t// ${MARKER}: a direct provider completion runs no agent turn: no memory slot, context engine or harness.\n\tconst providerOnly = isProviderOnlyPluginSelection(params.selections);\n` +
          '\tconst memoryPluginIds = providerOnly ? [] : resolveSelectedMemoryPluginIds({\n\t\tconfig: params.config,\n\t\tworkspaceDir: params.workspaceDir,\n\t\tmetadataSnapshot: params.metadataSnapshot\n\t});\n\tconst contextEnginePluginId = providerOnly ? void 0 : resolveSelectedContextEnginePluginId(params.config);\n',
      ],
      [
        '\t\tif (!requiresAgentHarnessPluginSelection(selection, config)) continue;\n\t\tconst harnessPluginIds = resolveAgentHarnessOwnerPluginIds({\n',
        '\t\tif (providerOnly || !requiresAgentHarnessPluginSelection(selection, config)) continue;\n\t\tconst harnessPluginIds = resolveAgentHarnessOwnerPluginIds({\n',
      ],
    ],
  },
  [SIMPLE_COMPLETION]: {
    before: '13c43a6d7d6381ba3d7a674c49cc902818fddfc5ab9c5e31a247fdea729e6c31',
    layer: 'cli',
    edits: [
      [
        '\t\truntimePluginSelections: runtimePluginSelections.map((selection) => ({\n\t\t\t...selection,\n\t\t\tagentId\n\t\t}))\n',
        `\t\truntimePluginSelections: runtimePluginSelections.map((selection) => ({\n\t\t\t...selection,\n\t\t\tagentId,\n\t\t\t...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {} // ${MARKER}\n\t\t}))\n`,
      ],
      [
        '\t\tselections: [{\n\t\t\tprovider: tentativeSelection.provider,\n\t\t\tmodelId: tentativeSelection.modelId,\n\t\t\tagentId: params.agentId\n\t\t}],\n',
        '\t\tselections: [{\n\t\t\tprovider: tentativeSelection.provider,\n\t\t\tmodelId: tentativeSelection.modelId,\n\t\t\tagentId: params.agentId,\n\t\t\t...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {}\n\t\t}],\n',
      ],
      [
        '\t\tselections: [{\n\t\t\tprovider: selection.provider,\n\t\t\tmodelId: selection.modelId,\n\t\t\tagentId: params.agentId\n\t\t}],\n',
        '\t\tselections: [{\n\t\t\tprovider: selection.provider,\n\t\t\tmodelId: selection.modelId,\n\t\t\tagentId: params.agentId,\n\t\t\t...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {}\n\t\t}],\n',
      ],
    ],
  },
  [INFER_MODEL]: {
    before: 'e24d03915fb258feb6ba2f0162e32b5ceb55a44bda499ebfc5726de50ad6c20d',
    layer: 'cli',
    edits: [
      [
        '\t\t\t...hasExplicitProviderModelOverride ? { allowBundledStaticCatalogFallback: true } : {},\n\t\t\tskipAgentDiscovery: true\n\t\t});\n',
        `\t\t\t...hasExplicitProviderModelOverride ? { allowBundledStaticCatalogFallback: true } : {},\n\t\t\tskipAgentDiscovery: true,\n\t\t\truntimePluginScope: "provider" // ${MARKER}: a one-shot completion loads the provider's plugins only\n\t\t});\n`,
      ],
    ],
  },
  [RUNTIME_FACTS]: {
    before: '5035f0bb5ba089df3a2645c42ecf5023b30e9bb6503df27b6d422ca757b2d49f',
    layer: 'cli',
    edits: [
      [
        '\t\truntimePluginSelections: input.runtimePluginSelections?.map(({ provider, runtime }) => ({\n\t\t\tprovider,\n\t\t\truntime\n\t\t}))\n',
        `\t\truntimePluginSelections: input.runtimePluginSelections?.map(({ provider, runtime, pluginScope }) => ({\n\t\t\tprovider,\n\t\t\truntime,\n\t\t\t...pluginScope ? { pluginScope } : {} // ${MARKER}\n\t\t}))\n`,
      ],
    ],
  },
  [LIFECYCLE_STATE]: {
    // session-reference-index release (#611, on V since 2026-11-17)
    before: 'c21306fac71e2e4b504f799cf6d1fe7fbf7be629d7d5c31d44e73445dba734f9',
    layer: 'gateway',
    edits: [
      [
        'import fs from "node:fs";\nimport path from "node:path";\n',
        `import { O as isInternalSessionEffectsKey } from "./session-accessor.sqlite-entry-BlklNPKQ.js"; // ${MARKER}\nimport fs from "node:fs";\nimport path from "node:path";\n`,
      ],
      [
        '\tconst database = openOpenClawAgentDatabase(databaseOptions);\n\tconst referencedSessionIds = collectProjectedReferencedSessionIds({\n\t\tdatabase,\n\t\texcludedSessionKeys: changedSessionKeys,\n\t\tprojectedStore: store\n\t});\n',
        '\tconst database = openOpenClawAgentDatabase(databaseOptions);\n' +
          `\t// ${MARKER}: a run removing its own hidden session needs no store-wide reference read; only that\n` +
          '\t// run\'s own hidden bindings can reference a run-owned internal-session-effects session id.\n' +
          '\tconst runOwnedInternalRemovalsOnly = upsertedEntries.length === 0 && projectedRemovals.every(({ removal, sessionKey }) => removal.runOwnedInternalSession === true && isInternalSessionEffectsKey(sessionKey));\n' +
          '\tconst referencedSessionIds = runOwnedInternalRemovalsOnly ? collectProjectedStoreSessionIds(store) : collectProjectedReferencedSessionIds({\n\t\tdatabase,\n\t\texcludedSessionKeys: changedSessionKeys,\n\t\tprojectedStore: store\n\t});\n',
      ],
      [
        '\treturn {\n\t\tdeletePlans,\n\t\tremovals: projectedRemovals,\n\t\tupsertedEntries\n\t};\n',
        '\treturn {\n\t\tdeletePlans,\n\t\tremovals: projectedRemovals,\n\t\tupsertedEntries,\n\t\t...runOwnedInternalRemovalsOnly ? { runOwnedInternalRemovalsOnly: true } : {}\n\t};\n',
      ],
      [
        'function deleteMaterializedSessionStatePlans(database, plans, protectedSessionIds, excludedSessionKeys, onDeleted) {\n\tif (plans.length === 0) return [];\n\tconst archivedTranscripts = [];\n\tconst referencedSessionIds = readReferencedSessionIds(database, excludedSessionKeys);\n',
        'function deleteMaterializedSessionStatePlans(database, plans, protectedSessionIds, excludedSessionKeys, onDeleted, options = {}) {\n\tif (plans.length === 0) return [];\n\tconst archivedTranscripts = [];\n\tconst referencedSessionIds = options.runOwnedInternalRemovalsOnly ? /* @__PURE__ */ new Set() : readReferencedSessionIds(database, excludedSessionKeys);\n',
      ],
      [
        'function collectProjectedReferencedSessionIds(params) {\n',
        'function collectProjectedStoreSessionIds(projectedStore) {\n\tconst sessionIds = /* @__PURE__ */ new Set();\n\tfor (const entry of Object.values(projectedStore)) for (const sessionId of collectSessionStateIdsForEntry(entry)) sessionIds.add(sessionId);\n\treturn sessionIds;\n}\nfunction collectProjectedReferencedSessionIds(params) {\n',
      ],
    ],
  },
  [SESSION_ACCESSOR]: {
    // delete-cleanup-vcc-steer release (#559, versa:b0cbe1db060), on V
    before: 'a854b511ef5d0100ac7a89ecb778dd4ba0aa53e6ae3ffa8e9b522b13171eb674',
    layer: 'gateway',
    edits: [
      [
        '\t\trunSqliteSessionDeletionTransaction((transactionDb) => {\n\t\t\tparams.beforeCommitInTransaction?.();\n\t\t\tbeforeCount = readSessionEntryCount(transactionDb);\n',
        `\t\t// ${MARKER}: a run removing its own hidden session does not report entry counts (each parses every row)\n\t\tconst countEntries = projected.runOwnedInternalRemovalsOnly !== true;\n\t\trunSqliteSessionDeletionTransaction((transactionDb) => {\n\t\t\tparams.beforeCommitInTransaction?.();\n\t\t\tbeforeCount = countEntries ? readSessionEntryCount(transactionDb) : 0;\n`,
      ],
      [
        '\t\t\tarchivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, removalPlans, void 0, new Set(validatedRemovals.map((removal) => removal.sessionKey)));\n',
        '\t\t\tarchivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, removalPlans, void 0, new Set(validatedRemovals.map((removal) => removal.sessionKey)), void 0, { runOwnedInternalRemovalsOnly: projected.runOwnedInternalRemovalsOnly === true });\n',
      ],
      [
        '\t\treturn {\n\t\t\tarchivedTranscripts,\n\t\t\tbeforeCount,\n\t\t\tmaintenancePlans,\n\t\t\tremovedSessionKeys\n\t\t};\n',
        '\t\treturn {\n\t\t\tarchivedTranscripts,\n\t\t\tbeforeCount,\n\t\t\tcountEntries,\n\t\t\tmaintenancePlans,\n\t\t\tremovedSessionKeys\n\t\t};\n',
      ],
      [
        '\tconst afterCount = readSessionEntryCount(openOpenClawAgentDatabase(toDatabaseOptions(resolved)));\n',
        '\tconst afterCount = committed.countEntries ? readSessionEntryCount(openOpenClawAgentDatabase(toDatabaseOptions(resolved))) : 0;\n',
      ],
    ],
  },
  [INTERNAL_EFFECTS]: {
    // npm 2026.9.1 bytes, unchanged on V
    before: 'ec7c324ee091457519e2cbc4d57ec6a55a62aac624d73e92d08021db24a4e597',
    layer: 'gateway',
    edits: [
      [
        '\t\t\t\tawait removeInternalSessionEffectsSession(target);\n',
        `\t\t\t\tawait removeInternalSessionEffectsSession(target, { runOwned: true }); // ${MARKER}\n`,
      ],
      [
        '\t\tsessionStartedAt: now,\n\t\tupdatedAt: now\n\t});\n',
        `\t\tsessionStartedAt: now,\n\t\tupdatedAt: now\n\t}, { skipMaintenance: true }); // ${MARKER}: a hidden run-owned session must not kick a store-wide maintenance sweep\n`,
      ],
      [
        'async function removeInternalSessionEffectsSession(target) {\n',
        'async function removeInternalSessionEffectsSession(target, options = {}) {\n',
      ],
      [
        '\t\t\tarchiveRemovedTranscript: false\n\t\t}],\n',
        '\t\t\tarchiveRemovedTranscript: false,\n\t\t\t...options.runOwned ? { runOwnedInternalSession: true } : {}\n\t\t}],\n',
      ],
    ],
  },
};

const apply = (source, edits, label) => {
  if (source.includes(MARKER)) throw new Error(`${label} is already patched`);
  return edits.reduce((text, [before, after]) => {
    if (text.split(before).length !== 2) throw new Error(`${label}: expected one match for ${JSON.stringify(before.slice(0, 60))}`);
    return text.replace(before, () => after);
  }, source);
};
const revert = (source, edits, label) => [...edits].reverse().reduce((text, [before, after]) => {
  if (text.split(after).length !== 2) throw new Error(`${label}: expected one patched block ${JSON.stringify(after.slice(0, 60))}`);
  return text.replace(after, () => before);
}, source);

export const patchFile = (name, source) => apply(source, FILES[name].edits, name);
export const unpatchFile = (name, source) => revert(source, FILES[name].edits, name);
// kept for the first release's API
export const CONFIG_GUARD_BEFORE_SHA = FILES[CONFIG_GUARD].before;
export const patchConfigGuard = (source) => patchFile(CONFIG_GUARD, source);
export const unpatchConfigGuard = (source) => unpatchFile(CONFIG_GUARD, source);
