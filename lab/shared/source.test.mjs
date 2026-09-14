import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sourceBundle} from './source.mjs';
import {fileURLToPath} from 'node:url';

test('incremental bundle transfers new commits and verifies against existing server history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-sync-test-'));
  const git = args => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    git(['init', '-b', 'dev']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(dir + '/large-source', randomBytes(256 * 1024));
    git(['add', 'large-source']); git(['commit', '-m', 'baseline']);
    const base = git(['rev-parse', 'HEAD']);
    const server = path.join(os.tmpdir(), path.basename(dir) + '-server');
    try {
      execFileSync('git', ['clone', '--bare', dir, server], {stdio: 'ignore'});
      fs.writeFileSync(dir + '/change', 'candidate'); git(['add', 'change']); git(['commit', '-m', 'small change']);
      const full = sourceBundle(dir), delta = sourceBundle(dir, base);
      assert(delta.bytes.length < full.bytes.length / 10);
      fs.writeFileSync(dir + '/delta.bundle', delta.bytes);
      execFileSync('git', ['--git-dir=' + server, 'bundle', 'verify', dir + '/delta.bundle'], {stdio: 'ignore'});
      execFileSync('git', ['--git-dir=' + server, 'fetch', dir + '/delta.bundle', 'refs/heads/dev:refs/heads/dev'], {stdio: 'ignore'});
      assert.equal(execFileSync('git', ['--git-dir=' + server, 'rev-parse', 'dev'], {encoding: 'utf8'}).trim(), delta.commit);
      assert.equal(sourceBundle(dir, delta.commit).bytes, null);
      assert.throws(() => sourceBundle(dir, '0'.repeat(40)));
    } finally {fs.rmSync(server, {recursive: true, force: true});}
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('new worktree uses committed dev while preserving unrelated dirty dev changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-new-test-'));
  const dir = root + '/dev', task = root + '/task';
  fs.mkdirSync(dir);
  const git = args => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    git(['init', '-b', 'dev']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(dir + '/code', 'committed'); git(['add', 'code']); git(['commit', '-m', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    fs.writeFileSync(dir + '/.git/vlab-workflow.json', JSON.stringify({dev: dir}));
    fs.writeFileSync(dir + '/code', 'another task in progress');
    const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../vlab.mjs', import.meta.url)),
      'new', '--repo', dir, '--task', 'dirty-dev-proof', '--path', task, '--owner', 'test-owner'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
    assert.equal(result.base, base);
    assert.equal(fs.readFileSync(task + '/code', 'utf8'), 'committed');
    assert.equal(fs.readFileSync(dir + '/code', 'utf8'), 'another task in progress');
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});
