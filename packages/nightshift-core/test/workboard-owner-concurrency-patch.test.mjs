import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const script = new URL("../../../scripts/apply-workboard-owner-concurrency-patch.mjs", import.meta.url);

for (const previousMax of [null, 3, 8]) {
  test(`patches Workboard dispatch capacity from ${previousMax ?? "upstream one-per-owner"} to 36 with a global reserve`, () => {
    const root = mkdtempSync(join(tmpdir(), "workboard-dispatch-capacity-"));
    const dist = join(root, "dist");
    const backup = join(root, "backup");
    mkdirSync(dist);
    mkdirSync(backup);
    const bundle = join(dist, "runtime-api-fixture.js");
    writeFileSync(bundle, fixture(previousMax));

    const result = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
    const patched = readFileSync(bundle, "utf8");
    assert.equal(result.maxPerOwner, 36);
    assert.equal(result.maxTotal, 36);
    assert.match(patched, /DEFAULT_DISPATCH_MAX_PER_OWNER = 36/);
    assert.match(patched, /DEFAULT_DISPATCH_MAX_TOTAL = 36/);
    assert.match(patched, /runningTotal >= DEFAULT_DISPATCH_MAX_TOTAL/);
    assert.match(patched, /maxStarts: typeof maxStarts === "number" \? maxStarts : void 0/);
    assert.match(readFileSync(join(backup, "runtime-api-fixture.js"), "utf8"), /DEFAULT_DISPATCH_MAX_STARTS = 3/);
    execFileSync(process.execPath, ["--check", bundle]);

    const second = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
    assert.equal(second.status, "already-patched");
  });
}

function fixture(previousMax) {
  const constants = previousMax == null
    ? "const DEFAULT_DISPATCH_MAX_STARTS = 3;"
    : `const DEFAULT_DISPATCH_MAX_STARTS = 3;\nconst DEFAULT_DISPATCH_MAX_PER_OWNER = ${previousMax};`;
  const ownerSelection = previousMax == null
    ? "\t\tif ((runningByOwner.get(owner) ?? 0) > 0) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, 1);"
    : "\t\tif ((runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);";
  return [
    constants,
    "function selectStartableCards(cards, limit, candidates = cards) {",
    "\tif (limit <= 0) return [];",
    "\tconst runningByOwner = new Map();",
    "\tfor (const card of cards) {",
    "\t\tif (card.status !== \"running\") continue;",
    "\t\tconst owner = card.agentId ?? DEFAULT_DISPATCH_OWNER;",
    "\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);",
    "\t}",
    "\tconst selected = [];",
    "\tfor (const card of candidates.filter((entry) => entry.status === \"ready\")) {",
    "\t\tconst owner = card.agentId ?? DEFAULT_DISPATCH_OWNER;",
    ownerSelection,
    "\t\tif (selected.length >= limit) break;",
    "\t}",
    "\treturn selected;",
    "}",
    "function register(api) {",
    "\tapi.registerGatewayMethod(\"workboard.cards.dispatch\", async ({ params: requestParams, respond, client }) => {",
    "\t\ttry {",
    "\t\t\tconst boardId = requestParams && typeof requestParams === \"object\" && \"boardId\" in requestParams ? requestParams.boardId : void 0;",
    "\t\t\tconst result = await dispatchAndStartWorkboardCards({",
    "\t\t\t\toptions: {",
    "\t\t\t\t\tboardId: typeof boardId === \"string\" ? boardId : void 0,",
    "\t\t\t\t\tallowManagedWorktrees: true",
    "\t\t\t\t}",
    "\t\t\t});",
    "\t\t\trespond(true, result);",
    "\t\t} catch (error) {}",
    "\t});",
    "}",
  ].join("\n");
}
