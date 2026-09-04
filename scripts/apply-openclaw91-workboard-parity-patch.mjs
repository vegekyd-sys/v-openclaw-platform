#!/usr/bin/env node

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const distDir = resolve(args.get("--dist") || "");
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");
const maxPerOwner = positiveInteger(args.get("--max-per-owner"), 36);
const maxTotal = positiveInteger(args.get("--max-total"), 36);

if (!args.get("--dist")) {
  throw new Error("Usage: apply-openclaw91-workboard-parity-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--max-per-owner=36] [--max-total=36] [--dry-run]");
}

const runtimeMatches = readdirSync(distDir)
  .filter((name) => /^runtime-api-.*\.js$/.test(name))
  .map((name) => join(distDir, name))
  .filter((file) => readFileSync(file, "utf8").includes("workboard.cards.dispatchWithOptions"));
if (runtimeMatches.length !== 1) throw new Error(`Expected exactly one OpenClaw 9.1 Workboard runtime bundle, found ${runtimeMatches.length}`);
const sqliteMatches = readdirSync(distDir)
  .filter((name) => /^sqlite-store-.*\.js$/.test(name))
  .map((name) => join(distDir, name))
  .filter((file) => readFileSync(file, "utf8").includes("claimIfOwnerAvailable"));
if (sqliteMatches.length !== 1) throw new Error(`Expected exactly one OpenClaw 9.1 Workboard SQLite bundle, found ${sqliteMatches.length}`);

const file = runtimeMatches[0];
const sqliteFile = sqliteMatches[0];
const source = readFileSync(file, "utf8");
const sqliteSource = readFileSync(sqliteFile, "utf8");
const marker = "const NIGHTSHIFT_OPENCLAW91_WORKBOARD_PARITY_PATCH = 1;";
const sqliteMarker = `const NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH = ${maxPerOwner};`;
if (source.includes(marker) && sqliteSource.includes(sqliteMarker)) {
  process.stdout.write(`${JSON.stringify({ changed: false, file, sqliteFile, maxPerOwner, maxTotal, status: "already-patched" })}\n`);
  process.exit(0);
}

