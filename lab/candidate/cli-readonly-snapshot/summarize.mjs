// Summarize a trace file: calls per function and the first caller outside the snapshot helpers.
import fs from 'node:fs';
const rows = fs.existsSync(process.argv[2]) ? fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const byFn = {}; const callers = {};
const skip = /sqlite-readonly-location|openclaw-state-db-readonly|^new Promise|^Array\.|^Object\./;
for (const r of rows) {
  byFn[r.fn] = (byFn[r.fn] ?? 0) + 1;
  if (r.fn === 'prepareSqliteReadOnlyLocationSyncInProcess' || r.fn === 'prepareSqliteReadOnlyLocation' || r.fn === 'prepareSqliteReadOnlyLocationSync' || r.fn === 'prepareSqliteReadOnlyLocationInProcess') {
    const chain = r.stack.filter((l) => !skip.test(l)).slice(0, 3).join(' <- ');
    const k = `${r.fn} @ ${chain}`; callers[k] = (callers[k] ?? 0) + 1;
  }
}
console.log(JSON.stringify({ events: rows.length, pids: [...new Set(rows.map((r) => r.pid))].length, byFn, callers }, null, 1));
