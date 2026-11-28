# Makaron Feishu card lifecycle

## New visible task

The inbound Feishu session is the control plane, not the render worker.

Allowed pre-card work is limited to resolving the authoritative chat/reply context and downloading inbound Feishu media required to start. Then call:

Treat the request as fresh unless the user explicitly says to retry, continue, reroll, or revise, or is replying to an existing media item. Do not read Runner source, scan old state/cards/projects, or search Memory before opening a fresh card.

```bash
node scripts/makaron-card-runner/visible-parent-flow.cjs \
  --chat TRUSTED_DESTINATION \
  --prompt-file work/brief.md \
  --title '任务标题' \
  --brief '用户可见的任务说明' \
  --image assets/reference.png \
  --expected video,image \
  --slug task-slug \
  --request-id om_TRUSTED_INBOUND_MESSAGE_ID \
  --worker v15-supervisor
```

`TRUSTED_DESTINATION` is the inbound `oc_...` chat id for a group and the inbound `ou_...` user open id for a direct chat. When the owner asks for a picture of you, use `assets/avatar.jpg` if the owner put one there; otherwise ask for a reference.

Supported inputs include repeated `--image`, `--video`, and `--audio`, plus a validated `--media-manifest`. Under CLI 0.13.7, `--agent-model` is supported and preserved through the card/Worker chain. Put image/video model, resolution, duration, and creative requirements in the prompt because those old chat flags are retired.

For media-only tasks, end the inbound turn after handoff. For composite tasks, retain the current session and follow the parent manifest / local event collector branch in the Feishu Skill; child launch is not parent completion.

## Same-card revision or reroll

When the user changes direction on an existing task, update that task rather than creating a competing card:

```bash
node scripts/makaron-card-runner/restart-task-worker.cjs \
  --chat oc_CHAT_ID \
  --card om_CARD_MESSAGE_ID \
  --prompt-file work/revision-brief.md \
  --state-file tmp/makaron-visible-parent/TASK.state.json \
  --expected video \
  --slug task-revision \
  --worker v15-supervisor
```

The helper owns safe worker stop, stale lock cleanup, sidecar cleanup, job creation, and detached relaunch. Do not hand-write kill/delete/relaunch sequences. The inbound session exits after handoff only for media-only tasks. A composite parent retains ownership through its downstream deliverable.

## Card invariants

- One media child has one current card. A composite parent may contain independently active sibling cards identified by the same parentTaskId and distinct childId.
- Attach the project URL to that card as soon as the project exists.
- Show the latest status, not an ever-growing concatenated transcript.
- Intermediate media may be attached, but explanatory progress stays on the card.
- Confirmation gates are normally V-to-Makaron quality checkpoints. Ask the human only for low-confidence, risky, strategic, or explicitly requested approval.
- `watch ended` without a final video is not automatically failure; inspect whether Makaron is waiting for continuation.
- Old or superseded cards must not remain deceptively active.

## Failure behavior

Distinguish generation failure, account/credit failure, card update failure, and delivery failure. Preserve the project/run/card identifiers needed for recovery, update the same card with the factual state, and avoid duplicate delivery on retry.
