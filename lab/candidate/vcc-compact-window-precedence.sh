#!/bin/bash
# Candidate check: the openclaw user's Claude Code settings decide /vcc's auto-compact window.
#
# OpenClaw injects CLAUDE_CODE_AUTO_COMPACT_WINDOW=<model window> into every claude it
# spawns (1M for Claude 5 models) and always passes --setting-sources user. The fix puts
# {"env":{"CLAUDE_CODE_AUTO_COMPACT_WINDOW":"900000"}} in ~/.claude/settings.json. This
# runs Claude Code's own /autocompact and /context (local commands, no API call, no
# login) on the production version with a throwaway config dir and asserts:
#   A  settings 900k + injected 1M                       -> 900k
#   B  no settings   + injected 1M (production today)    -> 1m
#   C  settings 900k + injected 200k + DISABLE_1M (200k) -> capped to 200k by the model
#   D  as A, plus the --settings OpenClaw adds under a restricted tool policy -> 900k
set -euo pipefail
VERSION="${VCC_CLAUDE_VERSION:-2.1.280}"
D="${VLAB_CANDIDATE_DATA:-$OPENCLAW_STATE_DIR}/precedence"
NODE_BIN="$(dirname "$(command -v node || echo /opt/vlab/node-v22.23.1-linux-x64/bin/node)")"
[ -x "$NODE_BIN/npm" ] || NODE_BIN=/opt/vlab/node-v22.23.1-linux-x64/bin
mkdir -p "$D/cli" "$D/with" "$D/without" "$D/npm"
"$NODE_BIN/npm" install --prefix "$D/cli" --no-audit --no-fund --cache "$D/npm" "@anthropic-ai/claude-code@$VERSION" >/dev/null
CLAUDE="$D/cli/node_modules/.bin/claude"
"$CLAUDE" --version | grep -q "^$VERSION " || { echo "expected Claude Code $VERSION"; exit 1; }
echo '{"env":{"CLAUDE_CODE_AUTO_COMPACT_WINDOW":"900000"}}' > "$D/with/settings.json"
# extensions/anthropic/cli-shared.ts CLAUDE_RESTRICTED_SETTINGS (OpenClaw 9.1)
RESTRICTED='{"disableAllHooks":true,"enabledPlugins":{},"autoMemoryEnabled":false,"claudeMdExcludes":["**/CLAUDE.md","**/CLAUDE.local.md","**/.claude/rules/**"]}'
echo '{}' > "$D/without/settings.json"

run() { # <config dir> <injected window> <extra env...> -- <command> [extra claude args...]
  local cfg=$1 window=$2; shift 2
  local extra=(); while [ "$1" != "--" ]; do extra+=("$1"); shift; done; shift
  local cmd=$1; shift
  (cd "$D" && env -u ANTHROPIC_API_KEY -u CLAUDE_AUTOCOMPACT_PCT_OVERRIDE HOME="$D/home" CLAUDE_CONFIG_DIR="$cfg" \
    CLAUDE_CODE_AUTO_COMPACT_WINDOW="$window" DISABLE_AUTOUPDATER=1 "${extra[@]}" \
    timeout 90 "$CLAUDE" -p "$cmd" --model claude-opus-5-5 --setting-sources user "$@" 2>&1)
}
check() { # <label> <output> <expected grep -E>
  local line; line=$(printf '%s\n' "$2" | grep -E "Auto-compact window:|\*\*Tokens:\*\*" | head -1)
  echo "$1: $line"
  printf '%s\n' "$line" | grep -qE "$3" || { echo "FAIL $1: expected /$3/"; exit 1; }
}
check "A /autocompact" "$(run "$D/with" 1000000 -- /autocompact)" "Auto-compact window: 900k tokens"
check "A /context"     "$(run "$D/with" 1000000 -- /context)"     "/ 900k "
check "B /autocompact" "$(run "$D/without" 1000000 -- /autocompact)" "Auto-compact window: 1m tokens"
check "C /autocompact" "$(run "$D/with" 200000 CLAUDE_CODE_DISABLE_1M_CONTEXT=1 -- /autocompact)" "capped to 200k by model"
check "C /context"     "$(run "$D/with" 200000 CLAUDE_CODE_DISABLE_1M_CONTEXT=1 -- /context)" "/ 200k "
check "D /autocompact" "$(run "$D/with" 1000000 -- /autocompact --settings "$RESTRICTED")" "Auto-compact window: 900k tokens"
echo "PASS"
