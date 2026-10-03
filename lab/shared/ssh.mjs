import fs from 'node:fs';

// The Mac keeps the vlab91 alias in a private SSH config. Any other host that
// runs the VLab tools (V, from 2026-10-02) defines vlab91 in its own
// ~/.ssh/config, so the private file is used only where it exists.
const PRIVATE_CONFIG = process.env.VLAB_SSH_CONFIG ?? '/Users/tianyicai/v-upgrade-private/20260904/ssh-config';

export const vlabSsh = [...(fs.existsSync(PRIVATE_CONFIG) ? ['-F', PRIVATE_CONFIG] : []), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'vlab91'];
