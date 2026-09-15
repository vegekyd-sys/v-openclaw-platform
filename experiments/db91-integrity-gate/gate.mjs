// Reuse an integrity check within ONE trusted Gateway lifecycle, like a live
// connection cache, across its child processes. This is NOT an immutable-file
// certificate: ordinary SQLite transactions may change data after the check.
// Full native migration/repair verification and the daily verifier stay active.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const FORMAT = 'openclaw-db91-integrity-gate-v1';
export const MAX_AGE_MS = 26 * 60 * 60 * 1000;
const HASH = value => createHash('sha256').update(value).digest('hex');
const asString = value => typeof value === 'bigint' ? value.toString() : value;
const stats = {full: 0, reused: 0, failed: 0, published: 0};
const connectionFiles = new WeakMap();
export function getIntegrityGateStats() {return {pid: process.pid, ...stats};}

function configuration(env = process.env) {
  const epoch = env.OPENCLAW_DB91_INTEGRITY_EPOCH;
  const directory = env.OPENCLAW_DB91_INTEGRITY_DIR;
  if (!epoch && !directory) return null;
  if (!/^[a-f0-9-]{32,64}$/.test(epoch ?? '') || !directory || !path.isAbsolute(directory)) throw new Error('Invalid DB91 integrity gate configuration');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('DB91 integrity directory must be private, owned, and nonsymlinked');
  return {epoch, directory};
}

function paths(cfg, filename) {
  const key = HASH(path.resolve(filename));
  return {receipt: path.join(cfg.directory, key + '.json'), revoked: path.join(cfg.directory, key + '.revoked.json'), global: path.join(cfg.directory, 'global.revoked.json')};
}

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

export function readDatabaseIdentity(db, filename, agentId) {
  const normalized = path.resolve(filename);
  const stat = fs.lstatSync(normalized, {bigint: true});
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(normalized) !== normalized) throw new Error('DB91 integrity target must be a regular, nonsymlinked database');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const cookie = db.prepare('PRAGMA schema_version').get().schema_version;
  const owner = db.prepare("SELECT role, agent_id, schema_version FROM schema_meta WHERE meta_key = 'primary'").get();
  if (version !== 19 || owner?.role !== 'agent' || owner?.agent_id !== agentId || owner?.schema_version !== 19) throw new Error('DB91 integrity identity requires current schema and exact agent ownership');
  const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  return {
    path: normalized, agentId, version, cookie,
    dev: asString(stat.dev), ino: asString(stat.ino), birthtimeNs: asString(stat.birthtimeNs), uid: asString(stat.uid),
    schemaHash: HASH(JSON.stringify(schema))
  };
}

function sameIdentity(left, right) {return JSON.stringify(left) === JSON.stringify(right);}

function readMarker(filename) {
  const marker = readOwnedJson(filename);
  if (!marker) {
    if (fs.existsSync(filename)) throw new Error('Invalid database verification revocation marker');
    return 'none';
  }
  if (marker.format !== FORMAT || typeof marker.nonce !== 'string') throw new Error('Invalid database verification revocation marker');
  return marker.nonce;
}
function readFence(locations) {return readMarker(locations.revoked) + '|' + readMarker(locations.global);}

export function beginVerification(db, filename, agentId, {env = process.env} = {}) {
  const cfg = configuration(env);
  if (!cfg) return null;
  return {epoch: cfg.epoch, identity: readDatabaseIdentity(db, filename, agentId), minimumFileBytes: fs.statSync(filename).size, fence: readFence(paths(cfg, filename))};
}

