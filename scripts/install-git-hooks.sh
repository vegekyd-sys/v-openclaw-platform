#!/usr/bin/env bash
# Point a clone's hooks at .githooks/ so the pre-push guard is versioned with
# the repo instead of living in someone's .git directory.
#
#   scripts/install-git-hooks.sh                 # this clone
#   scripts/install-git-hooks.sh ~/vlab-dev      # another clone of this repo
set -euo pipefail

target=${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
git -C "$target" rev-parse --git-dir >/dev/null

git -C "$target" config core.hooksPath .githooks
echo "$target: core.hooksPath -> .githooks"
git -C "$target" config --get core.hooksPath
