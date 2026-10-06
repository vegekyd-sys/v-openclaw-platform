// Build lab/release-files/gateway-first-message/ from V's live bytes: get-reply from the
// captured release (V patches it), the reply facade and the post-attach chunk from the npm
// 2026.9.1 bytes (unmodified on V).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchGetReplyChunk, patchPostAttach, patchReplyFacade } from './patch-gateway-first-message.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006');
const fixtures = path.join(dir, 'fixtures/gateway-first-message');
const files = [
  { from: `${captured}/dist/get-reply-CqW1y05D.js`, name: 'get-reply-CqW1y05D.js', target: 'openclaw/dist/get-reply-CqW1y05D.js', patch: patchGetReplyChunk },
  { from: `${fixtures}/get-reply-from-config.runtime-CWdWv_c6.js`, name: 'get-reply-from-config.runtime-CWdWv_c6.js', target: 'openclaw/dist/get-reply-from-config.runtime-CWdWv_c6.js', patch: patchReplyFacade },
  { from: `${fixtures}/server-startup-post-attach-BPE6Pv6n.js`, name: 'server-startup-post-attach-BPE6Pv6n.js', target: 'openclaw/dist/server-startup-post-attach-BPE6Pv6n.js', patch: patchPostAttach },
];
const expected = {
  'get-reply-CqW1y05D.js': 'fcfca37fee6b490c0b6bf1848a8e591aaf2a043c9a41271e1e40050097239f36',
  'get-reply-from-config.runtime-CWdWv_c6.js': '71de3e3eb7d635cf206390049193043adaf4ebb0b4deaa7cc0a5080977c389c8',
  'server-startup-post-attach-BPE6Pv6n.js': 'fbf799ddfc65ddb1ad75c1b285ab6fedc3a842d20b793bc0ef03a112c9941079',
};
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.from, 'utf8');
  const before = sha(original);
  if (before !== expected[file.name]) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/gateway-first-message/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
