import { createHash } from 'node:crypto';

// `openclaw infer` / `openclaw capability` ran the config guard's state migration preflight on every
// call. On V (862 MB state database, Gateway writing it continuously) that preflight spawned a child
// that took a full sqlite.backup() of the state database only to read its ownership row (5-6 s, up to
// 18 s when Gateway writes restart the backup), then integrity-checked the same database under the
// state write coordinator (1.4-1.5 s). One-shot inference does not own state; Gateway startup and
// Doctor still run state migrations. See docs/infer-latency-20261117.md.
//
// Source: vegekyd-sys/openclaw-versa versa/port-infer-latency-20261117 @ b94693e56a9 (on ca32fca3e29).

export const MARKER = 'infer-skip-state-preflight';
export const CONFIG_GUARD = 'config-guard--4cC6uJU.js';
// npm 2026.9.1 bytes, unchanged on V (db91-release-v2026.9.1-db91.6/core/dist, 2026-11-17).
export const CONFIG_GUARD_BEFORE_SHA = '8a221eb34c58271215cf5305c696376dc861e19a2a67e00965deb05acbae4f9d';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const GUARD_LINE_START = '\tconst shouldConsiderStateMigration = !params.validateConfigOnly && commandName !== "config" && commandName !== "health" && commandName !== "logs" && commandName !== "sessions" && ';

const EDITS = [
  [
    GUARD_LINE_START,
    `\t// ${MARKER}: one-shot inference is a provider surface, not a state owner; its preflight\n` +
      '\t// snapshotted and integrity-checked the whole state database on every call.\n' +
      `${GUARD_LINE_START}commandName !== "infer" && commandName !== "capability" && `,
  ],
];

const apply = (source, edits, label) => {
  if (source.includes(MARKER)) throw new Error(`${label} is already patched`);
  return edits.reduce((text, [before, after]) => {
    if (text.split(before).length !== 2) throw new Error(`${label}: expected one match for ${JSON.stringify(before.slice(0, 60))}`);
    return text.replace(before, () => after);
  }, source);
};
const revert = (source, edits, label) => [...edits].reverse().reduce((text, [before, after]) => {
  if (text.split(after).length !== 2) throw new Error(`${label}: expected one patched block ${JSON.stringify(after.slice(0, 60))}`);
  return text.replace(after, () => before);
}, source);

export const patchConfigGuard = (source) => apply(source, EDITS, CONFIG_GUARD);
export const unpatchConfigGuard = (source) => revert(source, EDITS, CONFIG_GUARD);
