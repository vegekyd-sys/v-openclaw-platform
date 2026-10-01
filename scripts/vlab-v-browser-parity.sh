#!/usr/bin/env bash
# Bring shared VLab's V Browser stack to the same shape as production V.
#
# V:    Broker (server.js 2544ee7e) -> Browser Gateway relays 127.0.0.1:23901-23916
#       -> nginx facade 100.82.39.107:24901-24916 -> main + Worker config profiles
#       vbrowser-01..16 (cdpUrl with ${V_BROWSER_RELAY_TOKEN}), plugin prefix vbrowser-.
# VLab before this script: old Broker server.js, no facade, no profiles, plugin
# prefix vlab- with auto-acquire on, so a real V Browser turn could not route at all.
#
# Run on the VLab host as root, with the integration lease held:
#   ssh vlab91 'sudo env PLUGIN_TGZ=/tmp/x.tgz SERVER_JS=/tmp/server.js VERSION=0.4.7 bash -s apply' < scripts/vlab-v-browser-parity.sh
#   ssh vlab91 'sudo env BACKUP=<dir> bash -s undo' < scripts/vlab-v-browser-parity.sh
# Neither mode restarts the shared Gateway; do that once, in the same window.
set -euo pipefail
MODE="${1:?apply|undo}"
INSTANCE=/srv/vlab-production-mirror/labs/instances/db91-parity
CONFIG_DIR=$INSTANCE/state/shared-vlab-20260909-v3
MAIN=$CONFIG_DIR/openclaw.json
WORKER=$CONFIG_DIR/worker-openclaw.json
RELEASES=$INSTANCE/capability-alignment-20260911/plugin-sources/opt/v-browser/releases
BROKER_SERVER=/srv/vlab-browser/app/broker/server.js
RELAY_SECRET=/srv/vlab-browser/state/credentials/browser-extension-relay.secret
RELAY_ENV=/etc/v-browser/extension-relay.env
DROPIN=/etc/systemd/system/openclaw-vlab-production-mirror-v8.service.d/96-v-browser-relay.conf
FACADE_CONF=/etc/v-browser/nginx-cdp-facade.conf
FACADE_UNIT=/etc/systemd/system/v-browser-cdp-facade.service
FACADE_HOST=100.75.190.64
GW_USER=lab-db91-parity

if [ "$MODE" = undo ]; then
  : "${BACKUP:?BACKUP=<backup dir>}"
  systemctl disable --now v-browser-cdp-facade.service 2>/dev/null || true
  rm -f "$FACADE_UNIT" "$FACADE_CONF" "$DROPIN"
  [ -f "$BACKUP/extension-relay.env.absent" ] && rm -f "$RELAY_ENV"
  install -o "$(stat -c %U "$MAIN")" -g "$(stat -c %G "$MAIN")" -m "$(stat -c %a "$MAIN")" "$BACKUP/openclaw.json" "$MAIN"
  install -o "$(stat -c %U "$WORKER")" -g "$(stat -c %G "$WORKER")" -m "$(stat -c %a "$WORKER")" "$BACKUP/worker-openclaw.json" "$WORKER"
  install -o "$(stat -c %U "$BROKER_SERVER")" -g "$(stat -c %G "$BROKER_SERVER")" -m "$(stat -c %a "$BROKER_SERVER")" "$BACKUP/server.js" "$BROKER_SERVER"
  systemctl daemon-reload
  systemctl restart v-browser-broker.service
  echo "undone from $BACKUP; restart the shared Gateway to finish"
  exit 0
fi

[ "$MODE" = apply ] || { echo "usage: apply|undo" >&2; exit 2; }
: "${PLUGIN_TGZ:?}" "${SERVER_JS:?}" "${VERSION:?}"
[ "$(sha256sum "$SERVER_JS" | cut -c1-16)" = 2544ee7eac297c0b ] || { echo "SERVER_JS is not production's broker server.js" >&2; exit 1; }
STAMP=$(date +%Y%m%dT%H%M%S)
BACKUP=/srv/vlab-production-mirror/labs/shared-workflow/tmp/v-browser-parity-$STAMP
mkdir -p "$BACKUP"
cp -a "$MAIN" "$BACKUP/openclaw.json"
cp -a "$WORKER" "$BACKUP/worker-openclaw.json"
cp -a "$BROKER_SERVER" "$BACKUP/server.js"
[ -f "$RELAY_ENV" ] || touch "$BACKUP/extension-relay.env.absent"

# 1. Broker: production's server.js (the only Broker file that differs).
install -o "$(stat -c %U "$BROKER_SERVER")" -g "$(stat -c %G "$BROKER_SERVER")" -m "$(stat -c %a "$BROKER_SERVER")" "$SERVER_JS" "$BROKER_SERVER"

