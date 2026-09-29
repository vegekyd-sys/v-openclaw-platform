import test from 'node:test';
import assert from 'node:assert/strict';
import {deferWorkerTerminalEvent, gatewayOwnedEventArgs} from './gateway-owned-terminal.mjs';

test('Worker terminal does not suppress native Gateway terminal publication', () => {
  for (const phase of ['end', 'error']) {
    const original={stream:'lifecycle',data:{phase,executionSettled:true,stopReason:'end_turn',aborted:false,error:phase==='error'?'failed':undefined,terminalDelivery:{status:'sent'},terminalReceipt:{id:'worker-local'}}};
    const deferred=deferWorkerTerminalEvent(original);
    assert.equal(deferred.data.phase,'finishing');
    assert.equal(deferred.data.stopReason,'end_turn');
    assert.equal(deferred.data.error,original.data.error);
    for(const key of ['executionSettled','terminalDelivery','terminalReceipt']) assert.equal(Object.hasOwn(deferred.data,key),false);
    assert.equal(original.data.phase,phase);
    // Core backstop's note contract: only end/error suppress its publication.
    assert.equal(['end','error'].includes(deferred.data.phase),false);
  }
});
test('native cancellation, timeout and yield metadata survives', () => {
  for(const fields of [{aborted:true,stopReason:'user_aborted'}, {timeoutPhase:'model',stopReason:'timeout'}, {yielded:true,livenessState:'paused',stopReason:'end_turn'}]) {
    const deferred=deferWorkerTerminalEvent({stream:'lifecycle',data:{phase:'end',...fields}});
    for(const [key,value] of Object.entries(fields)) assert.equal(deferred.data[key],value);
  }
});
test('nonterminal streams and unrelated callback arguments remain untouched', () => {
  for(const event of [{stream:'assistant',data:{text:'hi'}},{stream:'lifecycle',data:{phase:'start'}},{stream:'tool',data:{phase:'end'}}]) assert.equal(deferWorkerTerminalEvent(event),event);
  const args=[{stream:'lifecycle',data:{phase:'end'}}];
  assert.equal(gatewayOwnedEventArgs('onToolResult',args),args);
  assert.equal(gatewayOwnedEventArgs('onAgentEvent',args)[0].data.phase,'finishing');
});
