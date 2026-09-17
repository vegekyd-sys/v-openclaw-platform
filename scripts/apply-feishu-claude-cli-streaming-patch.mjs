#!/usr/bin/env node
// Extends the Feishu monitor bundle's visible-progress runtime allowlist to the
// Claude CLI harness.
//
// Background: the deployed `worker-visible-progress` / `vlab91-codex-commentary`
// patches gate commentary, tool-start and compaction progress on a hardcoded
// runtime allowlist of `codex` and `vlab-worker`. OpenClaw core already bridges
// CLI-backend commentary into `onItemEvent({kind:"preamble"})` for `claude-cli`
// (see `shouldBridgeCliPreambleEvents` and `classifyClaudeCommentary`), so the
// Feishu allowlist is the only thing dropping those events.
//
// This patcher is shape-gated and idempotent. It refuses to write when the
// bundle does not match the exact expected shapes, so an upstream change fails
// closed instead of receiving an unreviewed transformation.

import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const MARKER = "claude-cli-visible-progress-v1";
const RUNTIME = "'claude-cli'";

/** Each site is matched exactly once; `patched` recognises an already-applied run. */
const SITES = [
  {
    id: "commentary-allowlist",
    find: "!['codex', 'vlab-worker'].includes(runtime)",
    replace: "!['codex', 'vlab-worker', 'claude-cli'].includes(runtime)",
  },
  {
    id: "tool-start-allowlist",
    find: "[\"codex\", \"vlab-worker\"].includes(responsePrefixContextProvider().agentRuntime)",
    replace:
      "[\"codex\", \"vlab-worker\", \"claude-cli\"].includes(responsePrefixContextProvider().agentRuntime)",
    expectCount: 2,
  },
];

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

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: apply-feishu-claude-cli-streaming-patch.mjs <monitor.account-*.js>");
    process.exit(2);
  }

  const original = readFileSync(target, "utf8");
  const beforeSha = sha(original);

  if (original.includes(MARKER)) {
    console.log(JSON.stringify({ ok: true, changed: false, reason: "already patched", sha: beforeSha }));
    return;
  }

  // Fail closed unless every site matches its expected shape exactly.
  for (const site of SITES) {
    const expected = site.expectCount ?? 1;
    const found = countOccurrences(original, site.find);
    if (found !== expected) {
      console.error(
        JSON.stringify({
          ok: false,
          site: site.id,
          expected,
          found,
          reason: "bundle shape does not match; refusing to patch",
          sha: beforeSha,
        }),
      );
      process.exit(1);
    }
  }

  let patched = original;
  for (const site of SITES) patched = patched.split(site.find).join(site.replace);
  patched = `// ${MARKER}\n${patched}`;

  const backup = `${target}.bak-${MARKER}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(target, backup);
  writeFileSync(target, patched);

  console.log(
    JSON.stringify({
      ok: true,
      changed: true,
      marker: MARKER,
      runtimeAdded: RUNTIME,
      sites: SITES.map((site) => site.id),
      backup,
      beforeSha,
      afterSha: sha(patched),
    }),
  );
}

main();
