// Build lab/release-files/tool-preface/ from the npm 2026.9.1 bytes V runs (unmodified on V).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSystemPromptParams } from './patch-tool-preface.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'system-prompt-params-B645JcX8.js';
const original = fs.readFileSync(path.join(dir, 'fixtures/tool-preface', name), 'utf8');
const before = sha(original);
if (before !== '24d196636e47b585231ef18de8a4dbbafa8701aefb06c04b70b3c114f3fa1ec9') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchSystemPromptParams(original);
const source = `lab/release-files/tool-preface/${name}`;
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
