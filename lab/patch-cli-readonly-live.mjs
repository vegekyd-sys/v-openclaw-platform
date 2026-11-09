import { createHash } from 'node:crypto';

// CLI Gateway calls read the device identity and device token from shared state "artifact-preserving":
// each read copied the whole state database (593 MB on V) plus its WAL twice into
// ~/.cache/openclaw/openclaw-sqlite-readonly-<pid>-*, and started over in a new directory whenever the
// Gateway appended to the WAL mid-copy (up to 10 attempts). `nodes list` reads twice, `status` three
// times, so one command wrote 5-6 GB on V. With the WAL and SHM already present and owned by this user,
// a read-only SQLite connection reads in place without creating, checkpointing or deleting sidecars.
// Copies are now named after the reading process (the isolated worker inherits it), and an allocation
// sweeps copies whose owner is gone and that are older than 10 minutes. See lab/cli-readonly-live.md.
//
// Source: vegekyd-sys/openclaw-versa versa/port-cli-readonly-live-20261109.

export const MARKER = 'cli-readonly-live';
export const READONLY = 'openclaw-state-db-readonly-C7txILW9.js';
export const LOCATION = 'sqlite-readonly-location-BvtpsFvn.js';
export const READONLY_BEFORE_SHA = '07b28e2250c72330dd7b6b66a6551467d6be7fb4af77afc98f6ce641400168c7';
export const LOCATION_BEFORE_SHA = '4a17b3a10208d892d859cc9497a753d3c766f9d35d38bd01a83d711a8f6c346f';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const READONLY_EDITS = [
  ['import { statSync } from "node:fs";\n', `import { closeSync, lstatSync, openSync, readSync, statSync } from "node:fs";\n`],
  ['/** Read existing shared state without creating or updating its SQLite sidecars. */\n', `// ${MARKER}: read a live WAL in place when its sidecars already exist and belong to this user.
function isWalHeader(pathname) {
	const descriptor = openSync(pathname, "r");
	try {
		const header = Buffer.alloc(20);
		return readSync(descriptor, header, 0, header.length, 0) === header.length && header.subarray(0, 16).toString("utf8") === "SQLite format 3\\0" && header[18] === 2 && header[19] === 2;
	} finally {
		closeSync(descriptor);
	}
}
/**
* A live WAL database whose -wal and -shm already exist and belong to this user
* is read through SQLite's own reader protocol. A read-only connection uses the
* existing sidecars, never checkpoints, and leaves them in place on close, so
* nothing new appears beside the source. Copying instead costs the whole
* database per read and starts over whenever a writer appends to the WAL
* mid-copy (a live Gateway does), which made each CLI Gateway call copy the
* shared state several times. Missing sidecars, another owner, or rollback
* journals keep the private snapshot. OPENCLAW_V_LIVE_WAL_READS=0 restores it.
*/
function canReadLiveWalWithoutNewSidecars(pathname) {
	if (process.env.OPENCLAW_V_LIVE_WAL_READS === "0") return false;
	const uid = process.geteuid?.();
	if (uid === void 0) return false;
	try {
		for (const file of [
			pathname,
			\`\${pathname}-wal\`,
			\`\${pathname}-shm\`
		]) {
			const stat = lstatSync(file);
			if (!stat.isFile() || stat.uid !== uid) return false;
		}
		if (existingPathOrUndefined(\`\${pathname}-journal\`) !== void 0) return false;
		return isWalHeader(pathname);
	} catch {
		return false;
	}
}
/** Read existing shared state without creating or updating its SQLite sidecars. */
`],
  ['\tconst prepared = (openClawStateDatabaseCache.getOpenClawStateDatabaseIfOpenAtPath(resolveReadOnlyPath(options)) ? prepareSqliteReadOnlyLocationSync : prepareSqliteReadOnlyLocationSyncInProcess)(existingPath);\n', `\tconst writerOpen = openClawStateDatabaseCache.getOpenClawStateDatabaseIfOpenAtPath(resolveReadOnlyPath(options));
	if (!writerOpen && canReadLiveWalWithoutNewSidecars(existingPath)) return withFreshOpenClawStateDatabaseReadOnly(operation, {
		...options,
		path: existingPath
	}, existingPath);
	const prepared = (writerOpen ? prepareSqliteReadOnlyLocationSync : prepareSqliteReadOnlyLocationSyncInProcess)(existingPath);
`],
];

