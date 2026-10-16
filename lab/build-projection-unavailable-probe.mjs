// Candidate-only probe (never released): logs where a read finds the transcript projection
// unavailable, as one stderr line per throw: [projection-unavailable-probe] {pid, sessionId, stack}.
// Built from V's db91.6 session-accessor bytes (lab/fixtures/projection-wait).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "session-accessor-K0XuW6ln.js";
const BEFORE = "30c7b9d6e3d9baf842e51f4811708b0f21a95c5cd36ebc150b2dd7a2fed2c15d";
const source = readFileSync(path.join(root, "lab/fixtures/projection-wait", FILE), "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), BEFORE, "fixture is not V's bytes");
const anchor = "\tthrow new SessionTranscriptProjectionUnavailableError(resolved.sessionId);\n}\n//#endregion\n//#region src/config/sessions/session-accessor.sqlite-reset-window.ts";
assert.equal(source.split(anchor).length, 2, "probe anchor");
const probe = "\tprocess.stderr.write(`[projection-unavailable-probe] ${JSON.stringify({ pid: process.pid, sessionId: resolved.sessionId, stack: String(new Error().stack).split(\"\\n\").slice(1, 30).map((s) => s.trim().replace(/^at /u, \"\").replace(/\\(file:[^)]*\\/dist\\//u, \"(\")).join(\" < \") })}\\n`);\n";
const after = source.replace(anchor, probe + anchor);
const out = path.join(root, "lab/release-files/projection-wait/probe", FILE);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, after);
console.log(JSON.stringify({ file: FILE, before: BEFORE, after: createHash("sha256").update(after).digest("hex") }));
