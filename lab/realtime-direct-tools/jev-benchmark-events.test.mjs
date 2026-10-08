import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredGatewayEvents, firstMeasuredToolStart} from './jev-benchmark-events.mjs';
test('native session.tool is a real measured start; unrelated and old events are excluded', () => {
  const event = (at, key, envelope, phase='start') => ({at,event:envelope,
    payload:{sessionKey:key,stream:'tool',data:{name:'memory_search',phase}}});
  const rows = [event(9,'ours','session.tool'),event(11,'foreign','session.tool'),
    event(12,'ours','chat'),event(13,'ours','session.tool','result'),
    event(14,'ours','session.tool'),event(15,'ours','agent')];
  const measured = measuredGatewayEvents(rows,{sessionKey:'ours',since:10});
  assert.deepEqual(measured.map(row=>row.at),[13,14,15]);
  assert.equal(firstMeasuredToolStart(measured,'memory_search').at,14);
  assert.equal(firstMeasuredToolStart(measured,'web_search'),undefined);
});
