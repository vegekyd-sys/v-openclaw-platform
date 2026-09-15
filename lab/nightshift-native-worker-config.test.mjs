import assert from 'node:assert/strict';
import test from 'node:test';
import {enableNativeWorkboardTools} from './nightshift-native-worker-config.mjs';
test('native Workboard registration preserves the existing model, tools and plugin policy',()=>{
 const config={agents:{defaults:{model:{primary:'deepseek/deepseek-v4-pro'}}},tools:{profile:'full'},plugins:{allow:['deepseek'],entries:{deepseek:{enabled:true},workboard:{config:{retentionDays:30}}}}};
 const after=enableNativeWorkboardTools(config);
 assert.deepEqual(after.agents,config.agents);assert.deepEqual(after.tools,config.tools);
 assert.deepEqual(after.plugins.allow,['deepseek','workboard']);
 assert.deepEqual(after.plugins.entries.workboard,{config:{retentionDays:30},enabled:true});
 assert.deepEqual(config.plugins.allow,['deepseek']);
 assert.deepEqual(enableNativeWorkboardTools(after),after);
 assert.equal(enableNativeWorkboardTools({}).plugins.allow,undefined);
});
