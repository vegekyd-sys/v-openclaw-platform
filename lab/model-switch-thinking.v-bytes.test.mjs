import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-model-switch-thinking.mjs';
import { OUTPUT_DIR } from './build-model-switch-thinking.mjs';

// Needs V's live bytes: MSWT_V_BASE=<dir with core/dist/* and worker/*> (see build-model-switch-thinking.mjs).
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('release bytes are the build of V bytes', () => {
  assert(process.env.MSWT_V_BASE, 'set MSWT_V_BASE=<dir with core/dist/* and worker/*>');
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(process.env.MSWT_V_BASE, file.base, file.name), 'utf8');
    assert.equal(sha(original), file.before);
    assert.equal(sha(file.patch(original)), sha(fs.readFileSync(path.join(repo, OUTPUT_DIR, file.name), 'utf8')));
  }
});
