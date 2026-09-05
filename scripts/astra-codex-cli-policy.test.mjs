import test from 'node:test';
import assert from 'node:assert/strict';
import {setCommand} from './astra-codex-cli-policy.mjs';
test('Codex command override preserves unrelated settings and records rollback value',()=>{
  const c={agents:{defaults:{model:{primary:'deepseek/deepseek-v4-pro'}}},plugins:{entries:{codex:{config:{appServer:{command:'/old/codex',args:['app-server'],headers:{test:'kept'}}}}}}};
  const before=setCommand(c,'/private/codex');
  assert.deepEqual(before,{existed:true,value:'/old/codex'});
  assert.equal(c.agents.defaults.model.primary,'deepseek/deepseek-v4-pro');
  assert.deepEqual(c.plugins.entries.codex.config.appServer.args,['app-server']);
  assert.deepEqual(c.plugins.entries.codex.config.appServer.headers,{test:'kept'});
});
test('unset command can be restored to native binary resolution',()=>{
  const c={};const before=setCommand(c,'/private/codex');
  assert.equal(before.existed,false);
  assert.equal(c.plugins.entries.codex.config.appServer.command,'/private/codex');
});
