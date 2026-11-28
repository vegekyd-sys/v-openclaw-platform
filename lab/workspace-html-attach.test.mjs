import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MARKER, patchWebMedia } from './patch-workspace-html-attach.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-workspace-html-attach.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const candidatePlan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/workspace-html-attach.candidate.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const NAME = 'web-media-BGCgwB8q.js';
const base = read(`${FILES[0].base}/${NAME}`);
const patched = read(`${OUTPUT_DIR}/${NAME}`);

const tempDirs = [];
test.after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });
const tmp = (prefix) => { const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); tempDirs.push(dir); return dir; };

test('plan replaces V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  assert.deepEqual(candidatePlan.files, plan.files);
  assert.equal(sha(base), FILES[0].before);
  assert.equal(patchWebMedia(base), patched);
  assert(patched.includes(MARKER));
  assert.throws(() => patchWebMedia(patched), /already applied/u);
  const check = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, NAME)], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('only the HTML trust resolver, its trust check and its call site change', () => {
  const kept = new Set(patched.split('\n'));
  const removed = base.split('\n').filter((line) => !kept.has(line));
  assert.deepEqual(removed, [
    'async function resolveTrustedGeneratedHostReadHtml(filePath) {',
    '	const [resolvedFilePath, tmpRoot, outboundRoot] = await Promise.all([',
    '		realpath(path.join(getMediaDir(), "outbound")).catch(() => void 0)',
    '	return tmpRoot && isPathInside(tmpRoot, resolvedFilePath) ? { source: "temp-root" } : void 0;',
    '	if (params.trustedGeneratedHtmlPath.source === "temp-root") return true;',
    '	const htmlTrust = hostReadDeclaredMime === "text/html" ? await resolveTrustedGeneratedHostReadHtml(mediaUrl) : void 0;',
  ]);
  // loadWebMediaInternal already destructures workspaceDir from its options.
  assert.match(patched, /const \{ maxBytes, [^}]*\bworkspaceDir\b[^}]*\} = options;/u);
});

// The two resolver functions, cut out of the dist file and run with node:fs, node:path and
// stand-ins for the OpenClaw imports (temp root, media dir, marker lookup).
function extract(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 3);
}
async function loadResolver(source, { tmpRoot, configDir }) {
  const dir = tmp('workspace-html-attach-');
  const body = [
    'import path from "node:path";',
    'import { lstat, realpath } from "node:fs/promises";',
    'const isPathInside = (root, target) => { const rel = path.relative(root, target); return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel)); };',
    `const resolvePreferredOpenClawTmpDir = () => ${JSON.stringify(tmpRoot)};`,
    `const getMediaDir = () => ${JSON.stringify(path.join(configDir, 'media'))};`,
    'async function getTrustedGeneratedHtmlMarker() { return undefined; }',
    source.includes('async function resolveTrustedHtmlWorkspaceRoot(') ? extract(source, 'resolveTrustedHtmlWorkspaceRoot') : '',
    extract(source, 'resolveTrustedGeneratedHostReadHtml'),
    'export { resolveTrustedGeneratedHostReadHtml };',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'resolver.mjs'), body);
  return (await import(pathToFileURL(path.join(dir, 'resolver.mjs')).href)).resolveTrustedGeneratedHostReadHtml;
}

test('V bytes refuse workspace HTML; the patch trusts it and nothing outside the workspace', async () => {
  const root = tmp('whattach-root-');
  const tmpRoot = path.join(root, 'tmp-openclaw');
  const home = path.join(root, 'home');
  const configDir = path.join(home, '.openclaw');
  const workspace = path.join(home, 'makaron-openclaw', '.openclaw-local', 'workspace');
  for (const dir of [tmpRoot, path.join(configDir, 'media', 'outbound'), path.join(workspace, 'decks')]) fs.mkdirSync(dir, { recursive: true });
  const write = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '<!doctype html><title>x</title>\n'); return file; };
  const deck = write(path.join(workspace, 'decks', 'makaron-deck.html'));
  const inTmp = write(path.join(tmpRoot, 'report.html'));
  const inState = write(path.join(configDir, 'agents', 'makaron', 'dump.html'));
  const inHome = write(path.join(home, 'page.html'));
  const link = path.join(workspace, 'link.html');
  fs.symlinkSync(inState, link);
  const hard = path.join(workspace, 'hard.html');
  fs.linkSync(write(path.join(root, 'outside.html')), hard);

  const before = await loadResolver(base, { tmpRoot, configDir });
  const after = await loadResolver(patched, { tmpRoot, configDir });
  assert.equal(await before(deck, workspace), undefined);
  assert.deepEqual(await after(deck, workspace), { source: 'workspace' });
  assert.equal(await after(deck, undefined), undefined, 'no workspace, no trust');
  assert.equal(await after(deck, 'relative/workspace'), undefined, 'relative workspace refused');
  for (const resolve of [before, after]) assert.deepEqual(await resolve(inTmp, workspace), { source: 'temp-root' });
  for (const file of [inState, inHome, link, hard]) assert.equal(await after(file, workspace), undefined, file);
  // A workspace that contains the config dir (or is the filesystem root) vouches for nothing.
  for (const broad of [home, configDir, path.parse(home).root]) {
    assert.equal(await after(inState, broad), undefined, broad);
    assert.equal(await after(deck, broad), undefined, broad);
  }
});
