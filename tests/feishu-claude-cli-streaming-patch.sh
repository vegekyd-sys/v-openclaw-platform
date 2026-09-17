#!/usr/bin/env bash
# Verifies the Feishu claude-cli visible-progress patcher: it patches all three
# runtime allowlists, is idempotent, and fails closed on an unexpected shape.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
patcher="$root/scripts/apply-feishu-claude-cli-streaming-patch.mjs"
fixture="$root/tests/fixtures/feishu-monitor-allowlist-fixture.js"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$fixture" "$work/monitor.js"

# 1. First run patches every site.
node "$patcher" "$work/monitor.js" > "$work/first.json"
grep -q '"changed":true' "$work/first.json" || { echo "FAIL: first run did not report a change"; exit 1; }
[ "$(grep -c "'codex', 'vlab-worker', 'claude-cli'" "$work/monitor.js")" = "1" ] || { echo "FAIL: commentary allowlist not patched"; exit 1; }
[ "$(grep -c '"codex", "vlab-worker", "claude-cli"' "$work/monitor.js")" = "2" ] || { echo "FAIL: tool/compaction allowlists not patched"; exit 1; }
node --check "$work/monitor.js" || { echo "FAIL: patched bundle does not parse"; exit 1; }

# 2. Second run is a no-op.
node "$patcher" "$work/monitor.js" > "$work/second.json"
grep -q '"changed":false' "$work/second.json" || { echo "FAIL: patcher is not idempotent"; exit 1; }

# 3. An unexpected bundle shape fails closed without writing.
printf 'const x = 1;\n' > "$work/wrong.js"
before="$(shasum -a 256 < "$work/wrong.js")"
if node "$patcher" "$work/wrong.js" > "$work/third.json" 2>&1; then
  echo "FAIL: patcher accepted an unexpected shape"; exit 1
fi
after="$(shasum -a 256 < "$work/wrong.js")"
[ "$before" = "$after" ] || { echo "FAIL: patcher wrote to a non-matching bundle"; exit 1; }

echo "PASS feishu-claude-cli-streaming-patch"
