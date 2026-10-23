import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ensureFeishuVoiceLayout, feishuVoiceLayoutRemote} from '../scripts/lib/feishu-voice-layout.mjs';
import {actorRuntimeModule} from '../lab/patch-feishu-voice-actor.mjs';
import {execFileSync} from 'node:child_process';

function fixture(t, production = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-layout-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const core = path.join(root, 'release/core');
  const relative = '../../npm/projects/openclaw-feishu-reviewed/node_modules/@openclaw/feishu';
  const alias = path.resolve(core, 'dist', relative);
  const feishu = production ? path.join(root, 'installed-feishu') : alias;
  fs.mkdirSync(path.join(core, 'dist'), {recursive:true});
  fs.mkdirSync(path.join(feishu, 'dist'), {recursive:true});
  fs.writeFileSync(path.join(feishu, 'package.json'), '{"type":"module"}');
  for (const [file, code] of Object.entries({
    'monitor.account-Test.js':'export const resolveVoiceFeishuAccount=()=>{};export const voiceFeishuPolicyDependencies=x=>x;',
    'client-Test.js':'export const createFeishuPhoneTabClient=()=>{};'
  })) fs.writeFileSync(path.join(feishu, 'dist', file), code);
  fs.writeFileSync(path.join(core, 'package.json'), '{"type":"module"}');
  for (const [file, code] of Object.entries({
    'v-feishu-voice-actor.mjs':'export const createVoiceActorMiddleware=()=>()=>"resolved";',
    'v-feishu-voice-policy.mjs':'export const createFeishuVoicePolicy=x=>x;',
    'command-auth-Test.js':'export const n=()=>{};'
  })) fs.writeFileSync(path.join(core, 'dist', file), code);
  const entry = path.join(core, 'dist/v-feishu-voice-runtime.mjs');
  fs.writeFileSync(entry, actorRuntimeModule({feishuMonitor:relative+'/dist/monitor.account-Test.js',
    feishuClient:relative+'/dist/client-Test.js',commandAuth:'./command-auth-Test.js'}));
  return {core, feishu, alias, entry};
}

test('production physical layout resolves unchanged accepted runtime imports', async t => {
  const f = fixture(t);
  const before = fs.readFileSync(f.entry, 'utf8');
  assert.equal(ensureFeishuVoiceLayout(f).verified, false);
  assert.equal(fs.existsSync(f.alias), false);
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module'], {
    input:feishuVoiceLayoutRemote({...f, apply:true}),encoding:'utf8'}));
  assert.equal(result.created, true);
  assert.equal((await import(pathToFileURL(f.entry))).prepareVoiceActor(), 'resolved');
  assert.equal(fs.readFileSync(f.entry, 'utf8'), before);
  assert.equal(ensureFeishuVoiceLayout({...f,apply:true}).created, false);
});

test('VLab package layout needs no alias mutation', async t => {
  const f = fixture(t, false);
  assert.equal(ensureFeishuVoiceLayout({...f,apply:true}).created, false);
  assert.equal(fs.lstatSync(f.feishu).isSymbolicLink(), false);
  assert.equal((await import(pathToFileURL(f.entry))).prepareVoiceActor(), 'resolved');
});

test('another installed package is never replaced', t => {
  const f = fixture(t);
  fs.mkdirSync(f.alias, {recursive:true});
  assert.throws(() => ensureFeishuVoiceLayout({...f,apply:true}), /Refusing to replace/);
  assert.equal(fs.lstatSync(f.alias).isSymbolicLink(), false);
});

test('missing dependency and malformed imports fail before creating paths', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.feishu, 'dist/client-Test.js'));
  assert.throws(() => ensureFeishuVoiceLayout({...f,apply:true}), /ENOENT/);
  assert.equal(fs.existsSync(f.alias), false);
  assert.throws(() => ensureFeishuVoiceLayout({...f,source:'export const x=1;',apply:true}), /two reviewed/);
});

test('releases without this optional runtime require no layout change', t => {
  const f = fixture(t);
  fs.unlinkSync(f.entry);
  assert.deepEqual(ensureFeishuVoiceLayout(f), {required:false});
});
