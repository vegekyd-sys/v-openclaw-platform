import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./release-files/session-accessor.sqlite-entry-BlklNPKQ.js', import.meta.url), 'utf8');

test('new-session identity and synchronous replacement use bounded pre-BEGIN retry', () => {
  assert.match(source, /function ensureSessionEntrySync[\s\S]*?withSqliteBeginContentionRetrySync\([\s\S]*?function assertCanonicalSessionWriteScope/);
  assert.match(source, /function replaceSessionEntrySync[\s\S]*?withSqliteBeginContentionRetrySync\([\s\S]*?async function patchSessionEntryCore/);
  assert.equal((source.match(/withSqliteBeginContentionRetrySync\(\{/g) ?? []).length, 2);
});

test('native session write callback remains inside one retry operation edge', () => {
  const initial = source.slice(source.indexOf('function ensureSessionEntrySync'), source.indexOf('//#endregion', source.indexOf('function ensureSessionEntrySync')));
  assert.match(initial, /operation: \(database\) => \{[\s\S]*?writeSessionEntry\(database/);
  assert.doesNotMatch(initial, /catch \(/);
});
