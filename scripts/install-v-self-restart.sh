#!/usr/bin/env bash
# Install v-self-restart on V: the one supported way for V to restart its own
# Gateway (optionally with config changes). See docs/v-self-restart.md.
#
#   scripts/install-v-self-restart.sh v
#
# Installs beside the sentinel (it reuses sentinel.py's direct Feishu path for
# results), together with self-restart-gateway.mjs, the read-only Gateway query
# its idle gate and post-restart checks use. Then runs `--check`, which
# validates and changes nothing. Installing does not restart anything.
set -euo pipefail

host=${1:?usage: install-v-self-restart.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

ssh "$host" 'test -f /opt/v-sentinel/sentinel.py' \
  || { echo "v-sentinel is not installed on $host; install it first" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-self-restart.py" "$host:$stage/self-restart.py"
scp -q "${repo_root}/scripts/v-self-restart-gateway.mjs" "$host:$stage/self-restart-gateway.mjs"

ssh "$host" "sudo install -m 0755 -o root -g root $stage/self-restart.py /opt/v-sentinel/self-restart.py
sudo install -m 0644 -o root -g root $stage/self-restart-gateway.mjs /opt/v-sentinel/self-restart-gateway.mjs
sudo ln -sfn /opt/v-sentinel/self-restart.py /usr/local/sbin/v-self-restart
sudo install -d -m 0700 -o root -g root /var/lib/v-self-restart"

echo '--- check (validates, changes nothing) ---'
ssh "$host" 'sudo v-self-restart --check --reason install-check --requested-by install-v-self-restart.sh'
