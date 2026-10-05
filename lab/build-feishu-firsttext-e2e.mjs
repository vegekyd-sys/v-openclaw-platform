// Build lab/release-files/feishu-firsttext-e2e/ from V's live Feishu plugin bytes (captured 2026-10-05).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchFeishuMonitor } from './patch-feishu-firsttext-e2e.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const input = path.join(repo, 'release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005.feishu/dist/dist/monitor.account-WFdlCDhR.js');
const before = 'b9ba9fc84c9ce64a';
const original = fs.readFileSync(input, 'utf8');
if (!sha(original).startsWith(before)) throw new Error(`Unexpected input checksum ${sha(original)}`);
const patched = patchFeishuMonitor(original);
const source = 'lab/release-files/feishu-firsttext-e2e/monitor.account-WFdlCDhR.js';
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, before: sha(original), after: sha(patched) }, null, 2));
