---
name: makaron-feishu
description: Use for every Feishu/Lark request that creates, edits, continues, or delivers Makaron media. Single-card UX, detached-worker lifecycle, the owner's account, exact reply anchoring, and delivery rules independently from the CLI-managed makaron skill.
---

# Makaron Feishu Service Overlay

This is V's Feishu business layer. The Makaron CLI owns command syntax and model capabilities; this overlay owns the user-visible card and delivery lifecycle.

This overlay comes with the installation and is updated with it; do not edit it (AGENTS.md: system files). Problems go to the owner or a skill candidate.

## Required pairing

In the two-Skill composite layout, read the bundled official part before running any Makaron command:

```text
../official/SKILL.md
```

The legacy four-Skill layout may still read the registered `makaron` base from OpenClaw state during rollback, but new releases must not scan the filesystem to find it.

Use the base skill for supported CLI commands and flags. Use this overlay for Feishu behavior. A CLI upgrade may replace the base skill, but must never replace this directory.

## Non-negotiable Feishu route

For every Feishu/Lark media request, including natural-language retry, continuation, reroll, or revision:

- The inbound Session is only the control plane; read this Feishu part before any Makaron CLI action.
- Treat the current inbound request as fresh unless the user explicitly asks to retry, continue, reroll, revise, or replies to an existing media item. For fresh work, resolve only required inbound media and the canonical local reference, then open the card immediately. Do not inspect Runner source code, old handoff/state files, old cards, project history, or Memory first.
- Your own look: if the workspace has `assets/avatar.jpg` (the image the owner chose for you), use it when the owner asks for a picture of you; if not, ask the owner for a reference instead of inventing one. For `--chat`, use the trusted inbound `oc_...` chat id in groups and the trusted inbound `ou_...` user open id in direct chats.
- A fresh task enters through `visible-parent-flow.cjs`.
- Pass the trusted inbound `message_id` as `--request-id`. Treat the helper as a single-use write: after one successful invocation, its returned JSON is authoritative. Never invoke it again merely to inspect, grep, or confirm the result.
- After successful handoff, send one concise visible acknowledgement. For media-only tasks this may be the final reply; for composite tasks use commentary and keep ownership until the full requested deliverable is verified. Do not return `NO_REPLY`: the separately sent card is not the turn reply.
- A recoverable existing card continues through `restart-task-worker.cjs`; if no exact card can be recovered, create a new visible task card rather than running invisibly.
- End the inbound turn after detached handoff only when the requested deliverable is media-only. Follow the composite branch below when media is an input to another deliverable.
- Never run `makaron-cli chat`, `responses get --wait`, polling, sleep loops, or rendering supervision directly in the inbound Feishu Session.

## Default Feishu flow

For user-visible Makaron production:

1. Download any inbound Feishu media first when necessary.
2. Create the Makaron task card immediately.
3. Put inspection, account policy, brief preparation, job creation, and worker handoff on that same card.
4. Launch the detached worker. End the turn for media-only tasks; retain the current session for composite tasks.
5. Let the worker update the original card and deliver final media.

Use the maintained entrypoint:

```bash
node scripts/makaron-card-runner/visible-parent-flow.cjs \
  --chat oc_CHAT_ID \
  --prompt-file work/brief.md \
  --title '任务标题' \
  --brief '用户可见的任务说明' \
  --expected video \
  --slug task-slug
```

Do not run `responses watch`, polling loops, sleeps, rendering supervision, or long Makaron commands in the inbound Feishu session. Do not replace an active task card with ordinary progress bubbles.

## Composite tasks: media followed by another deliverable

1. Identify the final user deliverable before launching Workers. For images followed by a webpage, the webpage is the parent deliverable; delivered image cards do not complete the parent.
2. Assign a durable parent task ID and a unique child ID to each media job. Invoke the maintained helper with paired `--parent-task-id` and `--child-id`, preserving the original trusted `--request-id`. Record the returned `stateFile` paths in a parent JSON manifest with `parentTaskId`, `nextStage`, and `stateFiles`. Sibling cards must remain independently active.
3. Keep the current turn open and await local completion events using `node scripts/makaron-card-runner/collect-child-results.cjs <manifest.json> <results.json>`. This collector reads existing terminal results before watching, returns verified local files and hashes, and reports failure or timeout instead of pretending completion. Local event collection is permitted; Makaron generation still runs only in detached Workers.
4. Use the collected artifacts to build the next stage in this same session. Verify the final deliverable and deliver it before sending the final reply. For an HTML attachment, stage the generated file through OpenClaw's preferred temporary directory and send it with the message tool; verify a successful platform receipt.
5. If a child fails or times out, preserve successful artifacts and report the parent as blocked or partial. Resume exact child state instead of regenerating all children.
6. If the turn must end before the parent completes, first persist the next step and establish a verified completion wake. Without a verified wake, state the blocker; do not promise that the session will automatically pick up. Current collector support does not implement turn-exit wake.
7. Use the current session unless the user explicitly asks for delegation. Do not use a subagent to bypass a Feishu lifecycle problem.

## Continuation and reply routing

- Written revision to an existing card: use `restart-task-worker.cjs` and preserve the same card and project.
- Explicit reply to a delivered Makaron media item: resolve the exact reply anchor with `resolve-feishu-reply-media.cjs` before continuing.
- Fresh requests and ordinary chat do not use the reply resolver.

Read [card-lifecycle.md](references/card-lifecycle.md) before starting or restarting a visible task. Read [account-delivery-and-replies.md](references/account-delivery-and-replies.md) when account routing, credits, large files, or media replies are involved.

The complete pre-layering Makaron Skill is preserved byte-for-byte at [original-makaron-skill-v1.18.4-20260722.md](references/original-makaron-skill-v1.18.4-20260722.md). Consult it when an older Feishu edge case is not covered by the concise references. Current CLI syntax still comes from the base skill; historical Feishu service behavior must not be silently discarded.

## Safety and acceptance

- Never print or persist raw API keys, tokens, or secrets.
- This machine has one owner; every job uses the owner's Makaron key (`scripts/makaron-card-runner/account-routing.cjs`). When there is no key, say so on the card and ask the owner for one.
- Never print, log or repeat a Makaron key in chat or on the card.
- Never claim completion until the card state and delivered artifact agree.
- If card creation is unavailable, say so explicitly; do not pretend text is the card experience.
- A real acceptance run must prove card creation, detached launch, in-place progress, final artifact delivery, and same-card continuation.
