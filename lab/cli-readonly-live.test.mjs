import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCATION, LOCATION_BEFORE_SHA, MARKER, READONLY, READONLY_BEFORE_SHA, patchLocation, patchReadonly, sha256, unpatchLocation, unpatchReadonly } from './patch-cli-readonly-live.mjs';

// cli-readonly-live: CLI device identity/token reads open a live WAL in place instead of copying shared
// state, and abandoned snapshot copies are swept. See lab/cli-readonly-live.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/cli-readonly-live.plan.json'));
const dir = 'lab/release-files/cli-readonly-live';
const releasedReadonly = read(`${dir}/${READONLY}`);
const releasedLocation = read(`${dir}/${LOCATION}`);

test('plan pins V bytes before and the release files after', () => {
  const [readonly, location] = plan.files;
  assert.deepEqual([readonly.target, location.target], [READONLY, LOCATION].map((n) => `openclaw/dist/${n}`));
  assert.equal(readonly.before, READONLY_BEFORE_SHA);
  assert.equal(location.before, LOCATION_BEFORE_SHA);
  assert.equal(sha256(unpatchReadonly(releasedReadonly)), READONLY_BEFORE_SHA, 'V bytes');
  assert.equal(sha256(unpatchLocation(releasedLocation)), LOCATION_BEFORE_SHA, 'V bytes');
  assert.equal(sha256(releasedReadonly), readonly.after);
  assert.equal(sha256(releasedLocation), location.after);
  assert.equal(patchReadonly(unpatchReadonly(releasedReadonly)), releasedReadonly);
  assert.equal(patchLocation(unpatchLocation(releasedLocation)), releasedLocation);
  assert.throws(() => patchReadonly(releasedReadonly), /already patched/);
  assert.throws(() => patchLocation(releasedLocation), /already patched/);
});

test('the artifact-preserving reader tries the live WAL before any snapshot', () => {
  assert.ok(releasedReadonly.includes(MARKER));
  const fn = releasedReadonly.slice(releasedReadonly.indexOf('function withExistingOpenClawStateDatabaseArtifactPreservingReadOnly'));
  const live = fn.indexOf('canReadLiveWalWithoutNewSidecars(existingPath)');
  assert.ok(live > 0 && live < fn.indexOf('prepareSqliteReadOnlyLocationSyncInProcess)(existingPath)'));
  assert.match(fn, /if \(!writerOpen && canReadLiveWalWithoutNewSidecars/u, 'never beside a writable handle in this process');
  assert.match(releasedReadonly, /OPENCLAW_V_LIVE_WAL_READS === "0"/u);
  for (const exported of ['withExistingOpenClawStateDatabaseReadOnly as n', 'withOpenClawStateDatabaseReadOnly as r', 'withExistingOpenClawStateDatabaseArtifactPreservingReadOnly as t']) {
    assert.ok(releasedReadonly.includes(exported), exported);
  }
});

test('snapshot copies name their reader and isolated workers inherit it', () => {
  assert.ok(releasedLocation.includes('const SQLITE_SNAPSHOT_STAGING_PREFIX = `openclaw-sqlite-readonly-${SQLITE_SNAPSHOT_OWNER_PID}-`;'));
  assert.equal(releasedLocation.split('env: snapshotWorkerEnv()').length - 1, 2, 'async and sync worker');
  assert.equal(releasedLocation.split('sweepAbandonedSnapshotDirectories(stagingRoot);').length - 1, 2, 'sync copy and async staging');
  assert.ok(releasedLocation.indexOf('const SQLITE_SNAPSHOT_OWNER_ENV') < releasedLocation.indexOf('const SQLITE_SNAPSHOT_OWNER_PID = resolveSnapshotOwnerPid()'));
});

test('the sweep removes only old copies whose owner is gone', async () => {
  const start = releasedLocation.indexOf('function resolveSnapshotOwnerPid()');
  const end = releasedLocation.indexOf('function statIfPresent(pathname)');
  const consts = releasedLocation.slice(releasedLocation.indexOf('const SQLITE_SNAPSHOT_OWNER_ENV'), releasedLocation.indexOf('const SQLITE_SNAPSHOT_STAGING_PREFIX'));
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const body = `${consts.replace('resolveSnapshotOwnerPid()', 'process.pid')}\nconst SQLITE_SNAPSHOT_DIRECTORY_PATTERN = /^openclaw-sqlite-readonly-(\\d+)-[^/\\\\]+$/u;\nconst ABANDONED_SNAPSHOT_MIN_AGE_MS = 10 * 6e4;\nconst sweptStagingRoots = new Set();\n${releasedLocation.slice(start, end)}\nreturn sweepAbandonedSnapshotDirectories;`;
  const sweep = new Function('fs', 'path', 'process', body)(fs, path, process);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-readonly-live-'));
  try {
    const dead = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);
    const make = (name, ageMs) => {
      const d = path.join(stage, name);
      fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'database.sqlite'), 'x');
      const t = new Date(Date.now() - ageMs);
      fs.utimesSync(d, t, t);
      return d;
    };
    const gone = make(`openclaw-sqlite-readonly-${dead}-old`, 3_600_000);
    const young = make(`openclaw-sqlite-readonly-${dead}-young`, 0);
    const live = make(`openclaw-sqlite-readonly-${process.ppid}-live`, 3_600_000);
    const mine = make(`openclaw-sqlite-readonly-${process.pid}-mine`, 3_600_000);
    const other = make('openclaw-sqlite-readonly-stage', 3_600_000);
    sweep(stage);
    assert.equal(fs.existsSync(gone), false);
    for (const kept of [young, live, mine, other]) assert.equal(fs.existsSync(kept), true, kept);
    const again = make(`openclaw-sqlite-readonly-${dead}-again`, 3_600_000);
    sweep(stage);
    assert.equal(fs.existsSync(again), true, 'once per staging root and process');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
});
