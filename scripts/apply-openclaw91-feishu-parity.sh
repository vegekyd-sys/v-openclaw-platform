#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo 'Usage: apply-openclaw91-feishu-parity.sh CORE_DIR STATE_DIR PATCH_DIR' >&2
  exit 64
fi

core=$1
state=$2
patch_dir=$3
node_bin=${OPENCLAW_NODE_BIN:-/opt/node-v22.23.1/bin/node}

[[ -f "$core/package.json" ]]
[[ -d "$state/npm/projects" ]]
[[ -f "$patch_dir/patch-openclaw91-runtime-footer.mjs" ]]
[[ -f "$patch_dir/patch-openclaw91-codex-commentary.mjs" ]]
[[ "$($node_bin -p "require('$core/package.json').version")" == 2026.9.1 ]]

feishu_candidates=()
while IFS= read -r -d '' package_json; do
  if [[ "$($node_bin -p "require('$package_json').version")" == 2026.9.1 ]]; then
    feishu_candidates+=("${package_json%/package.json}")
  fi
done < <(find "$state/npm/projects" -path '*/node_modules/@openclaw/feishu/package.json' -type f -print0)

if [[ ${#feishu_candidates[@]} -ne 1 ]]; then
  echo "Expected exactly one installed Feishu 2026.9.1 package, got ${#feishu_candidates[@]}" >&2
  exit 65
fi

feishu=${feishu_candidates[0]}
"$node_bin" "$patch_dir/patch-openclaw91-runtime-footer.mjs" "$core" "$feishu" --apply
"$node_bin" "$patch_dir/patch-openclaw91-codex-commentary.mjs" "$core" "$feishu" --apply

grep -Rql 'vlab91-runtime-footer-v1' "$core/dist"
grep -Rql 'vlab91-runtime-footer-v1' "$feishu/dist"
grep -Rql 'vlab91-codex-commentary-v2' "$feishu/dist"
printf 'OpenClaw 2026.9.1 Feishu parity patches verified: %s\n' "$feishu"
