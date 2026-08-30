# VCodex Streaming VLab v0.1.0

This is the fourth isolated VLab experiment. It must not share writable state,
sessions, Memory databases, workspaces, Codex homes, ports, or service lifecycle
with VBrowser, Sandbox, DeepHarness, the main VLab Gateway, or production V.

## Isolation contract

- Git worktree: `vcodex-streaming-v0.1.0`
- Linux user: `vlab-vcodex`
- Root: `/srv/vlab-vcodex-streaming`
- Gateway: `127.0.0.1:24993`
- Local-only Feishu webhook: `127.0.0.1:24994`
- State: `/srv/vlab-vcodex-streaming/state`
- Workspace: `/srv/vlab-vcodex-streaming/workspace`
- Codex home: `/srv/vlab-vcodex-streaming/codex-home`
- Service: `openclaw-vlab-vcodex-streaming.service`

The Feishu channel uses a loopback-only signed webhook for acceptance injection.
It never starts a second WebSocket with the main VLab app. The app credential is
used only for outbound test delivery into the dedicated VLab DM.

Synthetic ingress must use the real test user's Open ID. A fake sender causes a
direct-message reply to route to a nonexistent user even when `chat_id` is real.
The event's message ID may remain synthetic because typing indicators are off
and the acceptance reply is sent to the direct chat rather than as a thread
reply.

Official plugins are loaded from this experiment's managed plugin registry.
Do not add their npm directories to `plugins.load.paths`: OpenClaw treats those
explicit paths as external code, while Codex requires the trusted managed-plugin
state-store capability.

Only the two auth-profile tables from the VLab Codex test identity may be copied
into the experiment's new agent database. Sessions, transcripts, Memory data,
media, and the main VLab configuration must not be copied.

## A/B hypothesis

`renderMode=auto` is the control. It can wait for the first authoritative partial
before creating a card, so Codex tool work may appear silent.

`renderMode=card` plus the official top-level
`messages.visibleReplies=automatic` override is the candidate. Codex otherwise
defaults source-chat delivery to `message_tool`, which bypasses the final-answer
partial path and produces one static message at the end. The override returns
the final answer to OpenClaw's automatic reply projection. The official Feishu
dispatcher can then create a card at dispatch start, show tool/compaction
progress, consume Codex final-answer partials, and close the card on terminal
completion. Group chat uses the same override so direct and group behavior do
not silently diverge.

This does not claim that Codex commentary is streamed. In OpenClaw 2026.7.1,
commentary and unphased assistant snapshots are not projected into Feishu body
partials. That is an upstream adapter boundary and is reported separately.

## Feishu update coalescing

OpenClaw and `@openclaw/feishu` 2026.7.1 queue every final-answer snapshot as a
separate CardKit request. A long Codex answer can therefore finish at the model
while the card keeps replaying stale intermediate snapshots for minutes. The
official configuration has no partial-update batching control.

The candidate reuses only the latest-snapshot coalescing behavior already
present in the main VLab Feishu bundle. It does not copy the main VLab Steer or
Worker changes. The version-gated, idempotent patcher is:

```text
scripts/apply-vcodex-feishu-stream-coalescing-patch.mjs
```

It changes four signatures in the 2026.7.1 Feishu monitor bundle:

1. Keep a single in-flight update and one replaceable latest snapshot.
2. Drop superseded dispatcher snapshots instead of extending the Promise queue.
3. Merge replayed delta suffixes idempotently.
4. Reset coalescing ownership when a reply lifecycle resets.

The service runs the patcher as `ExecStartPre`. A changed upstream bundle shape
fails closed instead of receiving an unreviewed transformation. The official
bundle is backed up before the first write.

## Production-safe chat scoping

Production V keeps the account-wide Feishu `renderMode=auto` behavior for
ordinary OpenClaw agents. The optional scoped patch reads only
`V_FEISHU_VCODEX_STREAM_CHAT_IDS`, accepts explicit `oc_` chat ids, and upgrades
matching conversations to `card`. Empty, wildcard, and malformed entries do
not change any conversation. The patch is version-shape gated, idempotent, and
backs up the exact monitor bundle before writing.

The scoped VLab promotion check ran with the account-wide mode still set to
`auto`. The acceptance chat created its card in about 4.5 seconds, produced 15
distinct updates on one message, showed the final marker, and completed with
`NRestarts=0`. Unlisted-chat fallback behavior is covered by the patch fixture.

## Required acceptance

1. Main VLab and all three prior experiments keep their original PIDs and ports.
2. Candidate service is active, has no restart loop, and Gateway RPC is healthy.
3. The model is `openai/gpt-5.6-sol` and the runtime is OpenAI Codex.
4. A real Feishu card is visible in the VLab DM.
5. Compare time-to-visible-card for `auto` and `card` under the same tool task.
6. A task longer than 300 seconds remains live and reaches one visible final.
7. Two independent sessions can run concurrently and each reaches one final.
8. A failing tool call is visible, the agent recovers, and the card closes.
9. No duplicate Feishu WebSocket, shared Session/Memory store, or writes outside
   `/srv/vlab-vcodex-streaming` occur.
