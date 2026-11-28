#!/usr/bin/env bash
# Preflight for a customer machine, before install.sh. Needs only bash, curl and coreutils (no Node yet).
#
#   sudo v-distro-<ver>/install/preflight.sh [--out FILE] [--env-file v.env]
#
# Checks the system (Ubuntu 24.04, CPU, memory, disk, systemd, root) and probes every network
# endpoint the install and the running V use. Prints one line per check, then a summary:
# whether to use the mainland mirrors, which offline bundles are needed, and which capabilities
# to leave off because their service cannot be reached. Exit 0 = can install (maybe with mirrors
# or bundles), 1 = a blocking problem (listed as BLOCK).
# --env-file: also write the findings into that install env file: V_UNREACHABLE (services whose key
# configure then leaves unused, and the onboarding tells the owner) and, when the npm mirror is chosen,
# V_NPM_REGISTRY (the npm registry V itself uses later). Other lines are kept.
set -uo pipefail
OUT="" ENV_OUT=""
while [ $# -gt 0 ]; do case "$1" in --out) OUT="$2"; shift 2 ;; --env-file) ENV_OUT="$2"; shift 2 ;; -h|--help) sed -n '2,15p' "$0"; exit 0 ;; *) echo "unknown option $1" >&2; exit 2 ;; esac; done

[ -z "$OUT" ] || exec > >(tee "$OUT")
block=() warn=() off=() bundles=() unreach=()
line() { printf '%-6s %-28s %s\n' "$1" "$2" "$3"; }

# ---- system ----
. /etc/os-release 2>/dev/null || true
if [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ]; then line OK os "${PRETTY_NAME}"; else line WARN os "${PRETTY_NAME:-unknown}: tested on Ubuntu 24.04 only"; warn+=("os"); fi
arch="$(uname -m)"
case "$arch" in x86_64) line OK arch "$arch" ;; aarch64) line WARN arch "$arch: desktop takeover (Google Chrome) is amd64 only"; warn+=("arch") ;; *) line BLOCK arch "$arch unsupported"; block+=("arch") ;; esac
cpus="$(nproc 2>/dev/null || echo 0)"
mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
disk_gb="$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc 0-9)"
[ "$cpus" -ge 2 ] && line OK cpu "$cpus cores" || { line WARN cpu "$cpus core(s): 2+ recommended"; warn+=("cpu"); }
if [ "$mem_mb" -ge 7000 ]; then line OK memory "${mem_mb} MB"
elif [ "$mem_mb" -ge 3500 ]; then line WARN memory "${mem_mb} MB: enough without the desktop; V_DESKTOP=1 wants 8 GB"; warn+=("memory")
else line BLOCK memory "${mem_mb} MB: 4 GB is the minimum"; block+=("memory"); fi
if [ "${disk_gb:-0}" -ge 20 ]; then line OK disk "${disk_gb} GB free on /"; else line BLOCK disk "${disk_gb:-?} GB free on /: 20 GB needed"; block+=("disk"); fi
command -v systemctl >/dev/null && line OK systemd "present" || { line BLOCK systemd "missing"; block+=("systemd"); }
[ "$(id -u)" -eq 0 ] && line OK root "running as root" || line WARN root "not root: run the install with sudo"
for b in curl tar xz python3 git; do command -v "$b" >/dev/null || { line WARN "tool:$b" "missing (install.sh apt-installs it unless --skip-apt)"; }; done

# ---- network ----
# probe NAME URL : OK when any HTTP status comes back within 10 s (a 401/404 still proves the path is open).
probe() {
  local code time
  read -r code time < <(curl -s -o /dev/null -w '%{http_code} %{time_total}' --connect-timeout 8 --max-time 12 -L "$2" 2>/dev/null || echo "000 0")
  if [ "${code:-000}" != 000 ]; then line OK "net:$1" "http $code in ${time}s"; return 0; fi
  line FAIL "net:$1" "no answer from $2"; return 1
}
probe npmjs https://registry.npmjs.org/openclaw && npmjs=1 || npmjs=0
probe npmmirror https://registry.npmmirror.com/openclaw && npmmirror=1 || npmmirror=0
probe nodejs https://nodejs.org/dist/v22.23.1/SHASUMS256.txt && nodejs=1 || nodejs=0
probe node-mirror https://npmmirror.com/mirrors/node/v22.23.1/SHASUMS256.txt && nodemirror=1 || nodemirror=0
probe github https://codeload.github.com/ && github=1 || github=0
probe github-releases https://github.com/cloudflare/cloudflared/releases && ghrel=1 || ghrel=0
probe google-dl https://dl.google.com/linux/linux_signing_key.pub && googledl=1 || googledl=0
probe google-api https://generativelanguage.googleapis.com/ && googleapi=1 || googleapi=0
probe xai https://api.x.ai/ && xai=1 || xai=0
probe deepseek https://api.deepseek.com/ && deepseek=1 || deepseek=0
probe vercel-ai-gateway https://ai-gateway.vercel.sh/ && aigw=1 || aigw=0
probe feishu https://open.feishu.cn/ && feishu=1 || feishu=0
probe makaron https://www.makaron.app/ && makaron=1 || makaron=0
probe volcengine-asr https://openspeech.bytedance.com/ && volc=1 || volc=0
probe apify https://api.apify.com/ && apify=1 || apify=0
apt_host="$(awk '/^URIs:|^deb / {for (i=1;i<=NF;i++) if ($i ~ /^https?:\/\//) {sub(/^https?:\/\//, "", $i); sub(/\/.*/, "", $i); print $i; exit}}' /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list 2>/dev/null | head -1)"
if [ -n "$apt_host" ]; then probe ubuntu-apt "http://$apt_host/" && apt=1 || apt=0; else line WARN net:ubuntu-apt "no apt source configured"; apt=0; fi

