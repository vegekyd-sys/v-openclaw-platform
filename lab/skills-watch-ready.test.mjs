import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MARKER, patchSkillsWatchReady } from './patch-skills-watch-ready.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const release = fs.readFileSync(path.join(repo, 'lab/release-files/skills-watch-ready/refresh-BzYxPady.js'), 'utf8');

function unpatch(source) {
  return source
    .replace('\t\tsubscribers: /* @__PURE__ */ new Set(),\n\t\tready: process.env.OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS === "1"\n', '\t\tsubscribers: /* @__PURE__ */ new Set()\n')
    .replace(`\t${MARKER}\n\twatcher.on("ready", () => {\n\t\tstate.ready = true;\n\t});\n`, '')
    .replace('\t\tif (!state.ready) return;\n', '');
}

test('release is npm openclaw@2026.9.1 refresh chunk plus only the ready gate, and the patch is idempotent', () => {
  const base = unpatch(release);
  assert.notEqual(base, release);
  assert.equal(patchSkillsWatchReady(base), release);
  assert.equal(patchSkillsWatchReady(release), release);
  assert.equal(release.split(MARKER).length, 2);
});

// ---- createSkillsPathWatcher compiled against a fake chokidar ----
function harness(env) {
  const from = release.indexOf('function createSkillsPathWatcher(target) {');
  const to = release.indexOf('function teardownSkillsPathWatcher(state) {');
  assert(from > 0 && to > from);
  const bumps = [];
  const watchers = [];
  const chokidar = { watch: () => { const w = new EventEmitter(); w.closed = false; w.close = async () => { w.closed = true; }; watchers.push(w); return w; } };
  const make = new Function('chokidar', 'path', 'process', 'runInSkillsWatcherContext', 'resolveSkillsWatcherUsePolling', 'isPathInside', 'shouldIgnoreSkillsWatchPath', 'isSkillFileWatchPath', 'getRawWatchedPath', 'rawPathToString', 'resolveRawSkillsWatchPath', 'waitForStableSkillFile', 'workspaceWatchTargetCache', 'workspaceWatchOwnerDirs', 'bumpSkillsSnapshotVersion', 'log', 'SKILLS_WATCH_DEBOUNCE_MS',
    `${release.slice(from, to)}\nreturn createSkillsPathWatcher;`);
  const inside = (a, b) => { const r = path.relative(a, b); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
  const create = make(chokidar, path, { env }, (fn) => fn(), () => false, inside, () => false, (p) => p.endsWith('SKILL.md'), () => undefined, (p) => p, (p) => p, async () => {}, new Map(), new Map(), (b) => bumps.push(b), { warn() {} }, 5);
  return { create, bumps, watchers };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('initial-scan events before ready never bump; changes after ready bump as before', async () => {
  const { create, bumps, watchers } = harness({});
  const state = create({ path: '/s/skills', watchRoot: '/s/skills', depth: 6 });
  state.subscribers.add('/ws');
  watchers[0].emit('all', 'add', '/s/skills/lark-approval');
  watchers[0].emit('all', 'addDir', '/s/skills/wecom-unified');
  await wait(20);
  assert.deepEqual(bumps, []);
  watchers[0].emit('ready');
  watchers[0].emit('all', 'change', '/s/skills/a/SKILL.md');
  await wait(20);
  assert.equal(bumps.length, 1);
  assert.deepEqual([bumps[0].workspaceDir, bumps[0].reason, bumps[0].changedPath], ['/ws', 'watch', '/s/skills/a/SKILL.md']);
});

test('OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS=1 restores bumping on initial-scan events', async () => {
  const { create, bumps, watchers } = harness({ OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS: '1' });
  const state = create({ path: '/s/skills', watchRoot: '/s/skills', depth: 6 });
  state.subscribers.add('/ws');
  watchers[0].emit('all', 'add', '/s/skills/lark-approval');
  await wait(20);
  assert.equal(bumps.length, 1);
});
