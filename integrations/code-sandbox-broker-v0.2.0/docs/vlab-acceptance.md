# VLab acceptance — Sandbox Broker v0.2.0

Date: 2026-08-28 (Asia/Shanghai)

Boundary: all execution was on VLab plus the nonproduction Tencent `V from Versa` host. Production V was read-only and supplied a Git-tracked source archive only. Production Gateway, Sessions, Memory, configuration, and services were not modified or restarted.

## End-to-end result

- A new VLab Agent Session received a normal-language request naming a project, not a server.
- The Agent discovered `project-sandbox`, classified the task as development work, found the source-only project under the approved VLab root, and used `/srv/vlab/bin/sandboxctl` rather than executing the test suite on the Gateway host.
- Broker job `vjob-20260827163029-0b59c0df` created OpenShell Sandbox `vsb-530d6d2613c2` with 1 CPU, 2 GiB RAM, and offline networking.
- The real `v-core` native-subagent test suite passed 4/4. Broker command time was 1.189 seconds and total Sandbox time was 3.008 seconds.
- The declared `test-results.tap` artifact returned as a 620-byte tarball with SHA-256 `249b7670914d5082e8e1bb2de5f4a2107d6bb2727d71c98d7b950bd55708bf0d`.
- The Agent returned the test conclusion, Job ID, resource boundary, timing, and artifact handle to its parent Session.
- The managed Sandbox list was empty after completion.

## Lifecycle and security matrix

| Case | Result |
| --- | --- |
| Static syntax and unit tests | PASS — 9/9 |
| Natural-language route | PASS — project/test to Sandbox; Session/read-only to Gateway; production deploy to approval |
| Real V source-only project | PASS — Git-tracked archive, no runtime state or credentials |
| Output and artifact collection | PASS — bounded logs plus declared tar artifact and SHA-256 |
| Duplicate Feishu/user delivery | PASS — same idempotency key returned the original completed Job |
| Capacity queue | PASS — one active long Job and one queued Job; both completed in order |
| CPU/memory enforcement | PASS — Docker reported `NanoCpus=1000000000`, `Memory=2147483648` |
| Offline policy | PASS — unlisted internet endpoint denied |
| Package policy | PASS — npm registry 200 while unlisted endpoint remained denied |
| Timeout | PASS — 10-second guard returned exit 124, then deleted Sandbox |
| Cancellation | PASS — terminal state remained `cancelled`; no active Sandbox |
| Broker restart recovery | PASS — old Sandbox deleted, Job retried as attempt 2, then completed |
| Orphan prune | PASS — no managed leftovers |
| VLab isolation | PASS — OpenClaw Gateway and tunnel remained active with `NRestarts=0` |

## Capacity decision

The selected host has 4 vCPU, 8 GB RAM, and roughly 28 GB free after the base image pull. The accepted initial limit is therefore one active Sandbox at 1 CPU / 2 GiB and a Broker queue behind it. Raising concurrency requires a separate two-Sandbox soak plus disk and host-service headroom review.

## Upgrade and rollback shape

This release is a VLab sidecar service plus a workspace Skill. It does not patch OpenClaw bundles or alter the Gateway Session/Memory model. `scripts/install-vlab.sh` creates an exact backup and prints the one-command rollback path. Rollback removes/restores the Broker service, policies, CLI link, and Skill while preserving audit/job/artifact state for diagnosis.
