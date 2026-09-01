#!/usr/bin/env node

import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const distDir = resolve(args.get("--dist") || "");
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");

if (!args.get("--dist")) {
  throw new Error("Usage: apply-workboard-scoped-dispatch-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--dry-run]");
}

const matches = readdirSync(distDir)
  .filter((name) => /^runtime-api-.*\.js$/.test(name))
  .map((name) => join(distDir, name))
  .filter((file) => readFileSync(file, "utf8").includes("workboard.cards.dispatch"));
if (matches.length !== 1) throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);

const file = matches[0];
const source = readFileSync(file, "utf8");
const marker = "const NIGHTSHIFT_SCOPED_CARD_IDS_PATCH = 1;";
if (source.includes(marker)) {
  process.stdout.write(`${JSON.stringify({ changed: false, file, status: "already-patched" })}\n`);
  process.exit(0);
}

let updated = source;
const openClaw2026081 = source.includes("async function listWorkboardCards(store, boardId, redactCard)");
if (openClaw2026081) {
  updated = patchStoreList2026081(updated, marker);
  updated = patchStoreDispatch(updated);
  updated = patchDispatchAndStart2026081(updated);
  updated = patchGatewayMethods2026081(updated);
} else {
  updated = patchStoreList(updated, marker);
  updated = patchStoreDispatch(updated);
  updated = patchDispatchAndStart(updated);
  updated = patchGatewayMethods(updated);
}

for (const expected of [
  marker,
  openClaw2026081 ? "listWorkboardCards(store, requestParams, redactClaimToken)" : "cardIds: requestParams.cardIds",
  openClaw2026081 ? "...Array.isArray(cardIds) ? { cardIds } : {}" : "cardIds: Array.isArray(cardIds) ? cardIds : void 0",
  "const cardIds = Array.isArray(params.options?.cardIds) ? params.options.cardIds : void 0;",
]) {
  if (!updated.includes(expected)) throw new Error(`Patch verification failed: ${expected}`);
}

function patchStoreList2026081(value, patchMarker) {
  const original = `var WorkboardStore = class WorkboardStore extends WorkboardNotificationStore {\n`;
  if (!value.includes(original)) throw new Error("OpenClaw 2026.8.1 WorkboardStore declaration changed; refusing to patch");
  let next = value.replace(original, `${patchMarker}\n${original}`);
  const listOriginal = `\tasync list(options = {}) {\n\t\tconst boardId = normalizeBoardId(options.boardId);\n\t\treturn (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card).filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);\n\t}`;
  const listScoped = `\tasync list(options = {}) {\n\t\tconst boardId = normalizeBoardId(options.boardId);\n\t\tconst cardIds = Array.isArray(options.cardIds) ? [...new Set(options.cardIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))] : null;\n\t\tconst cards = cardIds ? (await Promise.all(cardIds.map((id) => this.get(id)))).filter((card) => Boolean(card)) : (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card);\n\t\treturn cards.filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);\n\t}`;
  if (!next.includes(listOriginal)) throw new Error("OpenClaw 2026.8.1 WorkboardStore.list changed; refusing to patch");
  return next.replace(listOriginal, listScoped);
}
if (updated === source) throw new Error("Patch did not change the Workboard runtime bundle");

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  copyFileSync(file, join(backupDir, `${basename(file)}.before-scoped-dispatch`));
  writeFileSync(file, updated);
}

process.stdout.write(`${JSON.stringify({ changed: !dryRun, dryRun, file })}\n`);

