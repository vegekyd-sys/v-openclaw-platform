import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const script = fs.readFileSync(
  new URL("../scripts/rehearse-production-openclaw-2026.8.1.sh", import.meta.url),
  "utf8",
);

test("production rehearsal is isolated and never controls the live Gateway", () => {
  assert.match(script, /\/home\/openclaw\/\.openclaw-upgrade-rehearsals/);
  assert.match(script, /assert_live_unchanged/);
  assert.doesNotMatch(script, /systemctl\s+(stop|start|restart)\s+"?\$service/);
  assert.doesNotMatch(script, /\/home\/openclaw\/\.openclaw\/agents\/\*.*rm -rf/);
});

test("production rehearsal freezes exact release hashes and restores only its own state copy", () => {
  assert.match(script, /7bafc2197856e2ba6c0121f4a44708f4de51e72a77615b58b9905e4ef4e968a1/);
  assert.match(script, /fc499e3c823a0a741a282abea9b8d627770f3906a3ddd6068cf190e059c09bed/);
  assert.match(script, /rm -rf --one-file-system "\$state_dir"/);
  assert.match(script, /baseline-summary\.json/);
  assert.match(script, /ROLLBACK_VERIFIED/);
});

test("production rehearsal uses a migration-only lease patch and imports main before makaron", () => {
  assert.match(script, /openclaw-2026\.8\.1-session-migration/);
  assert.match(script, /leaseMs: 36e5/);
  assert.match(script, /official runtime changed while preparing migration runtime/);
  assert.match(script, /for agent in main makaron short-v v-codex dealclaw/);
  assert.match(script, /invalidPlaceholders/);
  assert.match(script, /SELECT count\(\*\) FROM session_nodes/);
});

test("failed rehearsals can restore only the isolated baseline before retrying", () => {
  assert.match(script, /restore-baseline\) restore_isolated_baseline/);
  assert.match(script, /prepare-migration-copy\) prepare_migration_copy/);
  assert.match(script, /candidate config source does not match the frozen 7\.1 baseline/);
  assert.match(script, /rm -f "\$rehearsal_root\/MIGRATED" "\$rehearsal_root\/DATABASES_MIGRATED"/);
});

test("verified migrated state can be restored only after rollback proof", () => {
  assert.match(script, /restore-migrated-for-acceptance\) restore_migrated_for_acceptance/);
  assert.match(script, /rollback rehearsal has not been verified/);
  assert.match(script, /migrated acceptance archive checksum failed/);
  assert.match(script, /ACCEPTANCE_STATE_RESTORED/);
});

test("Worker overlay is separately frozen without historical media and browser evidence", () => {
  assert.match(script, /capture-worker-overlay\) capture_worker_overlay_baseline/);
  assert.match(script, /worker-overlay-baseline\.manifest\.sha256/);
  assert.match(script, /--exclude='\/media\/'/);
  assert.match(script, /--exclude='\/browser\/'/);
  assert.match(script, /WORKER_OVERLAY_BASELINE_OK/);
});
