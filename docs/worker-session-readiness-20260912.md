# Worker session readiness candidate (2026-09-12)

## Evidence and scope

The deployed v3 candidate removed the original 5.2 second command-module load,
but a fresh VLab C1 still spent 2.840 seconds in the Gateway session-diff
baseline stage and the first real command in a prepared Worker retained a
multi-second workspace-skill preparation gap.

This candidate makes two bounded changes:

1. A new operator session whose workspace has no discoverable Git metadata
   skips the diff-baseline claim. The previous path captured no baseline in
   that case but performed two serialized SQLite writes to persist an
   `unavailable` marker. Git directories, Git worktree files, explicit
   `GIT_DIR`/`GIT_WORK_TREE`, unknown paths, and all existing generation guards
   retain the old path.
2. Worker readiness now populates the existing process-local reusable skill
   snapshot cache with the pinned config, agent, workspace, execution skills
   path, eligibility, and plugin-generation metadata used by the first real
   command. It remains opt-in, bounded, fail-open, and does not open a session
   or invoke an Agent, model, or tool.

## Acceptance boundary

Static and installed-runtime checks must pass before packaging. In shared
VLab, `runtimePrewarm.skillSnapshotPrepared` must be true. After natural
startup settling, a fresh unique-session C1 must remove both the baseline
write and first-command skill scan from the measured critical path without
control-plane errors. Only then proceed to repeated C1/C5/C10/C15 matrices,
same-background minWorkers 1 versus 5 comparison, generation lifecycle,
soak, tool/context/memory, and visible Feishu acceptance. This candidate is
not a production release.
