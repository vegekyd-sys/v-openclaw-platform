#!/usr/bin/env node
// Make the Workboard lifecycle sweep light on the Gateway main thread (OpenClaw 2026.9.1).
//
// workboard-lifecycle-sync reconciles cards with sessions every 60 s and runs a full sweep every
// 10 minutes. On V (10/17 13:04-13:17 CPU profile, 6,879 unarchived cards) each full sweep held
// the main thread for 7-8 s:
//   - sessions.list resolved the session-sharing target of every listed session synchronously
//     (~3.5 s, never yielding), although the sweep reads only key/updatedAt/status/hasActiveRun/
//     abortedLastRun;
//   - syncWorkboardLifecycleSessions called store.syncLifecycle for every card with a listed
//     session; each call queued a mutation and re-read the card with its child rows before
//     finding nothing to change (~2 s for ~6,000 cards that were long done).
//
// sessions.list accepts lifecycleOnly. It takes effect only when the caller's sharing has no
// entry filter (system/admin callers, such as the Workboard plugin's runtime client), so it never
// changes which rows anyone can see; it then skips the sharing and placement projections, whose
// fields (visibility, sharingRole, placement) the caller does not read. Rows and the active-run
// flags are computed as before.
//
// The store's syncLifecycle patch builder becomes WorkboardStore.lifecycleSyncPatch(card, input),
// used by syncLifecycle unchanged. The sweep asks it first with the card it already listed and
// skips cards for which it returns no patch; cards that would change still go through
// syncLifecycle, which re-reads the latest card under the mutation queue.
//
//   node scripts/patch-openclaw91-workboard-sweep-light.mjs <openclaw-dist-dir> [--check]

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER = "v-workboard-sweep-light-v1";

function replaceExactlyOnce(source, { name, original, patched }) {
  const first = source.indexOf(original);
  if (first === -1) throw new Error(`workboard sweep anchor not found: ${name}`);
  if (source.indexOf(original, first + original.length) !== -1) throw new Error(`workboard sweep anchor not unique: ${name}`);
  return `${source.slice(0, first)}${patched}${source.slice(first + original.length)}`;
}

function applyEdits(source, edits, label) {
  if (source.includes(PATCH_MARKER)) {
    if (edits.every((edit) => source.includes(edit.patched))) return { changed: false, source };
    throw new Error(`${label}: workboard sweep patch is partial or drifted`);
  }
  let next = source;
  for (const edit of edits) next = replaceExactlyOnce(next, edit);
  return { changed: true, source: next };
}

const SCHEMA_EDITS = [{
  name: "sessions.list lifecycleOnly param",
  original: `\tactiveMinutes: Type.Optional(Type.Integer({ minimum: 1 })),\n\t/** Require a real user/channel interaction; excludes synthetic isolated heartbeat rows. */`,
  patched: `\tactiveMinutes: Type.Optional(Type.Integer({ minimum: 1 })),\n\t/** ${PATCH_MARKER}: rows only for lifecycle reconciliation; skips sharing and placement projections when the caller has no visibility filter. */\n\tlifecycleOnly: Type.Optional(Type.Boolean()),\n\t/** Require a real user/channel interaction; excludes synthetic isolated heartbeat rows. */`,
}];

const SESSIONS_READ_EDITS = [
  {
    name: "lifecycleOnly decision",
    original: `\t\t\tconst visibilityFilter = prepareSessionSharing({\n\t\t\t\tclient,\n\t\t\t\tcfg\n\t\t\t}).entryFilter;\n`,
    patched: `\t\t\tconst visibilityFilter = prepareSessionSharing({\n\t\t\t\tclient,\n\t\t\t\tcfg\n\t\t\t}).entryFilter;\n\t\t\t// ${PATCH_MARKER}: a caller that sees every row and reads only lifecycle fields skips the\n\t\t\t// per-session sharing resolution (synchronous, ~3.5 s on V for every Workboard full sweep).\n\t\t\tconst lifecycleOnly = p.lifecycleOnly === true && !visibilityFilter;\n`,
  },
  {
    name: "skip sharing projection",
    original: `\t\t\tconst { sharingTargets, membershipKeys } = await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {`,
    patched: `\t\t\tconst { sharingTargets, membershipKeys } = lifecycleOnly ? {\n\t\t\t\tsharingTargets: [],\n\t\t\t\tmembershipKeys: /* @__PURE__ */ new Set()\n\t\t\t} : await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {`,
  },
  {
    name: "skip placement projection",
    original: `\t\t\tconst projectPlacement = createSessionPlacementBatchProjector(context, result.sessions);`,
    patched: `\t\t\tconst projectPlacement = lifecycleOnly ? () => ({}) : createSessionPlacementBatchProjector(context, result.sessions);`,
  },
];

