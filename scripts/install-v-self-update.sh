#!/usr/bin/env bash
# Let V run the release tools on itself. See docs/v-self-update.md.
#
#   scripts/install-v-self-update.sh v            # from the Mac
#   scripts/install-v-self-update.sh local        # on V, as openclaw
#   scripts/install-v-self-update.sh v --undo
#
# The release scripts reach production through `ssh v`. On V that alias does not
# exist, so this adds it as a loopback login with V's own key, accepted from
# loopback only. The scripts then run unchanged, and a long step started this way
# runs in its own SSH session, outside the Gateway's cgroup.
#
# It also gives lab/vlab.mjs what it needs on this machine: ~/src/vlab-dev on a
# real `dev` branch, and the registry naming it. Nothing here restarts anything,
# touches production runtime files or OpenClaw config. Idempotent.
set -euo pipefail

host=${1:?usage: install-v-self-update.sh <ssh-host|local> [--undo] [--no-verify]}
shift

if [ "$host" != local ]; then
  ssh "$host" "sudo -n -H -u openclaw bash -s -- local $*" < "${BASH_SOURCE[0]}"
  exit
fi

undo=0 verify=1
for a in "$@"; do
  case "$a" in
    --undo) undo=1 ;;
    --no-verify) verify=0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

begin='# BEGIN v-self-update'
end='# END v-self-update'
key_tag='v-self-update-loopback'
ssh_config=$HOME/.ssh/config
authorized=$HOME/.ssh/authorized_keys
dev=${VLAB_DEV:-$HOME/src/vlab-dev}
registry=$(git -C "$dev" rev-parse --path-format=absolute --git-common-dir)/vlab-workflow.json

if [ "$undo" = 1 ]; then
  [ -f "$ssh_config" ] && sed -i.bak "/^$begin\$/,/^$end\$/d" "$ssh_config" && rm -f "$ssh_config.bak"
  [ -f "$authorized" ] && sed -i.bak "/ $key_tag\$/d" "$authorized" && rm -f "$authorized.bak"
  rm -f "$registry"
  echo "removed the ssh alias, its key entry and the registry; $dev stays on its branch"
  exit 0
fi

# A dirty checkout belongs to somebody; do not move it.
if [ -n "$(git -C "$dev" status --porcelain)" ]; then
  echo "$dev has uncommitted changes; not touching it" >&2
  exit 1
fi

git -C "$dev" fetch -q origin dev
if [ "$(git -C "$dev" branch --show-current)" = dev ]; then
  git -C "$dev" merge -q --ff-only origin/dev
else
  git -C "$dev" switch -q -C dev origin/dev
fi

base=$(git -C "$dev" rev-parse HEAD)
[ -f "$registry" ] || printf '{"dev":"%s","base":"%s","sshAlias":"vlab91"}\n' "$dev" "$base" > "$registry"

install -d -m 700 "$HOME/.ssh"
pub=$(ssh-keygen -y -f "$HOME/.ssh/id_ed25519")
touch "$authorized" "$ssh_config"
chmod 600 "$authorized" "$ssh_config"
grep -q " $key_tag\$" "$authorized" \
  || printf 'from="127.0.0.1,::1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding %s %s\n' "$pub" "$key_tag" >> "$authorized"
grep -q "^$begin\$" "$ssh_config" || cat >> "$ssh_config" <<EOF

$begin
Host v
  HostName 127.0.0.1
  User $(id -un)
  IdentityFile $HOME/.ssh/id_ed25519
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
$end
EOF

if [ "$verify" = 1 ]; then
  who=$(ssh v 'id -un; sudo -n true && echo sudo-ok')
  [ "$who" = "$(id -un)"$'\n'sudo-ok ] || { echo "ssh v check failed: $who" >&2; exit 1; }
  node "$dev/lab/vlab.mjs" status > /dev/null
  echo "ssh v and vlab.mjs work; dev is at $(git -C "$dev" rev-parse --short HEAD)"
fi
