// Carry DB91 verification receipts across a clean Gateway restart on the same host boot.
//
// Within one Gateway lifecycle a completed full check is reused by every process until it is
// revoked or 26 h old (db91-integrity-gate.mjs). A restart starts a new lifecycle, and the
// preflight then re-reads every agent database in full before admission (V: 22 GB, ~110 s,
// evicting the page cache the new Workers need). A receipt is carried into the new lifecycle
// only when the previous lifecycle would itself still have reused it at this moment:
//   - same kernel boot (no host crash or reboot in between),
//   - the previous Gateway wrote clean-exit.json (exit code 0; a crash, SIGKILL or OOM never does),
//   - same format/epoch, fence equal to that lifecycle's current revocation markers,
//     checkedAt within MAX_AGE_MS, never refreshed here,
//   - the same file identity now: path, device, inode, birth time, owner, user_version,
//     schema cookie and schema hash, and no unexplained shrink.
// Anything else is checked in full before admission, exactly as before. The native delayed
// verifier (5 min after start, then daily) still checks every database in full and refreshes
// carried receipts. On whenever the DB91 gate is on; OPENCLAW_DB91_RESTART_CARRY=0 turns it off
// (every restart then checks every database in full, as before).
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {FORMAT, MAX_AGE_MS, readDatabaseIdentity, shrunkBySqlite, publishVerificationProof} from './db91-integrity-gate.mjs';

export const LIFECYCLE_FORMAT = 'openclaw-db91-lifecycle-v1';
const POINTER = 'last-lifecycle.json';
const HASH = value => createHash('sha256').update(value).digest('hex');
const EPOCH = /^[a-f0-9-]{32,64}$/;

function readOwnedJson(filename) {
  let fd;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) return null;
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ELOOP'].includes(error.code) || error instanceof SyntaxError) return null;
    throw error;
  } finally {if (fd !== undefined) fs.closeSync(fd);}
}

function atomicJson(filename, value) {
  const temporary = filename + '.' + process.pid + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(value) + '\n', {mode: 0o600, flag: 'wx'});
    fs.renameSync(temporary, filename);
  } finally {
    try {fs.unlinkSync(temporary);} catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
}

export function readBootId(file = '/proc/sys/kernel/random/boot_id') {
  try {
    const id = fs.readFileSync(file, 'utf8').trim();
    return /^[a-f0-9-]{32,40}$/.test(id) ? id : null;
  } catch {return null;}
}

function privateDirectory(directory) {
  const stat = fs.lstatSync(directory);
  return stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(directory) === directory && !(stat.mode & 0o077) && (!process.getuid || stat.uid === process.getuid());
}

// Same marker rule as the gate: a revocation marker that exists but cannot be read stops reuse.
function readMarker(filename) {
  const marker = readOwnedJson(filename);
  if (!marker) {
    if (fs.existsSync(filename)) throw new Error('Invalid database verification revocation marker');
    return 'none';
  }
  if (marker.format !== FORMAT || typeof marker.nonce !== 'string') throw new Error('Invalid database verification revocation marker');
  return marker.nonce;
}

