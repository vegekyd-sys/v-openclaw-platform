// Renders scripts/install-secret-entry-host.sh into a temp dir (RENDER_DIR: no root, no
// systemctl) for production V and for shared VLab, and checks what would be installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'scripts/install-secret-entry-host.sh');

function render(t, env) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'secret-entry-render-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, RENDER_DIR: dir, RENDER_NODE: process.execPath, ...env } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
  return { dir, read, exists: (p) => fs.existsSync(path.join(dir, p)) };
}

const V = {
  GATEWAY_USER: 'openclaw', GATEWAY_HOME: '/home/openclaw', GATEWAY_STATE: '/home/openclaw/.openclaw',
  GATEWAY_CONFIG: '/home/openclaw/.openclaw/openclaw.json', OPENCLAW_DIST: '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist',
  NODE: '/opt/node-v22.23.1/bin/node',
  GATEWAY_ENV_FILES: '-/home/openclaw/.openclaw/gateway.systemd.env\n-/home/openclaw/.openclaw/.env\n/etc/v-browser/extension-relay.env',
};

test('production V: loopback public side, cloudflared base URL, Gateway environment, Gateway drop-in', (t) => {
  const r = render(t, V);
  const unit = r.read('systemd/v-secret-entry.service');
  assert.match(unit, /^User=openclaw$/m);
  assert.match(unit, /^ExecStart=\/opt\/node-v22\.23\.1\/bin\/node \/opt\/v-secret-entry\/server\.mjs \/etc\/v-secret-entry\/config\.json$/m);
  assert.match(unit, /^Environment=OPENCLAW_CONFIG_PATH=\/home\/openclaw\/\.openclaw\/openclaw\.json$/m);
  assert.match(unit, /PRODUCTION - not VLab/);
  assert.equal(r.read('systemd/v-secret-entry.service.d/10-gateway-env.conf').split('\n').filter((l) => l.startsWith('EnvironmentFile=')).join('\n'),
    'EnvironmentFile=-/home/openclaw/.openclaw/gateway.systemd.env\nEnvironmentFile=-/home/openclaw/.openclaw/.env\nEnvironmentFile=/etc/v-browser/extension-relay.env');
  const dropin = r.read('systemd/openclaw-gateway.service.d/secret-entry.conf');
  assert.match(dropin, /^Environment=V_SECRET_ENTRY_ADMIN_URL=http:\/\/127\.0\.0\.1:23961$/m);
  assert.match(dropin, /^Environment=V_SECRET_ENTRY_ADMIN_TOKEN_FILE=\/etc\/v-secret-entry\/admin-token$/m);
  const config = JSON.parse(r.read('etc/v-secret-entry/config.json'));
  assert.deepEqual({ ...config, limits: undefined }, {
    bind: '127.0.0.1', publicBind: '127.0.0.1', publicPort: 23960, adminPort: 23961, publicBaseUrl: 'https://openclaw.tianyi.live',
    pathPrefix: '/secret-entry', stateDir: '/var/lib/v-secret-entry', adminTokenFile: '/etc/v-secret-entry/admin-token',
    openclawDist: V.OPENCLAW_DIST, limits: undefined,
  });
  const token = r.read('etc/v-secret-entry/admin-token').trim();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(path.join(r.dir, 'etc/v-secret-entry/admin-token')).mode & 0o077, 0, 'token is private');
  // What parity compares: the app without tests.
  assert(r.exists('opt/v-secret-entry/server.mjs') && r.exists('opt/v-secret-entry/lib/links.mjs') && r.exists('opt/v-secret-entry/public/index.html'));
  assert(!r.exists('opt/v-secret-entry/tests'));
});

