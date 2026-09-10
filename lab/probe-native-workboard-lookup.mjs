// Read-only native full-Workboard comparison. No Gateway or database copy.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import * as cache from './release-files/workboard-lookup-cache.mjs';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, process.argv[2]);
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'})); assert(pid > 1);
const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
const uid = Number(status.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(status.match(/^Gid:\s+(\d+)/m)[1]); assert(uid > 0 && gid > 0);
process.setgroups([]); process.setgid(gid); process.setuid(uid);
const runtime = pathToFileURL(base + '/runtime/openclaw/dist/');
const original = fs.readFileSync(new URL('sqlite-store-CH-caj1l.js', runtime), 'utf8');
assert(!original.includes('lookupWorkboardSnapshot'));
const candidate = fs.readFileSync(new URL('./release-files/sqlite-store-CH-caj1l.js', import.meta.url), 'utf8');
const imported = new Map();
async function compile(source) {
  const mod = new vm.SourceTextModule(source + '\nexport {WorkboardSqliteCardStore as ProbeCardStore};');
  await mod.link(async spec => {
    if (!imported.has(spec)) imported.set(spec, (async () => {
      const ns = spec === './workboard-lookup-cache.mjs' ? cache : await import(new URL(spec, runtime).href);
      return new vm.SyntheticModule(Object.keys(ns), function() {for (const name of Object.keys(ns)) this.setExport(name, ns[name]);});
    })());
    return imported.get(spec);
  });
  await mod.evaluate(); return mod.namespace.ProbeCardStore;
}
const Original = await compile(original), Candidate = await compile(candidate);
const db = new DatabaseSync(base + '/state/plugins/workboard/workboard.sqlite', {readOnly: true});
try {
  const a = new Original(db), b = new Candidate(db);
  const ids = db.prepare('SELECT id FROM workboard_cards ORDER BY created_at ASC, id ASC').all().map(r => r.id);
  assert(ids.length > 0); let compared = 0, concurrentChanges = 0, maxBytes = 0;
  const version = () => db.prepare('PRAGMA data_version').get().data_version;
  for (const id of [...ids, 'concurrency-fix-workboard-missing']) {
    const v = version(), left = await a.lookup(id), right = await b.lookup(id);
    if (version() !== v) {concurrentChanges++; continue;}
    assert(isDeepStrictEqual(left, right), 'Native lookup results differ; no card contents emitted'); compared++;
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(left) ?? ''));
  }
  const time = async (store, keys, cycles) => {
    const started = performance.now();
    for (let i = 0; i < cycles; i++) for (const key of keys) await store.lookup(key);
    return performance.now() - started;
  };
  const keys = ids.slice(0, 16); for (const key of keys) await b.lookup(key);
  const originalMs = await time(a, keys, 10), cachedMs = await time(b, keys, 10);
  const allOriginalMs = await time(a, ids, 3), allCachedMs = await time(b, ids, 3);
  console.log(JSON.stringify({event: 'native-workboard-lookup-passed', readOnly: true, cards: ids.length, compared, concurrentChanges, maxBytes, repeatedSubset: {keys: keys.length, cycles: 10, originalMs, cachedMs}, fullCycles: {cycles: 3, originalMs: allOriginalMs, cachedMs: allCachedMs}}));
} finally {db.close();}
