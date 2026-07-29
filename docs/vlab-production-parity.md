# VLab production parity

`config/vlab-production-parity-v1.json` is the executable contract between
VLab acceptance and private-V promotion. It separates three things:

1. Runtime semantics that must match: OpenClaw and Node versions, concurrency,
   Session visibility, Makaron workspace layout, Workshop trust, Worker pool
   configuration, service restart behavior, and the exact Worker release.
2. Mapped paths that must have the same role but cannot have the same absolute
   production path.
3. Intentional isolation or capacity differences that must remain visible in
   every report.

## Apply and verify

`scripts/deploy-agent-worker-experiment.sh` now performs this order:

1. apply the versioned VLab parity profile;
2. activate the exact Git Worker artifact;
3. run `tests/vlab-production-parity.sh`.

The deployment stops immediately when the gate fails. A parity apply stores its
previous config, Worker overlay, systemd unit, and Node symlink under
`/srv/vlab/backups/production-parity-v1/<timestamp>/`.

## Roll back

Run `/tmp/rollback-vlab-production-parity.sh` on VLab. It restores the paths
recorded by the active parity manifest and restarts only the VLab Gateway.

The seeded Makaron workspace is additive and remains as a sandbox fixture after
rollback. No production credential, Session, Memory, browser profile, or cron
state is copied by this mechanism.

The Makaron image adapter uses VLab's own Makaron auth and CLI installation.
The parity gate checks that the plugin contract is loaded; a real image smoke
is still required when a candidate changes image-provider behavior.

## Promotion rule

VLab acceptance is valid for production only when:

- the parity gate is green;
- the 6-Session and Workshop regressions are green;
- the accepted Worker artifact is the same immutable Git artifact that will be
  promoted;
- all remaining differences appear in `intentionalDifferences`.

If production changes any material field, update the profile first and repeat
VLab acceptance. Do not discover the difference during production cutover.

The 6-Session soak reports Event Loop at two levels. Zero degraded samples is
the optimization target. The hard stress gate allows at most a 20% transient
degraded-sample ratio and a 2000 ms worst sampled p99, but still requires every
turn to finish, no pending work, final Event Loop recovery, and no Gateway
restart. This distinction keeps a brief recovered spike visible without
misreporting a completed run as a crash or silent failure.
