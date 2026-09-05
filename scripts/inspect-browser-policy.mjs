import fs from 'node:fs';
for(const file of ['/home/openclaw/.openclaw/openclaw.json','/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json','/srv/vlab-browser/releases/native-browser91-20260905/state/openclaw.json']) {
 const c=JSON.parse(fs.readFileSync(file));console.log(JSON.stringify({file,ssrf:c.browser?.ssrfPolicy,profileNames:Object.keys(c.browser?.profiles??{}),browserPlugin:c.plugins?.load?.paths?.filter(p=>p.includes('/v-browser/'))}));
}
const actor='feishu:ou_cb133fd4414f0607e8b46a3195c7b9d8',headers={authorization:'Bearer '+fs.readFileSync('/srv/vlab-browser/state/broker-admin-token','utf8').trim()};
const devices=await fetch('http://127.0.0.1:23891/v1/devices?actorUserId='+actor,{headers}).then(r=>r.json());
for(const d of devices.devices??[])if(d.online){
 const tabs=await fetch(`http://127.0.0.1:23891/v1/devices/${encodeURIComponent(d.deviceId)}/tabs?actorUserId=${actor}`,{headers}).then(r=>r.json());
 console.log(JSON.stringify({haTabs:tabs.tabs?.filter(t=>/Home Assistant/.test(t.title)).map(t=>({tabId:t.tabId,title:t.title,hostname:new URL(t.url).hostname}))}));
}
