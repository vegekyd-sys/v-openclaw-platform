# VLab Sandbox Broker v0.2.0

This candidate turns the VLab OpenShell connection into a complete, invisible project-execution layer for ordinary V users.

## User path

1. A colleague describes a development task in normal language.
2. The `project-sandbox` Skill keeps read-only/native V work in Gateway, routes code/build/test work to the Broker, and stops production/external/destructive work for approval.
3. The Broker accepts an owner, Agent Session, idempotency key, source-only project path, argv command, resource limit, timeout, network profile, and declared artifacts.
4. One queued job receives one disposable OpenShell Sandbox on the nonproduction Tencent host.
5. The Broker streams a filtered snapshot, executes with CPU/memory/Landlock/network controls, stores a bounded artifact bundle, deletes the Sandbox, and exposes status to the original Agent.

The colleague never needs an SSH account, cloud console, server name, or OpenShell command.

## Safety boundary

- Default capacity on the 4 vCPU / 8 GB host is one active Sandbox, 1 vCPU / 2 GiB per job.
- Default network is deny-all. `packages` is a separate fixed registry policy. Arbitrary egress is not exposed.
- Source snapshots exclude V credentials, `.env*`, OpenClaw state, Sessions, Memory stores, browser profiles, dependency folders, caches, keys, and local databases.
- Project paths must resolve below configured VLab project roots. Artifact paths are relative and bounded.
- Completion does not imply merge, push, deploy, publication, payment, or production writes.
- State and audit metadata contain owner/session/job/lifecycle data, not source code or credentials.
- Idempotency prevents a repeated Feishu delivery from opening duplicate work. Daemon restart requeues an interrupted isolated job after deleting its old Sandbox.
- Cancel, failure, timeout, and success all converge on Sandbox deletion. `prune` removes orphaned managed Sandboxes.

## Operator commands

```bash
/srv/vlab/bin/sandboxctl health
/srv/vlab/bin/sandboxctl route request.json
/srv/vlab/bin/sandboxctl submit job.json
/srv/vlab/bin/sandboxctl status <job-id>
/srv/vlab/bin/sandboxctl wait <job-id>
/srv/vlab/bin/sandboxctl cancel <job-id>
/srv/vlab/bin/sandboxctl prune
```

This is a VLab sidecar and Skill, not an OpenClaw core patch. OpenClaw upgrades remain independent.
