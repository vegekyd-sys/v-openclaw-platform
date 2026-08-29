#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=/srv/vlab-vcodex-streaming
RELEASE_ID=2026.7.1-2
RELEASE_DIR="${ROOT_DIR}/releases/${RELEASE_ID}"
SERVICE_NAME=openclaw-vlab-vcodex-streaming.service
NODE_BIN=/opt/vlab/node/bin/node
NPM_BIN=/opt/vlab/node/bin/npm

# npm uses `#!/usr/bin/env node`; pin the same Node runtime as the VLab Gateway
# instead of accidentally falling back to the host's legacy /usr/bin/node.
export PATH="/opt/vlab/node/bin:${PATH}"

if [[ ${EUID} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

for port in 24993 24994; do
  if ss -lntH | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
    echo "port ${port} is already in use" >&2
    exit 1
  fi
done

if ! getent passwd vlab-vcodex >/dev/null; then
  useradd --system --home-dir "${ROOT_DIR}/home" --shell /usr/sbin/nologin vlab-vcodex
fi

install -d -o vlab-vcodex -g vlab-vcodex -m 0700 \
  "${ROOT_DIR}/home" \
  "${ROOT_DIR}/state" \
  "${ROOT_DIR}/state/agents" \
  "${ROOT_DIR}/state/agents/vcodex-streaming" \
  "${ROOT_DIR}/state/agents/vcodex-streaming/agent" \
  "${ROOT_DIR}/workspace" \
  "${ROOT_DIR}/codex-home" \
  "${ROOT_DIR}/tmp" \
  "${ROOT_DIR}/logs" \
  "${ROOT_DIR}/backups" \
  "${ROOT_DIR}/secrets"

# Keep the startup patch hook immutable to the service account.
install -d -o root -g vlab-vcodex -m 0750 "${ROOT_DIR}/bin"

if [[ ! -x ${NODE_BIN} || ! -x ${NPM_BIN} ]]; then
  echo "VLab Node runtime is unavailable" >&2
  exit 1
fi

if [[ ! -f ${RELEASE_DIR}/node_modules/openclaw/openclaw.mjs ]]; then
  install -d -o root -g root -m 0755 "${RELEASE_DIR}"
  "${NPM_BIN}" install \
    --prefix "${RELEASE_DIR}" \
    --omit=dev \
    --ignore-scripts=false \
    --no-audit \
    --no-fund \
    --save-exact \
    openclaw@2026.7.1-2 \
    @openclaw/codex@2026.7.1-1 \
    @openclaw/feishu@2026.7.1
  chown -R root:root "${RELEASE_DIR}"
  chmod -R go-w "${RELEASE_DIR}"
fi

ln -sfn "${RELEASE_DIR}" "${ROOT_DIR}/current.next"
mv -Tf "${ROOT_DIR}/current.next" "${ROOT_DIR}/current"

echo "runtime installed at ${RELEASE_DIR}"
echo "provision ${ROOT_DIR}/secrets/runtime.env and the isolated auth database before starting"