10. Stopping the candidate leaves the existing VLab services healthy.

## Acceptance result — 2026-08-30

Decision: **PASS in isolated VLab; not deployed to production V.**

| Gate | Result | Evidence |
| --- | --- | --- |
| Runtime | PASS | `openai/gpt-5.6-sol` through the official Codex runtime returned the expected smoke marker. |
| Control (`renderMode=auto`, Codex default `message_tool`) | PASS as control | No early card; one static message became visible about 52.2 seconds after dispatch. |
| Official visible-reply override | PASS | `messages.visibleReplies=automatic` plus `renderMode=card` created a card about 4.7 seconds after dispatch; four snapshots and the final marker all used one message. |
| Natural body stream | PASS | The coalesced run produced 31 distinct content snapshots on one message; the final marker appeared in that same card. |
| Long task | PASS | A foreground 330-second Python task crossed the native 300-second per-chat eviction boundary and still returned its final marker in the original card. The Gateway did not restart. |
| Independent concurrency | PASS | A separate 90-second Codex Session overlapped the long Feishu Session, used a different session id, and returned its own marker after 104.3 seconds without context leakage. |
| Tool failure recovery | PASS | First Bash call failed intentionally, the second recovery call succeeded, and the same card closed with the expected marker. |
| Coalescing A/B | PASS | Before: model dispatch complete to card close took 306.8 seconds. After: 0.67 seconds on an equivalent approximately 1,800-character answer. |
| Health | PASS | Candidate `NRestarts=0`; sampled long-run `MemoryCurrent` peak was 496,623,616 bytes; final Event Loop P99 21.2 ms, max 44.7 ms, ELU 0.008, not degraded. |
| Feishu transport | PASS | Candidate opened only the loopback webhook; zero candidate WebSocket start/connect events. |
| Isolation and rollback | PASS | Main VLab PID `1000571`, VBrowser PID `1008092`, and Browser broker PID `981669` stayed unchanged across candidate stop/start/stop. Existing ports stayed live; candidate ports disappeared when stopped. |

The 300-second log line is an OpenClaw queue-lock eviction, not task
cancellation. In this test it appeared once at 300 seconds; the foreground
process continued, dispatch completed about 53 seconds later, and the original
card closed normally.

The official adapter still does not expose hidden reasoning or raw foreground
tool stdout as body partials. That is intentional: those details are noisy and
can contain commands or private paths. The repaired candidate consumes the
official Codex commentary and item lifecycle callbacks, converts native tool
events into safe human-readable stages, and keeps one final card.

At handoff the fourth candidate service is deliberately `inactive` and
`disabled`, so it consumes no steady-state memory and cannot contend with the
other VLab experiments. Its state, logs, backups, and worktree remain intact.

## Repaired VLab candidate — v0.1.2

The repaired `v0.1.2` candidate remains VLab-only. It adds a version-gated
`meaningful progress` bridge over OpenClaw's existing `onItemEvent`,
`onToolStart`, commentary, and final-answer callbacks. It does not change the
Codex runtime or execution lifecycle. Only explicit chat ids from
`V_FEISHU_VCODEX_STREAM_CHAT_IDS` or `VLAB_VCODEX_ACCEPTANCE_CHAT_ID` receive
the bridge; unlisted chats keep the original Feishu reply options.

Acceptance uses **meaningful visible text**, not card creation, as time zero:

| Gate | Result | Evidence |
| --- | --- | --- |
| Empty-card baseline | FAIL as control | A 90-second tool task created a card after about 5 seconds but showed no body text until the final answer around 173 seconds. |
| Meaningful first text | PASS | The final short run showed readable text about 13 seconds after capture start, followed by commentary and safe `command` / `patch` stages. |
| No raw internals | PASS | The final candidate did not expose commands, arguments, workspace paths, JSON, Session ids, or hidden reasoning in the card body. |
| In-place progress | PASS | Progress replaced the same body instead of appending old statuses; the final answer replaced progress and remained unchanged when the card closed. |
| 300-second boundary | PASS | At exactly 300 seconds OpenClaw logged only queue-lock eviction. The foreground process and card updates continued. |
| 11-minute execution | PASS | A 660-second foreground task reported 120/300/480/600-second milestones, completed normally, wrote and verified one result file, and returned the final marker in the original card. |
| Final delivery | PASS | Dispatch completed at `10:49:24`, the card closed at `10:49:25`, and the Feishu-visible final contains `VCODEX_LONG_11MIN_FINAL_OK_0830`. |
| Health | PASS | Candidate `NRestarts=0`, `MemoryPeak=853,499,904` bytes, service active, and no timeout/relay/card update failure was logged. |
| Scope isolation | PASS | The patch fixture proves the configured `oc_` chat is enabled and an unlisted chat is unchanged; all behavior changes are guarded by that scoped predicate. |