# ---- decisions ----
flags=()
# Mainland China: Google blocked but Feishu reachable. npmjs.org and nodejs.org often still answer
# there, but slowly and unreliably, so the mirrors are used whenever they answer.
mainland=0; [ "$googledl" = 0 ] && [ "$googleapi" = 0 ] && [ "$feishu" = 1 ] && mainland=1
[ "$mainland" = 1 ] && line INFO region "Google unreachable, Feishu reachable: treating this as mainland China (mirrors preferred)"
if { [ "$npmjs" = 0 ] || [ "$mainland" = 1 ]; } && [ "$npmmirror" = 1 ]; then flags+=("--registry https://registry.npmmirror.com"); npm_mirror_used=1; else npm_mirror_used=0; fi
if { [ "$nodejs" = 0 ] || [ "$mainland" = 1 ]; } && [ "$nodemirror" = 1 ]; then flags+=("--node-mirror https://npmmirror.com/mirrors/node/v22.23.1/"); fi
[ "$npmjs" = 0 ] && [ "$npmmirror" = 0 ] && { block+=("npm: neither registry.npmjs.org nor registry.npmmirror.com answers"); }
[ "$nodejs" = 0 ] && [ "$nodemirror" = 0 ] && bundles+=("node: bring node-v22.23.1-linux-<arch>.tar.xz and pass --node-tarball (checked against tools.json)")
[ "$github" = 0 ] && bundles+=("skills: run 'vctl fetch-skill-sources --out DIR' where GitHub works, copy DIR over, set V_SKILLS_TARBALL_DIR=DIR for install")
[ "$ghrel" = 0 ] && bundles+=("cloudflared (only with CLOUDFLARE_TUNNEL_TOKEN): bring the pinned .deb, set V_CLOUDFLARED_DEB=FILE")
[ "$googledl" = 0 ] && bundles+=("chrome (only with V_DESKTOP=1): run install/lib/fetch-chrome-deb.sh OUTDIR where dl.google.com works, copy it over, set V_CHROME_DEB=OUTDIR/google-chrome-stable.deb")
[ "$deepseek" = 0 ] && [ "$aigw" = 0 ] && block+=("model: neither api.deepseek.com nor ai-gateway.vercel.sh answers")
[ "$deepseek" = 0 ] && [ "$aigw" = 1 ] && warn+=("model: api.deepseek.com unreachable; use V_MODEL_PRESET=vercel with AI_GATEWAY_API_KEY")
[ "$feishu" = 0 ] && block+=("feishu: open.feishu.cn unreachable")
[ "$apt" = 0 ] && warn+=("apt: the Ubuntu mirror did not answer; install.sh apt-get will fail (or use --skip-apt with packages present)")
[ "$googleapi" = 0 ] && unreach+=(google)
[ "$xai" = 0 ] && unreach+=(xai)
[ "$makaron" = 0 ] && unreach+=(makaron)
[ "$volc" = 0 ] && unreach+=(volcengine)
[ "$apify" = 0 ] && unreach+=(apify)
[ "$googleapi" = 0 ] && off+=("GOOGLE_API_KEY: generativelanguage.googleapis.com unreachable -> leave it out; memory search stays keyword-only")
[ "$xai" = 0 ] && off+=("XAI_API_KEY: api.x.ai unreachable -> leave it out; image understanding stays on DeepSeek Flash")
[ "$makaron" = 0 ] && off+=("MAKARON_API_KEY: www.makaron.app unreachable -> creation skills will say they are not connected")
[ "$volc" = 0 ] && off+=("VOLCENGINE_API_KEY: openspeech.bytedance.com unreachable -> voice messages are not transcribed")
[ "$apify" = 0 ] && off+=("APIFY_API_KEY: api.apify.com unreachable -> social and image search skills say they are not connected")

echo
echo "== summary"
if [ "${#flags[@]}" -gt 0 ]; then echo "install flags : ${flags[*]}"; else echo "install flags : (none)"; fi
for b in ${bundles[@]+"${bundles[@]}"}; do echo "bundle needed : $b"; done
for o in ${off[@]+"${off[@]}"}; do echo "leave off     : $o"; done
for w in ${warn[@]+"${warn[@]}"}; do echo "warning       : $w"; done
for b in ${block[@]+"${block[@]}"}; do echo "BLOCK         : $b"; done

unreach_csv="$(IFS=,; echo "${unreach[*]+${unreach[*]}}")"
echo "V_UNREACHABLE : ${unreach_csv:-(none)}"
if [ -n "$ENV_OUT" ]; then
  [ -f "$ENV_OUT" ] || { echo "env file $ENV_OUT not found" >&2; exit 2; }
  set_env() { # KEY VALUE: replace the KEY= line, or append it
    local tmp; tmp="$(mktemp)"
    grep -v "^$1=" "$ENV_OUT" > "$tmp" || true
    printf '%s=%s\n' "$1" "$2" >> "$tmp"
    cat "$tmp" > "$ENV_OUT"; rm -f "$tmp"
  }
  set_env V_UNREACHABLE "$unreach_csv"
  [ "$npm_mirror_used" = 1 ] && set_env V_NPM_REGISTRY https://registry.npmmirror.com
  echo "written to    : $ENV_OUT"
fi

[ "${#block[@]}" -eq 0 ]
