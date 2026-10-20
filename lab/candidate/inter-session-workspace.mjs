// Candidate workspace loader for the inter-session design (docs/inter-session/design.md §10.2, §10.4).
//
// V's workspace files are Tianyi's private property and never enter git. They travel to a candidate
// run as hash-pinned plan inputs ("support" entries outside the repo land under
// <inputs>/external/<hash>/<basename>), together with a manifest generated from the private
// directory. Inside the candidate this module finds every input by basename + sha256, applies the
// workspace drafts (unified diffs, applied strictly) or takes patched copies as they are, checks the
// expected result hashes, and writes the files into the candidate's private agent workspace
// ($VLAB_CANDIDATE_DATA/workspace/<agent>). It also installs lark-cli-shim in front of PATH.
//
//   node lab/candidate/inter-session-workspace.mjs manifest --private-dir <dir> [--files-from v-workspace]
//        [--drafts agents-md.diff,task-room-skill.diff,a2a-skill.diff,background-worker-contract.diff | --drafts none]
//   -> writes <dir>/inter-session-workspace.manifest.json and prints the plan "support" stanza.
//
//   inside a candidate test/script:
//     import {applyInterSessionWorkspace, prepareLarkShim} from './inter-session-workspace.mjs';
//     const workspace = applyInterSessionWorkspace();            // default agent from the manifest
//     const shim = prepareLarkShim({pool: ['oc_…', 'oc_…', 'oc_…']}); // env for the private Gateway
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const MANIFEST_KIND = 'inter-session-workspace-inputs';
export const MANIFEST_NAME = 'inter-session-workspace.manifest.json';
export const RECEIPT_NAME = 'inter-session-workspace.receipt.json';
export const SHIM_RELATIVE = 'lab/candidate/lark-cli-shim/lark-cli';
export const BOOTSTRAP_NAME = 'BOOTSTRAP.md';
export const DEFAULT_AGENT = 'makaron';
export const DEFAULT_FILES_FROM = 'v-workspace';
// Workspace files the inter-session candidate needs (design §10.2): V's boot documents plus the
// skills that §8.5/§8.6 touch. IDENTITY.md is not in the design's list but has to travel too: when
// it is missing, OpenClaw 9.1 ensureAgentWorkspace writes its "Who Am I? Fill this in" template
// (src/agents/workspace.ts, writeFileIfMissing(identityPath)) and the candidate V loses its name.
// HEARTBEAT.md stays out on purpose: it is V's own periodic checklist, which a candidate must not
// act on. Whether heartbeats run at all is the candidate config's business (WP10 should turn them off).
export const DEFAULT_FILES = Object.freeze([
  'AGENTS.md', 'REDLINES.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md',
  '.agents/skills/feishu-task-room-router/SKILL.md',
  '.agents/skills/feishu-task-room-router/scripts/create_task_room.py',
  'skills/background-worker-contract/SKILL.md',
  'skills/agent-to-agent-protocol-feishu-a2a-defaults/SKILL.md',
]);
export const DEFAULT_DRAFTS = Object.freeze(['agents-md.diff', 'task-room-skill.diff', 'a2a-skill.diff', 'background-worker-contract.diff']);

const MODULE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAX_INDEXED_ENTRIES = 50000;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeRelative(p) {
  if (typeof p !== 'string' || !p.length || p.includes('\\') || p.includes('\0') || path.isAbsolute(p))
    throw new Error(`Invalid workspace path: ${JSON.stringify(p)}`);
  if (!p.split('/').every(s => s && s !== '.' && s !== '..')) throw new Error(`Invalid workspace path: ${JSON.stringify(p)}`);
  return p;
}

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ---- unified diff ---------------------------------------------------------------------------