const SYNC_HEAD = `\tasync syncLifecycle(id, input) {\n\t\treturn await this.enqueueMutation(async () => {\n\t\t\treturn (await this.updateLatestCard(id, (card) => {\n`;
const SYNC_TAIL = `\t\t\t}, { allowAutomationLaunch: true })).updated;\n\t\t});\n\t}\n`;

function runtimeApiEdits(source) {
  const start = source.indexOf(SYNC_HEAD);
  if (start === -1) throw new Error("workboard sweep anchor not found: syncLifecycle head");
  if (source.indexOf(SYNC_HEAD, start + SYNC_HEAD.length) !== -1) throw new Error("workboard sweep anchor not unique: syncLifecycle head");
  const bodyStart = start + SYNC_HEAD.length;
  const end = source.indexOf(SYNC_TAIL, bodyStart);
  if (end === -1) throw new Error("workboard sweep anchor not found: syncLifecycle tail");
  const body = source.slice(bodyStart, end);
  if (/\bthis\b/.test(body)) throw new Error("syncLifecycle patch builder uses this; refusing to hoist it");
  if (!body.endsWith(`\t\t\t\treturn Object.keys(patch).length === 0 ? void 0 : patch;\n`)) throw new Error("syncLifecycle patch builder has an unexpected shape");
  const hoisted = body.split("\n").map((line) => line.startsWith("\t\t") ? line.slice(2) : line).join("\n");
  return [{
    name: "hoist the syncLifecycle patch builder",
    original: source.slice(start, end + SYNC_TAIL.length),
    patched: `\t/** ${PATCH_MARKER}: the patch syncLifecycle would apply to this card, or undefined when nothing would change. */\n\tlifecycleSyncPatch(card, input) {\n${hoisted}\t}\n\tasync syncLifecycle(id, input) {\n\t\treturn await this.enqueueMutation(async () => {\n\t\t\treturn (await this.updateLatestCard(id, (card) => this.lifecycleSyncPatch(card, input), { allowAutomationLaunch: true })).updated;\n\t\t});\n\t}\n`,
  }];
}

