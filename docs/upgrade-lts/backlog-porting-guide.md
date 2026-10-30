# Backlog porting guide (2026-10-30)

Shared instructions for the sessions translating `docs/upgrade-lts/backlog-split.md` into fork source commits. `<GROUP>` is a group name from that file.

## Background
Production "V" runs OpenClaw 2026.9.1 with many hand-edited dist patches. Platform repo (read-only for you): `/Users/tianyicai/v-openclaw-platform/.claude/worktrees/openclaw-lightweight-upgrade-9bc2fe` (call it PLAT). V's bytes per release are captured in `PLAT/release/captured/<release>/dist` (+ `manifest.json`). We are translating every patch into source commits on the fork `vegekyd-sys/openclaw-versa` (local clone `~/openclaw-versa`, remote name `versa`), each with a unit test, so the patch stack can later be rebased onto newer OpenClaw. A fork source build of 9.1 is byte-identical to npm 9.1. The first 5 releases are done on fork branch `versa/port-backlog-20261029` (tip `7282274202a`). The rest is split by file ownership in `PLAT/docs/upgrade-lts/backlog-split.md`; you own ONE group (below). Two sessions work in parallel, each on its own queue of groups; the coordinator session merges your branch and updates `release/source-map.json` / progress docs — do NOT edit those.

Scope: wave 1 only = releases before 2026-10-27. Skip `unified-session-20261027`, `release-batch-20261027`, `release-batch-20261028`. Files whose first change is `v2026.9.1-db91.6` (or `feishu-model-20260924`, `gpt6-20260925`, `media-relay-20260925`) were already translated by M1 up to 9/24-9/25 — translate only the later releases listed for them. If unsure what M1 covered, check `~/openclaw-versa` `versa/main` log and `versa/PATCHES.md`.

## Keep the Mac usable (hard rules)
A first attempt ran six agents at once (six installs, full-speed vitest, typecheck and builds) and pushed the Mac to load 66. Now:
- One group at a time, serially. No subagents, no parallel tool runs of tests/builds.
- Reuse the existing worktree `~/openclaw-versa-wt/bl-<GROUP>` (memory group: `~/openclaw-versa-wt/backlog`, branch `versa/port-memory-20261029`). They already have `node_modules`. Never run `pnpm install` unless the worktree has none; never create new fork worktrees.
- Every heavy command runs throttled: prefix `nice -n 15` and set `OPENCLAW_VITEST_MAX_WORKERS=2`. Only run the test files you touched.
- Typecheck (`tsgo`) and build: once per group at the end, never per commit, and only while holding the shared lock so the two sessions never do it at the same time:
  `until mkdir ~/openclaw-versa-wt/.heavy.lock 2>/dev/null; do sleep 30; done; <command>; rmdir ~/openclaw-versa-wt/.heavy.lock` (always release it, also on failure). Run long commands in the background and wait for the notification instead of polling.
- The other session's groups and worktrees are off limits.

## Setup
- Environment: `. ~/v-upgrade-private/20261014-gate103/env.sh` (Node 24.17 + pnpm 12.1).
- Previous attempt left partial work in each `bl-<GROUP>` worktree: local commits on `versa/port-<GROUP>-20261029` and uncommitted edits. Review them first (`git log versa/port-backlog-20261029..HEAD`, `git diff`); keep what is correct and tested, finish or discard the rest. Nothing was pushed yet. A note from that attempt said some edits were lost when a scratch dir was wiped — keep your own scratch files under your session's scratchpad, not shared dirs.
- Tests: `OPENCLAW_VITEST_MAX_WORKERS=2 nice -n 15 node scripts/run-vitest.mjs run <files>`.
- Typecheck: `nice -n 15 node_modules/.bin/tsgo -p tsconfig.json --noEmit` (91 pre-existing errors in scripts/ and qa-lab are not yours; compare counts before/after).
- Build (for the byte compare, under the lock): `GIT_COMMIT=ad6fe23aecb9b833d68139b0ddc9f239b894d2f1 OPENCLAW_BUILD_TIMESTAMP=2026-09-03T15:04:19.382Z nice -n 15 pnpm build`. Don't edit files while it runs.

## Per release, in time order
1. What changed: `python3 ~/v-upgrade-private/20261029-repro91/file-history.py PLAT <layer> <dist path>` (`--stat` for line counts). Layer is `core`/`feishu`/`codex`. Stock npm 9.1 dist: `~/v-upgrade-private/m1-dist-diffs/stock/dist`.
2. Intent: PRs in `PLAT/CHANGELOG.md`; readable module sources in `PLAT/lab/release-files/*`; patch scripts `PLAT/lab/patch-*.mjs`; `git -C PLAT log --all --oneline -- <path>` for PR context.
3. Implement in the 9.1 TypeScript source (find the source via unique strings from the dist), add/extend a vitest test.
4. Prove the test fails without the source change (temporary WIP commit or `git stash push -u -m <unique-tag>` then apply/drop by SHA — never bare `git stash`/`pop`; the stash stack is shared).
5. Commit (English) per release; message body explains the behaviour; end with `Release: <full release name>.` then a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
6. Before porting a generic fix, check whether upstream already has it: grep commit messages in `~/openclaw-versa-wt/lts935` (v2026.9.35) for the PR number/subject; if so cherry-pick with `-x` and say so.
7. At the end of the group, build (under the lock) and compare: `node PLAT/scripts/compare-captured-to-build.mjs PLAT/release/captured/<release>/dist <worktree>/dist <dist file>...`. V-added `.mjs` modules land in other chunks in a source build; for those rely on tests + reading the logic, and say so.
8. Push regularly: `git -C ~/openclaw-versa push versa versa/port-<GROUP>-20261029`.

## Rules
- Only merge, never rebase or force-push pushed commits; fix mistakes with follow-up commits.
- Don't merge into `versa/main` or `versa/port-backlog-20261029`. Don't open PRs. Don't touch production V or shared VLab. No secrets in commits.
- Keep source edits minimal and localized to your files' source, to limit conflicts with other groups. If you must change a shared hot file (e.g. something another group obviously owns), keep it small and mention it in the report.
- If a release can't reasonably be expressed in source, or is clearly obsolete, record why instead of forcing it.
- Time-box: aim to finish wave 1 for your group; if very large, push what's done with a clear remaining list.

## Report per group (in Chinese, to the coordinator and Tianyi)
1. Branch + final pushed SHA.
2. Table: release → commit(s) → test (failed before patch? y/n) → byte compare verdict.
3. Per owned dist file: `covered-wave1` (everything except wave-2 releases translated; give the commit that completes it) / `partial` (what's missing) / `wave2-only`.
4. Cross-group source files you touched; blockers; anything unverified.
