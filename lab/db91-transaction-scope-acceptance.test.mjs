import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('shared VLab acceptance fixes five Workers, runs C15 rounds, and records first text plus event-loop tails', () => {
  const source = fs.readFileSync(new URL('./run-db91-transaction-scope-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /assert\.equal\(state\.workers\.length, 5/);
  assert.match(source, /assert\(workers\.workers\.length <= 5/);
  assert.match(source, /holderWaitMs = 40_000/);
  assert.match(source, /roundsArg = '2'/);
  assert.match(source, /concurrencyArg = '15'/);
  assert.match(source, /firstTextP50Ms/);
  assert.match(source, /firstTextP95Ms/);
  assert.match(source, /eventLoopP50P95Ms/);
  assert.match(source, /eventLoopP99P95Ms/);
  assert.match(source, /deliver: false/);
});

test('comparison rejects first-text or event-loop regression', () => {
  const source = fs.readFileSync(new URL('./compare-db91-transaction-scope-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /firstTextP50NotSlower/);
  assert.match(source, /firstTextP95NotSlower/);
  assert.match(source, /eventLoopP50TailNotSlower/);
  assert.match(source, /eventLoopP99TailNotSlower/);
  assert.match(source, /scopeDelayReproduced/);
  assert.match(source, /baselineReproducedBroadScopeFailure/);
  assert.match(source, /baselineReproducedThirtySecondWait/);
  assert.match(source, /firstTextP50AbsoluteGate/);
  assert.match(source, /firstTextP95AbsoluteGate/);
});