function stripPrefix(p) {
  const name = p.split('\t')[0].trim();
  if (name === '/dev/null') return null;
  return safeRelative(name.replace(/^[ab]\//, ''));
}

export function parseUnifiedDiff(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const patches = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ')) { i++; continue; }
    if (!lines[i + 1]?.startsWith('+++ ')) throw new Error(`Malformed diff: "---" without "+++" at line ${i + 1}`);
    const patch = {oldPath: stripPrefix(lines[i].slice(4)), newPath: stripPrefix(lines[i + 1].slice(4)), hunks: []};
    if (patch.newPath === null) throw new Error('Drafts may not delete workspace files');
    i += 2;
    while (i < lines.length && lines[i].startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
      if (!m) throw new Error(`Malformed hunk header at line ${i + 1}: ${lines[i]}`);
      const hunk = {oldStart: Number(m[1]), oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]), newLines: m[4] === undefined ? 1 : Number(m[4]), lines: []};
      i++;
      let seenOld = 0, seenNew = 0;
      while (i < lines.length && (seenOld < hunk.oldLines || seenNew < hunk.newLines || lines[i].startsWith('\\'))) {
        const line = lines[i];
        if (line.startsWith('\\')) { if (hunk.lines.length) hunk.lines.at(-1).noNewline = true; i++; continue; }
        const op = line[0], body = line.slice(1);
        if (op === ' ') { seenOld++; seenNew++; } else if (op === '-') seenOld++; else if (op === '+') seenNew++;
        else if (line === '') { seenOld++; seenNew++; hunk.lines.push({op: ' ', text: ''}); i++; continue; }
        else throw new Error(`Malformed hunk line ${i + 1}: ${line}`);
        hunk.lines.push({op, text: body});
        i++;
      }
      if (seenOld !== hunk.oldLines || seenNew !== hunk.newLines) throw new Error(`Hunk length mismatch near line ${i}`);
      patch.hunks.push(hunk);
    }
    if (!patch.hunks.length) throw new Error(`Diff for ${patch.newPath} has no hunks`);
    patches.push(patch);
  }
  if (!patches.length) throw new Error('Diff contains no file patches');
  return patches;
}

// Strict application: every hunk must match the original exactly at its stated position. A draft
// written against other bytes fails here instead of landing somewhere close.
export function applyFilePatch(original, patch) {
  const source = original === null ? [] : original.split('\n');
  const finalNewline = original === null ? true : original.endsWith('\n');
  if (original !== null && finalNewline) source.pop();
  const out = [];
  let cursor = 0, noNewlineAtEnd = !finalNewline;
  for (const hunk of patch.hunks) {
    const start = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < cursor) throw new Error(`${patch.newPath}: overlapping hunks at line ${hunk.oldStart}`);
    out.push(...source.slice(cursor, start));
    let at = start;
    for (const line of hunk.lines) {
      if (line.op === '+') { out.push(line.text); if (line.noNewline) noNewlineAtEnd = true; continue; }
      if (source[at] !== line.text) throw new Error(`${patch.newPath}: draft does not apply at line ${at + 1} (hunk @@ -${hunk.oldStart},${hunk.oldLines})`);
      if (line.op === ' ') { out.push(line.text); if (line.noNewline) noNewlineAtEnd = true; }
      else if (line.noNewline) noNewlineAtEnd = false;
      at++;
    }
    cursor = at;
  }
  if (cursor < source.length) noNewlineAtEnd = !finalNewline;
  out.push(...source.slice(cursor));
  return out.join('\n') + (noNewlineAtEnd ? '' : '\n');
}

export function applyDrafts(files, draftTexts) {
  const result = new Map(files);
  const touched = [];
  for (const {name, text} of draftTexts) {
    const paths = [];
    for (const patch of parseUnifiedDiff(text)) {
      const target = patch.newPath;
      if (patch.oldPath !== null && patch.oldPath !== target) throw new Error(`${name}: renames are not supported (${patch.oldPath} -> ${target})`);
      if (patch.oldPath !== null && !result.has(target)) throw new Error(`${name}: ${target} is not among the workspace inputs`);
      if (patch.oldPath === null && result.has(target)) throw new Error(`${name}: ${target} already exists`);
      const before = patch.oldPath === null ? null : result.get(target).toString('utf8');
      result.set(target, Buffer.from(applyFilePatch(before, patch), 'utf8'));
      paths.push(target);
    }
    touched.push({name, paths});
  }
  return {files: result, touched};
}

// ---- manifest (runs on the Mac, next to the private directory) ------------------------------

function fileMode(stat) { return stat.mode & 0o111 ? 0o700 : 0o600; }

