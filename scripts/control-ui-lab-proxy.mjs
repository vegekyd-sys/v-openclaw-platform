#!/usr/bin/env node
import fs from 'node:fs';
const [template,root]=process.argv.slice(2);
if(!root?.startsWith('/srv/vlab-control-ui-qa-')) throw new Error('QA root only');
const strict=fs.readFileSync(template,'utf8').replaceAll('__PROXY_PORT__','25994').replaceAll('__GATEWAY_PORT__','25993');
// 25995 is a lab-only Cloudflare edge simulator. Never ship it to production.
const edge=`server { listen 127.0.0.1:25995; server_name localhost;
location / { proxy_pass http://127.0.0.1:25994; proxy_http_version 1.1;
proxy_set_header Host openclaw.tianyi.live; proxy_set_header CF-Connecting-IP 203.0.113.10;
proxy_set_header X-Forwarded-For ''; proxy_set_header Forwarded '';
proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $v_control_connection;
proxy_buffering off; proxy_read_timeout 3600s; }
}`;
fs.writeFileSync(root+'/nginx.conf',`worker_processes 1; pid ${root}/nginx.pid; error_log stderr warn; events {worker_connections 128;} http {access_log off; client_body_temp_path ${root}/nginx-temp; proxy_temp_path ${root}/proxy-temp; ${strict}\n${edge}\n}\n`,{mode:0o600});
const cpath=root+'/state/openclaw.json',c=JSON.parse(fs.readFileSync(cpath,'utf8'));
if (!c.gateway.controlUi.allowedOrigins.includes('http://127.0.0.1:25995')) {
 c.gateway.controlUi.allowedOrigins.push('http://127.0.0.1:25995');
 fs.writeFileSync(cpath,JSON.stringify(c,null,2)+'\n',{mode:0o600});
}
console.log('QA strict proxy 25994; QA-only edge simulator 25995');
