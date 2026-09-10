// Exact completed synthetic fixtures created by this thread on 2026-09-09.
// Preserve a verified archive; never target business state or another task.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const [owner, mode = 'audit'] = process.argv.slice(2); assert(['audit', 'archive'].includes(mode));
const control = '/srv/vlab-production-mirror/labs/control';
assert.equal(JSON.parse(fs.readFileSync(path.join(control, 'integration.json'))).owner, owner);
const names = ['empty-length-fixture-h0gWrT', 'empty-length-fixture-iRzvYd', 'empty-length-fixture-vV6JZp', 'empty-length-fixture-mpVYDq'];
const targets = names.map(name => path.join(control, name));
let bytes = 0, files = 0;
function inventory(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const filename = path.join(directory, entry.name); assert(!entry.isSymbolicLink(), 'Fixture contains a symlink');
    if (entry.isDirectory()) inventory(filename); else {assert(entry.isFile()); bytes += fs.statSync(filename).size; files++;}
  }
}
for (const directory of targets) {
  const stat = fs.lstatSync(directory); assert(stat.isDirectory() && !stat.isSymbolicLink()); assert(Date.now() - stat.mtimeMs > 3600000);
  assert.equal(fs.realpathSync(directory), directory);
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json')));
  assert.equal(config.models.providers.deepseek.apiKey, 'fixture-not-a-real-key');
  assert(/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(config.models.providers.deepseek.baseUrl));
  assert.deepEqual(Object.keys(config.models.providers), ['deepseek']); assert.equal(config.plugins.enabled, false); assert.deepEqual(config.tools.deny, ['*']);
  assert.equal(config.agents.defaults.workspace, path.join(directory, 'workspace')); assert.equal(config.agents.defaults.skipBootstrap, true);
  inventory(directory);
}
function assertUnused() {
  const contains = value => targets.some(target => value === target || value.startsWith(target + '/'));
  for (const pid of fs.readdirSync('/proc').filter(s => /^\d+$/.test(s))) {
    try {assert(!contains(fs.readlinkSync('/proc/' + pid + '/cwd')), 'Fixture is an active working directory');} catch (e) {if (e.name === 'AssertionError') throw e;}
    let descriptors; try {descriptors = fs.readdirSync('/proc/' + pid + '/fd');} catch {continue;}
    for (const fd of descriptors) try {assert(!contains(fs.readlinkSync('/proc/' + pid + '/fd/' + fd)), 'Fixture has an open file descriptor');} catch (e) {if (e.name === 'AssertionError') throw e;}
    try {const maps = fs.readFileSync('/proc/' + pid + '/maps', 'utf8'); assert(!targets.some(target => maps.includes(target + '/')), 'Fixture is memory mapped');} catch (e) {if (e.name === 'AssertionError') throw e;}
  }
}
assertUnused();
if (mode === 'audit') console.log(JSON.stringify({mode, targets, files, bytes, syntheticConfiguration: true, activeReferences: 0}));
else {
  const archiveDirectory = path.join(control, 'fixture-archives'); fs.mkdirSync(archiveDirectory, {recursive: true, mode: 0o700});
  const archive = path.join(archiveDirectory, 'own-empty-length-fixtures-' + Date.now() + '.tar.gz'); assert(!fs.existsSync(archive));
  execFileSync('tar', ['-czf', archive, '-C', control, '--', ...names], {timeout: 30000}); fs.chmodSync(archive, 0o600);
  // GNU tar compares the archived data and metadata with the still-existing files.
  execFileSync('tar', ['-dzf', archive, '-C', control], {timeout: 30000}); assertUnused();
  assert.equal(JSON.parse(fs.readFileSync(path.join(control, 'integration.json'))).owner, owner);
  for (const directory of targets) fs.rmSync(directory, {recursive: true});
  const stat = fs.statfsSync(control);
  console.log(JSON.stringify({mode, removedDirectories: targets, archive, archiveBytes: fs.statSync(archive).size, archiveSha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), archivedBytes: bytes, files, archiveVerified: true, freeBytes: stat.bavail * stat.bsize}));
}
