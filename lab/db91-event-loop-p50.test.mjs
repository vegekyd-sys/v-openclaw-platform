import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchEventLoopP50} from './build-db91-event-loop-p50.mjs';

test('Gateway health exposes P50 from the same reset window as P99', () => {
  const source = fs.readFileSync(new URL('./release-files/server-start-BNcm1gUN.js', import.meta.url), 'utf8');
  const p50Read = source.indexOf('monitor.percentile(50)');
  const p99Read = source.indexOf('monitor.percentile(99)');
  const reset = source.indexOf('monitor.reset();', p99Read);
  assert(p50Read >= 0 && p99Read > p50Read && reset > p99Read);
  assert.match(source.slice(p99Read, reset), /delayP50Ms,[\s\S]*delayP99Ms,[\s\S]*delayMaxMs/);
});

test('P50 patch refuses drift and double application', () => {
  assert.throws(() => patchEventLoopP50('drifted'), /anchor mismatch/);
  const fixture = '\t\tconst delayP99Ms = nanosecondsToMilliseconds(monitor.percentile(99));\n' +
    '\t\t\tdegradedSinceMs: firstDegradedAtMs === null ? null : Math.max(0, Math.round(now - firstDegradedAtMs)),\n' +
    '\t\t\treasons,\n\t\t\tintervalMs,\n\t\t\tdelayP99Ms,\n\t\t\tdelayMaxMs,\n';
  const once = patchEventLoopP50(fixture);
  assert.throws(() => patchEventLoopP50(once), /anchor mismatch/);
});
