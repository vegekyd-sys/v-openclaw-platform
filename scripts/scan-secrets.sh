#!/usr/bin/env bash
# Fail if tracked files contain what looks like real credential material.
#
#   scripts/scan-secrets.sh [pathspec...]      default: the whole repository
#
# Uses git grep, so it needs nothing beyond git and scans exactly what is
# tracked. The checks this replaces called rg, which is installed neither on
# the CI runner nor on the main Mac: `if rg ...` failed as "command not found",
# the if took the false branch, and both scans passed without ever running.
#
# The pattern targets values, not words. Variable names like app_secret or
# placeholder strings like AKIDEXAMPLE are everywhere in this codebase and are
# not findings; a 24+ character literal assigned to a credential-named key is.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pattern='(gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKID[A-Za-z0-9]{16,}|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(app_?secret|secret_?(id|key)|api_?key|password|token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+_=]{24,}["'"'"'])'

# The scanner must still see real material; if this self-check stops matching,
# the scan has gone blind again and must not report clean.
probe='apiKey: "Zx9Q2mN8pL4kR7tV1wY6bC3dF5gH0jK2"'
printf '%s\n' "$probe" | grep -qiE "$pattern" || { echo "secret scan self-check failed" >&2; exit 2; }

if [ "$#" -eq 0 ]; then set -- .; fi
if git -C "$repo_root" grep -nIiE "$pattern" -- "$@" \
    ':!scripts/scan-secrets.sh' \
    ':!**/volcengine-rtc-4.68.1.esm.js'; then
  echo "possible secret material detected" >&2
  exit 1
fi
