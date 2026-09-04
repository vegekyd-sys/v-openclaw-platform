import assert from 'node:assert/strict';
import test from 'node:test';
import {patchPrefix, patchCard, patchRunner} from '../scripts/patch-openclaw91-runtime-footer.mjs';
test('card displays selected runtime without inventing a default', () => {
  const source = 'return function(prefixCtx) { const parts=[];\n\tif (prefixCtx.provider) parts.push(`Provider: ${prefixCtx.provider}`);\nreturn parts.join(" | ");}';
  const patched = patchCard(source), render = new Function(patched)();
  assert.equal(render({provider:'deepseek',agentRuntime:'vlab-worker'}), 'Provider: deepseek | Runtime: vlab-worker');
  assert.equal(render({provider:'openai',agentRuntime:'codex'}), 'Provider: openai | Runtime: codex');
  assert.equal(render({provider:'deepseek'}), 'Provider: deepseek');
  assert.equal(patchCard(patched), patched);
});
test('prefix resets stale runtime after fallback with no runtime metadata', () => {
  const source = 'return (prefixContext, ctx) => {\n\t\tprefixContext.provider = ctx.provider;\n};';
  const patched=patchPrefix(source), set=new Function(patched)(), context={};
  set(context,{provider:'x',agentRuntime:'codex'});assert.equal(context.agentRuntime,'codex');
  set(context,{provider:'y'});assert.equal(context.agentRuntime,undefined);
  assert.equal(patchPrefix(patched),patched);
});
test('runner uses official resolver and selected fallback session context', () => {
  const source='\t\t\tturn.opts?.onModelSelected?.({\n\t\t\t\tprovider,\n\t\t\t\tmodel,\n\t\t\t\tthinkLevel: candidateThinkLevel\n\t\t\t});';
  const patched=patchRunner(source,'thinking-runtime-test.js');
  assert.match(patched,/runtime.useCliExecution \? runtime.cliExecutionProvider/);
  assert.match(patched,/params.liveModelSwitchRuntimeEntry \?\? turn.getActiveSessionEntry\(\)/);
  assert.equal(patchRunner(patched,'thinking-runtime-test.js'),patched);
  assert.throws(()=>patchRunner(source+source,'thinking-runtime-test.js'),/exactly one/);
});
