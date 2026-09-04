import assert from 'node:assert/strict';
import test from 'node:test';
import {createCommentaryState, patchCommentary} from '../scripts/patch-openclaw91-codex-commentary.mjs';
test('only explicit Codex preambles are shown; thinking and tools never leak', () => {
  const s=createCommentaryState();
  for(const kind of ['reasoning','tool','command','assistant']) assert.equal(s.push('codex',{kind,progressText:'private'}),null);
  assert.equal(s.push('vlab-worker',{kind:'preamble',progressText:'other runtime'}),null);
  assert.equal(s.push(undefined,{kind:'preamble',progressText:'unverified runtime'}),null);
  assert.equal(s.push('codex',{kind:'preamble',itemId:'a',progressText:'START'}),'START');
  assert.equal(s.push('codex',{kind:'preamble',itemId:'a',progressText:'START'}),null);
  assert.equal(s.push('codex',{kind:'preamble',itemId:'b',progressText:'AFTER'}),'START\n\nAFTER');
  s.close();assert.equal(s.push('codex',{kind:'preamble',progressText:'late'}),null);
});
test('bounded memory and control-character sanitization', () => {
  const s=createCommentaryState();assert.equal(s.push('codex',{kind:'preamble',progressText:'\u0000hello'}),'hello');
  let text;for(let i=0;i<100;i++)text=s.push('codex',{kind:'preamble',itemId:String(i),progressText:'x'.repeat(12000)});
  assert(text.length<=16000);
});
test('patch is idempotent, fails closed on drift, and preserves final-delivery code', () => {
  const source='function createFeishuReplyDispatcher(params) {\n\tlet lastPartial = "";\n\tconst performStreamingClose = async (disposition) => {\n};\nreturn {\n\t\treplyOptions: {\n\t\t\tonModelSelected,\n\t\t\tonPartialReply: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (!payload.text) return false;\nreturn nativeFinal(payload);\n} : undefined}};}';
  const result=patchCommentary(source);assert.equal(patchCommentary(result),result);assert.match(result,/nativeFinal\(payload\)/);assert.throws(()=>patchCommentary('wrong source'),/unique/);assert.throws(()=>patchCommentary(source+source),/unique/);
});
