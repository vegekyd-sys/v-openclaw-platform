---
name: project-sandbox
description: Route software project changes, builds, tests, package installs, and long-running development commands into the Session-bound Project Sandbox.
---

# Project Sandbox

Use this Skill when the user asks to create, change, debug, build, test, or run a software project.

1. Call `project_sandbox_open` with `action=list`, then open the matching approved `projectId`.
2. Keep the returned `workspaceId` and `fencingToken` within the current Session. Never copy them to another Session.
3. Use `project_sandbox_files` for bounded file reads/writes/patches.
4. Use `project_sandbox_exec` with `action=start` for commands. It returns quickly; poll with `action=status`. Long operations continue without holding an OpenClaw tool call open. Use `action=cancel` when the user cancels.
5. Run relevant tests, then call `project_sandbox_finish`. Report its patch, test evidence, and artifact SHA values.

Never invoke OpenShell directly and never fall back to Gateway-host `exec`, `write`, or `apply_patch` when the Broker or Sandbox is unavailable. A completed Sandbox task does not authorize merge, push, deploy, publication, payment, secrets transfer, destructive data changes, or any production write; obtain the normal explicit approval first.
