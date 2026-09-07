// Test-only protocol fixture. Deployment uses the real OpenClaw verifier child.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {captureNativeVerificationFile, beginNativeVerification, finishNativeVerification} from './gate.mjs';
process.once('message', targets => {
  const mode = process.env.DB91_TEST_WORKER_BEHAVIOR;
  if (mode === 'crash') process.exit(2);
  if (mode === 'hang') {setInterval(() => {}, 1000); return;}
  const results = [];
  for (const target of targets) {
    let db;
    try {
      const expectedFileIdentity = captureNativeVerificationFile(target.path);
      db = new DatabaseSync(target.path, {readOnly: true});
      db.exec('BEGIN');
      const ticket = beginNativeVerification(db, target.path, {expectedFileIdentity});
      if (process.env.DB91_TEST_COUNTER_FILE) fs.appendFileSync(process.env.DB91_TEST_COUNTER_FILE, 'full\n');
      const integrity = db.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('integrity failed');
      const proof = finishNativeVerification(db, target.path, ticket);
      db.exec('ROLLBACK');
      db.close(); db = null;
      results.push({path: target.path, ok: true, db91Verification: proof});
    } catch (e) {results.push({path: target.path, ok: false, error: e.message});}
    finally {db?.close();}
  }
  const output = mode === 'omit' ? [] : mode === 'duplicate' ? [...results, results[0]] : results;
  process.send(output, () => {process.disconnect(); if (mode === 'bad-exit') process.exitCode = 2;});
});
