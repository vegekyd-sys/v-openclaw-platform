// Global skills V loads from outside its workspace (line B's distro/workspace/global-skills.json),
// installed into ~/.openclaw/skills/<name>. Three kinds, all at the versions V runs:
//   - from the skill CLIs in tools.json: a skills/<name> directory in the npm package, or the
//     CLI's own installer when a tool declares skillCommand (none does today: Scene is not installed);
//   - lark-*: written out from the skills embedded in the lark-cli binary (lark-cli skills list/read);
//   - from GitHub at a pinned commit (runtime/skills.json), checked file by file against sha256s.
// Only skills this installer wrote are ever replaced (.v-distro-skills.json); the owner's own stay.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const LEDGER = '.v-distro-skills.json';

function walk(dir, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isSymbolicLink()) throw new Error(`symlink in skill: ${r}`);
    if (ent.isDirectory()) out.push(...walk(dir, r));
    else if (ent.isFile()) out.push(r);
  }
  return out;
}

/** A fetched skill must have exactly the pinned files with the pinned bytes. */
export function verifySkillDir(dir, files) {
  const have = new Set(walk(dir));
  const missing = Object.keys(files).filter((f) => !have.has(f));
  const extra = [...have].filter((f) => !(f in files));
  const changed = Object.keys(files).filter((f) => have.has(f) && sha256(fs.readFileSync(path.join(dir, f))) !== files[f]);
  return { ok: !missing.length && !extra.length && !changed.length, missing, extra, changed };
}

const safeName = (n) => { if (!/^[a-z0-9][a-z0-9._-]*$/i.test(n)) throw new Error(`bad skill name ${n}`); return n; };
const safeRel = (p) => { if (p.split('/').some((s) => s === '..' || s === '') || path.isAbsolute(p)) throw new Error(`bad path ${p}`); return p; };

/** lark-cli's embedded skills as [{skill, file}] (file relative to the skill dir). */
export function larkSkillFiles(lark) {
  const listed = JSON.parse(lark(['skills', 'list']));
  const out = [];
  const visit = (p) => {
    for (const e of JSON.parse(lark(['skills', 'list', p])).entries ?? []) {
      if (e.is_dir) visit(e.path);
      else out.push({ skill: e.path.split('/')[0], file: e.path.split('/').slice(1).join('/') });
    }
  };
  for (const s of listed.skills ?? []) visit(safeName(s.name));
  return out;
}

function replaceDir(staging, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
}

/**
 * @param {object} o
 * @param {string} o.releaseDir  /opt/v/current
 * @param {string} o.toolsRoot   /opt/v/tools
 * @param {string} o.home        /home/openclaw
 * @param {string} o.user        openclaw
 * @param {(cmd:string,args:string[],opts?:object)=>string} o.run  throws on failure
 */
