import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MARKER } from './patch-browser-lifecycle-unwedge.mjs';
import { FILES, OUTPUT_DIR, PLAN, build } from './build-browser-lifecycle-unwedge.mjs';

// Runs V's real server-context.lifecycle-D0RhNtWT.js (base and patched) with stand-ins for its five
// sibling chunks. The candidate test (lab/candidate/browser-lifecycle-unwedge.mjs) repeats the wedge against
// the whole VLab runtime with a real Chrome and the browser_fill_secret path.
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const NAME = 'server-context.lifecycle-D0RhNtWT.js';
const base = fs.readFileSync(path.join(repo, FILES[0].base, NAME), 'utf8');
const patched = fs.readFileSync(path.join(repo, OUTPUT_DIR, NAME), 'utf8');

const STUBS = {
  'error-coercion-CwcmpTBO.js': 'function extractErrorCode(err) { return err?.code; }\nexport { extractErrorCode as i };\n',
  'errors-u9zSVTak.js': 'function formatErrorMessage(err) { return String(err?.message ?? err); }\nexport { formatErrorMessage as t };\n',
  'errors-6hPg4OWh.js': 'class BrowserProfileUnavailableError extends Error { constructor(m) { super(m); this.name = "BrowserProfileUnavailableError"; } }\nexport { BrowserProfileUnavailableError as s };\n',
  'profile-capabilities-B30ig3n7.js': 'function getBrowserProfileCapabilities() { return { usesChromeMcp: false, mode: "local-managed" }; }\nexport { getBrowserProfileCapabilities as t };\n',
  'errors-godh8QKY.js': '\n',
  'chrome-lc3LoS6t.js': 'async function stopOpenClawChrome(running) { return await globalThis.__stopChrome(running); }\nexport { stopOpenClawChrome as c };\n',
};

const tempDirs = [];
test.after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });

async function load(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-lifecycle-unwedge-'));
  tempDirs.push(dir);
  for (const [file, text] of Object.entries(STUBS)) fs.writeFileSync(path.join(dir, file), text);
  fs.writeFileSync(path.join(dir, NAME), source);
  const m = await import(pathToFileURL(path.join(dir, NAME)).href);
  // export letters as in the dist file
  return { start: m.i, transition: m.r, lifecycle: m.o, runtimeFor: m.a, register: m.f, lease: m.h };
}

const never = () => new Promise(() => {});
const within = (promise, ms) => Promise.race([
  promise.then((v) => v, (e) => e instanceof Error ? e : new Error(String(e))),
  new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
]);

function setup(lc) {
  const profile = { name: 'openclaw', cdpUrl: 'http://127.0.0.1:22804', cdpPort: 22804, driver: 'openclaw' };
  const state = { port: 22803, resolved: { profiles: { openclaw: profile } }, profiles: new Map() };
  const runtime = lc.runtimeFor(state, profile);
  const running = { pid: 4242, proc: Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }) };
  lc.register(runtime, running);
  runtime.running = running;
  return { state, runtime, running, configRevision: lc.lifecycle(runtime).configRevision };
}

const ENV = { OPENCLAW_BROWSER_LEASE_DRAIN_MS: '50', OPENCLAW_BROWSER_START_BUDGET_MS: '50', OPENCLAW_BROWSER_CLEANUP_BUDGET_MS: '50' };
test.beforeEach(() => {
  Object.assign(process.env, ENV);
  globalThis.__stopChrome = async () => {};
});
test.afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; });

test('the build reproduces the patched file from V bytes and the plan', () => {
  assert.equal(sha(base), FILES[0].before);
  const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
  assert.deepEqual(plan.files.map((f) => f.before), [FILES[0].before]);
  const built = build();
  assert.equal(built[0].after, sha(patched));
  assert(patched.includes(MARKER));
  assert.throws(() => FILES[0].patch(patched), /already applied/u);
});