export function buildManifest({privateDir, filesFrom = DEFAULT_FILES_FROM, files = DEFAULT_FILES, drafts = DEFAULT_DRAFTS, agent = DEFAULT_AGENT, write = true} = {}) {
  if (!privateDir) throw new Error('privateDir is required');
  const root = fs.realpathSync(privateDir);
  const base = path.join(root, safeRelative(filesFrom));
  const entries = [], support = [], contents = new Map();
  for (const rel of files) {
    const abs = path.join(base, safeRelative(rel));
    const stat = fs.lstatSync(abs);
    if (!stat.isFile()) throw new Error(`Not a regular file: ${abs}`);
    const bytes = fs.readFileSync(abs);
    contents.set(rel, bytes);
    entries.push({path: rel, sha256: sha256(bytes), bytes: bytes.length, mode: fileMode(stat), basename: path.basename(abs)});
    support.push(abs);
  }
  const draftEntries = [], draftTexts = [];
  for (const name of drafts) {
    const abs = path.join(root, safeRelative(name));
    const bytes = fs.readFileSync(abs);
    draftEntries.push({name, sha256: sha256(bytes), basename: path.basename(abs)});
    draftTexts.push({name, text: bytes.toString('utf8')});
    support.push(abs);
  }
  const applied = applyDrafts(contents, draftTexts);
  const expect = [...applied.files].map(([p, bytes]) => ({path: p, sha256: sha256(bytes)}));
  const manifest = {v: 1, kind: MANIFEST_KIND, agent, filesFrom, generatedAt: new Date().toISOString(),
    files: entries, drafts: draftEntries.map((d, i) => ({...d, paths: applied.touched[i].paths})), expect};
  const manifestPath = path.join(root, MANIFEST_NAME);
  if (write) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
  return {manifest, manifestPath, support: [
    'lab/candidate/inter-session-workspace.mjs', SHIM_RELATIVE, manifestPath, ...support]};
}

// ---- inputs (runs inside the candidate) -----------------------------------------------------

function indexByBasename(inputsDir, wanted) {
  const found = new Map([...wanted].map(name => [name, []]));
  let seen = 0;
  const walk = dir => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (++seen > MAX_INDEXED_ENTRIES) throw new Error(`Too many files under ${inputsDir}; pass inputsDir pointing at the candidate inputs`);
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(p); }
      else if (e.isFile() && found.has(e.name)) found.get(e.name).push(p);
    }
  };
  walk(inputsDir);
  return found;
}

function findInput(index, {basename, sha256: want, label}, inputsDir) {
  for (const candidate of index.get(basename) ?? []) {
    const bytes = fs.readFileSync(candidate);
    if (sha256(bytes) === want) return {path: candidate, bytes};
  }
  throw new Error(`Input ${label} (${basename}, sha256 ${want.slice(0, 12)}…) not found under ${inputsDir}; add it to plan.support`);
}

