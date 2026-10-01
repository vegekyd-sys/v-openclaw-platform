import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {disableCodexPlugins} from './config.mjs';

// Same shape as V's Gateway and Worker configs on 2026-09-30 (non-secret fields only).
const v = () => ({
  gateway: {port: 22793},
  plugins: {entries: {
    codex: {enabled: true, config: {
      appServer: {mode: 'yolo', serviceTier: 'priority'},
      codexPlugins: {enabled: true, allow_destructive_actions: true,
        plugins: {canva: {enabled: true, marketplaceName: 'openai-curated', pluginName: 'canva', allow_destructive_actions: true}}},
    }},
    feishu: {enabled: true},
  }},
});

test('disables codexPlugins and changes nothing else', () => {
  const before = v();
  const {config, changed} = disableCodexPlugins(before);
  assert.equal(changed, true);
  assert.equal(config.plugins.entries.codex.config.codexPlugins.enabled, false);
  const expected = v();
  expected.plugins.entries.codex.config.codexPlugins.enabled = false;
  assert.deepEqual(config, expected, 'plugin list, appServer and other plugins are kept');
  assert.equal(before.plugins.entries.codex.config.codexPlugins.enabled, true, 'input is not mutated');
});

test('idempotent and a no-op without codexPlugins', () => {
  const once = disableCodexPlugins(v()).config;
  assert.deepEqual(disableCodexPlugins(once), {config: once, changed: false, reason: 'already disabled'});
  const bare = {plugins: {entries: {codex: {enabled: true, config: {}}}}};
  assert.equal(disableCodexPlugins(bare).changed, false);
  assert.equal(disableCodexPlugins({}).changed, false);
});

test('refuses plugins nobody reviewed, and allow_all_plugins', () => {
  const extra = v();
  extra.plugins.entries.codex.config.codexPlugins.plugins.github = {enabled: true, marketplaceName: 'openai-curated', pluginName: 'github'};
  assert.throws(() => disableCodexPlugins(extra), /Unreviewed Codex plugins configured: github/);
  const all = v();
  all.plugins.entries.codex.config.codexPlugins.allow_all_plugins = true;
  assert.throws(() => disableCodexPlugins(all), /allow_all_plugins/);
});

test('CLI plans by default and applies with a backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-plugins-off-'));
  const file = path.join(dir, 'openclaw.json');
  fs.writeFileSync(file, JSON.stringify(v(), null, 2) + '\n', {mode: 0o600});
  const cli = fileURLToPath(new URL('./config.mjs', import.meta.url));
  const plan = JSON.parse(execFileSync(process.execPath, [cli, file], {encoding: 'utf8'}));
  assert.equal(plan.changed, true);
  assert.equal(JSON.parse(fs.readFileSync(file)).plugins.entries.codex.config.codexPlugins.enabled, true, 'plan does not write');
  const lines = execFileSync(process.execPath, [cli, file, '--apply'], {encoding: 'utf8'}).trim().split('\n').map(l => JSON.parse(l));
  assert.equal(JSON.parse(fs.readFileSync(file)).plugins.entries.codex.config.codexPlugins.enabled, false);
  assert.equal(JSON.parse(fs.readFileSync(lines[1].backup)).plugins.entries.codex.config.codexPlugins.enabled, true, 'backup holds the original');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.rmSync(dir, {recursive: true, force: true});
});
