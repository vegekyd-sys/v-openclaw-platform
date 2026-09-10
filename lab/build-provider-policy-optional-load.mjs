// Avoid allocating an exception for the already-cached optional absence only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha = s => createHash('sha256').update(s).digest('hex');
const baseRelease = 'concurrency-lifecycle-projection-v1', files = [], originals = {};
const read = target => {
  const r = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 8 * 1024 ** 2, timeout: 120000}));
  assert.equal(r.current.release, baseRelease);
  const source = Buffer.from(r.content, 'base64').toString(); assert.equal(sha(source), r.sha256);
  originals[target] = r.sha256; return {...r, source};
};
const replaceOnce = (s, a, b) => {assert.equal(s.split(a).length, 2, 'Expected unique source anchor'); return s.replace(a, b);};
const save = (r, dest, output) => {
  fs.writeFileSync(new URL('./release-files/' + dest, import.meta.url), output);
  files.push({source: 'lab/release-files/' + dest, target: r.target, before: r.sha256});
};
const loader = read('openclaw/dist/public-surface-loader-V55JV4Jk.js');
const helper = `function tryLoadBundledPluginPublicArtifactModuleSync(params) {
\tconst location = resolvePublicSurfaceLocation(params);
\tif (!location) return { found: false };
\treturn { found: true, module: loadBundledPublicSurfaceAtLocation({ ...params, location }) };
}
`;
let output = replaceOnce(loader.source, 'function loadBundledPluginPublicArtifactModuleSync(params) {', helper + 'function loadBundledPluginPublicArtifactModuleSync(params) {');
output = replaceOnce(output, 'export { loadBundledPluginPublicArtifactModuleSync as n,', 'export { tryLoadBundledPluginPublicArtifactModuleSync as o, loadBundledPluginPublicArtifactModuleSync as n,');
save(loader, 'optional-public-surface-loader.js', output);
const policy = read('openclaw/dist/provider-policy-surface-bKCE_kaj.js');
output = replaceOnce(policy.source, 'n as loadBundledPluginPublicArtifactModuleSync', 'o as tryLoadBundledPluginPublicArtifactModuleSync');
output = replaceOnce(output, `\t\tloadModule: (artifactBasename) => loadBundledPluginPublicArtifactModuleSync({
\t\t\tdirName: pluginId,
\t\t\tartifactBasename
\t\t}),`, `\t\tloadModule: (artifactBasename) => {
\t\t\tconst resolved = tryLoadBundledPluginPublicArtifactModuleSync({ dirName: pluginId, artifactBasename });
\t\t\treturn resolved.found ? resolved.module : {};
\t\t},`);
save(policy, 'optional-provider-policy-surface.js', output);
fs.writeFileSync(new URL('./provider-policy-optional-load-plan.json', import.meta.url), JSON.stringify({baseRelease, files}, null, 2) + '\n');
console.log(JSON.stringify({baseRelease, files: files.length, originals}));
