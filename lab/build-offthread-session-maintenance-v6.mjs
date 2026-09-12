import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v5";
const source = "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js";
const target = "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js";
const before = "8542275eb62892796ac9da2984ca5a98fffcf00a1bd0080ebe641d8a1b6ea96b";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (value, from, to) => {
  assert.equal(value.split(from).length, 2, `anchor drift: ${from.slice(0, 120)}`);
  return value.replace(from, to);
};

const result = JSON.parse(execFileSync(process.execPath, [
  "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
  "read-code",
  "--repo",
  "/Users/tianyicai/vlab-dev",
  "--target",
  target,
], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
assert.equal(result.current.release, baseRelease);
assert.equal(result.sha256, before);
let candidate = Buffer.from(result.content, "base64").toString();
assert.equal(sha(candidate), before);

candidate = once(candidate,
  `\t\tlet completed = false;\n\t\tlet generation = owner.generation;\n`,
  `\t\tlet completed = false;\n\t\tlet retryAfterForegroundActivity = false;\n\t\tlet generation = owner.generation;\n`,
);
candidate = once(candidate,
  `\t\t\tif (!incognito && await quietWindow.changed()) plan = void 0;\n`,
  `\t\t\tif (!incognito && await quietWindow.changed()) {\n\t\t\t\tplan = void 0;\n\t\t\t\tretryAfterForegroundActivity = isCurrent();\n\t\t\t}\n`,
);
candidate = once(candidate,
  `\t\t\tif (!incognito && !await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities)) plan = void 0;\n`,
  `\t\t\tif (!incognito && !await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities)) {\n\t\t\t\tplan = void 0;\n\t\t\t\tretryAfterForegroundActivity = isCurrent();\n\t\t\t}\n`,
);
candidate = once(candidate,
  `\t\t\tif (!plan) {\n\t\t\t\tif (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);\n`,
  `\t\t\tif (!plan) {\n\t\t\t\tif (retryAfterForegroundActivity && isCurrent()) continue;\n\t\t\t\tif (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);\n`,
);
candidate = once(candidate,
  `\t\t} catch (error) {\n\t\t\tif (!(error instanceof AutomaticSessionMaintenanceInterruptedError)) {\n`,
  `\t\t} catch (error) {\n\t\t\tif (error instanceof AutomaticSessionMaintenanceInterruptedError) {\n\t\t\t\tretryAfterForegroundActivity = isCurrent();\n\t\t\t} else {\n`,
);
candidate = once(candidate,
  `\t\t} finally {\n\t\t\tpermit.finish(completed);\n\t\t}\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;\n`,
  `\t\t} finally {\n\t\t\tpermit.finish(completed);\n\t\t}\n\t\tif (retryAfterForegroundActivity && isCurrent()) continue;\n\t\tif (maintenanceByStore.get(databasePath) !== owner) return;\n`,
);

const expected = fs.readFileSync(path.join(root, source), "utf8");
assert.equal(candidate, expected, "v6 candidate differs from deterministic patch");
console.log(JSON.stringify({
  baseRelease,
  files: [{ source, target, before, candidate: sha(candidate) }],
}, null, 2));
