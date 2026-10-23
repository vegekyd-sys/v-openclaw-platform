import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Core and Feishu have different physical roots on V. Keep the accepted bytes
// unchanged and provide the exact package path their relative imports name.
export function ensureFeishuVoiceLayout({core, feishu, apply = false, source}) {
  const entry = path.join(core, 'dist/v-feishu-voice-runtime.mjs');
  if (source === undefined && !fs.existsSync(entry)) return {required: false};
  source ??= fs.readFileSync(entry, 'utf8');
  const imports = [...source.matchAll(/from "(\.\.\/\.\.\/npm\/projects\/openclaw-feishu-[A-Za-z0-9_-]+\/node_modules\/@openclaw\/feishu)\/dist\/((?:monitor\.account-|client-)[A-Za-z0-9]+\.js)"/g)];
  assert.equal(imports.length, 2, 'Expected the two reviewed Feishu runtime imports');
  assert.equal(imports[0][1], imports[1][1], 'Feishu runtime imports disagree');
  const target = fs.realpathSync(feishu);
  for (const match of imports) assert(fs.statSync(path.join(target, 'dist', match[2])).isFile(), 'Feishu dependency unavailable');
  const alias = path.resolve(core, 'dist', imports[0][1]);
  let exists = false;
  try { fs.lstatSync(alias); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) {
    assert.equal(fs.realpathSync(alias), target, 'Refusing to replace another Feishu package');
    return {required: true, alias, target, created: false, verified: true};
  }
  if (apply) {
    fs.mkdirSync(path.dirname(alias), {recursive: true, mode: 0o755});
    fs.symlinkSync(target, alias, 'dir');
    assert.equal(fs.realpathSync(alias), target);
  }
  return {required: true, alias, target, created: apply, verified: apply};
}

export function feishuVoiceLayoutRemote(options) {
  return `import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';\n${ensureFeishuVoiceLayout.toString()}\nconsole.log(JSON.stringify(ensureFeishuVoiceLayout(${JSON.stringify(options)})));\n`;
}