let updated = source;
if (!source.includes(marker)) {
updated = replaceOnce(updated,
  "const DEFAULT_DISPATCH_MAX_STARTS = 3;",
  [
    "const DEFAULT_DISPATCH_MAX_STARTS = 3;",
    marker,
    `const NIGHTSHIFT_DISPATCH_MAX_PER_OWNER = ${maxPerOwner};`,
    `const NIGHTSHIFT_DISPATCH_MAX_TOTAL = ${maxTotal};`,
  ].join("\n"),
  "dispatch constants",
);
updated = replaceOnce(updated,
  `\tasync list(options = {}) {\n\t\tconst boardId = normalizeBoardId(options.boardId);\n\t\treturn (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card).filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);\n\t}`,
  `\tasync list(options = {}) {\n\t\tconst boardId = normalizeBoardId(options.boardId);\n\t\tconst cardIds = Array.isArray(options.cardIds) ? [...new Set(options.cardIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))] : null;\n\t\tconst cards = cardIds ? (await Promise.all(cardIds.map((id) => this.get(id)))).filter((card) => Boolean(card)) : (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card);\n\t\treturn cards.filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);\n\t}`,
  "WorkboardStore.list",
);
updated = replaceOnce(updated,
  `\t\tconst boardId = typeof input === "number" ? void 0 : normalizeBoardId(input.boardId);\n\t\treturn await this.enqueueMutation(async () => {`,
  `\t\tconst boardId = typeof input === "number" ? void 0 : normalizeBoardId(input.boardId);\n\t\tconst cardIds = typeof input === "number" ? void 0 : Array.isArray(input.cardIds) ? input.cardIds : void 0;\n\t\treturn await this.enqueueMutation(async () => {`,
  "WorkboardStore.dispatch input",
);
updated = replaceOnce(updated,
  `\t\t\tfor (const card of await this.list({ boardId })) {`,
  `\t\t\tfor (const card of await this.list({ boardId, cardIds })) {`,
  "WorkboardStore.dispatch scan",
);
updated = replaceOnce(updated,
  `async function listWorkboardCards(store, boardId, redactCard) {\n\tconst [cards, { boards }] = await Promise.all([store.list({ boardId }), store.listBoards()]);`,
  `async function listWorkboardCards(store, boardId, cardIds, redactCard) {\n\tconst [cards, { boards }] = await Promise.all([store.list({ boardId, cardIds }), store.listBoards()]);`,
  "Gateway list helper",
);
updated = replaceOnce(updated,
  `async ({ params: requestParams }) => await listWorkboardCards(store, requestParams.boardId, redactClaimToken)`,
  `async ({ params: requestParams }) => await listWorkboardCards(store, requestParams.boardId, requestParams.cardIds, redactClaimToken)`,
  "Gateway list method",
);
updated = replaceOnce(updated,
  `\t\t\tconst rawMaxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;`,
  `\t\t\tconst rawMaxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;\n\t\t\tconst cardIds = requestParams && typeof requestParams === "object" && Array.isArray(requestParams.cardIds) ? requestParams.cardIds : void 0;`,
  "Gateway dispatch input",
);
updated = replaceOnce(updated,
  `\t\t\t\t\t\t...maxStarts !== void 0 ? { maxStarts } : {},`,
  `\t\t\t\t\t\t...maxStarts !== void 0 ? { maxStarts } : {},\n\t\t\t\t\t\t...cardIds !== void 0 ? { cardIds } : {},`,
  "Gateway dispatch options",
);
updated = replaceOnce(updated,
  `\tconst boardId = params.options?.boardId;\n\tconst directCardId = params.options?.cardId;`,
  `\tconst boardId = params.options?.boardId;\n\tconst cardIds = Array.isArray(params.options?.cardIds) ? params.options.cardIds : void 0;\n\tconst directCardId = params.options?.cardId;`,
  "dispatch card scope",
);
updated = replaceOnce(updated,
  `\t} : await params.store.dispatch({\n\t\tnow,\n\t\tboardId\n\t});`,
  `\t} : await params.store.dispatch({\n\t\tnow,\n\t\tboardId,\n\t\tcardIds\n\t});`,
  "dispatch store call",
);
updated = replaceOnce(updated,
  `\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId });`,
  `\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId, cardIds });`,
  "dispatch candidates",
);
updated = replaceOnce(updated,
  `\tconst selected = [];\n\tconst fallback = [];\n\tconst selectedOwners = /* @__PURE__ */ new Set();`,
  `\tconst runningTotal = [...runningByOwner.values()].reduce((sum, count) => sum + count, 0);\n\tconst remainingTotal = Math.max(0, NIGHTSHIFT_DISPATCH_MAX_TOTAL - runningTotal);\n\tif (remainingTotal <= 0) return { cards: [] };\n\tconst selected = [];\n\tconst fallback = [];\n\tconst selectedOwners = /* @__PURE__ */ new Set();`,
  "global capacity",
);
updated = replaceOnce(updated,
  `(runningByOwner.get(owner) ?? 0) > 0 ? \`Owner \${owner} already has active Workboard work; complete or stop it before starting another card.\` : void 0;`,
  `(runningByOwner.get(owner) ?? 0) >= NIGHTSHIFT_DISPATCH_MAX_PER_OWNER ? \`Owner \${owner} reached the Night Shift Workboard concurrency limit.\` : void 0;`,
  "owner capacity",
);
updated = replaceOnce(updated,
  `\t\tif (selectedOwners.has(owner)) {\n\t\t\tfallback.push(card);\n\t\t\tcontinue;\n\t\t}`,
  `\t\tif (selectedOwners.has(owner)) {\n\t\t\tfallback.push(card);\n\t\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);\n\t\t\tcontinue;\n\t\t}`,
  "fallback owner accounting",
);
updated = replaceOnce(updated,
  `\t\tselectedOwners.add(owner);\n\t\tselected.push(card);\n\t}\n\treturn { cards: [...selected, ...fallback] };`,
  `\t\tselectedOwners.add(owner);\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);\n\t}\n\treturn { cards: [...selected, ...fallback].slice(0, Math.min(limit, remainingTotal)) };`,
  "selection accounting",
);
updated = replaceOnce(updated,
  `\tconst startedOwners = /* @__PURE__ */ new Set();`,
  `\tconst startedByOwner = /* @__PURE__ */ new Map();`,
  "started owner state",
);
updated = replaceOnce(updated,
  `\t\tif (startedOwners.has(ownerId)) continue;`,
  `\t\tif ((startedByOwner.get(ownerId) ?? 0) >= NIGHTSHIFT_DISPATCH_MAX_PER_OWNER) continue;`,
  "started owner guard",
);
updated = replaceOnce(updated,
  `\t\t\tstartedOwners.add(ownerId);`,
  `\t\t\tstartedByOwner.set(ownerId, (startedByOwner.get(ownerId) ?? 0) + 1);`,
  "started owner accounting",
);
}

