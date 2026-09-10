import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProfile, withConcurrencyProfile} from './release-files/gateway-concurrency-profiler.mjs';
test('profile aggregation uses frame names only and handles recursive parents once', () => {
  const f = name => ({functionName: name, url: '/private/path/code.js', lineNumber: 3});
  const summary = summarizeProfile({startTime: 0, endTime: 3000, nodes: [{id: 1, callFrame: f('root'), children: [2]}, {id: 2, callFrame: f('slow'), children: [3]}, {id: 3, callFrame: f('slow')}], samples: [2, 3], timeDeltas: [1000, 2000]});
  assert.equal(summary.durationMs, 3); assert.equal(summary.topInclusive.find(x => x.frame.startsWith('slow')).ms, 3);
  assert(!JSON.stringify(summary).includes('/private'));
});
test('ordinary requests retain return value, rejection identity and single execution', async () => {
  let calls = 0; assert.equal(await withConcurrencyProfile({sessionKey: 'ordinary'}, () => {calls++; return 17;}), 17); assert.equal(calls, 1);
  const error = new Error('original'); await assert.rejects(withConcurrencyProfile({}, () => {throw error;}), e => e === error);
});
