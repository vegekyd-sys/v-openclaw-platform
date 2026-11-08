// Build lab/release-files/session-event-snapshot-coalesce/ from V's bytes and print before/after hashes.
//   node lab/build-session-event-snapshot.mjs <V core dist dir>
// Writes the release file (the change), and for candidates only (not committed):
//   probe-v/        V's bytes + instrumentation
//   probe-patched/  the change + instrumentation (A/B with OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, PATCH, RELEASE_DIR, patchFile, probeFile, sha256, unpatchFile } from "./patch-session-event-snapshot.mjs";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = process.argv[2];
if (!dist) throw new Error("usage: build-session-event-snapshot.mjs <V core dist dir>");
const write = (rel, text) => {
  const file = path.join(repo, RELEASE_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return sha256(text);
};
const out = { release: [], probeV: [], probePatched: [] };
for (const [name, spec] of Object.entries(FILES)) {
  const source = fs.readFileSync(path.join(dist, name), "utf8");
  if (sha256(source) !== spec.before) throw new Error(`${name} is not V's bytes`);
  const patched = PATCH[name] ? patchFile(name, source) : source;
  if (PATCH[name]) {
    if (unpatchFile(name, patched) !== source) throw new Error(`${name}: unpatch does not restore V's bytes`);
    out.release.push({ source: `${RELEASE_DIR}/${name}`, target: spec.target, before: spec.before, after: write(name, patched) });
  }
  out.probeV.push({ source: `${RELEASE_DIR}/probe-v/${name}`, target: spec.target, before: spec.before, after: write(`probe-v/${name}`, probeFile(name, source)) });
  out.probePatched.push({ source: `${RELEASE_DIR}/probe-patched/${name}`, target: spec.target, before: spec.before, after: write(`probe-patched/${name}`, probeFile(name, patched)) });
}
console.log(JSON.stringify(out, null, 2));