let sqliteUpdated = sqliteSource;
if (!sqliteSource.includes(sqliteMarker)) {
  sqliteUpdated = replaceOnce(sqliteUpdated,
    `var WorkboardSqliteCardStore = class {`,
    `${sqliteMarker}\nvar WorkboardSqliteCardStore = class {`,
    "SQLite owner cap marker",
  );
  sqliteUpdated = replaceOnce(sqliteUpdated,
    `\t\t\tconst preloaded = loadCardChildRows(this.db);\n\t\t\tfor (const row of rows) {\n\t\t\t\tconst card = readCard(this.db, row, preloaded);\n\t\t\t\tif (workboardCardConsumesOwnerSlot(card, now) && workboardCardSlotOwner(card) === ownerId) return "owner_busy";\n\t\t\t}`,
    `\t\t\tconst preloaded = loadCardChildRows(this.db);\n\t\t\tlet activeForOwner = 0;\n\t\t\tfor (const row of rows) {\n\t\t\t\tconst card = readCard(this.db, row, preloaded);\n\t\t\t\tif (workboardCardConsumesOwnerSlot(card, now) && workboardCardSlotOwner(card) === ownerId) activeForOwner += 1;\n\t\t\t\tif (activeForOwner >= NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH) return "owner_busy";\n\t\t\t}`,
    "SQLite atomic owner claim",
  );
}

for (const expected of [
  marker,
  "workboard.cards.dispatchWithOptions",
  "requestParams.cardIds",
  "store.list({ boardId, cardIds })",
  "NIGHTSHIFT_DISPATCH_MAX_PER_OWNER",
  "NIGHTSHIFT_DISPATCH_MAX_TOTAL",
]) {
  if (!updated.includes(expected)) throw new Error(`Patch verification failed: ${expected}`);
}
if (!sqliteUpdated.includes(sqliteMarker) || !sqliteUpdated.includes("activeForOwner >= NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH")) {
  throw new Error("SQLite owner-cap patch verification failed");
}

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  mkdirSync(backupDir, { recursive: true });
  if (updated !== source) {
    copyFileSync(file, join(backupDir, `${basename(file)}.before-openclaw91-workboard-parity`));
    writeFileSync(file, updated);
  }
  if (sqliteUpdated !== sqliteSource) {
    copyFileSync(sqliteFile, join(backupDir, `${basename(sqliteFile)}.before-openclaw91-workboard-parity`));
    writeFileSync(sqliteFile, sqliteUpdated);
  }
}

process.stdout.write(`${JSON.stringify({ changed: !dryRun && (updated !== source || sqliteUpdated !== sqliteSource), dryRun, file, sqliteFile, maxPerOwner, maxTotal })}\n`);

function replaceOnce(value, before, after, label) {
  const first = value.indexOf(before);
  if (first < 0) throw new Error(`OpenClaw 9.1 ${label} changed; refusing to patch`);
  if (value.indexOf(before, first + before.length) >= 0) throw new Error(`OpenClaw 9.1 ${label} is ambiguous; refusing to patch`);
  return `${value.slice(0, first)}${after}${value.slice(first + before.length)}`;
}

function positiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`Expected an integer between 1 and 100, received ${value}`);
  }
  return parsed;
}
