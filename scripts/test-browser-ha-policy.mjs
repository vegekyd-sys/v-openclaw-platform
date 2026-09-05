import assert from 'node:assert/strict';
const core=process.argv[2];assert(core?.startsWith('/srv/vlab-production-mirror/'));
const {resolvePinnedHostnameWithPolicy,SsrFBlockedError}=await import(core+'/dist/plugin-sdk/ssrf-runtime.js');
const before={allowedHostnames:['100.82.39.107']},after={allowedHostnames:['100.82.39.107','192.168.1.50']};
await assert.rejects(resolvePinnedHostnameWithPolicy('192.168.1.50',{policy:before}),SsrFBlockedError);
const r=await resolvePinnedHostnameWithPolicy('192.168.1.50',{policy:after});assert.deepEqual(r.addresses,['192.168.1.50']);
for(const host of ['192.168.1.51','127.0.0.1','169.254.169.254'])await assert.rejects(resolvePinnedHostnameWithPolicy(host,{policy:after}),SsrFBlockedError);
console.log(JSON.stringify({ok:true,haExplicitAllow:true,otherPrivateAndMetadataBlocked:true,networkRequests:0}));
