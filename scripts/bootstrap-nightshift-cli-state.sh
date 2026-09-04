#!/usr/bin/env bash
set -euo pipefail

source_state="${NIGHTSHIFT_SOURCE_STATE_DIR:-/srv/vlab-browser/state}"
private_state="${OPENCLAW_STATE_DIR:-/srv/vlab-browser/nightshift/openclaw-state}"
temp_dir="${TMPDIR:-$private_state/tmp}"

install -d -m 700 "$private_state" "$private_state/identity" "$private_state/state" "$temp_dir"
install -m 600 "$source_state/identity/device.json" "$private_state/identity/device.json"
if [[ -f "$source_state/identity/device-auth.json" ]]; then
  install -m 600 "$source_state/identity/device-auth.json" "$private_state/identity/device-auth.json"
else
  rm -f -- "$private_state/identity/device-auth.json"
fi

for directory in extensions npm plugin-skills; do
  if [[ -e "$private_state/$directory" && ! -L "$private_state/$directory" ]]; then
    echo "Refusing to replace non-symlink path: $private_state/$directory" >&2
    exit 1
  fi
  ln -sfn "$source_state/$directory" "$private_state/$directory"
done

plugins_next="$private_state/plugins.next"
rm -rf -- "$plugins_next"
if [[ -d "$source_state/plugins" ]]; then
  cp -a "$source_state/plugins" "$plugins_next"
else
  install -d -m 700 "$plugins_next"
fi
rm -rf -- "$private_state/plugins"
mv "$plugins_next" "$private_state/plugins"
