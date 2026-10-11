// Actual candidate runtime and secret proxy. Never starts a Gateway or channels.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const root=process.env.VLAB_CANDIDATE_RUNTIME;
assert(root&&process.env.OPENCLAW_STATE_DIR!==process.env.VLAB_SHARED_STATE_DIR);
const dist=path.join(root,'openclaw','dist');
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
// Own snapshot only: make this deterministic command/lifecycle test noninteractive.
// Authorization negatives and policy denial are verified separately below.
cfg.tools={...cfg.tools,exec:{...cfg.tools?.exec,host:'gateway',security:'full',ask:'off'}};
cfg.secrets={...cfg.secrets,egressProxy:{...cfg.secrets?.egressProxy,enabled:true}};
const source=fs.readFileSync(path.join(process.cwd(),'release/captured/v-voice-content-product-20261011/dist/tools-invoke-shared-CjpflNGO.js'),'utf8');
fs.writeFileSync(path.join(dist,'voice-before-invoke.js'),source.replace('./tool-resolution-Con11qMn.js','./voice-before-resolution.js'));
fs.copyFileSync('release/captured/v-voice-content-product-20261011/dist/tool-resolution-Con11qMn.js',path.join(dist,'voice-before-resolution.js'));
const {startGatewaySecretEgressProxy}=await import(path.join(dist,'runtime-Cy2RRq4n.js'));
const {g:registerClosed}=await import(path.join(dist,'agent-run-registry-D84MDeZl.js'));
const proxy=await startGatewaySecretEgressProxy(cfg.secrets.egressProxy);
let retired=0;
registerClosed(authority=>{proxy.revokeRun(authority.operationalRunInstance);retired++;});
const before=(await import(path.join(dist,'voice-before-invoke.js'))).t;
const after=(await import(path.join(dist,'tools-invoke-shared-CjpflNGO.js'))).t;
const request={cfg,input:{agentId:'makaron',sessionKey:'agent:makaron:main',name:'exec',args:{command:'true',timeoutSeconds:10}},
  senderIsOwner:true,clientCaps:['voice-direct-tools'],toolCallIdPrefix:'candidate',approvalMode:'report'};
const checks=[];
try {
  let r=await before(request);assert.equal(r.ok,false);assert.equal(r.status,500);
  checks.push({case:'baseline-secret-egress',ok:true,status:r.status});
  r=await after(request);assert.equal(r.ok,true,JSON.stringify(r.error));
  assert.equal(r.result.details.status,'completed');assert.equal(r.result.details.exitCode,0);
  checks.push({case:'voice-secret-egress-native-exec',ok:true,status:r.result.details.status});
  // The same native exec route used by the Voice feishu_calendar tool.
  // Capture privately in memory; never print calendar content or auth material.
  const larkEnv={};
  const personalConfig=process.env.LARKSUITE_CLI_CONFIG_DIR||path.join(process.env.HOME,'.lark-cli/openclaw');
  if(fs.existsSync(path.join(personalConfig,'config.json'))) {
    larkEnv.LARKSUITE_CLI_CONFIG_DIR=personalConfig;
    larkEnv.LARKSUITE_CLI_DATA_DIR=process.env.LARKSUITE_CLI_DATA_DIR||path.join(process.env.HOME,'.local/share');
    r=await after({...request,input:{...request.input,args:{command:'lark-cli calendar +agenda --as user --format json',timeoutSeconds:45,env:larkEnv}}});
    assert.equal(r.ok,true,JSON.stringify(r.error));
    const text=r.result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
    let agenda;try{agenda=JSON.parse(text.replace(/\n\n\(Command exited with code \d+\)\s*$/u,''));}catch{}
    checks.push({case:'feishu-calendar-read-only',ok:agenda?.ok===true&&r.result.details.exitCode===0,exitCode:r.result.details.exitCode});
    assert(agenda?.ok===true&&r.result.details.exitCode===0,'Candidate personal Feishu calendar query did not succeed (details intentionally withheld)');
  } else checks.push({case:'feishu-calendar-read-only',skipped:'candidate has no personal CLI profile'});
  const start=performance.now(),prior=retired;
  r=await after({...request,input:{...request.input,args:{command:"sleep 0.3; printf 'voice-done'",background:true,yieldMs:1,timeoutSeconds:10}}});
  assert.equal(r.ok,true,JSON.stringify(r.error));assert.equal(r.result.details.status,'completed');
  assert(r.result.content.some(c=>c.text?.includes('voice-done')));assert(performance.now()-start>=280);
  assert.equal(retired,prior+1);
  checks.push({case:'background-request-remains-foreground-and-retires-authority',ok:true});
  for(const overrides of [{clientCaps:[]},{senderIsOwner:false}]) {
    r=await after({...request,...overrides});assert.equal(r.ok,false);
    checks.push({case:'nonvoice-or-nonowner-remains-denied',ok:true});
  }
  const blockedCfg=structuredClone(cfg);
  blockedCfg.tools.deny=[...(blockedCfg.tools.deny??[]),'exec'];
  r=await after({...request,cfg:blockedCfg});assert.equal(r.ok,false);assert.equal(r.status,404);
  checks.push({case:'explicit-exec-deny-remains-enforced',ok:true});
  const abort=new AbortController();setTimeout(()=>abort.abort(),250);
  const count=retired;
  r=await after({...request,signal:abort.signal,input:{...request.input,args:{command:'sleep 5',timeoutSeconds:10}}});
  assert.equal(r.ok,false);assert.equal(retired,count+1);
  checks.push({case:'host-abort-retires-exact-authority',ok:true});
  console.log(JSON.stringify({schema:'voice-direct-admission-candidate-v1',secretEgress:true,sharedGatewayStarted:false,checks}));
} finally {await proxy.stop();}
process.exit(0);
