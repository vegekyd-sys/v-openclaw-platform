// Rebuild lab/release-files/settled-tool-handoff from V's bytes:
//   node lab/build-settled-tool-handoff.mjs --base <dir with core/dist/* and worker/* as on V>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FILES } from "./patch-settled-tool-handoff.mjs";

const base = process.argv[process.argv.indexOf("--base") + 1];
assert(process.argv.includes("--base") && base, "usage: --base <V runtime dir>");
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), "release-files", "settled-tool-handoff");
fs.mkdirSync(outDir, { recursive: true });
for (const file of FILES) {
  const source = fs.readFileSync(path.join(base, file.base, file.name), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), file.before, `${file.name} is not V's bytes`);
  fs.writeFileSync(path.join(outDir, file.name), file.patch(source));
  console.log(`${file.target}/${file.name}`);
}
