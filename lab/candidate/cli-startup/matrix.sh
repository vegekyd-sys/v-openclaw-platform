#!/bin/bash
set -u
echo "runtime=$VLAB_CANDIDATE_RUNTIME config=$OPENCLAW_CONFIG_PATH state=$OPENCLAW_STATE_DIR data=${VLAB_CANDIDATE_DATA:-}"; id; uptime
N=$(command -v node || echo /opt/vlab/node-v22.23.1-linux-x64/bin/node)
[ -x "$N" ] || N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
C=$VLAB_CANDIDATE_RUNTIME/openclaw/openclaw.mjs; [ -f "$C" ] || C=$(find "$VLAB_CANDIDATE_RUNTIME" -maxdepth 3 -name openclaw.mjs | head -1)
echo "C=$C"; ls -la "$OPENCLAW_STATE_DIR" | head -20; du -sh "$OPENCLAW_STATE_DIR" 
OUT=${CLI_OUT:-/tmp/cli-slow-cand}; rm -rf $OUT; mkdir -p $OUT; HK=$PWD/hook.mjs
[ -f "$HK" ] || HK=$(find . -name hook.mjs | head -1); HK=$(realpath "$HK")
run() { # label args...
  local l=$1; shift
  echo "### $l: $*"
  timeout 120 $N "$C" "$@" </dev/null >/dev/null 2>$OUT/$l.warm.err; echo warmrc=$?
  for i in 1 2 3 4 5; do
    /usr/bin/time -f "$l wall=%e user=%U sys=%S rss_kb=%M majflt=%F inblk=%I outblk=%O" timeout 120 $N "$C" "$@" </dev/null >/dev/null 2>$OUT/$l.t ; tail -1 $OUT/$l.t
  done
  CLI_SLOW_OUT=$OUT/$l timeout 120 $N --import "$HK" "$C" "$@" </dev/null >/dev/null 2>&1
  timeout 120 $N --cpu-prof --cpu-prof-dir=$OUT --cpu-prof-name=$l.cpuprofile --cpu-prof-interval 500 "$C" "$@" </dev/null >/dev/null 2>&1
  if command -v strace >/dev/null; then
    timeout 120 strace -f -qq -e trace=openat,mkdir,rename,unlink,connect -o $OUT/$l.strace $N "$C" "$@" </dev/null >/dev/null 2>&1
    echo "writes:"; grep -E 'O_WRONLY|O_RDWR|O_CREAT|mkdir\(|rename\(|unlink\(' $OUT/$l.strace | grep -vE 'ENOENT|/dev/|node-compile-cache' | sed -E 's/^[0-9]+ +//' | cut -c1-160 | sort | uniq -c | sort -rn | head -12
    echo "sqlite opens:"; grep -E '\.sqlite' $OUT/$l.strace | grep -vE 'ENOENT' | sed -E 's/^[0-9]+ +//' | cut -c1-140 | sort | uniq -c | sort -rn | head -6
    echo "connects:"; grep connect $OUT/$l.strace | grep -v ENOENT | sed -E 's/^[0-9]+ +//' | cut -c1-120 | sort | uniq -c | head -5
    echo "openat total: $(grep -c openat $OUT/$l.strace)"
  fi
}
run version --version
run help --help
run config_get config get gateway.port
run config_file config file
run hooks_relay hooks relay --provider codex --relay-id cand --event post_tool_use --timeout 2000
run gateway_call gateway call health --json --timeout 2000
run cron_list cron list --json --timeout 2000
run cron_status cron status --json --timeout 2000
run sessions sessions --json --limit 5
run sessions_all sessions --all-agents --json --limit 5
run memory_status memory status --json
run status status --json
run doctor_lint models list --json
run agents agents list --json
run plugins plugins list --json
run tasks tasks list --json
mkdir -p /tmp/cli-slow-out; python3 - <<'P'
import json,glob,os,sys
out=os.environ.get("CLI_OUT","/tmp/cli-slow-cand")
for f in sorted(glob.glob(out+"/*.json")):
    d=json.load(open(f)); print(os.path.basename(f).split('.')[0],"end",round(d["end"]),"modules",d["n"],"bytes",d["bytes"],"loop",round(d["loop"]),"cpu_ms",round((d["usage"]["userCPUTime"]+d["usage"]["systemCPUTime"])/1000),"rss",d["usage"]["maxRSS"])
P
tar -C $OUT -czf /tmp/cli-slow-out/cand-$$.tgz . && ls -la /tmp/cli-slow-out/; chmod -R a+rX /tmp/cli-slow-out
