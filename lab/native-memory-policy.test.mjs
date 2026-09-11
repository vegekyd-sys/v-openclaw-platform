import test from 'node:test';import assert from 'node:assert/strict';
import{restoreMemoryToolPolicy}from './native-memory-policy.mjs';
const config=()=>({gateway:{port:24993},plugins:{allow:['feishu','workboard'],entries:{}},agents:{defaults:{model:{primary:'deepseek/deepseek-flash'}}},tools:{deny:[]}});
test('only explicitly allows existing memory-core and is idempotent',()=>{const c=config(),n=restoreMemoryToolPolicy(c);assert.deepEqual(c,config());assert.deepEqual(n.plugins.allow,['feishu','workboard','memory-core']);assert.deepEqual(restoreMemoryToolPolicy(n),n);n.plugins.allow.pop();assert.deepEqual(n,c);});
test('never bypass deny, disabled plugin, alternate slot or production port',()=>{for(const change of[c=>c.gateway.port=18789,c=>c.plugins.deny=['memory-core'],c=>c.plugins.entries['memory-core']={enabled:false},c=>c.plugins.enabled=false,c=>c.plugins.slots={memory:'other'},c=>c.plugins.allow=[]]){const c=config();change(c);assert.throws(()=>restoreMemoryToolPolicy(c));}});
