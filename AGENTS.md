# Repository rules

- This repository contains versioned OpenClaw platform and release assets only.
- Never add secrets, `.env` files, credentials, session transcripts, memory
  databases, browser profiles, generated media, or server snapshots.
- Develop changes on a dedicated branch and worktree.
- For VLab work, follow `lab/README.md`: one lightweight source worktree per task,
  merge into the canonical `dev`, then deploy/test on the shared Gateway.
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
