import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export function patchContract(source) {
  if(source.includes('// vlab-astra-dual-route-v1'))return source;
  const replace=(a,b)=>{assert.equal(source.split(a).length,2,`Unexpected anchor: ${a}`);source=source.replace(a,b);};
  replace('const OPENAI_DUAL_ROUTE_MODEL_IDS = [','const OPENAI_DUAL_ROUTE_MODEL_IDS = [\n\t// vlab-astra-dual-route-v1\n\t"gpt-6-astra",');
  replace('const OPENAI_CODEX_REASONING_EFFORTS_BY_MODEL = /* @__PURE__ */ new Map([','const OPENAI_CODEX_REASONING_EFFORTS_BY_MODEL = /* @__PURE__ */ new Map([\n\t["gpt-6-astra", ["low", "medium", "high", "xhigh", "max"]],');
  return source;
}
export function patchManifest(source) {
  const manifest=JSON.parse(source);
  assert.equal(manifest.id,'vlab-agent-worker-isolation');
  manifest.activation??={};
  manifest.activation.onAgentHarnesses=[...new Set([...(manifest.activation.onAgentHarnesses??[]),'vlab-worker'])];
  return JSON.stringify(manifest,null,2)+'\n';
}
export function patchSubscriptionProvider(source) {
  if(source.includes('// vlab-astra-subscription-model-v1'))return source;
  const anchor='\tconst synthBaseUrl = ctx.providerConfig?.baseUrl ?? OPENAI_CODEX_BASE_URL;';
  assert.equal(source.split(anchor).length,2,'Subscription model resolver drifted');
  return source.replace(anchor,anchor+`
\t// vlab-astra-subscription-model-v1
\tif (lower === "gpt-6-astra") return normalizeModelCompat({
\t\tid: trimmedModelId, name: "GPT-6 Astra", provider: PROVIDER_ID,
\t\tapi: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
\t\treasoning: true, input: ["text", "image"],
\t\tcontextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
\t\tcost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
\t\tthinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
\t\tcompat: {supportsTemperature: false, supportsReasoningEffort: true,
\t\t\tsupportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"], codeMode: "preferred"}
\t});`);
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [action,core,worker,backup]=process.argv.slice(2);
  assert(['apply','apply-provider','rollback'].includes(action));assert(core&&worker&&backup);
  const contracts=fs.readdirSync(path.join(core,'dist')).filter(f=>/^model-route-contract-[\w-]+\.js$/.test(f));
  assert.equal(contracts.length,1);
  const providers=fs.readdirSync(path.join(core,'dist')).filter(f=>/^openai-chatgpt-provider-[\w-]+\.js$/.test(f));
  assert.equal(providers.length,1);
  const targets=[path.join(core,'dist',contracts[0]),path.join(worker,'openclaw.plugin.json'),path.join(core,'dist',providers[0])];
  const write=(f,s)=>{const stat=fs.statSync(f),tmp=f+'.astra.tmp';fs.writeFileSync(tmp,s,{flag:'wx',mode:stat.mode&0o777});fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,f);};
  if(action==='apply'||action==='apply-provider') {
    assert(!fs.existsSync(backup));
    const plan=targets.flatMap((f,i)=>{if(action==='apply-provider'&&i!==2)return [];const before=fs.readFileSync(f,'utf8');return [{file:f,before,after:[patchContract,patchManifest,patchSubscriptionProvider][i](before)}];});
    fs.mkdirSync(backup,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(backup,'changes.json'),JSON.stringify(plan),{mode:0o600});
    for(const p of plan)write(p.file,p.after);
  } else {
    const plan=JSON.parse(fs.readFileSync(path.join(backup,'changes.json')));
    assert(plan.length>0&&plan.every(x=>targets.includes(x.file)));
    for(const p of plan)assert.equal(fs.readFileSync(p.file,'utf8'),p.after,'Concurrent bundle change; rollback refused');
    for(const p of plan)write(p.file,p.before);
  }
  console.log(JSON.stringify({action,targets,backup}));
}
