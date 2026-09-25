# Media completion relay for Worker-run turns (2026.9.1)

## Symptom

`image_generate` finishes, but the user sees nothing until they send another
message. The Gateway journal shows, from a Worker process:

```
[vlab-worker:0] [tools/image-generate] Image generation completion wake failed after successful generation
```

about 120 s after the image was ready.

## Root cause

The turn runs in a Worker process. The detached media task completes inside
that Worker and calls the native `deliverSubagentAnnouncement`. For generated
media this writes a durable `session` queue row and asks
`scheduleSessionDelivery` to drain it. Only the Gateway installs the session
delivery runtime (`startSessionDeliveryRuntime`), so in the Worker the schedule
call is a no-op. The row stays `pending` with `retry_count=0` and
`last_attempt_at=NULL`, and the Gateway only scans pending rows at startup.
The media task re-reads the same `session_queued` result for its 120 s handoff
window and gives up.

Evidence on V (2026-09-25): all three JC rows had `retry_count=0` and no
attempt for hours; the failure log carries the `[vlab-worker:0]` prefix.

`sessions_yield` and `isCompletionOwnedByRequesterYield` are not involved: the
media call never passes that predicate.

## Change

The Worker plugin already has a Worker-to-Gateway event bridge for this
(`media_generation_completion`). It was never wired into the 9.1 bundle.

| Target | Before (V = VLab) | After |
|---|---|---|
| `openclaw/dist/openclaw-tools-BODVdJQD.js` | `b20468a2…` | `336aab63…` |
| `production-worker/worker-gateway-events.mjs` | `fbda3387…` | `acbb8ed1…` |

1. Core: `scripts/patch-openclaw-media-completion-relay.mjs` now accepts the
   9.1 layout (schedule before wake). In a Worker, the native delivery call goes
   to the Gateway through the bridge; the payload, retry loop and
   delivered/pending/permanent_failure mapping are unchanged. The detached task
   also reports start/settle so the pool does not retire the Worker while the
   image renders. Without a bridge (Gateway-run turns) nothing changes.
2. Worker router: V's 0.2.11 router cached the first `session_queued` result
   forever and dropped `disposition`, so the Worker could never see the queued
   delivery complete. This is the fixed router from
   `experiments/agent-worker-isolation-v1` (commit `c05948c`): it forwards
   `disposition`/`error`, retries pending handoffs, and keeps `requesterAgentId`.

Both files are needed; `tests/media-completion-worker-relay-91.test.mjs` shows
the core patch alone still ends in "delivery was not confirmed".

Rebuild with `node lab/build-media-completion-worker-relay.mjs`; it refuses to
build unless VLab still serves the V bytes above.

## Acceptance

Candidate: `lab/candidate/media-completion-worker-relay.plan.json` (fixed) and
`lab/candidate/media-completion-worker-relay-baseline.plan.json` (unpatched,
must reproduce the failure). Real Worker turn, real `image_generate`, no
follow-up message.

Result 2026-09-25 (VLab host, real DeepSeek turn in a Worker, real
`makaron-image/gpt-image-2` render; the probe installs a private makaron-cli
because VLab hosts have none, and sets it in the Worker's own config copy):

| Run | Receipt | Outcome |
|---|---|---|
| unpatched | `candidate-abf474f9…` | image rendered; `completion wake failed after successful generation`; queue row `pending`, `retry_count=0`, never attempted |
| patched | `candidate-210c3e34…` | image posted to the session 15.4 s after the turn ended, no follow-up message; no wake failure; no pending row |

An earlier pair without the CLI exercised the failure notice path the same way
(unpatched: `failure wake failed`, row stuck; patched: failure reply delivered).

Not covered by the candidate: a Feishu channel (disabled so the candidate
cannot take VLab's connection) and the production Worker count.

Shared VLab / V (Feishu): send one image request in a DM, send nothing else.
The image arrives without a follow-up, and afterwards

```
journalctl -u openclaw-gateway --since "<test start>" | grep -c "completion wake failed after successful generation"
```

is 0, and no `image_generate:%` row in `delivery_queue_entries` stays `pending`.

## Deployment notes

Both files are loaded at process start by the Gateway and by Workers, so the
change takes effect only after a Gateway restart. Rollback restores the two
`before` hashes. Once accepted on V, the temporary workspace rule that routes
all Feishu image requests to Makaron can be removed.
