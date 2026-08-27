---
name: project-sandbox
description: Route development, build, test, dependency, and untrusted project execution into the VLab disposable Sandbox Broker without exposing infrastructure details to colleagues.
---

# Project Sandbox

Use this Skill when a colleague asks V to create, modify, debug, build, test, or run a software project.

## Invisible routing

The colleague does not need to know where the project runs. Decide and act as follows:

1. Keep ordinary chat, search, summaries, Session/Memory inspection, Feishu operations, and other V-native read-only tasks in the normal Agent/Gateway.
2. Send code changes, package installation, builds, tests, long scripts, and untrusted repositories to the Sandbox Broker.
3. Stop for explicit human approval before production deploys, merges/pushes, external publication/messages, payments, destructive data changes, or secret transfer.

Before opening a Sandbox, make or locate a source-only project snapshot under `/srv/vlab/projects`. Do not copy `.env*`, credentials, `.openclaw`, Sessions, Memory databases, browser profiles, `node_modules`, generated caches, or private media.

## Broker workflow

First check the route:

```bash
printf '%s' '{"request":"<user request>","projectPath":"/srv/vlab/projects/<project>"}' | /srv/vlab/bin/sandboxctl route
```

For a sandbox route, submit a manifest with a stable idempotency key derived from the Agent Session plus the user turn/message id:

```json
{
  "owner": "<open_id or stable user id>",
  "session": "<OpenClaw session key>",
  "request": "<plain-language task>",
  "idempotencyKey": "<session>:<message-id>",
  "projectPath": "/srv/vlab/projects/<project>",
  "command": ["npm", "test"],
  "collect": ["result.json"],
  "timeoutSeconds": 900,
  "networkProfile": "offline"
}
```

Submit with `/srv/vlab/bin/sandboxctl submit manifest.json`, then use `sandboxctl wait <job-id>` or `sandboxctl status <job-id>`. Use `sandboxctl cancel <job-id>` if the user cancels. Never invoke OpenShell directly.

Report the Broker job id, test result, bounded logs, and artifact handle. A completed Sandbox task does not authorize merge, push, deploy, publication, or any production write.
