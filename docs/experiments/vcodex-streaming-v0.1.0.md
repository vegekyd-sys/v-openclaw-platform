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

The official adapter still does not expose all Codex commentary, hidden
reasoning, or every byte of foreground tool stdout as body partials. The proven
user experience is: an early working card, continuous final-answer body growth,
one final card, and reliable long-task completion.

At handoff the fourth candidate service is deliberately `inactive` and
`disabled`, so it consumes no steady-state memory and cannot contend with the
other VLab experiments. Its state, logs, backups, and worktree remain intact.

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
