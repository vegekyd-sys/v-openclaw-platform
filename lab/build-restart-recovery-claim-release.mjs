// Build lab/release-files/restart-recovery-claim-release/ from the stock openclaw 2026.9.1
// reply-admission-ticket chunk V runs unmodified (sha in release/captured/base/openclaw@2026.9.1.json).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchReplyAdmissionTicket } from './patch-restart-recovery-claim-release.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const CLAIM_RELEASE_NAME = 'reply-admission-ticket-QG2vY13O.js';
export const CLAIM_RELEASE_INPUT = `lab/fixtures/restart-recovery-claim-release/${CLAIM_RELEASE_NAME}`;
export const CLAIM_RELEASE_BEFORE = '3001280f0aece150bb3fb74057249cba88b9f3854c6dfd00de479d9fc3420227';
export const CLAIM_RELEASE_OUTPUT = `lab/release-files/restart-recovery-claim-release/${CLAIM_RELEASE_NAME}`;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const original = fs.readFileSync(path.join(repo, CLAIM_RELEASE_INPUT), 'utf8');
  if (sha(original) !== CLAIM_RELEASE_BEFORE) throw new Error(`Unexpected ${CLAIM_RELEASE_NAME} checksum: ${sha(original)}`);
  const patched = patchReplyAdmissionTicket(original);
  fs.writeFileSync(path.join(repo, CLAIM_RELEASE_OUTPUT), patched);
  console.log(JSON.stringify([{ source: CLAIM_RELEASE_OUTPUT, target: `openclaw/dist/${CLAIM_RELEASE_NAME}`, before: sha(original), after: sha(patched) }], null, 2));
}
