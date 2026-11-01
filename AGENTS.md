# Repository rules

- This repository contains versioned OpenClaw platform and release assets only.
- Never add secrets, `.env` files, credentials, session transcripts, memory
  databases, browser profiles, generated media, or server snapshots.
- Develop changes on a dedicated branch and worktree.
- First read `lab/AGENT-QUICKSTART.md` for the copyable task workflow.
- Night Shift (夜班) code lives in `vegekyd-sys/v-nightshift` since 2026-10-02. Change
  and ship it by that repository's `docs/change-flow.md`, not from here.
- For VLab work, follow `lab/README.md`: one lightweight source worktree per task,
  complete development and pre-merge tests there, then report the branch, exact
  commit and results to Tianyi. Only Tianyi decides whether to merge into `dev`.
- Never merge a task into dev without Tianyi's explicit authorization for that
  change. Passing tests, a repair request, an integration lease or another task
  approval does not grant merge authorization. After approval, execute the
  authorized integration and shared validation.
- Use `/Users/tianyicai/vlab-dev/lab/vlab.mjs` for worktree, integration and release
  operations. Use `candidate` for pre-merge tests against cached runtime code and selected
  VLab data snapshots in disposable server directories. Candidate execution has
  host networking and no runner-imposed capability, resource, concurrency or
  duration limits; the agent chooses the command, environment and test scope. No merge or
  integration lease is required for candidate tests. Do not copy online state
  into Git or write shared runtime. A lease is required only for shared Gateway
  tests, staging, deployment and rollback; never steal another owner lease.
- Shared VLab is either byte-identical to production V, or V plus the one
  release on its way to production (`docs/vlab-v-sync-flow.md`). A test that
  needs the long-running shared Gateway may occupy that single slot, but it
  must end in promotion to V followed by `vlab.mjs align`, or in
  `vlab.mjs rollback`; the server refuses to stage anything else until then.
- Ship to V with `scripts/promote-to-v.mjs`, never by editing files on the host.
  If V is changed on the host anyway (an emergency hotfix, or V's own agent),
  the same day either put it back or keep it: capture V into git by PR, update
  the drift sentinel, and run `scripts/sync-vlab-from-v.mjs` so VLab matches V
  (`docs/vlab-v-sync-flow.md` section 4.5). `scripts/vlab-v-parity.mjs` must
  end at ALIGNED either way.
- Use shared VLab as the final Dev integration gate, not the default test runner.
  Preserve existing settings and conversations; use private writable snapshots
  for candidate tests and shared RPC for read-only history.
  Never point independent Gateway processes at the same writable state directory.
- A change to OpenClaw core or an official plugin's dist ships with its source
  commit on `vegekyd-sys/openclaw-versa` branch `versa/main` (with a test), and
  the capture PR maps the new bytes in `release/source-map.json` to it
  (`versa:<sha>`, `upstream:<sha>` for a cherry-picked upstream fix, or
  `platform:<path>` for third-party plugin patches). An emergency hotfix may land
  dist-first; its source follows within 24 hours. CI runs
  `scripts/check-source-map.mjs`; see `docs/upgrade-lts/patch-catch-up-plan.md`.
- Validate changes in vLab before proposing production promotion.
- Keep vLab and production state paths, ports, workspaces, and channel
  credentials completely separate.
- A green service status is insufficient acceptance. Verify Gateway RPC,
  model/tool execution, memory behavior, and a visible reply when a test channel
  is intentionally added later.
