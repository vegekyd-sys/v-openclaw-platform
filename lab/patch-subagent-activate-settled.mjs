#!/usr/bin/env node
// subagent-activate-settled-v1: Gateway start stops reading the child session of every settled
// subagent run before "ready".
//
// V 2026-11-28 23:41 (v-self-restart 20261128-234136-899e): "startup outcomes" +90.6 s after
// systemd Start, "[gateway] ready" +157.8 s, and nothing logged in between; liveness then reported
// the main thread 46.5 s overdue and the heap at 6.57 GiB. Between those two lines the Gateway runs
// activateSubagentRegistry, whose activateRestoredRuns reads each restored run's child session entry
// (to skip aborted ones) before handing the run to resumeSubagentRun. V's subagent_runs holds
// 33,729 rows; 33,723 are terminal with cleanupCompletedAt set (30,987 Workboard cards, 2,405
// meeting-bridge runs, all cleanup=keep, never archived), and their child entries average 103.5 KB
// (300-row sample), ~3.4 GB of JSON read and kept for the length of the loop. resumeSubagentRun
// returns at its cleanupCompletedAt check for every one of them without touching the entry.
//
// After: a run with cleanupCompletedAt, no requesterSettleWake (resume checks that first) and not
// owned by interrupted recovery (resume marks those resumed) is skipped before the read. For it the
// old path read the entry and then either skipped resume (aborted) or called a resume that returned
// immediately; neither changes state, so skipping both changes nothing. Every other run keeps the
// read and the resume. OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED=0 (Gateway process) restores the read
// for every run.
//
// Source: vegekyd-sys/openclaw-versa versa/port-subagent-activate-settled-20261129
// (isSettledRunWithNothingToResume, subagent-registry-restore-activate.test.ts), based on
// 4ee0e038099, the commit V's current bytes of this chunk map to.
//
//   node lab/patch-subagent-activate-settled.mjs <dist dir with V's bytes> <out dir>
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "subagent-activate-settled-v1";
export const FILES = {
  registry: {
    path: "subagent-registry-C24yr_PF.js",
    before: "52b3b5717199f3d60bc600c2d5dbadbcd8af5dcfdb6943ac50f9412a23c86557",
  },
};

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchRegistry(source) {
  assert(!source.includes(MARKER), "registry already patched");
  let out = replaceOnce(
    source,
    "function isRestoredQueuedFailureSettlementClaimed(entry) {\n\treturn restoredQueuedFailureSettlementClaims.has(entry);\n}\n",
    "function isRestoredQueuedFailureSettlementClaimed(entry) {\n\treturn restoredQueuedFailureSettlementClaims.has(entry);\n}\n"
      + `// ${MARKER}: resumeSubagentRun returns without effect for these rows; skip their child session read.\n`
      + "function isSettledRunWithNothingToResume(entry) {\n"
      + "\treturn process.env.OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED !== \"0\" && Boolean(entry.cleanupCompletedAt) && !entry.requesterSettleWake && entry.terminalOwner !== \"interrupted-recovery\";\n"
      + "}\n",
    "isRestoredQueuedFailureSettlementClaimed",
  );
  out = replaceOnce(
    out,
    "\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tif (loadSubagentSessionEntry({\n\t\t\t\tchildSessionKey: entry.childSessionKey,\n\t\t\t\tstoreCache: restoredSessionCache\n\t\t\t})?.abortedLastRun === true) continue;\n\t\t\tresumeRun(runId);\n",
    "\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tif (isSettledRunWithNothingToResume(entry)) continue;\n\t\t\tif (loadSubagentSessionEntry({\n\t\t\t\tchildSessionKey: entry.childSessionKey,\n\t\t\t\tstoreCache: restoredSessionCache\n\t\t\t})?.abortedLastRun === true) continue;\n\t\t\tresumeRun(runId);\n",
    "activation child read",
  );
  return out;
}

export function buildFromDist(distDir, outDir) {
  const src = fs.readFileSync(path.join(distDir, FILES.registry.path), "utf8");
  assert.equal(sha256(src), FILES.registry.before, `${FILES.registry.path} is not V's current bytes`);
  const after = patchRegistry(src);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, FILES.registry.path), after);
  return { [FILES.registry.path]: { before: FILES.registry.before, after: sha256(after) } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir, outDir] = process.argv.slice(2);
  assert(distDir && outDir, "usage: patch-subagent-activate-settled.mjs <dist dir> <out dir>");
  console.log(JSON.stringify(buildFromDist(distDir, outDir), null, 2));
}
