import assert from 'node:assert/strict';

// The skills watcher stops invalidating every Worker's skills snapshot right after it starts.
//
// Each process creates its chokidar skills watchers on its first real turn (ensureSkillsWatcher;
// the Worker prewarm builds the snapshot with watch:false). chokidar 5 with followSymlinks:false
// still emits "add" for every symlinked entry during its initial scan, despite ignoreInitial. The
// managed skills dir on V/VLab holds symlinked skills (lark-approval, lark-apps, lark-attendance,
// wecom-unified), so each new watcher bumped the skills snapshot version ~250 ms after it started
// although nothing changed (VLab gap-marks round 3, 2026-10-06: 14 bumps, reason=watch, the dirs'
// mtimes still 2026-09-11). The next turn on that Worker then saw refresh=1 and rebuilt the
// snapshot synchronously: 1.3-1.7 s before the model request, in 5 of 16 warm runs.
//
// A watcher now ignores events until chokidar reports ready, the same contract as ignoreInitial.
// Changes after ready bump exactly as before. OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS=1 restores
// the old behavior.

export const MARKER = '/* OPENCLAW_SKILLS_WATCH_READY_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchSkillsWatchReady(source) {
  if (source.includes(MARKER)) return source;
  let s = replaceExactlyOnce(source,
    `\t\tdepth: target.depth,
\t\tsubscribers: /* @__PURE__ */ new Set()
\t};
\tconst schedule = (changedPath) => {
\t\tif (watcher.closed) return;
`,
    `\t\tdepth: target.depth,
\t\tsubscribers: /* @__PURE__ */ new Set(),
\t\tready: process.env.OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS === "1"
\t};
\t${MARKER}
\twatcher.on("ready", () => {
\t\tstate.ready = true;
\t});
\tconst schedule = (changedPath) => {
\t\tif (watcher.closed) return;
\t\tif (!state.ready) return;
`,
    'createSkillsPathWatcher state');
  return s;
}
