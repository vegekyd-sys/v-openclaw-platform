import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// The embedded attempt skips the whole subagent registry when the session cannot have an active run.
//
// buildActiveSubagentSystemPromptAddition asks, on every embedded attempt, whether the session has an
// active subagent. It answered through listControlledSubagentRuns, which reads every subagent_runs row
// with its payload and sorts them by created_at, run_id with no index (V, 2026-10-31: 13,550 rows,
// 217 MB of payload, 13,549 of them finished; 678 MB read through a temporary b-tree, then every
// payload parsed). The Worker's main thread spent 2.1-2.4 s there before each model call, whatever the
// session's size. The Codex harness does not build this addition, which is most of why /vds reaches its
// run start about 2.5 s sooner.
//
// A check through the requester and controller indexes now answers "nothing here can be active" and
// returns early. Whenever a reachable run is not ended and cleaned up, the original path runs unchanged.
// OPENCLAW_V_SUBAGENT_ACTIVE_PRECHECK=0 restores the original path every time.

export const MARKER = 'subagent-active-precheck';
export const NAME = 'history-image-prune-Dg0CDQ4a.js';
export const HELPER = 'v-subagent-active-precheck.mjs';
export const BEFORE_SHA = 'dbe28902fd72d4620e1cbd16ad03daab58758011e5692d0705957583e3e24c49';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const IMPORT_BEFORE = 'import { c as listControlledSubagentRuns } from "./subagent-control-scope-DA4oSvgr.js";\n';
const IMPORT_AFTER = `${IMPORT_BEFORE}import { i as openOpenClawStateDatabase } from "./openclaw-state-db-Bh3Bq87y.js";
import { w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { mayHaveActiveSubagentRuns } from "./${HELPER}";
`;

const CALL_BEFORE = `\tconst runs = listControlledSubagentRuns(controllerSessionKey, params.controllerAgentId, params.cfg);
\tif (runs.length === 0) return;
\tconst list = buildSubagentList({`;
const CALL_AFTER = `\t// ${MARKER}: only read the whole registry when something here can be active.
\tif (process.env.OPENCLAW_V_SUBAGENT_ACTIVE_PRECHECK !== "0") try {
\t\tif (!mayHaveActiveSubagentRuns(openOpenClawStateDatabase().db, subagentRuns, controllerSessionKey)) return;
\t} catch {}
${CALL_BEFORE}`;

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);

export function patchHistoryImagePrune(source) {
  assert(!source.includes(MARKER), 'history-image-prune already patched');
  once(source, IMPORT_BEFORE, 'control scope import');
  once(source, CALL_BEFORE, 'active subagent listing');
  return source.replace(IMPORT_BEFORE, IMPORT_AFTER).replace(CALL_BEFORE, CALL_AFTER);
}

export function unpatchHistoryImagePrune(source) {
  assert(source.includes(MARKER), 'history-image-prune not patched');
  once(source, IMPORT_AFTER, 'patched import');
  once(source, CALL_AFTER, 'patched listing');
  return source.replace(IMPORT_AFTER, IMPORT_BEFORE).replace(CALL_AFTER, CALL_BEFORE);
}
