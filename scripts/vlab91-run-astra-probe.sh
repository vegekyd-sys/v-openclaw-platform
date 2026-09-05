#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]]
[[ $1 == lab || $1 == v-codex ]]
: "${VLAB_INSTANCE_OWNER:?Set the owner thread id explicitly}"
exec sudo labctl run astra --owner "$VLAB_INSTANCE_OWNER" -- \
 /opt/vlab/node-v22.23.1-linux-x64/bin/node \
 /srv/vlab-production-mirror/labs/instances/astra/source/scripts/vlab91-astra-probe.mjs "$1"