function patchStoreList(value, patchMarker) {
  const original = `var WorkboardStore = class WorkboardStore {
`;
  if (!value.includes(original)) throw new Error("OpenClaw WorkboardStore declaration changed; refusing to patch");
  let next = value.replace(original, `${patchMarker}\n${original}`);
  const listOriginal = `\tasync list(options = {}) {
\t\tconst boardId = normalizeBoardId(options.boardId);
\t\treturn (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card).filter((card) => !boardId || cardBoardId$1(card) === boardId).toSorted(compareCards);
\t}`;
  const listScoped = `\tasync list(options = {}) {
\t\tconst boardId = normalizeBoardId(options.boardId);
\t\tconst cardIds = Array.isArray(options.cardIds) ? [...new Set(options.cardIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))] : null;
\t\tconst cards = cardIds ? (await Promise.all(cardIds.map((id) => this.get(id)))).filter((card) => Boolean(card)) : (await this.store.entries()).map((entry) => entry.value).filter((entry) => entry?.version === 1 && Boolean(entry.card?.id)).map((entry) => entry.card);
\t\treturn cards.filter((card) => !boardId || cardBoardId$1(card) === boardId).toSorted(compareCards);
\t}`;
  if (!next.includes(listOriginal)) throw new Error("OpenClaw WorkboardStore.list changed; refusing to patch");
  return next.replace(listOriginal, listScoped);
}

function patchStoreDispatch(value) {
  const boardLine = `\t\tconst boardId = typeof input === "number" ? void 0 : normalizeBoardId(input.boardId);`;
  const cardIdsLine = `\t\tconst cardIds = typeof input === "number" ? void 0 : Array.isArray(input.cardIds) ? input.cardIds : void 0;`;
  if (!value.includes(boardLine)) throw new Error("OpenClaw WorkboardStore.dispatch input changed; refusing to patch");
  let next = value.replace(boardLine, `${boardLine}\n${cardIdsLine}`);
  const listOriginal = `\t\t\tfor (const card of await this.list({ boardId })) {`;
  if (!next.includes(listOriginal)) throw new Error("OpenClaw WorkboardStore.dispatch scan changed; refusing to patch");
  return next.replace(listOriginal, `\t\t\tfor (const card of await this.list({ boardId, cardIds })) {`);
}

function patchDispatchAndStart(value) {
  const boardLine = `\tconst boardId = params.options?.boardId;`;
  const cardIdsLine = `\tconst cardIds = Array.isArray(params.options?.cardIds) ? params.options.cardIds : void 0;`;
  if (!value.includes(boardLine)) throw new Error("OpenClaw dispatch options changed; refusing to patch");
  let next = value.replace(boardLine, `${boardLine}\n${cardIdsLine}`);
  const dispatchOriginal = `\tconst dispatch = await params.store.dispatch({
\t\tnow,
\t\tboardId
\t});`;
  const dispatchScoped = `\tconst dispatch = await params.store.dispatch({
\t\tnow,
\t\tboardId,
\t\tcardIds
\t});`;
  if (!next.includes(dispatchOriginal)) throw new Error("OpenClaw dispatch store call changed; refusing to patch");
  next = next.replace(dispatchOriginal, dispatchScoped);
  const listOriginal = `\tconst cards = await params.store.list();
\tconst candidates = await params.store.list({ boardId });`;
  const listScoped = `\tconst cards = await params.store.list(Array.isArray(cardIds) ? { cardIds } : {});
\tconst candidates = await params.store.list({ boardId, cardIds });`;
  if (!next.includes(listOriginal)) throw new Error("OpenClaw dispatch candidate scan changed; refusing to patch");
  return next.replace(listOriginal, listScoped);
}

function patchDispatchAndStart2026081(value) {
  const boardLine = `\tconst boardId = params.options?.boardId;`;
  const cardIdsLine = `\tconst cardIds = Array.isArray(params.options?.cardIds) ? params.options.cardIds : void 0;`;
  if (!value.includes(boardLine)) throw new Error("OpenClaw 2026.8.1 dispatch options changed; refusing to patch");
  let next = value.replace(boardLine, `${boardLine}\n${cardIdsLine}`);
  const dispatchOriginal = `\t} : await params.store.dispatch({\n\t\tnow,\n\t\tboardId\n\t});`;
  const dispatchScoped = `\t} : await params.store.dispatch({\n\t\tnow,\n\t\tboardId,\n\t\tcardIds\n\t});`;
  if (!next.includes(dispatchOriginal)) throw new Error("OpenClaw 2026.8.1 dispatch store call changed; refusing to patch");
  next = next.replace(dispatchOriginal, dispatchScoped);
  const listOriginal = `\tconst cards = await params.store.list();\n\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId });`;
  const listScoped = `\tconst cards = await params.store.list(Array.isArray(cardIds) ? { cardIds } : {});\n\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId, cardIds });`;
  if (!next.includes(listOriginal)) throw new Error("OpenClaw 2026.8.1 dispatch candidate scan changed; refusing to patch");
  return next.replace(listOriginal, listScoped);
}

