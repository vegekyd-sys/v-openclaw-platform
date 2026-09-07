import {DatabaseSync} from 'node:sqlite';
import {verifyCurrentAgentDatabase, getIntegrityGateStats} from './gate.mjs';
const [filename, rowId] = process.argv.slice(2);
const db = new DatabaseSync(filename);
db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
verifyCurrentAgentDatabase({db, filename, agentId: 'lab', schemaSql: '', options: {},
  verifyFull: () => {if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('bad integrity');},
  verifyContracts: () => []});
if (rowId) {
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO parent VALUES(?)').run(Number(rowId));
  db.prepare('INSERT INTO child VALUES(?, ?)').run(Number(rowId), Number(rowId));
  db.exec('COMMIT');
}
db.close();
console.log(JSON.stringify(getIntegrityGateStats()));
