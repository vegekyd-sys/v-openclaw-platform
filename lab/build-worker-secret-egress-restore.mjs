// Restore the existing native egress hook on the current composed Worker without
// replacing its later voice, heartbeat, startup, telemetry or fallback behavior.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorker } from './patch-worker-secret-egress.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const BEFORE = '198bd1f5c254802f8112df4203a61c18ca98a6a9f23b03cb1c8493d10ec82fde';
export const AFTER = 'b4778b2ff804b9e6e39650c7778aadaa608b0de7c3a0c3c117a46a75b0d95353';
export const sha = value => createHash('sha256').update(value).digest('hex');

export function restoredWorker(source) {
  if (sha(source) !== BEFORE) throw new Error('Worker baseline changed; rebase and validate instead of overwriting it');
  const result = patchWorker(source);
  if (sha(result) !== AFTER) throw new Error('Unexpected composed Worker output');
  return result;
}

export function build() {
  const source = fs.readFileSync(path.join(dir, 'release-files/upstream-5xx-fallback/worker.mjs'), 'utf8');
  const target = path.join(dir, 'release-files/worker-secret-egress-restore/worker.mjs');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, restoredWorker(source));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
