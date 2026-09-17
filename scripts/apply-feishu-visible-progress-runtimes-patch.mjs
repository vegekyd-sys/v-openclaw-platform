#!/usr/bin/env node
// Makes the Feishu visible-progress runtime list configurable instead of
// hardcoded, and adds the Claude CLI harness to its default.
//
// Background: the deployed `worker-visible-progress` / `vlab91-codex-commentary`
// patches gate commentary, tool-start and compaction progress on a hardcoded
// ['codex','vlab-worker'] allowlist in the Feishu monitor bundle. Adding a
// harness meant editing a minified bundle. After this patch the list comes from
// `channels.feishu.visibleProgressRuntimes`, so adding a harness is a config
// edit.
//
// Two files are patched together and must stay in lockstep:
//   - openclaw.plugin.json : declares the new key. The feishu channel schema is
//     `additionalProperties: false`, so an undeclared key is not "invalid
//     config", it stops the Gateway from starting (status=78/CONFIG).
//   - dist/monitor.account-*.js : reads the key, falling back to the default.
//
// Shape-gated and idempotent: refuses to write unless every expression matches
// the live bundle byte-for-byte, so an upstream change fails closed.

import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER = "feishu-visible-progress-runtimes-v3";
const CONFIG_KEY = "visibleProgressRuntimes";

const PRELUDE = `// ${MARKER}
const VISIBLE_PROGRESS_RUNTIME_DEFAULTS = ['codex', 'vlab-worker', 'claude-cli'];
const LEGACY_VISIBLE_PROGRESS_RUNTIMES = ['codex', 'vlab-worker'];
function resolveVisibleProgressRuntimes(config) {
	const raw = config?.${CONFIG_KEY};
	if (!Array.isArray(raw)) return VISIBLE_PROGRESS_RUNTIME_DEFAULTS;
	const list = raw.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
	return list.length > 0 ? list : VISIBLE_PROGRESS_RUNTIME_DEFAULTS;
}
`;

const BUNDLE_SITES = [
  {
    id: "commentary-state-takes-runtimes",
    find: `function createPublicCommentaryState() {`,
    replace: `function createPublicCommentaryState(allowedRuntimes) {`,
  },
  {
    id: "commentary-allowlist-from-config",
    find: `if (closed || !['codex', 'vlab-worker'].includes(runtime) || payload?.kind !== 'preamble'`,
    replace: `if (closed || !(allowedRuntimes || VISIBLE_PROGRESS_RUNTIME_DEFAULTS).includes(runtime) || payload?.kind !== 'preamble'`,
  },
  {
    id: "commentary-state-call-site",
    find: `const vlab91Commentary = createPublicCommentaryState();`,
    replace: `const vlab91VisibleProgressRuntimes = resolveVisibleProgressRuntimes(account.config);
	const vlab91CommentaryRetiresOnFinal = (runtime) => vlab91VisibleProgressRuntimes.includes(runtime) && !LEGACY_VISIBLE_PROGRESS_RUNTIMES.includes(runtime);
	const vlab91Commentary = createPublicCommentaryState(vlab91VisibleProgressRuntimes);`,
  },
  {
    id: "tool-and-compaction-allowlist-from-config",
    find: `["codex", "vlab-worker"].includes(responsePrefixContextProvider().agentRuntime)`,
    replace: `vlab91VisibleProgressRuntimes.includes(responsePrefixContextProvider().agentRuntime)`,
    expectCount: 2,
  },
  {
    // Commentary assigns `streamText` directly while the final answer merges
    // through the snapshot path, so without this reset the two concatenate.
    // Scoped to non-legacy runtimes: codex and vlab-worker keep their deployed
    // behaviour byte-for-byte, because a Codex run could not be re-validated
    // while that subscription's quota was exhausted.
    id: "final-answer-retires-commentary",
    find: `\t\t\t\tif (!cleaned) return false;
\t\t\t\tstartStreaming();
\t\t\t\tqueueStreamingUpdate(cleaned, {`,
    replace: `\t\t\t\tif (!cleaned) return false;
\t\t\t\tif (!vlab91Commentary.isClosed() && vlab91CommentaryRetiresOnFinal(responsePrefixContextProvider().agentRuntime)) { vlab91Commentary.close(); streamText = ""; snapshotBaseText = ""; lastSnapshotTextLength = 0; lastPartial = ""; }
\t\t\t\tstartStreaming();
\t\t\t\tqueueStreamingUpdate(cleaned, {`,
  },
];