The repaired candidate is **not deployed to production V**. A future promotion
requires a separate user gate, a fresh production backup, and the same real
VCodex programming-session acceptance. The failed `v0.1.1` path must not be
reused.

## Commentary-only candidate — v0.1.3

User review rejected the `v0.1.2` presentation model: it proved liveness, but
mostly translated native tool lifecycle events into generic status text. The
desired experience is the Codex-authored commentary itself, with raw commands
and tools hidden, followed by the complete final answer replacing all interim
text.

`v0.1.3` keeps the same chat scope and official Codex runtime but changes the
projection contract:

1. Only `kind=preamble` events carrying Codex `progressText` are rendered during
   the commentary phase.
2. Command, patch, search, tool, reasoning, compaction, arguments, stdout, and
   paths never create or update the scoped card.
3. The scoped card is not created at dispatch start. The first Codex commentary
   or final-answer partial creates it, so an empty early card is not counted as
   useful streaming.
4. Commentary snapshots from the same item replace their earlier snapshot;
   separate commentary messages accumulate in one card.
5. The first final-answer partial moves the card to an irreversible `final`
   phase, clears commentary, and replaces the card body. Late commentary events
   are ignored.
6. Ordinary OpenClaw chats remain on the unmodified dispatcher behavior.
7. The scoped run forces `sourceReplyDeliveryMode=automatic`, so Codex final
   answers return through the same card without changing the account-wide
   `messages.visibleReplies` policy used by ordinary OpenClaw agents.

Local regression coverage proves: no empty start render, no command/tool render,
two accumulated Codex commentary snapshots, one final replacement, and no late
commentary overwrite. The patch also applies idempotently to the official
`@openclaw/feishu@2026.7.1` bundle after the existing coalescing patch and passes
`node --check`.

Real Feishu acceptance on the isolated fourth VLab also passed:

| Gate | Result | Evidence |
| --- | --- | --- |
| Meaningful first text | PASS | The short recovery run showed its first Codex-authored commentary after about 12 seconds. The 330-second run showed its first complete commentary after about 24 seconds. Card creation itself was not counted. |
| Commentary semantics | PASS | Separate Codex commentary items accumulated; cumulative snapshots for the same item replaced their earlier text instead of duplicating it. |
| Raw internals hidden | PASS | A deliberate failing Bash call and raw-command sentinels were absent from both observed snapshots and the final full-card payload. Tool-error warnings were suppressed only for the scoped VCodex reply run. |
| Final replacement | PASS | The short run closed with only `VCODEX_COMMENTARY_V013_R3_FINAL_OK`; the long run closed with only `VCODEX_COMMENTARY_V013_LONG_FINAL_OK`. Late commentary could not overwrite the final phase. |
| 300-second boundary | PASS | OpenClaw logged its native per-chat queue-lock eviction at 300 seconds, but did not cancel execution. Commentary remained visible and the original card received its final answer at about 364 seconds. |
| Runtime health | PASS | Candidate PID `1072219` remained unchanged with `NRestarts=0`; `MemoryPeak=850,468,864` bytes and Gateway health stayed live. |
| Other experiments | PASS with concurrent activity noted | VBrowser PID `1008092` and Workboard PID `875930` remained unchanged. The main VLab Gateway was independently restarted twice while this acceptance was running; the fourth candidate neither restarted nor shared its service lifecycle. |

The accepted patched official Feishu monitor bundle SHA-256 is
`d92ec2723cf601819ddbb65ca2b30d78b5111f35ad6e6caffa8772562400e2b9`.
The latest pre-deploy backup is:

```text
/srv/vlab-vcodex-streaming/backups/vcodex-commentary-v0.1.3/20260830-115806-r3
```

This candidate remains **VLab-only**. Production V is still on the restored
pre-`v0.1.1` Feishu bundle. A production promotion requires a separate user
gate, a fresh backup, chat-scoped deployment, and acceptance in the real VCodex
programming Session.

## Rollback

This experiment is additive. Rollback is:

```bash
systemctl disable --now openclaw-vlab-vcodex-streaming.service
```

No existing VLab or production configuration needs to be restored. Keep the
experiment root for evidence until the result is reviewed.

The exact pre-patch Feishu bundle is also preserved under:

```text
/srv/vlab-vcodex-streaming/backups/feishu-stream-coalescing/
```

The tested patched bundle SHA-256 is
`faa4aabaae4ec6f8f33535d2ad7736cb45e0b56aaaa77265e97ba1178618dffe`.
