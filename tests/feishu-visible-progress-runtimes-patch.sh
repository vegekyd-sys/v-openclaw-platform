#!/usr/bin/env bash
# Verifies the Feishu visible-progress-runtimes patcher: it makes the runtime
# list config-driven across both files, keeps the final-answer transition scoped
# to non-legacy runtimes, is idempotent, and fails closed on an unexpected shape.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
patcher="$root/scripts/apply-feishu-visible-progress-runtimes-patch.mjs"
fixture="$root/tests/fixtures/feishu-plugin"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -R "$fixture" "$work/plugin"
bundle="$work/plugin/dist/monitor.account-FIXTURE.js"
manifest="$work/plugin/openclaw.plugin.json"

# 1. First run patches both files.
node "$patcher" "$work/plugin" > "$work/first.json"
grep -q '"changed": true' "$work/first.json" || { echo "FAIL: first run reported no change"; exit 1; }

# The manifest must declare the key, or the Gateway refuses to start.
node -e '
const schema = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).channelConfigs.feishu.schema;
if (schema.additionalProperties !== false) { console.error("FAIL: schema stopped being strict"); process.exit(1); }
const prop = schema.properties.visibleProgressRuntimes;
if (!prop || prop.type !== "array" || prop.items?.type !== "string") { console.error("FAIL: key not declared as a string array"); process.exit(1); }
' "$manifest"

# The bundle must read the key rather than hardcoding the list.
grep -q 'function resolveVisibleProgressRuntimes(config)' "$bundle" || { echo "FAIL: resolver not inserted"; exit 1; }
grep -q 'createPublicCommentaryState(vlab91VisibleProgressRuntimes)' "$bundle" || { echo "FAIL: commentary state not wired to the resolved list"; exit 1; }
[ "$(grep -c "\['codex', 'vlab-worker'\].includes(runtime)" "$bundle")" = "0" ] || { echo "FAIL: hardcoded commentary allowlist survived"; exit 1; }
[ "$(grep -c '"codex", "vlab-worker"\].includes(responsePrefixContextProvider' "$bundle")" = "0" ] || { echo "FAIL: hardcoded tool/compaction allowlist survived"; exit 1; }
grep -q 'vlab91CommentaryRetiresOnFinal(responsePrefixContextProvider().agentRuntime)' "$bundle" || { echo "FAIL: final-answer transition not inserted"; exit 1; }
grep -q 'LEGACY_VISIBLE_PROGRESS_RUNTIMES.includes(runtime)' "$bundle" || { echo "FAIL: final-answer transition is not scoped away from legacy runtimes"; exit 1; }
node --check "$bundle" || { echo "FAIL: patched bundle does not parse"; exit 1; }

# 2. The resolver's contract: default when unset/invalid/empty, config when set.
node -e '
const src = require("fs").readFileSync(process.argv[1], "utf8");
const body = src.slice(0, src.indexOf("function createPublicCommentaryState"));
const resolve = new Function(body + "; return resolveVisibleProgressRuntimes;")();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fallback = ["codex", "vlab-worker", "claude-cli"];
if (!eq(resolve(undefined), fallback)) throw new Error("unset config did not fall back");
if (!eq(resolve({}), fallback)) throw new Error("missing key did not fall back");
if (!eq(resolve({ visibleProgressRuntimes: "codex" }), fallback)) throw new Error("non-array did not fall back");
if (!eq(resolve({ visibleProgressRuntimes: [] }), fallback)) throw new Error("empty list did not fall back");
if (!eq(resolve({ visibleProgressRuntimes: [" opencode ", "", 7] }), ["opencode"])) throw new Error("did not trim and drop junk entries");
' "$bundle"

# 3. Second run is a no-op on both files.
node "$patcher" "$work/plugin" > "$work/second.json"
grep -q '"changed": true' "$work/second.json" && { echo "FAIL: patcher is not idempotent"; exit 1; }

# 4. An unexpected bundle shape fails closed without writing either file.
rm -rf "$work/wrong"; cp -R "$fixture" "$work/wrong"
printf 'const x = 1;\n' > "$work/wrong/dist/monitor.account-FIXTURE.js"
before_manifest="$(shasum -a 256 < "$work/wrong/openclaw.plugin.json")"
if node "$patcher" "$work/wrong" > "$work/third.json" 2>&1; then
  echo "FAIL: patcher accepted an unexpected bundle shape"; exit 1
fi
after_manifest="$(shasum -a 256 < "$work/wrong/openclaw.plugin.json")"
grep -q 'const x = 1;' "$work/wrong/dist/monitor.account-FIXTURE.js" || { echo "FAIL: patcher wrote to a non-matching bundle"; exit 1; }
[ "$before_manifest" = "$after_manifest" ] || { echo "FAIL: manifest was written even though the bundle failed its shape gate"; exit 1; }

echo "PASS feishu-visible-progress-runtimes-patch"
