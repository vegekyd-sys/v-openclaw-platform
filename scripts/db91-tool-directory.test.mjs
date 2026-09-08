import test from 'node:test';import assert from 'node:assert/strict';import {toolDirectoryConfig} from './db91-tool-directory-plan.mjs';
test('native directory option preserves all non-surface policy and configuration',()=>{
 const original={tools:{allow:['exec','read'],deny:['message'],toolSearch:{enabled:false,maxSearchLimit:9},exec:{security:'allowlist'}},agents:{list:[{id:'makaron',tools:{deny:['write']}}]},channels:{feishu:{enabled:true}},models:{providers:{deepseek:{apiKey:'secret'}}}};
 const updated=JSON.parse(toolDirectoryConfig(JSON.stringify(original)));
 assert.deepEqual(updated.tools.toolSearch,{enabled:true,maxSearchLimit:9,mode:'directory'});
 updated.tools.toolSearch=original.tools.toolSearch;assert.deepEqual(updated,original);
});
