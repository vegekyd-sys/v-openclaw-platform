# OpenClaw Project Sandbox Plugin v0.3.0

One OpenClaw Plugin exposes the same four project-development tools to both the default OpenClaw runtime and `agentRuntime.id="codex"`:

- `project_sandbox_open`
- `project_sandbox_files`
- `project_sandbox_exec`
- `project_sandbox_finish`

Both runtimes call the same local Broker. The Broker owns Session identity, project mapping, capacity, OpenShell lifecycle, durable command state, patches, artifacts, and cleanup. There is no separate Codex Sandbox implementation and no OpenClaw core patch.

The VLab installer adds two dedicated acceptance Agents. Their runtime is set on the exact model entry (whole-Agent runtime keys are intentionally not used), while both receive the same five-tool allowlist: the four Project Sandbox tools plus `message`. This restricted OpenClaw tool policy disables Codex native code mode; the Plugin's trusted pre-tool policy is an additional fail-closed guard against host tools.

## User path

1. A colleague asks V to create, change, test, or run an approved project.
2. The bundled `project-sandbox` Skill chooses the matching operator-configured `projectId`.
3. `project_sandbox_open` creates or resumes one Session-bound persistent Workspace.
4. File work and argv commands run only in its remote OpenShell Sandbox.
5. Long commands return an `operationId` immediately and continue independently. The Agent polls or cancels them later; Broker restarts do not lose their Sandbox-side status.
6. `project_sandbox_finish` returns a reviewable Git patch and artifact SHA values, then deletes the Sandbox.

The colleague never needs an SSH account, cloud console, host path, or OpenShell command.

## Safety boundary

- The model selects only a configured `projectId`; it cannot provide a host path, owner, or Session identity.
- Agent owner and Session come from the trusted OpenClaw tool context. Different colleagues in the same group Session therefore continue one shared project Workspace, while another Session or Agent is rejected. Every later call also requires the Workspace fencing token.
- Default network is deny-all. `packages` is a separate fixed registry policy; arbitrary egress is not exposed.
- Source snapshots exclude credentials, `.env*`, OpenClaw state, Sessions, Memory stores, browser profiles, dependencies, caches, keys, databases, and private media.
- Commands are argv arrays. Host-control commands and shells are blocked by default.
- Broker failure is explicit. The Plugin never invokes local `exec`, `write`, or `apply_patch` as a fallback.
- Production merge, push, deployment, publication, payment, destructive data changes, and secret transfer remain outside this Plugin and require their normal approval.

For a hard no-host-fallback Agent, keep the dedicated five-tool allowlist and `group:runtime`/`group:fs` denies. OpenClaw treats that as a restricted policy and disables the Codex app-server native code surface; it does not require Docker, another OpenShell Workspace, or a second project implementation.

## Lifecycle

The Workspace idle lease defaults to 15 minutes and renews on activity. A running command keeps the Workspace alive. `finish`, cancel, expiry, and failure converge on Sandbox cleanup. Global capacity is shared with the retained v0.2 one-shot Job endpoint during migration.

The durable runner supports commands up to 24 hours without holding an OpenClaw dynamic tool call open. Command status/output live in the Sandbox rather than Gateway Session memory, so status remains queryable after a Broker restart.

## Operator CLI

Legacy one-shot commands remain available during migration:

```bash
/srv/vlab/bin/sandboxctl health
/srv/vlab/bin/sandboxctl submit job.json
/srv/vlab/bin/sandboxctl status <job-id>
```

Persistent Workspace endpoints can be inspected with:

```bash
/srv/vlab/bin/sandboxctl workspaces
/srv/vlab/bin/sandboxctl workspace-open open.json
/srv/vlab/bin/sandboxctl workspace-raw <workspace-id>
/srv/vlab/bin/sandboxctl workspace-status <workspace-id> actor.json
```

Normal Agents use Plugin tools, not this CLI and never OpenShell directly.

## Upgrade shape

This release contains:

- a standard OpenClaw Plugin with a bundled Skill;
- a local Unix-socket Broker sidecar;
- an OpenShell provider and durable in-Sandbox runner;
- VLab install/rollback scripts.

OpenClaw upgrades remain independent. The VLab installer backs up both Gateway and Worker configuration domains, installs one Plugin package, validates both configurations, then restarts only the VLab Broker and Gateway.
