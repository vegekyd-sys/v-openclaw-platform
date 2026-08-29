# VLab acceptance — Project Sandbox Plugin v0.3.0

Production V is out of scope. All mutations and real execution must stay on isolated VLab plus its nonproduction OpenShell host.

## Static and local gates

- [x] One standard Plugin declares exactly four `project_sandbox_*` tools.
- [x] Tool factory is runtime-neutral and uses trusted OpenClaw context identity.
- [x] Model schemas cannot supply owner, Session, or host project paths.
- [x] Broker failure returns an error and has no local execution fallback.
- [x] Concurrent idempotency, fencing, serialization, capacity, TTL, cancellation, restart recovery, output bounds, and durable runner tests pass.
- [ ] OpenClaw plugin manifest/install/inspect validation passes on VLab 2026.7.1.
- [ ] Dedicated Agents prove exact model-scoped `openclaw` and `codex` runtime selection; no ignored whole-Agent runtime key is used.

## Real VLab matrix

Use one source-only fixture and the exact same task for both acceptance Agents:

1. open the approved project;
2. read one file;
3. make the same deterministic edit;
4. start a 3–5 minute command and poll it without keeping one tool RPC open;
5. run tests;
6. finish and return the Git patch plus artifact hashes;
7. apply the patch to a clean fixture and rerun tests.

| Gate | Default Runtime | Codex Runtime |
| --- | --- | --- |
| Same four Plugin tools visible | PENDING | PENDING |
| No native host exec/fs tools | PENDING | PENDING |
| Session-bound Workspace and fencing | PENDING | PENDING |
| 3–5 minute durable operation | PENDING | PENDING |
| Cancel an active operation | PENDING | PENDING |
| Broker restart then status recovery | PENDING | PENDING |
| Patch applies and tests pass | PENDING | PENDING |
| Sandbox deleted after finish | PENDING | PENDING |
| Gateway Session/Memory unchanged | PENDING | PENDING |

## Negative gates

- [ ] A second Session cannot status/read/exec/finish the first Session's Workspace, even with its Workspace ID.
- [ ] A stale fencing token is rejected.
- [ ] `../`, absolute paths, symlinks outside the snapshot, shells, and host-control commands are rejected.
- [ ] Offline policy denies unlisted egress; package policy allows only configured registries.
- [ ] With the Broker stopped, both Runtime Agents fail explicitly and a Gateway sentinel, approved project source, and Git status remain unchanged.
- [ ] Default and Codex logs show no host `exec`, `write`, `edit`, or `apply_patch` fallback.
- [ ] A one-shot legacy Job and a persistent Workspace cannot prune each other's Sandbox.

## Operational gates

- [ ] Main and Worker overlay configs both enable the same Plugin ID and project registry.
- [ ] Broker, Gateway, Worker pool, Feishu, and OpenShell tunnel are healthy after restart.
- [ ] Broker and Gateway `NRestarts` do not loop.
- [ ] No orphan managed Sandbox remains.
- [ ] Exact backup directory and one-command rollback are recorded.
- [ ] Rollback restores v0.2 Broker/config and removes v0.3 Plugin without touching Session, Memory, audit state, or artifacts.
