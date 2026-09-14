import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./release-files/openclaw-agent-db-CUTe8BX6.js', import.meta.url), 'utf8');

test('all OpenClaw Agent write transactions retry only the pre-BEGIN lock edge', () => {
  assert.match(source, /import \{withSqliteBeginContentionRetrySync\} from "\.\/sqlite-begin-contention-retry\.mjs";/);
  const transaction = source.slice(
    source.indexOf('function runOpenClawAgentWriteTransaction'),
    source.indexOf('\nlet unregisterExitClose', source.indexOf('function runOpenClawAgentWriteTransaction')),
  );
  assert.match(transaction, /withSqlitePostCommitPublications\(database\.db, \(\) => withSqliteBeginContentionRetrySync\(\{/);
  assert.match(transaction, /run: transactionOperation => runSqliteImmediateTransactionSync\(database\.db, \(\) => transactionOperation\(database\), \{/);
  assert.match(transaction, /operation: \(writeDatabase\) => \{[\s\S]*operation\(writeDatabase\)/);
  assert.equal((transaction.match(/operation\(writeDatabase\)/g) ?? []).length, 1);
  assert.doesNotMatch(transaction, /catch\s*\(/);
});
