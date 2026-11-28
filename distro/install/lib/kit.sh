# Sourced by install.sh, update.sh and reconfigure.sh.
# v_use_kit DIR: check a deployment kit (distro/build/offline-kit.sh) against its SHA256SUMS and point
# the installer at the files in it instead of nodejs.org, GitHub and dl.google.com.
v_use_kit() {
  local kit="$1"
  [ -f "$kit/SHA256SUMS" ] || { echo "kit: no SHA256SUMS in $kit" >&2; return 1; }
  ( cd "$kit" && sha256sum -c --quiet SHA256SUMS ) || { echo "kit: files in $kit do not match its SHA256SUMS" >&2; return 1; }
  if [ -d "$kit/skills" ]; then export V_SKILLS_TARBALL_DIR="$kit/skills"; fi
  if [ -f "$kit/chrome/google-chrome-stable.deb" ]; then export V_CHROME_DEB="$kit/chrome/google-chrome-stable.deb"; fi
  if [ -f "$kit/cloudflared/cloudflared.deb" ]; then export V_CLOUDFLARED_DEB="$kit/cloudflared/cloudflared.deb"; fi
  echo "kit: $kit checked (skills: $([ -n "${V_SKILLS_TARBALL_DIR:-}" ] && echo yes || echo no), chrome: $([ -n "${V_CHROME_DEB:-}" ] && echo yes || echo no), cloudflared: $([ -n "${V_CLOUDFLARED_DEB:-}" ] && echo yes || echo no))"
}

# The kit recorded at install time (install.env V_KIT_DIR), if it is still there.
v_recorded_kit() {
  local k
  k="$(sed -n 's/^V_KIT_DIR=//p' /etc/v/install.env 2>/dev/null | tail -1)"
  if [ -n "$k" ] && [ -f "$k/SHA256SUMS" ]; then echo "$k"; fi
}
