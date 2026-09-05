import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['prepare','apply-config','switch-ingress','rollback'].includes(mode));
const root='/home/openclaw/.openclaw/backups/control-ui-https-20260905';
const config='/home/openclaw/.openclaw/openclaw.json';
const tunnel='/etc/cloudflared/v-dashboard.yml';
const nginx='/etc/nginx/conf.d/v-control-ui-https.conf';
const replacement='  - hostname: openclaw.tianyi.live\n    service: http://127.0.0.1:22794';
const original='  - hostname: openclaw.tianyi.live\n    service: http://127.0.0.1:22793';
const writeOwned=(p,data)=>{const s=fs.statSync(p);fs.writeFileSync(p+'.vui-tmp',data,{mode:s.mode&0o777});fs.chownSync(p+'.vui-tmp',s.uid,s.gid);fs.renameSync(p+'.vui-tmp',p);};
if(mode==='prepare') {
 assert(!fs.existsSync(root));assert(!fs.existsSync(nginx));
 assert(!execFileSync('ss',['-ltn'],{encoding:'utf8'}).includes(':22794 '));
 assert(fs.readFileSync(tunnel,'utf8').includes(original));
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 fs.copyFileSync(config,root+'/openclaw.json.before');fs.copyFileSync(tunnel,root+'/v-dashboard.yml.before');
 const c=JSON.parse(fs.readFileSync(config));
 fs.writeFileSync(root+'/proxy-fields.before.json',JSON.stringify({trustedProxies:c.gateway.trustedProxies,allowedOrigins:c.gateway.controlUi?.allowedOrigins}));
 const t=fs.readFileSync('/tmp/control-ui-cloudflare-origin.conf.template','utf8').replaceAll('__PROXY_PORT__','22794').replaceAll('__GATEWAY_PORT__','22793');
 fs.writeFileSync(nginx,t,{mode:0o644});
 try{execFileSync('nginx',['-t'],{stdio:'inherit'});}catch(e){fs.renameSync(nginx,root+'/nginx.failed');throw e;}
 console.log(JSON.stringify({prepared:true,root,trafficChanged:false}));
} else if(mode==='apply-config') {
 const c=JSON.parse(fs.readFileSync(config));assert.equal(c.gateway.auth.mode,'token');
 c.gateway.trustedProxies=[...new Set([...(c.gateway.trustedProxies??[]),'127.0.0.1/32'])];
 c.gateway.controlUi??={};assert(!c.gateway.controlUi.dangerouslyDisableDeviceAuth);
 c.gateway.controlUi.allowedOrigins=[...new Set([...(c.gateway.controlUi.allowedOrigins??[]),'https://openclaw.tianyi.live'])];
 writeOwned(config,JSON.stringify(c,null,2)+'\n');console.log(JSON.stringify({configApplied:true,restartOwnedByCoordinator:true}));
} else if(mode==='switch-ingress') {
 const text=fs.readFileSync(tunnel,'utf8');assert(text.includes(original));
 execFileSync('nginx',['-t'],{stdio:'inherit'});execFileSync('systemctl',['reload','nginx']);
 writeOwned(tunnel,text.replace(original,replacement));
 execFileSync('systemctl',['restart','cloudflared-v-dashboard.service'],{timeout:60000});
 console.log(JSON.stringify({publicRouteSwitched:true,port:22794}));
} else {
 const c=JSON.parse(fs.readFileSync(config));const before=JSON.parse(fs.readFileSync(root+'/proxy-fields.before.json'));
 for(const k of ['trustedProxies']){if(before[k]===undefined)delete c.gateway[k];else c.gateway[k]=before[k];}
 if(before.allowedOrigins===undefined)delete c.gateway.controlUi.allowedOrigins;else c.gateway.controlUi.allowedOrigins=before.allowedOrigins;
 writeOwned(config,JSON.stringify(c,null,2)+'\n');
 const text=fs.readFileSync(tunnel,'utf8');if(text.includes(replacement))writeOwned(tunnel,text.replace(replacement,original));
 if(fs.existsSync(nginx))fs.renameSync(nginx,root+'/nginx.disabled-'+Date.now());
 execFileSync('nginx',['-t'],{stdio:'inherit'});execFileSync('systemctl',['reload','nginx']);
 execFileSync('systemctl',['restart','cloudflared-v-dashboard.service'],{timeout:60000});
 console.log(JSON.stringify({rolledBackProxyFieldsOnly:true,gatewayRestartRequired:true}));
}
