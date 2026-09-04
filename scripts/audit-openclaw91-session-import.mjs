#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const stateDir = process.argv[2];
if (!stateDir || !path.isAbsolute(stateDir)) {
  throw new Error("Usage: audit-openclaw91-session-import.mjs <absolute-state-dir>");
}

const agentsDir = path.join(stateDir, "agents");
const makaronDbPath = path.join(agentsDir, "makaron", "agent", "openclaw-agent.sqlite");
const makaronDb = fs.existsSync(makaronDbPath) ? new DatabaseSync(makaronDbPath) : null;

const categoryOf = (sessionKey) => sessionKey.split(":").slice(0, 3).join(":");
const hasSessionId = (db, sessionId) => {
  if (!db || typeof sessionId !== "string" || sessionId.length === 0) return false;
  return Boolean(
    db.prepare("SELECT 1 AS found FROM session_nodes WHERE current_session_id = ? LIMIT 1").get(sessionId),
  );
};

const results = [];
for (const agentId of fs.readdirSync(agentsDir).sort()) {
  const archiveDir = path.join(agentsDir, agentId, "session-sqlite-import-archive");
  const dbPath = path.join(agentsDir, agentId, "agent", "openclaw-agent.sqlite");
  if (!fs.existsSync(archiveDir) || !fs.existsSync(dbPath)) continue;
  const legacyStores = fs
    .readdirSync(archiveDir)
    .filter((name) => name.startsWith("legacy-store.sessions.json.imported-"))
    .sort();
  if (legacyStores.length === 0) continue;

  const legacy = JSON.parse(
    fs.readFileSync(path.join(archiveDir, legacyStores.at(-1)), "utf8"),
  );
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare("SELECT session_key, current_session_id FROM session_nodes").all();
  const currentKeys = new Set(rows.map((row) => row.session_key));
  const legacyKeys = Object.keys(legacy);
  const missing = legacyKeys.filter((key) => !currentKeys.has(key));
  const added = rows.filter((row) => !Object.hasOwn(legacy, row.session_key));
  const categories = {};
  let mappedWithinAgent = 0;
  let mappedToMakaron = 0;
  let missingWithoutSessionId = 0;
  for (const key of missing) {
    const category = categoryOf(key);
    categories[category] = (categories[category] ?? 0) + 1;
    const sessionId = legacy[key]?.sessionId;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      missingWithoutSessionId += 1;
      continue;
    }
    if (hasSessionId(db, sessionId)) mappedWithinAgent += 1;
    if (hasSessionId(makaronDb, sessionId)) mappedToMakaron += 1;
  }
  results.push({
    agentId,
    legacyEntries: legacyKeys.length,
    sqliteNodes: rows.length,
    missing: missing.length,
    added: added.length,
    mappedWithinAgent,
    mappedToMakaron,
    missingWithoutSessionId,
    missingCategories: categories,
  });
  db.close();
}

makaronDb?.close();
process.stdout.write(`${JSON.stringify({ ok: true, agents: results }, null, 2)}\n`);
