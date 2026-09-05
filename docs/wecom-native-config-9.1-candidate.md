# WeCom native tool configuration candidate — 2026-09-05

Status (2026-09-06 01:00 Asia/Shanghai): private tests passed; candidate installed
in integration VLab with reviewed capability consent. Real business acceptance
blocked by missing VLab WeCom account configuration. Not deployed to production.

## September 6 integration result

- User reports browser works after returning home; no further browser changes.
- Reviewed feature merged into dedicated `codex/wecom91-integration` worktree.
- Acquired integration lease as this task owner; official installer accepted the
  exact candidate hash below with `--accept-capabilities`. Manifest scope was
  checked identical to installed vlab.1. Installer exited 0; main config unchanged.
- Restarted only integration VLab: PID 1587731, NRestarts 0, Gateway ready.
- Native `tools.invoke` no longer returns runtime-not-initialized. It now reports
  default WeCom account missing botId / secret. Current main and Worker config
  lack `channels.wecom`; the pre-install backup lacks it too. This installation
  did not remove it. Eleven scoped current/baseline/backup config files checked
  had no WeCom account. Existing WeCom session history is not live channel setup.
- No production credentials copied into VLab, no business API success claimed,
  no production deployment. Need VLab-specific WeCom authorization/configuration
  before native + Worker real tool acceptance and conditional production release.
- Initial immediate post-restart probe hit ECONNREFUSED during startup; subsequent
  probe reached ready Gateway successfully. This was not a restart loop.

The original attempted-install notes below are historical, not current status.

- Source fix: `346916e`, on `codex/browser-codex-session-routing`.
- Private instance: `astra`, owner `01a06fbe-7654-7331-8d6e-73a8cd2dcd7e`;
  private test copy `runtime/wecom-context-346916e`. Instance remains stopped.
- VLab native `tools.invoke` reproduced the exact runtime-not-initialized error
  in the existing WeCom session before changes.
- All business commands use one CLI wrapper. Its old global runtime config
  lookup is replaced with the native 9.1 tool-context getter/snapshot, captured
  once per invocation for consistent bot and binary resolution. Model arguments
  cannot select configuration or account. Missing multi-account identity still
  fails closed. No Worker-specific field whitelist was added.
- Real copied plugin hermetic tests passed: old failure reproduced, trusted
  context used, missing config denied, multiple-account identity required,
  caller-supplied account/config ignored, patch idempotent. No network or CLI
  subprocess was executed by these tests; they are not business API acceptance.

## Artifact and attempted integration install

Version `2026.8.17-vlab.2`, SHA-256:
`2ac843d6455c34f30c33c0cf7bd75a5d16fb23e3b170dd134af3e60e5e0875a7`.

Under the VLab generation
`/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902`,
backup directory is `backups/wecom-native-config-346916e`. It contains original
main/Worker configuration, original plugin archive, candidate archive, hashes,
and private installer logs. No credentials are included in this repository.

Installer used the official 9.1 `plugins install --force` command. Initial
attempts encountered root-owned npm cache and npm 10 optional-peer graph
`edgesOut` errors. Isolated npm caches were used; runtime dependencies were
pinned to already installed versions and build-only devDependencies omitted
from the release artifact. The host supplies OpenClaw 9.1; no second core was
installed. Setting legacy-peer env alone was ineffective because native install
overrides it; do not count that as the solution.

Final installer attempt reached capability consent and stopped without accepting
it. Candidate and installed manifest are byte-identical: `channels=[wecom]`,
`contracts.tools=[wecom-cli]`, `skills=[./skills]`; no new hooks, MCP servers,
CLI backends, or dangerous config flags. User confirmation is pending for this
native consent checkpoint. Current installed version remains `2026.8.17-vlab.1`.
Main/Worker configurations compare unchanged to backups. No Gateway restart.
VLab service remained active, PID 1584267, NRestarts 0. Integration lease released.

Next: obtain confirmation, acquire integration lease again, verify idle state,
install the exact candidate with explicit capability acceptance, restart only
VLab, then test actual native and Worker business tool paths. Do not promote
until this works, and do not call help-only commands business API acceptance.

Production V was only inspected and remained unchanged. Tailscale login restored
both hosts. Desktop tool still reports Mac locked, so real user-Chrome screenshot
acceptance remains separately blocked; no lock-screen bypass was attempted.
