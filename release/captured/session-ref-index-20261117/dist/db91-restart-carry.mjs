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

// Record this lifecycle (boot, pid) and remember the previous one. Called once per Gateway
// boot, after the new epoch directory exists. clean-exit.json is written only on exit code 0.
export function beginLifecycle({base, epoch, directory, bootId = readBootId(), pid = process.pid, now = Date.now(), onExit = handler => process.once('exit', handler)}) {
  const pointer = readOwnedJson(path.join(base, POINTER));
  const previousEpoch = pointer?.format === LIFECYCLE_FORMAT && EPOCH.test(pointer.epoch ?? '') && pointer.epoch !== epoch ? pointer.epoch : null;
  atomicJson(path.join(directory, 'lifecycle.json'), {format: LIFECYCLE_FORMAT, epoch, bootId, pid, startedAt: now});
  atomicJson(path.join(base, POINTER), {format: LIFECYCLE_FORMAT, epoch});
  onExit(code => {
    if (code !== 0) return;
    try {atomicJson(path.join(directory, 'clean-exit.json'), {format: LIFECYCLE_FORMAT, epoch, pid, at: Date.now()});} catch {}
  });
  return {previousEpoch};
}

function previousLifecycle(base, previousEpoch, bootId) {
  if (!previousEpoch) return {reason: 'no-previous-lifecycle'};
  if (!bootId) return {reason: 'boot-id-unavailable'};
  const directory = path.join(base, previousEpoch);
  if (!fs.existsSync(directory) || !privateDirectory(directory)) return {reason: 'previous-lifecycle-missing'};
  const lifecycle = readOwnedJson(path.join(directory, 'lifecycle.json'));
  if (lifecycle?.format !== LIFECYCLE_FORMAT || lifecycle.epoch !== previousEpoch) return {reason: 'previous-lifecycle-unrecorded'};
  if (lifecycle.bootId !== bootId) return {reason: 'host-rebooted'};
  const clean = readOwnedJson(path.join(directory, 'clean-exit.json'));
  if (clean?.format !== LIFECYCLE_FORMAT || clean.epoch !== previousEpoch || clean.pid !== lifecycle.pid || !(clean.at >= lifecycle.startedAt)) return {reason: 'previous-exit-not-clean'};
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
  return publishVerificationProof(proof, target.path, {env, now}) ? 'carried' : 'publish-refused';
}

// Returns {carried: Set(paths), reasons: {path|'*': reason}}. Never throws: any failure leaves
// the database to the full preflight.
export function carryVerifications({base, previousEpoch, targets, env = process.env, bootId = readBootId(), now = Date.now()}) {
  const carried = new Set();
  const reasons = {};
  if (env.OPENCLAW_DB91_RESTART_CARRY === '0') return {carried, reasons: {'*': 'disabled'}};
  let previous;
  try {previous = previousLifecycle(base, previousEpoch, bootId);} catch (error) {previous = {reason: 'previous-lifecycle-unreadable'};}
  if (previous.reason) return {carried, reasons: {'*': previous.reason}};
  for (const target of targets) {
    let outcome;
    try {outcome = carryOne(previous, previousEpoch, target, {env, now});} catch (error) {outcome = 'error:' + (error?.code ?? error?.name ?? 'unknown');}
    if (outcome === 'carried') carried.add(target.path); else reasons[target.path] = outcome;
  }
  return {carried, reasons};
}
