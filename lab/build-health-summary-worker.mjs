// Builds lab/release-files/health-summary-worker/* from V's bytes and writes the release plan.
// Usage: node lab/build-health-summary-worker.mjs <dir holding V's core/dist files>
import fs from 'node:fs';
import path from 'node:path';
import { FILES, RELEASE_DIR, WORKER_FILE, WORKER_SOURCE, patchFile, sha256 } from './patch-health-summary-worker.mjs';

const source = process.argv[2];
if (!source) throw new Error('usage: build-health-summary-worker.mjs <V dist dir>');
const root = new URL('..', import.meta.url).pathname;
fs.mkdirSync(path.join(root, RELEASE_DIR), { recursive: true });
const files = [];
for (const name of Object.keys(FILES)) {
  const before = fs.readFileSync(path.join(source, name), 'utf8');
  const after = patchFile(name, before);
  fs.writeFileSync(path.join(root, RELEASE_DIR, name), after);
  files.push({ source: `${RELEASE_DIR}/${name}`, target: `openclaw/dist/${name}`, before: sha256(before), after: sha256(after) });
}
assert(!fs.existsSync(path.join(source, WORKER_FILE)), `${WORKER_FILE} already exists in V's dist`);
fs.writeFileSync(path.join(root, RELEASE_DIR, WORKER_FILE), WORKER_SOURCE);
files.push({ source: `${RELEASE_DIR}/${WORKER_FILE}`, target: `openclaw/dist/${WORKER_FILE}`, before: null, after: sha256(WORKER_SOURCE) });
fs.writeFileSync(path.join(root, 'lab/health-summary-worker.plan.json'), `${JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2)}\n`);
console.log(JSON.stringify(files, null, 2));
function assert(condition, message) { if (!condition) throw new Error(message); }
