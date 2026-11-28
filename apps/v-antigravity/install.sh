#!/usr/bin/env bash
# Install the v-antigravity plugin and prepare the Antigravity CLI for /neon on V.
# Run as root from a checkout of this repository. Idempotent. Prints no secrets.
#
#   sudo bash apps/v-antigravity/install.sh --dry-run
#   sudo bash apps/v-antigravity/install.sh
#
# What it does:
#   1. copies apps/v-antigravity/plugin to $EXT (root:root, 755/644, like v-session-relay);
#   2. checks the Antigravity CLI at $AGY (installed with Google's official installer,
#      `bash install.sh --dir /opt/agy/<version>`, then `ln -sfn /opt/agy/<version> /opt/agy/current`;
#      root-owned, so it cannot self-update under the Gateway);
#   3. creates the CLI's private HOME for the Gateway user ($AGY_HOME, openclaw 0700).
# It does not touch openclaw.json (scripts/gemini-neon-alias.mjs does, inside v-self-restart)
# and it cannot log in: the account owner signs in once as the Gateway user, see the end.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT=/home/openclaw/.openclaw/extensions/v-antigravity
AGY=/opt/agy/current/agy
AGY_HOME=/home/openclaw/.agy-home
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1
run() { if [[ $DRY -eq 1 ]]; then echo "would: $*"; else "$@"; fi; }

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
id openclaw >/dev/null

for f in index.js backend.js runtime.js openclaw.plugin.json package.json; do
  [[ -f "$HERE/plugin/$f" ]] || { echo "missing plugin/$f" >&2; exit 1; }
done
run install -d -m 755 -o root -g root "$EXT"
for f in index.js backend.js runtime.js openclaw.plugin.json package.json; do
  run install -m 644 -o root -g root "$HERE/plugin/$f" "$EXT/$f"
done

if [[ -x "$AGY" ]]; then
  echo "agy: $($AGY --version 2>/dev/null | head -1) at $(readlink -f "$AGY")"
else
  echo "agy missing at $AGY: install it with Google's installer (--dir /opt/agy/<version>) and link /opt/agy/current" >&2
  [[ $DRY -eq 1 ]] || exit 1
fi

run install -d -m 700 -o openclaw -g openclaw "$AGY_HOME" "$AGY_HOME/work"
if [[ -d "$AGY_HOME/.gemini/antigravity-cli" ]]; then
  echo "agy home has CLI state: $AGY_HOME/.gemini/antigravity-cli"
else
  cat <<EOF
Not signed in yet. The account owner runs, once, in a terminal on V:
  sudo -u openclaw -H sh -c 'cd $AGY_HOME/work && HOME=$AGY_HOME $AGY --mode plan'
choose "Google OAuth", open the link, paste the code back, then /quit.
EOF
fi
