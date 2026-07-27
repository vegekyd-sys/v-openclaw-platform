# vLab architecture

## Host choice

The initial vLab instance is colocated with V from Versa because the host has
substantially more free disk and lower business activity than the Mirror
V/Meorient host. Colocation is a first-stage compromise; process and filesystem
isolation protect the existing Gateway.

## Isolation boundary

```text
V from Versa Gateway                 vLab Gateway
--------------------                 ------------
root user                            vlab user
/root/.openclaw                      /srv/vlab/state
/root/.../workspace                  /srv/vlab/workspace
OpenClaw 2026.6.6                    OpenClaw 2026.7.1
0.0.0.0:22793                        127.0.0.1:23793
production channels                 no inbound channels
live sessions/memory                 point-in-time seed
```

vLab is protected by systemd filesystem controls. It can write only within its
own root and temporary directories. The production Gateway is never stopped
or restarted during vLab bootstrap.

## State policy

The bootstrap copies:

- agent auth/model metadata and session files;
- the built-in memory index as a seed;
- identity, memory Markdown, skills, and scripts from the workspace;
- plugin code required to load the copied profile.

It deliberately excludes:

- channel configuration and channel-specific environment variables;
- cron/tasks/flows;
- production browser profiles;
- media, generated outputs, large Git checkouts, and caches;
- the 16 GB `v-sync-hub` checkout.

Absolute source paths in the copied session index are rewritten to vLab paths.
The source session files are not changed.

## Release model

OpenClaw releases live under `/opt/vlab/releases/<version>`. The service points
to `/opt/vlab/current`, allowing a later release script to switch versions
without editing persistent state. Production promotion will use the same
immutable-release pattern after vLab acceptance is stable.