export function loadManifest({inputsDir = MODULE_ROOT, manifest} = {}) {
  if (manifest && typeof manifest === 'object') return manifest;
  let file = manifest;
  if (!file) {
    const hits = indexByBasename(inputsDir, new Set([MANIFEST_NAME])).get(MANIFEST_NAME);
    const distinct = [...new Set(hits.map(h => sha256(fs.readFileSync(h))))];
    if (distinct.length !== 1) throw new Error(`Expected exactly one ${MANIFEST_NAME} under ${inputsDir}, found ${hits.length}`);
    file = hits[0];
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkManifest(m) {
  if (m?.v !== 1 || m.kind !== MANIFEST_KIND) throw new Error('Not an inter-session workspace manifest');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(m.agent ?? '')) throw new Error('Manifest agent id is invalid');
  for (const f of m.files ?? []) { safeRelative(f.path); if (!/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error(`Bad sha256 for ${f.path}`); }
  for (const d of m.drafts ?? []) if (!/^[a-f0-9]{64}$/.test(d.sha256)) throw new Error(`Bad sha256 for draft ${d.name}`);
  if (!m.files?.length) throw new Error('Manifest lists no files');
}

function replaceAll(text, pairs, counts) {
  for (const [i, {from, to}] of pairs.entries()) {
    const n = text.split(from).length - 1;
    if (n) { text = text.split(from).join(to); counts[i] += n; }
  }
  return text;
}

function refuseSymlinks(root, rel) {
  let p = root;
  for (const part of rel.split('/')) {
    p = path.join(p, part);
    try { if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`Refusing to write through symlink ${p}`); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
  }
}

export function applyInterSessionWorkspace({inputsDir = MODULE_ROOT, manifest, agent, dataDir = process.env.VLAB_CANDIDATE_DATA,
  workspaceDir, replacements = [], receipt = true} = {}) {
  const m = loadManifest({inputsDir, manifest});
  checkManifest(m);
  const agentId = agent ?? m.agent;
  if (!dataDir) throw new Error('dataDir (VLAB_CANDIDATE_DATA) is required: drafts only go into a private candidate workspace');
  const data = path.resolve(dataDir);
  const target = path.resolve(workspaceDir ?? path.join(data, 'workspace', agentId));
  if (!inside(data, target)) throw new Error(`Workspace ${target} is outside the private candidate data dir ${data}`);
  const pairs = [...(m.replacements ?? []), ...replacements];
  for (const r of pairs) if (typeof r?.from !== 'string' || !r.from.length || typeof r.to !== 'string') throw new Error('replacements need non-empty "from" and string "to"');

  const wanted = new Set([...m.files.map(f => f.basename ?? path.basename(f.path)), ...(m.drafts ?? []).map(d => d.basename ?? path.basename(d.name))]);
  const index = indexByBasename(inputsDir, wanted);
  const files = new Map(), sources = new Map();
  for (const f of m.files) {
    const hit = findInput(index, {basename: f.basename ?? path.basename(f.path), sha256: f.sha256, label: f.path}, inputsDir);
    files.set(f.path, hit.bytes); sources.set(f.path, hit.path);
  }
  const draftTexts = (m.drafts ?? []).map(d => ({name: d.name,
    text: findInput(index, {basename: d.basename ?? path.basename(d.name), sha256: d.sha256, label: d.name}, inputsDir).bytes.toString('utf8')}));
  const applied = applyDrafts(files, draftTexts);
  for (const e of m.expect ?? []) {
    const got = applied.files.get(safeRelative(e.path));
    if (!got) throw new Error(`Expected ${e.path} after drafts, but it is missing`);
    if (sha256(got) !== e.sha256) throw new Error(`${e.path} after drafts has sha256 ${sha256(got).slice(0, 12)}…, manifest expects ${e.sha256.slice(0, 12)}…`);
  }
  const counts = pairs.map(() => 0);
  const modes = new Map(m.files.map(f => [f.path, f.mode ?? 0o600]));
  fs.mkdirSync(target, {recursive: true, mode: 0o700});
  if (!inside(fs.realpathSync(data), fs.realpathSync(target))) throw new Error(`Workspace ${target} resolves outside the private candidate data dir`);
  // A Gateway that saw this workspace empty has already seeded it as brand new: template profile
  // files plus BOOTSTRAP.md, which stays behind after the drafts land and starts the first-run
  // ritual. Drafts must be applied before the private Gateway starts.
  if (fs.lstatSync(path.join(target, BOOTSTRAP_NAME), {throwIfNoEntry: false}))
    throw new Error(`${path.join(target, BOOTSTRAP_NAME)} exists: the Gateway already seeded this workspace as brand new. Apply the workspace before starting the private Gateway, in a fresh candidate data dir.`);
  const written = [];
  for (const [rel, bytes] of applied.files) {
    refuseSymlinks(target, rel);
    const dest = path.join(target, rel);
    const out = pairs.length ? Buffer.from(replaceAll(bytes.toString('utf8'), pairs, counts), 'utf8') : bytes;
    fs.mkdirSync(path.dirname(dest), {recursive: true, mode: 0o700});
    const tmp = `${dest}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, out, {mode: modes.get(rel) ?? 0o600, flag: 'wx'});
    fs.chmodSync(tmp, modes.get(rel) ?? 0o600);
    fs.renameSync(tmp, dest);
    written.push({path: rel, inputSha256: m.files.find(f => f.path === rel)?.sha256 ?? null,
      draftedSha256: sha256(bytes), writtenSha256: sha256(out), drafted: applied.touched.some(t => t.paths.includes(rel)), mode: (modes.get(rel) ?? 0o600).toString(8)});
  }
  const summary = {v: 1, kind: 'inter-session-workspace-receipt', agent: agentId, workspaceDir: target, appliedAt: new Date().toISOString(),
    manifestGeneratedAt: m.generatedAt ?? null, filesFrom: m.filesFrom ?? null,
    files: written, drafts: applied.touched.map((t, i) => ({name: t.name, sha256: m.drafts[i].sha256, paths: t.paths})),
    // Identifiers only travel as hashes, so the receipt is safe to print into candidate output.
    replacements: pairs.map((r, i) => ({fromSha256: sha256(r.from).slice(0, 16), toSha256: sha256(r.to).slice(0, 16), count: counts[i]}))};
  if (receipt) fs.writeFileSync(path.join(data, RECEIPT_NAME), JSON.stringify(summary, null, 2) + '\n', {mode: 0o600});
  return summary;
}

// ---- lark-cli shim ----------------------------------------------------------------------------

const PROD_APP_ID = 'cli_a9365919fc3a1bd6';

function containsProdAppId(dir, seen = new Set(), depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return null;
  const real = fs.realpathSync(dir);
  if (seen.has(real)) return null;
  seen.add(real);
  for (const e of fs.readdirSync(real)) {
    const p = path.join(real, e);
    const st = fs.statSync(p, {throwIfNoEntry: false});
    if (!st) continue;
    if (st.isDirectory()) { const hit = containsProdAppId(p, seen, depth + 1); if (hit) return hit; }
    else if (st.isFile() && st.size <= 4 << 20 && fs.readFileSync(p).includes(PROD_APP_ID)) return p;
  }
  return null;
}

// Installs lark-cli-shim as `lark-cli` in <dataDir>/bin and prepares a private HOME without any
// .lark-cli config. Returns the env additions for the private Gateway (and thus the agent's exec).
export function prepareLarkShim({inputsDir = MODULE_ROOT, dataDir = process.env.VLAB_CANDIDATE_DATA, pool, home, pathEnv = process.env.PATH ?? '', node = process.execPath} = {}) {
  if (!dataDir) throw new Error('dataDir (VLAB_CANDIDATE_DATA) is required');
  if (!Array.isArray(pool) || !pool.length || !pool.every(id => /^oc_[0-9a-f]{8,64}$/.test(id))) throw new Error('pool must list pre-created oc_… chat ids');
  const shim = path.join(inputsDir, SHIM_RELATIVE);
  if (!fs.statSync(shim, {throwIfNoEntry: false})?.isFile()) throw new Error(`${SHIM_RELATIVE} is not among the inputs; add it to plan.support`);
  const data = path.resolve(dataDir);
  const bin = path.join(data, 'bin');
  const privateHome = path.resolve(home ?? path.join(data, 'home'));
  fs.mkdirSync(bin, {recursive: true, mode: 0o700});
  fs.mkdirSync(privateHome, {recursive: true, mode: 0o700});
  if (fs.existsSync(path.join(privateHome, '.lark-cli'))) throw new Error(`${privateHome}/.lark-cli exists; the candidate HOME must not carry any lark-cli config`);
  const hit = containsProdAppId(privateHome);
  if (hit) throw new Error(`Production app id found under the candidate HOME (${hit})`);
  const quote = s => `'${String(s).replaceAll("'", `'\\''`)}'`;
  const wrapper = path.join(bin, 'lark-cli');
  // Pool and log location are baked in, so the shim works even if the agent's exec environment
  // drops them. HOME is deliberately not baked: the shim checks the HOME it actually runs under.
  fs.writeFileSync(wrapper, `#!/bin/sh\nINTER_SESSION_ROOM_POOL=${quote(pool.join(','))} VLAB_CANDIDATE_DATA=${quote(data)} exec ${quote(node)} ${quote(fs.realpathSync(shim))} "$@"\n`, {mode: 0o700});
  fs.chmodSync(wrapper, 0o700);
  return {bin, home: privateHome, wrapper, log: path.join(data, 'lark-shim.log'),
    env: {PATH: [bin, pathEnv].filter(Boolean).join(path.delimiter), HOME: privateHome, INTER_SESSION_ROOM_POOL: pool.join(','), VLAB_CANDIDATE_DATA: data}};
}

// ---- CLI --------------------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
    out[a.slice(2)] = argv[i + 1]; i++;
  }
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    const args = parseArgs(rest);
    if (command === 'manifest') {
      const drafts = args.drafts === undefined ? DEFAULT_DRAFTS : args.drafts === 'none' ? [] : args.drafts.split(',').filter(Boolean);
      const r = buildManifest({privateDir: args['private-dir'], filesFrom: args['files-from'] ?? DEFAULT_FILES_FROM, drafts, agent: args.agent ?? DEFAULT_AGENT});
      console.log(JSON.stringify({manifest: r.manifestPath, files: r.manifest.files.length, drafts: r.manifest.drafts.length, support: r.support}, null, 2));
    } else if (command === 'apply') {
      console.log(JSON.stringify(applyInterSessionWorkspace({inputsDir: args.inputs ?? MODULE_ROOT, manifest: args.manifest, agent: args.agent,
        dataDir: args['data-dir'] ?? process.env.VLAB_CANDIDATE_DATA, workspaceDir: args.workspace}), null, 2));
    } else {
      console.error('usage: inter-session-workspace.mjs manifest --private-dir DIR [--files-from v-workspace] [--drafts a.diff,b.diff|none] [--agent makaron]\n'
        + '       inter-session-workspace.mjs apply [--inputs DIR] [--manifest FILE] [--data-dir DIR] [--workspace DIR] [--agent ID]');
      process.exitCode = 2;
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
