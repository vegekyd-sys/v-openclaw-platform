import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Read-only, content-free inventory. Unlike the old validator, zero targets fail.
const root = fs.realpathSync(process.argv[2]);
const result = { agents: {}, registeredAgents: [], issues: [] };
const sharedPath = path.join(root, 'state/openclaw.sqlite');
if (fs.existsSync(sharedPath)) {
  const db = new DatabaseSync(sharedPath, { readOnly: true });
  try {
    result.registeredAgents = db.prepare('SELECT agent_id, path FROM agent_databases').all().map(row => {
      const registered = path.resolve(root, row.path);
      if (!registered.startsWith(root + path.sep) ||
          (fs.existsSync(registered) && !fs.realpathSync(registered).startsWith(root + path.sep))) {
        result.issues.push(`external database: ${row.agent_id}`);
      }
      if (!fs.existsSync(registered)) result.issues.push(`missing database: ${row.agent_id}`);
      return row.agent_id;
    }).sort();
  } finally { db.close(); }
}
const agentsRoot = path.join(root, 'agents');
for (const dir of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const agentRoot = path.join(agentsRoot, dir.name);
  const info = {};
  const storePath = path.join(agentRoot, 'sessions/sessions.json');
  if (fs.existsSync(storePath)) {
    info.legacySessions = Object.keys(JSON.parse(fs.readFileSync(storePath, 'utf8'))).length;
    info.legacyStoreBytes = fs.statSync(storePath).size;
  }
  const dbPath = path.join(agentRoot, 'agent/openclaw-agent.sqlite');
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
      for (const name of ['session_nodes', 'transcript_events', 'memory_index_chunks', 'auth_profile_store']) {
        if (tables.has(name)) info[name] = db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n;
      }
    } finally { db.close(); }
    info.databaseBytes = fs.statSync(dbPath).size;
  }
  result.agents[dir.name] = info;
}
result.totals = {
  agents: Object.keys(result.agents).length,
  sessionNodes: Object.values(result.agents).reduce((n, a) => n + (a.session_nodes ?? 0), 0),
  legacySessions: Object.values(result.agents).reduce((n, a) => n + (a.legacySessions ?? 0), 0),
  transcriptEvents: Object.values(result.agents).reduce((n, a) => n + (a.transcript_events ?? 0), 0),
};
if (!result.totals.agents || !(result.totals.sessionNodes || result.totals.legacySessions)) {
  result.issues.push('NO_SESSION_TARGETS');
}
console.log(JSON.stringify(result, null, 2));
if (result.issues.length) process.exitCode = 1;
