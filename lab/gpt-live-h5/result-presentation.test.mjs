import test from 'node:test';
import assert from 'node:assert/strict';
import {presentBackendResult,LONG_RESULT_NOTICE} from './result-presentation.mjs';

test('short result remains exact; long result preserves complete body and uses bounded factual-free notice',()=>{
 for(const text of ['已查到十二的记录。','日期尚未确认。','😀'.repeat(300)])assert.deepEqual(presentBackendResult({result:text}),{text,long:false,spokenText:text});
 for(const text of ['😀'.repeat(301),'## 方案\n'+'原始日期、数字、限定条件。'.repeat(60),'```sh\ndate\n```','| 项目 | 日期 |\n| --- | --- |\n| 入学 | 2028-09 |',Array.from({length:8},(_,i)=>`- 条件${i}`).join('\n')]) {
  assert.deepEqual(presentBackendResult({result:text}),{text,long:true,spokenText:LONG_RESULT_NOTICE});
 }
 assert([...LONG_RESULT_NOTICE].length<100);assert(!LONG_RESULT_NOTICE.includes('已经发送'));
});
test('missing, failed and cancelled results never announce a document or success',()=>{
 for(const result of [null,undefined,{},'',{text:'   '},{cancelled:true,result:'x'.repeat(500)},{error:'真实失败',result:'x'.repeat(500)}])assert.equal(presentBackendResult(result),null);
});
