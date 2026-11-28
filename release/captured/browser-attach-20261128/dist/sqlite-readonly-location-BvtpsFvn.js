import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { s as resolveRequiredOsHomeDir } from "./home-dir-BPhrG-aM.js";
import { I as sameFileIdentity } from "./fs-safe-Cdu9fYG_.js";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-DnyL0lW9.js";
import { a as resolveSqliteFilesystemPath, n as requireNodeSqlite, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import { t as runtimeProcessEntrypoints } from "./runtime-process-entrypoints-DEjFGor2.js";
import { n as resolveRuntimeWorkerUrl, t as resolveRuntimeWorkerArgv } from "./runtime-worker-url-DJUUt97T.js";
import { t as resolveSystemBin } from "./resolve-system-bin-CzPVYNl7.js";
import { n as decodeWindowsOutputBuffer } from "./windows-encoding-DvBW57G0.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
//#region src/infra/windows-powershell-spawn.ts
const WINDOWS_POWERSHELL_COLD_SPAWN_TIMEOUT_MS = 6e4;
function sanitizePowerShellOutputText(text) {
	return truncateUtf16Safe(text.split(/\r?\n/u).filter((line) => !line.toLowerCase().includes("encodedcommand")).join("\n").trim(), 1e3);
}
function buildPowerShellFailureCause(error) {
	const failure = error && typeof error === "object" ? error : {};
	const status = [
		typeof failure.status === "number" ? `status=${failure.status}` : "",
		typeof failure.code === "number" ? `exit=${failure.code}` : typeof failure.code === "string" ? `code=${failure.code}` : "",
		typeof failure.killed === "boolean" ? `killed=${failure.killed}` : "",
		typeof failure.signal === "string" ? `signal=${failure.signal}` : ""
	].filter(Boolean);
	const stderr = typeof failure.stderr === "string" ? sanitizePowerShellOutputText(failure.stderr) : "";
	const stdout = typeof failure.stdout === "string" ? sanitizePowerShellOutputText(failure.stdout) : "";
	const detail = stderr ? `stderr: ${stderr}` : stdout ? `stdout: ${stdout}` : "";
	return /* @__PURE__ */ new Error(`PowerShell failed${status.length ? ` (${status.join(", ")})` : ""}${detail ? `; ${detail}` : ""}`);
}
function buildEncodedPowerShellArgs(command) {
	return [
		"-NoLogo",
		"-NoProfile",
		"-NonInteractive",
		"-EncodedCommand",
		Buffer.from(command, "utf16le").toString("base64")
	];
}
//#endregion
//#region src/infra/sqlite-private-directory.ts
const SQLITE_DIRECTORY_MODE = 448;
const WINDOWS_DIRECTORY_EXISTS_MARKER = "OPENCLAW_SQLITE_DIRECTORY_EXISTS";
const WINDOWS_PRIVATE_DIRECTORY_NATIVE_SOURCE = `
using System;
using System.Runtime.InteropServices;

public static class OpenClawPrivateDirectory
{
    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr SecurityDescriptor;
        public int InheritHandle;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(
        string securityDescriptor,
        uint revision,
        out IntPtr convertedSecurityDescriptor,
        out uint convertedSecurityDescriptorSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateDirectoryW(
        string path,
        ref SecurityAttributes securityAttributes);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static int Create(string path, string securityDescriptor)
    {
        IntPtr descriptor;
        uint descriptorSize;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
                securityDescriptor,
                1,
                out descriptor,
                out descriptorSize))
        {
            return Marshal.GetLastWin32Error();
        }

        try
        {
            var attributes = new SecurityAttributes
            {
                Length = Marshal.SizeOf(typeof(SecurityAttributes)),
                SecurityDescriptor = descriptor,
                InheritHandle = 0,
            };
            return CreateDirectoryW(path, ref attributes) ? 0 : Marshal.GetLastWin32Error();
        }
        finally
        {
            LocalFree(descriptor);
        }
    }
}
`;
function failureText(value) {
	return sanitizePowerShellOutputText(Buffer.isBuffer(value) ? decodeWindowsOutputBuffer({ buffer: value }) : typeof value === "string" ? value : "");
}
function privateDirectoryError(directoryPath, error, stdout, stderr) {
	const failure = error && typeof error === "object" ? error : {};
	if ([
		error,
		stderr,
		stdout,
		failure.stderr,
		failure.stdout
	].some((value) => String(value).includes(WINDOWS_DIRECTORY_EXISTS_MARKER))) {
		const existsError = /* @__PURE__ */ new Error(`Private SQLite directory already exists: ${directoryPath}`);
		existsError.code = "EEXIST";
		return existsError;
	}
	const cause = buildPowerShellFailureCause({
		status: failure.status,
		code: failure.code,
		killed: failure.killed,
		signal: failure.signal,
		stderr: failureText(stderr) || failureText(failure.stderr),
		stdout: failureText(stdout) || failureText(failure.stdout)
	});
	return new Error(`Unable to create private Windows SQLite directory: ${directoryPath}`, { cause });
}
function runPrivateDirectoryPowerShell(directoryPath, powershell, args) {
	return new Promise((resolve, reject) => {
		execFile(powershell, args, {
			encoding: "buffer",
			maxBuffer: 65536,
			timeout: WINDOWS_POWERSHELL_COLD_SPAWN_TIMEOUT_MS,
			windowsHide: true
		}, (error, stdout, stderr) => {
			if (error) {
				reject(privateDirectoryError(directoryPath, error, stdout, stderr));
				return;
			}
			resolve();
		});
	});
}
function resolvePrivateDirectoryPowerShell(directoryPath) {
	const nativeDirectoryPath = path.toNamespacedPath(path.resolve(directoryPath));
	const encodedPath = Buffer.from(nativeDirectoryPath, "utf8").toString("base64");
	const encodedNativeSource = Buffer.from(WINDOWS_PRIVATE_DIRECTORY_NATIVE_SOURCE, "utf8").toString("base64");
	const command = [
		"$ErrorActionPreference = 'Stop'",
		`$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))`,
		`$nativeSource = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedNativeSource}'))`,
		"Add-Type -TypeDefinition $nativeSource -Language CSharp",
		"$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User",
		"$security = New-Object System.Security.AccessControl.DirectorySecurity",
		"$security.SetAccessRuleProtection($true, $false)",
		"$security.SetOwner($current)",
		"$inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit",
		"$propagation = [System.Security.AccessControl.PropagationFlags]::None",
		"foreach ($sidValue in @($current.Value, 'S-1-5-18', 'S-1-5-32-544')) { $sid = New-Object System.Security.Principal.SecurityIdentifier($sidValue); $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, $propagation, [System.Security.AccessControl.AccessControlType]::Allow); [void]$security.AddAccessRule($rule) }",
		"$sections = [System.Security.AccessControl.AccessControlSections]::Owner -bor [System.Security.AccessControl.AccessControlSections]::Access",
		"$sddl = $security.GetSecurityDescriptorSddlForm($sections)",
		"$errorCode = [OpenClawPrivateDirectory]::Create($path, $sddl)",
		`if ($errorCode -eq 80 -or $errorCode -eq 183) { throw '${WINDOWS_DIRECTORY_EXISTS_MARKER}' }`,
		"if ($errorCode -ne 0) { $exception = New-Object System.ComponentModel.Win32Exception($errorCode); throw $exception }"
	].join("; ");
	const powershell = resolveSystemBin("powershell");
	if (!powershell) throw new Error("Unable to resolve PowerShell for private Windows SQLite staging.");
	return {
		powershell,
		args: buildEncodedPowerShellArgs(command)
	};
}
async function createPrivateSqliteDirectory(directoryPath) {
	if (process.platform !== "win32") {
		await fs$1.mkdir(directoryPath, { mode: SQLITE_DIRECTORY_MODE });
		return;
	}
	const { args, powershell } = resolvePrivateDirectoryPowerShell(directoryPath);
	await runPrivateDirectoryPowerShell(directoryPath, powershell, args);
}
function createPrivateSqliteDirectorySync(directoryPath) {
	if (process.platform !== "win32") {
		fs.mkdirSync(directoryPath, { mode: SQLITE_DIRECTORY_MODE });
		return;
	}
	const { args, powershell } = resolvePrivateDirectoryPowerShell(directoryPath);
	try {
		execFileSync(powershell, args, {
			maxBuffer: 65536,
			timeout: WINDOWS_POWERSHELL_COLD_SPAWN_TIMEOUT_MS,
			windowsHide: true
		});
	} catch (error) {
		throw privateDirectoryError(directoryPath, error);
	}
}
function resolvePrivateSqliteSnapshotStagingRoot() {
	const appData = process.platform === "win32" ? process.env.LOCALAPPDATA?.trim() : void 0;
	const defaultRoot = process.platform === "win32" ? "AppData/Local" : ".cache";
	const platformRoot = process.platform === "darwin" ? "Library/Caches" : defaultRoot;
	const cacheRoot = [process.env.XDG_CACHE_HOME?.trim(), appData].find((root) => root && path.isAbsolute(root)) ?? path.join(resolveRequiredOsHomeDir(), platformRoot);
	return resolvePreferredOpenClawTmpDir({
		preferredDir: path.join(cacheRoot, "openclaw"),
		tmpdir: () => cacheRoot
	});
}
async function createPrivateSqliteTempDirectory(rootPath, prefix) {
	if (process.platform !== "win32") return await fs$1.mkdtemp(path.join(rootPath, prefix));
	const directoryPath = path.join(rootPath, `${prefix}${randomUUID()}`);
	await createPrivateSqliteDirectory(directoryPath);
	return directoryPath;
}
function createPrivateSqliteTempDirectorySync(rootPath, prefix) {
	if (process.platform !== "win32") return fs.mkdtempSync(path.join(rootPath, prefix));
	const directoryPath = path.join(rootPath, `${prefix}${randomUUID()}`);
	createPrivateSqliteDirectorySync(directoryPath);
	return directoryPath;
}
//#endregion
//#region src/infra/sqlite-readonly-location.ts
const MAX_SNAPSHOT_ATTEMPTS = 10;
const COPY_BUFFER_BYTES = 1048576;
const SQLITE_HEADER_BYTES = 20;
const SQLITE_READONLY_RESULT_CODE = 8;
const SQLITE_RESULT_CODE_MASK = 255;
const SQLITE_JOURNAL_MAGIC = Buffer.from([
	217,
	213,
	5,
	249,
	32,
	161,
	99,
	215
]);
// cli-readonly-live: snapshot directories carry the reading process's pid; abandoned ones are swept.
const SQLITE_SNAPSHOT_OWNER_ENV = "OPENCLAW_SQLITE_SNAPSHOT_OWNER_PID";
const SQLITE_SNAPSHOT_OWNER_PID = resolveSnapshotOwnerPid();
const SQLITE_SNAPSHOT_STAGING_PREFIX = `openclaw-sqlite-readonly-${SQLITE_SNAPSHOT_OWNER_PID}-`;
const SQLITE_SNAPSHOT_DIRECTORY_PATTERN = /^openclaw-sqlite-readonly-(\d+)-[^/\\]+$/u;
const ABANDONED_SNAPSHOT_MIN_AGE_MS = 10 * 6e4;
const sweptStagingRoots = /* @__PURE__ */ new Set();
const SQLITE_READONLY_CHILD_ARG = "--openclaw-sqlite-readonly-child";
const pendingTempDirectoryCleanup = /* @__PURE__ */ new Set();
let cleanupExitHandlerInstalled = false;
var SqliteSourceChangedError = class extends Error {};
function sqliteSnapshotStagingError(tempDir, cause, allocation = false) {
	for (let depth = 0, error = cause; depth < 8 && error instanceof Error; depth += 1) {
		const { code, errcode, path: errorPath } = error;
		if (allocation || ["ENOSPC", "EDQUOT"].includes(code ?? "") || typeof errcode === "number" && [
			13,
			778,
			1034,
			1290
		].includes(errcode) || `${errorPath ?? ""}${path.sep}`.startsWith(`${tempDir}${path.sep}`)) {
			const message = `${cause instanceof Error ? cause.message : String(cause)}${typeof errcode === "number" ? ` (SQLite errcode=${errcode})` : ""}; snapshot staging root ${allocation ? tempDir : path.dirname(tempDir)}: free disk space/quota or set XDG_CACHE_HOME to a writable filesystem`;
			return new Error(message, { cause });
		}
		error = error.cause;
	}
	return cause;
}
function resolveSnapshotOwnerPid() {
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
	try {
		return fs.statSync(pathname, { bigint: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
}
function readSourceSidecars(pathname) {
	return {
		journal: Boolean(statIfPresent(`${pathname}-journal`)),
		shm: Boolean(statIfPresent(`${pathname}-shm`)),
		wal: Boolean(statIfPresent(`${pathname}-wal`))
	};
}
function sameSidecars(left, right) {
	return left.journal === right.journal && left.shm === right.shm && left.wal === right.wal;
}
function openPinnedFile(pathname) {
	let descriptor;
	try {
		descriptor = fs.openSync(pathname, "r");
	} catch (error) {
		if (error.code === "ENOENT") throw new SqliteSourceChangedError(`SQLite source disappeared: ${pathname}`);
		throw error;
	}
	try {
		const identity = fs.fstatSync(descriptor, { bigint: true });
		const current = statIfPresent(pathname);
		if (!identity.isFile() || !current?.isFile() || !sameFileIdentity(identity, current)) throw new SqliteSourceChangedError(`SQLite source changed while opening: ${pathname}`);
		return {
			descriptor,
			identity,
			pathname
		};
	} catch (error) {
		fs.closeSync(descriptor);
		throw error;
	}
}
function readSourceJournalMode(pathname) {
	const source = openPinnedFile(pathname);
	try {
		const header = Buffer.alloc(SQLITE_HEADER_BYTES);
		const bytesRead = fs.readSync(source.descriptor, header, 0, header.length, 0);
		const confirmedHeader = Buffer.alloc(SQLITE_HEADER_BYTES);
		const confirmedBytesRead = fs.readSync(source.descriptor, confirmedHeader, 0, confirmedHeader.length, 0);
		assertPinnedIdentityUnchanged(source);
		if (bytesRead === 0 && confirmedBytesRead === 0) return "empty";
		if (bytesRead !== header.length || confirmedBytesRead !== confirmedHeader.length || !header.equals(confirmedHeader) || header.subarray(0, 16).toString("utf8") !== "SQLite format 3\0") return "unknown";
		return header[18] === 2 || header[19] === 2 ? "wal" : "rollback";
	} finally {
		fs.closeSync(source.descriptor);
	}
}
function assertPinnedIdentityUnchanged(file) {
	const opened = fs.fstatSync(file.descriptor, { bigint: true });
	const current = statIfPresent(file.pathname);
	if (!opened.isFile() || !current?.isFile() || !sameFileIdentity(file.identity, opened) || !sameFileIdentity(file.identity, current)) throw new SqliteSourceChangedError(`SQLite source changed while copying: ${file.pathname}`);
}
function copyPinnedFile(source, targetPath) {
	let target;
	try {
		target = fs.openSync(targetPath, "wx", 384);
		const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
		let offset = 0;
		while (true) {
			const bytesRead = fs.readSync(source.descriptor, buffer, 0, buffer.length, offset);
			if (bytesRead === 0) break;
			let bytesWritten = 0;
			while (bytesWritten < bytesRead) {
				const count = fs.writeSync(target, buffer, bytesWritten, bytesRead - bytesWritten, offset + bytesWritten);
				if (count === 0) throw new Error(`SQLite read-only snapshot copy made no progress: ${targetPath}`);
				bytesWritten += count;
			}
			offset += bytesRead;
		}
		fs.fsyncSync(target);
		assertPinnedIdentityUnchanged(source);
	} finally {
		if (target !== void 0) fs.closeSync(target);
	}
}
function copySourceFile(sourcePath, targetPath) {
	const source = openPinnedFile(sourcePath);
	try {
		copyPinnedFile(source, targetPath);
	} finally {
		fs.closeSync(source.descriptor);
	}
}
function filesEqual(leftPath, rightPath) {
	const leftStat = fs.statSync(leftPath, { bigint: true });
	const rightStat = fs.statSync(rightPath, { bigint: true });
	if (!leftStat.isFile() || !rightStat.isFile() || leftStat.size !== rightStat.size) return false;
	const left = fs.openSync(leftPath, "r");
	const right = fs.openSync(rightPath, "r");
	try {
		const leftBuffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
		const rightBuffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
		let offset = 0;
		while (BigInt(offset) < leftStat.size) {
			const length = Math.min(COPY_BUFFER_BYTES, Number(leftStat.size - BigInt(offset)));
			const leftBytes = fs.readSync(left, leftBuffer, 0, length, offset);
			const rightBytes = fs.readSync(right, rightBuffer, 0, length, offset);
			if (leftBytes !== rightBytes || leftBytes !== length || !leftBuffer.subarray(0, leftBytes).equals(rightBuffer.subarray(0, rightBytes))) return false;
			offset += leftBytes;
		}
		return true;
	} finally {
		fs.closeSync(right);
		fs.closeSync(left);
	}
}
function assertExpectedSidecars(pathname, expected) {
	if (!sameSidecars(readSourceSidecars(pathname), expected)) throw new SqliteSourceChangedError(`SQLite journal state changed while copying: ${pathname}`);
}
function replaceFile(sourcePath, targetPath) {
	fs.rmSync(targetPath, { force: true });
	fs.renameSync(sourcePath, targetPath);
}
function isSqliteReadOnlyError(error) {
	let current = error;
	for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
		const details = current;
		if (typeof details.errcode === "number" && (details.errcode & SQLITE_RESULT_CODE_MASK) === SQLITE_READONLY_RESULT_CODE) return true;
		current = details.cause;
	}
	return false;
}
function rollbackJournalReferencesSuperJournal(journalPath) {
	const descriptor = fs.openSync(journalPath, "r");
	try {
		const size = fs.fstatSync(descriptor).size;
		if (size < 16) return false;
		const trailer = Buffer.allocUnsafe(16);
		if (fs.readSync(descriptor, trailer, 0, trailer.length, size - trailer.length) !== trailer.length) return false;
		const nameBytes = trailer.readUInt32BE(0);
		return nameBytes > 0 && nameBytes <= size - 20 && trailer.subarray(8).equals(SQLITE_JOURNAL_MAGIC);
	} finally {
		fs.closeSync(descriptor);
	}
}
function removeTempDirectory(tempDir) {
	try {
		fs.rmSync(tempDir, {
			force: true,
			maxRetries: 3,
			recursive: true,
			retryDelay: 20
		});
		pendingTempDirectoryCleanup.delete(tempDir);
		return true;
	} catch {
		pendingTempDirectoryCleanup.add(tempDir);
		if (!cleanupExitHandlerInstalled) {
			cleanupExitHandlerInstalled = true;
			process.once("exit", () => {
				for (const pendingDir of pendingTempDirectoryCleanup) try {
					fs.rmSync(pendingDir, {
						force: true,
						recursive: true
					});
				} catch {}
			});
		}
		return false;
	}
}
function adoptPreparedLocation(location) {
	const tempDir = path.dirname(location);
	let active = true;
	return {
		location,
		cleanup: () => {
			if (!active) return true;
			const removed = removeTempDirectory(tempDir);
			if (removed) active = false;
			return removed;
		}
	};
}
function recoverPrivateRollbackCopy(snapshotPath) {
	if (rollbackJournalReferencesSuperJournal(`${snapshotPath}-journal`)) throw new Error(`SQLite hot rollback journal references a super-journal and cannot be recovered privately: ${snapshotPath}`);
	const snapshot = openNodeSqliteDatabase(snapshotPath);
	try {
		snapshot.exec("PRAGMA busy_timeout = 30000; PRAGMA trusted_schema = OFF;");
		snapshot.prepare("PRAGMA schema_version;").get();
	} finally {
		snapshot.close();
	}
	fs.rmSync(`${snapshotPath}-journal`, { force: true });
	const descriptor = fs.openSync(snapshotPath, "r+");
	try {
		fs.fsyncSync(descriptor);
	} finally {
		fs.closeSync(descriptor);
	}
}
function createStableReadOnlyCopyInTempDirectory(pathname, journalMode, existingTempDir) {
	let tempDir = existingTempDir;
	const stagingRoot = tempDir ? path.dirname(tempDir) : resolvePrivateSqliteSnapshotStagingRoot();
	try {
		if (!tempDir) sweepAbandonedSnapshotDirectories(stagingRoot);
		tempDir ??= createPrivateSqliteTempDirectorySync(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);
		const snapshotPath = path.join(tempDir, "database.sqlite");
		const firstPath = path.join(tempDir, "first");
		const secondPath = path.join(tempDir, "second");
		if (process.platform !== "win32") fs.chmodSync(tempDir, 448);
		if (readSourceJournalMode(pathname) !== journalMode) throw new SqliteSourceChangedError(`SQLite journal mode changed before copying: ${pathname}`);
		const sidecars = readSourceSidecars(pathname);
		if (sidecars.journal && sidecars.wal) throw new SqliteSourceChangedError(`SQLite journal modes overlapped: ${pathname}`);
		const sidecarSuffix = sidecars.journal ? "-journal" : sidecars.wal ? "-wal" : void 0;
		if (sidecarSuffix) {
			copySourceFile(`${pathname}${sidecarSuffix}`, firstPath);
			copySourceFile(pathname, snapshotPath);
			copySourceFile(`${pathname}${sidecarSuffix}`, secondPath);
			assertExpectedSidecars(pathname, sidecars);
			if (!filesEqual(firstPath, secondPath)) throw new SqliteSourceChangedError(`SQLite ${sidecarSuffix === "-wal" ? "WAL" : "rollback journal"} changed while copying: ${pathname}`);
			replaceFile(secondPath, `${snapshotPath}${sidecarSuffix}`);
		} else {
			copySourceFile(pathname, firstPath);
			assertExpectedSidecars(pathname, sidecars);
			copySourceFile(pathname, secondPath);
			assertExpectedSidecars(pathname, sidecars);
			if (!filesEqual(firstPath, secondPath)) throw new SqliteSourceChangedError(`SQLite main database changed while copying: ${pathname}`);
			replaceFile(secondPath, snapshotPath);
		}
		if (readSourceJournalMode(pathname) !== journalMode) throw new SqliteSourceChangedError(`SQLite journal mode changed while copying: ${pathname}`);
		fs.rmSync(firstPath, { force: true });
		if (sidecars.journal) recoverPrivateRollbackCopy(snapshotPath);
		return adoptPreparedLocation(snapshotPath);
	} catch (error) {
		if (tempDir) removeTempDirectory(tempDir);
		throw sqliteSnapshotStagingError(tempDir ?? stagingRoot, error, !tempDir);
	}
}
async function createSqliteSnapshotStagingDirectory() {
	const stagingRoot = resolvePrivateSqliteSnapshotStagingRoot();
	sweepAbandonedSnapshotDirectories(stagingRoot);
	try {
		return await createPrivateSqliteTempDirectory(stagingRoot, SQLITE_SNAPSHOT_STAGING_PREFIX);
	} catch (error) {
		throw sqliteSnapshotStagingError(stagingRoot, error, true);
	}
}
async function createStableReadOnlyCopy(pathname, journalMode) {
	return createStableReadOnlyCopyInTempDirectory(pathname, journalMode, await createSqliteSnapshotStagingDirectory());
}
async function createOnlineReadOnlyBackup(pathname) {
	const tempDir = await createSqliteSnapshotStagingDirectory();
	const snapshotPath = path.join(tempDir, "database.sqlite");
	const sqlite = requireNodeSqlite();
	try {
		if (process.platform !== "win32") fs.chmodSync(tempDir, 448);
		const source = openNodeSqliteDatabase(pathname, { readOnly: true });
		try {
			source.exec("PRAGMA busy_timeout = 30000; PRAGMA trusted_schema = OFF; BEGIN;");
			source.prepare("PRAGMA schema_version;").get();
			await sqlite.backup(source, resolveSqliteFilesystemPath(snapshotPath));
			source.exec("ROLLBACK;");
		} finally {
			if (source.isOpen) source.close();
		}
		const snapshot = openNodeSqliteDatabase(snapshotPath);
		try {
			snapshot.exec("PRAGMA journal_mode = DELETE;");
		} finally {
			snapshot.close();
		}
		const descriptor = fs.openSync(snapshotPath, "r+");
		try {
			fs.fsyncSync(descriptor);
		} finally {
			fs.closeSync(descriptor);
		}
		return adoptPreparedLocation(snapshotPath);
	} catch (error) {
		removeTempDirectory(tempDir);
		throw sqliteSnapshotStagingError(tempDir, error);
	}
}
/**
* Active rollback and WAL state use SQLite's locking and backup protocol.
* Crash residue that cannot be opened read-only is copied and recovered
* privately so inspection never mutates coordination files beside the source.
* The InProcess exports are child-only: POSIX close() can release every lock
* the calling process holds on the same source inode.
*/
async function prepareSqliteReadOnlyLocationInProcess(pathname) {
	const canonicalPath = fs.realpathSync.native(pathname);
	let lastChange;
	for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
		let journalMode;
		try {
			journalMode = readSourceJournalMode(canonicalPath);
		} catch (error) {
			if (!(error instanceof SqliteSourceChangedError)) throw error;
			lastChange = error;
			continue;
		}
		if (journalMode === "empty") try {
			return await createStableReadOnlyCopy(canonicalPath, journalMode);
		} catch (error) {
			if (!(error instanceof SqliteSourceChangedError)) throw error;
			lastChange = error;
			continue;
		}
		const sidecars = readSourceSidecars(canonicalPath);
		if (journalMode !== "wal" || sidecars.wal && sidecars.shm) try {
			return await createOnlineReadOnlyBackup(canonicalPath);
		} catch (error) {
			let currentMode;
			try {
				currentMode = readSourceJournalMode(canonicalPath);
			} catch (inspectionError) {
				if (!(inspectionError instanceof SqliteSourceChangedError)) throw inspectionError;
				lastChange = inspectionError;
				continue;
			}
			const currentSidecars = readSourceSidecars(canonicalPath);
			if (currentMode === "rollback" && currentSidecars.journal) {
				if (!isSqliteReadOnlyError(error)) throw error;
				try {
					return await createStableReadOnlyCopy(canonicalPath, "rollback");
				} catch (copyError) {
					if (!(copyError instanceof SqliteSourceChangedError)) throw copyError;
					lastChange = copyError;
					continue;
				}
			}
			if (currentMode !== "wal" || currentSidecars.wal && currentSidecars.shm) throw error;
			lastChange = error instanceof Error ? error : new Error(String(error));
			continue;
		}
		try {
			return await createStableReadOnlyCopy(canonicalPath, "wal");
		} catch (error) {
			if (!(error instanceof SqliteSourceChangedError)) throw error;
			lastChange = error;
		}
	}
	throw new Error(`SQLite source did not stabilize for read-only inspection: ${canonicalPath}`, { cause: lastChange });
}
function prepareSqliteReadOnlyLocationSyncInProcess(pathname) {
	const canonicalPath = fs.realpathSync.native(pathname);
	let lastChange;
	for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
		let journalMode;
		try {
			journalMode = readSourceJournalMode(canonicalPath);
		} catch (error) {
			if (!(error instanceof SqliteSourceChangedError)) throw error;
			lastChange = error;
			continue;
		}
		if (journalMode === "unknown") {
			lastChange = new SqliteSourceChangedError(`SQLite journal mode is unavailable while copying: ${canonicalPath}`);
			continue;
		}
		try {
			return createStableReadOnlyCopyInTempDirectory(canonicalPath, journalMode);
		} catch (error) {
			if (!(error instanceof SqliteSourceChangedError)) throw error;
			lastChange = error;
		}
	}
	throw new Error(`SQLite source did not stabilize for read-only inspection: ${canonicalPath}`, { cause: lastChange });
}
function isSqliteReadOnlyWorkerResult(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	if (Object.keys(value).length !== 2 || !("ok" in value)) return false;
	return value.ok === true && "location" in value && typeof value.location === "string" || value.ok === false && "message" in value && typeof value.message === "string";
}
function createSqliteReadOnlyWorkerError(message, stderr) {
	const stderrTail = stderr.trim().slice(-4e3);
	return /* @__PURE__ */ new Error(`SQLite read-only worker ${message}${stderrTail ? `\nstderr (tail): ${stderrTail}` : ""}`);
}
function parseSqliteReadOnlyWorkerResult(stdout, stderr) {
	if (!stdout.trim()) throw createSqliteReadOnlyWorkerError("returned no JSON result", stderr);
	let message;
	try {
		message = JSON.parse(stdout);
	} catch {
		throw createSqliteReadOnlyWorkerError("returned invalid JSON", stderr);
	}
	if (!isSqliteReadOnlyWorkerResult(message)) throw createSqliteReadOnlyWorkerError("returned an invalid result", stderr);
	return message;
}
function adoptSqliteReadOnlyWorkerResult(params) {
	let result;
	try {
		result = parseSqliteReadOnlyWorkerResult(params.stdout, params.stderr);
	} catch (error) {
		if (params.failure) throw createSqliteReadOnlyWorkerError(params.failure, params.stderr);
		throw error;
	}
	if (params.failure || !result.ok) throw createSqliteReadOnlyWorkerError(!result.ok ? result.message : params.failure ?? "failed", params.stderr);
	return adoptPreparedLocation(result.location);
}
async function prepareSqliteReadOnlyLocation(pathname) {
	const workerUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sqliteReadOnly);
	return await new Promise((resolve, reject) => {
		execFile(process.execPath, [
			...resolveRuntimeWorkerArgv(workerUrl),
			SQLITE_READONLY_CHILD_ARG,
			"async",
			path.resolve(pathname)
		], {
			encoding: "utf8",
			env: snapshotWorkerEnv()
		}, (error, stdout, stderr) => {
			try {
				resolve(adoptSqliteReadOnlyWorkerResult({
					failure: error ? `exited unsuccessfully: ${error.message}` : void 0,
					stderr,
					stdout
				}));
			} catch (workerError) {
				reject(workerError instanceof Error ? workerError : new Error(String(workerError)));
			}
		});
	});
}
function prepareSqliteReadOnlyLocationSync(pathname) {
	const workerUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sqliteReadOnly);
	const result = spawnSync(process.execPath, [
		...resolveRuntimeWorkerArgv(workerUrl),
		SQLITE_READONLY_CHILD_ARG,
		"sync",
		path.resolve(pathname)
	], {
		encoding: "utf8",
		env: snapshotWorkerEnv()
	});
	return adoptSqliteReadOnlyWorkerResult({
		failure: result.error ? `failed to start: ${result.error.message}` : result.status === 0 ? void 0 : `exited with ${result.signal ? `signal ${result.signal}` : `code ${result.status}`}`,
		stderr: result.stderr,
		stdout: result.stdout
	});
}
async function prepareSqliteSnapshotSource(pathname) {
	const canonicalPath = fs.realpathSync.native(pathname);
	const journalPath = `${canonicalPath}-journal`;
	let journal;
	try {
		journal = fs.lstatSync(journalPath, { bigint: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (!journal.isFile()) throw new Error(`SQLite rollback journal must be a regular file: ${journalPath}`);
	return await prepareSqliteReadOnlyLocation(canonicalPath);
}
async function withSqliteSnapshotSource(pathname, operation) {
	let prepared = await prepareSqliteSnapshotSource(pathname);
	try {
		try {
			return await operation(prepared?.location ?? pathname);
		} catch (error) {
			if (prepared) throw error;
			prepared = await prepareSqliteSnapshotSource(pathname);
			if (!prepared) throw error;
			return await operation(prepared.location);
		}
	} finally {
		prepared?.cleanup();
	}
}
//#endregion
export { prepareSqliteReadOnlyLocationSyncInProcess as a, createPrivateSqliteTempDirectory as c, buildEncodedPowerShellArgs as d, buildPowerShellFailureCause as f, prepareSqliteReadOnlyLocationSync as i, createPrivateSqliteTempDirectorySync as l, prepareSqliteReadOnlyLocation as n, withSqliteSnapshotSource as o, prepareSqliteReadOnlyLocationInProcess as r, createPrivateSqliteDirectory as s, SQLITE_READONLY_CHILD_ARG as t, WINDOWS_POWERSHELL_COLD_SPAWN_TIMEOUT_MS as u };
