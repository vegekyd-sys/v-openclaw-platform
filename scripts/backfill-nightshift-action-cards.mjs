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
  let bound = 0;
  for (const card of cards) {
    const labels = Array.isArray(card.labels) ? card.labels : [];
    const marker = labels.find((label) => label.startsWith("nightshift-action:"));
    const instanceId = labels.find((label) => label.startsWith("instance:"))?.slice("instance:".length);
    if (!marker || !instanceId || !store.getInstance(instanceId)) continue;
    store.bindActionCard({ actionKey: `legacy:${marker}:${card.id}`, instanceId, cardId: card.id });
    bound += 1;
  }
  process.stdout.write(`${JSON.stringify({ bound, scanned: cards.length })}\n`);
} finally {
  store.close();
}
