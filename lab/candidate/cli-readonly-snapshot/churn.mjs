// Test-only writer that keeps a WAL database changing, like V's Gateway does.
//   node churn.mjs <db> <intervalMs> <bytesPerWrite>
import { DatabaseSync } from 'node:sqlite';
const [db, intervalMs = '50', bytes = '8192'] = process.argv.slice(2);
const d = new DatabaseSync(db);
d.exec('PRAGMA busy_timeout=30000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS zz_candidate_churn(id INTEGER PRIMARY KEY, v BLOB);');
const ins = d.prepare('INSERT INTO zz_candidate_churn(v) VALUES (randomblob(?))');
let n = 0;
setInterval(() => { ins.run(Number(bytes)); n++; }, Number(intervalMs));
process.on('SIGTERM', () => { console.error(`churn writes=${n}`); d.close(); process.exit(0); });
