# Source on V before run/judge/answer: Gateway env (Google/xAI/OpenRouter keys) plus optional bench-only keys.
set -a
. /home/openclaw/.openclaw/.env
[ -f /tmp/wsbench/keys.env ] && . /tmp/wsbench/keys.env
set +a
