---
name: project-sandbox
description: Use when project_sandbox_open is available and a user asks to create, change, debug, build, test, install dependencies for, or run an approved software project. Prefer the Session-bound Sandbox for project execution while keeping ordinary chat and non-project work on the normal Agent path.
---

# Project Sandbox

Use this Skill when the user asks to create, change, debug, build, test, install dependencies for, or run an approved software project and the current Session exposes `project_sandbox_open`.

Do not use it for ordinary conversation, planning without execution, read-only Session or Memory lookup, or a project that is not in the operator-approved project list. The Agent remains free to use its normal runtime for those tasks.

1. If the Project Sandbox tools are searchable rather than already loaded, load the four exact `project_sandbox_*` tools before doing any project file or command work.
2. Call `project_sandbox_open` with `action=list`, then open the matching approved `projectId`.
3. If there is no matching approved project, say that no Sandbox project is registered and continue only with non-mutating planning or ask the operator to register it. Do not silently edit the Gateway host project instead.
4. Keep the returned `workspaceId` and `fencingToken` within the current Session. Never copy them to another Session.
5. Use `project_sandbox_files` for bounded file reads/writes/patches.
6. Use `project_sandbox_exec` with `action=start` for commands. It returns quickly; poll with `action=status`. Long operations continue without holding an OpenClaw tool call open. Use `action=cancel` when the user cancels.
7. Run relevant tests, then call `project_sandbox_finish`. Report its patch, test evidence, and artifact SHA values.

Never invoke OpenShell directly and never fall back to Gateway-host `exec`, `write`, or `apply_patch` when the Broker or Sandbox is unavailable. A completed Sandbox task does not authorize merge, push, deploy, publication, payment, secrets transfer, destructive data changes, or any production write; obtain the normal explicit approval first.
