import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vlab = "/Users/tianyicai/vlab-dev/lab/vlab.mjs";
const repo = "/Users/tianyicai/vlab-dev";
const files = [
  { source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js", target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js", before: "b11b12cd3e832fe9d915ff566a3aac0590abbf31a8f2c665adf8188054bcbfaf" },
  { source: "lab/release-files/automatic-session-maintenance.worker.mjs", target: "openclaw/dist/automatic-session-maintenance.worker.mjs", before: "d9d16835b86a7afa2dad0bbed161112eee4be81b90a859f47469bbf54d38f556" },
];

function readCode(file) {
  const result = JSON.parse(execFileSync(process.execPath, [vlab, "read-code", "--repo", repo,
    "--target", file.target], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  assert.equal(result.sha256, file.before, `${file.target} deployed source drift`);
  return Buffer.from(result.content, "base64").toString("utf8");
}
function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} anchor drift`);
  return source.replace(before, after);
}
function removeTraceCalls(source) {
  while (source.includes("traceAutomaticMaintenance(")) {
    const start = source.indexOf("traceAutomaticMaintenance(");
    const lineStart = source.lastIndexOf("\n", start) + 1;
    let depth = 0;
    let quote;
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = undefined;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      if (depth === 0 && source.slice(index, index + 2) === ");") {
        end = source.indexOf("\n", index + 2) + 1;
        break;
      }
    }
    assert(end > lineStart, "unterminated maintenance trace call");
    source = source.slice(0, lineStart) + source.slice(end);
  }
  return source;
}

const entry = files[0];
let entryCandidate = readCode(entry);
const traceStart = entryCandidate.indexOf("function traceAutomaticMaintenance(");
const traceEnd = entryCandidate.indexOf("async function waitForAutomaticMaintenanceAdmissionsToDrain(");
assert(traceStart > 0 && traceEnd > traceStart, "maintenance trace helper drift");
entryCandidate = entryCandidate.slice(0, traceStart) + entryCandidate.slice(traceEnd);
entryCandidate = removeTraceCalls(entryCandidate);
entryCandidate = replaceExactlyOnce(entryCandidate,
  `\t\t\tconst changedAfterPlan = !incognito && await quietWindow.changed();\n\t\t\tif (changedAfterPlan) {`,
  `\t\t\tif (!incognito && await quietWindow.changed()) {`, "post-plan quiet check");
entryCandidate = replaceExactlyOnce(entryCandidate,
  `\t\t\tconst admissionsDrained = incognito || await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities);\n\t\t\tif (!admissionsDrained) {`,
  `\t\t\tif (!incognito && !await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities)) {`, "admission drain check");
assert.equal(entryCandidate, fs.readFileSync(path.join(root, entry.source), "utf8"),
  "v11 entry candidate differs from diagnostic-free source");

const worker = files[1];
let workerCandidate = readCode(worker);
workerCandidate = replaceExactlyOnce(workerCandidate,
  `const TRANSCRIPT_SIZE_BATCH = 64;\n`,
  `const TRANSCRIPT_SIZE_BATCH = 64;\n\nfunction runAutomaticMaintenanceReadSnapshot(database, operation) {\n` +
  `  return database.db.isTransaction\n    ? operation()\n` +
  `    : runSqliteDeferredTransactionSync(database.db, operation);\n}\n`, "snapshot helper");
workerCandidate = replaceExactlyOnce(workerCandidate,
  `  const opened = withOpenClawAgentDatabaseReadOnly((database) =>\n` +
  `    runSqliteDeferredTransactionSync(database.db, () => attachArchiveByteSizes(database,`,
  `  const opened = withOpenClawAgentDatabaseReadOnly((database) =>\n` +
  `    runAutomaticMaintenanceReadSnapshot(database, () => attachArchiveByteSizes(database,`, "nested transaction");
assert.equal(workerCandidate, fs.readFileSync(path.join(root, worker.source), "utf8"),
  "v11 worker candidate differs from deterministic patch");

console.log(JSON.stringify(files.map((file) => ({ ...file,
  bytes: Buffer.byteLength(file === entry ? entryCandidate : workerCandidate) })), null, 2));
