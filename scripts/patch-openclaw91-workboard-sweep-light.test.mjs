import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, PATCH_MARKER } from "./patch-openclaw91-workboard-sweep-light.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "..", "lab", "fixtures", "workboard-sweep-light");
const RELEASE = path.join(here, "..", "lab", "release-files", "workboard-sweep-light");
const read = (dir, file) => readFileSync(path.join(dir, file), "utf8");

test("each file patches once, is idempotent and matches the release file", () => {
  for (const [file, patch] of Object.entries(FILES)) {
    const { changed, source } = patch(read(FIXTURES, file));
    assert.equal(changed, true, file);
    assert(source.includes(PATCH_MARKER), file);
    assert.equal(patch(source).changed, false, `${file} idempotent`);
    assert.equal(source, read(RELEASE, file), `${file} release bytes`);
  }
});

test("a drifted file is refused instead of half-patched", () => {
  for (const [file, patch] of Object.entries(FILES)) {
    assert.throws(() => patch(`/* ${PATCH_MARKER} */`), /partial or drifted/, file);
    assert.throws(() => patch("const unrelated = 1;"), /anchor not found/, file);
  }
});

test("lifecycleOnly never widens visibility: it applies only without an entry filter", () => {
  const source = read(RELEASE, "sessions-read-C6mAMxyQ.js");
  assert.match(source, /const lifecycleOnly = p\.lifecycleOnly === true && !visibilityFilter;/);
  // The later visibility filter still runs for every caller.
  assert.match(source, /const currentVisibilityFilter = sharing\.entryFilter;/);
  assert.match(read(RELEASE, "src-B9mb84px.js"), /\tlifecycleOnly: Type\.Optional\(Type\.Boolean\(\)\),\n/);
  assert.match(read(RELEASE, "extensions/workboard/index.js"), /configuredAgentsOnly: true,\n\t\tlifecycleOnly: true,\n/);
});

test("syncLifecycle keeps its patch builder byte for byte, now shared with the sweep precheck", () => {
  const original = read(FIXTURES, "runtime-api-1CCazqtv.js");
  const patched = read(RELEASE, "runtime-api-1CCazqtv.js");
  const head = "\tasync syncLifecycle(id, input) {\n\t\treturn await this.enqueueMutation(async () => {\n\t\t\treturn (await this.updateLatestCard(id, (card) => {\n";
  const tail = "\t\t\t}, { allowAutomationLaunch: true })).updated;\n";
  const start = original.indexOf(head) + head.length;
  const body = original.slice(start, original.indexOf(tail, start));
  const hoisted = body.split("\n").map((line) => line.startsWith("\t\t") ? line.slice(2) : line).join("\n");
  assert(patched.includes(`\tlifecycleSyncPatch(card, input) {\n${hoisted}\t}\n`));
  assert(patched.includes("(await this.updateLatestCard(id, (card) => this.lifecycleSyncPatch(card, input), { allowAutomationLaunch: true })).updated"));
  // Outside syncLifecycle the file is unchanged.
  let prefix = 0;
  while (original[prefix] === patched[prefix]) prefix += 1;
  let suffix = 0;
  while (original[original.length - 1 - suffix] === patched[patched.length - 1 - suffix]) suffix += 1;
  const methodStart = original.indexOf("\tasync syncLifecycle(id, input) {\n");
  const methodEnd = original.indexOf(tail, methodStart) + tail.length;
  assert(prefix >= methodStart && original.length - suffix <= methodEnd, "only syncLifecycle differs");
});

test("the sweep skips a card only when the store's own builder returns no patch", () => {
  const source = read(RELEASE, "extensions/workboard/index.js");
  assert.match(source, /params\.store\.lifecycleSyncPatch\(card, workboardLifecycleSyncInput\(\{\n\t\t\tobservation,\n\t\t\tnow,\n\t\t\tassociation\n\t\t\}\)\) === void 0\) continue;/);
  assert.match(source, /return await params\.store\.syncLifecycle\(params\.cardId, workboardLifecycleSyncInput\(params\)\);/);
});
