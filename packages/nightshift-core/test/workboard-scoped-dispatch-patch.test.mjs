import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../../../scripts/apply-workboard-scoped-dispatch-patch.mjs", import.meta.url);

test("patches Workboard list and dispatch to accept a bounded card id scope", () => {
  const root = mkdtempSync(join(tmpdir(), "workboard-scoped-dispatch-"));
  const dist = join(root, "dist");
  const backup = join(root, "backup");
  mkdirSync(dist);
  mkdirSync(backup);
  const bundle = join(dist, "runtime-api-fixture.js");
  writeFileSync(bundle, fixture());

  const result = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  const patched = readFileSync(bundle, "utf8");
  assert.equal(result.changed, true);
  assert.match(patched, /NIGHTSHIFT_SCOPED_CARD_IDS_PATCH = 1/);
  assert.match(patched, /Promise\.all\(cardIds\.map\(\(id\) => this\.get\(id\)\)\)/);
  assert.match(patched, /params\.store\.list\(Array\.isArray\(cardIds\) \? \{ cardIds \} : \{\}\)/);
  assert.match(patched, /cardIds: requestParams\.cardIds/);
  assert.match(patched, /cardIds: Array\.isArray\(cardIds\) \? cardIds : void 0/);
  assert.match(readFileSync(join(backup, "runtime-api-fixture.js.before-scoped-dispatch"), "utf8"), /workboard\.cards\.dispatch/);
  execFileSync(process.execPath, ["--check", bundle]);

  const second = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  assert.equal(second.status, "already-patched");
});

function fixture() {
  return `
function normalizeBoardId(value) { return value; }
function compareCards() { return 0; }
function cardBoardId$1(card) { return card.boardId; }
var WorkboardStore = class WorkboardStore {
\tasync list(options = {}) {
\t\tconst boardId = normalizeBoardId(options.boardId);
\t\treturn (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card).filter((card) => !boardId || cardBoardId$1(card) === boardId).toSorted(compareCards);
\t}
\tasync get(id) { return id; }
\tasync dispatch(input = Date.now()) {
\t\tconst now = typeof input === "number" ? input : 0;
\t\tconst boardId = typeof input === "number" ? void 0 : normalizeBoardId(input.boardId);
\t\treturn await this.enqueueMutation(async () => {
\t\t\tfor (const card of await this.list({ boardId })) { void card; }
\t\t});
\t}
};
async function dispatchAndStartWorkboardCards(params) {
\tconst now = params.options?.now ?? Date.now();
\tconst boardId = params.options?.boardId;
\tconst dispatch = await params.store.dispatch({
\t\tnow,
\t\tboardId
\t});
\tconst maxStarts = 3;
\tconst cards = await params.store.list();
\tconst candidates = await params.store.list({ boardId });
\treturn { dispatch, maxStarts, cards, candidates };
}
function register(api, store) {
\tapi.registerGatewayMethod("workboard.cards.list", async ({ params: requestParams, respond }) => {
\t\trespond(true, {
\t\t\tcards: (await store.list({ boardId: requestParams.boardId })).map(redactClaimToken),
\t\t\tstatuses: []
\t\t});
\t});
\tapi.registerGatewayMethod("workboard.cards.dispatch", async ({ params: requestParams, respond, client }) => {
\t\ttry {
\t\t\tconst boardId = requestParams && typeof requestParams === "object" && "boardId" in requestParams ? requestParams.boardId : void 0;
\t\t\tconst maxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;
\t\t\tconst result = await dispatchAndStartWorkboardCards({
\t\t\t\tstore,
\t\t\t\toptions: {
\t\t\t\t\tboardId: typeof boardId === "string" ? boardId : void 0,
\t\t\t\t\tmaxStarts: typeof maxStarts === "number" ? maxStarts : void 0,
\t\t\t\t\tallowManagedWorktrees: true
\t\t\t\t}
\t\t\t});
\t\t\trespond(true, result);
\t\t} catch (error) {}
\t});
}
`.trim();
}
