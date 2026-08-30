import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseRoot = "/srv/vlab/releases/openclaw-sandbox-plugin-v0.3.0";

test("systemd unit starts the immutable v0.3.0 Broker release", async () => {
  const unit = await readFile(new URL("../systemd/vlab-sandbox-broker.service", import.meta.url), "utf8");
  assert.match(unit, new RegExp(`^WorkingDirectory=${escapeRegExp(releaseRoot)}$`, "m"));
  assert.match(unit, new RegExp(`^ExecStart=/opt/vlab/node/bin/node ${escapeRegExp(releaseRoot)}/bin/sandboxd\\.mjs$`, "m"));
  assert.doesNotMatch(unit, /sandbox-broker-v0\.2\.0\/bin\/sandboxd\.mjs/);
});

test("Sandbox policies permit cryptographic randomness without broad device writes", async () => {
  for (const name of ["offline-dev-v1.yaml", "packages-dev-v1.yaml"]) {
    const policy = await readFile(new URL(`../policies/${name}`, import.meta.url), "utf8");
    assert.match(policy, /read_only: \[[^\n]*\/dev\/urandom[^\n]*\/dev\/random[^\n]*\]/);
    assert.doesNotMatch(policy, /read_write: \[[^\n]*\/dev(?:,|\])/);
  }
});

test("VLab installer and rollback remain scoped to VLab services and state", async () => {
  const install = await readFile(new URL("../scripts/install-vlab.sh", import.meta.url), "utf8");
  const rollback = await readFile(new URL("../scripts/rollback-vlab.sh", import.meta.url), "utf8");
  for (const script of [install, rollback]) {
    assert.doesNotMatch(script, /openclaw-gateway\.service/);
    assert.doesNotMatch(script, /100\.82\.39\.107/);
  }
  assert.match(install, /openclaw-vlab-gateway\.service/);
  assert.match(rollback, /openclaw-vlab-gateway\.service/);
  assert.match(install, /\/opt\/vlab\/node\/bin\/node/);
  assert.match(install, /\/opt\/vlab\/current\/node_modules\/openclaw\/openclaw\.mjs/);
  assert.match(install, /flock -n 9/);
  assert.match(rollback, /flock -n 9/);
  assert.match(install, /"\$release_dir"/);
  assert.match(rollback, /restore_entry \/srv\/vlab\/releases\/openclaw-sandbox-plugin-v0\.3\.0/);
  assert.match(install, /\(\.workspaces \| type\) == "object"/);
  assert.match(install, /\(\.capacity \| type\) == "object"/);
  assert.match(install, /active foreground openclaw agent process/);
  assert.match(install, /VLab disk safety gate failed/);
  assert.match(install, /\.running \/\/ \.jobs\.running \/\/ 0/);
  assert.match(install, /\.workspaces\.active \/\/ 0/);
  assert.match(install, /directory-modes\.tsv/);
  assert.match(rollback, /directory-modes\.tsv/);
  assert.match(install, /@openclaw\/codex@2026\.7\.1/);
  assert.match(install, /Codex Plugin package integrity mismatch/);
  assert.match(rollback, /restore_entry \/srv\/vlab\/state\/extensions\/codex/);
  assert.doesNotMatch(install, /:\-\{\}/);
  assert.doesNotMatch(rollback, /:\-\{\}/);
  assert.match(install, /worker-status-after-start\.json/);
  assert.match(install, /Gateway restarted during acceptance/);
  assert.doesNotMatch(install, /--token "\$gateway_token"/);
  assert.match(install, /VLAB_ROTATE_GATEWAY_TOKEN/);
  assert.match(install, /rotating the VLab-only Gateway token/);
  assert.match(rollback, /restore_entry \/srv\/vlab\/state\/gateway-token/);
  assert.match(rollback, /rollback refused: unable to verify that Project Sandbox is idle/);
  assert.match(rollback, /rollback refused: invalid Project Sandbox health response/);
});

test("production canary is exact-scoped and ships a fail-closed one-click rollback", async () => {
  const install = await readFile(new URL("../scripts/install-production-canary.sh", import.meta.url), "utf8");
  const rollback = await readFile(new URL("../scripts/rollback-production-canary.sh", import.meta.url), "utf8");
  const broker = await readFile(new URL("../systemd/v-project-sandbox-broker.service", import.meta.url), "utf8");
  const tunnel = await readFile(new URL("../systemd/v-openshell-tunnel.service", import.meta.url), "utf8");

  assert.match(install, /agent_id=v-codex/);
  assert.match(install, /oc_3355cd58853f38e19a613b8ff644f52f/);
  assert.match(install, /project_id=v-evolution-engine/);
  assert.match(install, /\.activeCount == 0 and \.queued == 0/);
  assert.match(install, /plugin\.version == "0\.3\.1"/);
  assert.match(install, /configure-production-canary\.mjs/);
  assert.match(install, /rollback-production-canary\.sh/);
  assert.match(install, /project-sandbox-plugin\.XXXXXX/);
  assert.match(install, /install failed at line/);
  assert.match(install, /VLAB_SANDBOX_SOCKET="\$experiment_root\/state\/broker\.sock"/);
  assert.match(install, /Gateway restart loop detected/);
  assert.match(rollback, /rollback refused: active or queued Sandbox work remains/);
  assert.match(rollback, /VLAB_SANDBOX_SOCKET="\$state_root\/broker\.sock"/);
  assert.match(rollback, /Session, Memory, Broker state, and artifacts were preserved/);
  assert.match(broker, /Environment=VLAB_SANDBOX_MAX_CONCURRENT=1/);
  assert.match(broker, /v-evolution-engine/);
  assert.match(broker, /MemoryMax=256M/);
  assert.match(tunnel, /100\.79\.149\.4|v-sandbox-prod/);
  assert.match(tunnel, /ExitOnForwardFailure=yes/);
  for (const source of [install, rollback, broker, tunnel]) {
    assert.doesNotMatch(source, /100\.82\.39\.107/);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