// Incremental/full auto-vacuum may shrink a healthy database without changing
// its inode or schema. Require a committed SQLite header and a complete current
// logical image before treating that shrink like an ordinary SQLite write.
function isCommittedAutoVacuumShrink(db, filename, fileBytes) {
  let fd;
  try {
    if (!Number.isSafeInteger(fileBytes) || fileBytes < 512) return false;
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (fs.fstatSync(fd).size !== fileBytes) return false;
    const header = Buffer.alloc(100);
    if (fs.readSync(fd, header, 0, header.length, 0) !== header.length || header.subarray(0, 16).toString('binary') !== 'SQLite format 3\0') return false;
    const encodedPageSize = header.readUInt16BE(16);
    const pageSize = encodedPageSize === 1 ? 65536 : encodedPageSize;
    const headerPages = header.readUInt32BE(28);
    if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0 || fileBytes % pageSize !== 0 || headerPages === 0) return false;
    if (header.readUInt32BE(24) !== header.readUInt32BE(92) || headerPages * pageSize > fileBytes) return false;
    const mode = Number(db.prepare('PRAGMA auto_vacuum').get().auto_vacuum);
    const logicalPages = Number(db.prepare('PRAGMA page_count').get().page_count);
    const logicalPageSize = Number(db.prepare('PRAGMA page_size').get().page_size);
    return (mode === 1 || mode === 2) && logicalPageSize === pageSize && Number.isSafeInteger(logicalPages) && logicalPages > 0 && logicalPages * pageSize <= fileBytes;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function readReusableVerification(db, filename, agentId, {env = process.env, now = Date.now()} = {}) {
  const cfg = configuration(env);
  if (!cfg) return false;
  const locations = paths(cfg, filename);
  const fence = readFence(locations);
  const receipt = readOwnedJson(locations.receipt);
  if (!receipt || receipt.format !== FORMAT || receipt.epoch !== cfg.epoch || receipt.fence !== fence || !Number.isFinite(receipt.checkedAt) || receipt.checkedAt > now + 30000 || now - receipt.checkedAt > MAX_AGE_MS) return false;
  if (!Number.isSafeInteger(receipt.minimumFileBytes) || receipt.minimumFileBytes < 0) return false;
  const fileBytes = fs.statSync(filename).size;
  if (fileBytes < receipt.minimumFileBytes && !isCommittedAutoVacuumShrink(db, filename, fileBytes)) return false;
  return sameIdentity(receipt.identity, readDatabaseIdentity(db, filename, agentId));
}

export function recordSuccessfulVerification(db, filename, agentId, {env = process.env, now = Date.now(), source = 'native-full-open', ticket} = {}) {
  const proof = finishVerification(db, filename, agentId, {env, now, source, ticket});
  return proof ? publishVerificationProof(proof, filename, {env}) : false;
}

export function finishVerification(db, filename, agentId, {env = process.env, now = Date.now(), source = 'native-full-open', ticket} = {}) {
  const cfg = configuration(env);
  if (!cfg) return null;
  const locations = paths(cfg, filename);
  const identity = readDatabaseIdentity(db, filename, agentId);
  if (!ticket || ticket.epoch !== cfg.epoch || !sameIdentity(ticket.identity, identity) || ticket.fence !== readFence(locations)) return null;
  return {format: FORMAT, epoch: cfg.epoch, identity, minimumFileBytes: ticket.minimumFileBytes, fence: ticket.fence, checkedAt: now, source};
}

export function publishVerificationProof(proof, filename, {env = process.env, now = Date.now()} = {}) {
  const cfg = configuration(env);
  if (!cfg || !proof || proof.format !== FORMAT || proof.epoch !== cfg.epoch || proof.identity?.path !== path.resolve(filename) || proof.identity?.version !== 19 || typeof proof.identity?.agentId !== 'string' || !/^[a-f0-9]{64}$/.test(proof.identity?.schemaHash ?? '') || !Number.isSafeInteger(proof.minimumFileBytes) || proof.minimumFileBytes < 0 || !Number.isFinite(proof.checkedAt) || proof.checkedAt > now + 30000 || now - proof.checkedAt > MAX_AGE_MS) return false;
  const locations = paths(cfg, filename);
  if (proof.fence !== readFence(locations)) return false;
  const current = readOwnedJson(locations.receipt);
  if (current?.epoch === cfg.epoch && current?.fence === proof.fence && current.checkedAt > proof.checkedAt) return false;
  atomicJson(locations.receipt, proof);
  stats.published++;
  // Never delete a revocation marker. A concurrent new invalidation wins even
  // if it lands between the comparison above and this atomic receipt publish.
  return true;
}

// Optional hooks for the existing native read-only verification child. Fail to
// cache on incompatible metadata; never change the child's full-check result.
export function captureNativeVerificationFile(filename, {env = process.env} = {}) {
  if (!configuration(env)) return null;
  try {if (fs.realpathSync(filename) !== path.resolve(filename)) return null; return fileIdentity(filename);} catch {return null;}
}

export function beginNativeVerification(db, filename, {env = process.env, expectedFileIdentity} = {}) {
  if (!configuration(env)) return null;
  try {
    // Capture before open, compare after open: a replacement in that interval
    // must not certify a new path using a handle to the old inode.
    if (!expectedFileIdentity || expectedFileIdentity !== fileIdentity(filename)) return null;
    const owner = db.prepare("SELECT role, agent_id, schema_version FROM schema_meta WHERE meta_key = 'primary'").get();
    if (owner?.role !== 'agent' || owner.schema_version !== 19 || typeof owner.agent_id !== 'string') return null;
    return beginVerification(db, filename, owner.agent_id, {env});
  } catch {return null;}
}

export function finishNativeVerification(db, filename, ticket, {env = process.env} = {}) {
  if (!ticket) return null;
  try {return finishVerification(db, filename, ticket.identity.agentId, {env, ticket, source: 'native-verifier-child'});} catch {return null;}
}

export function invalidateVerification(filename, {env = process.env, reason = 'lifecycle-invalidated'} = {}) {
  const cfg = configuration(env);
  if (!cfg) return;
  const locations = paths(cfg, filename);
  // Revocation must become visible before deleting a successful receipt.
  atomicJson(locations.revoked, {format: FORMAT, epoch: cfg.epoch, nonce: randomUUID(), at: Date.now(), reason});
  try {fs.unlinkSync(locations.receipt);} catch (error) {if (error.code !== 'ENOENT') throw error;}
}

export function invalidateAllVerifications({env = process.env, reason = 'maintenance'} = {}) {
  const cfg = configuration(env);
  if (!cfg) return;
  atomicJson(path.join(cfg.directory, 'global.revoked.json'), {format: FORMAT, epoch: cfg.epoch, nonce: randomUUID(), at: Date.now(), reason});
}

export function assertNotRevoked(filename, {env = process.env} = {}) {
  const cfg = configuration(env);
  if (!cfg) return;
  const locations = paths(cfg, filename);
  const fence = readFence(locations);
  const receipt = readOwnedJson(locations.receipt);
  if (fence !== 'none|none' && (!receipt || receipt.epoch !== cfg.epoch || receipt.fence !== fence)) {
    const error = new Error('Database verification was revoked; close and revalidate before using this cached connection');
    error.name = 'DB91IntegrityVerificationRevokedError';
    throw error;
  }
}

function fileIdentity(filename) {
  const stat = fs.lstatSync(filename, {bigint: true});
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('DB91 cached connection path is no longer a regular database');
  return [stat.dev, stat.ino, stat.birthtimeNs].map(String).join(':');
}

export function rememberConnection(db, filename, {env = process.env} = {}) {
  if (configuration(env)) connectionFiles.set(db, fileIdentity(filename));
}

export function assertConnectionUsable(db, filename, {env = process.env} = {}) {
  if (!configuration(env)) return;
  assertNotRevoked(filename, {env});
  if (connectionFiles.get(db) !== fileIdentity(filename)) {
    const error = new Error('Database file was replaced after this connection opened; close and revalidate before reuse');
    error.name = 'DB91IntegrityConnectionReplacedError';
    throw error;
  }
}

function isTransientStorageError(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth++, current = current.cause) {
    if (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(current.code)) return true;
    if (Number.isInteger(current.errcode) && [5, 6].includes(current.errcode & 255)) return true;
    if (current.name === 'AbortError') return true;
  }
  return false;
}

export function verifyCurrentAgentDatabase({db, filename, agentId, schemaSql, options, verifyFull, verifyContracts, env = process.env}) {
  if (!configuration(env)) return verifyFull(db, filename, schemaSql, options);
  try {
    if (readReusableVerification(db, filename, agentId, {env})) {
      // Native repair still performs full integrity verification if an index
      // actually requires repair. Never refresh checkedAt on a cache hit.
      stats.reused++;
      return verifyContracts(db, filename, schemaSql, {...options, verifyPhysicalIntegrity: false});
    }
    const ticket = beginVerification(db, filename, agentId, {env});
    stats.full++;
    const result = verifyFull(db, filename, schemaSql, options);
    recordSuccessfulVerification(db, filename, agentId, {env, ticket});
    return result;
  } catch (error) {
    stats.failed++;
    // Preserve the original failure. Revocation is additional cross-process
    // protection, not a replacement for native quarantine/terminal latches.
    if (!isTransientStorageError(error)) try {invalidateVerification(filename, {env, reason: 'verification-failed'});} catch {}
    throw error;
  }
}