for (const [label, source, fixed] of [['V 9.1 base', base, false], ['patched', patched, true]]) {
  test(`${label}: a restart transition behind a lease that ignores the abort`, async () => {
    const lc = await load(source);
    const { state, runtime, running, configRevision } = setup(lc);
    const warn = console.warn; console.warn = () => {};
    try {
      let stuckSignal;
      lc.lease({ state, runtime, configRevision, run: async (signal) => { stuckSignal = signal; return await never(); } }).catch(() => {});
      await new Promise((r) => setImmediate(r));
      const stopped = [];
      globalThis.__stopChrome = async (r) => { stopped.push(r.pid); };
      const transition = lc.transition({ state, runtime, reason: 'managed Chrome restart required' });
      assert.equal(stuckSignal.aborted, true);
      const next = lc.lease({ state, runtime, configRevision, run: async () => 'tabs' });
      const [t, n] = await Promise.all([within(transition, 600), within(next, 600)]);
      if (fixed) {
        assert.deepEqual(t, { stopped: true });
        assert.equal(n, 'tabs');
        assert.deepEqual(stopped, [running.pid]);
      } else {
        // V's wedge: the transition never reaches cleanup (Chrome survives) and later work never runs.
        assert.equal(t, 'pending');
        assert.equal(n, 'pending');
        assert.deepEqual(stopped, []);
      }
    } finally { console.warn = warn; }
  });

  test(`${label}: a start that never settles`, async () => {
    const lc = await load(source);
    const { state, runtime, configRevision } = setup(lc);
    const warn = console.warn; console.warn = () => {};
    try {
      const start = lc.start({ state, runtime, configRevision, key: 'default', run: async () => await never() });
      start.catch(() => {});
      const next = lc.lease({ state, runtime, configRevision, run: async () => 'status' });
      const [s, n] = await Promise.all([within(start, 600), within(next, 600)]);
      if (fixed) {
        assert.match(String(s?.message), /did not finish within/u);
        assert.equal(n, 'status');
      } else {
        assert.equal(s, 'pending');
        assert.equal(n, 'pending');
      }
    } finally { console.warn = warn; }
  });

  test(`${label}: a cleanup that never settles`, async () => {
    const lc = await load(source);
    const { state, runtime, configRevision } = setup(lc);
    const warn = console.warn; console.warn = () => {};
    try {
      globalThis.__stopChrome = never;
      const transition = lc.transition({ state, runtime, reason: 'stop requested' });
      transition.catch(() => {});
      const t = await within(transition, 600);
      if (!fixed) { assert.equal(t, 'pending'); return; }
      assert.match(String(t?.message), /cleanup did not finish within/u);
      assert.equal(lc.lifecycle(runtime).blockedReason, 'stop requested cleanup failed');
      globalThis.__stopChrome = async () => {};
      assert.deepEqual(await within(lc.transition({ state, runtime, reason: 'profile invariant cleanup retry' }), 600), { stopped: true });
      assert.equal(await within(lc.lease({ state, runtime, configRevision, run: async () => 'ok' }), 600), 'ok');
    } finally { console.warn = warn; }
  });
}

test('patched: leases that honour the abort still drain before Chrome is stopped', async () => {
  const lc = await load(patched);
  const { state, runtime, configRevision } = setup(lc);
  process.env.OPENCLAW_BROWSER_LEASE_DRAIN_MS = '5000';
  const order = [];
  const warnings = [];
  const warn = console.warn; console.warn = (m) => warnings.push(m);
  try {
    const lease = lc.lease({ state, runtime, configRevision, run: async (signal) => await new Promise((_, reject) => {
      signal.addEventListener('abort', () => setTimeout(() => { order.push('lease settled'); reject(signal.reason); }, 30));
    }) }).catch(() => {});
    await new Promise((r) => setImmediate(r));
    globalThis.__stopChrome = async () => { order.push('chrome stopped'); };
    await lc.transition({ state, runtime, reason: 'stop requested' });
    await lease;
    assert.deepEqual(order, ['lease settled', 'chrome stopped']);
    assert.deepEqual(warnings, []);
  } finally { console.warn = warn; }
});
