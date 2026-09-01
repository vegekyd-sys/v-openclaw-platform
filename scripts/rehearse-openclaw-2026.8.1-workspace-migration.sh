#!/usr/bin/env bash
set -euo pipefail

: "${OPENCLAW_CONFIG_PATH:?OPENCLAW_CONFIG_PATH is required}"
: "${OPENCLAW_STATE_DIR:?OPENCLAW_STATE_DIR is required}"
: "${OPENCLAW_ROOT:?OPENCLAW_ROOT is required}"
: "${WORKSPACE_MIGRATION_SCRIPT:?WORKSPACE_MIGRATION_SCRIPT is required}"
: "${EXPECTED_WORKSPACE_SOURCE_COUNT:?EXPECTED_WORKSPACE_SOURCE_COUNT is required}"

[[ ${EUID} -eq 0 ]]
stage_root="${OPENCLAW_STATE_DIR}/workspace-migration-mounts"
manifest="${stage_root}/original.sha256"
workspace_list="${stage_root}/workspaces.list"
rm -rf "${stage_root}"
install -d -o openclaw -g openclaw -m 700 "${stage_root}"

dry_run=$(runuser -u openclaw -- env \
  HOME=/home/openclaw \
  OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
  /opt/node-v22.23.1/bin/node "${WORKSPACE_MIGRATION_SCRIPT}" \
    --config "${OPENCLAW_CONFIG_PATH}" \
    --openclaw-root "${OPENCLAW_ROOT}" \
    --state-dir "${OPENCLAW_STATE_DIR}" \
    --expected-source-count "${EXPECTED_WORKSPACE_SOURCE_COUNT}")
printf '%s\n' "${dry_run}" > "${stage_root}/dry-run.json"
jq -r '[.workspaceSources[].workspaceDir // empty] | unique[]' \
  "${stage_root}/dry-run.json" > "${workspace_list}"
mapfile -t workspace_dirs < "${workspace_list}"

: > "${manifest}"
for workspace_dir in "${workspace_dirs[@]}"; do
  workspace_key=$(printf '%s' "${workspace_dir}" | sha256sum | awk '{print $1}')
  staged_workspace="${stage_root}/${workspace_key}"
  install -d -o openclaw -g openclaw -m 700 "${staged_workspace}"
  if [[ -f "${workspace_dir}/openclaw-workspace-state.json" ]]; then
    sha256sum "${workspace_dir}/openclaw-workspace-state.json" >> "${manifest}"
    install -o openclaw -g openclaw -m 600 \
      "${workspace_dir}/openclaw-workspace-state.json" \
      "${staged_workspace}/openclaw-workspace-state.json"
  fi
  if [[ -f "${workspace_dir}/.openclaw/workspace-state.json" ]]; then
    sha256sum "${workspace_dir}/.openclaw/workspace-state.json" >> "${manifest}"
    install -d -o openclaw -g openclaw -m 700 "${staged_workspace}/.openclaw"
    install -o openclaw -g openclaw -m 600 \
      "${workspace_dir}/.openclaw/workspace-state.json" \
      "${staged_workspace}/.openclaw/workspace-state.json"
  fi
done

export OPENCLAW_CONFIG_PATH OPENCLAW_STATE_DIR OPENCLAW_ROOT
export WORKSPACE_MIGRATION_SCRIPT EXPECTED_WORKSPACE_SOURCE_COUNT stage_root workspace_list

unshare --mount --propagation private /bin/bash -euo pipefail -c '
  mapfile -t workspace_dirs < "${workspace_list}"
  for workspace_dir in "${workspace_dirs[@]}"; do
    workspace_key=$(printf "%s" "${workspace_dir}" | sha256sum | cut -d " " -f1)
    staged_workspace="${stage_root}/${workspace_key}"
    [[ -d "${staged_workspace}" ]] || continue
    mount --bind "${staged_workspace}" "${workspace_dir}"
  done
  runuser -u openclaw -- env \
    HOME=/home/openclaw \
    OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
    /opt/node-v22.23.1/bin/node "${WORKSPACE_MIGRATION_SCRIPT}" \
      --config "${OPENCLAW_CONFIG_PATH}" \
      --openclaw-root "${OPENCLAW_ROOT}" \
      --state-dir "${OPENCLAW_STATE_DIR}" \
      --expected-source-count "${EXPECTED_WORKSPACE_SOURCE_COUNT}" \
      --apply
'

sha256sum --check --status "${manifest}"
echo REHEARSAL_WORKSPACE_MIGRATION_OK