const WORKBOARD_EDITS = [
  {
    name: "shared lifecycle input",
    original: `async function syncWorkboardCardLifecycle(params) {\n\tconst target = LIFECYCLE_TARGETS[params.observation.state];\n\treturn await params.store.syncLifecycle(params.cardId, {\n\t\ttargetStatus: "card" in target ? target.card : void 0,\n\t\texecutionStatus: "execution" in target ? target.execution : void 0,\n\t\tsourceUpdatedAt: params.observation.sourceUpdatedAt,\n\t\tstale: params.observation.stale,\n\t\tnow: params.now,\n\t\t...params.association ? { association: params.association } : {}\n\t});\n}\n`,
    patched: `/** ${PATCH_MARKER}: the store input syncWorkboardCardLifecycle sends for this observation. */\nfunction workboardLifecycleSyncInput(params) {\n\tconst target = LIFECYCLE_TARGETS[params.observation.state];\n\treturn {\n\t\ttargetStatus: "card" in target ? target.card : void 0,\n\t\texecutionStatus: "execution" in target ? target.execution : void 0,\n\t\tsourceUpdatedAt: params.observation.sourceUpdatedAt,\n\t\tstale: params.observation.stale,\n\t\tnow: params.now,\n\t\t...params.association ? { association: params.association } : {}\n\t};\n}\nasync function syncWorkboardCardLifecycle(params) {\n\treturn await params.store.syncLifecycle(params.cardId, workboardLifecycleSyncInput(params));\n}\n`,
  },
  {
    name: "skip cards the sweep would not change",
    original: `\t\tif (!session) continue;\n\t\tconst observation = lifecycleFromSession(session, now);\n\t\tif (await syncWorkboardCardLifecycle({\n\t\t\tstore: params.store,\n\t\t\tcardId: card.id,\n\t\t\tobservation,\n\t\t\tnow,\n\t\t\tassociation: {\n\t\t\t\t...cardSessionKey(card) ? { expectedSessionKey: cardSessionKey(card) } : {},\n\t\t\t\t...cardRunId(card) ? { expectedRunId: cardRunId(card) } : {},\n\t\t\t\tsessionKey: session.key,\n\t\t\t\t...preparedAcceptanceAt === void 0 ? {} : { acceptedAt: preparedAcceptanceAt }\n\t\t\t}\n\t\t})) count += 1;\n`,
    patched: `\t\tif (!session) continue;\n\t\tconst observation = lifecycleFromSession(session, now);\n\t\tconst association = {\n\t\t\t...cardSessionKey(card) ? { expectedSessionKey: cardSessionKey(card) } : {},\n\t\t\t...cardRunId(card) ? { expectedRunId: cardRunId(card) } : {},\n\t\t\tsessionKey: session.key,\n\t\t\t...preparedAcceptanceAt === void 0 ? {} : { acceptedAt: preparedAcceptanceAt }\n\t\t};\n\t\t// ${PATCH_MARKER}: decide on the card the sweep already listed; only cards that would change\n\t\t// pay for a queued mutation and a fresh read with child rows.\n\t\tif (typeof params.store.lifecycleSyncPatch === "function" && params.store.lifecycleSyncPatch(card, workboardLifecycleSyncInput({\n\t\t\tobservation,\n\t\t\tnow,\n\t\t\tassociation\n\t\t})) === void 0) continue;\n\t\tif (await syncWorkboardCardLifecycle({\n\t\t\tstore: params.store,\n\t\t\tcardId: card.id,\n\t\t\tobservation,\n\t\t\tnow,\n\t\t\tassociation\n\t\t})) count += 1;\n`,
  },
  {
    name: "sweep asks for lifecycle rows",
    original: `\t\tconfiguredAgentsOnly: true,\n\t\tincludeGlobal: false,\n`,
    patched: `\t\tconfiguredAgentsOnly: true,\n\t\tlifecycleOnly: true,\n\t\tincludeGlobal: false,\n`,
  },
];

export const FILES = {
  "src-B9mb84px.js": (source) => applyEdits(source, SCHEMA_EDITS, "src-B9mb84px.js"),
  "sessions-read-C6mAMxyQ.js": (source) => applyEdits(source, SESSIONS_READ_EDITS, "sessions-read-C6mAMxyQ.js"),
  "runtime-api-1CCazqtv.js": (source) => source.includes(PATCH_MARKER)
    ? (source.includes(`\tlifecycleSyncPatch(card, input) {\n`) && source.includes(`(card) => this.lifecycleSyncPatch(card, input), { allowAutomationLaunch: true })`)
      ? { changed: false, source }
      : (() => { throw new Error("runtime-api-1CCazqtv.js: workboard sweep patch is partial or drifted"); })())
    : applyEdits(source, runtimeApiEdits(source), "runtime-api-1CCazqtv.js"),
  "extensions/workboard/index.js": (source) => applyEdits(source, WORKBOARD_EDITS, "extensions/workboard/index.js"),
};

async function main([distDir, mode]) {
  if (!distDir) throw new Error("usage: patch-openclaw91-workboard-sweep-light.mjs <openclaw-dist-dir> [--check]");
  const results = [];
  const next = [];
  for (const [file, patch] of Object.entries(FILES)) {
    const full = path.join(distDir, file);
    const result = patch(await readFile(full, "utf8"));
    next.push([full, result]);
    results.push({ file, changed: result.changed });
  }
  if (mode !== "--check") for (const [full, result] of next) if (result.changed) await writeFile(full, result.source);
  console.log(JSON.stringify({ distDir, mode: mode ?? "--apply", results }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
