#!/bin/bash
# Install the fake Claude Code used by cron-default-owner-tools.mjs on VLab (root), laid out like V's npm-global
# install so OpenClaw's claude-cli executable binding accepts it:
#   /opt/vlab-fake-claude-cron/bin/claude -> ../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
#   claude.exe (fake-claude-exe.c) execs node /opt/vlab-fake-claude-cron/fake-claude.mjs
# Usage (from the repo root on a machine with the vlab91 ssh entry):
#   lab/candidate/cron-default-owner-tools/install-fake.sh install | remove
set -euo pipefail
SSH=(ssh -F /Users/tianyicai/v-upgrade-private/20260904/ssh-config -o BatchMode=yes vlab91)
SCP=(scp -q -F /Users/tianyicai/v-upgrade-private/20260904/ssh-config)
case "${1:-}" in
  install)
    "${SCP[@]}" lab/candidate/cron-default-owner-tools/fake-claude.mjs lab/candidate/cron-default-owner-tools/fake-claude-exe.c vlab91:/tmp/
    "${SSH[@]}" 'set -e; R=/opt/vlab-fake-claude-cron; P=$R/lib/node_modules/@anthropic-ai/claude-code
      sudo rm -rf $R; sudo install -d -o root -g root -m 0755 $R $R/bin $P $P/bin
      sudo install -o root -g root -m 0644 /tmp/fake-claude.mjs $R/fake-claude.mjs
      gcc -O2 -o /tmp/claude.exe /tmp/fake-claude-exe.c && sudo install -o root -g root -m 0755 /tmp/claude.exe $P/bin/claude.exe
      printf "%s\n" "{\"name\":\"@anthropic-ai/claude-code\",\"version\":\"2.1.280\",\"bin\":{\"claude\":\"bin/claude.exe\"}}" | sudo tee $P/package.json >/dev/null
      sudo ln -s ../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe $R/bin/claude
      rm -f /tmp/fake-claude.mjs /tmp/fake-claude-exe.c /tmp/claude.exe; $R/bin/claude --version' ;;
  remove)
    "${SSH[@]}" 'sudo rm -rf /opt/vlab-fake-claude-cron' ;;
  *) echo "usage: $0 install|remove" >&2; exit 2 ;;
esac
