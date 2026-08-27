#!/usr/bin/env bash
set -euo pipefail

source_dir=${1:-/srv/vlab/releases/sandbox-broker-v0.2.0}
release_dir=/srv/vlab/releases/sandbox-broker-v0.2.0
backup_root=/srv/vlab/backups/sandbox-broker-v0.2.0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$backup_root/$stamp

if [[ $(id -u) -ne 0 ]]; then
  echo "install-vlab.sh must run as root" >&2
  exit 1
fi
if [[ ! -f $source_dir/package.json || ! -f $source_dir/bin/sandboxd.mjs ]]; then
  echo "invalid release source: $source_dir" >&2
  exit 1
fi

install -d -m 0750 "$backup_dir"
for entry in \
  /etc/systemd/system/vlab-sandbox-broker.service \
  /srv/vlab/workspace/skills/project-sandbox/SKILL.md \
  /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml \
  /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml; do
  if [[ -f $entry ]]; then
    name=${entry#/}
    install -d "$backup_dir/$(dirname "$name")"
    cp -a "$entry" "$backup_dir/$name"
  fi
done

install -d -o vlab -g vlab \
  /srv/vlab/projects \
  /srv/vlab/state/sandbox/projects \
  /srv/vlab/state/sandbox-broker/artifacts \
  /srv/vlab/state/sandbox/policies \
  /srv/vlab/workspace/skills/project-sandbox \
  /srv/vlab/bin

if [[ $source_dir != "$release_dir" ]]; then
  rm -rf "$release_dir.new"
  cp -a "$source_dir" "$release_dir.new"
  chown -R vlab:vlab "$release_dir.new"
  systemctl stop vlab-sandbox-broker.service 2>/dev/null || true
  rm -rf "$release_dir"
  mv "$release_dir.new" "$release_dir"
fi

install -o vlab -g vlab -m 0644 "$release_dir/policies/offline-dev-v1.yaml" /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml
install -o vlab -g vlab -m 0644 "$release_dir/policies/packages-dev-v1.yaml" /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml
install -o vlab -g vlab -m 0644 "$release_dir/skill/SKILL.md" /srv/vlab/workspace/skills/project-sandbox/SKILL.md
install -o root -g root -m 0644 "$release_dir/systemd/vlab-sandbox-broker.service" /etc/systemd/system/vlab-sandbox-broker.service
ln -sfn "$release_dir/bin/sandboxctl.mjs" /srv/vlab/bin/sandboxctl
chmod 0755 "$release_dir/bin/"*.mjs "$release_dir/scripts/"*.sh

cat > "$backup_dir/ROLLBACK.txt" <<EOF
sudo $release_dir/scripts/rollback-vlab.sh $backup_dir
EOF
systemctl daemon-reload
systemctl enable --now vlab-sandbox-broker.service
sudo -u vlab -H /srv/vlab/bin/sandboxctl health
echo "backup=$backup_dir"
