// Backups of an installed V that do not stop it, and restores that can be checked before they are used.
//
// An archive is a filesystem image relative to "/": the state directory (~/.openclaw: workspace with
// memory, agents, sessions), lark-cli's config and tokens, /etc/v (including secrets.env) and
// /var/lib/v-distro. SQLite databases are copied with SQLite's online backup, so a running Gateway
// never sees a half-copied file, and checked with integrity_check. manifest.json lists every file's
// sha256 and every database's integrity and table row counts, so a restore can prove it is whole.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Rebuildable or machine-local: OpenClaw reinstalls npm plugins, caches refill, tmp holds locks.
export const BACKUP_EXCLUDE = ['npm', 'cache', 'logs', 'tmp', 'browser/*/user-data/*/Cache', 'browser/*/user-data/*/Code Cache'];
const isDb = (f) => /\.sqlite$/.test(f) && !/lock\.sqlite$|generation-writer\.sqlite$/.test(f);
const isDbSidecar = (f) => /\.sqlite(-wal|-shm|-journal)$/.test(f) || /lock\.sqlite$|generation-writer\.sqlite$/.test(f);

function walk(root, rel = '', exclude = () => false) {
  const out = [];
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (exclude(r)) continue;
    if (ent.isDirectory()) out.push(...walk(root, r, exclude));
    else if (ent.isFile()) out.push(r);
  }
  return out;
}

const globRe = (g) => new RegExp(`^${g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}(/|$)`);
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function dbFacts(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]).join('; ');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const rows = {};
    for (const t of tables) {
      try { rows[t] = db.prepare(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n; } catch { rows[t] = null; }
    }
    return { integrity, rows };
  } finally { db.close(); }
}

/**
 * @param {object} o
 * @param {{from:string, to:string, exclude?:string[]}[]} o.trees  directories to copy, `to` relative to the image root
 * @param {string} o.stage   empty directory to build the image in
 */
export async function buildBackupImage(o) {
  const { backup, DatabaseSync } = await import('node:sqlite');
  const files = {};
  const databases = {};
  for (const t of o.trees) {
    const ex = (t.exclude ?? []).map(globRe);
    const list = walk(t.from, '', (r) => ex.some((re) => re.test(r)));
    for (const rel of list) {
      const src = path.join(t.from, rel);
      const dstRel = path.posix.join(t.to, rel);
      const dst = path.join(o.stage, dstRel);
      if (isDbSidecar(rel)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (isDb(rel)) {
        const db = new DatabaseSync(src, { readOnly: true });
        try { await backup(db, dst); } finally { db.close(); }
        databases[dstRel] = { bytes: fs.statSync(dst).size, ...(await dbFacts(dst)) };
        if (databases[dstRel].integrity !== 'ok') throw new Error(`backup of ${src} fails integrity_check: ${databases[dstRel].integrity}`);
      } else {
        fs.copyFileSync(src, dst);
        fs.chmodSync(dst, fs.statSync(src).mode & 0o777);
        files[dstRel] = sha256File(dst);
      }
    }
  }
  return { files, databases };
}

/** Check an unpacked image against its manifest: every file's bytes, every database whole and as counted. */
export async function verifyImage(root, manifest) {
  const problems = [];
  for (const [rel, sum] of Object.entries(manifest.files)) {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) problems.push(`missing ${rel}`);
    else if (sha256File(f) !== sum) problems.push(`changed ${rel}`);
  }
  for (const [rel, facts] of Object.entries(manifest.databases)) {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) { problems.push(`missing database ${rel}`); continue; }
    const now = await dbFacts(f);
    if (now.integrity !== 'ok') problems.push(`database ${rel}: ${now.integrity}`);
    for (const [t, n] of Object.entries(facts.rows)) if (now.rows[t] !== n) problems.push(`database ${rel}: ${t} has ${now.rows[t]} rows, backup had ${n}`);
  }
  return { ok: problems.length === 0, files: Object.keys(manifest.files).length, databases: Object.keys(manifest.databases).length, problems };
}

export function tarCreate(stage, archive) {
  const r = spawnSync('tar', ['-C', stage, '--numeric-owner', '-czf', archive, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  fs.chmodSync(archive, 0o600);
}

export function tarExtract(archive, root) {
  fs.mkdirSync(root, { recursive: true });
  const r = spawnSync('tar', ['-C', root, '--numeric-owner', '-xzf', archive], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
}

/** Old archives beyond the newest `keep` in dir (only ones this tool named). */
export function prunable(dir, keep) {
  if (!keep || !fs.existsSync(dir)) return [];
  const mine = fs.readdirSync(dir).filter((f) => /^v-backup-.*\.tar\.gz$/.test(f)).sort();
  return mine.slice(0, Math.max(0, mine.length - keep));
}