// Wall-clock start of a live process, from /proc (Linux); null when unknown, undefined when gone.
export function processStartedAt(pid) {
  try {process.kill(pid, 0);} catch (error) {if (error.code !== 'EPERM') return undefined;}
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
    const btime = Number(/^btime (\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf8'))?.[1]);
    return Number.isFinite(ticks) && Number.isFinite(btime) ? btime * 1000 + ticks * 10 : null; // USER_HZ 100 on Linux
  } catch {return null;}
}

// The Gateway process that owns a recorded lifecycle, if it is still running: same boot, the
// recorded pid alive, and that process started before it recorded the lifecycle (a reused pid
// started later). Without /proc the pid being alive is taken as the owner.
function liveOwner(lifecycle, bootId, {startedAt = processStartedAt} = {}) {
  if (lifecycle?.format !== LIFECYCLE_FORMAT || !Number.isSafeInteger(lifecycle.pid) || lifecycle.pid <= 0 || typeof lifecycle.startedAt !== 'number') return null;
  if (bootId && lifecycle.bootId && lifecycle.bootId !== bootId) return null;
  const started = startedAt(lifecycle.pid);
  if (started === undefined) return null;
  if (started !== null && (started > lifecycle.startedAt + 2000 || started < lifecycle.startedAt - 3_600_000)) return null;
  return lifecycle.pid;
}

// Processes started by a running Gateway -- OpenClaw exec commands, Workers, the database verifier --
// inherit OPENCLAW_DB91_INTEGRITY_EPOCH/DIR. If one of them is itself `index.js gateway ...` (on
// 2026-11-26 an agent ran the unit's command line twice through exec), it belongs to that lifecycle:
// it must not start one, re-check every database, or move last-lifecycle.json off the running Gateway,
// or the next clean restart finds no clean previous lifecycle and checks everything in full.
// Returns the inherited lifecycle when its owner is a different, live process that is not this
// process's parent; null otherwise. A direct child of the owner may be the successor OpenClaw itself
// spawns (an unsupervised update restart; its entry path can be rewritten, so the command line does
// not identify it): it starts its own lifecycle alongside the owner's (beginLifecycle), and a crash
// of it or a revocation in it stops the next restart from carrying the owner's receipts.
export function inheritedLifecycle({base, env = process.env, pid = process.pid, ppid = process.ppid, bootId = readBootId(), startedAt = processStartedAt}) {
  const epoch = env.OPENCLAW_DB91_INTEGRITY_EPOCH;
  if (!EPOCH.test(epoch ?? '')) return null;
  const directory = path.join(base, epoch);
  if (env.OPENCLAW_DB91_INTEGRITY_DIR !== directory) return null;
  try {
    if (!privateDirectory(directory)) return null;
    const lifecycle = readOwnedJson(path.join(directory, 'lifecycle.json'));
    if (lifecycle?.epoch !== epoch) return null;
    const owner = liveOwner(lifecycle, bootId, {startedAt});
    if (!owner || owner === pid || owner === ppid) return null;
    return {epoch, directory, owner};
  } catch {return null;}
}

// Record this lifecycle (boot, pid) and remember the previous one. Called once per Gateway
// boot, after the new epoch directory exists. clean-exit.json is written only on exit code 0.
// last-lifecycle.json is not moved off a lifecycle whose Gateway is still running: the running one's
// clean exit must stay findable. The new lifecycle records that it ran alongside it, so that
// previousLifecycle refuses to carry from the running one if this one later crashes or revokes.
export function beginLifecycle({base, epoch, directory, bootId = readBootId(), pid = process.pid, now = Date.now(), onExit = handler => process.once('exit', handler), startedAt = processStartedAt}) {
  const pointer = readOwnedJson(path.join(base, POINTER));
  let previousEpoch = pointer?.format === LIFECYCLE_FORMAT && EPOCH.test(pointer.epoch ?? '') && pointer.epoch !== epoch ? pointer.epoch : null;
  let runningOwner = null;
  if (previousEpoch) {
    let previous = null;
    try {previous = readOwnedJson(path.join(base, previousEpoch, 'lifecycle.json'));} catch {}
    runningOwner = previous?.epoch === previousEpoch ? liveOwner(previous, bootId, {startedAt}) : null;
    if (runningOwner === pid) runningOwner = null;
  }
  atomicJson(path.join(directory, 'lifecycle.json'), {format: LIFECYCLE_FORMAT, epoch, bootId, pid, startedAt: now, ...(runningOwner ? {alongside: previousEpoch} : {})});
  if (!runningOwner) atomicJson(path.join(base, POINTER), {format: LIFECYCLE_FORMAT, epoch});
  onExit(code => {
    if (code !== 0) return;
    try {atomicJson(path.join(directory, 'clean-exit.json'), {format: LIFECYCLE_FORMAT, epoch, pid, at: Date.now()});} catch {}
  });
  return runningOwner ? {previousEpoch: null, runningOwner} : {previousEpoch};
}

function cleanExit(directory, epoch, lifecycle) {
  const clean = readOwnedJson(path.join(directory, 'clean-exit.json'));
  return clean?.format === LIFECYCLE_FORMAT && clean.epoch === epoch && clean.pid === lifecycle.pid && clean.at >= lifecycle.startedAt;
}

const MAX_LIFECYCLE_ENTRIES = 4096;

// A Gateway that ran alongside the previous lifecycle (beginLifecycle: started while that one's owner
// was still running, e.g. an update-restart successor) wrote its revocations and its exit into its own
// directory. The previous lifecycle's receipts are carried only if every such Gateway exited cleanly
// and revoked nothing; otherwise every database is checked in full, as after a crash.
function alongsideReason(base, previousEpoch, bootId, {epoch: currentEpoch, pid, startedAt}) {
  const entries = fs.readdirSync(base);
  if (entries.length > MAX_LIFECYCLE_ENTRIES) return 'too-many-lifecycles';
  for (const name of entries) {
    if (!EPOCH.test(name) || name === previousEpoch || name === currentEpoch) continue;
    const directory = path.join(base, name);
    if (!privateDirectory(directory)) continue;
    const lifecycle = readOwnedJson(path.join(directory, 'lifecycle.json'));
    if (lifecycle?.format !== LIFECYCLE_FORMAT || lifecycle.epoch !== name || lifecycle.alongside !== previousEpoch || lifecycle.bootId !== bootId) continue;
    const owner = liveOwner(lifecycle, bootId, {startedAt});
    if (owner && owner !== pid) return 'alongside-lifecycle-running';
    if (!cleanExit(directory, name, lifecycle)) return 'alongside-exit-not-clean';
    if (fs.readdirSync(directory).some(file => file.endsWith('.revoked.json'))) return 'alongside-revoked';
  }
  return null;
}

function previousLifecycle(base, previousEpoch, bootId, current) {
  if (!previousEpoch) return {reason: 'no-previous-lifecycle'};
  if (!bootId) return {reason: 'boot-id-unavailable'};
  const directory = path.join(base, previousEpoch);
  if (!fs.existsSync(directory) || !privateDirectory(directory)) return {reason: 'previous-lifecycle-missing'};
  const lifecycle = readOwnedJson(path.join(directory, 'lifecycle.json'));
  if (lifecycle?.format !== LIFECYCLE_FORMAT || lifecycle.epoch !== previousEpoch) return {reason: 'previous-lifecycle-unrecorded'};
  if (lifecycle.bootId !== bootId) return {reason: 'host-rebooted'};
  if (!cleanExit(directory, previousEpoch, lifecycle)) return {reason: 'previous-exit-not-clean'};
  const alongside = alongsideReason(base, previousEpoch, bootId, current);
  if (alongside) return {reason: alongside};
  return {directory, global: path.join(directory, 'global.revoked.json')};
}

function carryOne(previous, previousEpoch, target, {env, now}) {
  const key = HASH(path.resolve(target.path));
  const receipt = readOwnedJson(path.join(previous.directory, key + '.json'));
  if (!receipt) return 'no-receipt';
  const fence = readMarker(path.join(previous.directory, key + '.revoked.json')) + '|' + readMarker(previous.global);
  if (receipt.format !== FORMAT || receipt.epoch !== previousEpoch || receipt.fence !== fence) return 'receipt-revoked-or-foreign';
  if (!Number.isFinite(receipt.checkedAt) || receipt.checkedAt > now + 30000 || now - receipt.checkedAt > MAX_AGE_MS) return 'receipt-expired';
  if (!Number.isSafeInteger(receipt.minimumFileBytes) || receipt.minimumFileBytes < 0) return 'receipt-invalid';
  if (receipt.identity?.path !== path.resolve(target.path) || typeof receipt.identity?.agentId !== 'string') return 'receipt-invalid';
  const size = fs.statSync(target.path).size;
  if (size < receipt.minimumFileBytes && !shrunkBySqlite(target.path, size)) return 'file-shrunk';
  let db;
  let identity;
  try {
    db = new DatabaseSync(target.path, {readOnly: true});
    identity = readDatabaseIdentity(db, target.path, receipt.identity.agentId);
  } finally {db?.close();}
  if (JSON.stringify(identity) !== JSON.stringify(receipt.identity)) return 'identity-changed';
  const proof = {format: FORMAT, epoch: env.OPENCLAW_DB91_INTEGRITY_EPOCH, identity, minimumFileBytes: receipt.minimumFileBytes, fence: 'none|none', checkedAt: receipt.checkedAt, source: 'carried-clean-restart', carriedFrom: previousEpoch};
  return publishVerificationProof(proof, target.path, {env, now}) ? proof : 'publish-refused';
}

// Returns {carried: Set(paths), proofs: [published proof], reasons: {path|'*': reason}}. Never
// throws: any failure leaves the database to the full preflight.
export function carryVerifications({base, previousEpoch, targets, env = process.env, bootId = readBootId(), now = Date.now(), pid = process.pid, startedAt = processStartedAt}) {
  const carried = new Set();
  const proofs = [];
  const reasons = {};
  if (env.OPENCLAW_DB91_RESTART_CARRY === '0') return {carried, proofs, reasons: {'*': 'disabled'}};
  let previous;
  try {previous = previousLifecycle(base, previousEpoch, bootId, {epoch: env.OPENCLAW_DB91_INTEGRITY_EPOCH, pid, startedAt});} catch (error) {previous = {reason: 'previous-lifecycle-unreadable'};}
  if (previous.reason) return {carried, proofs, reasons: {'*': previous.reason}};
  for (const target of targets) {
    let outcome;
    try {outcome = carryOne(previous, previousEpoch, target, {env, now});} catch (error) {outcome = 'error:' + (error?.code ?? error?.name ?? 'unknown');}
    if (typeof outcome === 'object') {carried.add(target.path); proofs.push(outcome);} else reasons[target.path] = outcome;
  }
  return {carried, proofs, reasons};
}
