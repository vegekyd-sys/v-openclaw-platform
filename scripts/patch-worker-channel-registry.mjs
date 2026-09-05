import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const marker = 'vlab-native-channel-registry-v1';
export function patchChannelRegistry(source) {
  if (source.includes(marker)) return source;
  const anchor = 'function getActivePluginChannelRegistrySnapshotFromState() {\n\tconst state = globalThis[PLUGIN_REGISTRY_STATE];';
  if (source.split(anchor).length !== 2) throw new Error('Native channel registry contract changed');
  return source.replace(anchor, `function getActivePluginChannelRegistrySnapshotFromState() {
\t// ${marker}: only isolated Workers carry a native per-run generation here.
\tconst workerRegistry = globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.getChannelRegistry?.();
\tif (workerRegistry) return { registry: workerRegistry, version: 0 };
\tconst state = globalThis[PLUGIN_REGISTRY_STATE];`);
}
async function main() {
  const [core, mode] = process.argv.slice(2);
  if (!core || !['--check','--apply'].includes(mode)) throw new Error('Usage: core --check|--apply');
  if (JSON.parse(await fs.readFile(path.join(core,'package.json'),'utf8')).version !== '2026.9.1') throw new Error('Requires reviewed OpenClaw 2026.9.1');
  const dist=path.join(core,'dist'), matches=[];
  for(const n of (await fs.readdir(dist)).filter(n=>/^registry-lookup-.*\.js$/.test(n))) {
    const file=path.join(dist,n), before=await fs.readFile(file,'utf8');
    if(before.includes('function getActivePluginChannelRegistrySnapshotFromState()')) matches.push({file,before});
  }
  if(matches.length!==1)throw new Error('Expected exactly one native channel registry');
  const {file,before}=matches[0], after=patchChannelRegistry(before);
  if(mode==='--apply' && after!==before) {
    await fs.copyFile(file,file+'.'+marker+'.bak',fs.constants.COPYFILE_EXCL);
    const st=await fs.stat(file), tmp=file+'.tmp-'+process.pid;
    await fs.writeFile(tmp,after,{mode:st.mode});await fs.chown(tmp,st.uid,st.gid);await fs.rename(tmp,file);
  }
  console.log(JSON.stringify({mode,changed:before!==after,file,marker}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
