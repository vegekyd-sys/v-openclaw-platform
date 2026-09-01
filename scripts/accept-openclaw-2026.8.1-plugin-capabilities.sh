#!/usr/bin/env bash
set -euo pipefail

: "${OPENCLAW_CONFIG_PATH:?OPENCLAW_CONFIG_PATH is required}"
: "${OPENCLAW_STATE_DIR:?OPENCLAW_STATE_DIR is required}"

OPENCLAW_BIN="${OPENCLAW_BIN:-/opt/openclaw-2026.8.1/node_modules/openclaw/dist/index.js}"
NODE_BIN="${NODE_BIN:-/opt/node-v22.23.1/bin/node}"

for plugin_id in \
  nightshift-feishu \
  openclaw-deck \
  wecom-openclaw-plugin
do
  "${NODE_BIN}" "${OPENCLAW_BIN}" plugins enable "${plugin_id}" --accept-capabilities
done