function patchGatewayMethods(value) {
  const listOriginal = `cards: (await store.list({ boardId: requestParams.boardId })).map(redactClaimToken),`;
  const listScoped = `cards: (await store.list({ boardId: requestParams.boardId, cardIds: requestParams.cardIds })).map(redactClaimToken),`;
  if (!value.includes(listOriginal)) throw new Error("OpenClaw Workboard list Gateway method changed; refusing to patch");
  let next = value.replace(listOriginal, listScoped);

  const maxStartsLine = `\t\t\tconst maxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;`;
  const cardIdsLine = `\t\t\tconst cardIds = requestParams && typeof requestParams === "object" && Array.isArray(requestParams.cardIds) ? requestParams.cardIds : void 0;`;
  if (!next.includes(maxStartsLine)) throw new Error("OpenClaw Workboard dispatch Gateway method changed; refusing to patch");
  next = next.replace(maxStartsLine, `${maxStartsLine}\n${cardIdsLine}`);
  const optionLine = `\t\t\t\t\tmaxStarts: typeof maxStarts === "number" ? maxStarts : void 0,`;
  if (!next.includes(optionLine)) throw new Error("OpenClaw Workboard maxStarts forwarding is missing; apply the capacity patch first");
  return next.replace(optionLine, `${optionLine}\n\t\t\t\t\tcardIds: Array.isArray(cardIds) ? cardIds : void 0,`);
}

function patchGatewayMethods2026081(value) {
  const helperOriginal = `async function listWorkboardCards(store, boardId, redactCard) {\n\tconst [cards, { boards }] = await Promise.all([store.list({ boardId }), store.listBoards()]);`;
  const helperScoped = `async function listWorkboardCards(store, options, redactCard) {\n\tconst boardId = options?.boardId;\n\tconst cardIds = Array.isArray(options?.cardIds) ? options.cardIds : void 0;\n\tconst [cards, { boards }] = await Promise.all([store.list({ boardId, cardIds }), store.listBoards()]);`;
  if (!value.includes(helperOriginal)) throw new Error("OpenClaw 2026.8.1 Workboard list helper changed; refusing to patch");
  let next = value.replace(helperOriginal, helperScoped);
  const registrationOriginal = `async ({ params: requestParams }) => await listWorkboardCards(store, requestParams.boardId, redactClaimToken)`;
  const registrationScoped = `async ({ params: requestParams }) => await listWorkboardCards(store, requestParams, redactClaimToken)`;
  if (!next.includes(registrationOriginal)) throw new Error("OpenClaw 2026.8.1 Workboard list Gateway method changed; refusing to patch");
  next = next.replace(registrationOriginal, registrationScoped);

  const maxStartsLine = `const rawMaxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;`;
  const cardIdsLine = `const cardIds = requestParams && typeof requestParams === "object" && Array.isArray(requestParams.cardIds) ? requestParams.cardIds : void 0;`;
  if (!next.includes(maxStartsLine)) throw new Error("OpenClaw 2026.8.1 Workboard dispatch Gateway method changed; refusing to patch");
  next = next.replace(maxStartsLine, `${maxStartsLine}\n${cardIdsLine}`);
  const boardInput = `boardId: typeof boardId === "string" ? boardId : void 0,`;
  if (!next.includes(boardInput)) throw new Error("OpenClaw 2026.8.1 Workboard dispatch options changed; refusing to patch");
  return next.replace(boardInput, `${boardInput}\n\t\t\t\t\t\t...Array.isArray(cardIds) ? { cardIds } : {},`);
}
