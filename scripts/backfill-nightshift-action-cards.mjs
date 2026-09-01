#!/usr/bin/env node

import { resolve } from "node:path";
import {
  NightShiftStore,
  WorkboardGatewayAdapter,
} from "../packages/nightshift-core/src/index.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const databasePath = args.get("--db");
if (!databasePath) throw new Error("Usage: backfill-nightshift-action-cards.mjs --db=/path/to/nightshift.sqlite");

const store = new NightShiftStore(resolve(databasePath));
try {
  const cards = await new WorkboardGatewayAdapter().listCards();
  const canonical = new Map();
  for (const card of cards) {
    const labels = Array.isArray(card.labels) ? card.labels : [];
    if (!labels.includes("nightshift:approval")) continue;
    const marker = labels.find((label) => label.startsWith("nightshift-action:"));
    const instanceId = labels.find((label) => label.startsWith("instance:"))?.slice("instance:".length);
    if (!marker || !instanceId || !store.getInstance(instanceId)) continue;
    const current = canonical.get(marker);
    if (!current || compareCanonical(card, current.card) < 0) canonical.set(marker, { card, instanceId });
  }
  const removed = store.deleteActionCardsByPrefix("legacy:");
  for (const [marker, value] of canonical) {
    store.bindActionCard({ actionKey: `legacy:${marker}`, instanceId: value.instanceId, cardId: value.card.id });
  }
  process.stdout.write(`${JSON.stringify({ bound: canonical.size, removed, scanned: cards.length })}\n`);
} finally {
  store.close();
}

function compareCanonical(left, right) {
  const statusRank = (card) => ["review", "ready", "running", "blocked"].includes(card.status) ? 0 : 1;
  const rank = statusRank(left) - statusRank(right);
  if (rank !== 0) return rank;
  const leftTime = Date.parse(left.createdAt ?? left.updatedAt ?? "") || Number.MAX_SAFE_INTEGER;
  const rightTime = Date.parse(right.createdAt ?? right.updatedAt ?? "") || Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
}