test('shared VLab: vlab- prefix, tailnet public side, ports away from live candidates, VLab Gateway unit', (t) => {
  const r = render(t, {
    ...V, UNIT_PREFIX: 'vlab-', GATEWAY_UNIT: 'openclaw-vlab-production-mirror-v8.service', PUBLIC_BIND: 'fd7a:115c:a1e0::e539:be40',
    GATEWAY_USER: 'lab-db91-parity', GATEWAY_HOME: '/srv/vlab-production-mirror/labs/instances/db91-parity',
    GATEWAY_STATE: '/srv/vlab-production-mirror/labs/instances/db91-parity/state',
    GATEWAY_CONFIG: '/srv/vlab-production-mirror/labs/instances/db91-parity/state/shared-vlab-20260909-v3/openclaw.json',
    OPENCLAW_DIST: '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist',
    NODE: '/opt/vlab/node-v22.23.1-linux-x64/bin/node', GATEWAY_ENV_FILES: '/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env',
  });
  const unit = r.read('systemd/vlab-v-secret-entry.service');
  assert.match(unit, /^User=lab-db91-parity$/m);
  assert.match(unit, /\/opt\/vlab-v-secret-entry\/server\.mjs \/etc\/vlab-v-secret-entry\/config\.json$/m);
  assert.match(unit, /^After=network\.target openclaw-vlab-production-mirror-v8\.service$/m);
  assert.doesNotMatch(unit, /PRODUCTION/);
  const config = JSON.parse(r.read('etc/vlab-v-secret-entry/config.json'));
  assert.deepEqual([config.publicBind, config.publicPort, config.adminPort, config.publicBaseUrl, config.stateDir],
    ['fd7a:115c:a1e0::e539:be40', 23970, 23971, 'http://[fd7a:115c:a1e0::e539:be40]:23970', '/var/lib/vlab-v-secret-entry']);
  assert.match(r.read('systemd/openclaw-vlab-production-mirror-v8.service.d/secret-entry.conf'),
    /V_SECRET_ENTRY_ADMIN_URL=http:\/\/127\.0\.0\.1:23971[\s\S]*V_SECRET_ENTRY_ADMIN_TOKEN_FILE=\/etc\/vlab-v-secret-entry\/admin-token/);
  assert(r.exists('opt/vlab-v-secret-entry/server.mjs'));
});

test('Gateway user, paths, dist, node and environment files are read from the Gateway unit', (t) => {
  // systemctl show output as V printed it on 2026-10-05 (values shortened).
  const bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fake-systemctl-')));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  fs.writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh
case "$4" in
  User) echo openclaw;;
  Environment) echo 'HOME=/home/openclaw OPENCLAW_STATE_DIR=/home/openclaw/.openclaw NODE_OPTIONS=--x';;
  ExecStart) echo '{ path=/opt/node-v22.23.1/bin/node ; argv[]=/opt/node-v22.23.1/bin/node --max-old-space-size=8192 /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js gateway --port 22793 ; ignore_errors=no ; start_time=[n/a] }';;
  EnvironmentFiles) printf '%s\\n' '/home/openclaw/.openclaw/gateway.systemd.env (ignore_errors=yes)' '/etc/v-browser/extension-relay.env (ignore_errors=no)';;
esac
`, { mode: 0o755 });
  const r = render(t, { PATH: `${bin}:${process.env.PATH}` });
  const unit = r.read('systemd/v-secret-entry.service');
  assert.match(unit, /^ExecStart=\/opt\/node-v22\.23\.1\/bin\/node \/opt\/v-secret-entry\/server\.mjs/m);
  assert.match(unit, /^Environment=OPENCLAW_STATE_DIR=\/home\/openclaw\/\.openclaw$/m);
  assert.match(unit, /^Environment=OPENCLAW_CONFIG_PATH=\/home\/openclaw\/\.openclaw\/openclaw\.json$/m, 'defaults to <state>/openclaw.json');
  assert.equal(JSON.parse(r.read('etc/v-secret-entry/config.json')).openclawDist, V.OPENCLAW_DIST);
  assert.match(r.read('systemd/v-secret-entry.service.d/10-gateway-env.conf'),
    /^EnvironmentFile=-\/home\/openclaw\/\.openclaw\/gateway\.systemd\.env\nEnvironmentFile=\/etc\/v-browser\/extension-relay\.env$/m);
});

test('an existing admin token is kept on reinstall', (t) => {
  const r = render(t, V);
  const before = r.read('etc/v-secret-entry/admin-token');
  const again = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, ...V, RENDER_DIR: r.dir, RENDER_NODE: process.execPath } });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(r.read('etc/v-secret-entry/admin-token'), before);
});
