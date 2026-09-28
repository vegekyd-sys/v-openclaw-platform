// regress96 units: module load hook that exposes internal (unexported) functions
// of built OpenClaw chunks. For every dist .mjs chunk that contains one of the
// `//#region <src path>` markers below, it appends
//   export { name as __h_name, ... };
// for each listed name that the chunk declares at top level. Names that are not
// declared there are skipped (appending them would be a SyntaxError that breaks
// every importer of the chunk); units.mjs reports such a check as not callable.
// Read-only: it only rewrites the in-memory source handed to V8.

export const EXPORTS = {
  // B5
  "src/channels/reply-prefix.ts": ["createReplyPrefixContext"],
  // B6
  "src/system-agent/inference-route.ts": [
    "resolveSystemAgentConfiguredRouteFromConfig",
    "isAmbientDeepSeekFlashOnIsolatedWorker",
  ],
  // E3 (@openclaw/ai dist)
  "packages/ai/src/transports/deepseek-output-budget.ts": [
    "applyDeepSeekOutputBudget",
    "DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_CODE",
    "DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_MESSAGE",
  ],
  // E3 (3be82345b2e) + E6
  "src/agents/embedded-agent-runner/run/incomplete-turn-resolution.ts": [
    "resolveIncompleteTurnPayloadText",
    "OUTPUT_LIMIT_WITHOUT_TEXT_NOTICE_TEXT",
    "TRUNCATED_REPLY_NOTICE_TEXT",
  ],
  "src/agents/embedded-agent-runner/run/incomplete-turn-recovery.ts": [
    "resolveReasoningOnlyRetryInstruction",
  ],
  // E3 (062f3e6f181)
  "src/agents/embedded-agent-helpers/error-text.ts": ["formatUserFacingAssistantErrorText"],
  // model-switch-roles
  "src/auto-reply/command-auth.ts": ["resolveCommandAuthorization", "isResetAuthorizedForContext"],
  // secret-entry
  "src/agents/tools/question-prompt-send.ts": ["sendQuestionToolPrompt"],
  "src/secrets/secret-entry-mirror.ts": [
    "buildSecretEntryMirrorNote",
    "mirrorSecretEntryToFile",
    "resolveSecretEntryMirrorPath",
  ],
  // C
  "src/cron/shared-management.ts": [
    "CRON_SHARED_POLICY_ENV",
    "cronManagementPrincipalFromTurn",
    "cronManagementNamespaceDecision",
    "cronManagementNamespaceIsProtected",
    "readCronManagementPolicy",
  ],
  // B8
  "src/gateway/server-methods/system-agent-approval.ts": ["resolveDelegatedOwnerDirectMessage"],
  // E1
  "src/channels/turn/pending-delivery-notice.ts": ["deliverPendingDeliveryNotice"],
  "src/infra/outbound/delivery-completion.ts": ["settlePendingFinalDelivery"],
  "src/gateway/server-recovery-runtime-context.ts": [
    "registerGatewayRecoveryRuntime",
    "getGatewayRecoveryRuntime",
  ],
  "src/config/sessions/session-accessor.sqlite-entry.ts": ["loadSessionEntry", "replaceSessionEntry"],
  // E5
  "src/gateway/config-reload.ts": ["startGatewayConfigReloader"],
  "src/gateway/config-reload-plan.ts": ["diffConfigPaths"],
  // A21
  "src/gateway/server/event-loop-health.ts": ["createGatewayEventLoopHealthMonitor"],
  // model-switch-roles: minimal channel registry so "feishu" normalizes as on V
  "src/plugins/runtime.ts": ["setActivePluginRegistry", "getActivePluginRegistry"],
  "src/plugins/registry-empty.ts": ["createEmptyPluginRegistry"],
};

// Local-validation escape hatch, OFF by default: Node < 24.16 embeds a SQLite
// with the WAL-reset bug and OpenClaw refuses to open any database. With
// REGRESS96_LOCAL_UNSAFE_SQLITE=1 the version gate in src/infra/node-sqlite.ts
// is skipped so the SQLite-backed checks (E1, E5) can run against a throwaway
// sandbox DB on an older dev Node (units.mjs also passes this hook to the
// worker threads OpenClaw spawns). Never needed on the host (Node 24.17).
const SQLITE_GATE_REGION = "//#region src/infra/node-sqlite.ts\n";
const SQLITE_GATE = "if (isSqliteWalResetSafeVersion(version)) return;";
// Same gate inside minified bundles (dist/worker/*.mjs, e.g. the SQLite store worker).
const SQLITE_GATE_MIN = /(function assertSqliteWalResetSafeVersion\((\w+),\w+\)\{)(if\(isSqliteWalResetSafeVersion\(\2\)\)return;)/;
function bypassSqliteGate(src) {
  if (process.env.REGRESS96_LOCAL_UNSAFE_SQLITE !== "1") return src;
  if (src.includes(SQLITE_GATE_REGION) && src.includes(SQLITE_GATE)) {
    return src.replace(SQLITE_GATE, "return; /* regress96 local bypass */");
  }
  return SQLITE_GATE_MIN.test(src) ? src.replace(SQLITE_GATE_MIN, "$1return;/* regress96 local bypass */$3") : src;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function declaresTopLevel(src, name) {
  const n = escapeRe(name);
  return new RegExp(
    `^(?:export\\s+)?(?:(?:async\\s+)?function\\*?\\s+${n}\\s*\\(|(?:const|let|var|class)\\s+${n}\\b)`,
    "m",
  ).test(src);
}

export function hookExportsFor(src) {
  const names = [];
  for (const [region, list] of Object.entries(EXPORTS)) {
    if (!src.includes(`//#region ${region}\n`)) continue;
    for (const name of list) {
      if (!names.includes(name) && declaresTopLevel(src, name)) names.push(name);
    }
  }
  return names;
}

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (r.format !== "module" || !url.includes("/dist/") || !url.endsWith(".mjs") || r.source == null) {
    return r;
  }
  const original = typeof r.source === "string" ? r.source : Buffer.from(r.source).toString("utf8");
  const src = bypassSqliteGate(original);
  if (!src.includes("//#region ")) return src === original ? r : { ...r, source: src };
  const names = hookExportsFor(src);
  if (names.length === 0) return src === original ? r : { ...r, source: src };
  return {
    ...r,
    source: `${src}\nexport { ${names.map((n) => `${n} as __h_${n}`).join(", ")} };\n`,
  };
}
