import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { IDENTITY_LINE, MARKER, UPSTREAM_LINE, patchSystemPromptParams } from './patch-v-identity-line.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-v-identity-line.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const NAME = 'system-prompt-params-B645JcX8.js';
const base = read(`lab/release-files/v-identity-line/base/${NAME}`);
const shipped = read(`${OUTPUT_DIR}/${NAME}`);

test('the base is V\'s live bytes and the release file is exactly their patch', () => {
  const file = FILES.find((f) => f.name === NAME);
  assert.equal(sha(base), file.before);
  assert.equal(shipped, patchSystemPromptParams(base));
  const plan = JSON.parse(read(PLAN));
  assert.deepEqual(plan.files, [{ source: `${OUTPUT_DIR}/${NAME}`, target: `openclaw/dist/${NAME}`, before: file.before }]);
});

test('both opening sites use V\'s line and nothing else changes', () => {
  assert.equal(base.split(UPSTREAM_LINE).length, 3, 'upstream has the line at the none-mode and stable-prefix sites');
  assert(!shipped.includes(UPSTREAM_LINE));
  assert.equal(shipped.split('AGENT_IDENTITY_LINE').length - 1, 3, 'one declaration, two uses');
  assert(shipped.includes(`const AGENT_IDENTITY_LINE = ${JSON.stringify(IDENTITY_LINE)};`));
  assert(shipped.includes(MARKER));
  // Removing the three edits gives the base back byte for byte.
  const undone = shipped
    .replace(/\/\*\* v-identity-line-v1:[^\n]*\nconst AGENT_IDENTITY_LINE = [^\n]*\n/u, '')
    .replaceAll('AGENT_IDENTITY_LINE', JSON.stringify(UPSTREAM_LINE));
  assert.equal(undone, base);
});

test('the none-mode and stable-prefix sites both open with the constant', () => {
  const none = shipped.match(/if \(promptMode === "none"\) return \[([^\]]+)\]/u)[1];
  assert.equal(none.trim(), 'AGENT_IDENTITY_LINE, modelIdentityLine');
  const stable = shipped.match(/const lines = \[\n\t+([^\n]+),\n\t+"",/u)[1];
  assert.equal(stable, 'AGENT_IDENTITY_LINE');
});

test('applying twice is refused, and a changed base is refused', () => {
  assert.throws(() => patchSystemPromptParams(shipped), new RegExp(`${MARKER} already applied`));
  assert.throws(() => patchSystemPromptParams(base.replace(UPSTREAM_LINE, 'x')), /Expected exactly one/);
});
