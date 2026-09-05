import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function privateProviderPath(root) {
  const base=`${root}/runtime/npm/projects`;
  const candidates=fs.readdirSync(base).map(n=>`${base}/${n}/node_modules/@openclaw/deepseek-provider`).filter(p=>fs.existsSync(`${p}/openclaw.plugin.json`));
  if(candidates.length!==1)throw Error('Baseline must contain one explicitly selected DeepSeek provider generation');
  return candidates[0];
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=process.argv[2];
  if(!root?.startsWith('/srv/vlab-production-mirror/labs/instances/') || fs.realpathSync(root)!==root)throw Error('Private instance required');
  const plugin=privateProviderPath(root);
  for(const file of ['openclaw.json','worker-openclaw.json']) {
    const p=`${root}/state/${file}`,c=JSON.parse(fs.readFileSync(p,'utf8'));
    c.plugins.load.paths=[...new Set([plugin,...c.plugins.load.paths])];
    const worker=c.plugins.entries['vlab-agent-worker-isolation']?.config;
    if(worker?.maxWorkers===1 && worker.warmSpareWorkers===undefined)worker.warmSpareWorkers=0;
    fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
  }
  console.log('Private provider paths registered; credentials unchanged');
}