const LOCATION_EDITS = [
  ['const SQLITE_SNAPSHOT_STAGING_PREFIX = `openclaw-sqlite-readonly-${process.pid}-`;\n', `// ${MARKER}: snapshot directories carry the reading process's pid; abandoned ones are swept.
const SQLITE_SNAPSHOT_OWNER_ENV = "OPENCLAW_SQLITE_SNAPSHOT_OWNER_PID";
const SQLITE_SNAPSHOT_OWNER_PID = resolveSnapshotOwnerPid();
const SQLITE_SNAPSHOT_STAGING_PREFIX = \`openclaw-sqlite-readonly-\${SQLITE_SNAPSHOT_OWNER_PID}-\`;
const SQLITE_SNAPSHOT_DIRECTORY_PATTERN = /^openclaw-sqlite-readonly-(\\d+)-[^/\\\\]+$/u;
const ABANDONED_SNAPSHOT_MIN_AGE_MS = 10 * 6e4;
const sweptStagingRoots = /* @__PURE__ */ new Set();
`],
  ['function statIfPresent(pathname) {\n', `function resolveSnapshotOwnerPid() {
	const inherited = Number(process.env[SQLITE_SNAPSHOT_OWNER_ENV]);
	return Number.isSafeInteger(inherited) && inherited > 0 ? inherited : process.pid;
}
function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
/**
* Snapshot cleanup runs in-process, so SIGKILL, OOM or a timeout leaves the
* copy behind (a whole state database each). Once per staging root and
* process, remove copies whose owner is gone and that nobody touched recently.
*/
function sweepAbandonedSnapshotDirectories(stagingRoot) {
	if (sweptStagingRoots.has(stagingRoot)) return;
	sweptStagingRoots.add(stagingRoot);
	let entries;
	try {
		entries = fs.readdirSync(stagingRoot);
	} catch {
		return;
	}
	const uid = process.geteuid?.();
	const now = Date.now();
	for (const name of entries) {
		const owner = Number(SQLITE_SNAPSHOT_DIRECTORY_PATTERN.exec(name)?.[1]);
		if (!Number.isSafeInteger(owner) || owner <= 0 || owner === SQLITE_SNAPSHOT_OWNER_PID) continue;
		const directory = path.join(stagingRoot, name);
		try {
			const stat = fs.lstatSync(directory);
			if (!stat.isDirectory() || uid !== void 0 && stat.uid !== uid || now - stat.mtimeMs < ABANDONED_SNAPSHOT_MIN_AGE_MS || isProcessAlive(owner)) continue;
			fs.rmSync(directory, {
				force: true,
				recursive: true
			});
		} catch {}
	}
}
function snapshotWorkerEnv() {
	return {
		...process.env,
		[SQLITE_SNAPSHOT_OWNER_ENV]: String(SQLITE_SNAPSHOT_OWNER_PID)
	};
}
function statIfPresent(pathname) {
`],
  ['\ttry {\n\t\ttempDir ??= createPrivateSqliteTempDirectorySync(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);\n', `\ttry {
		if (!tempDir) sweepAbandonedSnapshotDirectories(stagingRoot);
		tempDir ??= createPrivateSqliteTempDirectorySync(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);
`],
  ['\tconst stagingRoot = resolvePrivateSqliteSnapshotStagingRoot();\n\ttry {\n\t\treturn await createPrivateSqliteTempDirectory(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);\n', `\tconst stagingRoot = resolvePrivateSqliteSnapshotStagingRoot();
	sweepAbandonedSnapshotDirectories(stagingRoot);
	try {
		return await createPrivateSqliteTempDirectory(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);
`],
  ['\t\t], { encoding: "utf8" }, (error, stdout, stderr) => {\n', `\t\t], {
			encoding: "utf8",
			env: snapshotWorkerEnv()
		}, (error, stdout, stderr) => {
`],
  ['\t\tpath.resolve(pathname)\n\t], { encoding: "utf8" });\n', `\t\tpath.resolve(pathname)
	], {
		encoding: "utf8",
		env: snapshotWorkerEnv()
	});
`],
];

const apply = (source, edits, label) => {
  if (source.includes(MARKER)) throw new Error(`${label} is already patched`);
  return edits.reduce((text, [before, after]) => {
    if (text.split(before).length !== 2) throw new Error(`${label}: expected one match for ${JSON.stringify(before.slice(0, 60))}`);
    return text.replace(before, () => after);
  }, source);
};
const revert = (source, edits, label) => [...edits].reverse().reduce((text, [before, after]) => {
  if (text.split(after).length !== 2) throw new Error(`${label}: expected one patched block ${JSON.stringify(after.slice(0, 60))}`);
  return text.replace(after, () => before);
}, source);

export const patchReadonly = (source) => apply(source, READONLY_EDITS, READONLY);
export const unpatchReadonly = (source) => revert(source, READONLY_EDITS, READONLY);
export const patchLocation = (source) => apply(source, LOCATION_EDITS, LOCATION);
export const unpatchLocation = (source) => revert(source, LOCATION_EDITS, LOCATION);
