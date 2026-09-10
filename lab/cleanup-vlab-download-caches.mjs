// Explicitly authorized VLab housekeeping; never touches installed dependencies.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
const owner = '01a07b32-72be-7fe0-85d4-00680ea01f4e';
const base = '/srv/vlab-production-mirror';
const targets = [
  base + '/labs/instances/browser-repair/cache/npm/_cacache',
  base + '/labs/instances/browser-shot/cache/npm/_cacache',
  base + '/labs/instances/vplatform92/cache/npm/_cacache',
  base + '/labs/instances/isolation-check/cache/npm/_cacache',
  base + '/labs/instances/db91-parity/cache/npm/_cacache',
];
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync(base + '/labs/control/integration.json')).owner, owner);
const free = () => { const s = fs.statfsSync(base); return s.bavail * s.bsize; };
let bytes = 0, allocatedBytes = 0, files = 0;
function validate(path) {
  const s = fs.lstatSync(path);
  assert(!s.isSymbolicLink(), 'Refuse cache symlink');
  if (s.isDirectory()) for (const n of fs.readdirSync(path)) validate(path + '/' + n);
  else { assert(s.isFile() && s.nlink === 1, 'Refuse special/hardlinked cache file'); bytes += s.size; allocatedBytes += s.blocks * 512; files++; }
}
for (const p of targets) { assert.equal(fs.realpathSync(p), p); validate(p); }
// Refuse while an installer runs or a process has a reference into a target.
for (const id of fs.readdirSync('/proc').filter(s => /^\d+$/.test(s))) {
  try {
    const cmd = fs.readFileSync('/proc/' + id + '/cmdline', 'utf8').replaceAll('\0', ' ');
    assert(!/\b(?:npm|pnpm|yarn)\s+(?:install|ci|add|update|cache)\b/.test(cmd), 'Installer running');
    const refs = [fs.readlinkSync('/proc/' + id + '/cwd'), fs.readFileSync('/proc/' + id + '/maps', 'utf8')];
    for (const f of fs.readdirSync('/proc/' + id + '/fd')) {
      try { refs.push(fs.readlinkSync('/proc/' + id + '/fd/' + f)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    assert(!targets.some(p => refs.some(r => r.includes(p))), 'Cache referenced by process');
  } catch (e) { if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e; }
}
const before = free();
if (process.argv.includes('--apply')) {
  for (const p of targets) {
    const s = fs.lstatSync(p);
    fs.rmSync(p, {recursive: true});
    fs.mkdirSync(p, {mode: s.mode & 0o777}); fs.chownSync(p, s.uid, s.gid);
  }
}
console.log(JSON.stringify({applied: process.argv.includes('--apply'), targets, files, bytes, allocatedBytes, before, after: free(), recovery: 'Download caches only; no backup. npm can refetch packages.'}));
