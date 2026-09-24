import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const here = new URL('./db91-integrity-bootstrap.mjs', import.meta.url);
const captured = new URL('../../../release/captured/v2026.9.1-db91.6/dist/db91-integrity-bootstrap.mjs', import.meta.url);

test('only the preflight timeout default changes relative to production V', () => {
  const next = readFileSync(here, 'utf8').split('\n');
  const prod = readFileSync(captured, 'utf8').split('\n');
  const added = next.filter((l) => !prod.includes(l));
  const removed = prod.filter((l) => !next.includes(l));
  assert.deepEqual(removed, ['export async function runPreflight(workerFile, targets, {env = process.env, timeoutMs = 300000} = {}) {']);
  assert.equal(added.filter((l) => !l.startsWith('//')).length, 1);
  assert.match(added.at(-1), /timeoutMs = Number\(env\.OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS\) \|\| 300000/);
});

test('the default still resolves to 300000 and the variable overrides it', () => {
  const resolve = ({env = {}, timeoutMs = Number(env.OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS) || 300000} = {}) => timeoutMs;
  assert.equal(resolve({env: {}}), 300000);
  assert.equal(resolve({env: {OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS: 'nonsense'}}), 300000);
  assert.equal(resolve({env: {OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS: '900000'}}), 900000);
  assert.equal(resolve({env: {}, timeoutMs: 5}), 5);
});
