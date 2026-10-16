// Builds the projection-wait-inter-session release from V's exact bytes (lab/fixtures/projection-wait).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BUILTIN_BEFORE, BUILTIN_FILE, patchBuiltinProjectionWait } from "./patch-projection-wait-all-inter-session.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const source = readFileSync(path.join(root, "lab/fixtures/projection-wait", BUILTIN_FILE), "utf8");
assert.equal(sha256(source), BUILTIN_BEFORE, "fixture is not V's bytes");
const after = patchBuiltinProjectionWait(source);
const out = `lab/release-files/projection-wait/${BUILTIN_FILE}`;
mkdirSync(path.join(root, "lab/release-files/projection-wait"), { recursive: true });
writeFileSync(path.join(root, out), after);
const files = [{ source: out, target: `openclaw/dist/${BUILTIN_FILE}`, before: BUILTIN_BEFORE }];
writeFileSync(path.join(root, "lab/projection-wait-all-inter-session.plan.json"), `${JSON.stringify({ files }, null, 2)}\n`);
console.log(JSON.stringify({ file: BUILTIN_FILE, before: BUILTIN_BEFORE, after: sha256(after) }));
