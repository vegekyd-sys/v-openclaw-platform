import assert from 'node:assert/strict';
export const db91Release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
export const oldDb91Core='/opt/openclaw-2026.9.1-v/openclaw';
export const oldDb91Worker='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91';
export function planDb91Config(bytes){
 const cfg=JSON.parse(bytes);let worker=0,core=0;
 const rewrite=value=>{
  if(value===oldDb91Worker){worker++;return db91Release+'/worker';}
  if(value===oldDb91Core){core++;return db91Release+'/core';}
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  return value;
 };
 const after=rewrite(cfg);assert.equal(worker,1,'Expected exactly one Worker pointer');assert.equal(core,1,'Expected exactly one voice-memory core pointer');
 assert.equal(after.mcp.servers['universal-memory'].enabled,false);
 return JSON.stringify(after,null,2)+'\n';
}
export const db91SignalPolicy='[Service]\nKillMode=mixed\n';
export function db91ReleaseUnit(){
 const state='/home/openclaw/.openclaw',node='/opt/node-v22.23.1/bin/node',core=db91Release+'/core';
 return `[Service]
ExecStart=
ExecStart=${node} --inspect=127.0.0.1:9229 --max-old-space-size=12288 ${core}/dist/index.js gateway --port 22793
ExecStartPre=
ExecStartPre=-+/bin/bash ${state}/releases/openclaw91-feishu-parity-v1/apply-openclaw91-feishu-parity.sh ${core} ${state} ${state}/releases/openclaw91-feishu-parity-v1
ExecStartPre=${node} ${state}/experiments/agent-worker-isolation-v1/prune-openclaw-session-hotset.mjs ${state}/agents /opt/openclaw-experiments/agent-worker-isolation-v1/releases/80e6d3bfe447a581451bfce2d74e25517b11d9ef/session-hotset.mjs 180000
ExecStartPre=-+${node} ${state}/releases/steer91-0.2.11/apply-feishu-steer91-prestart.mjs ${state}
Environment=OPENCLAW_DB91_READ_AHEAD_ENABLE=1
Environment=OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE=1
Environment=OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE=1
Environment=V_RELEASE_VERSION=v2026.9.1-db91.1
KillMode=mixed
`;
}
