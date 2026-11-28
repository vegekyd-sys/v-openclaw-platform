// Bring an installed agent workspace to another release's payload without touching what the owner
// or the agent made their own (line B's distro/workspace/update-policy.json says which is which).
//
// Three-way, file by file (and section by section in files the policy lists under "sections"):
//   base    = the rendered payload this workspace was last seeded or updated from
//   current = what is in the workspace now
//   next    = the rendered payload of the target release
// untouched (current == base) -> take next (or delete when next dropped it); already next -> nothing;
// changed by the owner or the agent -> keep theirs, write next beside it as <file>.new, report it;
// deleted by them -> leave deleted, report it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (b) => (b == null ? null : crypto.createHash('sha256').update(b).digest('hex'));
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Buffer.compare(a, b) === 0);

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** The payload paths this policy manages: matching "system" or "sections", never "owner". */
export function managedPaths(policy, paths) {
  const sys = (policy.system ?? []).map(globToRegex);
  const own = (policy.owner ?? []).map(globToRegex);
  const sec = new Set(policy.sections ?? []);
  return paths.filter((p) => !own.some((r) => r.test(p)) && (sec.has(p) || sys.some((r) => r.test(p)))).sort();
}

const BEGIN = /<!-- v-distro:begin ([A-Za-z0-9_.-]+) -->/g;

/** Marked system sections of a text: id -> full block (markers included). Null when none or malformed. */
export function sectionsOf(text) {
  const out = new Map();
  for (const m of text.matchAll(BEGIN)) {
    const end = `<!-- v-distro:end ${m[1]} -->`;
    const at = text.indexOf(end, m.index);
    if (at < 0 || out.has(m[1])) return null;
    out.set(m[1], text.slice(m.index, at + end.length));
  }
  return out.size ? out : null;
}

/** Three-way on one file's bytes. */
export function mergeFile(base, current, next) {
  if (same(current, next)) return { action: 'unchanged' };
  if (current == null) return base == null ? { action: 'add', content: next } : { action: 'kept-deleted' };
  if (same(current, base)) return next == null ? { action: 'delete' } : { action: 'update', content: next };
  if (next == null) return { action: 'kept-modified' };
  return { action: 'conflict', content: next };
}

/** Three-way per marked section; text outside the sections is the owner's. Falls back to whole-file. */
export function mergeSections(base, current, next) {
  const [b, c, n] = [base, current, next].map((x) => (x == null ? null : sectionsOf(x.toString('utf8'))));
  if (!c || !n) return mergeFile(base, current, next);
  let text = current.toString('utf8');
  const conflicts = [];
  let changed = false;
  for (const [id, nextBlock] of n) {
    const curBlock = c.get(id);
    const baseBlock = b?.get(id) ?? null;
    if (curBlock == null) {
      if (baseBlock != null) continue; // they removed this section: leave it out
      text = `${text.replace(/\n*$/, '\n')}\n${nextBlock}\n`;
      changed = true;
    } else if (curBlock === nextBlock) {
      continue;
    } else if (baseBlock != null && curBlock === baseBlock) {
      text = text.replace(curBlock, () => nextBlock);
      changed = true;
    } else {
      conflicts.push(id);
    }
  }
  for (const [id, curBlock] of c) {
    if (n.has(id)) continue;
    if (b?.get(id) === curBlock) { text = text.replace(curBlock, ''); changed = true; }
  }
  if (conflicts.length) return { action: changed ? 'update-partial' : 'conflict', content: changed ? Buffer.from(text) : next, newFile: next, sections: conflicts };
  return changed ? { action: 'update', content: Buffer.from(text) } : { action: 'unchanged' };
}

function listFiles(dir, rel = '') {
  if (!fs.existsSync(path.join(dir, rel))) return [];
  const out = [];
  for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.name === '.git') continue;
    if (ent.isDirectory()) out.push(...listFiles(dir, r));
    else if (ent.isFile()) out.push(r);
  }
  return out;
}
const read = (dir, rel) => { const p = path.join(dir, rel); return fs.existsSync(p) && fs.lstatSync(p).isFile() ? fs.readFileSync(p) : null; };

/**
 * Plan and apply. Paths are managed if the policy manages them in base or next.
 * Returns the report; writes nothing when dryRun.
 */
export function updateWorkspace({ workspace, baseDir, nextDir, policy, dryRun = false }) {
  const paths = managedPaths(policy, [...new Set([...listFiles(baseDir), ...listFiles(nextDir)])]);
  const sectioned = new Set(policy.sections ?? []);
  const report = { updated: [], added: [], deleted: [], unchanged: 0, conflicts: [], keptModified: [], keptDeleted: [] };
  for (const rel of paths) {
    const base = read(baseDir, rel);
    const current = read(workspace, rel);
    const next = read(nextDir, rel);
    const r = sectioned.has(rel) ? mergeSections(base, current, next) : mergeFile(base, current, next);
    const dest = path.join(workspace, rel);
    const write = (to, content) => { if (!dryRun) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, content); } };
    switch (r.action) {
      case 'unchanged': report.unchanged += 1; break;
      case 'add': write(dest, r.content); report.added.push(rel); break;
      case 'update': write(dest, r.content); report.updated.push(rel); break;
      case 'delete': if (!dryRun) fs.rmSync(dest, { force: true }); report.deleted.push(rel); break;
      case 'kept-deleted': report.keptDeleted.push(rel); break;
      case 'kept-modified': report.keptModified.push(rel); break;
      case 'update-partial':
        write(dest, r.content); write(`${dest}.new`, r.newFile);
        report.updated.push(rel); report.conflicts.push({ path: rel, newFile: `${rel}.new`, sections: r.sections });
        break;
      case 'conflict':
        write(`${dest}.new`, r.content);
        report.conflicts.push({ path: rel, newFile: `${rel}.new`, ...(r.sections ? { sections: r.sections } : {}) });
        break;
      default: throw new Error(`unknown action ${r.action}`);
    }
  }
  report.managed = paths.length;
  report.nextSha = Object.fromEntries(paths.map((p) => [p, sha(read(nextDir, p))]));
  return report;
}
