#!/usr/bin/env node
// What changed on production V between two releases, from evidence rather than
// memory.
//
//   node scripts/release-notes.mjs --from <V release tag> --to <V release tag>
//   node scripts/release-notes.mjs --to <tag> --baseline      # first captured release
//
// A V release tag names the captures release/captured/<tag><suffix>, one per
// captured component of scripts/lib/runtime-components.mjs (core, .worker,
// .feishu, .codex, .dingtalk, .wecom). Each capture is turned into the full set of
// files V runs (the published package from release/captured/base/ plus the
// captured files, for core; the whole directory, for the plugins), and the
// two sets are compared file by file. So the file list is exact, whoever
// changed V and however.
//
// Components added to the table later (DingTalk and WeCom, 2026-10-05; Codex,
// 2026-10-14) are missing from older captures. Missing in --from = first appearance (counted,
// not listed file by file); missing in both = not part of either release.
// core, worker and Feishu must be in every capture.
//
// Each changed file is then traced to the shared VLab release whose recorded
// after-bytes it carries (its id, owner, dev commit and the acceptance
// evidence). A file that no VLab release produced is reported as an
// out-of-band change: it reached V without going through VLab. Merged PRs
// between the two tags are listed from git.
//
// Captures are read from --at (default origin/dev): a capture can be corrected
// after its tag (565b2ff re-captured feishu-model-20260924 against the
// published package), and the corrected one is the true record.
//
// Output is Markdown for CHANGELOG.md. The summary line at the top is left for
// the person who shipped the release to write.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { diffReleaseComponents, releaseNoteComponents } from './lib/runtime-components.mjs';

const args = parseArgs(process.argv.slice(2));
const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const at = args.at ?? 'origin/dev';
if (!args.to || (!args.from && !args.baseline)) usage();

const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const show = (path) => JSON.parse(git('show', `${at}:${path}`));
const COMPONENTS = releaseNoteComponents();
const REQUIRED = new Set(['core', 'worker', 'feishu']);
const exists = (path) => {
  try { execFileSync('git', ['-C', repo, 'cat-file', '-e', `${at}:${path}`], { stdio: 'ignore' }); return true; } catch { return false; }
};

function runtimeOf(tag) {
  const out = {};
  for (const [label, suffix] of COMPONENTS) {
    const path = `release/captured/${tag}${suffix}/manifest.json`;
    if (!REQUIRED.has(label) && !exists(path)) { out[label] = null; continue; }
    const m = show(path);
    const files = {};
    const base = m.capturedFrom?.baseDir ?? 'none';
    if (base.startsWith('npm:')) {
      const name = base.slice(4).replace(/^@/, '').replace(/[/:]/g, '__');
      Object.assign(files, show(`release/captured/base/${name}.json`).files);
      for (const p of m.removedFromBase ?? []) delete files[p];
    } else if (base !== 'none') {
      throw new Error(`${tag}${suffix} was captured against ${base}, which has no inventory in the repo; recapture it against npm:`);
    }
    for (const f of m.files) files[f.path] = f.sha256;
    out[label] = { files, manifest: m };
  }
  return out;
}

const to = runtimeOf(args.to);
const toDate = tagDate(args.to);
const lines = [`## ${args.to}`, '', `上线：${toDate}  ·  tag \`${args.to}\``, '', '**摘要**：（由上线的人补一两句：这次为什么上、用户能感知到什么）', ''];

if (args.baseline) {
  lines.push('首个带完整存档的发版，作为之后比对的起点。');
  for (const [label] of COMPONENTS) {
    if (!to[label]) continue;
    const c = to[label].manifest.counts;
    lines.push(`- ${label}：${label === 'core' ? `相对 ${to.core.manifest.capturedFrom.baseDir} 修改 ${c.modified}、新增 ${c.added}` : `${c.added} 个文件（整目录存档）`}`);
  }
  lines.push('');
  console.log(lines.join('\n'));
  process.exit(0);
}

const from = runtimeOf(args.from);
const { changes, firstSeen: firstSeenIds } = diffReleaseComponents(from, to, COMPONENTS.map(([label]) => label));
const firstSeen = firstSeenIds.map((label) => `${label}（${Object.keys(to[label].files).length} 个文件，整目录存档）`);

