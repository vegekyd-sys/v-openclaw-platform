# Repository rules

- This repository contains versioned OpenClaw platform and release assets only.
- Never add secrets, `.env` files, credentials, session transcripts, memory
  databases, browser profiles, generated media, or server snapshots.
- Develop changes on a dedicated branch and worktree.
- For VLab work, follow `lab/README.md`: one task = one worktree + one owned
  runtime instance. Never patch/restart the shared 24993 Gateway for personal
  development. Shared integration changes require an explicit exclusive lease.
- Always name the target instance and record its owner, branch and exact commit.
  Separate Git worktrees do not authorize sharing writable runtime/config/state.
- Validate changes in vLab before proposing production promotion.
- Keep vLab and production state paths, ports, workspaces, and channel
  credentials completely separate.
- A green service status is insufficient acceptance. Verify Gateway RPC,
  model/tool execution, memory behavior, and a visible reply when a test channel
  is intentionally added later.
