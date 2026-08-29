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
  assert.match(install, /directory-modes\.tsv/);
  assert.match(rollback, /directory-modes\.tsv/);
  assert.match(install, /@openclaw\/codex@2026\.7\.1/);
  assert.match(install, /Codex Plugin package integrity mismatch/);
  assert.match(rollback, /restore_entry \/srv\/vlab\/state\/extensions\/codex/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