// Trace each change to the VLab release that produced those bytes.
const vlab = args.noVlab ? [] : vlabReleases();
const byAfter = new Map();
for (const r of vlab) for (const f of r.files) if (f.after) (byAfter.get(f.after) ?? byAfter.set(f.after, []).get(f.after)).push(r);

lines.push(`相对上一版 \`${args.from}\`：${changes.length} 个文件变化。`, '');
if (firstSeen.length) lines.push(`**首次纳入存档的组件**（上一版没有它的存档，不逐个列出）：${firstSeen.join('、')}`, '');
if (changes.length) {
  const groups = new Map();
  for (const c of changes) {
    const producers = c.after ? (byAfter.get(c.after) ?? []).filter((r) => !r.syncFromV) : [];
    const key = producers.length ? producers.map((r) => r.id).sort().at(-1) : c.after ? '__oob__' : '__removed__';
    (groups.get(key) ?? groups.set(key, []).get(key)).push(c);
  }
  for (const [key, list] of groups) {
    if (key === '__oob__') {
      lines.push('**流程外改动**（这些字节没有由任何 VLab 发版产生，是在 V 上直接改的）：');
    } else if (key === '__removed__') {
      lines.push('**从 V 上移除**：');
    } else {
      const r = vlab.find((x) => x.id === key);
      lines.push(`**经 VLab 发版 \`${r.id}\`**（${r.owner ?? '未记录负责人'}，dev \`${(r.commit ?? '').slice(0, 8)}\`）`);
      if (r.evidence) lines.push(`> 验收：${r.evidence.replace(/\s+/g, ' ').slice(0, 400)}${r.evidence.length > 400 ? '…' : ''}`);
    }
    for (const c of list) lines.push(`- \`${c.label}\` ${c.path}  ${short(c.before)} → ${short(c.after)}`);
    lines.push('');
  }
}

const prs = git('log', '--merges', '--format=%s%x1f%b%x1e', `${args.from}..${args.to}`)
  .split('\x1e').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [subject, body] = s.split('\x1f'); return { subject, title: (body ?? '').split('\n').find((l) => l.trim()) ?? '' }; })
  .filter((m) => /^Merge pull request #\d+/.test(m.subject) && !/from vegekyd-sys\/dev$/.test(m.subject));
if (prs.length) {
  lines.push(`**这期间合入 dev 的 PR**（${prs.length} 个，不一定都部署到了 V；V 上实际变化以上面的文件为准）：`);
  for (const p of prs) lines.push(`- #${/#(\d+)/.exec(p.subject)[1]} ${p.title}`);
  lines.push('');
}
console.log(lines.join('\n'));

function vlabReleases() {
  const script = String.raw`
const fs=require('fs'),c=require('crypto'),H='/srv/vlab-production-mirror/labs/shared-workflow';
const acc={};for(const n of fs.readdirSync(H+'/receipts'))if(n.endsWith('-accept.json')){try{const j=JSON.parse(fs.readFileSync(H+'/receipts/'+n));acc[j.release]=j.evidence}catch{}}
const out=[];for(const id of fs.readdirSync(H+'/releases')){let a;try{a=JSON.parse(fs.readFileSync(H+'/releases/'+id+'/artifact.json'))}catch{continue}
out.push({id,owner:a.owner,commit:a.sourceCommit,syncFromV:!!a.syncFromV,evidence:acc[id]||null,files:(a.files||[]).map(f=>({target:f.target,after:f.after||(f.content?c.createHash('sha256').update(Buffer.from(f.content,'base64')).digest('hex'):null)}))})}
console.log(JSON.stringify(out));`;
  try {
    return JSON.parse(execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'vlab91', 'sudo node -'], { input: script, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  } catch (e) {
    console.error(`(VLab release records unavailable: ${e.message.split('\n')[0]}; provenance omitted)`);
    return [];
  }
}

function tagDate(tag) {
  return git('log', '-1', '--format=%ad', '--date=format:%Y-%m-%d %H:%M CST', tag).trim();
}

function short(sha) {
  return sha ? sha.slice(0, 8) : '—';
}

function usage() {
  console.error('usage: release-notes.mjs --from <tag> --to <tag> [--at <ref>] [--no-vlab] | --to <tag> --baseline');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? true : (i += 1, next);
  }
  return out;
}
