import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

export function sourceBundle(dir, remoteCommit) {
  const git = args => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const commit = git(['rev-parse', 'dev']);
  if (remoteCommit === commit) return {commit, bytes: null};
  if (remoteCommit) git(['merge-base', '--is-ancestor', remoteCommit, commit]);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-source-'));
  try {
    git(['bundle', 'create', temp + '/source.bundle', 'dev', ...(remoteCommit ? ['^' + remoteCommit] : [])]);
    return {commit, bytes: fs.readFileSync(temp + '/source.bundle')};
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
}