# 2. Plugin release beside 0.4.6, same owner, typebox copied from 0.4.6.
DEST=$RELEASES/$VERSION/openclaw-plugin
[ ! -e "$DEST" ] || { echo "$DEST already exists" >&2; exit 1; }
mkdir -p "$RELEASES/$VERSION"
tar xzf "$PLUGIN_TGZ" -C "$RELEASES/$VERSION"
rm -rf "$DEST/tests"
mkdir -p "$DEST/node_modules"
cp -a "$RELEASES/0.4.6/openclaw-plugin/node_modules/typebox" "$DEST/node_modules/typebox"
chown -R "$GW_USER:$GW_USER" "$RELEASES/$VERSION"
chmod -R u=rwX,g=rX,o= "$RELEASES/$VERSION"

# 3. Relay token for the shared Gateway (and the Worker children it spawns).
mkdir -p /etc/v-browser
if [ ! -f "$RELAY_ENV" ]; then
  umask 027
  printf 'V_BROWSER_RELAY_TOKEN=%s\n' "$(cat "$RELAY_SECRET")" > "$RELAY_ENV"
  chown root:"$GW_USER" "$RELAY_ENV"; chmod 0640 "$RELAY_ENV"
fi
mkdir -p "$(dirname "$DROPIN")"
printf '[Service]\nEnvironmentFile=%s\n' "$RELAY_ENV" > "$DROPIN"

# 4. Tailnet facade, standalone nginx (the host's default nginx site stays off).
{
  echo "pid /run/v-browser-cdp-facade.pid;"
  echo "error_log /var/log/nginx/v-browser-cdp-facade.error.log;"
  echo "events {}"
  echo "http {"
  echo "  access_log off;"
  for n in $(seq -w 1 16); do
    cat <<EOF
  server {
    listen $FACADE_HOST:249$n;
    location / {
      proxy_pass http://127.0.0.1:239$n;
      proxy_http_version 1.1;
      proxy_set_header Host 127.0.0.1:239$n;
      proxy_set_header Authorization \$http_authorization;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
      sub_filter_types application/json;
      sub_filter 'ws://127.0.0.1:239$n/cdp' 'ws://$FACADE_HOST:249$n/cdp';
      sub_filter_once on;
    }
  }
EOF
  done
  echo "}"
} > "$FACADE_CONF"
nginx -t -c "$FACADE_CONF"
cat > "$FACADE_UNIT" <<EOF
[Unit]
Description=V Browser CDP facade (tailnet -> Browser Gateway relays), mirrors production V
After=network-online.target tailscaled.service
[Service]
ExecStart=/usr/sbin/nginx -c $FACADE_CONF -g 'daemon off;'
ExecReload=/usr/sbin/nginx -c $FACADE_CONF -s reload
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

# 5. Config: the same keys production V has, VLab addresses.
python3 - "$MAIN" "$WORKER" "$RELEASES/0.4.6/openclaw-plugin" "$DEST" "$FACADE_HOST" <<'PY'
import json, os, sys, tempfile
main, worker, old, new, host = sys.argv[1:]
for path in (main, worker):
    with open(path) as f:
        c = json.load(f)
    paths = c["plugins"]["load"]["paths"]
    assert paths.count(old) == 1, f"{path}: expected one {old}"
    paths[paths.index(old)] = new
    entry = c["plugins"]["entries"]["v-browser-device"]
    cfg = entry.setdefault("config", {})
    cfg.update({"profilePrefix": "vbrowser-", "autoAcquireSingleDevice": False, "leaseTtlMs": 300000, "pairingTtlMs": 600000})
    cfg.pop("traceLifecycle", None)
    b = c.setdefault("browser", {})
    allowed = b.setdefault("ssrfPolicy", {}).setdefault("allowedHostnames", [])
    for h in (host, "localhost"):
        if h not in allowed:
            allowed.append(h)
    profiles = b.setdefault("profiles", {})
    for n in range(1, 17):
        profiles[f"vbrowser-{n:02d}"] = {"cdpUrl": "http://vbrowser:${V_BROWSER_RELAY_TOKEN}@%s:%d" % (host, 24900 + n), "attachOnly": True}
    st = os.stat(path)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w") as f:
        json.dump(c, f, indent=2); f.write("\n")
    os.chown(tmp, st.st_uid, st.st_gid); os.chmod(tmp, st.st_mode & 0o777)
    os.replace(tmp, path)
    print("configured", path)
PY

systemctl daemon-reload
systemctl enable --now v-browser-cdp-facade.service
systemctl restart v-browser-broker.service
echo "backup=$BACKUP"
echo "applied; restart the shared Gateway once to load plugin $VERSION, the relay token and the profiles"
