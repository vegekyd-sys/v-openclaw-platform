# V OpenClaw Platform

Private release and sandbox infrastructure for V.

## V-Platform installation-package initiative (2026-09-06)

The versioned [V-Platform controller](platform/README.md) now owns the component,
adaptation and acceptance inventory. Run `npm test` for the unified offline
regressions and `npm run check` for catalog drift detection. The 9.1 distribution
is still being assembled: `npm run release:check` deliberately blocks release
until immutable artifacts, clean installation, state-safe rollback and fresh
end-to-end evidence have been implemented and verified. It does not upgrade V.

## Current operation (2026-09-05)

Production runs OpenClaw 2026.9.1. See the
[four-track release report](docs/v91-integration-20260905.md) for Astra,
authenticated public Control UI, Browser compatibility, acceptance, and rollback.
New experiments must use [one worktree plus one owned Lab instance](lab/README.md).
The bootstrap below is historical 7.1 infrastructure documentation, not the
current production runtime or a command to rerun against an existing instance.

## Environments

| Environment | Purpose | Mutable state | Inbound channels |
| --- | --- | --- | --- |
| `vlab` | Large OpenClaw experiments and upgrade validation | Isolated under `/srv/vlab` | Disabled by default |
| `production` | Private V | Production-owned | Existing production channels |

The first vLab host is the existing **V from Versa** machine. Its current
Gateway remains untouched. vLab runs as a second instance with:

- a dedicated `vlab` system user;
- OpenClaw `2026.7.1`;
- `OPENCLAW_STATE_DIR=/srv/vlab/state`;
- `OPENCLAW_CONFIG_PATH=/srv/vlab/state/openclaw.json`;
- workspace `/srv/vlab/workspace`;
- loopback-only Gateway port `23793`;
- no Feishu, Slack, Telegram, WeCom, DingTalk, or QQ inbound channels;
- a point-in-time copy of selected V from Versa sessions and memory.

## Safety contract

1. Never share a writable state directory, session store, memory SQLite index,
   workspace, browser profile, or port with another Gateway.
2. Never commit credentials, session transcripts, memory databases, or
   production state.
3. vLab starts without inbound channels and is reached through an SSH tunnel.
4. Production only receives a tested commit/release; it is never the first
   execution environment.

## Bootstrap

The host bootstrap is tracked in [`scripts/bootstrap-vlab.sh`](scripts/bootstrap-vlab.sh).
It is intentionally idempotent: the initial source snapshot is only created
when `/srv/vlab/state/.seeded-from-v-from-versa` is absent.

## Connect

```bash
ssh -N -L 23793:127.0.0.1:23793 root@<v-from-versa-host>
```

Gateway authentication remains enabled; the token is stored only on the host.

## Release protocol

The shared V/Codex experiment, acceptance, production-promotion, and rollback
contract is documented in
[`docs/v-release-protocol.md`](docs/v-release-protocol.md).
Each candidate is evaluated with
[`docs/vlab-acceptance-checklist.md`](docs/vlab-acceptance-checklist.md).
