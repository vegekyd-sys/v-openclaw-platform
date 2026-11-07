# Ordinary cron jobs get their owner conversation's tools (claude-cli native tools)

Tianyi, 2026-11-07: the 19:30 X drafts job says Claude Code cannot edit files, but the 21:00
Memory Librarian, also Claude Code, edits files every night. Keep it an ordinary job and make it work.

## What was wrong

Both jobs run on claude-cli. They differ in how they were created:

| | Memory Librarian `914f4254` | X drafts `eb525073` |
|---|---|---|
| created by | operator CLI, no owner | V, from its Feishu group (cron tool) |
| stored tools | `["*"]`, policy `trusted` | 97 OpenClaw names, `toolsAllowIsDefault`, policy `account` |
| 11/06 run | Bash 97, Edit 5, Write 1 | only `mcp__openclaw__*`; prompt itself says "no file tools" |

A job created from a session without naming tools stores a snapshot of the creating turn's
OpenClaw tools. On claude-cli Bash/Read/Write/Edit are Claude's own and never appear in that
snapshot (the MCP bridge excludes `read/write/edit/exec`). At run time any finite list becomes a
CLI cap with `native: []`, so every native tool is denied ("unavailable to this run").

Upstream fixed this in two steps: #137832 (2026-09-04) captured native tools for new jobs only,
then #162432 (2026-10-02) dropped the frozen snapshot as a cap: an automatic snapshot runs as `*`,
"like a job an operator creates without --tools", with the owner's scheduled policy still applied.

## Change (`cron-default-snapshot-runs-as-owner-v1`, 2 V files)

Backport of the run-time half of #162432:

- `isolated-agent-BxeXdw5A.js`: `resolveCronRunToolsAllow(job)` returns `["*"]` for an agent-turn
  job whose list is an automatic snapshot (`toolsAllowIsDefault`) with a valid scheduled owner
  policy, no condition trigger and no Codex app authority; otherwise the stored list. Run
  preparation and the command-prompt preflight use it. On claude-cli `*` means no CLI tool cap, so
  native tools behave exactly as in a chat turn in the owner conversation (exec defaults and
  before-tool-call hooks still apply).
- `scheduled-tool-policy-WcH3cpLk.js`: `restoreCronPinnedExecGrant` leaves a `*` list as is
  (a wildcard already grants exec; the creator's exec pin still travels with the run).

Explicit lists, script payloads and condition triggers keep their stored list. Nothing stored
changes: the X job runs with its owner's tools from its next run. #137832 (native capture) is not
ported: with this rule it is unnecessary for agent turns, and it adds a "no MCP tool call before the
native init event" gate to every /vcc turn.

Source: openclaw-versa `versa/port-cron-native-creator-20261107` (`595ee2bf4aa`, on
`versa/port-vcc-steer-20261106`). Build: `node lab/build-cron-default-owner-tools.mjs --base <dir
with V's bytes>`; plan `lab/cron-default-owner-tools.plan.json`. Needs a Gateway restart.

Scope note (the upstream trade-off): such a job no longer narrows to the creating turn's per-sender
tool policy; owner-session group policy and the scheduled account policy still apply. Only owners can
create automations from chat.

## Tests

- `lab/cron-default-owner-tools.test.mjs` (7): plan vs V bytes, marker/parse/idempotence, the rule
  against stubs (snapshot -> `*`; explicit, owner mismatch, no policy, trigger, Codex authority,
  recovery, script keep their list), both call sites, the exec pin with `*`.
- versa: `src/cron/isolated-agent/run.tools-allow.test.ts` 24/24 (4 new; the main one fails without
  the change), full `vitest.cron.config.ts` 2892/2892 (one test updated: it asserted the old cap on
  a self-edited automatic snapshot, as upstream updated it), `tsgo` core unchanged (1 pre-existing
  error in `native-hook-relay-client-store.ts`).
- VLab candidate (`lab/candidate/cron-default-owner-tools/`): a private Gateway with a fake Claude
  Code (`fake-claude.mjs`, separate install at `/opt/vlab-fake-claude-cron`) that asks for Bash
  permission (`can_use_tool`) the way Claude Code does. The job is created with `cron.add` and then
  given eb525073's shape (automatic snapshot, owner, account policy) in the candidate's private state;
  `cron.run` drives the real run path.

| | baseline (V today) | fixed |
|---|---|---|
| stored job | snapshot of 4 OpenClaw tools, `toolsAllowIsDefault`, account policy | same (nothing rewritten) |
| claude-cli launch | `--tools ""`, `--allowedTools` = the 4 MCP tools | no `--tools`, `--allowedTools mcp__openclaw__*` |
| native Bash permission | deny: "OpenClaw denied native tool Bash: it is unavailable to this run." | allow |
| proof file | absent | written |

Receipts: fixed `candidate-45c99b20-b245-42af-bc77-e40d72388f44` (PASS), baseline
`candidate-db19205a-3d34-4275-b208-b433a6f0c540`. The fake was removed from VLab afterwards.

Seen in both arms, unrelated to this change: after the run, deleting the isolated cron run session
logs `sessions.delete ... UNAVAILABLE ... could not safely stop before deletion`.

## Not covered

- Real Claude Code on V: after go-live, the 19:30 run should edit the project page itself; the
  prompt's step 5 ("no file tools, list 待记") can then be removed by V in the group.
- Jobs created with an explicit tool list keep it (by design); re-save without a list to widen.