const SCHEMA_PROPERTY = {
  type: "array",
  items: { type: "string", minLength: 1 },
  description:
    "Agent runtimes whose working commentary, tool status and compaction notices are rendered into the reply card. Defaults to codex, vlab-worker and claude-cli.",
};

const sha = (text) => createHash("sha256").update(text).digest("hex");

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function findBundle(pluginDir) {
  const distDir = join(pluginDir, "dist");
  const names = readdirSync(distDir).filter(
    (name) => name.startsWith("monitor.account-") && name.endsWith(".js"),
  );
  if (names.length !== 1) {
    throw new Error(`expected exactly one monitor.account-*.js in ${distDir}, found ${names.length}`);
  }
  return join(distDir, names[0]);
}

/** Plans the manifest edit without writing, so a bad bundle cannot leave it half-applied. */
function planManifest(path) {
  const original = readFileSync(path, "utf8");
  const manifest = JSON.parse(original);
  const schema = manifest?.channelConfigs?.feishu?.schema;
  if (!schema || schema.additionalProperties !== false || typeof schema.properties !== "object") {
    throw new Error("manifest shape does not match: channelConfigs.feishu.schema");
  }
  if (schema.properties[CONFIG_KEY]) return { path, changed: false, sha: sha(original) };
  schema.properties[CONFIG_KEY] = SCHEMA_PROPERTY;
  const patched = `${JSON.stringify(manifest, null, 2)}\n`;
  return { path, changed: true, patched, beforeSha: sha(original), afterSha: sha(patched) };
}

/** Plans the bundle edit without writing; every site must match exactly or this throws. */
function planBundle(path) {
  const original = readFileSync(path, "utf8");
  if (original.includes(MARKER)) return { path, changed: false, sha: sha(original) };

  for (const site of BUNDLE_SITES) {
    const expected = site.expectCount ?? 1;
    const found = countOccurrences(original, site.find);
    if (found !== expected) {
      throw new Error(`site ${site.id}: expected ${expected} match(es), found ${found}; refusing to patch`);
    }
  }

  let patched = original;
  for (const site of BUNDLE_SITES) patched = patched.split(site.find).join(site.replace);
  patched = PRELUDE + patched;

  return { path, changed: true, patched, beforeSha: sha(original), afterSha: sha(patched) };
}

function commit(plan) {
  if (!plan.changed) return { changed: false, sha: plan.sha };
  copyFileSync(plan.path, `${plan.path}.bak-${MARKER}`);
  writeFileSync(plan.path, plan.patched);
  return { changed: true, beforeSha: plan.beforeSha, afterSha: plan.afterSha };
}

function main() {
  const pluginDir = process.argv[2];
  if (!pluginDir) {
    console.error("usage: apply-feishu-visible-progress-runtimes-patch.mjs <@openclaw/feishu dir>");
    process.exit(2);
  }
  try {
    const bundlePath = findBundle(pluginDir);
    const manifestPath = join(pluginDir, "openclaw.plugin.json");
    // Plan both before writing either: a bundle that fails its shape gate must
    // not leave a manifest declaring a key nothing reads.
    const manifestPlan = planManifest(manifestPath);
    const bundlePlan = planBundle(bundlePath);
    const manifest = commit(manifestPlan);
    const bundle = commit(bundlePlan);
    console.log(JSON.stringify({ ok: true, marker: MARKER, configKey: CONFIG_KEY, manifest, bundle, bundlePath }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message }));
    process.exit(1);
  }
}

main();
