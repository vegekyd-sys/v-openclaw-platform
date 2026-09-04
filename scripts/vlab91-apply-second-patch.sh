#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]]
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
core=$candidate/runtime/npm-global/lib/node_modules/openclaw
worker=/opt/vlab/experiments/worker-openclaw91-8750ef7
feishu=$candidate/state/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-ca9f965949342b2f/node_modules/@openclaw/feishu
[[ -f $worker/index.mjs ]]
status=$(bash /srv/vlab/staging/vlab91-cli.sh gateway call vlab.workers.status --port 24993 --timeout 15000 --json)
printf '%s' "$status" | "$node" -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const j=JSON.parse(s);if(j.pending||j.workers.some(w=>w.activeCount||w.queued||w.detachedTaskCount))process.exit(2);});'
systemctl stop openclaw-vlab-production-mirror-v8.service
for config in "$candidate/state/openclaw.json" "$candidate/experiments/agent-worker-isolation-v1/worker-openclaw.json"; do
  cp --no-clobber "$config" "$config.pre-second-patch-20260904"
  next_paths=$("$node" -e 'const fs=require("fs"),c=JSON.parse(fs.readFileSync(process.argv[1]));const p=c.plugins.load.paths;if(p.filter(x=>x==="/opt/vlab/experiments/worker-openclaw91-0cfb47a").length!==1)throw Error("Unexpected Worker path");console.log(JSON.stringify(p.map(x=>x==="/opt/vlab/experiments/worker-openclaw91-0cfb47a"?"/opt/vlab/experiments/worker-openclaw91-8750ef7":x)));' "$config")
  VLAB91_CONFIG_PATH="$config" bash /srv/vlab/staging/vlab91-cli.sh config set plugins.load.paths "$next_paths" --strict-json
done
"$node" "$worker/patch-openclaw-sessions-spawn-gateway-proxy.mjs" "$core"
"$node" /srv/vlab/staging/patch-openclaw91-runtime-footer.mjs "$core" "$feishu" --apply
"$node" --check "$core/dist/agent-runner.runtime-CAdsMsQt.js"
"$node" --check "$core/dist/reply-prefix-Ddn3qL_7.js"
"$node" --check "$feishu/dist/monitor.account-B6Fv45B2.js"
bash /srv/vlab/staging/vlab91-start-mirror.sh
