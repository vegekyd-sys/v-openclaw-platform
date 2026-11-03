import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The release scripts drive the dev checkout's lab/vlab.mjs, not the one beside
// them, so a task worktree cannot release with its own old tool. That checkout
// is in a different place on each machine that may release: the Mac, and V
// itself (docs/v-self-update.md).
const MAC_TOOL = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';

export function defaultVlabTool({ env = process.env, exists = existsSync, home = homedir() } = {}) {
  if (env.VLAB_TOOL) return env.VLAB_TOOL;
  return exists(MAC_TOOL) ? MAC_TOOL : join(home, 'src/vlab-dev/lab/vlab.mjs');
}
