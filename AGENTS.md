# Repository rules

- This repository contains versioned OpenClaw platform and release assets only.
- Never add secrets, `.env` files, credentials, session transcripts, memory
  databases, browser profiles, generated media, or server snapshots.
- Develop changes on a dedicated branch and worktree.
- First read `lab/AGENT-QUICKSTART.md` for the copyable task workflow.
- For VLab work, follow `lab/README.md`: one lightweight source worktree per task,
  complete development and pre-merge tests there, then report the branch, exact
  commit and results to Tianyi. Only Tianyi decides whether to merge into `dev`.
- Never merge a task into dev without Tianyi's explicit authorization for that
  change. Passing tests, a repair request, an integration lease or another task
  approval does not grant merge authorization. After approval, execute the
  authorized integration and shared validation.
- Use `/Users/tianyicai/vlab-dev/lab/vlab.mjs` for worktree, integration and release
  operations. Do not copy live state/runtime into task worktrees or hot-patch live
  runtime outside this workflow. Explicit integration lease is required for
  shared tests, staging, deployment and rollback; never steal another owner lease.
- Preserve existing settings and conversations through the shared Gateway.
  Never point independent Gateway processes at the same writable state directory.
- Validate changes in vLab before proposing production promotion.
- Keep vLab and production state paths, ports, workspaces, and channel
  credentials completely separate.
- A green service status is insufficient acceptance. Verify Gateway RPC,
  model/tool execution, memory behavior, and a visible reply when a test channel
  is intentionally added later.