export function installSkills(o) {
  const log = o.log ?? (() => {});
  const spec = JSON.parse(fs.readFileSync(path.join(o.releaseDir, 'runtime/skills.json'), 'utf8'));
  const tools = JSON.parse(fs.readFileSync(path.join(o.releaseDir, 'runtime/tools.json'), 'utf8')).npm;
  const target = path.join(o.home, spec.target);
  fs.mkdirSync(target, { recursive: true });
  const ledgerFile = path.join(target, LEDGER);
  const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v-distro-skills-'));
  fs.chmodSync(tmp, 0o711); // the service user writes into its own subdirectory for CLI installers
  const installed = {};
  const failed = {};
  // Never overwrite a skill directory the owner (or V) made: only empty slots or ones we wrote.
  const ours = (name) => !fs.existsSync(path.join(target, name)) || name in ledger;
  const put = (name, staging, source) => {
    if (!ours(name)) { failed[name] = 'a skill of that name exists and was not installed by v-distro; left alone'; return; }
    replaceDir(staging, path.join(target, name));
    installed[name] = source;
  };
  const asUser = (bin, args, env = {}) => o.run('runuser', ['-u', o.user, '--', 'env', '-i', `HOME=${o.home}`, `PATH=${o.nodeBin}:/usr/bin:/bin`,
    'LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1', 'LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), bin, ...args]);
  try {
    // 1. Skill directories inside the skill CLIs' npm packages, and CLI-run installers.
    for (const [name, t] of Object.entries(tools)) {
      const pkgDir = path.join(o.toolsRoot, `${name}-${t.version}`, 'node_modules', t.package);
      for (const [skill, rel] of Object.entries(t.skills ?? {})) {
        try {
          const src = path.join(pkgDir, safeRel(rel));
          if (!fs.existsSync(path.join(src, 'SKILL.md'))) throw new Error(`${src}/SKILL.md missing`);
          const staging = path.join(tmp, `npm-${safeName(skill)}`);
          fs.cpSync(src, staging, { recursive: true });
          put(skill, staging, `${t.package}@${t.version}`);
        } catch (e) { failed[skill] = String(e.message ?? e); }
      }
      if (t.skillCommand) {
        const names = (t.skillNames ?? []).map(safeName);
        try {
          if (names.some((n) => !ours(n))) throw new Error('a skill of that name exists and was not installed by v-distro; left alone');
          const out = path.join(tmp, `cmd-${name}`);
          fs.mkdirSync(out);
          fs.chownSync(out, o.uid, o.gid);
          asUser(path.join(pkgDir, '..', '.bin', t.bin), t.skillCommand.map((a) => a.replace('{target}', out)));
          for (const n of names) {
            if (!fs.existsSync(path.join(out, n, 'SKILL.md'))) throw new Error(`${t.bin} did not write ${n}/SKILL.md`);
            put(n, path.join(out, n), `${t.package}@${t.version} (${t.bin} ${t.skillCommand.slice(0, 2).join(' ')})`);
          }
        } catch (e) { for (const n of names) failed[n] = String(e.message ?? e); }
      }
    }
    // 2. lark-* from the lark-cli binary itself.
    if (spec.lark && tools[spec.lark.tool]) {
      const t = tools[spec.lark.tool];
      const bin = path.join(o.toolsRoot, `${spec.lark.tool}-${t.version}`, 'node_modules', '.bin', t.bin);
      try {
        const lark = (args) => asUser(bin, args);
        const bySkill = new Map();
        for (const { skill, file } of larkSkillFiles(lark)) {
          if (!bySkill.has(skill)) bySkill.set(skill, []);
          bySkill.get(skill).push(file);
        }
        for (const [skill, files] of bySkill) {
          try {
            const staging = path.join(tmp, `lark-${safeName(skill)}`);
            for (const f of files) {
              const dest = path.join(staging, safeRel(f));
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.writeFileSync(dest, lark(['skills', 'read', `${skill}/${f}`]));
            }
            put(skill, staging, `${t.package}@${t.version} (embedded)`);
          } catch (e) { failed[skill] = String(e.message ?? e); }
        }
      } catch (e) { failed['lark-*'] = String(e.message ?? e); }
    }
    // 3. GitHub, one download per pinned commit, every file checked.
    const byCommit = new Map();
    for (const s of spec.github ?? []) {
      const k = `${s.repo}@${s.commit}`;
      if (!byCommit.has(k)) byCommit.set(k, []);
      byCommit.get(k).push(s);
    }
    for (const [k, skills] of byCommit) {
      const [repo, commit] = k.split('@');
      const dir = path.join(tmp, `gh-${repo.replace('/', '_')}-${commit.slice(0, 12)}`);
      try {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[0-9a-f]{40}$/.test(commit)) throw new Error(`bad pin ${k}`);
        fs.mkdirSync(dir);
        const tgz = `${dir}.tgz`;
        log(`fetching ${repo}@${commit.slice(0, 12)}`);
        o.run('curl', ['-fsSL', '--retry', '2', '--connect-timeout', '20', '-o', tgz, `https://codeload.github.com/${repo}/tar.gz/${commit}`]);
        o.run('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1', '--no-same-owner', '--no-same-permissions']);
      } catch (e) { for (const s of skills) failed[s.name] = `download ${k}: ${String(e.message ?? e).slice(0, 200)}`; continue; }
      for (const s of skills) {
        try {
          // Only the listed files, each checked: upstream may carry more (README, plugin metadata).
          const src = s.path ? path.join(dir, safeRel(s.path)) : dir;
          const staging = path.join(tmp, `ghs-${safeName(s.name)}`);
          for (const f of Object.keys(s.files)) {
            const from = path.join(src, safeRel(f));
            if (!fs.existsSync(from) || fs.lstatSync(from).isSymbolicLink()) continue;
            fs.mkdirSync(path.dirname(path.join(staging, f)), { recursive: true });
            fs.copyFileSync(from, path.join(staging, f));
          }
          const v = verifySkillDir(staging, s.files);
          if (!v.ok) throw new Error(`does not match the pinned files (missing ${v.missing.length}, extra ${v.extra.length}, changed ${v.changed.length})`);
          put(s.name, staging, `${repo}@${commit}${s.path ? `:${s.path}` : ''}`);
        } catch (e) { failed[s.name] = String(e.message ?? e); }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(ledgerFile, `${JSON.stringify({ ...ledger, ...installed }, null, 1)}\n`);
  o.run('chown', ['-R', `${o.user}:${o.user}`, target]);
  return { target, installed: Object.keys(installed).sort(), failed };
}
