import test from 'node:test';
import assert from 'node:assert/strict';
import {patchContract,patchManifest,patchSubscriptionProvider} from './patch-openclaw91-astra.mjs';
test('Subscription resolver adds only Astra with Responses and no temperature',()=>{
 const src='function resolveCodexForwardCompatModel(ctx) {\n\tconst synthBaseUrl = ctx.providerConfig?.baseUrl ?? OPENAI_CODEX_BASE_URL;\nreturn undefined;\n}';
 const next=patchSubscriptionProvider(src);assert.equal(patchSubscriptionProvider(next),next);
 assert.match(next,/lower === "gpt-6-astra"/);
 assert.match(next,/supportsTemperature: false/);
 assert.match(next,/openai-chatgpt-responses/);
});
test('Astra route patch is narrow, idempotent, and fails on upstream drift',()=>{
 const src='const OPENAI_DUAL_ROUTE_MODEL_IDS = ["gpt-5.5"];\nconst OPENAI_CODEX_REASONING_EFFORTS_BY_MODEL = /* @__PURE__ */ new Map([]);';
 const next=patchContract(src);assert.equal(patchContract(next),next);
 assert.match(next,/"gpt-6-astra"/);assert.match(next,/"gpt-5.5"/);
 assert.throws(()=>patchContract('changed upstream'));
});
test('Worker advertises native harness ownership without removing startup activation',()=>{
 const src=JSON.stringify({id:'vlab-agent-worker-isolation',activation:{onStartup:true},configSchema:{type:'object'}});
 const result=JSON.parse(patchManifest(src));
 assert.equal(result.activation.onStartup,true);
 assert.deepEqual(result.activation.onAgentHarnesses,['vlab-worker']);
 assert.deepEqual(result.configSchema,{type:'object'});
 assert.equal(patchManifest(patchManifest(src)),patchManifest(src));
});
