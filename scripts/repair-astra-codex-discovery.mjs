import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.env.OPENCLAW_HOME;
assert.equal(root,'/srv/vlab-production-mirror/labs/instances/astra');
for(const file of ['openclaw.json','worker-openclaw.json']) {
  const p=`${root}/state/${file}`,c=JSON.parse(fs.readFileSync(p));
  c.plugins.load.paths=c.plugins.load.paths.filter(x=>!x.endsWith('/node_modules/@openclaw/codex'));
  fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
console.log('Codex custom-load override removed; use official plugin installation');
