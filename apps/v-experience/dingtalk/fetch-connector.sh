#!/bin/sh
# Copies the DingTalk connector npm project that V runs (package.json, lock,
# node_modules; code only, no state) to tmp/inputs/ for candidate tests.
set -eu
cd "$(dirname "$0")/../../.."
mkdir -p tmp/inputs
ssh v 'sudo -n bash -c "cd /home/openclaw/.openclaw/npm/projects/dingtalk-real-ai-dingtalk-connector-*/ && tar czf - package.json package-lock.json node_modules"' \
  > tmp/inputs/dingtalk-connector-0.8.26-v.tgz
ls -l tmp/inputs/dingtalk-connector-0.8.26-v.tgz
