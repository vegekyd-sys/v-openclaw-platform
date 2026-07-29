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

## Promotion rule

VLab acceptance is valid for production only when:

- the parity gate is green;
- the 6-Session and Workshop regressions are green;
- the accepted Worker artifact is the same immutable Git artifact that will be
  promoted;
- all remaining differences appear in `intentionalDifferences`.

If production changes any material field, update the profile first and repeat
VLab acceptance. Do not discover the difference during production cutover.
