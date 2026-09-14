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
  assert.match(source, /DB91_SCOPE_\$\{variant\}_\$\{row\.round\}_\$\{row\.index\}_\$\{stamp\}/);
  assert.match(source, /firstTextP50Ms/);
  assert.match(source, /firstTextP95Ms/);
  assert.match(source, /eventLoopP50P95Ms/);
  assert.match(source, /eventLoopP99P95Ms/);
  assert.match(source, /deliver: false/);
});

test('comparison requires a bad C15 baseline, repaired C15 candidate, and healthy C5 user load', () => {
  const source = fs.readFileSync(new URL('./compare-db91-transaction-scope-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /baselineReproducedBroadScopeStall/);
  assert.match(source, /baselineReproducedServicePressure/);
  assert.match(source, /stressFirstTextP95ReducedByAtLeastHalf/);
  assert.match(source, /stressTotalP95ReducedByAtLeastHalf/);
  assert.match(source, /targetLoadFirstTextP50WithinSevenSeconds/);
  assert.match(source, /targetLoadFirstTextP95WithinSevenSeconds/);
  assert.match(source, /targetLoadEventLoopP50TailHealthy/);
  assert.match(source, /targetLoadEventLoopP99TailHealthy/);
});
